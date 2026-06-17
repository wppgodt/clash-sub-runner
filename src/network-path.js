"use strict";

const fs = require("fs");
const { DEFAULT_PROXY_PORT } = require("./constants");
const { execFileAsync, requestBuffer, stripAnsi } = require("./utils");
const { isLocalProxy } = require("./system-proxy");

const CLOUDFLARE_TRACE_URL = "https://www.cloudflare.com/cdn-cgi/trace";
const WARP_CLI_PATH = "C:\\Program Files\\Cloudflare\\Cloudflare WARP\\warp-cli.exe";

async function inspectNetworkPath(options = {}) {
  const [winhttp, warp, trace] = await Promise.all([
    safeRead(readWinHttpProxy, {
      available: false,
      direct: false,
      proxy: "",
      raw: ""
    }),
    safeRead(readWarpStatus, {
      available: false,
      connected: false,
      healthy: false,
      network: "",
      raw: ""
    }),
    safeRead(readCloudflareTrace, {
      reachable: false,
      ip: "",
      colo: "",
      loc: "",
      warp: "unknown",
      gateway: "unknown",
      raw: ""
    })
  ]);

  return buildNetworkPath({
    systemProxy: options.systemProxy || {},
    proxyPort: options.proxyPort || DEFAULT_PROXY_PORT,
    mihomo: normalizeMihomo(options.mihomo || {}, options.proxyPort || DEFAULT_PROXY_PORT),
    envProxy: readProxyEnv(options.env || process.env, options.proxyPort || DEFAULT_PROXY_PORT),
    winhttp,
    warp,
    trace
  });
}

async function safeRead(reader, fallback) {
  try {
    return {
      ...fallback,
      ...(await reader())
    };
  } catch (error) {
    return {
      ...fallback,
      error: trimError(error.message)
    };
  }
}

async function readWinHttpProxy() {
  const result = await execFileAsync("netsh", ["winhttp", "show", "proxy"], { timeout: 5000 });
  const raw = stripAnsi(result.stdout || "");
  const proxy = matchLine(raw, /Proxy Server\(s\)\s*:\s*(.+)/i);
  return {
    available: true,
    direct: /Direct access/i.test(raw),
    proxy,
    raw: brief(raw)
  };
}

async function readWarpStatus() {
  const command = fs.existsSync(WARP_CLI_PATH) ? WARP_CLI_PATH : "warp-cli";
  const result = await execFileAsync(command, ["status"], { timeout: 7000 });
  const raw = stripAnsi(result.stdout || "");
  const disconnected = /\bDisconnected\b/i.test(raw);
  const connected = !disconnected && (/\bConnected\b/i.test(raw) || /Status update:\s*Connected/i.test(raw));
  return {
    available: true,
    connected,
    healthy: /Network:\s*healthy/i.test(raw) || /Status update:\s*Connected/i.test(raw),
    network: matchLine(raw, /Network:\s*(.+)/i),
    raw: brief(raw)
  };
}

async function readCloudflareTrace() {
  const buffer = await requestBuffer(CLOUDFLARE_TRACE_URL, {
    accept: "text/plain, */*",
    timeout: 7000
  });
  const raw = stripAnsi(buffer.toString("utf8"));
  const fields = parseTrace(raw);
  return {
    reachable: true,
    ip: fields.ip || "",
    colo: fields.colo || "",
    loc: fields.loc || "",
    warp: fields.warp || "unknown",
    gateway: fields.gateway || "unknown",
    raw: brief(raw)
  };
}

