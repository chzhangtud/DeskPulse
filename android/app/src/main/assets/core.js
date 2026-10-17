(function (root) {
  "use strict";
  const defaults = {
    language: "en",
    processSort: "cpu",
    stockCategory: "chips",
    stockRange: "10d",
    theme: "night",
    dayStart: "07:00",
    nightStart: "19:00",
    opacity: 86,
    dim: 30,
    fit: "cover",
    focus: 50,
    rotation: 300,
    shuffle: false,
    pinned: false,
    city: "London",
    feed: "https://feeds.arstechnica.com/arstechnica/index",
    memoryWarning: 85,
    memoryCritical: 95,
    diskWarning: 15,
    diskCritical: 5,
    cpuWarning: 85,
    cpuCritical: 95,
    gpuWarning: 80,
    gpuCritical: 88,
    sustain: 10,
    hysteresis: 3,
  };
  function themeAt(s, date) {
    if (s.theme !== "scheduled") return s.theme;
    const minutes = (v) => {
      const [h, m] = v.split(":").map(Number);
      return h * 60 + m;
    };
    const t = date.getHours() * 60 + date.getMinutes(),
      day = minutes(s.dayStart),
      night = minutes(s.nightStart);
    return (day < night ? t >= day && t < night : t >= day || t < night)
      ? "day"
      : "night";
  }
  function validate(s) {
    if (!["chips", "tech", "other"].includes(s.stockCategory) ||
        !["5d", "10d", "1m", "3m", "6m"].includes(s.stockRange))
      return "Choose a stock category and daily history range";
    if (!["cpu", "ram"].includes(s.processSort))
      return "Choose CPU or RAM process order";
    if (!["en", "zh"].includes(s.language))
      return "Choose English or Simplified Chinese";
    if (!["scheduled", "day", "night"].includes(s.theme))
      return "Invalid theme";
    if (
      ![s.dayStart, s.nightStart].every((v) =>
        /^([01]\d|2[0-3]):[0-5]\d$/.test(v),
      ) ||
      s.dayStart === s.nightStart
    )
      return "Day and night times must be different valid times";
    for (const key of [
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
      "rotation",
      "opacity",
      "dim",
      "focus",
    ])
      if (!Number.isFinite(s[key])) return "Enter valid numbers";
    if (!(
      0 < s.memoryWarning &&
      s.memoryWarning < s.memoryCritical &&
      s.memoryCritical <= 100
    ))
      return "Memory: 0 < warning < critical ≤ 100%";
    if (!(
      0 <= s.diskCritical &&
      s.diskCritical < s.diskWarning &&
      s.diskWarning <= 100
    ))
      return "Disk free: 0 ≤ critical < warning ≤ 100%";
    if (!(
      0 < s.cpuWarning &&
      s.cpuWarning < s.cpuCritical &&
      s.cpuCritical <= 125
    ))
      return "CPU temperature: 0 < warning < critical ≤ 125°C";
    if (!(
      0 < s.gpuWarning &&
      s.gpuWarning < s.gpuCritical &&
      s.gpuCritical <= 120
    ))
      return "GPU temperature: 0 < warning < critical ≤ 120°C";
    if (!(
      s.sustain >= 0 &&
      s.sustain <= 300 &&
      s.hysteresis >= 0 &&
      s.hysteresis <= 20
    ))
      return "Duration must be 0–300s; hysteresis 0–20";
    if (
      s.hysteresis >=
      Math.min(
        s.memoryCritical - s.memoryWarning,
        s.diskWarning - s.diskCritical,
        s.gpuCritical - s.gpuWarning,
        s.cpuCritical - s.cpuWarning,
      )
    )
      return "Hysteresis must be smaller than each threshold gap";
    if (s.rotation < 10 || s.rotation > 86400)
      return "Rotation must be 10–86400 seconds";
    if ([s.opacity, s.dim, s.focus].some((v) => v < 0 || v > 100))
      return "Appearance values must be 0–100%";
    if (!s.city.trim() || s.city.length > 100)
      return "Enter a city (up to 100 characters)";
    try {
      if (new URL(s.feed).protocol !== "https:")
        return "News feed must use HTTPS";
    } catch (_) {
      return "Enter a valid HTTPS feed URL";
    }
    return "";
  }
  class Health {
    constructor() {
      this.states = new Map();
    }
    evaluate(
      key,
      value,
      warning,
      critical,
      low,
      now,
      sustain,
      hysteresis,
      fresh = true,
    ) {
      if (!fresh || !Number.isFinite(value)) {
        this.states.delete(key);
        return "missing";
      }
      const sign = low ? -1 : 1,
        v = value * sign,
        w = warning * sign,
        c = critical * sign;
      let state = this.states.get(key) || {
        level: "healthy",
        target: "healthy",
        since: now,
      };
      const recovery =
        state.level === "critical"
          ? c - hysteresis
          : state.level === "warning"
            ? w - hysteresis
            : Infinity;
      let target = v >= c ? "critical" : v >= w ? "warning" : "healthy";
      if (
        (state.level === "critical" && v >= recovery) ||
        (state.level === "warning" && target === "healthy" && v >= recovery)
      )
        target = state.level;
      if (target !== state.target) {
        state.target = target;
        state.since = now;
      }
      if (now - state.since >= sustain * 1000) state.level = target;
      this.states.set(key, state);
      return state.level;
    }
  }
  function connectionState(paired, lastFresh, now, networkError) {
    if (!paired) return "unpaired";
    if (!lastFresh) return networkError ? "unreachable" : "connecting";
    const age = now - lastFresh;
    return age >= 15000 ? "unreachable" : age >= 5000 ? "stale" : "live";
  }
  function processesFor(sample, order) {
    const readings =
      order === "ram" ? sample.processesByMemory : sample.processes;
    return Array.isArray(readings) ? readings : null;
  }
  const api = {
    defaults,
    themeAt,
    validate,
    Health,
    connectionState,
    processesFor,
  };
  if (typeof module !== "undefined") module.exports = api;
  root.DeskPulseCore = api;
})(typeof window !== "undefined" ? window : globalThis);
