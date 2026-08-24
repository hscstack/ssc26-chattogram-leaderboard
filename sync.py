import html
import json
import re
from pathlib import Path

data_dir = Path(__file__).parent / "data"
manifest_path = data_dir / "manifest.json"
metadata_path = data_dir / "metadata.json"
leaderboard_path = data_dir / "leaderboard_ranked.json"

# Exclude generated/special files
excluded_filenames = {
    "manifest.json",
    "metadata.json",
    "leaderboard_ranked.json",
    "scraped_results_all.json",
}

# 1. Discover all data files
raw_files = sorted(
    str(f.relative_to(data_dir))
    for f in data_dir.rglob("*.json")
    if f.is_file()
    and f.name not in excluded_filenames
    and not f.name.startswith(".")
)

manifest_path.write_text(json.dumps(raw_files, indent=2) + "\n")
print(f"Manifest updated: {len(raw_files)} files")


def format_district_name(name: str) -> str:
    if not name:
        return ""
    s = str(name).strip().upper().replace("_", " ")
    if s == "COX S BAZAR":
        s = "COX'S BAZAR"
    return s


def format_upazilla_name(name: str) -> str:
    if not name:
        return ""
    s = str(name).strip().upper().replace("_", " ")
    s = re.sub(r"\bCOX S\b", "COX'S", s)
    return s


all_students = []

for rel_path in raw_files:
    file_path = data_dir / rel_path
    if not file_path.exists():
        continue

    try:
        data = json.loads(file_path.read_text(encoding="utf-8"))
    except Exception as e:
        print(f"Warning: Failed to read {rel_path}: {e}")
        continue

    file_district = ""
    file_upazilla = ""
    records = []

    if isinstance(data, list):
        records = data
    elif isinstance(data, dict):
        file_district = data.get("district") or data.get("zilla") or ""
        file_upazilla = data.get("upazilla") or data.get("thana") or ""
        records = data.get("records") if isinstance(data.get("records"), list) else []

    for r in records:
        raw_name = str(r.get("name") or "UNKNOWN").strip()
        name = html.unescape(raw_name)

        raw_school = str(r.get("school") or r.get("institution_name") or "UNKNOWN").strip()
        school = html.unescape(raw_school)

        roll = str(r.get("roll") or "").strip() if r.get("roll") is not None else ""

        district = r.get("district") or r.get("zilla") or file_district or ""
        district = format_district_name(district)

        upazilla = r.get("upazilla") or r.get("thana") or file_upazilla or ""
        upazilla = format_upazilla_name(upazilla)

        # Marks calculation
        mark = 0
        if r.get("total_mark") is not None:
            try:
                mark = int(r.get("total_mark"))
            except (ValueError, TypeError):
                mark = 0
        elif r.get("mark") is not None:
            try:
                mark = int(r.get("mark"))
            except (ValueError, TypeError):
                mark = 0

        # GPA & Status calculation
        gpa = 0.0
        status = "PASSED"
        raw_grade = str(r.get("grade")).strip().upper() if r.get("grade") is not None else None
        raw_gpa = r.get("gpa")

        if raw_grade == "FAIL" or r.get("status") == "FAILED":
            gpa = 0.0
            status = "FAILED"
        elif raw_gpa is not None:
            try:
                gpa = float(raw_gpa)
                status = r.get("status") or ("PASSED" if gpa > 0 else "FAILED")
            except (ValueError, TypeError):
                gpa = 0.0
                status = "FAILED"
        elif raw_grade is not None:
            try:
                gpa = float(raw_grade)
                status = "PASSED"
            except (ValueError, TypeError):
                gpa = 0.0
                status = "FAILED"

        # Group determination
        group = ""
        r_group = r.get("group")
        if r_group and isinstance(r_group, str) and r_group.strip():
            group = r_group.upper().strip()
        elif r.get("subjects") and isinstance(r.get("subjects"), list) and len(r.get("subjects")) > 0:
            codes = {str(s.get("code") or "").strip() for s in r["subjects"] if isinstance(s, dict)}
            sub_names = [str(s.get("subject") or "").upper() for s in r["subjects"] if isinstance(s, dict)]

            is_science = (
                bool(codes & {"136", "137", "138", "126"})
                or any("PHYSICS" in s or "CHEMISTRY" in s or "BIOLOGY" in s or "HIGHER MATHEMATICS" in s for s in sub_names)
            )
            is_business = (
                bool(codes & {"146", "152", "143"})
                or any("ACCOUNTING" in s or "FINANCE" in s or "BUSINESS" in s for s in sub_names)
            )
            is_humanities = (
                bool(codes & {"140", "153", "110", "141", "151"})
                or any("CIVICS" in s or "HISTORY" in s or "GEOGRAPHY" in s or "ECONOMICS" in s for s in sub_names)
            )

            if is_science:
                group = "SCIENCE"
            elif is_business:
                group = "BUSINESS STUDIES"
            elif is_humanities:
                group = "HUMANITIES"
            else:
                group = "OTHER"
        else:
            group = "OTHER"

        all_students.append({
            "name": name,
            "roll": roll,
            "school": school,
            "district": district,
            "upazilla": upazilla,
            "mark": mark,
            "gpa": gpa,
            "status": status,
            "group": group,
            "source_file": rel_path,
        })

# Sort by GPA (desc) then Marks (desc)
all_students.sort(key=lambda s: (s["gpa"], s["mark"]), reverse=True)

# Assign global rank and collect uniques
unique_schools = set()
unique_districts = set()
unique_upazillas = set()
unique_groups = set()
gpa5_count = 0

current_global_rank = 1
for i, student in enumerate(all_students):
    if i > 0:
        prev = all_students[i - 1]
        if student["gpa"] != prev["gpa"] or student["mark"] != prev["mark"]:
            current_global_rank = i + 1
    student["globalRank"] = current_global_rank

    if student["gpa"] >= 5.0 and student["status"] == "PASSED":
        gpa5_count += 1

    if student["school"]:
        unique_schools.add(student["school"].upper())
    if student["district"]:
        unique_districts.add(student["district"].upper())
    if student["upazilla"]:
        unique_upazillas.add(student["upazilla"].upper())
    if student["group"]:
        unique_groups.add(student["group"].upper())

# Assign school rank
for school_name in unique_schools:
    school_students = [s for s in all_students if s["school"] and s["school"].upper() == school_name]
    curr_school_rank = 1
    for i, s in enumerate(school_students):
        if i > 0:
            prev = school_students[i - 1]
            if s["gpa"] != prev["gpa"] or s["mark"] != prev["mark"]:
                curr_school_rank = i + 1
        s["schoolRank"] = curr_school_rank

# Build metadata
metadata = {
    "total_students": len(all_students),
    "total_schools": len(unique_schools),
    "total_gpa5": gpa5_count,
    "total_districts": len(unique_districts),
    "districts": sorted(unique_districts),
    "upazillas": sorted(unique_upazillas),
    "schools": sorted(unique_schools),
    "groups": sorted(unique_groups),
}

metadata_path.write_text(json.dumps(metadata, indent=2) + "\n")
leaderboard_path.write_text(json.dumps(all_students, separators=(",", ":")) + "\n")

print(f"Generated metadata.json (stats + options for {len(all_students)} students)")
print(f"Generated leaderboard_ranked.json ({len(all_students)} ranked students, {leaderboard_path.stat().st_size / 1024 / 1024:.2f} MB)")

