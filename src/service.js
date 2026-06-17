"use strict";

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const {
  CONNECTIVITY_URL,
  DEFAULT_PROXY_PORT,
  HTTPS_TEST_URL
} = require("./constants");
const { Logger } = require("./logger");
const { ensureCore, MihomoClient, startCore } = require("./mihomo");
const { inspectNetworkPath } = require("./network-path");
const { buildRegionList, findGlobalSelector, findPrimarySelector, selectNodesByRegion } = require("./regions");
const { readSubscription, refreshConfig, maskUrl } = require("./subscription");
const { enableSystemProxy, isLocalProxy, readCurrentProxy, restoreSystemProxy } = require("./system-proxy");
const { ensureDir, execFileAsync, sleep } = require("./utils");

class VpnService {
  constructor(context, options = {}) {
    this.context = context;
    this.options = {
      proxyPort: options.proxyPort || DEFAULT_PROXY_PORT,
      systemProxy: options.systemProxy !== false,
      autoDownloadCore: options.autoDownloadCore !== false,
      corePath: options.corePath || context.corePath
    };
    this.client = new MihomoClient();
    this.logger = new Logger(context);
    this.child = null;
    this.lastStatus = null;
    this.networkPathCache = { at: 0, value: null };
    this.networkPathInFlight = null;
    this.starting = false;
    ensureDir(context.dataDir);
    ensureDir(context.logDir);
  }

  loadState() {
    if (!fs.existsSync(this.context.statePath)) {
      return {};
    }
    try {
      return JSON.parse(fs.readFileSync(this.context.statePath, "utf8"));
    } catch {
      return {};
    }
  }

  saveState(patch) {
    ensureDir(this.context.dataDir);
    const state = {
      ...this.loadState(),
      ...patch,
      updatedAt: new Date().toISOString()
    };
    fs.writeFileSync(this.context.statePath, JSON.stringify(state, null, 2), "utf8");
    return state;
  }

  saveSpeedTestProgress(patch) {
    const state = this.loadState();
    const previous = state.speedTestProgress || {};
    return this.saveState({
      speedTestProgress: {
        ...previous,
        ...patch,
        updatedAt: new Date().toISOString()
      }
    });
  }

  saveRefreshProgress(patch) {
    const state = this.loadState();
    const previous = state.refreshProgress || {};
    return this.saveState({
      refreshProgress: {
        ...previous,
        ...patch,
        updatedAt: new Date().toISOString()
      }
    });
  }

  async refresh(subscriptionOverride = "") {
    const subscriptionUrl = readSubscription(this.context, subscriptionOverride);
    this.saveRefreshProgress({
      active: true,
      phase: "Refreshing subscription",
      attempt: 1,
      attempts: 3,
      percent: 10,
      cached: false,
      error: "",
      startedAt: new Date().toISOString()
    });
    this.logger.info("Refreshing subscription", { subscription: maskUrl(subscriptionUrl) });
    const configPath = await refreshConfig(this.context, subscriptionUrl, this.options.proxyPort, {
      attempts: 3,
      retryDelayMs: 1200,
      onRetry: ({ attempt, attempts, error }) => {
        this.saveRefreshProgress({
          active: true,
          phase: `Retrying subscription refresh ${attempt + 1}/${attempts}`,
          attempt: attempt + 1,
          attempts,
          percent: Math.min(85, 10 + Math.round((attempt / attempts) * 70)),
          error: error.message
        });
        this.logger.warn("Subscription refresh retrying", {
          attempt,
          attempts,
          error: error.message
        });
      }
    });
    this.saveState({
      lastSubscriptionRefresh: {
        ok: true,
        cached: false,
        error: "",
        checkedAt: new Date().toISOString()
      }
    });
    this.saveRefreshProgress({
      active: false,
      phase: "Subscription refreshed",
      attempt: 3,
      attempts: 3,
      percent: 100,
      cached: false,
      error: "",
      finishedAt: new Date().toISOString()
    });
    this.logger.info("Subscription config refreshed", { configPath });
    return configPath;
  }

  async refreshWithFallback(subscriptionOverride = "") {
    const result = await this.refreshWithFallbackResult(subscriptionOverride);
    return result.configPath;
  }