function buildNetworkPath(input = {}) {
  const proxyPort = input.proxyPort || DEFAULT_PROXY_PORT;
  const systemProxy = normalizeSystemProxy(input.systemProxy);
  const mihomo = normalizeMihomo(input.mihomo || {}, proxyPort);
  const envProxy = input.envProxy || readProxyEnv(process.env, proxyPort);
  const winhttp = input.winhttp || {};
  const warp = input.warp || {};
  const trace = input.trace || {};

  const systemProxyLocal = isLocalProxy(systemProxy, proxyPort);
  const systemProxyOther = systemProxy.ProxyEnable === 1 && !systemProxyLocal;
  const tunCapturing = Boolean(mihomo.running && mihomo.tunEnabled);
  const capturedByClash = Boolean(mihomo.running && (tunCapturing || systemProxyLocal));
  const traceWarpOn = trace.warp === "on";
  const traceWarpOff = trace.warp === "off";

  const components = {
    systemProxy: {
      active: systemProxy.ProxyEnable === 1,
      target: systemProxy.ProxyServer || "",
      local: systemProxyLocal
    },
    winhttp: {
      available: Boolean(winhttp.available),
      direct: Boolean(winhttp.direct),
      proxy: winhttp.proxy || "",
      error: winhttp.error || ""
    },
    envProxy,
    clash: {
      running: Boolean(mihomo.running),
      controllerReachable: Boolean(mihomo.controllerReachable),
      mode: mihomo.mode || "",
      mixedPort: mihomo.mixedPort || proxyPort,
      tunEnabled: Boolean(mihomo.tunEnabled),
      selectedNode: mihomo.selectedNode || "",
      capturing: capturedByClash,
      captureMethod: tunCapturing ? "tun" : systemProxyLocal ? "system-proxy" : "none"
    },
    warp: {
      available: Boolean(warp.available),
      connected: Boolean(warp.connected),
      healthy: Boolean(warp.healthy),
      network: warp.network || "",
      traceWarp: trace.warp || "unknown",
      gateway: trace.gateway || "unknown",
      ip: trace.ip || "",
      colo: trace.colo || "",
      loc: trace.loc || "",
      error: warp.error || trace.error || ""
    }
  };

  let id = "unknown";
  let label = "Default route could not be confirmed";
  let shortLabel = "Unknown";
  let capture = { id: "none", label: "No Clash capture" };
  let steps = ["App", "Windows route", "Unknown exit", "Target"];
  let confidence = "low";

  if (capturedByClash) {
    capture = tunCapturing
      ? { id: "clash-tun", label: "Clash TUN captures default traffic" }
      : { id: "system-proxy", label: "Windows system proxy -> Clash" };

    const mode = mihomo.mode || "rule";
    const throughWarp = traceWarpOn;
    if (mode === "direct") {
      id = throughWarp ? "clash-direct-warp" : "clash-direct";
      label = throughWarp
        ? "Clash is capturing, but Direct mode exits through WARP"
        : "Clash is capturing, but Direct mode exits directly";
      shortLabel = "Clash Direct";
      steps = ["App", capture.label, "Mihomo Direct", throughWarp ? "Cloudflare WARP" : "Physical network", "Target"];
    } else {
      id = mode === "global"
        ? (throughWarp ? "clash-proxy-warp-carried" : "clash-proxy")
        : (throughWarp ? "clash-rule-warp-carried" : "clash-rule");
      label = mode === "global"
        ? "Default traffic enters Clash global proxy"
        : "Default traffic enters Clash rule engine";
      shortLabel = mode === "global" ? "Clash Global" : "Clash Rule";
      steps = [
        "App",
        capture.label,
        mode === "global" ? "Proxy node" : "Rule decides proxy/direct",
        throughWarp ? "WARP carries node link" : "Physical network carries node link",
        "Target"
      ];
    }
    confidence = "high";
  } else if (systemProxyLocal) {
    id = "broken-local-proxy";
    label = "Windows system proxy points to Clash, but Mihomo is not reachable";
    shortLabel = "Broken";
    capture = { id: "broken-system-proxy", label: "System proxy points to stopped Clash" };
    steps = ["App", "Windows system proxy", `127.0.0.1:${proxyPort} not reachable`, "Fail"];
    confidence = "high";
  } else if (systemProxyOther) {
    id = traceWarpOn ? "external-proxy-warp" : "external-proxy";
    label = "Windows system proxy points to another proxy";
    shortLabel = "Other Proxy";
    capture = { id: "external-system-proxy", label: `Windows system proxy -> ${systemProxy.ProxyServer || "other proxy"}` };
    steps = ["App", capture.label, traceWarpOn ? "Cloudflare WARP" : "Physical network", "Target"];
    confidence = trace.reachable ? "medium" : "low";
  } else if (traceWarpOn) {
    id = "warp";
    label = "Default traffic exits through Cloudflare WARP";
    shortLabel = "WARP";
    steps = ["App", "Windows route", "Cloudflare WARP", "Target"];
    confidence = "high";
  } else if (traceWarpOff) {
    id = "direct";
    label = "Default traffic exits through the physical network";
    shortLabel = "Direct";
    steps = ["App", "Windows route", "Physical network", "Target"];
    confidence = "high";
  } else if (warp.connected) {
    id = "warp-unconfirmed";
    label = "WARP client reports connected, but external trace failed";
    shortLabel = "WARP?";
    steps = ["App", "Windows route", "Cloudflare WARP?", "Target?"];
    confidence = "medium";
  }

  return {
    id,
    label,
    shortLabel,
    confidence,
    capture,
    steps: steps.map((step, index) => ({ id: `step-${index + 1}`, label: step })),
    components,
    recommendations: buildRecommendations({
      id,
      mihomo,
      systemProxyLocal,
      systemProxyOther,
      traceWarpOn,
      traceReachable: Boolean(trace.reachable)
    }),
    evidence: buildEvidence({ systemProxy, mihomo, envProxy, winhttp, warp, trace, proxyPort })
  };
}

