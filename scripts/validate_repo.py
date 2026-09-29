#!/usr/bin/env python3
from pathlib import Path
import json, re, struct, subprocess, sys

ROOT = Path(__file__).resolve().parents[1]
EXT = ROOT / "extension"
manifest = json.loads((EXT / "manifest.json").read_text())
version = manifest["version"]

assert manifest["manifest_version"] == 3
assert manifest["minimum_chrome_version"] == "120"
assert manifest["permissions"] == ["storage", "offscreen", "alarms", "scripting", "webRequest"]
assert manifest["optional_permissions"] == ["tabGroups"]
assert manifest["host_permissions"] == ["https://chatgpt.com/*"]
assert manifest["content_security_policy"]["extension_pages"].find("connect-src 'none'") >= 0

for script in sorted(EXT.glob("*.js")):
    subprocess.run(["node", "--check", str(script)], check=True)

refs = [manifest["background"]["service_worker"], manifest["options_page"], manifest["action"]["default_popup"]]
for content in manifest["content_scripts"]:
    assert content["matches"] == ["https://chatgpt.com/*"]
    refs.extend(content["js"])
refs.extend(manifest["icons"].values())
refs.extend(manifest["action"]["default_icon"].values())
for ref in refs:
    assert (EXT / ref).is_file(), ref

for html in EXT.glob("*.html"):
    for ref in re.findall(r'(?:href|src)="([^"#:]+)"', html.read_text()):
        assert (EXT / ref).is_file(), (html.name, ref)

for icon in (EXT / "icons").glob("*.png"):
    expected = int(icon.stem.split("-")[1])
    assert struct.unpack(">II", icon.read_bytes()[16:24]) == (expected, expected), icon

package = json.loads((ROOT / "package.json").read_text())
lock = json.loads((ROOT / "package-lock.json").read_text())
assert package["version"] == version
assert lock["version"] == version
assert f"CONTENT_VERSION = '{version}'" in (EXT / "content.js").read_text()

for p in ROOT.rglob("*"):
    if p.is_file():
        assert not p.name.startswith("._"), p
        assert p.suffix.lower() not in {".wav", ".pem", ".key", ".crx"}, p

print(f"repository validation PASS (v{version})")
