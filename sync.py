import json
from pathlib import Path

data_dir = Path(__file__).parent / "data"
manifest = data_dir / "manifest.json"

files = sorted(
    str(f.relative_to(data_dir))
    for f in data_dir.rglob("*.json")
    if f.is_file()
    and f.name != "manifest.json"
    and f.name != "scraped_results_all.json"
    and not f.name.startswith(".")
)

manifest.write_text(json.dumps(files, indent=2) + "\n")
print(f"Manifest updated: {len(files)} files")
