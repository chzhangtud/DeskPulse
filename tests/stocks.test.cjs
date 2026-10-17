const { test } = require("node:test");
const assert = require("node:assert/strict");
const { groups, seriesFor, summary, capacities } = require("../android/app/src/main/assets/stocks.js");
const { defaults, validate } = require("../android/app/src/main/assets/core.js");

test("default watchlist preserves the requested semiconductor order and a small daily range", () => {
  assert.equal(groups.chips.length, 10);
  assert.deepEqual(groups.chips.slice(0,4).map(x=>x[0]), ["NVDA","AMD","ARM","QCOM"]);
  assert.equal(new Set(Object.values(groups).flat().map(([symbol]) => symbol)).size, 22);
  assert.equal(defaults.stockCategory, "chips");
  assert.equal(defaults.stockRange, "10d");
  assert.equal(capacities["10d"], 13);
  assert.equal(validate(defaults), "");
  assert.notEqual(validate({ ...defaults, stockCategory: "invalid" }), "");
  assert.notEqual(validate({ ...defaults, stockRange: "1min" }), "");
});

test("daily percent compares consecutive actual closes, without inventing missing prices", () => {
  assert.equal(summary({}), null);
  assert.equal(summary({series:[{date:"2026-10-16",close:10}]}), null);
  const value=summary({series:[{date:"2026-10-15",close:244.79},{date:"2026-10-16",close:227.8}]});
  assert.equal(value.close,227.8);
  assert.ok(Math.abs(value.percent-(-6.940643))<0.000001);
  assert.equal(value.date,"2026-10-16");
  assert.equal(summary({series:[{date:"2026-10-15",close:100},{date:"2026-10-16",close:100}]}).percent,0);
});

test("five and ten day windows count actual trading observations rather than filling weekends", () => {
  const series=["2026-10-01","2026-10-02","2026-10-05","2026-10-06","2026-10-07","2026-10-08","2026-10-09","2026-10-12","2026-10-13","2026-10-14","2026-10-15","2026-10-16"].map((date,i)=>({date,close:100+i}));
  assert.deepEqual(seriesFor({series},"5d").map(x=>x.date),["2026-10-12","2026-10-13","2026-10-14","2026-10-15","2026-10-16"]);
  assert.equal(seriesFor({series},"10d").length,10);
  assert.equal(series.length,12);
});

test("calendar month ranges clamp month ends and discard invalid quotes", () => {
  const series=[{date:"2026-02-27",close:90},{date:"2026-02-28",close:91},{date:"2026-03-31",close:100},{date:"invalid",close:1},{date:"2026-03-30",close:NaN}];
  assert.deepEqual(seriesFor({series},"1m").map(x=>x.date),["2026-02-28","2026-03-31"]);
  const six=[{date:"2025-09-29",close:90},{date:"2025-09-30",close:91},{date:"2026-03-31",close:100}];
  assert.deepEqual(seriesFor({series:six},"6m").map(x=>x.date),["2025-09-30","2026-03-31"]);
});

test("period returns change with the dropdown and include the close preceding the window", () => {
  const series=Array.from({length:13},(_,i)=>({date:`2026-10-${String(i+1).padStart(2,"0")}`,close:100+i*10}));
  const day=summary({series}),five=summary({series},"5d"),ten=summary({series},"10d");
  assert.equal(day.baseline,"2026-10-12");
  assert.equal(five.baseline,"2026-10-08");
  assert.equal(ten.baseline,"2026-10-03");
  assert.ok(day.percent<five.percent && five.percent<ten.percent);
  assert.equal(five.close,ten.close);
});
