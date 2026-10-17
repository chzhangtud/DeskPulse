# Linux collector

The Linux collector uses the same certificate-pinned HTTPS API and pairing protocol as Windows. The existing Android app supports both. Monitoring, process rankings, health rules, theme/language/wallpaper settings, automatic reconnect, and the independent weather/news/stock display remain available.

## Build and run

Use a glibc distribution with .NET 8 runtime prerequisites (for example Ubuntu 22.04+ or Debian 12+). Building needs the .NET 8 SDK, Python 3 and Bash. The resulting package includes .NET and ASP.NET Core; running it needs no SDK, root privileges or Python. The optional setup helpers use Python 3.

```bash
bash scripts/linux/build.sh               # native x64 or ARM64 target
# Or explicitly: bash scripts/linux/build.sh linux-arm64
tar -xzf artifacts/DeskPulse-0.1.0-linux-x64.tar.gz -C /path/to/empty/install-folder
cd /path/to/empty/install-folder
./start-collector.sh --listen 192.168.1.20 --port 9443
```

The address is an example: use the Linux host's reachable RFC1918 IPv4 address. Keep the complete extracted directory together. The current GitHub v0.1.0 release downloads are the earlier Windows/Android preview; build Linux from the current source. ARM64 is a build target; only x64 has been exercised in WSL.

Transfer the generated `state/pairing.txt` privately to the phone, import it in **Settings → Connection**, and pair within ten minutes. A setup code is single use. Existing phones retain access after restarts and upgrades when the state directory is preserved. `--state /private/directory` overrides the default beside the executable. Linux state directories use mode 0700 and credential files 0600. Never publish these files, logs, host identifiers or actual screenshots.

## Metrics and hardware

| Feature | Linux source / behavior |
| --- | --- |
| Aggregate CPU | `/proc/stat` deltas; guest ticks are not counted twice; first/reset samples are unavailable |
| Physical memory | `/proc/meminfo`: `MemTotal - MemAvailable`; caches that can be reclaimed are available |
| Network | Active Ethernet/Wi-Fi with a gateway; real byte counter deltas; missing/reset counters are unavailable |
| Disk capacity | Local mounted filesystems and WSL drive mounts; pseudo, remote and duplicate bind mounts are excluded |
| CPU/RAM process rankings | Accessible Linux processes, CPU time deltas normalized by logical CPU count, resident working set; top five independently ranked |
| NVIDIA GPU | Installed `nvidia-smi` on PATH; WSL uses `/usr/lib/wsl/lib/nvidia-smi`; unavailable fields stay null |
| CPU temperature | Read-only CPU-labelled hwmon (`coretemp`, `k10temp`, etc.) with CPU thermal-zone fallback; no extra driver is shipped |
| Uptime | `/proc/uptime`, rather than the collector's lifetime |
| Startup and recovery | Optional current-user systemd service, automatic process restart, private persistent state |

CPU temperature acquisition runs every two seconds outside the main sampler; old readings are suppressed. Package/die sensors are preferred over individual cores. GPU/NVMe/disk temperatures are never substituted for CPU temperature. Inspect `/sys/class/hwmon` and the kernel's CPU sensor driver if the CPU temperature is unavailable. Some systems need an appropriate kernel module or narrower sensor read permissions configured by an administrator. No helper changes kernel drivers, device permissions or Secure Boot settings.

NVIDIA temperature, power and utilization depend on driver support. WSL/VMs commonly do not expose CPU temperature, and some NVIDIA counters are unsupported. Fans, per-core graphs, disk I/O and AMD/Intel GPU telemetry remain unavailable, as in the Windows collector.

## LAN firewall

Allow only the intended source subnet/phone, destination address and TCP port. The helper supports UFW and firewalld, does not enable a disabled firewall, and does not change the global network profile.

```bash
./allow-lan.sh --listen 192.168.1.20 --remote 192.168.1.0/24 --backend ufw --dry-run
sudo ./allow-lan.sh --listen 192.168.1.20 --remote 192.168.1.0/24 --backend ufw
# For firewalld, use --backend firewalld instead.
```

Replace both example addresses. Unlike Windows' application-scoped firewall rule, these Linux rules scope addresses and port. For another firewall manager, apply the equivalent rule yourself; do not disable the firewall or forward the service onto the public internet.

## User sign-in startup

From an extracted package or a built repository:

```bash
./install-service.sh --listen 192.168.1.20 --dry-run
./install-service.sh --listen 192.168.1.20
systemctl --user status deskpulse.service
```

This installs under the user's XDG data/config/state directories, without sudo. The service starts at user sign-in and restarts after an exit. It retries when the chosen LAN address is not yet available. It runs without root and suppresses the pairing string in journal output; import the private pairing file from `${XDG_STATE_HOME:-$HOME/.local/state}/deskpulse/pairing.txt`.

Existing source-folder state is not imported automatically. To retain an already paired manual installation, stop the manual collector and run `systemctl --user stop deskpulse.service` after installation. Privately copy the old state's `collector.pfx` and `clients.json` into the XDG state directory, then run `systemctl --user start deskpulse.service`. Do not copy/edit credentials while either collector is running. Otherwise, import the new service's setup file and pair again.

A user systemd manager must be available. To run before sign-in or remain running after logout, an administrator can explicitly enable lingering with `loginctl enable-linger`; this is optional and never enabled by the installer. `--name` selects a separate service/data namespace for isolated testing. Use a stable path and re-run installation after updating the address/port. No password is stored.

To upgrade, stop `systemctl --user stop deskpulse.service`, extract the new package into a separate directory, and run its installer again. Keep the XDG state directory intact. To disable: `systemctl --user disable --now deskpulse.service`. To remove registration, additionally remove only `~/.config/systemd/user/deskpulse.service` (or the configured XDG equivalent) and run `systemctl --user daemon-reload`; preserve private state unless deliberately revoking access.

## WSL test scope and phone access

WSL reports the Linux VM's memory, CPU, mounts and processes. It does not replace the Windows host collector when you want Windows host metrics. A missing WSL sensor must remain unavailable; it does not justify simulated values.

WSL 2 NAT addresses are not normally reachable directly from a phone on the Windows LAN. Native Linux hosts use their own LAN address. For WSL phone access, choose a supported network setup, such as Windows 11's mirrored WSL networking with appropriately scoped Windows/Hyper-V firewall rules. Do not change `.wslconfig`, reboot WSL or add Windows forwarding rules merely to run the integration tests. Tests use isolated loopback endpoints; a successful WSL test is not proof of physical-phone connectivity.

## Tests

```bash
dotnet run --project tests/Collector.Tests -c Release
dotnet build collector -c Release
python3 tests/collector_integration.py
# Test the actual published executable instead of a development DLL:
DESKPULSE_COLLECTOR="$PWD/artifacts/linux-x64/DeskPulse.Collector" python3 tests/collector_integration.py
```

Fixture tests cover Linux counter resets, guest accounting, memory units, mount filtering, sensor identity/fallback and NVIDIA missing values. Real integration tests check TLS pinning, one-use pairing, authentication, genuine advancing samples, CPU/RAM rankings, private permissions, and persisted certificate/token access across restart. Tests never consume an existing phone's enrollment code.

References: [kernel proc filesystem](https://www.kernel.org/doc/html/latest/filesystems/proc.html), [hwmon interface](https://www.kernel.org/doc/html/latest/hwmon/sysfs-interface.html), [WSL networking](https://learn.microsoft.com/windows/wsl/networking), [NVIDIA WSL limitations](https://docs.nvidia.com/cuda/wsl-user-guide/index.html).
