# Agent deployment runbook

Deploy from a Windows 10/11 x64 or glibc Linux checkout, or use the matching release package. Paths below are relative to the repository root unless a downloaded package is specified. Use the user's actual installation paths and LAN address; `192.168.1.20` is an example only. Do not log or publish pairing strings.

## Linux deployment

1. Inspect `uname -m`, `/etc/os-release`, `ip -4 address`, `ip route`, the intended port with `ss -ltn`, and any existing `systemctl --user status deskpulse.service`. Select x64 or ARM64 and a real reachable private address. Reuse the existing state; do not interrupt an unrelated listener.
2. Download the matching v0.2.0 tarball and `SHA256SUMS.txt` from [Releases](https://github.com/chzhangtud/DeskPulse/releases/tag/v0.2.0), verify its entry with `sha256sum --check`, and extract into a separate empty folder. See the Linux runbook for distribution libraries. Build from source only if needed; never overwrite a running binary.
3. Run `./start-collector.sh --listen <private-ip> --port 9443` from the extracted folder in the foreground. Keep pairing output private. For an isolated test, use an unused loopback port and a temporary `--state` path; retain only that instance's process ID.
4. If LAN firewall configuration is requested, preview `./allow-lan.sh --listen <private-ip> --remote <phone-or-subnet> --backend ufw --dry-run`, then apply the scoped rule with sudo. Choose the host's existing firewall backend. Install/import the Android APK/setup file privately as in step 4 below.
5. When persistent startup is requested, stop the manual instance before `./install-service.sh --listen <private-ip>`. The service uses XDG state rather than the manual directory: follow the runbook's stopped-service migration procedure if already paired. Inspect the actual service status and private setup-file permissions. Do not enable lingering without including it in the requested deployment.
6. Verify advancing authenticated samples and the same certificate/token after restart. Run the archive/helper/integration checks below and the isolated real-service test when available. Phone acceptance remains a separate test; report any unavailable sensor or missing physical device. Use the runbook's service/manual upgrade and rollback paths while preserving original state.

Use [the Linux runbook](LINUX.md) for a glibc Linux host. Build with `bash scripts/linux/build.sh`; run `bash scripts/linux/start-collector.sh --listen 192.168.1.20` with the real private address. The Android app and pairing protocol are shared. Building requires .NET 8 SDK, Bash and Python 3; published packages need only OS runtime prerequisites. CPU temperature comes from read-only CPU hwmon/thermal interfaces, NVIDIA from the installed driver; do not install PawnIO on Linux.

Run `dotnet run --project tests/Collector.Tests -c Release`, `python3 tests/linux_helpers_test.py` and `DESKPULSE_COLLECTOR=/absolute/path/to/DeskPulse.Collector python3 tests/collector_integration.py`. Validate the tarball with `tests/linux_package_test.py`; run `tests/linux_service_test.py <archive>` when a user systemd manager is available. Install optional sign-in startup with `bash scripts/linux/install-service.sh --listen <private-ip>` only when deployment includes startup. Preserve the XDG state directory on upgrades; user service mode suppresses setup strings in the journal.

WSL metrics describe the Linux VM. WSL NAT does not establish phone LAN connectivity. Use isolated tests without changing Windows routing, WSL networking, firewall profiles, GPU drivers or the existing Windows collector. Report WSL hardware/phone limits explicitly. Follow the steps below for Windows hosts.

For packaging and publication, follow [the release checklist](RELEASING.md). A deployment does not by itself authorize publishing a release or pushing Git changes.

## 1. Discover the environment

```powershell
git status --short
dotnet --list-sdks
node --version
python --version
$env:ANDROID_HOME
$env:JAVA_HOME
```

Requirements: .NET 8 SDK, Node.js 18+ (22+ for WebView debugging), Python 3.10+ for integration tests, JDK 17+, Android SDK Platform 35 and Build-tools 35. Ensure `adb` is on PATH for USB installation. `Build.ps1` accepts `-AndroidSdk` and `-JavaHome`; otherwise it uses environment variables, the standard per-user SDK folder and Android Studio's standard bundled JDK.

Inspect any existing `DeskPulse-Collector` scheduled task and listener before deploying. Reuse a suitable running installation; do not start a second instance on the same port. If updating a running published directory, follow step 7 first. Do not change unrelated processes, network profiles or firewall rules.

## 2. Build and run isolated checks

```powershell
./scripts/Build.ps1
node --test tests/core.test.cjs tests/i18n.test.cjs tests/stocks.test.cjs
dotnet build collector -c Release
python tests/collector_integration.py
```

Stop after a failed command and fix the cause. The build script runs Android assemble/lint and Node tests, publishes the self-contained Windows collector, and creates an APK and Windows ZIP under ignored `artifacts/`. The integration test uses its own temporary state and loopback port.

For publication, use an updated .NET 8 SDK or pin an explicitly verified runtime patch: v0.2.0 packages use `./scripts/Build.ps1 -RuntimeVersion 8.0.32` on Windows and `DESKPULSE_RUNTIME_VERSION=8.0.32 bash scripts/linux/build.sh` on Linux. Check `DeskPulse.Collector.runtimeconfig.json` in each extracted package and run integration tests against those binaries. System runtime updates do not update a self-contained application. Android and collector project versions must match; the Windows build script checks this before packaging.

Confirm the ZIP includes licenses and contains no `state/`, `pairing.txt`, `clients.json`, certificate, log or private key. Keep the complete collector directory together. This is a debug APK; configuring a maintained public release signing identity is a separate release step.

## 3. Configure one private LAN listener

Determine the Windows adapter that can reach the intended phone. Start a manual collector with that address:

```powershell
./scripts/Start-Collector.ps1 -ListenAddress 192.168.1.20 -Port 9443
```

For unattended operation, launch the EXE with `Start-Process -WindowStyle Hidden`, redirecting output only to the ignored private state directory. Retain the process ID so cleanup only targets this instance. Do not expose setup strings in tool output or handoff notes.

Run the scoped firewall helper from an administrator PowerShell if LAN setup is part of the requested deployment:

```powershell
./scripts/Allow-Lan.ps1 -Program "$PWD/artifacts/collector/DeskPulse.Collector.exe" -LocalAddress 192.168.1.20 -Port 9443
```

The helper replaces only the named DeskPulse rule. A narrower `-RemoteAddress` can restrict it to the phone. No public port forwarding is needed.

## 4. Install and pair the phone

```powershell
adb devices
adb install -r artifacts/android/DeskPulse-0.2.0.apk
adb shell am start -W -n io.deskpulse.app/.MainActivity
```

Use the intended authorized device; when multiple devices are present, add `-s` with the chosen serial to each `adb` call. Keep device serials out of tracked files. If no authorized phone is connected, report that installation/pairing remains unverified; building alone is not deployment.

Privately transfer `artifacts/collector/state/pairing.txt` to the phone. Import it through **Settings → Connection → Import setup file**, then tap **Pair computer**. The native file picker or private paste requires phone interaction. Never commit the file or paste its contents into public logs. If expired/consumed, restart only the intended collector to issue another setup code. Existing enrolled phones keep working when state is preserved.

## 5. Optional CPU temperature and sign-in startup

Only install the optional driver or register persistent startup when included in the user's requested deployment. Both require administrator privileges.

```powershell
./scripts/Install-CpuSensor.ps1
./scripts/Register-CollectorStartup.ps1 -ListenAddress 192.168.1.20 -Port 9443
Get-ScheduledTask -TaskName DeskPulse-Collector
```

The sensor script verifies the pinned signed PawnIO installer. Restart the collector elevated with its existing state. Never disable Windows driver protections. The startup task starts a hidden supervisor 15 seconds after the current user signs in, adopts a matching existing collector and restarts it after exit. It is not a pre-login service.

## 6. Acceptance and handoff

Verify on the phone: paired state, advancing genuine telemetry, CPU/RAM ranking switch, language/theme persistence, and independent information mode. Missing sensors must show unavailable, with an actionable reason where possible. Validate CPU temperature only if installed/enabled. For automatic startup, check the actual task state and intended listener; do not claim reboot validation without a reboot test.

The completed handoff should name build paths, test results, manual vs scheduled startup, sensor limitations and any remaining phone actions. Keep real IPs, hostnames, device identifiers, pairing strings and personal paths out of tracked reports and public screenshots.

Full outage tests in `tests/device-lan.cjs` deliberately stop the collector and toggle phone Wi-Fi. Use only a dedicated test setup with appropriate authorization; follow the test prerequisites in `docs/INSTALL.md`.

## 7. Upgrade without losing pairing

The supervisor may restart a stopped collector, so stop both before replacing binaries. In an administrator PowerShell:

```powershell
Stop-ScheduledTask -TaskName DeskPulse-Collector
$collectorMaintenancePid = [int](Get-Content ./artifacts/collector/state/collector.pid)
$collectorMaintenanceProcess = Get-Process -Id $collectorMaintenancePid -ErrorAction SilentlyContinue
$collectorMaintenanceExe = (Resolve-Path ./artifacts/collector/DeskPulse.Collector.exe).Path
if ($collectorMaintenanceProcess -and $collectorMaintenanceProcess.Path -eq $collectorMaintenanceExe) {
    Stop-Process -Id $collectorMaintenancePid
}
./scripts/Build.ps1
if ($LASTEXITCODE -ne 0) { throw 'Build failed; inspect the build output before restarting.' }
Start-ScheduledTask -TaskName DeskPulse-Collector
```

If there is no registered task, stop only the manually launched collector instead. Preserve `state/` intact; back it up privately before an upgrade. `adb install -r` retains app data when the signing identity matches. A changed Android signing key requires a separate migration plan; do not uninstall and lose enrollment automatically. Re-register startup if installation paths/address/port change and update the firewall/phone accordingly.
