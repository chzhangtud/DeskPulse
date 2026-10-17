#!/usr/bin/env bash
set -euo pipefail
listen='' remote='' port=9443 backend='' dry_run=false
while (($#)); do
    case "$1" in
        --listen) listen="${2:?Missing LAN address}"; shift 2 ;;
        --remote) remote="${2:?Missing source IP/CIDR}"; shift 2 ;;
        --port) port="${2:?Missing port}"; shift 2 ;;
        --backend) backend="${2:?Missing backend}"; shift 2 ;;
        --dry-run) dry_run=true; shift ;;
        *) echo 'Usage: allow-lan.sh --listen LAN_IP --remote SOURCE_CIDR [--port 9443] [--backend ufw|firewalld] [--dry-run]' >&2; exit 2 ;;
    esac
done
python3 - "$listen" "$remote" "$port" <<'PY'
import ipaddress, sys
address = ipaddress.IPv4Address(sys.argv[1])
source = ipaddress.IPv4Network(sys.argv[2], strict=True)
private = [ipaddress.IPv4Network(n) for n in ('10.0.0.0/8','172.16.0.0/12','192.168.0.0/16')]
if not any(address in n for n in private) or not any(source.subnet_of(n) for n in private) or not 1 <= int(sys.argv[3]) <= 65535:
    raise SystemExit('Use a private LAN destination, private source subnet/IP and valid port.')
PY
if [[ -z "$backend" ]]; then
    if command -v ufw >/dev/null; then backend=ufw
    elif command -v firewall-cmd >/dev/null; then backend=firewalld
    else echo 'No supported firewall manager found. Configure the LAN-scoped TCP rule using your firewall manager.' >&2; exit 1; fi
fi
if ! $dry_run && [[ $(id -u) != 0 ]]; then echo 'Run with sudo to add a firewall rule, or use --dry-run.' >&2; exit 1; fi
run() { if $dry_run; then printf '%q ' "$@"; printf '\n'; else "$@"; fi; }
case "$backend" in
    ufw) run ufw allow in proto tcp from "$remote" to "$listen" port "$port" comment "DeskPulse-LAN-$port" ;;
    firewalld)
        rule="rule family=ipv4 source address=$remote destination address=$listen port port=$port protocol=tcp accept"
        run firewall-cmd --permanent "--add-rich-rule=$rule"
        run firewall-cmd "--add-rich-rule=$rule" ;;
    *) echo 'Supported firewall managers: ufw, firewalld.' >&2; exit 2 ;;
esac
