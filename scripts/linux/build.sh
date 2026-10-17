#!/usr/bin/env bash
set -euo pipefail
root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
case "${1:-$(uname -m)}" in
    x86_64|linux-x64) rid=linux-x64 ;;
    aarch64|arm64|linux-arm64) rid=linux-arm64 ;;
    *) echo 'Supported targets: linux-x64 and linux-arm64 (glibc).' >&2; exit 2 ;;
esac
command -v dotnet >/dev/null || { echo '.NET 8 SDK is required to build; the resulting package is self-contained.' >&2; exit 1; }
command -v python3 >/dev/null || { echo 'Python 3 is required to package licenses and the archive.' >&2; exit 1; }
dotnet publish "$root/collector" -c Release -r "$rid" --self-contained true -p:DebugType=None -p:DebugSymbols=false -o "$root/artifacts/$rid"
python3 "$root/scripts/linux/package.py" "$root/artifacts/$rid" "$rid"