  async refreshWithFallbackResult(subscriptionOverride = "") {
    try {
      const configPath = await this.refresh(subscriptionOverride);
      return { ok: true, cached: false, configPath, warning: "", error: "" };
    } catch (error) {
      const value = {
        ok: false,
        cached: fs.existsSync(this.context.configPath),
        error: error.message,
        checkedAt: new Date().toISOString()
      };
      this.saveState({ lastSubscriptionRefresh: value });
      if (!fs.existsSync(this.context.configPath)) {
        this.saveRefreshProgress({
          active: false,
          phase: "Refresh failed",
          percent: 0,
          cached: false,
          error: error.message,
          finishedAt: new Date().toISOString()
        });
        this.logger.error("Subscription refresh failed without cached config", { error: error.message });
        throw error;
      }
      this.saveRefreshProgress({
        active: false,
        phase: "Using cached config",
        percent: 100,
        cached: true,
        error: error.message,
        finishedAt: new Date().toISOString()
      });
      this.logger.warn("Subscription refresh used cached config", { error: error.message });
      return {
        ok: true,
        cached: true,
        configPath: this.context.configPath,
        warning: `Subscription server is unavailable; cached config is in use: ${error.message}`,
        error: error.message
      };
    }
  }

  async start(options = {}) {
    if (this.starting) {
      return { ok: true, message: "Start already in progress." };
    }
    this.starting = true;

    try {
      await this.refreshWithFallback(options.subscription || "");

      const reachable = await this.client.isReachable();
      if (!reachable) {
        const corePath = await ensureCore(this.context, {
          corePath: this.options.corePath,
          autoDownloadCore: this.options.autoDownloadCore
        });
        this.logger.info("Starting Mihomo core", { corePath });
        this.child = startCore(this.context, corePath, this.logger);
        this.child.on("exit", (code, signal) => {
          this.logger.warn("Mihomo core exited", { code, signal });
          this.child = null;
        });
        await this.waitForController();
      } else {
        this.logger.info("Attached to existing Mihomo controller");
      }

      if (this.options.systemProxy) {
        const proxyServer = await enableSystemProxy(this.context, this.options.proxyPort);
        this.logger.info("Windows system proxy enabled", { proxyServer });
      }

      const state = this.loadState();
      if (state.mode) {
        await this.setMode(state.mode);
      }
      if (state.selectedNode) {
        await this.selectNode(state.selectedNode);
      }

      this.invalidateNetworkPath();
      return { ok: true };
    } finally {
      this.starting = false;
    }
  }

  async waitForController() {
    for (let i = 0; i < 30; i += 1) {
      if (await this.client.isReachable()) {
        return;
      }
      await sleep(400);
    }
    throw new Error("Mihomo controller did not become ready.");
  }

  async stop() {
    this.logger.info("Stopping service");
    await restoreSystemProxy(this.context, { port: this.options.proxyPort }).catch((error) => {
      this.logger.warn("Failed to restore system proxy during stop", { error: error.message });
    });

    if (this.child && !this.child.killed) {
      this.child.kill();
      this.child = null;
    } else {
      await this.killOwnedMihomoProcesses();
    }

    this.invalidateNetworkPath();
    return { ok: true };
  }

