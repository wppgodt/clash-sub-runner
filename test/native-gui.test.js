"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("native GUI local API calls bypass the managed system proxy", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "native", "ClashSubRunnerGui.cs"), "utf8");
  assert.match(source, /WebRequest\.Create\("http:\/\/127\.0\.0\.1:"\s*\+\s*port\s*\+\s*path\)/);
  assert.match(source, /req\.Proxy\s*=\s*null\s*;/);
});

test("native GUI can avoid incompatible or occupied GUI API ports", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "native", "ClashSubRunnerGui.cs"), "utf8");
  assert.match(source, /PreferredApiPort\s*=\s*17980/);
  assert.match(source, /ApiPortFallbackCount\s*=\s*10/);
  assert.match(source, /IsLoopbackPortFree/);
  assert.match(source, /--no-open --ui-port/);
  assert.match(source, /IsCompatibleStatus/);
});

test("native GUI shows speed test progress while busy", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "native", "ClashSubRunnerGui.cs"), "utf8");
  assert.match(source, /private ProgressBar speedProgress;/);
  assert.match(source, /speedProgressText/);
  assert.match(source, /RenderSpeedProgress/);
  assert.match(source, /if \(refreshing\) return;/);
  assert.doesNotMatch(source, /if \(refreshing \|\| busy\) return;/);
});

test("native GUI reports cached refresh results inline without a dialog", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "native", "ClashSubRunnerGui.cs"), "utf8");
  assert.match(source, /refresh\.Click \+= delegate \{ RunRefresh\(\); \};/);
  assert.match(source, /GetBool\(result, "cached"\)/);
  assert.match(source, /GetString\(result, "warning"\)/);
  assert.doesNotMatch(source, /MessageBox\.Show\(this,\s*GetString\(result,\s*"warning"\)/);
});

test("native GUI accepts JavaScriptSerializer object arrays", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "native", "ClashSubRunnerGui.cs"), "utf8");
  assert.match(source, /object\[\]\s+values\s*=\s*dict\[key\]\s+as\s+object\[\]\s*;/);
  assert.match(source, /new\s+ArrayList\(values\)/);
});

test("native GUI keeps region commands and selections free of display counts", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "native", "ClashSubRunnerGui.cs"), "utf8");
  assert.match(source, /string selected = regionCombo\.SelectedItem == null \? GetString\(status, "selectedRegion"\) : SelectedRegionName\(\);/);
  assert.match(source, /string region = SelectedRegionName\(\);\s*Clipboard\.SetText/s);
});
