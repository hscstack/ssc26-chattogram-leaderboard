#!/usr/bin/env python3
"""
run.py

Interactive & batch CLI tool to selectively add schools (by EIIN) from `archive/` into `data/`,
prevent duplication, update runtime metadata/leaderboard via `sync.py`,
and commit/push changes to git.
"""

import argparse
import datetime
import json
import os
import re
import subprocess
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
ARCHIVE_DIR = BASE_DIR / "archive"
SYNC_SCRIPT = BASE_DIR / "sync.py"

EXCLUDED_FILENAMES = {
    "manifest.json",
    "metadata.json",
    "leaderboard_ranked.json",
    "scraped_results_all.json",
}


def sanitize_folder_name(name: str) -> str:
    """Normalize district names for folder paths (e.g., COX_S_BAZAR)."""
    if not name:
        return "UNKNOWN"
    s = str(name).strip().upper()
    s = re.sub(r"[^\w\s]", "_", s)
    s = re.sub(r"\s+", "_", s)
    s = re.sub(r"_+", "_", s).strip("_")
    return s


def sanitize_slug(name: str) -> str:
    """Normalize upazilla names for file names (e.g., ali_kadam)."""
    if not name:
        return "unknown"
    s = str(name).strip().lower()
    s = re.sub(r"[^\w\s]", "_", s)
    s = re.sub(r"\s+", "_", s)
    s = re.sub(r"_+", "_", s).strip("_")
    return s


def extract_eiins_from_text(raw_text: str) -> list[str]:
    """
    Extract all EIIN numbers from raw text (supports spaces, commas, newlines, tabs,
    or arbitrary pasted blocks containing EIIN numbers).
    Preserves order while removing duplicates.
    """
    if not raw_text:
        return []
    
    # Extract all consecutive numeric strings (typically 5-7 digits for EIINs)
    # Also handles alphanumeric if any non-standard IDs are used
    tokens = re.findall(r"\b\d{4,8}\b", raw_text)
    if not tokens:
        # Fallback to general whitespace/delimiter split
        tokens = re.split(r"[\s,;|\t\n\r]+", raw_text.strip())
    
    seen = set()
    result = []
    for t in tokens:
        cleaned = t.strip()
        if cleaned and cleaned not in seen:
            seen.add(cleaned)
            result.append(cleaned)
    return result


def compute_summary(institutions: list, records: list) -> dict:
    """Calculate summary statistics for an upazilla file."""
    total_institutions = len(institutions)
    total_records = len(records)
    total_passed = 0
    total_failed = 0
    total_gpa_5 = 0

    for r in records:
        grade = str(r.get("grade") or "").strip().upper()
        status = str(r.get("status") or "").strip().upper()
        gpa = r.get("gpa")

        if grade == "FAIL" or status == "FAILED":
            total_failed += 1
        else:
            try:
                gpa_val = float(gpa if gpa is not None else grade)
                if gpa_val >= 5.0:
                    total_gpa_5 += 1
                if gpa_val > 0 or status == "PASSED":
                    total_passed += 1
                else:
                    total_failed += 1
            except (ValueError, TypeError):
                total_failed += 1

    return {
        "total_institutions": total_institutions,
        "total_records": total_records,
        "total_passed": total_passed,
        "total_failed": total_failed,
        "total_gpa_5": total_gpa_5,
        "last_updated": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }


