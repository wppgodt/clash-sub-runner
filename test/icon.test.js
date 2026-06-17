"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { APP_ICON_SVG, createIcoBuffer } = require("../src/icon");

test("app icon assets are valid enough for browser and shortcut use", () => {
  assert.match(APP_ICON_SVG, /<svg/);
  const ico = createIcoBuffer();
  assert.equal(ico.readUInt16LE(0), 0);
  assert.equal(ico.readUInt16LE(2), 1);
  assert.equal(ico.readUInt16LE(4), 1);
  assert.equal(ico.readUInt8(6), 32);
  assert.equal(ico.readUInt8(7), 32);
  assert.ok(ico.length > 4000);
});
