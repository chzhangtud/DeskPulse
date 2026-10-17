# Agent instructions

DeskPulse is a Windows .NET 8 collector and an Android 10+ Java/WebView display.

Read `docs/AGENT_DEPLOY.md` before deploying. Read `docs/ARCHITECTURE.md` before changing pairing or telemetry.

## Checks

```powershell
node --test tests/core.test.cjs tests/i18n.test.cjs tests/stocks.test.cjs
dotnet build collector -c Release
python tests/collector_integration.py
./android/gradlew.bat -p android assembleDebug lintDebug
```

- Keep `state/`, pairing strings, certificates, tokens, local paths, device identifiers, screenshots with real host information, and internal plans out of Git.
- Preserve existing certificate/client state on upgrades. Stop a scheduled supervisor and its collector child before overwriting the running binaries.
- Use example data for public screenshots and label it as such. Runtime failures must remain unavailable/stale, never fabricated live data.
- Keep third-party copyright notices and licenses intact.
- Never run `git push` unless the user explicitly requests a push in the current conversation. Staging, committing and creating branches do not authorize a push.