def scan_existing_data() -> tuple[dict, set]:
    """
    Scan existing files in `data/` and return:
    - existing_eiins: dict of eiin -> { 'name': school_name, 'file': rel_path, 'district': ..., 'upazilla': ... }
    - existing_rolls: set of (roll, eiin)
    """
    existing_eiins = {}
    existing_rolls = set()

    if not DATA_DIR.exists():
        return existing_eiins, existing_rolls

    for json_file in DATA_DIR.rglob("*.json"):
        if json_file.name in EXCLUDED_FILENAMES or json_file.name.startswith("."):
            continue
        rel_path = str(json_file.relative_to(BASE_DIR))
        try:
            content = json.loads(json_file.read_text(encoding="utf-8"))
        except Exception as e:
            print(f"[!] Warning: Failed to parse existing data file {rel_path}: {e}")
            continue

        records = []
        institutions = []
        if isinstance(content, dict):
            institutions = content.get("institutions", [])
            records = content.get("records", [])
        elif isinstance(content, list):
            records = content

        for inst in institutions:
            eiin = str(inst.get("eiin") or "").strip()
            if eiin:
                existing_eiins[eiin] = {
                    "name": inst.get("name") or "UNKNOWN",
                    "file": rel_path,
                    "district": content.get("district", ""),
                    "upazilla": content.get("upazilla", ""),
                    "records_count": inst.get("students_count", len([r for r in records if str(r.get("institution_eiin") or r.get("eiin")).strip() == eiin])),
                }

        for r in records:
            eiin = str(r.get("institution_eiin") or r.get("eiin") or "").strip()
            roll = str(r.get("roll") or "").strip()
            if roll:
                existing_rolls.add((roll, eiin) if eiin else roll)
            if eiin and eiin not in existing_eiins:
                existing_eiins[eiin] = {
                    "name": r.get("institution_name") or r.get("school") or "UNKNOWN",
                    "file": rel_path,
                    "district": r.get("zilla") or content.get("district", ""),
                    "upazilla": r.get("upazilla") or content.get("upazilla", ""),
                    "records_count": 1,
                }

    return existing_eiins, existing_rolls


def scan_archive() -> dict:
    """
    Scan all json files in `archive/` recursively and return:
    dict of eiin -> {
        'eiin': eiin,
        'name': school_name,
        'institution_info': dict,
        'board': str,
        'district': str,
        'district_folder': str,
        'upazilla': str,
        'upazilla_slug': str,
        'archive_file': str,
        'records': list[dict]
    }
    """
    archive_schools = {}
    if not ARCHIVE_DIR.exists():
        return archive_schools

    for json_file in sorted(ARCHIVE_DIR.rglob("*.json")):
        if json_file.name.startswith("."):
            continue
        rel_path = str(json_file.relative_to(BASE_DIR))
        try:
            content = json.loads(json_file.read_text(encoding="utf-8"))
        except Exception as e:
            print(f"[!] Warning: Failed to parse archive file {rel_path}: {e}")
            continue

        board = "CHATTOGRAM"
        district = ""
        upazilla = ""
        upazilla_slug = ""
        institutions = []
        records = []

        if isinstance(content, dict):
            board = content.get("board") or "CHATTOGRAM"
            district = content.get("district") or content.get("zilla") or ""
            upazilla = content.get("upazilla") or content.get("thana") or ""
            upazilla_slug = content.get("upazilla_slug") or sanitize_slug(upazilla)
            institutions = content.get("institutions") or []
            records = content.get("records") or []
        elif isinstance(content, list):
            records = content

        # Map institutions in this file by eiin
        inst_by_eiin = {}
        for inst in institutions:
            eiin = str(inst.get("eiin") or "").strip()
            if eiin:
                inst_by_eiin[eiin] = inst

        # Group records by eiin
        records_by_eiin = {}
        for r in records:
            eiin = str(r.get("institution_eiin") or r.get("eiin") or "").strip()
            if not eiin:
                # Try fallback matching by institution_name
                school_name = str(r.get("institution_name") or r.get("school") or "").strip().upper()
                for inst_eiin, inst in inst_by_eiin.items():
                    if inst.get("name", "").strip().upper() == school_name:
                        eiin = inst_eiin
                        break
            if eiin:
                records_by_eiin.setdefault(eiin, []).append(r)

        # Build entries for each EIIN found
        all_eiins = set(inst_by_eiin.keys()) | set(records_by_eiin.keys())
        for eiin in all_eiins:
            inst_info = inst_by_eiin.get(eiin, {})
            inst_records = records_by_eiin.get(eiin, [])

            school_district = district or inst_info.get("zilla") or (inst_records[0].get("zilla") if inst_records else "") or "CHATTOGRAM"
            school_upazilla = upazilla or inst_info.get("thana") or (inst_records[0].get("upazilla") if inst_records else "") or "SADAR"
            school_slug = upazilla_slug or sanitize_slug(school_upazilla)
            district_folder = sanitize_folder_name(school_district)

            if not inst_info:
                # Auto-create institution structure if missing
                school_name = inst_records[0].get("institution_name") or inst_records[0].get("school") if inst_records else f"EIIN {eiin}"
                passed_count = len([r for r in inst_records if str(r.get("grade") or "").strip().upper() != "FAIL" and str(r.get("status") or "").strip().upper() != "FAILED"])
                gpa5_count = 0
                for r in inst_records:
                    try:
                        g = float(r.get("gpa") if r.get("gpa") is not None else r.get("grade", 0))
                        if g >= 5.0:
                            gpa5_count += 1
                    except (ValueError, TypeError):
                        pass

                inst_info = {
                    "eiin": eiin,
                    "name": school_name,
                    "zilla": school_district,
                    "thana": school_upazilla,
                    "appeared": len(inst_records),
                    "passed": passed_count,
                    "gpa5": gpa5_count,
                    "pass_percentage": f"{(passed_count / len(inst_records) * 100):.2f}%" if inst_records else "0.00%",
                    "students_count": len(inst_records),
                }

            archive_schools[eiin] = {
                "eiin": eiin,
                "name": inst_info.get("name") or f"EIIN {eiin}",
                "institution_info": inst_info,
                "board": board,
                "district": school_district,
                "district_folder": district_folder,
                "upazilla": school_upazilla,
                "upazilla_slug": school_slug,
                "archive_file": rel_path,
                "records": inst_records,
            }

    return archive_schools


