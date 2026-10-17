const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  Health,
  defaults,
  validate,
  themeAt,
  connectionState,
  processesFor,
} = require("../android/app/src/main/assets/core.js");

test("scheduled appearance crosses midnight and fixed modes take priority", () => {
  const day = (h, m = 0) => new Date(2026, 9, 17, h, m);
  const schedule = { ...defaults, theme: "scheduled" };
  assert.equal(themeAt(schedule, day(6, 59)), "night");
  assert.equal(themeAt(schedule, day(7)), "day");
  assert.equal(themeAt(schedule, day(19)), "night");
  const inverted = { ...schedule, dayStart: "19:00", nightStart: "07:00" };
  assert.equal(themeAt(inverted, day(23)), "day");
  assert.equal(themeAt(inverted, day(3)), "day");
  assert.equal(themeAt(inverted, day(12)), "night");
  assert.equal(themeAt({ ...defaults, theme: "night" }, day(12)), "night");
});

test("RAM order uses the collector's global memory ranking rather than sorting the CPU shortlist", () => {
  const cpu = [{ name: "BusyTask", cpuPercent: 90, memoryBytes: 100 }];
  const ram = [{ name: "LargeIdleTask", cpuPercent: 0, memoryBytes: 100000 }];
  assert.deepEqual(
    processesFor({ processes: cpu, processesByMemory: ram }, "cpu"),
    cpu,
  );
  assert.deepEqual(
    processesFor({ processes: cpu, processesByMemory: ram }, "ram"),
    ram,
  );
  assert.equal(processesFor({ processes: cpu }, "ram"), null);
  assert.notEqual(validate({ ...defaults, processSort: "name" }), "");
});
test("reject invalid threshold ordering, ambiguous schedules and non-HTTPS feeds", () => {
  assert.equal(validate(defaults), "");
  for (const override of [
    { memoryWarning: 96 },
    { diskWarning: 3 },
    { gpuCritical: 70 },
    { cpuWarning: 100 },
    { cpuCritical: 130 },
    { cpuWarning: NaN },
    { dayStart: "19:00" },
    { feed: "http://example.com" },
    { rotation: 0 },
    { hysteresis: 10 },
    { sustain: NaN },
  ])
    assert.notEqual(validate({ ...defaults, ...override }), "");
});
test("high memory must remain above threshold, recovers with hysteresis and missing clears history", () => {
  const h = new Health(),
    e = (v, t, fresh = true) =>
      h.evaluate("memory", v, 85, 95, false, t, 10, 3, fresh);
  assert.equal(e(90, 0), "healthy");
  assert.equal(e(90, 9999), "healthy");
  assert.equal(e(90, 10000), "warning");
  assert.equal(e(84, 20000), "warning");
  assert.equal(e(83, 30000), "warning");
  assert.equal(e(80, 31000), "warning");
  assert.equal(e(80, 41000), "healthy");
  assert.equal(e(99, 42000), "healthy");
  assert.equal(e(99, 52000), "critical");
  assert.equal(e(90, 53000, false), "missing");
  assert.equal(e(99, 54000), "healthy");
});
test("low disk space reverses threshold direction and retains critical through recovery margin", () => {
  const h = new Health(),
    e = (v, t) => h.evaluate("disk", v, 15, 5, true, t, 0, 3);
  assert.equal(e(30, 0), "healthy");
  assert.equal(e(12, 1000), "warning");
  assert.equal(e(2, 2000), "critical");
  assert.equal(e(7, 3000), "critical");
  assert.equal(e(9, 4000), "warning");
  assert.equal(e(17, 5000), "warning");
  assert.equal(e(19, 6000), "healthy");
});
test("freshness transitions preserve old metrics for five to fifteen seconds", () => {
  assert.equal(connectionState(false, 0, 1000, ""), "unpaired");
  assert.equal(connectionState(true, 0, 1000, ""), "connecting");
  assert.equal(connectionState(true, 0, 1000, "timeout"), "unreachable");
  assert.equal(connectionState(true, 1000, 5999, ""), "live");
  assert.equal(connectionState(true, 1000, 6000, ""), "stale");
  assert.equal(connectionState(true, 1000, 16000, ""), "unreachable");
  assert.equal(connectionState(true, 17000, 17001, ""), "live");
});

test("CPU thermal warnings require sustained heat and clear on missing or stale sensors", () => {
  const h = new Health();
  const reading = (value, at, fresh = true) =>
    h.evaluate(
      "cpuTemperature",
      value,
      defaults.cpuWarning,
      defaults.cpuCritical,
      false,
      at,
      10,
      3,
      fresh,
    );
  assert.equal(reading(90, 0), "healthy");
  assert.equal(reading(90, 10000), "warning");
  assert.equal(reading(96, 11000), "warning");
  assert.equal(reading(96, 21000), "critical");
  assert.equal(reading(null, 22000), "missing");
  assert.equal(reading(96, 23000), "healthy");
  assert.equal(reading(96, 24000, false), "missing");
});
