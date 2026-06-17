"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildRegionList,
  findGlobalSelector,
  findPrimarySelector,
  inferRegion,
  selectNodesByRegion
} = require("../src/regions");
const { nodeRank, parseIp } = require("../src/service");

test("inferRegion handles common subscription node names", () => {
  assert.equal(inferRegion("Hong Kong 02 S | x3.0"), "Hong Kong");
  assert.equal(inferRegion("Japan 02 S | x3.0"), "Japan");
  assert.equal(inferRegion("United States 01 S | x3.0"), "United States");
  assert.equal(inferRegion("England 01 | x1.0"), "England");
});

test("buildRegionList filters control groups and ipv6-only nodes", () => {
  const proxies = {
    AntLink: { type: "Selector", all: ["自动选择", "Japan 02 S | x3.0", "United States 01 H  ipv6 only | x1.0"] },
    "自动选择": { type: "URLTest" },
    "Japan 02 S | x3.0": { type: "Shadowsocks" },
    "United States 01 H  ipv6 only | x1.0": { type: "Hysteria2" },
    GLOBAL: { type: "Selector", all: ["DIRECT", "Japan 02 S | x3.0"] }
  };

  assert.equal(findPrimarySelector(proxies), "AntLink");
  assert.equal(findGlobalSelector(proxies), "GLOBAL");

  const regions = buildRegionList(proxies, proxies.AntLink);
  assert.deepEqual(regions.map((region) => region.name), ["Japan"]);
  assert.deepEqual(selectNodesByRegion(regions, "Japan"), ["Japan 02 S | x3.0"]);
});

test("nodeRank prefers regular SS nodes over Hysteria fallback nodes", () => {
  const hNode = nodeRank("Japan 01 H | x1.0", { type: "Hysteria2" });
  const ssNode = nodeRank("Japan 02 S | x3.0", { type: "Shadowsocks" });
  assert.ok(ssNode < hNode);
});

test("parseIp extracts an external IP from curl output", () => {
  assert.equal(parseIp("progress\n91.149.238.32"), "91.149.238.32");
  assert.equal(parseIp("curl failed"), "");
});
