# DeskPulse 0.1 architecture

DeskPulse combines a local Windows/Linux telemetry service with an immersive Android display. The phone also fetches weather, daily stocks and RSS headlines independently.

## Components

- **Windows:** .NET 8 / ASP.NET Core, one-second HTTP polling over pinned HTTPS. A self-contained win-x64 build needs no preinstalled runtime. One sampler serves all clients. HTTP was selected because the 1 Hz payload is small, reconnects are simple, and WebSockets add no required capability for this release.
- **Linux:** the same .NET host, schema, TLS, enrollment and sampler. `collector/Platforms/` isolates Windows counters/PawnIO from Linux procfs/sysfs. Linux publishes omit LibreHardwareMonitor and its Windows dependencies. Linux CPU/memory/uptime come from procfs; CPU temperature reads only CPU-labelled hwmon/thermal sensors. Process CPU/RSS and gateway-bearing NIC counters use .NET's OS implementations. Local mount parsing excludes pseudo/remote/bind filesystems. Optional per-user systemd startup suppresses pairing strings in the journal. See [Linux operations and WSL limits](LINUX.md).
- **Android:** Java, Android API 29+, native lifecycle/keystore/networking/system folder picker, and a locally bundled HTML/CSS/canvas display. No third-party Android runtime dependencies, Google Play Services or internet connection is needed for LAN monitoring. Older Android WebViews use the included replaceChildren compatibility helper and flex-gap spacing fallbacks.
- **Independent content:** direct phone-to-provider HTTPS requests, Open-Meteo weather and one configurable RSS/Atom feed, defaulting to Ars Technica. Weather/news refresh every 15 minutes on a separate bounded executor. Successful private caches carry source/date/failure state. Weather becomes stale at 30 minutes; news at 60 minutes. News parses up to 20 readable HTTPS entries and preserves reading position during routine refresh. The current layout is clock/weather on the left, daily US stocks in the middle and the original news source on the right. The local clock always works.
- **Daily stocks:** `StockData.java` has an independent two-worker executor, 22-symbol allowlist, explicit `Proxy.NO_PROXY`, normal platform TLS checks, disabled redirects, 8-second connect/read timeouts and a 500KB response cap. Eastmoney daily kline (`klt=101`, `fqt=0`) is primary; Tencent US daily data is fallback, consistently using unadjusted closes. Positive finite prices/calendar dates are validated; incomplete sessions are excluded. Private caches retain source/date/series/capacity per symbol. A completed-session cutoff uses New York 16:30 and skips weekends. Holiday responses retain the actual last session. Same-cutoff/sufficient-capacity reads reuse cache; longer histories are lazy; failures back off an hour. Concurrent shorter requests cannot overwrite larger same-day histories. Native bootstrap supplies cached histories without exposing credentials. No realtime quote polling or collector dependency is added.
- **Windows lifetime:** the optional current-user logon task starts a hidden elevated PowerShell supervisor after 15 seconds. It waits for the chosen private address, adopts a matching existing collector listener and restarts exited collectors. The task uses InteractiveToken/HighestAvailable, no stored password, IgnoreNew and no runtime limit. State and pairing remain beside the published executable. Stopping the task stops the supervisor; its collector child must also be stopped for upgrades.

## Trust and enrollment

The collector binds one explicit RFC1918 IPv4 address (automatic gateway-bearing physical adapter selection is available). Middleware rejects non-LAN clients. There is no public Internet listener, command endpoint, desktop streaming, CORS permission or port forwarding.

At first start the collector creates a private self-signed RSA certificate. Each start produces an enrollment secret with 192 bits of randomness, valid for ten minutes and one successful enrollment. `state/pairing.txt` contains the private host/port, exact SHA-256 certificate fingerprint and enrollment secret, encoded as a `deskpulse:` setup string. Transfer this file through a trusted channel. It is a credential, not encryption, and must not be published. A phone imports the file through the system picker or pastes the string.

The phone validates certificate expiration and the exact imported certificate hash **before** sending the enrollment secret. DNS resolution must produce a private IPv4 address. It does not trust arbitrary self-signed certificates. Redirects are disabled. Enrollment returns a 256-bit bearer token. The phone encrypts it using Android Keystore AES-GCM; backup and device transfer are excluded. Only token hashes are stored on the collector. A certificate change requires explicit re-enrollment. Copy the entire collector state folder when moving an existing installation.

Pairing is rate limited to ten attempts per minute. Request bodies are limited to 8 KiB. Samples require bearer authentication. Secrets and tokens are excluded from source control. Protect the collector state directory as carefully as other user data. To revoke every phone, stop the collector, delete `state/clients.json`, restart, and re-enroll intended phones. Stop the collector before editing or backing up state files.

The WebView serves only bundled assets from a synthetic HTTPS origin. It rejects external subresource requests and page navigation, disables file/content URL access and mixed content, and uses a restrictive CSP. Provider text is inserted through textContent. Original news links open in the system browser. Credentials are never exposed to JavaScript. Debug WebView inspection is enabled only for debug builds.

## Data contract and freshness

`GET /health` is an unauthenticated version/host probe. `POST /api/v1/pair` takes `{ "secret": "..." }`. `GET /api/v1/sample` requires `Authorization: Bearer ...` and returns `schemaVersion`, `sampleAgeMs` and `sample`.

