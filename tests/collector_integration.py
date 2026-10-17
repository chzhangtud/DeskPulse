"""Exercise the real Windows/Linux collector, including pairing, TLS and live samples.

Starts an isolated loopback collector. Requires a built collector and Python 3.10+.
Never consumes the production phone's pairing code or saves its bearer credential.
"""
import base64
import hashlib
import http.client
import json
import os
import pathlib
import signal
import socket
import ssl
import subprocess
import tempfile
import time
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]


class CollectorIntegration(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.directory = tempfile.TemporaryDirectory(prefix="deskpulse-test-")
        with socket.socket() as listener:
            listener.bind(("127.0.0.1", 0))
            cls.port = listener.getsockname()[1]
        cls.log = open(pathlib.Path(cls.directory.name) / "collector.log", "w")
        target = os.environ.get("DESKPULSE_COLLECTOR", str(ROOT / "collector/bin/Release/net8.0/DeskPulse.Collector.dll"))
        cls.command = (["dotnet", target] if target.endswith(".dll") else [target]) + [
            "--listen", "127.0.0.1", "--port", str(cls.port), "--state", cls.directory.name, "--quiet-pairing", "true"
        ]
        cls.addClassCleanup(cls.directory.cleanup)
        cls.addClassCleanup(cls.log.close)
        cls.addClassCleanup(cls.stop)
        cls.start()

    @classmethod
    def start(cls):
        cls.process = subprocess.Popen(cls.command, stdout=cls.log, stderr=cls.log,
                                       start_new_session=os.name != "nt",
                                       creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
        pairing = pathlib.Path(cls.directory.name) / "pairing.txt"
        for _ in range(100):
            if pairing.exists():
                try:
                    cls.setup = json.loads(base64.b64decode(pairing.read_text().split(":", 1)[1]))
                    status, _ = cls.request("GET", "/health")
                    if status == 200:
                        return
                except (ConnectionError, OSError, ValueError):
                    pass
            time.sleep(0.1)
        cls.stop()
        raise RuntimeError("Collector did not start")

    @classmethod
    def stop(cls):
        # Stop only this isolated test's process group/tree, including its sensor child.
        if not hasattr(cls, "process") or cls.process.poll() is not None:
            return
        if os.name == "nt":
            subprocess.run(["taskkill", "/PID", str(cls.process.pid), "/T", "/F"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
        else:
            os.killpg(cls.process.pid, signal.SIGTERM)
        try:
            cls.process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            if os.name != "nt":
                os.killpg(cls.process.pid, signal.SIGKILL)
            cls.process.wait(timeout=5)

    @classmethod
    def request(cls, method, path, data=None, token=None):
        # Test a private self-signed endpoint; separately assert its exact SHA-256 pin.
        conn = http.client.HTTPSConnection("127.0.0.1", cls.port, timeout=5, context=ssl._create_unverified_context())
        headers = {"Content-Type": "application/json"}
        if token:
            headers["Authorization"] = "Bearer " + token
        try:
            conn.request(method, path, json.dumps(data) if data else None, headers)
            response = conn.getresponse()
            raw = response.read()
            return response.status, json.loads(raw) if raw else None
        finally:
            conn.close()

    def test_complete_authenticated_sampling(self):
        with socket.create_connection(("127.0.0.1", self.port)) as sock:
            with ssl._create_unverified_context().wrap_socket(sock, server_hostname="DeskPulse") as tls:
                digest = hashlib.sha256(tls.getpeercert(binary_form=True)).hexdigest().upper()
                self.assertEqual(digest, self.setup["fingerprint"])
        self.assertEqual(self.request("GET", "/api/v1/sample")[0], 401)
        self.assertEqual(self.request("POST", "/api/v1/pair", {"secret": "wrong"})[0], 401)
        status, result = self.request("POST", "/api/v1/pair", {"secret": self.setup["secret"]})
        self.assertEqual(status, 200)
        token = result["token"]
        self.assertEqual(self.request("POST", "/api/v1/pair", {"secret": self.setup["secret"]})[0], 401)
        self.assertEqual(self.request("GET", "/api/v1/sample", token="forged")[0], 401)
        time.sleep(1.2)
        _, first = self.request("GET", "/api/v1/sample", token=token)
        self.assertEqual(first["schemaVersion"], 1)
        self.assertLess(first["sampleAgeMs"], 5000)
        sample = first["sample"]
        self.assertGreater(sample["memory"]["totalBytes"], 0)
        self.assertGreater(sample["memory"]["usedBytes"], 0)
        self.assertTrue(0 <= sample["cpuPercent"] <= 100)
        temperature = sample["cpuTemperatureC"]
        if temperature is not None:
            self.assertTrue(0 < temperature <= 125)
            self.assertTrue(any(source in sample["capabilities"]["cpuTemperature"] for source in ("LibreHardwareMonitor", "Linux sysfs")))
        else:
            self.assertTrue(sample["capabilities"]["cpuTemperature"])
        if sample["network"]["interfaces"]:
            self.assertGreaterEqual(sample["network"]["downloadBytesPerSecond"], 0)
        else:
            self.assertIsNone(sample["network"]["downloadBytesPerSecond"])
        self.assertTrue(set(sample["network"]["interfaceKinds"]) <= {"Ethernet", "Wi-Fi"})
        cpu_values = [p["cpuPercent"] for p in sample["processes"]]
        ram_values = [p["memoryBytes"] for p in sample["processesByMemory"]]
        self.assertLessEqual(len(ram_values), 5)
        self.assertTrue(ram_values)
        self.assertEqual(cpu_values, sorted(cpu_values, reverse=True))
        self.assertEqual(ram_values, sorted(ram_values, reverse=True))
        self.assertTrue(sample["disks"])
        self.assertGreater(sample["uptimeSeconds"], 0)
        self.assertTrue(any(p["totalBytes"] and p["totalBytes"] > 0 for p in sample["disks"]))
        self.assertIn("Linux" if os.name != "nt" else "Windows", sample["capabilities"]["cpu"])
        time.sleep(1.2)
        _, second = self.request("GET", "/api/v1/sample", token=token)
        self.assertGreater(second["sample"]["sequence"], sample["sequence"])
        stored = pathlib.Path(self.directory.name, "clients.json").read_text()
        self.assertNotIn(token, stored)
        if os.name != "nt":
            self.assertEqual(pathlib.Path(self.directory.name).stat().st_mode & 0o777, 0o700)
            for name in ("pairing.txt", "collector.pfx", "clients.json"):
                self.assertEqual(pathlib.Path(self.directory.name, name).stat().st_mode & 0o777, 0o600)
        previous_pin = self.setup["fingerprint"]
        self.stop()
        self.start()
        self.assertEqual(self.setup["fingerprint"], previous_pin)
        status, result = self.request("GET", "/api/v1/sample", token=token)
        self.assertEqual(status, 200)
        self.assertEqual(result["schemaVersion"], 1)
        self.log.flush()
        self.assertNotIn("deskpulse:", pathlib.Path(self.directory.name, "collector.log").read_text())


if __name__ == "__main__":
    unittest.main(verbosity=2)
