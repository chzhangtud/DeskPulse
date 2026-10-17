#!/usr/bin/env bash
set -euo pipefail
umask 077
here="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
exe="$here/DeskPulse.Collector"
if [[ ! -f "$exe" ]]; then
    case "$(uname -m)" in x86_64) rid=linux-x64 ;; aarch64|arm64) rid=linux-arm64 ;; *) echo 'Unsupported CPU architecture.' >&2; exit 1 ;; esac
    exe="$here/../../artifacts/$rid/DeskPulse.Collector"
fi
[[ -x "$exe" ]] || { echo 'Run scripts/linux/build.sh first, or extract the complete Linux archive.' >&2; exit 1; }
exec "$exe" "$@"