Samples carry a monotonically increasing process-local sequence, UTC sampledAt, host, CPU percent, physical memory bytes/percent, download/upload **bytes per second**, fixed-disk available/total bytes, optional GPU readings and capability metadata. `processes` contains the five highest CPU processes; additive `processesByMemory` independently contains the five highest working sets across all accessible processes, with deterministic secondary ordering. The UI persists its selected CPU/RAM order; missing RAM data on older collectors produces an update message. Network metadata retains adapter aliases and adds stable English interface kinds for localized displays. A restart resets the sequence; timestamp plus sequence identifies a sample. Duplicate samples do not refresh freshness. Rates and CPU readings are null until their first delta exists. Unsupported and failed sensors are null, never synthetic zeroes.

Five seconds without fresh data marks displayed values stale and pauses live traces. Fifteen seconds switches to information mode. Live polling is once per second; unreachable mode retries every 30 seconds. A fresh valid sample restores monitoring automatically. At most 65 points / 60 seconds of history are retained. Host reconfiguration clears history; collector restarts are handled without re-pairing when state is retained. A timeout says unreachable, not powered off.

## Sensor scope

| Metric | Provider / limitation |
| --- | --- |
| CPU | Windows GetSystemTimes or Linux /proc/stat aggregate deltas; guest counters are not counted twice |
| Memory | Windows GlobalMemoryStatusEx or Linux MemTotal - MemAvailable; physical used/total |
| Network | Active physical Ethernet/Wi-Fi interfaces with a gateway; interface names included |
| Disk capacity | DriveInfo available/total; Windows fixed disks or Linux local mounts, excluding pseudo/remote/bind mounts |
| Processes | Accessible OS processes, CPU delta normalized to logical processor count; protected/exited processes skipped; PID reuse detected via process start time |
| GPU | Optional installed NVIDIA nvidia-smi, first reported GPU, every 3 seconds; 2-second process timeout |
| CPU temperature | Windows: LibreHardwareMonitor/PawnIO with elevation; Linux: CPU-labelled hwmon/thermal sysfs; every 2 seconds; readings older than 10 seconds suppressed |
| Fans, per-core counters, disk I/O | Explicitly unavailable in this release |
| AMD/Intel GPU sensors | Unavailable until a supported provider is added |

NVIDIA driver tooling is invoked locally and is not redistributed. Failed GPU acquisition clears its readings; a GPU sample older than ten seconds is suppressed. CPU hardware access runs in a separate background task and never on the HTTP request path or 1 Hz OS sampler. Missing driver/privilege yields null plus an actionable capability reason. CPU load and throughput are neutral activity measurements. Memory pressure, CPU/GPU temperature and low disk capacity have separate threshold directions, sustained durations and recovery margins. CPU defaults (85/95°C) and GPU defaults (80/88°C) are editable provisional limits, not universal hardware limits.

## Appearance and wallpapers

Text and traces remain opaque. Backing opacity and image dimming are independent. There is no blur, decorative animation or grid background. Day/night selection uses phone-local time; the editable 07:00/19:00 schedule supports crossing midnight and is re-evaluated on startup/resume. Fixed modes win.

English is the installation default; settings can persist Simplified Chinese. Bundled interface copy and native locale change together, while publisher content and machine identifiers retain their original text. Dates explicitly use the chosen locale and 24-hour times. Small opacity/icon transitions replace native browser tap highlights. Overflow labels use available width and a stable text track; only genuinely overflowing content scrolls. Sensor updates preserve label nodes, and reduced motion replaces automatic scrolling with manual horizontal access.

Stock categories/ranges persist with display preferences. Five/ten-day windows count actual trading observations; month windows use calendar cutoffs clamped at month ends. Percent changes use the close preceding the selected window. Insufficient cached history is marked, rather than presented as a complete longer-period return. Raw USD price changes exclude dividends. English uses standard green-up/red-down and Chinese red-up/green-down, with arrows/signs. Flexible charts are about 115px wide on the phone. Category and range dropdown widths follow their current labels. Source/Stocks headings and data-region starts share alignment. The fixed-width Monitor/Info action prevents clock movement. The single-line connection/host/freshness uses explicit margins compatible with Chromium 81, which lacks flex gap. Scroll indicators are non-interactive overlays, track list geometry and fade after scrolling. Provider text uses textContent, never HTML.

The Android system folder picker grants retained read access to a phone-local directory. Immediate children only, JPEG/PNG/WebP, at most 2,000 URI entries. Sequential/shuffled previous/next, pin, interval, cover/contain and horizontal focal position are supported. Images decode to a maximum dimension of 2048 pixels and replace one cached JPEG; the original folder is never copied in full. Invalid/deleted images are skipped. Empty, unreadable or revoked folders fall back with a notice. The built-in-background button releases access and clears the image cache. Cached wallpaper and pinned selection survive collector loss and app restarts. Select the folder again to rescan additions immediately. Rotation has no crossfade in 0.1 to avoid holding another full-size bitmap.

## Delivery scope

This is a directly installable local debug build, not a store-signed public release. Store publishing, QR/discovery, a pre-login Windows service, arbitrary desktop wallpaper synchronization, non-NVIDIA GPU providers, and extended unattended resource qualification are not part of this delivery. Optional current-user sign-in startup uses a scheduled task. See INSTALL.md for setup and maintenance.

References: [Android WebView](https://developer.android.com/develop/ui/views/layout/webapps/webview), [Open-Meteo](https://open-meteo.com/en/docs), [Arm visual reference](https://www.arm.com/).
