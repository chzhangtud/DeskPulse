"""Exercise Linux setup helpers without changing a real firewall or service."""
from pathlib import Path
import os
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts/linux"


@unittest.skipUnless(sys.platform == "linux", "Linux helper tests need Bash on Linux")
class LinuxHelpers(unittest.TestCase):
    def run_helper(self, name, *args, env=None):
        return subprocess.run(["bash", str(SCRIPTS / name), *args], capture_output=True, text=True, env=env)

    def test_shell_syntax(self):
        for path in SCRIPTS.glob("*.sh"):
            result = subprocess.run(["bash", "-n", str(path)], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)

    def test_firewall_scope_and_backends(self):
        args = ("--listen", "192.168.1.20", "--remote", "192.168.1.0/24", "--port", "9443", "--dry-run")
        result = self.run_helper("allow-lan.sh", *args, "--backend", "ufw")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("from 192.168.1.0/24 to 192.168.1.20 port 9443", result.stdout)
        result = self.run_helper("allow-lan.sh", *args, "--backend", "firewalld")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("--permanent", result.stdout)
        self.assertEqual(result.stdout.count("--add-rich-rule"), 2)

    def test_firewall_rejects_public_or_overbroad_rules(self):
        for destination, source, port in [("0.0.0.0", "192.168.1.0/24", "9443"), ("192.168.1.20", "0.0.0.0/0", "9443"), ("192.168.1.20", "192.168.1.0/24", "70000"), ("192.168.1.20", "8.8.8.8/32", "9443")]:
            result = self.run_helper("allow-lan.sh", "--listen", destination, "--remote", source, "--port", port, "--backend", "ufw", "--dry-run")
            self.assertNotEqual(result.returncode, 0)
            self.assertNotIn("ufw allow", result.stdout)

    def test_service_dry_run_and_path_quoting(self):
        with tempfile.TemporaryDirectory(prefix="deskpulse helpers ") as folder:
            env = os.environ.copy()
            env["XDG_DATA_HOME"] = folder + "/data"
            env["XDG_STATE_HOME"] = folder + "/state"
            result = self.run_helper("install-service.sh", "--listen", "192.168.1.20", "--dry-run", env=env)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn('--quiet-pairing true', result.stdout)
            self.assertIn('UMask=0077', result.stdout)
            self.assertIn('Restart=always', result.stdout)
            self.assertIn('ExecStart="' + folder, result.stdout)
            self.assertFalse(Path(folder, "data").exists(), "Dry-run must not install files")

    def test_service_rejects_invalid_identity(self):
        for args in [("--listen", "8.8.8.8"), ("--listen", "192.168.1.20", "--name", "../../other")]:
            self.assertNotEqual(self.run_helper("install-service.sh", *args, "--dry-run").returncode, 0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