  async killOwnedMihomoProcesses() {
    const corePath = path.resolve(this.context.corePath).toLowerCase();
    const script = [
      "$ErrorActionPreference = 'SilentlyContinue'",
      "Get-CimInstance Win32_Process -Filter \"Name = 'mihomo.exe'\" | ConvertTo-Json -Compress"
    ].join("; ");

    try {
      const result = await execFileAsync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script]);
      if (!result.stdout.trim()) {
        return;
      }
      const parsed = JSON.parse(result.stdout);
      const processes = Array.isArray(parsed) ? parsed : [parsed];
      for (const proc of processes) {
        const commandLine = String(proc.CommandLine || "").toLowerCase();
        if (commandLine.includes(corePath) || commandLine.includes(path.resolve(this.context.dataDir).toLowerCase())) {
          await execFileAsync("powershell.exe", ["-NoProfile", "-Command", `Stop-Process -Id ${Number(proc.ProcessId)} -Force`]);
          this.logger.info("Stopped owned Mihomo process", { pid: proc.ProcessId });
        }
      }
    } catch (error) {
      this.logger.warn("Could not inspect Mihomo processes", { error: error.message });
    }
  }

  async reset() {
    this.logger.info("Reset requested");
    const wasRunning = await this.client.isReachable();
    await this.stop();
    await this.waitForControllerDown();

    for (const file of ["cache.db", "cache.db-shm", "cache.db-wal"]) {
      this.safeRemove(path.join(this.context.dataDir, file));
    }
    this.safeRemove(this.context.proxyBackupPath);
    this.saveState({
      mode: "rule",
      selectedRegion: "",
      selectedNode: "",
      lastResetAt: new Date().toISOString()
    });

    if (wasRunning) {
      await this.start();
      await this.setMode("rule");
    }

    return { ok: true };
  }

  async waitForControllerDown() {
    for (let i = 0; i < 20; i += 1) {
      if (!(await this.client.isReachable())) {
        return;
      }
      await sleep(250);
    }
  }

  safeRemove(file) {
    try {
      fs.rmSync(file, { force: true });
    } catch (error) {
      this.logger.warn("Could not remove runtime file during reset", { file, error: error.message });
    }
  }

  async setMode(mode) {
    const normalized = String(mode || "").toLowerCase();
    if (!["rule", "global", "direct"].includes(normalized)) {
      throw new Error("Mode must be one of: rule, global, direct.");
    }

    await this.client.setMode(normalized);
    const proxies = await this.client.proxies();
    const proxyMap = proxies.proxies || {};

    if (normalized === "global") {
      const globalGroup = findGlobalSelector(proxyMap);
      const primaryGroup = findPrimarySelector(proxyMap);
      const selected = this.loadState().selectedNode || (primaryGroup && proxyMap[primaryGroup] ? proxyMap[primaryGroup].now : "");
      if (globalGroup && selected && Array.isArray(proxyMap[globalGroup].all) && proxyMap[globalGroup].all.includes(selected)) {
        await this.client.select(globalGroup, selected);
      }
    }

    this.saveState({ mode: normalized });
    this.invalidateNetworkPath();
    this.logger.info("Mode changed", { mode: normalized });
    return { ok: true, mode: normalized };
  }

  async setRegion(query) {
    const data = await this.client.proxies();
    const proxyMap = data.proxies || {};
    const primaryGroup = findPrimarySelector(proxyMap);
    if (!primaryGroup) {
      throw new Error("No selectable proxy group was found.");
    }

    const regions = buildRegionList(proxyMap, proxyMap[primaryGroup]);
    const candidates = selectNodesByRegion(regions, query);
    if (!candidates.length) {
      throw new Error(`No node matched region or name: ${query}`);
    }

    const selectedNode = await this.pickBestNode(candidates, proxyMap);
    await this.selectNode(selectedNode, primaryGroup, proxyMap);
    const selectedRegion = regions.find((region) => region.nodes.some((node) => node.name === selectedNode));
    this.saveState({
      selectedRegion: selectedRegion ? selectedRegion.name : String(query || ""),
      selectedNode
    });
    this.logger.info("Region selected", { query, selectedNode });
    return { ok: true, selectedNode, selectedRegion: selectedRegion ? selectedRegion.name : "" };
  }

  async selectNode(selectedNode, primaryGroup = "", proxyMap = null) {
    if (!proxyMap) {
      const data = await this.client.proxies();
      proxyMap = data.proxies || {};
    }
    const group = primaryGroup || findPrimarySelector(proxyMap);
    if (!group) {
      throw new Error("No selectable proxy group was found.");
    }
    if (!Array.isArray(proxyMap[group].all) || !proxyMap[group].all.includes(selectedNode)) {
      throw new Error(`Node is not available in ${group}: ${selectedNode}`);
    }
    await this.client.select(group, selectedNode);

    const globalGroup = findGlobalSelector(proxyMap);
    const mode = this.loadState().mode;
    if (mode === "global" && globalGroup && Array.isArray(proxyMap[globalGroup].all) && proxyMap[globalGroup].all.includes(selectedNode)) {
      await this.client.select(globalGroup, selectedNode);
    }
  }

  async pickBestNode(candidates, proxyMap = {}) {
    if (candidates.length === 1) {
      return candidates[0];
    }

    const limited = candidates.slice(0, 12);
    const results = await Promise.all(limited.map(async (name) => {
      try {
        const result = await this.client.delay(name, 5000, CONNECTIVITY_URL);
        return { name, delay: Number(result.delay) || Infinity, rank: nodeRank(name, proxyMap[name]) };
      } catch {
        return { name, delay: Infinity, rank: nodeRank(name, proxyMap[name]) };
      }
    }));

    results.sort((a, b) => {
      const aScore = Number.isFinite(a.delay) ? a.delay + a.rank : Infinity;
      const bScore = Number.isFinite(b.delay) ? b.delay + b.rank : Infinity;
      if (aScore !== bScore) {
        return aScore - bScore;
      }
      return a.rank - b.rank;
    });

    if (Number.isFinite(results[0].delay)) {
      return results[0].name;
    }

    return [...candidates].sort((a, b) => nodeRank(a, proxyMap[a]) - nodeRank(b, proxyMap[b]))[0];
  }

  async testDelays() {
    try {
      const data = await this.client.proxies();
      const proxyMap = data.proxies || {};
      const primaryGroup = findPrimarySelector(proxyMap);
      const regions = buildRegionList(proxyMap, primaryGroup ? proxyMap[primaryGroup] : null);
      const nodes = regions.flatMap((region) => region.nodes.map((node) => ({
        region: region.name,
        name: node.name
      }))).slice(0, 80);

      this.saveSpeedTestProgress({
        active: true,
        phase: nodes.length ? "Testing nodes" : "No nodes available",
        current: 0,
        total: nodes.length,
        ok: 0,
        percent: nodes.length ? 0 : 100,
        error: "",
        startedAt: new Date().toISOString()
      });

      const results = [];
      for (let i = 0; i < nodes.length; i += 8) {
        const batch = nodes.slice(i, i + 8);
        const tested = await Promise.all(batch.map(async (node) => {
          try {
            const result = await this.client.delay(node.name, 5000, CONNECTIVITY_URL);
            return { ...node, ok: true, delay: Number(result.delay) || null };
          } catch (error) {
            return { ...node, ok: false, error: error.message };
          }
        }));
        results.push(...tested);
        const ok = results.filter((item) => item.ok).length;
        this.saveSpeedTestProgress({
          active: true,
          phase: `Testing nodes ${results.length}/${nodes.length}`,
          current: results.length,
          total: nodes.length,
          ok,
          percent: nodes.length ? Math.min(99, Math.round((results.length / nodes.length) * 100)) : 100
        });
      }

      this.logger.info("Delay test completed", {
        total: results.length,
        ok: results.filter((item) => item.ok).length
      });
      const ok = results.filter((item) => item.ok).length;
      const sorted = [...results].sort((a, b) => {
        if (a.ok !== b.ok) {
          return a.ok ? -1 : 1;
        }
        return (a.delay || Infinity) - (b.delay || Infinity);
      });
      const finishedAt = new Date().toISOString();
      this.saveState({
        lastDelayTest: {
          testedAt: finishedAt,
          total: results.length,
          ok,
          results: sorted.slice(0, 60)
        },
        speedTestProgress: {
          active: false,
          phase: "Completed",
          current: results.length,
          total: results.length,
          ok,
          percent: 100,
          error: "",
          finishedAt,
          updatedAt: finishedAt
        }
      });
      return results;
    } catch (error) {
      const finishedAt = new Date().toISOString();
      this.saveSpeedTestProgress({
        active: false,
        phase: "Failed",
        error: error.message,
        percent: 0,
        finishedAt
      });
      throw error;
    }
  }

  async connectivityTest() {
    this.saveSpeedTestProgress({
      active: true,
      phase: "Checking external connectivity",
      current: 0,
      total: 0,
      ok: 0,
      percent: 0,
      error: "",
      startedAt: new Date().toISOString()
    });
    const result = await runCurlThroughProxy(this.options.proxyPort, HTTPS_TEST_URL);
    const ip = parseIp(result.stdout);
    const value = {
      ok: result.ok && Boolean(ip),
      ip,
      code: result.code,
      error: result.ok ? "" : result.stderr.trim().split(/\r?\n/).slice(-1)[0] || "curl failed"
    };
    const testedAt = new Date().toISOString();
    this.saveState({
      lastConnectivity: { ...value, testedAt },
      speedTestProgress: {
        ...this.loadState().speedTestProgress,
        active: true,
        phase: value.ok ? "External connectivity OK" : "External connectivity failed",
        percent: 5,
        error: value.ok ? "" : value.error,
        updatedAt: testedAt
      }
    });
    this.logger.info("Connectivity test completed", value);
    return value;
  }

  async status() {
    const state = this.loadState();
    let proxy = await readCurrentProxy().catch((error) => ({ error: error.message }));
    const configStat = fs.existsSync(this.context.configPath) ? fs.statSync(this.context.configPath) : null;
    const coreStat = fs.existsSync(this.context.corePath) ? fs.statSync(this.context.corePath) : null;

    const base = {
      app: {
        baseDir: this.context.baseDir,
        dataDir: this.context.dataDir,
        uiPort: this.context.uiPort,
        childPid: this.child ? this.child.pid : null,
        starting: this.starting
      },
      files: {
        subscription: fs.existsSync(this.context.subscriptionPath),
        config: fs.existsSync(this.context.configPath),
        configMtime: configStat ? configStat.mtime.toISOString() : "",
        core: fs.existsSync(this.context.corePath),
        coreMtime: coreStat ? coreStat.mtime.toISOString() : ""
      },
      systemProxy: proxy,
      state,
      running: false,
      controllerReachable: false,
      mode: "",
      selectedNode: "",
      selectedRegion: "",
      savedSelection: {
        mode: state.mode || "",
        selectedNode: state.selectedNode || "",
        selectedRegion: state.selectedRegion || ""
      },
      regions: [],
      groups: {},
      mihomo: {
        mixedPort: this.options.proxyPort,
        tunEnabled: false
      },
      networkPath: null,
      issues: []
    };

    try {
      const [configs, proxyData] = await Promise.all([
        this.client.configs(),
        this.client.proxies()
      ]);
      const proxyMap = proxyData.proxies || {};
      const primaryGroup = findPrimarySelector(proxyMap);
      const globalGroup = findGlobalSelector(proxyMap);
      const regions = buildRegionList(proxyMap, primaryGroup ? proxyMap[primaryGroup] : null);
      base.running = true;
      base.controllerReachable = true;
      base.mode = configs.mode || base.mode;
      base.selectedNode = primaryGroup && proxyMap[primaryGroup] ? proxyMap[primaryGroup].now : base.selectedNode;
      base.selectedRegion = regions.find((region) => region.nodes.some((node) => node.name === base.selectedNode))?.name || base.selectedRegion;
      base.regions = regions;
      base.groups = {
        primary: primaryGroup,
        primaryNow: primaryGroup && proxyMap[primaryGroup] ? proxyMap[primaryGroup].now : "",
        global: globalGroup,
        globalNow: globalGroup && proxyMap[globalGroup] ? proxyMap[globalGroup].now : ""
      };
      base.mihomo = {
        mixedPort: Number(configs["mixed-port"] || this.options.proxyPort),
        tunEnabled: Boolean(configs.tun && configs.tun.enable)
      };
    } catch (error) {
      if (this.starting || this.child) {
        base.issues.push(`Controller unavailable: ${error.message}`);
      }
    }

    if (!base.running && !this.starting && isLocalProxy(proxy, this.options.proxyPort)) {
      try {
        const restored = await restoreSystemProxy(this.context, { port: this.options.proxyPort });
        if (restored) {
          proxy = await readCurrentProxy().catch(() => proxy);
          base.systemProxy = proxy;
          this.invalidateNetworkPath();
          base.issues.push("Windows system proxy pointed to Clash Sub Runner while Mihomo was stopped; restored system proxy.");
          this.logger.warn("Restored dangling Windows system proxy", { proxyPort: this.options.proxyPort });
        }
      } catch (error) {
        base.issues.push(`Windows system proxy points to Clash Sub Runner, but Mihomo is stopped and restore failed: ${error.message}`);
      }
    }

    if (proxy.ProxyEnable === 1 && proxy.ProxyServer !== `127.0.0.1:${this.options.proxyPort}`) {
      base.issues.push(`System proxy points to ${proxy.ProxyServer || "(empty)"}, not 127.0.0.1:${this.options.proxyPort}.`);
    }
    if (!base.files.config) {
      base.issues.push("Config file is missing.");
    }
    if (!base.files.core) {
      base.issues.push("Mihomo core is missing.");
    }
    if (base.running && proxy.ProxyEnable !== 1) {
      base.issues.push("Mihomo is running but Windows system proxy is off.");
    }
    if (base.running && isLocalProxy(proxy, this.options.proxyPort) && state.lastConnectivity && state.lastConnectivity.ok === false) {
      base.issues.push(`Last external connectivity test failed: ${state.lastConnectivity.error || "unknown error"}.`);
    }
    if (state.lastSubscriptionRefresh && state.lastSubscriptionRefresh.ok === false) {
      base.issues.push(state.lastSubscriptionRefresh.cached
        ? `Subscription refresh failed; cached config is in use: ${state.lastSubscriptionRefresh.error || "unknown error"}.`
        : `Subscription refresh failed and no cached config is available: ${state.lastSubscriptionRefresh.error || "unknown error"}.`);
    }

    base.networkPath = await this.getNetworkPath(base);
    this.lastStatus = base;
    return base;
  }

  async getNetworkPath(status, options = {}) {
    const now = Date.now();
    const ttlMs = options.force ? 0 : 8000;
    if (this.networkPathCache.value && now - this.networkPathCache.at < ttlMs) {
      return this.networkPathCache.value;
    }
    if (this.networkPathInFlight) {
      return this.networkPathInFlight;
    }

    this.networkPathInFlight = inspectNetworkPath({
      systemProxy: status.systemProxy,
      proxyPort: this.options.proxyPort,
      mihomo: {
        running: status.running,
        controllerReachable: status.controllerReachable,
        mode: status.running ? status.mode : "",
        mixedPort: status.mihomo && status.mihomo.mixedPort,
        tunEnabled: status.mihomo && status.mihomo.tunEnabled,
        selectedNode: status.running ? status.selectedNode : ""
      }
    }).then((value) => {
      this.networkPathCache = { at: Date.now(), value };
      return value;
    }).catch((error) => {
      const fallback = {
        id: "unknown",
        label: `Network path inspection failed: ${error.message}`,
        shortLabel: "Unknown",
        confidence: "low",
        capture: { id: "unknown", label: "Unknown" },
        steps: [
          { id: "step-1", label: "App" },
          { id: "step-2", label: "Unknown route" }
        ],
        components: {},
        recommendations: [],
        evidence: [error.message]
      };
      this.networkPathCache = { at: Date.now(), value: fallback };
      return fallback;
    }).finally(() => {
      this.networkPathInFlight = null;
    });

    return this.networkPathInFlight;
  }

  invalidateNetworkPath() {
    this.networkPathCache = { at: 0, value: null };
  }

  async mcpConfig() {
    const exe = process.execPath;
    return {
      codex: {
        mcpServers: {
          clashSubRunner: {
            command: exe,
            args: ["--mcp"]
          }
        }
      },
      claude_desktop: {
        mcpServers: {
          clashSubRunner: {
            command: exe,
            args: ["--mcp"]
          }
        }
      }
    };
  }
}

