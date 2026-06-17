"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { renderHtml } = require("../src/ui");

test("GUI contains the required controls", () => {
  const html = renderHtml();
  for (const id of [
    "useClashBtn",
    "useDirectBtn",
    "refreshPathBtn",
    "refreshBtn",
    "testBtn",
    "resetBtn",
    "applyRegionBtn",
    "regionSelect",
    "nodeSelect",
    "savedSelectionHint",
    "modeButtons",
    "pathValue",
    "pathLabel",
    "pathSteps",
    "pathConfidence",
    "warpValue",
    "clashValue",
    "captureValue",
    "pathRecommendations",
    "issues",
    "advancedDetails",
    "traceValue",
    "pathEvidence",
    "refreshProgressText",
    "refreshProgressBar",
    "speedExternal",
    "speedCount",
    "speedProgressText",
    "speedProgressBar",
    "speedList",
    "logView"
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /data-mode="rule"/);
  assert.match(html, /data-mode="global"/);
  assert.match(html, /data-mode="direct"/);
  assert.match(html, /speed-card/);
  assert.match(html, /refresh-progress/);
  assert.match(html, /speed-progress/);
  assert.match(html, /bar-fill/);
  assert.match(html, /favicon\.ico\?v=3/);
  assert.match(html, /manifest\.webmanifest\?v=3/);
  assert.match(html, /网络控制台/);
  assert.match(html, /当前网络路线/);
  assert.match(html, /高级诊断/);
  assert.doesNotMatch(html, /id="startBtn"/);
  assert.doesNotMatch(html, /id="stopBtn"/);
  assert.doesNotMatch(html, /id="sidePath"/);
  assert.doesNotMatch(html, /id="mcpPath"/);
  assert.doesNotMatch(html, /id="copyCmdBtn"/);
  assert.doesNotMatch(html, /alert\(result\.warning/);
});
