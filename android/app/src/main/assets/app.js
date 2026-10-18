"use strict";
// Chromium 81 on the first Android 10 device predates Element.replaceChildren.
if (!Element.prototype.replaceChildren)
  Element.prototype.replaceChildren = function () {
    while (this.firstChild) this.removeChild(this.firstChild);
    for (const child of arguments) this.append(child);
  };
const $ = (id) => document.getElementById(id),
  C = DeskPulseCore;
const native = typeof Native !== "undefined" ? Native : null;
let boot = {};
try {
  boot = native ? JSON.parse(native.bootstrap()) : {};
} catch (_) {}
let settings = Object.assign({}, C.defaults, boot.settings || {});
if (C.validate(settings)) settings = Object.assign({}, C.defaults);
const I = DeskPulseI18n,
  translateStatic = I.capture(document.body);
const tr = (value) => I.translate(value, settings.language);
let activeLanguage = null;
let paired = !!boot.paired,
  config = boot.config || {},
  sample = null,
  lastFresh = 0,
  lastSequence = null,
  lastSampleTime = null,
  lastError = "",
  inFlight = false,
  requestAt = 0,
  nextPoll = 0,
  state = "connecting",
  paused = false,
  forceInfo = false;
let weather = boot.weather || {},
  news = boot.news || {},
  weatherError = "",
  newsError = "",
  nextInfo = 0,
  nextRotation = Date.now() + settings.rotation * 1000;
const newsRenderKeys = ["", ""];
const newsScrollbarRefresh = new Map();
for (const id of ["news", "stocks"]) {
  const list = $(id),
    rail = list.nextElementSibling,
    thumb = rail.firstElementChild;
  let hideTimer = 0,
    frame = 0;
  const refresh = () => {
    frame = 0;
    const height = list.clientHeight,
      total = list.scrollHeight,
      range = total - height;
    rail.hidden = height === 0 || range <= 1;
    if (rail.hidden) return;
    const thumbHeight = Math.min(height, Math.max(24, (height * height) / total)),
      progress = Math.max(0, Math.min(1, list.scrollTop / range));
    thumb.style.height = thumbHeight + "px";
    thumb.style.transform =
      "translateY(" + progress * (height - thumbHeight) + "px)";
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(refresh);
  };
  newsScrollbarRefresh.set(id, schedule);
  list.addEventListener(
    "scroll",
    () => {
      schedule();
      rail.classList.add("visible");
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => rail.classList.remove("visible"), 650);
    },
    { passive: true },
  );
  if (typeof ResizeObserver === "function")
    new ResizeObserver(schedule).observe(list);
}
const stockView = DeskPulseStocks.create({
  cache: boot.stocks,
  settings: () => settings,
  translate: (value) => tr(value),
  save: () => persist(),
  request: native ? (symbols, range) => native.refreshStocks(symbols, range) : null,
  refreshScrollbar: () => newsScrollbarRefresh.get("stocks")(),
});
const health = new C.Health(),
  history = [],
  numericKeys = [
    "opacity",
    "dim",
    "focus",
    "rotation",
    "memoryWarning",
    "memoryCritical",
    "diskWarning",
    "diskCritical",
    "gpuWarning",
    "gpuCritical",
    "cpuWarning",
    "cpuCritical",
    "sustain",
    "hysteresis",
  ];