function nodeRank(name, proxy) {
  let score = 0;
  const text = String(name || "");
  const type = String(proxy && proxy.type || "");
  if (/\bipv6 only\b/i.test(text)) {
    score += 10000;
  }
  if (/hysteria/i.test(type) || /\sH\s*(?:ipv6 only\s*)?\|/i.test(text)) {
    score += 2000;
  }
  if (/IEPL/i.test(text)) {
    score -= 80;
  }
  if (/\bS\s*\|/i.test(text)) {
    score -= 40;
  }
  return score;
}

function runCurlThroughProxy(proxyPort, url) {
  return new Promise((resolve) => {
    const args = ["-L", "-k", "--ssl-no-revoke", "--proxy", `http://127.0.0.1:${proxyPort}`, "--max-time", "20", url];
    const child = spawn("curl.exe", args, { windowsHide: true });
    const chunks = [];
    const errors = [];
    child.stdout.on("data", (chunk) => chunks.push(chunk));
    child.stderr.on("data", (chunk) => errors.push(chunk));
    child.on("exit", (code) => {
      resolve({
        ok: code === 0,
        code,
        stdout: Buffer.concat(chunks).toString("utf8"),
        stderr: Buffer.concat(errors).toString("utf8")
      });
    });
  });
}

function parseIp(text) {
  const match = String(text || "").match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/);
  return match ? match[0] : "";
}

module.exports = {
  nodeRank,
  parseIp,
  VpnService,
  runCurlThroughProxy
};