function buildRecommendations(context) {
  const list = [];
  if (context.id === "broken-local-proxy") {
    list.push({
      id: "restore-direct",
      title: "Restore Direct",
      detail: "The system proxy is pointing at a local port that is not serving traffic."
    });
    list.push({
      id: "start-clash",
      title: "Start Clash",
      detail: "Start Mihomo and keep the system proxy on the local mixed port."
    });
    return list;
  }

  if (!context.traceWarpOn && !context.systemProxyLocal && !context.systemProxyOther) {
    list.push({
      id: "use-clash",
      title: "Use Clash fallback",
      detail: "Start Mihomo, enable Windows system proxy, then use Global or Rule mode."
    });
  }

  if (context.mihomo.running && !context.systemProxyLocal && !context.mihomo.tunEnabled) {
    list.push({
      id: "enable-capture",
      title: "Enable Clash capture",
      detail: "Mihomo is running, but default Windows traffic is not entering it."
    });
  }

  if (context.traceWarpOn && !context.systemProxyLocal) {
    list.push({
      id: "warp-ok",
      title: "WARP route is active",
      detail: "Keep WARP as the default route, or switch to Clash if WARP disconnects."
    });
  }

  if (!context.traceReachable) {
    list.push({
      id: "trace-failed",
      title: "External trace failed",
      detail: "The local route can still work, but the public exit could not be verified."
    });
  }

  return list;
}

