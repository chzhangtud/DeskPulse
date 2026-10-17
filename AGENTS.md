# Agent instructions

DeskPulse is a Windows/Linux .NET 8 collector and an Android 10+ Java/WebView display.

Read `docs/AGENT_DEPLOY.md` before deploying. Read `docs/ARCHITECTURE.md` before changing pairing or telemetry.
Linux setup, sensors, systemd and WSL limitations are in `docs/LINUX.md`. Platform providers live under `collector/Platforms/`; preserve the shared schema and Android compatibility.

## Checks

```powershell
node --test tests/core.test.cjs tests/i18n.test.cjs tests/stocks.test.cjs
dotnet run --project tests/Collector.Tests -c Release
dotnet build collector -c Release
python tests/collector_integration.py
./android/gradlew.bat -p android assembleDebug lintDebug
```

On Linux also run `bash scripts/linux/build.sh`, `python3 tests/linux_helpers_test.py` and `python3 tests/linux_package_test.py artifacts/DeskPulse-0.1.0-linux-x64.tar.gz`. `tests/linux_service_test.py <archive>` checks an isolated real user service when a systemd user manager is available. Do not claim WSL loopback tests prove phone LAN connectivity or physical CPU temperature support.

- Keep `state/`, pairing strings, certificates, tokens, local paths, device identifiers, screenshots with real host information, and internal plans out of Git.
- Preserve existing certificate/client state on upgrades. Stop a scheduled supervisor and its collector child before overwriting the running binaries.
- Use example data for public screenshots and label it as such. Runtime failures must remain unavailable/stale, never fabricated live data.
- Keep third-party copyright notices and licenses intact.
- Never run `git push` unless the user explicitly requests a push in the current conversation. Staging, committing and creating branches do not authorize a push.