function toast(text) {
  $("toast").textContent = tr(text);
  $("toast").hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => ($("toast").hidden = true), 6000);
}
function formatBytes(n) {
  if (!Number.isFinite(n)) return "—";
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return n.toFixed(i === 0 ? 0 : n >= 100 ? 0 : 1) + " " + units[i];
}
function ago(time) {
  if (!time) return "never";
  const s = Math.max(0, Math.floor((Date.now() - time) / 1000));
  return s < 60
    ? s + "s ago"
    : s < 3600
      ? Math.floor(s / 60) + "m ago"
      : Math.floor(s / 3600) + "h ago";
}
function text(id, value) {
  const element = $(id);
  if (id !== "host" && !id.startsWith("newsSource")) value = tr(value);
  if (
    [
      "host",
      "cpuSub",
      "gpuSub",
      "networkSub",
      "wallpaperStatus",
      "newsSource",
      "newsSource2",
    ].includes(id)
  ) {
    DeskPulseOverflow.set(element, value);
    return;
  }
  if (element.textContent !== value) element.textContent = value;
}
function applyAppearance() {
  if (activeLanguage !== settings.language) {
    activeLanguage = settings.language;
    translateStatic(settings.language);
    document.documentElement.lang = I.locale(settings.language);
    text("infoToggleLabel", forceInfo ? "Monitor" : "Info");
    $("infoToggle").setAttribute(
      "aria-label",
      tr(
        forceInfo ? "Show computer monitoring" : "Show clock, weather and news",
      ),
    );
  }
  document.body.className = C.themeAt(settings, new Date());
  // Android multiplies CSS pixels by Configuration.fontScale, and the host reports that
  // ratio directly. Inferring it from a computed size instead compares against whatever
  // base size the stylesheet happens to declare, so it flips on the wrong devices.
  const largeTextScale =
    parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue(
        "--large-text-scale",
      ),
    ) || 1.25;
  document.documentElement.classList.toggle(
    "large-text",
    (Number(boot.fontScale) || 1) > largeTextScale,
  );
  document.documentElement.style.setProperty(
    "--opacity",
    settings.opacity / 100,
  );
  document.documentElement.style.setProperty("--dim", settings.dim / 100);
  $("wallpaper").style.backgroundSize = settings.fit;
  $("wallpaper").style.backgroundPosition = settings.focus + "% 50%";
  $("pin").classList.toggle("active", settings.pinned);
  $("pin").setAttribute("aria-pressed", String(settings.pinned));
}
function persist() {
  if (native) native.saveSettings(JSON.stringify(settings));
  applyAppearance();
}
function showSettings() {
  for (const key of Object.keys(C.defaults)) {
    const el = $(key);
    if (el) {
      if (el.type === "checkbox") el.checked = settings[key];
      else el.value = settings[key];
    }
  }
  $("hostInput").value = config.host || "";
  text(
    "fingerprint",
    config.fingerprint
      ? "Pinned certificate SHA-256: " + config.fingerprint
      : "No collector paired",
  );
  $("settingsError").textContent = "";
  if (!$("settings").open) $("settings").showModal();
  document.documentElement.classList.add("settings-open");
  document.querySelector(".settings-body").scrollTop = 0;
}
window.closeSettings = () => $("settings").close();
$("settings").addEventListener("close", () =>
  document.documentElement.classList.remove("settings-open"),
);
$("settingsButton").onclick = showSettings;
for (const [id, order] of [
  ["processCpuSort", "cpu"],
  ["processRamSort", "ram"],
])
  $(id).onclick = () => {
    settings.processSort = order;
    persist();
    renderMonitor();
  };
$("closeSettings").onclick = window.closeSettings;
const settingsScroll = document.querySelector(".settings-body");
const sectionButtons = Array.from(document.querySelectorAll("[data-section]"));
for (const button of sectionButtons)
  button.onclick = () => {
    const section = $(button.dataset.section);
    const heading = section.querySelector("h3");
    settingsScroll.scrollTop +=
      heading.getBoundingClientRect().top -
      settingsScroll.getBoundingClientRect().top -
      16;
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
  };
