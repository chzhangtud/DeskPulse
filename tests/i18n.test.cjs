const { test } = require("node:test");
const assert = require("node:assert/strict");
const { translate, locale } = require("../android/app/src/main/assets/i18n.js");
const {
  defaults,
  validate,
} = require("../android/app/src/main/assets/core.js");

test("English is the default and both supported languages validate without changing other settings", () => {
  assert.equal(defaults.language, "en");
  assert.equal(validate({ ...defaults, language: "en" }), "");
  assert.equal(validate({ ...defaults, language: "zh" }), "");
  assert.notEqual(validate({ ...defaults, language: "fr" }), "");
  assert.notEqual(
    validate({ ...defaults, feed: "http://example.com/rss" }),
    "",
  );
  assert.equal(locale("en"), "en-US");
  assert.equal(locale("zh"), "zh-CN");
});

test("status composition translates ages and sensor reasons while retaining numbers and provider identity", () => {
  assert.equal(translate("Updated 12s ago", "en"), "Updated 12s ago");
  assert.equal(translate("Updated 12s ago", "zh"), "更新于 12秒前");
  assert.equal(
    translate("73.0°C · CPU temperature", "zh"),
    "73.0°C · CPU 温度",
  );
  assert.equal(
    translate("LibreHardwareMonitor · Core (Tctl/Tdie)", "zh"),
    "LibreHardwareMonitor · 核心（Tctl/Tdie）",
  );
  assert.equal(
    translate("Pinned certificate SHA-256: ABC123", "zh"),
    "固定证书 SHA-256：ABC123",
  );
  assert.match(
    translate(
      "Unavailable: Install the signed PawnIO driver for CPU temperature",
      "zh",
    ),
    /需要安装签名 PawnIO 驱动/,
  );
  assert.equal(translate("CustomToolMonitor", "zh"), "CustomToolMonitor");
  assert.match(
    translate("Unavailable: Linux CPU temperature sensor not exposed or not readable", "zh"),
    /Linux.*温度.*读取权限/,
  );
});

test("validation, appearance and health copy can switch in both directions", () => {
  for (const message of [
    "Save changes",
    "Fixed night",
    "CPU warning °C",
    "CPU sensor setup needed",
    "Choose English or Simplified Chinese",
    "TLS verification failed. Check the setup code and phone clock.",
  ]) {
    assert.equal(translate(message, "en"), message);
    assert.match(translate(message, "zh"), /[\u4e00-\u9fff]/);
  }
});
