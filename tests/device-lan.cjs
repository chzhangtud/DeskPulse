// Destructive only to the test collector's runtime and the test phone's Wi-Fi state.
// Run after installing/pairing the debug APK and forwarding its DevTools socket to 9222.
// Does not use adb reverse: telemetry must traverse the real Wi-Fi/Ethernet LAN.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync, spawn } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const out = path.join(root, "artifacts/validation");
const pidFile = path.join(root, ".local/collector.pid");
const exe = path.join(root, "artifacts/collector/DeskPulse.Collector.exe");
const report = { startedAt: new Date().toISOString(), checks: [] };
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
function run(file, args) {
  return execFileSync(file, args, {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
  }).trim();
}
function evaluate(code) {
  return run(process.execPath, [path.join(__dirname, "webview.cjs"), code]);
}
function snapshot() {
  return JSON.parse(
    evaluate(
      "JSON.stringify({state,paired,paused,host:config.host,sequence:sample&&sample.sequence,age:lastFresh?Date.now()-lastFresh:null,weather:weather.city,headlines:news.items&&news.items.length,theme:document.body.className,lastError,weatherError,newsError})",
    ),
  );
}
function check(name, detail) {
  report.checks.push({ name, at: new Date().toISOString(), detail });
  console.log("PASS " + name, JSON.stringify(detail || {}));
  fs.writeFileSync(
    path.join(out, "device-lan.json"),
    JSON.stringify(report, null, 2),
  );
}
async function until(predicate, timeout = 12000) {
  const end = Date.now() + timeout;
  let s;
  do {
    s = snapshot();
    if (predicate(s)) return s;
    await delay(500);
  } while (Date.now() < end);
  throw Error("Timed out: " + JSON.stringify(s));
}
async function steadyLive(seconds) {
  const start = snapshot();
  for (let i = 0; i < seconds; i++) {
    await delay(1000);
    assert.equal(
      snapshot().state,
      "live",
      "Recovered connection must retain the 1 Hz cadence",
    );
  }
  assert.ok(snapshot().sequence > start.sequence);
}
function screenshot(name) {
  run("adb", ["shell", "screencap", "-p", "/sdcard/deskpulse-test.png"]);
  run("adb", [
    "pull",
    "/sdcard/deskpulse-test.png",
    path.join(out, name + ".png"),
  ]);
}
let child = null,
  stopped = false,
  wifiOff = false,
  originalSettings = "",
  originalHost = "",
  originalWeatherCity = "";
