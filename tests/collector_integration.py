"""Exercise the real Windows collector, including pairing, TLS and live samples.

Starts an isolated loopback collector. Requires a built collector and Python 3.10+.
Never consumes the production phone's pairing code or saves its bearer credential.
"""
import base64
import hashlib
import http.client
import json
import pathlib
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
        cls.process = subprocess.Popen([
            "dotnet", str(ROOT / "collector/bin/Release/net8.0/DeskPulse.Collector.dll"),
            "--listen", "127.0.0.1", "--port", str(cls.port), "--state", cls.directory.name
        ], stdout=cls.log, stderr=cls.log)
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
        cls.process.terminate()
        raise RuntimeError("Collector did not start")

    @classmethod
    def tearDownClass(cls):
        # Kill only this isolated test's process tree so nvidia-smi cannot retain its log handle.
        if cls.process.poll() is None:
            subprocess.run(["taskkill", "/PID", str(cls.process.pid), "/T", "/F"],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
        cls.process.wait(timeout=10)
        cls.log.close()
        cls.directory.cleanup()

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
            self.assertIn("LibreHardwareMonitor", sample["capabilities"]["cpuTemperature"])
        else:
            self.assertTrue(sample["capabilities"]["cpuTemperature"])
        self.assertGreaterEqual(sample["network"]["downloadBytesPerSecond"], 0)
        self.assertTrue(set(sample["network"]["interfaceKinds"]) <= {"Ethernet", "Wi-Fi"})
        cpu_values = [p["cpuPercent"] for p in sample["processes"]]
        ram_values = [p["memoryBytes"] for p in sample["processesByMemory"]]
        self.assertLessEqual(len(ram_values), 5)
        self.assertTrue(ram_values)
        self.assertEqual(cpu_values, sorted(cpu_values, reverse=True))
        self.assertEqual(ram_values, sorted(ram_values, reverse=True))
        time.sleep(1.2)
        _, second = self.request("GET", "/api/v1/sample", token=token)
        self.assertGreater(second["sample"]["sequence"], sample["sequence"])
        stored = pathlib.Path(self.directory.name, "clients.json").read_text()
        self.assertNotIn(token, stored)


if __name__ == "__main__":
    unittest.main(verbosity=2)