function buildEvidence({ systemProxy, mihomo, envProxy, winhttp, warp, trace, proxyPort }) {
  const evidence = [];
  evidence.push(systemProxy.ProxyEnable === 1
    ? `Windows proxy: ${systemProxy.ProxyServer || "(empty)"}`
    : "Windows proxy: off");
  evidence.push(`Mihomo: ${mihomo.running ? "running" : "stopped"}, mode=${mihomo.mode || "-"}, mixed-port=${mihomo.mixedPort || proxyPort}, tun=${mihomo.tunEnabled ? "on" : "off"}`);
  evidence.push(`WARP client: ${warp.available ? (warp.connected ? "connected" : "not connected") : "unavailable"}${warp.network ? `, network=${warp.network}` : ""}`);
  evidence.push(`Cloudflare trace: warp=${trace.warp || "unknown"}${trace.ip ? `, ip=${trace.ip}` : ""}${trace.loc ? `, loc=${trace.loc}` : ""}${trace.colo ? `, colo=${trace.colo}` : ""}`);
  evidence.push(winhttp.available
    ? `WinHTTP: ${winhttp.direct ? "direct" : (winhttp.proxy || "proxy configured")}`
    : `WinHTTP: unavailable${winhttp.error ? ` (${winhttp.error})` : ""}`);
  if (envProxy.active) {
    evidence.push(`Process proxy env: ${envProxy.entries.map((item) => `${item.key}=${item.value}`).join(", ")}`);
  }
  return evidence;
}

function readProxyEnv(env = process.env, proxyPort = DEFAULT_PROXY_PORT) {
  const keys = [
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "ALL_PROXY",
    "NO_PROXY",
    "http_proxy",
    "https_proxy",
    "all_proxy",
    "no_proxy"
  ];
  const entries = [];
  for (const key of keys) {
    if (env[key]) {
      entries.push({
        key,
        value: maskProxyValue(env[key]),
        local: proxyValueUsesPort(env[key], proxyPort)
      });
    }
  }
  return {
    active: entries.some((item) => !/^no_proxy$/i.test(item.key)),
    local: entries.some((item) => item.local),
    entries
  };
}

function normalizeSystemProxy(proxy) {
  return {
    ProxyEnable: Number(proxy && proxy.ProxyEnable) === 1 ? 1 : 0,
    ProxyServer: proxy && proxy.ProxyServer !== undefined && proxy.ProxyServer !== null ? String(proxy.ProxyServer) : "",
    ProxyOverride: proxy && proxy.ProxyOverride !== undefined && proxy.ProxyOverride !== null ? String(proxy.ProxyOverride) : ""
  };
}

function normalizeMihomo(mihomo, proxyPort = DEFAULT_PROXY_PORT) {
  const configs = mihomo.configs || {};
  const tun = configs.tun || mihomo.tun || {};
  return {
    running: Boolean(mihomo.running || mihomo.controllerReachable),
    controllerReachable: Boolean(mihomo.controllerReachable || mihomo.running),
    mode: String(mihomo.mode || configs.mode || "").toLowerCase(),
    mixedPort: Number(mihomo.mixedPort || configs["mixed-port"] || proxyPort),
    tunEnabled: Boolean(mihomo.tunEnabled || tun.enable),
    selectedNode: mihomo.selectedNode || ""
  };
}

function parseTrace(text) {
  const fields = {};
  for (const line of String(text || "").split(/\r?\n/)) {
    const index = line.indexOf("=");
    if (index <= 0) {
      continue;
    }
    fields[line.slice(0, index).trim()] = line.slice(index + 1).trim();
  }
  return fields;
}

function matchLine(text, pattern) {
  const match = String(text || "").match(pattern);
  return match ? match[1].trim() : "";
}

function proxyValueUsesPort(value, port) {
  const text = String(value || "").toLowerCase().replace(/\s+/g, "");
  return [`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`].some((target) => text.includes(target));
}

function maskProxyValue(value) {
  const text = String(value || "");
  try {
    const parsed = new URL(text);
    if (parsed.username) {
      parsed.username = "***";
    }
    if (parsed.password) {
      parsed.password = "***";
    }
    return parsed.toString();
  } catch {
    return text.length > 140 ? `${text.slice(0, 120)}...` : text;
  }
}

function brief(text) {
  return String(text || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 12).join("\n");
}

function trimError(message) {
  return String(message || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 2).join(" ");
}

module.exports = {
  buildNetworkPath,
  inspectNetworkPath,
  parseTrace,
  readProxyEnv
};
