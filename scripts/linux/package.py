"""Package a Linux publish directory without private state or debug paths."""
import json
import os
from pathlib import Path
import shutil
import sys
import tarfile
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[2]


def package(output, rid):
    output = Path(output).resolve()
    if rid not in ("linux-x64", "linux-arm64"):
        raise ValueError("Unsupported Linux runtime")
    if not (output / "DeskPulse.Collector").is_file():
        raise FileNotFoundError("Publish the collector before packaging")
    deps = json.loads((output / "DeskPulse.Collector.deps.json").read_text())
    if not deps["runtimeTarget"]["name"].endswith("/" + rid):
        raise ValueError("Publish runtime does not match the requested archive target")
    version = ET.parse(ROOT / "collector/DeskPulse.Collector.csproj").findtext(".//Version")
    for name in ("LICENSE", "THIRD_PARTY_NOTICES.md"):
        shutil.copyfile(ROOT / name, output / name)
    shutil.copyfile(ROOT / "docs/LINUX.md", output / "INSTALL-LINUX.md")
    for name in ("start-collector.sh", "install-service.sh", "allow-lan.sh"):
        shutil.copyfile(ROOT / "scripts/linux" / name, output / name)
    (output / "licenses").mkdir(exist_ok=True)
    aspnet_license = output / "licenses/ASP.NET-Core-LICENSE.txt"
    shutil.copyfile(ROOT / "licenses/ASP.NET-Core-LICENSE.txt", aspnet_license)
    config = json.loads((output / "DeskPulse.Collector.runtimeconfig.json").read_text())
    packages = Path(os.environ.get("NUGET_PACKAGES", Path.home() / ".nuget/packages"))
    for framework in config["runtimeOptions"]["includedFrameworks"]:
        runtime = "microsoft.netcore.app.runtime" if framework["name"] == "Microsoft.NETCore.App" else "microsoft.aspnetcore.app.runtime"
        prefix = "DOTNET" if framework["name"] == "Microsoft.NETCore.App" else "ASPNET"
        folder = packages / f"{runtime}.{rid}" / framework["version"]
        for notice in ("LICENSE.TXT", "THIRD-PARTY-NOTICES.TXT"):
            source = folder / notice
            if not source.is_file() and prefix == "ASPNET" and notice == "LICENSE.TXT":
                source = ROOT / "licenses/ASP.NET-Core-LICENSE.txt"
            if not source.is_file():
                raise FileNotFoundError(f"Missing runtime notice: {source.name} ({runtime})")
            shutil.copyfile(source, output / f"{prefix}-{notice}")
    archive = ROOT / "artifacts" / f"DeskPulse-{version}-{rid}.tar.gz"
    with tarfile.open(archive, "w:gz") as tar:
        entries = [p for p in output.iterdir() if p.is_file() and p.suffix.lower() not in (".pdb", ".pfx", ".pem", ".key", ".p12", ".jks", ".keystore", ".bundle", ".log") and p.name not in ("pairing.txt", "clients.json", "clients.json.tmp", "collector.pid")]
        entries += [aspnet_license]
        for path in sorted(entries):
            if not path.is_file():
                continue
            info = tar.gettarinfo(str(path), arcname=path.relative_to(output).as_posix())
            info.uid = info.gid = 0
            info.uname = info.gname = ""
            info.mode = 0o755 if path.name == "DeskPulse.Collector" or path.suffix == ".sh" else 0o644
            with path.open("rb") as stream:
                tar.addfile(info, stream)
    print(f"Created {archive.name}; private state and symbols excluded")
    return archive


if __name__ == "__main__":
    package(sys.argv[1], sys.argv[2])
