# Installation and operation

The Android display can pair with a Windows or Linux collector. This page covers Windows and shared Android settings; see [Linux installation, sensors and systemd](LINUX.md) for Linux/WSL. Download the matching v0.2.0 packages from [GitHub Releases](https://github.com/chzhangtud/DeskPulse/releases/tag/v0.2.0). The previous v0.1.0 Android APK also uses the same pairing protocol.

## Windows collector

Use Windows 10/11 x64. Build with `scripts/Build.ps1`, or use the prepared `artifacts/collector` directory. Do not copy only the EXE: the runtime and application DLLs next to it are required.

```powershell
./artifacts/collector/DeskPulse.Collector.exe
# Override automatic LAN selection when there are multiple adapters:
./artifacts/collector/DeskPulse.Collector.exe --listen 192.168.1.20 --port 9443
```

The console prints the listener address, certificate fingerprint and setup file location. Keep the process running; Ctrl+C stops a manually launched copy. Start-Collector.ps1 is a convenience wrapper. Optional sign-in startup is described below.

The default private state directory is `state` beside the published executable. Use `--state` with a private directory of your choice to override it. Retain this directory across upgrades to preserve the certificate and paired phones. Do not commit it, send it with bug reports, or put it in a public shared folder.

## Start automatically after Windows sign-in

In an administrator PowerShell, register the prepared collector for the current user, substituting its actual private LAN address:

```powershell
./scripts/Register-CollectorStartup.ps1 -ListenAddress 192.168.1.20
Get-ScheduledTask -TaskName DeskPulse-Collector
```

The `DeskPulse-Collector` task runs hidden 15 seconds after this user signs in, with the highest available privileges for CPU sensors. It stores no account password. The supervisor waits for the configured LAN address, adopts an existing matching listener, and restarts the collector after an exit. Logs and its current PID are under the existing private `state` directory. This is sign-in startup; it does not run before a user logs in.

For maintenance, stop the supervisor **and** its collector child from an administrator PowerShell before replacing binaries. `Stop-ScheduledTask` alone leaves the collector child running:

```powershell
Stop-ScheduledTask -TaskName DeskPulse-Collector
$collectorMaintenancePid = [int](Get-Content ./artifacts/collector/state/collector.pid)
$collectorMaintenanceProcess = Get-Process -Id $collectorMaintenancePid -ErrorAction SilentlyContinue
$collectorMaintenanceExe = (Resolve-Path ./artifacts/collector/DeskPulse.Collector.exe).Path
if ($collectorMaintenanceProcess -and $collectorMaintenanceProcess.Path -eq $collectorMaintenanceExe) {
    Stop-Process -Id $collectorMaintenancePid
}
# Build/copy updated files while retaining state, then:
Start-ScheduledTask -TaskName DeskPulse-Collector
```

To disable future sign-in startup use `Disable-ScheduledTask -TaskName DeskPulse-Collector`; stop both processes as above if you also want to stop the current session. To remove registration use `Unregister-ScheduledTask -TaskName DeskPulse-Collector -Confirm:$false` after stopping it. Keep the executable and watcher paths stable; re-register after moving them. Address changes also require updating the phone and firewall rule.

## Scoped firewall access

Run this once from an administrator PowerShell, replacing the address with the actual printed LAN address:

```powershell
./scripts/Allow-Lan.ps1 -Program "$PWD\artifacts\collector\DeskPulse.Collector.exe" -LocalAddress 192.168.1.20
```

The rule allows only that executable, one local address, one TCP port and clients on the local subnet. It works on a home connection currently classified Public without changing that connection's security profile. It does not disable Windows Firewall. Changing the program location/address/port requires updating the rule. The optional `-RemoteAddress` can narrow access to a specific intended phone address.

Remove the application rule later with administrator PowerShell:

```powershell
Remove-NetFirewallRule -Name DeskPulse-LAN-9443
```

Never configure router port forwarding for this service. Guest Wi-Fi/client isolation, multiple routers and VPN routing can prevent LAN connectivity even if both devices have Internet access. A PC on Ethernet and phone on Wi-Fi work normally when the router permits the route. A router DHCP reservation can stabilize the PC address.

## Android installation and pairing

Use Android 10/API 29 or newer. The APK has no native ABI restriction. Allow installing this locally built APK from your chosen file manager if Android prompts. It needs Internet/network permissions, but no location, camera or general storage permission.

For an attached USB-debugging phone:

```powershell
adb install -r artifacts/android/DeskPulse-0.2.0.apk
adb shell am start -W -n io.deskpulse.app/.MainActivity
```

Import `pairing.txt` through **Settings → Connection → Import setup file**, or paste the `deskpulse:` string. Tap **Pair computer**. The setup code is single use and expires ten minutes after collector startup. Restart the collector to obtain a new code when enrolling another phone or retrying an expired enrollment. Existing phones retain their access across restarts.

The certificate fingerprint in this setup file is the identity trusted by the phone. Transfer it privately, for example through an already trusted USB file transfer. A certificate mismatch fails before credentials are transmitted. Correct the phone clock if certificate validation reports a validity problem. Do not accept arbitrary certificates in a browser to work around an error.

After pairing, the host field remains editable without discarding the pinned identity. Moving to a different computer requires importing that computer's setup code. If a token is revoked, import a new code. Reset all credentials by stopping the collector, deleting its `clients.json`, and restarting. Deleting its certificate additionally invalidates every phone's pinned identity.

## Display and information settings

- Default: English, fixed night, deep navy/cyan, backing 86%, image dimming 30%, London weather. **Settings → Appearance → Language** switches to Simplified Chinese and retains the choice across restarts. Publisher headlines, host names, process names and hardware models keep their original text. Day and schedule remain selectable, using editable 24-hour times; defaults: day 07:00, night 19:00, phone-local timezone.
- The full-screen app hides system bars, restores immersion after dialogs/app switches, and keeps the display awake while foreground. Android still permits intentional system gestures to reveal navigation temporarily; bars hide again. This is normal immersive mode, not device-owner kiosk lockdown.
- The compact top bar combines host, live status, last update, clock, Info and Settings. Wallpaper controls are under **Settings → Appearance**, leaving the full area below the top bar for monitoring. **Info** switches to the clock/weather/news view.
- **Active processes → CPU ↓ / RAM ↓** selects the five accessible processes with the highest CPU use or physical working set, descending. Both rankings are computed over all accessible processes on Windows. The choice is retained. An older collector without the global RAM ranking displays an explicit update requirement.
- Hardware names first use the remaining row width. Labels that still overflow scroll slowly without resetting every sample. Reduced-motion mode disables animation and permits manual horizontal scrolling; full text is also exposed as the label title. Button presses use short opacity/icon feedback with no browser tap rectangle.
- Choose a phone-local wallpaper folder through the Android picker. JPEG, PNG and WebP immediate children are supported. Subfolders are excluded. Rotation defaults to five minutes; previous/next, shuffle, pin, fitting and focal position are independent of connection/theme. **Use built-in background** releases folder access and restores the smooth gradient. No grid texture is included.
- The app decodes near display size and caches one bounded image. Select the folder again after adding files if an immediate rescan is needed. Deleted/corrupt images are skipped. Revoked/empty folders fall back with a notice.
- The information page has clock/weather on the left, daily US stocks in the middle and the original Ars Technica feed on the right. Source/Stocks headings share size/baseline and align with column content. Both lists scroll independently. Indicators show during scrolling, wait 650ms after the last event, then fade over 650ms; reduced motion disables the fade. Monitor/Info reserves a fixed width, keeping the clock stationary. Connection, host and freshness occupy one top-bar row. Narrow screens and large text stack the columns.
- Stock category/range are compact dropdowns on one heading row. Semiconductors start with NVIDIA, AMD, Arm and Qualcomm, followed by TSMC, Broadcom, Intel, Micron, ASML and Applied Materials. Tech adds Apple, Microsoft, Alphabet, Amazon, Meta and Oracle; Other adds Tesla, Netflix, Costco, JPMorgan Chase, ExxonMobil and Coca-Cola. Category/range persist across restarts.
- Daily ranges offer 5/10 trading days and 1/3/6 calendar months. A fresh installation requests 13 bars to cover ten trading days plus the prior-close baseline; longer ranges fetch when selected. Prices are unadjusted USD daily closes. Percentages compare the latest close against the close immediately before the selected period, excluding dividends. Sparklines also follow the range. English uses standard green up/red down; Chinese uses red up/green down, with arrows/signs.
- Stocks use direct HTTPS to Eastmoney with Tencent Finance fallback, without proxy/account/API key. Only completed US sessions are retained, conservatively after 16:30 New York time; weekends roll back to Friday. Successful data is cached by cutoff date/history capacity. Repeated views reuse it; extending history can request additional bars. Holidays retain the last actual session date. Failure retains cached prices, marks affected rows and backs off an hour. Public endpoints can change independently of the app.
- Weather and the configurable RSS/Atom feed refresh directly from the phone every 15 minutes, even without the PC. Settings → Information edits the city/feed. Weather displays eight forecast hours. News retains up to 20 HTTPS headlines and opens original articles in the system browser. Successful caches survive failures/restarts. No internet/cache produces unavailable rather than fabricated data.
- Memory, CPU/GPU temperature and disk-free limits are editable. Low disk free space reverses severity direction. Sustained duration and recovery margin apply; load and traffic alone do not create alerts. Temperature defaults are provisional and should match your hardware. Fans and non-NVIDIA GPU telemetry are currently unavailable.

## Optional CPU temperature

CPU die/package temperature uses LibreHardwareMonitor 0.9.6 with the normal signed PawnIO driver. In an administrator PowerShell run:

```powershell
./scripts/Install-CpuSensor.ps1
```

The prepared collector folder also includes this script. It downloads only the official pinned PawnIO 2.2.0 installer, verifies its hash and valid publisher signature, then installs it. No reboot is normally required. Restart `DeskPulse.Collector.exe` **as administrator** after setup. Keep the existing `state` directory so the phone stays paired. The install script is optional and never runs during a normal build or collector startup.

Temperature is sampled independently every two seconds. Package/die readings are preferred; the hottest accessible CPU temperature is the fallback. Exact sensor identity appears in capability metadata and the CPU label's tooltip. Readings older than ten seconds are suppressed. Missing driver or privilege is shown on the CPU card and under **Settings → Health rules**; other telemetry continues. CPU warning/critical defaults are 85/95°C and can be changed for the installed processor. These are display rules, not CPU protection settings.

To remove the optional driver, use Windows **Installed apps → PawnIO → Uninstall**. Do not disable Windows driver protection, Secure Boot or antivirus to obtain sensor readings.

## Tests

```powershell
node --test tests/core.test.cjs tests/i18n.test.cjs tests/stocks.test.cjs
python tests/collector_integration.py
./android/gradlew.bat -p android assembleDebug lintDebug
```

Collector tests start an isolated loopback collector with temporary state and check authentication, single-use pairing, certificate fingerprint, genuine samples and persisted token hashes. They do not consume the phone's enrollment secret.

For an already paired attached debug phone, open the app, get its PID, and forward its WebView DevTools socket (debugging only; this is not telemetry forwarding):

```powershell
$appProcessId = (adb shell pidof io.deskpulse.app).Trim()
adb forward tcp:9222 "localabstract:webview_devtools_remote_$appProcessId"
node tests/webview.cjs
node tests/device-lan.cjs
```

`device-lan.cjs` expects this repo's published collector to be running, with its PID in `.local/collector.pid` and retained state beside the executable. It temporarily stops/restarts that collector, changes/restores app test settings, and disables/re-enables the phone's Wi-Fi. It verifies actual LAN recovery, TLS rejection, incorrect addresses, severity appearance, independent caching and screenshots. Do not run it during unrelated work on the test phone. For an installation using automatic startup, first stop the scheduled supervisor and run the test with privileges sufficient to stop its elevated collector; otherwise automatic recovery interferes with deliberate outage checks. Restore the scheduled task afterward. The suite leaves a manually started collector running and restores settings/Wi-Fi.

The wallpaper fixture generator requires Pillow and creates only local test files; Pillow is not needed by the app or collector. No emulator is needed.
