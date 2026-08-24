#!/usr/bin/env python3
"""
admin_server.py

Local Web Server & Admin Panel Backend for SSC 2026 Chattogram Leaderboard.
Provides REST APIs for:
- Listing archive and runtime schools
- Searching & filtering schools
- Inspecting school and student records
- Executing run.py with selected EIINs and Git flags
- Triggering sync.py and Git status
- Serving the Admin Web UI
"""

import json
import os
import re
import subprocess
import sys
import threading
import time
import urllib.parse
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
ARCHIVE_DIR = BASE_DIR / "archive"
RUN_SCRIPT = BASE_DIR / "run.py"
SYNC_SCRIPT = BASE_DIR / "sync.py"
ADMIN_HTML = BASE_DIR / "admin.html"

# Import helper functions from run.py if available
try:
    import run as run_module
except ImportError:
    run_module = None


def get_all_data():
    """Scan archive and data folders, return formatted lists and summaries."""
    if run_module:
        existing_eiins, existing_rolls = run_module.scan_existing_data()
        archive_schools = run_module.scan_archive()
    else:
        existing_eiins, existing_rolls = {}, set()
        archive_schools = {}

    school_list = []
    districts_set = set()
    upazillas_set = set()

    for eiin, data in archive_schools.items():
        is_added = eiin in existing_eiins
        status = "added" if is_added else "available"
        district = data.get("district", "CHATTOGRAM")
        upazilla = data.get("upazilla", "UNKNOWN")
        name = data.get("name", f"School {eiin}")
        records_count = len(data.get("records", []))
        inst_info = data.get("institution_info", {})

        districts_set.add(district)
        upazillas_set.add(upazilla)

        school_list.append({
            "eiin": eiin,
            "name": name,
            "district": district,
            "upazilla": upazilla,
            "records_count": records_count,
            "gpa5_count": inst_info.get("gpa5", 0),
            "passed_count": inst_info.get("passed", 0),
            "pass_percentage": inst_info.get("pass_percentage", "0%"),
            "status": status,
            "archive_file": data.get("archive_file", ""),
            "runtime_file": existing_eiins.get(eiin, {}).get("file", ""),
        })

    # Sort schools by District, Upazilla, Name
    school_list.sort(key=lambda s: (s["district"], s["upazilla"], s["name"]))

    # Summary statistics
    total_archive = len(archive_schools)
    total_added = sum(1 for s in school_list if s["status"] == "added")
    total_available = total_archive - total_added

    # Count total runtime students from metadata if exists
    total_runtime_students = 0
    total_runtime_gpa5 = 0
    metadata_file = DATA_DIR / "metadata.json"
    if metadata_file.exists():
        try:
            meta = json.loads(metadata_file.read_text(encoding="utf-8"))
            total_runtime_students = meta.get("total_students", 0)
            total_runtime_gpa5 = meta.get("total_gpa_5", 0)
        except Exception:
            pass

    return {
        "schools": school_list,
        "districts": sorted(list(districts_set)),
        "upazillas": sorted(list(upazillas_set)),
        "stats": {
            "total_archive_schools": total_archive,
            "total_added": total_added,
            "total_available": total_available,
            "total_runtime_students": total_runtime_students,
            "total_runtime_gpa5": total_runtime_gpa5,
        }
    }


