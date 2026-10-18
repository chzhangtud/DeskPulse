# Linux collector

[简体中文](LINUX.zh-CN.md)

The Linux collector uses the same certificate-pinned HTTPS API and pairing protocol as Windows. The existing Android app supports both. Monitoring, process rankings, health rules, theme/language/wallpaper settings, automatic reconnect, and the independent weather/news/stock display remain available.

## Download and install

[Download v0.2.0](https://github.com/chzhangtud/DeskPulse/releases/tag/v0.2.0), including the Android APK and `SHA256SUMS.txt`. This is a tarball installation, without a deb/rpm package or system-wide installer.

| `uname -m` | Release archive | Validation scope |
| --- | --- | --- |
| `x86_64` | `DeskPulse-0.2.0-linux-x64.tar.gz` | Published executable, authentication and user service exercised in Ubuntu 24.04 WSL |
| `aarch64` / `arm64` | `DeskPulse-0.2.0-linux-arm64.tar.gz` | Cross-built; ELF architecture, contents and permissions checked; no ARM64 runtime test |

Use a glibc distribution with .NET 8 OS prerequisites, such as Ubuntu 22.04/24.04 or Debian 12. The packages include .NET and ASP.NET Core, so running the collector needs no SDK, Python or root. Bash is used by the launch helper; Python 3 is needed only by the optional firewall/service helpers. Alpine/musl, 32-bit ARM and 32-bit x86 are not supported by these archives. Other distributions require their equivalent libraries and have not been individually exercised.

For Ubuntu 24.04, the OS libraries can be installed with:

```bash
sudo apt-get update
sudo apt-get install ca-certificates libc6 libgcc-s1 libgssapi-krb5-2 libicu74 libssl3t64 libstdc++6 tzdata zlib1g
# Optional, for install-service.sh and allow-lan.sh:
sudo apt-get install python3
```

Ubuntu 22.04 uses `libicu70` / `libssl3`; Debian 12 uses `libicu72` / `libssl3`. Confirm the dependencies for your distribution in Microsoft's [Ubuntu](https://learn.microsoft.com/en-us/dotnet/core/install/linux-ubuntu-install#dependencies) or [Debian](https://learn.microsoft.com/en-us/dotnet/core/install/linux-debian#dependencies) documentation. Self-contained .NET does not bundle these OS libraries.

From the folder containing your downloaded archive and checksum manifest:

```bash
# Verify only the downloaded asset; the manifest also lists other platforms.
grep '  DeskPulse-0.2.0-linux-x64.tar.gz$' SHA256SUMS.txt | sha256sum --check --strict
mkdir -p "$HOME/Applications/DeskPulse-0.2.0"
tar -xzf DeskPulse-0.2.0-linux-x64.tar.gz -C "$HOME/Applications/DeskPulse-0.2.0"
cd "$HOME/Applications/DeskPulse-0.2.0"
./start-collector.sh --listen 192.168.1.20 --port 9443
```

Substitute `linux-arm64` throughout for ARM64. Use an empty install directory and retain all runtime DLLs, native libraries and licenses together. Find the intended interface using `ip -4 address` and `ip route`; replace the example address with the host's reachable RFC1918 IPv4 address, rather than a Docker/VPN-only address. A DHCP reservation helps keep it stable. Keep the foreground terminal open; Ctrl+C stops this instance. Use a local filesystem that allows executable files.

Transfer the generated `state/pairing.txt` privately to the phone, import it in **Settings → Connection**, and pair within ten minutes. A setup code is single use. Existing phones retain access after restarts and upgrades when the state directory is preserved. `--state /private/directory` overrides the default beside the executable. Linux state directories use mode 0700 and credential files 0600. Never publish these files, logs, host identifiers or actual screenshots.

Install the APK on Android 10+ and allow installation from the source you used to transfer it. The preview APK is development-signed. The phone and host must have a permitted route to each other; guest Wi-Fi/client isolation can prevent pairing. Match the certificate through the imported setup file; do not bypass TLS pinning or expose the service publicly. Public `/health` requests disclose the host name and are not an authentication or pairing acceptance test.

## Build from source

Clone the repository and run these commands at its root. Building requires Git, .NET 8 SDK, Python 3 and Bash; obtain the SDK using your distribution's official .NET instructions. Android compilation is a separate build and is unnecessary when using the release APK.

```bash
bash scripts/linux/build.sh               # native x64 or ARM64 target
# Cross-publish explicitly if needed; this does not execute ARM64 on x64:
# bash scripts/linux/build.sh linux-arm64
bash scripts/linux/start-collector.sh --listen 192.168.1.20 --port 9443
```

Outputs are `artifacts/linux-x64/` or `artifacts/linux-arm64/` and the versioned tarball under `artifacts/`. A source launch stores private state inside that publish directory by default. Run builds in a separate checkout/output from a running installation, then upgrade it using the procedure below. Linux builds exclude Windows sensor drivers and LibreHardwareMonitor.

Release v0.2.0 bundles .NET / ASP.NET Core 8.0.32. Self-contained runtimes update when the application package is replaced; installing a newer system runtime does not update these bundled files. For release builds, use an updated .NET 8 SDK or select a verified patch explicitly with `DESKPULSE_RUNTIME_VERSION=8.0.32 bash scripts/linux/build.sh`. Re-run package and runtime tests after changing it.

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

For rollback, stop the service and re-run the installer from the saved previous version's directory, keeping the same XDG state. Keep a private pre-upgrade state backup until the upgrade is verified; do not roll back by deleting the active state or re-pairing every phone.

For a manual installation, stop its collector, privately back up `state/`, extract the new version into a separate directory, and start with `./start-collector.sh --listen <private-ip> --state /absolute/path/to/previous/state`. Do not delete the previous state or generate a replacement certificate if retaining enrollment. Update the phone endpoint and firewall when the address/port changes. On Android use an in-place APK update with the same signing key; uninstalling clears enrollment.

## Troubleshooting

| Symptom | Check / action |
| --- | --- |
| `Exec format error` | Match `uname -m` to the x64/ARM64 archive; ARM64 cannot run natively on x64. |
| Executable exists but reports `No such file or directory` | Check glibc and the ELF loader for the selected architecture; these archives do not run on musl/Alpine. |
| ICU/OpenSSL/library error at startup | Install the distribution's .NET 8 OS prerequisites above; do not download arbitrary replacement libraries. |
| `Permission denied` | Extract on an executable local filesystem. Tar preserves 0755 executable modes; a `noexec` mount still prevents launch. |
| Cannot bind / address already in use | Confirm the address exists in `ip -4 address`; inspect `ss -ltn '( sport = :9443 )'`. Stop only your intended older collector or choose a free port. |
| Phone times out | Check LAN address, routing, guest Wi-Fi isolation, scoped firewall and port. WSL NAT needs separate networking setup. A local loopback test cannot establish phone reachability. |
| Pairing rejected / certificate changed | Use the current unconsumed private setup file within ten minutes. If already enrolled, restore the original state instead of bypassing pinning; restart only this collector to issue a fresh setup code. |
| CPU temperature / NVIDIA is unavailable | Check readable CPU hwmon/thermal sensors or `nvidia-smi` as the service user. VMs and some drivers do not expose these counters. Never substitute GPU temperature for CPU. |
| `systemctl --user` cannot connect | Use a real user session with a systemd user manager. A root shell, container or WSL session without systemd may lack one. Run in the foreground if unavailable. |
| Service restarts repeatedly | Use `systemctl --user status deskpulse.service` and `journalctl --user -u deskpulse.service -n 50 --no-pager`; check address, dependencies and executable path. Redact host paths/names before sharing logs. |

There is no Linux GUI or tray application: the Android app is the display. Optional systemd installation runs in the current user's account; process visibility and sensor permissions are limited to that account.

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
bash scripts/linux/build.sh
python3 tests/linux_helpers_test.py
python3 tests/linux_package_test.py artifacts/DeskPulse-0.2.0-linux-x64.tar.gz
# Requires a real systemd user manager and a private interface; creates its own temporary unit:
python3 tests/linux_service_test.py artifacts/DeskPulse-0.2.0-linux-x64.tar.gz
```

Fixture tests cover Linux counter resets, guest accounting, memory units, mount filtering, sensor identity/fallback and NVIDIA missing values. Real integration tests check TLS pinning, one-use pairing, authentication, genuine advancing samples, CPU/RAM rankings, private permissions, and persisted certificate/token access across restart. Tests never consume an existing phone's enrollment code.

References: [kernel proc filesystem](https://www.kernel.org/doc/html/latest/filesystems/proc.html), [hwmon interface](https://www.kernel.org/doc/html/latest/hwmon/sysfs-interface.html), [WSL networking](https://learn.microsoft.com/windows/wsl/networking), [NVIDIA WSL limitations](https://docs.nvidia.com/cuda/wsl-user-guide/index.html).
