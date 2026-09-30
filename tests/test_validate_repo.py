import re
import runpy
import unittest
from pathlib import Path
from unittest.mock import patch


VALIDATOR = Path(__file__).resolve().parents[1] / "scripts" / "validate_repo.py"


class ValidatorPreflightTests(unittest.TestCase):
    def test_forbidden_artifacts_fail_before_parsing(self):
        for name in ["._options.html", "sound.WAV", "signing.pem", "signing.key", "package.crx"]:
            with self.subTest(name=name):
                artifact = VALIDATOR.parents[1] / "extension" / name
                # In-memory AppleDouble-like bytes; no binary fixture is written.
                binary = b"\x00\x05\x16\x07\xff"
                with patch.object(Path, "rglob", return_value=iter([artifact])), \
                     patch.object(Path, "is_file", return_value=True), \
                     patch.object(Path, "read_text", side_effect=lambda *a, **k: binary.decode("utf-8")) as read, \
                     patch("subprocess.run") as subprocess_run:
                    with self.assertRaisesRegex(AssertionError, re.escape(str(artifact))):
                        runpy.run_path(str(VALIDATOR))
                    read.assert_not_called()
                    subprocess_run.assert_not_called()


if __name__ == "__main__":
    unittest.main()