def execute_run_command(eiins: list[str], git_mode: str = "push", commit_message: str = None):
    """
    Execute run.py as a subprocess with appropriate flags and capture logs.
    git_mode options: 'push', 'no_push', 'no_git'
    """
    cmd = [sys.executable, str(RUN_SCRIPT)]
    if not eiins:
        return {"success": False, "logs": "No EIINs provided to import.", "exit_code": 1}

    if "all" in eiins:
        cmd.append("--all")
    else:
        cmd.extend(eiins)

    if git_mode == "no_push":
        cmd.append("--no-push")
    elif git_mode == "no_git":
        cmd.append("--no-git")

    if commit_message and commit_message.strip():
        cmd.extend(["-m", commit_message.strip()])

    try:
        proc = subprocess.Popen(
            cmd,
            cwd=str(BASE_DIR),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            universal_newlines=True
        )
        stdout, _ = proc.communicate(timeout=180)
        return {
            "success": proc.returncode == 0,
            "logs": stdout,
            "exit_code": proc.returncode,
            "command": " ".join(cmd)
        }
    except Exception as e:
        return {
            "success": False,
            "logs": f"Execution error: {str(e)}",
            "exit_code": -1,
            "command": " ".join(cmd)
        }


def execute_sync_command():
    """Execute sync.py directly and capture output."""
    try:
        proc = subprocess.run(
            [sys.executable, str(SYNC_SCRIPT)],
            cwd=str(BASE_DIR),
            capture_output=True,
            text=True,
            timeout=120
        )
        return {
            "success": proc.returncode == 0,
            "logs": proc.stdout + ("\n" + proc.stderr if proc.stderr else ""),
            "exit_code": proc.returncode,
        }
    except Exception as e:
        return {"success": False, "logs": str(e), "exit_code": -1}


def get_git_status():
    """Get current git status and last commit info."""
    try:
        status_proc = subprocess.run(
            ["git", "status", "-s"],
            cwd=str(BASE_DIR),
            capture_output=True,
            text=True
        )
        last_log = subprocess.run(
            ["git", "log", "-1", "--oneline"],
            cwd=str(BASE_DIR),
            capture_output=True,
            text=True
        )
        return {
            "status": status_proc.stdout.strip(),
            "clean": len(status_proc.stdout.strip()) == 0,
            "last_commit": last_log.stdout.strip(),
        }
    except Exception as e:
        return {"status": str(e), "clean": False, "last_commit": "Unknown"}


class AdminRequestHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        # Override to keep server output clean
        sys.stderr.write(f"[{self.log_date_time_string()}] {format % args}\n")

    def send_json(self, data, status=200):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        parsed_path = urllib.parse.urlparse(self.path)
        path = parsed_path.path
        query = urllib.parse.parse_qs(parsed_path.query)

        if path in ("/", "/index.html", "/admin", "/admin.html"):
            if not ADMIN_HTML.exists():
                self.send_error(404, "admin.html not found")
                return
            content = ADMIN_HTML.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(content)))
            self.end_headers()
            self.wfile.write(content)
            return

        if path == "/api/status" or path == "/api/schools":
            data = get_all_data()
            self.send_json(data)
            return

        if path == "/api/git-status":
            self.send_json(get_git_status())
            return

        if path == "/api/school-details":
            eiin = query.get("eiin", [""])[0].strip()
            if not eiin:
                self.send_json({"error": "Missing eiin parameter"}, status=400)
                return

            if run_module:
                archive_schools = run_module.scan_archive()
                school = archive_schools.get(eiin)
                if school:
                    self.send_json({
                        "eiin": eiin,
                        "name": school["name"],
                        "district": school["district"],
                        "upazilla": school["upazilla"],
                        "institution_info": school["institution_info"],
                        "records_count": len(school["records"]),
                        "records": school["records"][:100],  # send first 100 for fast modal view
                    })
                    return
            self.send_json({"error": "School not found in archive"}, status=404)
            return

        # Fallback to serve static files from project directory if needed
        file_path = BASE_DIR / path.lstrip("/")
        if file_path.exists() and file_path.is_file() and not str(file_path).startswith(str(BASE_DIR / ".git")):
            mime_type = "text/plain"
            if file_path.suffix == ".html":
                mime_type = "text/html"
            elif file_path.suffix == ".js":
                mime_type = "application/javascript"
            elif file_path.suffix == ".css":
                mime_type = "text/css"
            elif file_path.suffix == ".json":
                mime_type = "application/json"

            content = file_path.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", mime_type)
            self.send_header("Content-Length", str(len(content)))
            self.end_headers()
            self.wfile.write(content)
            return

        self.send_error(404, "Not Found")

    def do_POST(self):
        parsed_path = urllib.parse.urlparse(self.path)
        path = parsed_path.path

        content_length = int(self.headers.get("Content-Length", 0))
        req_body = self.rfile.read(content_length) if content_length > 0 else b"{}"

        try:
            payload = json.loads(req_body.decode("utf-8")) if req_body else {}
        except Exception:
            payload = {}

        if path == "/api/import":
            eiins = payload.get("eiins", [])
            git_mode = payload.get("git_mode", "push")
            commit_message = payload.get("commit_message", "")

            # If raw text was sent instead of list of eiins, extract them
            if isinstance(eiins, str):
                if run_module:
                    eiins = run_module.extract_eiins_from_text(eiins)
                else:
                    eiins = re.findall(r"\b\d{4,8}\b", eiins)

            result = execute_run_command(eiins, git_mode=git_mode, commit_message=commit_message)
            self.send_json(result)
            return

        if path == "/api/sync":
            result = execute_sync_command()
            self.send_json(result)
            return

        if path == "/api/parse-eiins":
            text = payload.get("text", "")
            if run_module:
                extracted = run_module.extract_eiins_from_text(text)
                archive_schools = run_module.scan_archive()
                existing_eiins, _ = run_module.scan_existing_data()
            else:
                extracted = re.findall(r"\b\d{4,8}\b", text)
                archive_schools, existing_eiins = {}, {}

            parsed = []
            for eiin in extracted:
                if eiin in archive_schools:
                    school = archive_schools[eiin]
                    parsed.append({
                        "eiin": eiin,
                        "name": school["name"],
                        "district": school["district"],
                        "upazilla": school["upazilla"],
                        "status": "added" if eiin in existing_eiins else "available",
                        "records_count": len(school["records"]),
                        "found_in_archive": True
                    })
                else:
                    parsed.append({
                        "eiin": eiin,
                        "name": "Not found in archive",
                        "district": "-",
                        "upazilla": "-",
                        "status": "missing",
                        "records_count": 0,
                        "found_in_archive": False
                    })

            self.send_json({
                "eiins": extracted,
                "details": parsed,
                "valid_count": len([p for p in parsed if p["found_in_archive"] and p["status"] == "available"]),
                "already_added_count": len([p for p in parsed if p["found_in_archive"] and p["status"] == "added"]),
                "missing_count": len([p for p in parsed if not p["found_in_archive"]]),
            })
            return

        self.send_error(404, "Not Found")


def start_server(port=5000, open_browser=True):
    """Start local admin HTTP server."""
    server_address = ("", port)
    try:
        httpd = HTTPServer(server_address, AdminRequestHandler)
    except OSError:
        # Try port fallback
        port = 8080
        server_address = ("", port)
        httpd = HTTPServer(server_address, AdminRequestHandler)

    url = f"http://localhost:{port}"
    print(f"\n=======================================================")
    print(f"  SSC 2026 Admin Dashboard Server")
    print(f"  Running locally at: {url}")
    print(f"  Press Ctrl+C to stop the server.")
    print(f"=======================================================\n")

    if open_browser:
        def _open():
            time.sleep(0.6)
            try:
                import webbrowser
                webbrowser.open(url)
            except Exception:
                pass
        threading.Thread(target=_open, daemon=True).start()

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nAdmin Server stopped.")
        httpd.server_close()


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Start the local Admin Panel Server for SSC 2026 Leaderboard")
    parser.add_argument("--port", "-p", type=int, default=5000, help="Port to run server on (default: 5000)")
    parser.add_argument("--no-open", action="store_true", help="Do not automatically open browser")
    args = parser.parse_args()

    start_server(port=args.port, open_browser=not args.no_open)
