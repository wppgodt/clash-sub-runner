"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DEFAULT_UI_PORT, UI_PORT_FALLBACK_COUNT } = require("../src/constants");
const { Logger } = require("../src/logger");
const { discoverUiPort, resolveUiPortCandidates } = require("../src/local-api");
const { buildUiPortCandidates } = require("../src/server");
const { VpnService } = require("../src/service");
const { todayStamp } = require("../src/utils");

test("GUI API uses a bounded fallback port range", () => {
  assert.deepEqual(buildUiPortCandidates(DEFAULT_UI_PORT), Array.from(
    { length: UI_PORT_FALLBACK_COUNT },
    (_, index) => DEFAULT_UI_PORT + index
  ));
});

test("local API discovery checks default fallback ports", () => {
  const ports = resolveUiPortCandidates();
  assert.equal(new Set(ports).size, ports.length);
  assert.ok(ports.includes(DEFAULT_UI_PORT));
  assert.ok(ports.includes(DEFAULT_UI_PORT + UI_PORT_FALLBACK_COUNT - 1));
  assert.equal(typeof discoverUiPort, "function");
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "local-api.js"), "utf8");
  assert.match(source, /status && status\.app/);
});

test("start.sh delegates to Node instead of PowerShell", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "start.sh"), "utf8");
  assert.match(source, /node scripts\/start-console\.js "\$@"/);
  assert.doesNotMatch(source, /pwsh|powershell\.exe|-File|-ExecutionPolicy/i);
});

test("logger GUI tail starts with the current process session", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "clash-sub-runner-logs-"));
  const context = { logDir: dir, baseDir: dir };
  fs.writeFileSync(path.join(dir, `app-${todayStamp()}.log`), "old session line\n", "utf8");
  const logger = new Logger(context);
  logger.info("fresh event");
  const tail = logger.tail();
  assert.match(tail, /Log session started/);
  assert.match(tail, /fresh event/);
  assert.doesNotMatch(tail, /old session line/);
});

test("speed tests persist progress for the GUI", async () => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "clash-sub-runner-progress-"));
  const dataDir = path.join(baseDir, "data");
  const context = {
    baseDir,
    dataDir,
    logDir: path.join(dataDir, "logs"),
    statePath: path.join(dataDir, "app-state.json"),
    configPath: path.join(dataDir, "config.yaml"),
    corePath: path.join(dataDir, "core", "mihomo.exe"),
    subscriptionPath: path.join(baseDir, "subscription.txt"),
    uiPortPath: path.join(dataDir, "ui-port.json"),
    uiPort: DEFAULT_UI_PORT
  };
  const service = new VpnService(context, { systemProxy: false, autoDownloadCore: false });
  service.client = {
    proxies: async () => ({
      proxies: {
        AntLink: { type: "Selector", all: ["Japan 01 S | x3.0", "England 01 | x1.0"] },
        "Japan 01 S | x3.0": { type: "Shadowsocks" },
        "England 01 | x1.0": { type: "Shadowsocks" }
      }
    }),
    delay: async (name) => ({ delay: name.includes("Japan") ? 120 : 240 })
  };

  const results = await service.testDelays();
  const state = JSON.parse(fs.readFileSync(context.statePath, "utf8"));
  assert.equal(results.length, 2);
  assert.equal(state.speedTestProgress.active, false);
  assert.equal(state.speedTestProgress.phase, "Completed");
  assert.equal(state.speedTestProgress.percent, 100);
  assert.equal(state.speedTestProgress.current, 2);
  assert.equal(state.speedTestProgress.total, 2);
  assert.equal(state.lastDelayTest.ok, 2);
});

test("refresh fallback returns structured cached result", async () => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "clash-sub-runner-cached-refresh-"));
  const dataDir = path.join(baseDir, "data");
  fs.mkdirSync(dataDir, { recursive: true });
  const context = {
    baseDir,
    dataDir,
    logDir: path.join(dataDir, "logs"),
    statePath: path.join(dataDir, "app-state.json"),
    configPath: path.join(dataDir, "config.yaml"),
    corePath: path.join(dataDir, "core", "mihomo.exe"),
    subscriptionPath: path.join(baseDir, "subscription.txt"),
    uiPortPath: path.join(dataDir, "ui-port.json"),
    uiPort: DEFAULT_UI_PORT
  };
  fs.writeFileSync(context.configPath, "cached config", "utf8");
  const service = new VpnService(context, { systemProxy: false, autoDownloadCore: false });
  service.refresh = async () => {
    throw new Error("HTTP 502 from provider");
  };

  const result = await service.refreshWithFallbackResult();
  const state = JSON.parse(fs.readFileSync(context.statePath, "utf8"));
  assert.equal(result.ok, true);
  assert.equal(result.cached, true);
  assert.match(result.warning, /cached config/);
  assert.equal(state.lastSubscriptionRefresh.cached, true);
  assert.equal(state.refreshProgress.active, false);
  assert.equal(state.refreshProgress.cached, true);
  assert.equal(state.refreshProgress.percent, 100);
});

test("stopped status does not report saved node as currently active", async () => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "clash-sub-runner-stopped-selection-"));
  const dataDir = path.join(baseDir, "data");
  fs.mkdirSync(dataDir, { recursive: true });
  const context = {
    baseDir,
    dataDir,
    logDir: path.join(dataDir, "logs"),
    statePath: path.join(dataDir, "app-state.json"),
    configPath: path.join(dataDir, "config.yaml"),
    corePath: path.join(dataDir, "core", "mihomo.exe"),
    subscriptionPath: path.join(baseDir, "subscription.txt"),
    uiPortPath: path.join(dataDir, "ui-port.json"),
    uiPort: DEFAULT_UI_PORT
  };
  fs.writeFileSync(context.statePath, JSON.stringify({
    mode: "rule",
    selectedRegion: "Japan",
    selectedNode: "Japan 02 IEPL S | x3.0",
    lastConnectivity: {
      ok: false,
      error: "old TLS failure",
      testedAt: "2026-06-05T12:17:51.173Z"
    }
  }), "utf8");

  const service = new VpnService(context, { systemProxy: false, autoDownloadCore: false });
  service.client = {
    configs: async () => {
      throw new Error("controller stopped");
    },
    proxies: async () => {
      throw new Error("controller stopped");
    }
  };
  service.getNetworkPath = async () => ({ id: "warp", components: {}, evidence: [] });

  const status = await service.status();
  assert.equal(status.running, false);
  assert.equal(status.mode, "");
  assert.equal(status.selectedRegion, "");
  assert.equal(status.selectedNode, "");
  assert.doesNotMatch(status.issues.join("\n"), /old TLS failure/);
  assert.doesNotMatch(status.issues.join("\n"), /Last external connectivity test failed/);
  assert.deepEqual(status.savedSelection, {
    mode: "rule",
    selectedRegion: "Japan",
    selectedNode: "Japan 02 IEPL S | x3.0"
  });
});