settingsScroll.addEventListener(
  "scroll",
  () => {
    let selected = sectionButtons[0];
    for (const button of sectionButtons)
      if (
        $(button.dataset.section).getBoundingClientRect().top <=
        settingsScroll.getBoundingClientRect().top + 36
      )
        selected = button;
    for (const button of sectionButtons) {
      button.classList.toggle("selected", button === selected);
      if (button === selected) button.setAttribute("aria-current", "true");
      else button.removeAttribute("aria-current");
    }
  },
  { passive: true },
);
document.addEventListener("keydown", (event) => {
  if (event.key === "Tab")
    document.documentElement.classList.add("keyboard-nav");
});
document.addEventListener("pointerdown", () =>
  document.documentElement.classList.remove("keyboard-nav"),
);
$("settingsForm").onsubmit = (e) => {
  e.preventDefault();
  const next = {};
  for (const key of Object.keys(C.defaults)) {
    const el = $(key);
    next[key] = !el
      ? settings[key]
      : el.type === "checkbox"
        ? el.checked
        : numericKeys.includes(key)
          ? Number(el.value)
          : el.value.trim();
  }
  const error = C.validate(next);
  if (error) {
    text("settingsError", error);
    return;
  }
  const infoChanged =
    settings.city !== next.city ||
    settings.feed !== next.feed;
  settings = next;
  persist();
  health.states.clear();
  nextRotation = Date.now() + settings.rotation * 1000;
  if (native && config.host && $("hostInput").value.trim() !== config.host) {
    config.host = $("hostInput").value.trim();
    native.updateHost(config.host);
    lastFresh = 0;
    lastSequence = null;
    lastSampleTime = null;
    sample = null;
    lastError = "";
    nextPoll = 0;
    history.length = 0;
  }
  if (infoChanged) {
    if (weather.query !== settings.city) weather = {};
    if (news.feed !== settings.feed) news = {};
    weatherError = "";
    newsError = "";
    nextInfo = 0;
    renderInformation();
  }
  $("settings").close();
};
$("pairButton").onclick = () => {
  if (!native) {
    toast("Pairing is available in the Android app");
    return;
  }
  text("pairStatus", "Verifying collector…");
  $("pairButton").disabled = true;
  native.pair($("setupCode").value);
};
$("importSetup").onclick = () => native && native.pickSetup();
$("folderButton").onclick = () => native && native.pickFolder();
$("resetWallpaper").onclick = () => native && native.resetWallpaper();
$("previous").onclick = () => native && native.wallpaper(-1, settings.shuffle);
$("next").onclick = () => native && native.wallpaper(1, settings.shuffle);
$("pin").onclick = () => {
  settings.pinned = !settings.pinned;
  persist();
  nextRotation = Date.now() + settings.rotation * 1000;
};
$("infoToggle").onclick = () => {
  forceInfo = !forceInfo;
  text("infoToggleLabel", forceInfo ? "Monitor" : "Info");
  $("infoToggle").setAttribute("aria-pressed", String(forceInfo));
  $("infoToggle").setAttribute(
    "aria-label",
    tr(forceInfo ? "Show computer monitoring" : "Show clock, weather and news"),
  );
  updateConnection();
};
window.nativeEvent = (event, value) => {
  if (event === "paired") {
    config = value;
    paired = true;
    lastFresh = 0;
    sample = null;
    lastSequence = null;
    lastSampleTime = null;
    lastError = "";
    nextPoll = 0;
    inFlight = false;
    history.length = 0;
    health.states.clear();
    text("pairStatus", "Paired securely");
    $("pairButton").disabled = false;
    $("setupCode").value = "";
    $("hostInput").value = config.host;
    toast("Computer paired. Waiting for live telemetry.");
    $("settings").close();
  } else if (event === "pairError") {
    $("pairButton").disabled = false;
    text("pairStatus", value);
  } else if (event === "setup") {
    $("setupCode").value = value;
    showSettings();
  } else if (event === "sample") {
    inFlight = false;
    const s = value.sample;
    if (
      value.schemaVersion !== 1 ||
      !s ||
      !Number.isFinite(s.sequence) ||
      !Number.isFinite(value.sampleAgeMs) ||
      value.sampleAgeMs > 5000 ||
      value.sampleAgeMs < 0 ||
      !Number.isFinite(Date.parse(s.sampledAt))
    ) {
      lastError = "Unsupported or stale telemetry";
      return;
    }
    // Sequence resets are valid after a collector restart; identical samples never refresh freshness.
    if (s.sequence === lastSequence && s.sampledAt === lastSampleTime) return;
    if (
      lastSampleTime &&
      Date.parse(s.sampledAt) < Date.parse(lastSampleTime)
    ) {
      history.length = 0;
      health.states.clear();
    }
    lastSequence = s.sequence;
    lastSampleTime = s.sampledAt;
    sample = s;
    lastFresh = Date.now() - value.sampleAgeMs;
    lastError = "";
    // A successful offline retry must immediately restore the foreground polling cadence.
    nextPoll = Math.min(nextPoll, requestAt + 1000);
    const time = Date.now();
    if (history.length && time - history[history.length - 1].time > 5000)
      history.push({
        time: time - 1,
        cpu: null,
        gpu: null,
        memory: null,
        down: null,
        up: null,
      });
    history.push({
      time,
      cpu: s.cpuPercent,
      gpu: s.gpu && s.gpu.utilizationPercent,
      memory: s.memory && s.memory.percent,
      down: s.network && s.network.downloadBytesPerSecond,
      up: s.network && s.network.uploadBytesPerSecond,
    });
    while (
      history.length > 65 ||
      (history.length && time - history[0].time > 60000)
    )
      history.shift();
    updateConnection();
  } else if (event === "pollError") {
    inFlight = false;
    lastError = value;
    updateConnection();
  } else if (event === "weather") {
    weather = value;
    weatherError = "";
    renderInformation();
  } else if (event === "news") {
    news = value;
    newsError = "";
    renderInformation();
  } else if (event === "stock") {
    stockView.update(value);
  } else if (event === "stockError") {
    stockView.error(value);
  } else if (event === "weatherError") {
    weatherError = value;
    renderInformation();
  } else if (event === "newsError") {
    newsError = value;
    renderInformation();
  } else if (event === "wallpaper") {
    $("wallpaper").style.backgroundImage =
      'url("/wallpaper?t=' + Date.now() + '")';
    text("wallpaperStatus", "Wallpaper " + value);
  } else if (event === "wallpaperError" || event === "wallpaperReset") {
    $("wallpaper").style.backgroundImage = "";
    text("wallpaperStatus", "Built-in background");
    toast(value);
  } else if (event === "error") toast(value);
};
function updateConnection() {
  const now = Date.now();
  state = C.connectionState(paired, lastFresh, now, lastError);
  const monitor =
    sample && state !== "unreachable" && state !== "unpaired" && !forceInfo;
  $("monitor").hidden = !monitor;
  $("information").hidden = !!monitor;
  $("offlineNotice").hidden = state === "live";
  const labels = {
    unpaired: "Not paired",
    connecting: "Connecting",
    live: "Live",
    stale: "Stale",
    unreachable: "Unreachable",
  };
  text("connection", labels[state]);
  $("connection").className =
    state === "live" ? "healthy" : state === "stale" ? "warning" : "missing";
  text("host", sample ? sample.host : config.host || "LOCAL WORKSTATION");
  text(
    "freshness",
    lastFresh
      ? "Updated " +
          ago(lastFresh) +
          (state === "live" ? "" : " · " + (lastError || "Retrying connection"))
      : lastError || "Waiting for a genuine sample",
  );
  text(
    "offlineNotice",
    state === "unpaired"
      ? "Pair your computer in Setup. The clock, weather and news work independently."
      : state === "connecting"
        ? "Connecting to your computer…"
        : state === "live"
          ? "Computer connected. Monitoring continues in the background."
          : "Cannot reach host. Retrying automatically. Last success: " +
            ago(lastFresh) +
            ". " +
            lastError,
  );
  if (monitor) renderMonitor();
}
function valueHtml(id, n, unit) {
  const el = $(id);
  el.replaceChildren();
  el.append(document.createTextNode(Number.isFinite(n) ? n.toFixed(0) : "—"));
  if (Number.isFinite(n)) {
    const small = document.createElement("small");
    small.textContent = unit;
    el.append(small);
  }
}
function metricState(name, level, label) {
  $(name + "Card").className = "metric " + level;
  text(
    name + "State",
    level === "healthy"
      ? label.charAt(0) + label.slice(1).toLowerCase()
      : level === "missing"
        ? "UNAVAILABLE"
        : level.toUpperCase(),
  );
}
function renderMonitor() {
  if (!sample) return;
  const s = sample,
    now = Date.now(),
    fresh = state === "live",
    valid = (v) => fresh && Number.isFinite(v),
    m = s.memory,
    g = s.gpu;
  valueHtml("cpuValue", s.cpuPercent, "%");
  const cpuLevel = health.evaluate(
    "cpuTemperature",
    s.cpuTemperatureC,
    settings.cpuWarning,
    settings.cpuCritical,
    false,
    now,
    settings.sustain,
    settings.hysteresis,
    fresh,
  );
  metricState(
    "cpu",
    valid(s.cpuPercent)
      ? cpuLevel === "missing"
        ? "healthy"
        : cpuLevel
      : "missing",
    "LOAD",
  );
  text(
    "cpuSub",
    Number.isFinite(s.cpuTemperatureC)
      ? s.cpuTemperatureC.toFixed(1) + "°C · CPU temperature"
      : /Install.*PawnIO/i.test(s.capabilities && s.capabilities.cpuTemperature)
        ? "CPU sensor setup needed"
        : /administrator/i.test(s.capabilities && s.capabilities.cpuTemperature)
          ? "CPU sensor needs admin access"
          : "Temperature unavailable",
  );
  $("cpuSub").title = tr(
    (s.capabilities && s.capabilities.cpuTemperature) ||
      "CPU temperature unavailable",
  );
  text("cpuSensorStatus", $("cpuSub").title);
  valueHtml("gpuValue", g && g.utilizationPercent, "%");
  const gpuLevel = health.evaluate(
    "gpu",
    g && g.temperatureC,
    settings.gpuWarning,
    settings.gpuCritical,
    false,
    now,
    settings.sustain,
    settings.hysteresis,
    fresh,
  );
  metricState(
    "gpu",
    !fresh || !g ? "missing" : gpuLevel === "missing" ? "healthy" : gpuLevel,
    "LOAD",
  );
  text(
    "gpuSub",
    g
      ? (Number.isFinite(g.temperatureC)
          ? g.temperatureC.toFixed(0) + "°C"
          : "Temp unavailable") +
          " · VRAM " +
          (Number.isFinite(g.usedMemoryMiB)
            ? (g.usedMemoryMiB / 1024).toFixed(1)
            : "—") +
          " GiB"
      : s.gpuStatus || "Sensor unavailable",
  );
  valueHtml("memoryValue", m && m.percent, "%");
  const memoryLevel = health.evaluate(
    "memory",
    m && m.percent,
    settings.memoryWarning,
    settings.memoryCritical,
    false,
    now,
    settings.sustain,
    settings.hysteresis,
    fresh,
  );
  metricState("memory", memoryLevel, "PRESSURE");
  text(
    "memorySub",
    m
      ? formatBytes(m.usedBytes) + " / " + formatBytes(m.totalBytes)
      : "Sensor unavailable",
  );
  const n = s.network || {};
  text("downValue", formatBytes(n.downloadBytesPerSecond) + "/s");
  text("upValue", formatBytes(n.uploadBytesPerSecond) + "/s");
  $("networkCard").className =
    "metric " + (valid(n.downloadBytesPerSecond) ? "healthy" : "missing");
  text(
    "networkSub",
    (n.interfaceKinds || []).join(" + ") ||
      ((n.interfaces || []).length
        ? "Physical adapters"
        : "No physical interface available"),
  );
  const processRoot = $("processes");
  const processReadings = C.processesFor(s, settings.processSort);
  $("processCpuSort").setAttribute(
    "aria-pressed",
    String(settings.processSort === "cpu"),
  );
  $("processRamSort").setAttribute(
    "aria-pressed",
    String(settings.processSort === "ram"),
  );
  if (processRoot.querySelector(".note")) processRoot.replaceChildren();
  const processItems = processReadings || [];
  while (processRoot.children.length > processItems.length)
    processRoot.lastElementChild.remove();
  for (const [index, p] of processItems.entries()) {
    let row = processRoot.children[index];
    if (!row) {
      row = document.createElement("div");
      row.className = "row";
      const name = document.createElement("span");
      name.className = "name";
      const stats = document.createElement("span");
      stats.className = "secondary";
      row.append(name, stats);
      processRoot.append(row);
    }
    DeskPulseOverflow.set(row.firstElementChild, p.name);
    const stats = row.lastElementChild;
    stats.textContent =
      p.cpuPercent.toFixed(1) + "% / " + formatBytes(p.memoryBytes);
  }
  if (!processItems.length) {
    processRoot.replaceChildren();
    const note = document.createElement("div");
    note.className = "note";
    note.textContent = tr(
      processReadings === null && settings.processSort === "ram"
        ? "RAM ranking needs a collector update"
        : "Process readings unavailable",
    );
    processRoot.append(note);
  }
  const diskRoot = $("disks");
  diskRoot.replaceChildren();
  for (const d of s.disks || []) {
    const free =
      d.totalBytes > 0 && Number.isFinite(d.freeBytes)
        ? (d.freeBytes / d.totalBytes) * 100
        : null;
    const level = health.evaluate(
      "disk:" + d.name,
      free,
      settings.diskWarning,
      settings.diskCritical,
      true,
      now,
      settings.sustain,
      settings.hysteresis,
      fresh,
    );
    const block = document.createElement("div");
    block.className = "disk " + level;
    const row = document.createElement("div");
    row.className = "row";
    const label = document.createElement("span");
    label.textContent = tr(
      d.name +
        (level === "critical"
          ? " ! CRITICAL"
          : level === "warning"
            ? " △ LOW FREE"
            : ""),
    );
    const amount = document.createElement("span");
    amount.className = "secondary";
    amount.textContent =
      formatBytes(d.freeBytes) + " / " + formatBytes(d.totalBytes);
    row.append(label, amount);
    const bar = document.createElement("div");
    bar.className = "bar";
    const fill = document.createElement("div");
    fill.style.width = Number.isFinite(free) ? 100 - free + "%" : "0";
    fill.style.background =
      level === "critical"
        ? "var(--critical)"
        : level === "warning"
          ? "var(--warning)"
          : "var(--accent)";
    bar.append(fill);
    block.append(row, bar);
    diskRoot.append(block);
  }
  const machine = $("machine");
  const rows = [
    [
      "Uptime",
      Number.isFinite(s.uptimeSeconds) ? Math.floor(s.uptimeSeconds / 3600) +
        "h " +
        (Math.floor(s.uptimeSeconds / 60) % 60) +
        "m" : "Unavailable",
    ],
    ["GPU", g ? g.name : "Unavailable"],
    [
      "GPU power",
      g && Number.isFinite(g.powerW)
        ? g.powerW.toFixed(0) + " W"
        : "Unavailable",
    ],
    [
      "CPU temp",
      Number.isFinite(s.cpuTemperatureC)
        ? s.cpuTemperatureC.toFixed(1) + "°C"
        : "Unavailable",
    ],
  ];
  for (const [index, [label, val]] of rows.entries()) {
    let row = machine.querySelector('[data-machine-row="' + index + '"]');
    if (!row) {
      row = document.createElement("div");
      row.className = "row";
      row.dataset.machineRow = index;
      const a = document.createElement("span");
      const b = document.createElement("span");
      b.className = "secondary";
      row.append(a, b);
      machine.append(row);
    }
    const labelText = tr(label);
    if (row.firstElementChild.textContent !== labelText)
      row.firstElementChild.textContent = labelText;
    DeskPulseOverflow.set(
      row.lastElementChild,
      val === "Unavailable" ? tr(val) : val,
    );
  }
  let note = machine.querySelector(".note");
  if (!note) {
    note = document.createElement("div");
    note.className = "note";
    machine.append(note);
  }
  note.textContent = tr(
    fresh
      ? "1 Hz sampling · 60s history"
      : "STALE: values are historical; traces paused",
  );
  draw("cpuGraph", ["cpu"], 100);
  draw("gpuGraph", ["gpu"], 100);
  draw("memoryGraph", ["memory"], 100);
  draw("networkGraph", ["down", "up"]);
}
function draw(id, keys, max) {
  const canvas = $(id),
    rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(rect.width * ratio);
  canvas.height = Math.round(rect.height * ratio);
  const ctx = canvas.getContext("2d");
  ctx.scale(ratio, ratio);
  const w = rect.width,
    h = rect.height,
    css = getComputedStyle(canvas.closest(".metric"));
  ctx.strokeStyle = css.getPropertyValue("--line");
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, h - 1);
  ctx.lineTo(w, h - 1);
  ctx.stroke();
  const ceiling =
    max ||
    Math.max(
      1024,
      ...history.flatMap((p) =>
        keys.map((k) => (Number.isFinite(p[k]) ? p[k] : 0)),
      ),
    );
  keys.forEach((key, index) => {
    ctx.strokeStyle = css.getPropertyValue("--trace");
    ctx.globalAlpha = state === "live" ? (index ? 0.6 : 1) : 0.35;
    ctx.setLineDash(index ? [3, 3] : []);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    let pen = false;
    const end = history.length ? history[history.length - 1].time : Date.now();
    for (const point of history) {
      if (!Number.isFinite(point[key])) {
        pen = false;
        continue;
      }
      const x = w * (1 - (end - point.time) / 60000),
        y = h - 2 - Math.max(0, Math.min(1, point[key] / ceiling)) * (h - 4);
      if (pen) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
      pen = true;
    }
    ctx.stroke();
  });
}
function renderInformation() {
  if (weather.query && weather.query !== settings.city) weather = {};
  if (news.feed && news.feed !== settings.feed) news = {};
  const cur = weather.current;
  text("cityLabel", weather.city || settings.city);
  text(
    "weatherValue",
    cur && Number.isFinite(cur.temperature_2m)
      ? Math.round(cur.temperature_2m) + "°C"
      : "—",
  );
  const codes = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Rime fog",
    51: "Light drizzle",
    53: "Drizzle",
    55: "Heavy drizzle",
    61: "Light rain",
    63: "Rain",
    65: "Heavy rain",
    71: "Snow",
    80: "Rain showers",
    95: "Thunderstorm",
  };
  text(
    "weatherDetail",
    cur
      ? (codes[cur.weather_code] || "Weather code " + cur.weather_code) +
          (weather.country ? " · " + weather.country : "")
      : weatherError || "No cached weather yet",
  );
  const outdated =
    weather.fetchedAt && Date.now() - weather.fetchedAt > 1800000;
  text(
    "weatherSource",
    "Open-Meteo · " +
      (weather.fetchedAt
        ? ago(weather.fetchedAt) +
          (outdated || weatherError ? " · CACHED / STALE" : "")
        : "awaiting first update") +
      (weatherError ? " · " + weatherError : ""),
  );
  const forecast = $("forecast");
  forecast.replaceChildren();
  if (weather.hourly && cur) {
    const times = weather.hourly.time || [],
      currentTime = cur.time;
    let start = times.findIndex((t) => t >= currentTime);
    if (start < 0) start = 0;
    for (let i = start; i < Math.min(start + 8, times.length); i++) {
      const column = document.createElement("div"),
        time = document.createElement("small");
      time.textContent = times[i].slice(11, 16);
      column.append(
        time,
        document.createTextNode(
          Math.round(weather.hourly.temperature_2m[i]) + "°",
        ),
      );
      forecast.append(column);
    }
  }
  renderNews(news, newsError, "", settings.feed, 0);
  stockView.render();
}
function renderNews(cache, error, suffix, feed, slot) {
  text("newsSource" + suffix, cache.title || cache.source || "RSS / ATOM");
  const target = $("news" + suffix);
  const key = JSON.stringify([
    settings.language,
    feed,
    cache.items || [],
    cache.source,
    error,
  ]);
  if (newsRenderKeys[slot] !== key) {
    const previousScroll = target.dataset.feed === feed ? target.scrollTop : 0;
    target.replaceChildren();
    for (const item of (cache.items || []).slice(0, 20)) {
      const button = document.createElement("button");
      button.textContent = item.title;
      const when = document.createElement("small");
      const parsed = Date.parse(item.published);
      when.textContent =
        cache.source +
        " · " +
        (Number.isFinite(parsed)
          ? new Date(parsed).toLocaleString(I.locale(settings.language), {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })
          : item.published || tr("Publication time unavailable"));
      button.append(when);
      button.onclick = () => native && native.openLink(item.url);
      target.append(button);
    }
    if (!target.childElementCount)
      target.textContent = tr(
        error ||
          "No cached headlines yet. Internet access is required for the first update.",
      );
    target.dataset.feed = feed;
    target.scrollTop = previousScroll;
    newsRenderKeys[slot] = key;
  }
  newsScrollbarRefresh.get("news" + suffix)();
  text(
    "newsTime" + suffix,
    cache.fetchedAt
      ? (cache.items || []).slice(0, 20).length +
          " headlines · Updated " +
          ago(cache.fetchedAt) +
          (Date.now() - cache.fetchedAt > 3600000 || error
            ? " · CACHED / STALE"
            : "") +
          (error ? " · " + error : "")
      : "Awaiting first update",
  );
}
function tick() {
  if (paused) return;
  const now = Date.now(),
    date = new Date();
  text(
    "smallClock",
    date.toLocaleTimeString(I.locale(settings.language), { hour12: false }),
  );
  text(
    "bigClock",
    date.toLocaleTimeString(I.locale(settings.language), {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }),
  );
  text(
    "date",
    date.toLocaleDateString(I.locale(settings.language), {
      weekday: "long",
      month: "long",
      day: "numeric",
    }),
  );
  applyAppearance();
  updateConnection();
  if (inFlight && now - requestAt > 10000) {
    inFlight = false;
    lastError = "Request timed out";
  }
  if (native && paired && !inFlight && now >= nextPoll) {
    inFlight = true;
    requestAt = now;
    nextPoll = now + (state === "unreachable" ? 30000 : 1000);
    native.poll();
  }
  if (native && now >= nextInfo) {
    nextInfo = now + 900000;
    native.refreshInfo(settings.city, settings.feed);
  }
  stockView.tick(!$("information").hidden);
  const rotationPaused =
    settings.pinned ||
    $("settings").open ||
    matchMedia("(prefers-reduced-motion: reduce)").matches ||
    (document.activeElement &&
      document.activeElement.closest(".wallpaper-controls"));
  if (native && !rotationPaused && now >= nextRotation) {
    nextRotation = now + settings.rotation * 1000;
    native.wallpaper(1, settings.shuffle);
  }
  if (now % 30000 < 1000) renderInformation();
}
window.onPause = () => {
  paused = true;
};
window.onResume = () => {
  paused = false;
  nextPoll = 0;
  inFlight = false;
  applyAppearance();
  tick();
};
if (boot.folder) {
  $("wallpaper").style.backgroundImage =
    'url("/wallpaper?t=' + Date.now() + '")';
  text("wallpaperStatus", "Phone wallpaper");
}
if (boot.incoming) {
  $("setupCode").value = boot.incoming;
  showSettings();
} else if (!paired) showSettings();
applyAppearance();
renderInformation();
tick();
setInterval(tick, 1000);
