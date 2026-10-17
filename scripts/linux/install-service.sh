#!/usr/bin/env bash
set -euo pipefail
umask 077
listen='' port=9443 name=deskpulse dry_run=false
while (($#)); do
    case "$1" in
        --listen) listen="${2:?Missing LAN address}"; shift 2 ;;
        --port) port="${2:?Missing port}"; shift 2 ;;
        --name) name="${2:?Missing service name}"; shift 2 ;;
        --dry-run) dry_run=true; shift ;;
        *) echo 'Usage: install-service.sh --listen LAN_IP [--port 9443] [--name deskpulse] [--dry-run]' >&2; exit 2 ;;
    esac
done
python3 - "$listen" "$port" "$name" <<'PY'
import ipaddress, re, sys
address = ipaddress.IPv4Address(sys.argv[1])
private = any(address in ipaddress.IPv4Network(n) for n in ('10.0.0.0/8','172.16.0.0/12','192.168.0.0/16'))
if not private or not 1 <= int(sys.argv[2]) <= 65535 or not re.fullmatch(r'[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}', sys.argv[3]):
    raise SystemExit('Use a private LAN IPv4 address, valid port, and simple service name.')
PY
here="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
source_dir="$here"
if [[ ! -f "$source_dir/DeskPulse.Collector" ]]; then
    case "$(uname -m)" in x86_64) rid=linux-x64 ;; aarch64|arm64) rid=linux-arm64 ;; *) exit 2 ;; esac
    source_dir="$(cd -- "$here/../../artifacts/$rid" && pwd)"
fi
[[ -x "$source_dir/DeskPulse.Collector" ]] || { echo 'Build or extract the Linux collector first.' >&2; exit 1; }
app="${XDG_DATA_HOME:-$HOME/.local/share}/$name/app"
state="${XDG_STATE_HOME:-$HOME/.local/state}/$name"
unit="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user/$name.service"
if ! $dry_run; then
    systemctl --user show-environment >/dev/null
    if [[ -f "$unit" ]] && ! grep -q '^Description=DeskPulse collector' "$unit"; then
        echo 'An unrelated service uses this name; refusing to replace it.' >&2; exit 1
    fi
    load_state="$(systemctl --user show "$name.service" -p LoadState --value 2>/dev/null || true)"
    if [[ -n "$load_state" && "$load_state" != not-found ]]; then
        description="$(systemctl --user show "$name.service" -p Description --value)"
        [[ "$description" == 'DeskPulse collector'* ]] || { echo 'An unrelated loaded service uses this name.' >&2; exit 1; }
    fi
    systemctl --user stop "$name.service" 2>/dev/null || true
fi
python3 - "$source_dir" "$app" "$state" "$unit" "$listen" "$port" "$dry_run" <<'PY'
from pathlib import Path
import shutil, sys
source, app, state, unit = map(Path, sys.argv[1:5])
source, app, state, unit = (path.resolve() for path in (source, app, state, unit))
if any('\n' in str(path) or '\r' in str(path) for path in (source, app, state, unit)):
    raise SystemExit('Installation paths cannot contain line breaks.')
listen, port, dry = sys.argv[5:]
def quote(path):
    return '"' + str(path).replace('\\','\\\\').replace('"','\\"').replace('%','%%') + '"'
text = f'''[Unit]
Description=DeskPulse collector (current user)
StartLimitIntervalSec=0

[Service]
Type=simple
WorkingDirectory={str(app).replace('%','%%')}
ExecStart={quote(app / 'DeskPulse.Collector')} --listen {listen} --port {port} --state {quote(state)} --quiet-pairing true
Restart=always
RestartSec=5
KillMode=control-group
UMask=0077
NoNewPrivileges=yes

[Install]
WantedBy=default.target
'''
if dry == 'true':
    print(text)
else:
    app.mkdir(parents=True, exist_ok=True)
    state.mkdir(parents=True, exist_ok=True, mode=0o700)
    state.chmod(0o700)
    if source.resolve() != app.resolve():
        for item in source.iterdir():
            if item.is_file() and item.suffix not in ('.pfx','.pem','.key','.p12','.log','.pdb','.jks','.keystore','.bundle') and item.name not in ('pairing.txt','clients.json','clients.json.tmp','collector.pid'):
                shutil.copy2(item, app / item.name)
        shutil.copytree(source / 'licenses', app / 'licenses', dirs_exist_ok=True)
    (app / 'DeskPulse.Collector').chmod(0o755)
    unit.parent.mkdir(parents=True, exist_ok=True)
    unit.write_text(text)
PY
if ! $dry_run; then
    systemctl --user daemon-reload
    systemctl --user enable --now "$name.service"
    echo "Enabled $name.service after user sign-in. Import the private setup file: $state/pairing.txt"
fi