function restart() {
  const log = fs.openSync(path.join(root, ".local/device-collector.log"), "a");
  child = spawn(exe, ["--listen", originalHost], {
    cwd: path.dirname(exe),
    detached: true,
    windowsHide: true,
    stdio: ["ignore", log, log],
  });
  fs.closeSync(log);
  child.unref();
  fs.writeFileSync(pidFile, String(child.pid));
  stopped = false;
}
(async () => {
  fs.mkdirSync(out, { recursive: true });
  let s = await until((s) => s.state === "live" && !s.paused);
  originalHost = s.host;
  originalSettings = evaluate("JSON.stringify(settings)");
  assert.notEqual(s.host, "127.0.0.1");
  originalWeatherCity = s.weather;
  assert.ok(originalWeatherCity, "The test phone needs cached weather");
  assert.ok(s.headlines > 0);
  const seq = s.sequence;
  await delay(2200);
  s = snapshot();
  assert.ok(s.sequence > seq);
  check("real LAN samples advance", s);
  screenshot("live-night");
  evaluate(
    "settings.memoryWarning=1;settings.memoryCritical=99;settings.sustain=0;health.states.clear();renderMonitor();",
  );
  assert.match(
    evaluate("document.getElementById('memoryCard').className"),
    /warning/,
  );
  screenshot("memory-warning");
  evaluate("settings.memoryCritical=2;health.states.clear();renderMonitor();");
  assert.match(
    evaluate("document.getElementById('memoryCard').className"),
    /critical/,
  );
  screenshot("memory-critical");
  check("real readings use configured sustained health rules");
  evaluate(
    "settings=" +
      originalSettings +
      ";health.states.clear();persist();renderMonitor();",
  );
  evaluate("settings.theme='day';applyAppearance();");
  screenshot("live-day");
  evaluate("settings=" + originalSettings + ";applyAppearance();");
  evaluate(
    "const wrongPin=Object.assign({version:1,secret:'not-a-real-secret'},config,{fingerprint:'0'.repeat(64)});native.pair('deskpulse:'+btoa(JSON.stringify(wrongPin))); ",
  );
  await delay(3500);
  assert.match(
    evaluate("document.getElementById('pairStatus').textContent"),
    /TLS verification failed/,
  );
  assert.equal(snapshot().paired, true);
  check("Android rejects a mismatched TLS certificate before enrollment");
  evaluate(
    "showSettings();document.getElementById('hostInput').value='127.0.0.1';document.getElementById('settingsForm').dispatchEvent(new Event('submit',{cancelable:true}));",
  );
  s = await until((s) => s.state === "unreachable");
  check("wrong host reports unreachable", s);
  evaluate(
    "showSettings();document.getElementById('hostInput').value=" +
      JSON.stringify(originalHost) +
      ";document.getElementById('settingsForm').dispatchEvent(new Event('submit',{cancelable:true}));",
  );
  await until((s) => s.state === "live");
  check("editable host recovers without re-pairing");
  evaluate(
    "native.refreshInfo('DeskPulseNoSuchCity_778899','https://invalid.invalid/rss');",
  );
  s = await until((s) => s.weatherError && s.newsError, 22000);
  assert.equal(s.state, "live");
  assert.equal(s.weather, originalWeatherCity);
  assert.ok(s.headlines > 0);
  check("internet source failures retain cache and LAN telemetry", s);
  evaluate("native.refreshInfo(settings.city,settings.feed);");
  const pid = Number(fs.readFileSync(pidFile, "utf8").trim());
  assert.ok(Number.isInteger(pid) && pid > 0);
  const processName = run("powershell.exe", [
    "-NoProfile",
    "-Command",
    `(Get-Process -Id ${pid}).ProcessName`,
  ]);
  assert.equal(processName, "DeskPulse.Collector");
  process.kill(pid);
  stopped = true;
  s = await until((s) => s.state === "stale", 11000);
  screenshot("stale-night");
  check("collector stop becomes stale after five seconds", s);
  s = await until((s) => s.state === "unreachable", 18000);
  screenshot("unreachable-night");
  assert.equal(s.weather, originalWeatherCity);
  assert.ok(s.headlines > 0);
  check("fifteen-second outage uses independent cached information", s);
  restart();
  s = await until((s) => s.state === "live", 37000);
  await steadyLive(12);
  check(
    "collector restart automatically recovers and stays live with persisted credentials",
    s,
  );
  run("adb", ["shell", "svc", "wifi", "disable"]);
  wifiOff = true;
  s = await until((s) => s.state === "unreachable", 22000);
  screenshot("wifi-disconnected");
  assert.ok(s.headlines > 0);
  check("actual Wi-Fi loss preserves cached information", s);
  run("adb", ["shell", "svc", "wifi", "enable"]);
  wifiOff = false;
  s = await until((s) => s.state === "live", 50000);
  await steadyLive(35);
  check("actual Wi-Fi recovery reconnects and retains the 1 Hz cadence", s);
  evaluate(
    "settings=" +
      originalSettings +
      ";persist();forceInfo=false;updateConnection();",
  );
  check("final app remains live in the requested theme", snapshot());
  screenshot("final-live");
  report.completedAt = new Date().toISOString();
  fs.writeFileSync(
    path.join(out, "device-lan.json"),
    JSON.stringify(report, null, 2),
  );
})()
  .catch((e) => {
    report.error = String(e.stack || e);
    fs.writeFileSync(
      path.join(out, "device-lan.json"),
      JSON.stringify(report, null, 2),
    );
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => {
    if (wifiOff) run("adb", ["shell", "svc", "wifi", "enable"]);
    if (stopped) restart();
    if (originalSettings) {
      try {
        evaluate(
          "if(config.host!==" + JSON.stringify(originalHost) + "){native.updateHost(" + JSON.stringify(originalHost) + ");config.host=" + JSON.stringify(originalHost) + ";lastFresh=0;sample=null;lastSequence=null;lastSampleTime=null;nextPoll=0;}settings=" + originalSettings + ";persist();"
        );
      } catch {}
    }
  });
