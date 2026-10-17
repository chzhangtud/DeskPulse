// Inspect our debug WebView over an ADB-forwarded DevTools socket.
// Usage: adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>
//        node tests/webview.cjs "JSON.stringify({state,paired})"
const expression =
  process.argv[2] ||
  "JSON.stringify({state,paired,host:config.host,sequence:sample&&sample.sequence,errors:[lastError,weatherError,newsError],size:[innerWidth,innerHeight]})";
(async () => {
  const targets = await (await fetch("http://127.0.0.1:9222/json")).json();
  const target = targets.find((t) =>
    t.url.startsWith("https://app.deskpulse.local/"),
  );
  if (!target) throw Error("DeskPulse WebView target not found");
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  const timer = setTimeout(() => {
    console.error("DevTools timeout");
    process.exit(1);
  }, 15000);
  const ready = () =>
    ws.send(
      JSON.stringify({
        id: 0,
        method: "Runtime.evaluate",
        params: {
          expression:
            "document.readyState==='complete'&&typeof window.nativeEvent==='function'",
          returnByValue: true,
        },
      }),
    );
  ws.onopen = ready;
  ws.onmessage = (e) => {
    const result = JSON.parse(e.data);
    if (result.id === 0) {
      if (result.result.result.value)
        ws.send(
          JSON.stringify({
            id: 1,
            method: "Runtime.evaluate",
            params: { expression, returnByValue: true, awaitPromise: true },
          }),
        );
      else setTimeout(ready, 200);
      return;
    }
    if (result.id !== 1) return;
    if (result.result.exceptionDetails) {
      console.error(result.result.exceptionDetails);
      process.exitCode = 1;
    } else console.log(result.result.result.value);
    clearTimeout(timer);
    ws.close();
  };
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
