"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildNetworkPath, parseTrace, readProxyEnv } = require("../src/network-path");

test("network path detects WARP as the default route when Clash is not capturing", () => {
  const path = buildNetworkPath({
    proxyPort: 7890,
    systemProxy: { ProxyEnable: 0, ProxyServer: "" },
    mihomo: { running: false },
    trace: { reachable: true, warp: "on", ip: "104.28.1.2", loc: "US", colo: "LAX" },
    warp: { available: true, connected: true, healthy: true }
  });

  assert.equal(path.id, "warp");
  assert.equal(path.shortLabel, "WARP");
  assert.deepEqual(path.steps.map((step) => step.label), ["App", "Windows route", "Cloudflare WARP", "Target"]);
});

test("network path detects Windows system proxy capture into Clash global mode", () => {
  const path = buildNetworkPath({
    proxyPort: 7890,
    systemProxy: { ProxyEnable: 1, ProxyServer: "127.0.0.1:7890" },
    mihomo: { running: true, controllerReachable: true, mode: "global", mixedPort: 7890 },
    trace: { reachable: true, warp: "off", ip: "203.0.113.10" },
    warp: { available: true, connected: false, healthy: false }
  });

  assert.equal(path.id, "clash-proxy");
  assert.equal(path.capture.id, "system-proxy");
  assert.equal(path.components.clash.capturing, true);
  assert.match(path.steps.map((step) => step.label).join(" > "), /Proxy node/);
});

test("network path detects Clash TUN capture without Windows system proxy", () => {
  const path = buildNetworkPath({
    proxyPort: 7890,
    systemProxy: { ProxyEnable: 0, ProxyServer: "" },
    mihomo: { running: true, controllerReachable: true, mode: "rule", mixedPort: 7890, tunEnabled: true },
    trace: { reachable: true, warp: "off", ip: "203.0.113.20" }
  });

  assert.equal(path.id, "clash-rule");
  assert.equal(path.capture.id, "clash-tun");
  assert.equal(path.components.clash.captureMethod, "tun");
});

test("network path reports broken local proxy when Clash is not reachable", () => {
  const path = buildNetworkPath({
    proxyPort: 7890,
    systemProxy: { ProxyEnable: 1, ProxyServer: "http=127.0.0.1:7890;https=127.0.0.1:7890" },
    mihomo: { running: false },
    trace: { reachable: false, warp: "unknown" }
  });

  assert.equal(path.id, "broken-local-proxy");
  assert.equal(path.shortLabel, "Broken");
  assert.match(path.label, /not reachable/);
});

test("trace and proxy environment parsers keep useful fields", () => {
  assert.deepEqual(parseTrace("ip=104.28.1.2\ncolo=LAX\nwarp=on\ngateway=off\n"), {
    ip: "104.28.1.2",
    colo: "LAX",
    warp: "on",
    gateway: "off"
  });

  const env = readProxyEnv({
    HTTPS_PROXY: "http://user:secret@127.0.0.1:7890",
    NO_PROXY: "localhost"
  }, 7890);
  assert.equal(env.active, true);
  assert.equal(env.local, true);
  assert.match(env.entries[0].value, /\*\*\*/);
  assert.doesNotMatch(env.entries[0].value, /secret/);
});
