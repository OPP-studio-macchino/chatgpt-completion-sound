#!/usr/bin/env python3
from pathlib import Path
import hashlib, json, subprocess, zipfile

ROOT = Path(__file__).resolve().parents[1]
EXT = ROOT / "extension"
DIST = ROOT / "dist"

subprocess.run(["python3", str(ROOT / "scripts" / "validate_repo.py")], check=True)
subprocess.run(["npm", "test"], cwd=ROOT, check=True)
manifest = json.loads((EXT / "manifest.json").read_text())
version = manifest["version"]
DIST.mkdir(exist_ok=True)
target = DIST / f"chatgpt-completion-sound-v{version}.zip"

stamp = (2026, 9, 17, 0, 0, 0)
with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for p in sorted(x for x in EXT.rglob("*") if x.is_file()):
        info = zipfile.ZipInfo(p.relative_to(EXT).as_posix(), stamp)
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o100644 << 16
        z.writestr(info, p.read_bytes())

with zipfile.ZipFile(target) as z:
    assert "manifest.json" in z.namelist()
    assert z.testzip() is None

sha256 = hashlib.sha256(target.read_bytes()).hexdigest()
print(json.dumps({"archive": str(target), "sha256": sha256, "version": version}, indent=2))