def list_archive_schools(archive_schools: dict, existing_eiins: dict) -> None:
    """Print a clean table of all schools in the archive and their current status."""
    print("\n" + "=" * 90)
    print(f"{'EIIN':<10} {'STATUS':<14} {'STUDENTS':<10} {'DISTRICT':<15} {'UPAZILLA':<15} {'SCHOOL NAME'}")
    print("-" * 90)
    if not archive_schools:
        print("  No schools found in archive/.")
        print("=" * 90 + "\n")
        return

    available_count = 0
    added_count = 0

    for eiin, data in sorted(archive_schools.items(), key=lambda item: (item[1]["district"], item[1]["upazilla"], item[1]["name"])):
        if eiin in existing_eiins:
            status = "✓ ADDED"
            added_count += 1
        else:
            status = "● AVAILABLE"
            available_count += 1

        count = len(data["records"])
        district = data["district"][:14]
        upazilla = data["upazilla"][:14]
        name = data["name"]
        print(f"{eiin:<10} {status:<14} {count:<10} {district:<15} {upazilla:<15} {name}")

    print("-" * 90)
    print(f"Total Archive Schools: {len(archive_schools)} | Available: {available_count} | Already in Runtime: {added_count}")
    print("=" * 90 + "\n")


def add_schools_to_data(selected_eiins: list[str], archive_schools: dict, existing_eiins: dict, existing_rolls: set) -> list[dict]:
    """Add selected schools from archive into data/ with duplicate prevention."""
    added_schools = []
    files_to_update = {}

    for eiin in selected_eiins:
        if eiin not in archive_schools:
            print(f"[!] EIIN '{eiin}' not found in archive. Skipping.")
            continue

        school_data = archive_schools[eiin]
        school_name = school_data["name"]

        if eiin in existing_eiins:
            print(f"[*] EIIN {eiin} ('{school_name}') is already in runtime ({existing_eiins[eiin]['file']}). Skipping.")
            continue

        district_folder = school_data["district_folder"]
        slug = school_data["upazilla_slug"]
        target_dir = DATA_DIR / district_folder
        target_file = target_dir / f"results_upazilla_{slug}.json"

        target_key = str(target_file)
        if target_key not in files_to_update:
            existing_content = None
            if target_file.exists():
                try:
                    existing_content = json.loads(target_file.read_text(encoding="utf-8"))
                except Exception as e:
                    print(f"[!] Error reading existing file {target_file}: {e}")

            if existing_content and isinstance(existing_content, dict):
                files_to_update[target_key] = {
                    "file_path": target_file,
                    "board": existing_content.get("board", school_data["board"]),
                    "district": existing_content.get("district", school_data["district"]),
                    "upazilla": existing_content.get("upazilla", school_data["upazilla"]),
                    "upazilla_slug": existing_content.get("upazilla_slug", slug),
                    "institutions": list(existing_content.get("institutions", [])),
                    "records": list(existing_content.get("records", [])),
                }
            else:
                files_to_update[target_key] = {
                    "file_path": target_file,
                    "board": school_data["board"],
                    "district": school_data["district"],
                    "upazilla": school_data["upazilla"],
                    "upazilla_slug": slug,
                    "institutions": [],
                    "records": [],
                }

        file_payload = files_to_update[target_key]

        # Add institution avoiding duplicate eiin in file
        inst_info = school_data["institution_info"]
        if not any(str(i.get("eiin")).strip() == eiin for i in file_payload["institutions"]):
            file_payload["institutions"].append(inst_info)

        # Add records avoiding duplicate rolls
        added_records_count = 0
        for r in school_data["records"]:
            roll = str(r.get("roll") or "").strip()
            key = (roll, eiin) if roll else None
            if key and key in existing_rolls:
                continue
            if roll and not any(str(rec.get("roll") or "").strip() == roll and str(rec.get("institution_eiin") or rec.get("eiin") or "").strip() == eiin for rec in file_payload["records"]):
                file_payload["records"].append(r)
                if key:
                    existing_rolls.add(key)
                added_records_count += 1

        added_schools.append({
            "eiin": eiin,
            "name": school_name,
            "district": school_data["district"],
            "upazilla": school_data["upazilla"],
            "records_count": added_records_count,
            "target_file": str(target_file.relative_to(BASE_DIR)),
        })

    # Write files to disk
    for target_key, payload in files_to_update.items():
        target_file = payload["file_path"]
        target_file.parent.mkdir(parents=True, exist_ok=True)

        summary = compute_summary(payload["institutions"], payload["records"])

        data_to_write = {
            "board": payload["board"],
            "district": payload["district"],
            "upazilla": payload["upazilla"],
            "upazilla_slug": payload["upazilla_slug"],
            "summary": summary,
            "institutions": payload["institutions"],
            "records": payload["records"],
        }

        target_file.write_text(json.dumps(data_to_write, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"[+] Updated {target_file.relative_to(BASE_DIR)}: {len(payload['institutions'])} school(s), {len(payload['records'])} student record(s)")

    return added_schools


def run_sync() -> bool:
    """Run sync.py to rebuild manifest, metadata, and leaderboard_ranked."""
    print("\n[*] Running sync.py to regenerate runtime manifest, metadata, and leaderboard...")
    result = subprocess.run([sys.executable, str(SYNC_SCRIPT)], cwd=str(BASE_DIR))
    if result.returncode != 0:
        print("[!] Error: sync.py failed!")
        return False
    print("[+] sync.py completed successfully.")
    return True


def run_git(added_schools: list[dict], custom_commit_msg: str = None) -> bool:
    """Run git add ., git commit add new schools, and git push."""
    print("\n[*] Staging all changes with `git add .`...")
    subprocess.run(["git", "add", "."], cwd=str(BASE_DIR), check=True)

    # Check git status for changes
    status_proc = subprocess.run(["git", "status", "--porcelain"], cwd=str(BASE_DIR), capture_output=True, text=True)
    if not status_proc.stdout.strip():
        print("[*] No git changes detected. Working tree is clean.")
        return True

    if custom_commit_msg:
        commit_msg = custom_commit_msg
    elif added_schools:
        school_names = [s["name"] for s in added_schools]
        if len(school_names) == 1:
            commit_msg = f"add new school: {school_names[0]} (EIIN {added_schools[0]['eiin']})"
        elif len(school_names) <= 3:
            commit_msg = f"add new schools: {', '.join(school_names)}"
        else:
            commit_msg = f"add {len(school_names)} new schools from archive"
    else:
        commit_msg = "add new schools"

    print(f"[*] Committing with message: \"{commit_msg}\"")
    commit_res = subprocess.run(["git", "commit", "-m", commit_msg], cwd=str(BASE_DIR))
    if commit_res.returncode != 0:
        print("[!] Git commit failed or nothing to commit.")
        return False

    print("[*] Pushing to remote with `git push`...")
    push_res = subprocess.run(["git", "push"], cwd=str(BASE_DIR))
    if push_res.returncode != 0:
        print("[!] Git push encountered an issue. Please run `git push` manually if needed.")
        return False

    print("[+] Git push completed successfully!")
    return True


def read_multiline_input() -> str:
    """
    Read input from user. If user pastes multiple lines, reads them all.
    Stops after first line if single line entered, or allows multi-line paste until EOF / empty line.
    """
    print("Paste EIIN(s) below (space/comma/newline separated, or type 'all', 'list', 'q'):")
    lines = []
    try:
        first_line = input("> ").strip()
        if not first_line:
            return ""
        lines.append(first_line)

        # Check if stdin has more lines ready (like in a paste operation)
        import select
        while True:
            if sys.stdin in select.select([sys.stdin], [], [], 0.1)[0]:
                line = sys.stdin.readline()
                if not line:
                    break
                lines.append(line.strip())
            else:
                break
    except (KeyboardInterrupt, EOFError):
        print("\nAborted.")
        return "q"

    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(
        description="Add schools by EIIN from archive/ into data/, run sync.py, and push to git."
    )
    parser.add_argument("eiins", nargs="*", help="EIIN(s) to add (or 'all' / 'list')")
    parser.add_argument("--list", "-l", action="store_true", help="List all available schools in archive")
    parser.add_argument("--all", "-a", action="store_true", help="Add all available schools from archive")
    parser.add_argument("--no-push", action="store_true", help="Do not run git push")
    parser.add_argument("--no-git", action="store_true", help="Do not run any git commands")
    parser.add_argument("-m", "--message", type=str, help="Custom git commit message", default=None)

    args = parser.parse_args()

    existing_eiins, existing_rolls = scan_existing_data()
    archive_schools = scan_archive()

    # Handle --list
    if args.list:
        list_archive_schools(archive_schools, existing_eiins)
        return

    raw_args = " ".join(args.eiins).strip() if args.eiins else ""

    # Interactive prompt if no positional arguments or flags given
    if not raw_args and not args.all:
        print("=" * 60)
        print("  SSC Chattogram Leaderboard - Archive Import CLI")
        print("=" * 60)
        list_archive_schools(archive_schools, existing_eiins)
        
        user_input = read_multiline_input()
        if not user_input or user_input.lower() in ("q", "quit", "exit"):
            print("Exiting.")
            return

        if user_input.lower() == "list":
            list_archive_schools(archive_schools, existing_eiins)
            return

        raw_args = user_input

    # Handle 'all' or --all
    if args.all or raw_args.strip().lower() == "all":
        target_eiins = [eiin for eiin in archive_schools if eiin not in existing_eiins]
        if not target_eiins:
            print("[*] All schools from archive are already added to runtime!")
            return
    elif raw_args.strip().lower() == "list":
        list_archive_schools(archive_schools, existing_eiins)
        return
    else:
        target_eiins = extract_eiins_from_text(raw_args)

    if not target_eiins:
        print("[!] No valid EIIN found in input.")
        return

    print(f"\n[*] Found {len(target_eiins)} EIIN(s) to process: {', '.join(target_eiins)}")
    added = add_schools_to_data(target_eiins, archive_schools, existing_eiins, existing_rolls)

    if not added:
        print("[*] No new schools or records were added.")
        return

    print(f"\n[+] Successfully imported {len(added)} school(s):")
    for s in added:
        print(f"    - [{s['eiin']}] {s['name']} ({s['records_count']} students) -> {s['target_file']}")

    # Run sync.py
    if not run_sync():
        sys.exit(1)

    # Git operations
    if args.no_git:
        print("[*] Skipping git operations (--no-git).")
    elif args.no_push:
        print("\n[*] Running git add and git commit (--no-push)...")
        subprocess.run(["git", "add", "."], cwd=str(BASE_DIR), check=True)
        commit_msg = args.message or f"add new schools: {', '.join(s['name'] for s in added)}"
        subprocess.run(["git", "commit", "-m", commit_msg], cwd=str(BASE_DIR))
    else:
        run_git(added, custom_commit_msg=args.message)

    print("\n[✓] All done!")


if __name__ == "__main__":
    main()
