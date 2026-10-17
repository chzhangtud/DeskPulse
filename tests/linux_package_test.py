"""Validate the installable Linux archive, including metadata privacy."""
from pathlib import PurePosixPath
import re
import json
import struct
import sys
import tarfile


def validate(archive):
    with tarfile.open(archive) as tar:
        entries = tar.getmembers()
        names = {entry.name for entry in entries}
        required = {"DeskPulse.Collector", "DeskPulse.Collector.dll", "LICENSE", "THIRD_PARTY_NOTICES.md", "INSTALL-LINUX.md", "start-collector.sh", "install-service.sh", "allow-lan.sh", "DOTNET-LICENSE.TXT", "ASPNET-LICENSE.TXT", "DOTNET-THIRD-PARTY-NOTICES.TXT", "ASPNET-THIRD-PARTY-NOTICES.TXT"}
        assert required <= names, required - names
        for entry in entries:
            path = PurePosixPath(entry.name)
            assert not path.is_absolute() and ".." not in path.parts
            assert entry.isfile(), entry.name
            assert entry.uid == entry.gid == 0 and entry.uname == entry.gname == "", entry.name
            assert not ({"state", ".local", ".git"} & set(path.parts)), entry.name
            assert path.suffix.lower() not in {".pdb", ".pfx", ".pem", ".key", ".p12", ".jks", ".keystore", ".bundle", ".log"}, entry.name
            assert path.name not in {"pairing.txt", "clients.json", "clients.json.tmp", "collector.pid"}, entry.name
            assert not any(part in path.name.lower() for part in ("librehardwaremonitor", "pawnio")), entry.name
            if entry.name == "DeskPulse.Collector" or path.suffix == ".sh":
                assert entry.mode & 0o777 == 0o755, entry.name
        raw = tar.extractfile("DeskPulse.Collector.dll").read()
        host = tar.extractfile("DeskPulse.Collector").read(20)
        target = json.load(tar.extractfile("DeskPulse.Collector.deps.json"))["runtimeTarget"]["name"].split("/")[-1]
        assert host.startswith(b'\x7fELF') and struct.unpack('<H', host[18:20])[0] == {'linux-x64': 62, 'linux-arm64': 183}[target]
        for text in (raw, raw.decode("utf-16-le", errors="ignore").encode("utf-8")):
            assert not re.search(rb"[A-Za-z]:\\(?:Users|AIRepos)\\|/home/[^/\x00]+/|/mnt/[a-z]/", text), "Application embeds a local source path"
    print(f"PASS Linux archive: {len(entries)} files; runtime notices, executable modes, no private state/symbols/build identity")


if __name__ == "__main__":
    validate(sys.argv[1])
