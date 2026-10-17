"""Smoke-test an extracted archive and an isolated real user systemd service.

Needs an active user manager. Creates and removes only a randomly named test unit.
"""
from pathlib import Path
import base64
import http.client
import ipaddress
import json
import os
import socket
import ssl
import subprocess
import sys
import tarfile
import tempfile
import time
import unittest
import uuid


def run(*args, **kwargs):
    return subprocess.run(args, capture_output=True, text=True, **kwargs)


@unittest.skipUnless(sys.platform == "linux", "Requires Linux")
class LinuxService(unittest.TestCase):
    def test_installed_service_restart_and_persistent_enrollment(self):
        if run("systemctl", "--user", "show-environment").returncode:
            self.skipTest("An active systemd user manager is required")
        addresses = json.loads(run("ip", "-j", "-4", "addr").stdout)
        networks = [ipaddress.ip_network(n) for n in ("10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16")]
        private = [a["local"] for interface in addresses for a in interface.get("addr_info", []) if any(ipaddress.ip_address(a["local"]) in n for n in networks)]
        if not private:
            self.skipTest("Needs a private LAN address for the installer")
        address = private[0]
        with socket.socket() as listener:
            listener.bind((address, 0))
            port = listener.getsockname()[1]
        name = "deskpulse-smoke-" + uuid.uuid4().hex[:12]
        unit = Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config")) / "systemd/user" / (name + ".service")
        self.assertFalse(unit.exists())
        with tempfile.TemporaryDirectory(prefix="deskpulse service ") as folder:
            folder = Path(folder)
            extracted = folder / "extracted"
            extracted.mkdir()
            with tarfile.open(ARCHIVE) as tar:
                tar.extractall(extracted, **({"filter": "data"} if hasattr(tarfile, "data_filter") else {}))
            env = os.environ.copy()
            env["XDG_DATA_HOME"] = str(folder / "data")
            env["XDG_STATE_HOME"] = str(folder / "private state")
            state = folder / "private state" / name

            def request(path, body=None, token=None):
                conn = http.client.HTTPSConnection(address, port, timeout=2, context=ssl._create_unverified_context())
                headers = {"Content-Type": "application/json"}
                if token:
                    headers["Authorization"] = "Bearer " + token
                try:
                    conn.request("POST" if body else "GET", path, json.dumps(body) if body else None, headers)
                    response = conn.getresponse()
                    raw = response.read()
                    return response.status, json.loads(raw) if raw else None
                finally:
                    conn.close()

            def wait_for(predicate):
                end = time.monotonic() + 25
                while time.monotonic() < end:
                    try:
                        result = predicate()
                        if result:
                            return result
                    except (OSError, ValueError):
                        pass
                    time.sleep(0.3)
                self.fail("Service did not become ready/recover")

            try:
                installed = run("bash", str(extracted / "install-service.sh"), "--listen", address, "--port", str(port), "--name", name, env=env)
                self.assertEqual(installed.returncode, 0, installed.stderr)
                wait_for(lambda: request("/health")[0] == 200)
                self.assertEqual(run("systemctl", "--user", "is-enabled", name).stdout.strip(), "enabled")
                setup = json.loads(base64.b64decode((state / "pairing.txt").read_text().split(":", 1)[1]))
                status, result = request("/api/v1/pair", {"secret": setup["secret"]})
                self.assertEqual(status, 200)
                token = result["token"]
                before = run("systemctl", "--user", "show", name, "-p", "MainPID", "--value").stdout.strip()
                self.assertNotEqual(before, "0")
                killed = run("systemctl", "--user", "kill", "--signal=SIGKILL", "--kill-who=main", name)
                self.assertEqual(killed.returncode, 0, killed.stderr)
                wait_for(lambda: (pid := run("systemctl", "--user", "show", name, "-p", "MainPID", "--value").stdout.strip()) not in ("", "0", before))
                wait_for(lambda: request("/api/v1/sample", token=token)[0] == 200)
                recovered = json.loads(base64.b64decode((state / "pairing.txt").read_text().split(":", 1)[1]))
                self.assertEqual(setup["fingerprint"], recovered["fingerprint"])
                upgraded = run("bash", str(extracted / "install-service.sh"), "--listen", address, "--port", str(port), "--name", name, env=env)
                self.assertEqual(upgraded.returncode, 0, upgraded.stderr)
                wait_for(lambda: request("/api/v1/sample", token=token)[0] == 200)
                self.assertEqual(state.stat().st_mode & 0o777, 0o700)
                journal = run("journalctl", "--user", "-u", name, "--no-pager", "-o", "cat")
                self.assertNotIn("deskpulse:", journal.stdout)
            finally:
                run("systemctl", "--user", "disable", "--now", name)
                unit.unlink(missing_ok=True)
                run("systemctl", "--user", "daemon-reload")
                run("systemctl", "--user", "reset-failed", name)


if __name__ == "__main__":
    ARCHIVE = Path(sys.argv.pop(1)).resolve()
    unittest.main(verbosity=2)
