"use strict";

const fs = require("fs");
const os = require("os");
const { DEFAULT_CONTROLLER } = require("./constants");
const { ensureDir, isValidUrl, maskUrl, requestBuffer, sleep } = require("./utils");

function readSubscription(context, cliValue = "") {
  if (cliValue) {
    const clean = cliValue.trim();
    if (!isValidUrl(clean)) {
      throw new Error("The subscription URL is invalid.");
    }
    fs.writeFileSync(context.subscriptionPath, `${clean}${os.EOL}`, "utf8");
    return clean;
  }

  if (fs.existsSync(context.subscriptionPath)) {
    const lines = fs.readFileSync(context.subscriptionPath, "utf8").split(/\r?\n/);
    const value = lines.map((line) => line.trim()).find(Boolean);
    if (value) {
      if (!isValidUrl(value)) {
        throw new Error(`Invalid URL in ${context.subscriptionPath}`);
      }
      return value;
    }
  }

  throw new Error(`Missing subscription file: ${context.subscriptionPath}`);
}

async function refreshConfig(context, subscriptionUrl, port, options = {}) {
  const buffer = await requestBufferWithRetry(subscriptionUrl, {
    userAgent: "clash.meta",
    timeout: 30000
  }, {
    attempts: options.attempts || 3,
    delayMs: options.retryDelayMs || 1200,
    onRetry: options.onRetry
  });
  const rawConfig = buffer.toString("utf8");
  const normalized = normalizeClashConfig(rawConfig, port);
  ensureDir(context.dataDir);
  fs.writeFileSync(context.configPath, normalized, "utf8");
  return context.configPath;
}

async function requestBufferWithRetry(url, requestOptions, retryOptions = {}) {
  const attempts = Math.max(1, Number(retryOptions.attempts) || 1);
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await requestBuffer(url, requestOptions);
    } catch (error) {
      lastError = error;
      if (attempt >= attempts || !isRetryableRefreshError(error)) {
        throw error;
      }
      if (typeof retryOptions.onRetry === "function") {
        retryOptions.onRetry({ attempt, attempts, error });
      }
      await sleep((Number(retryOptions.delayMs) || 0) * attempt);
    }
  }

  throw lastError;
}

function isRetryableRefreshError(error) {
  const status = Number(error && error.statusCode);
  if (status >= 500 && status < 600) {
    return true;
  }
  return /timed out|ECONNRESET|ECONNREFUSED|EAI_AGAIN|socket hang up/i.test(String(error && error.message || ""));
}

function normalizeClashConfig(rawConfig, port) {
  const text = rawConfig.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").trim();

  if (!text) {
    throw new Error("The subscription response is empty.");
  }
  if (/^\s*<!doctype html/i.test(text) || /^\s*<html\b/i.test(text)) {
    throw new Error("The subscription returned HTML instead of a Clash config.");
  }

  const hasClashYamlShape = /^\s*(mixed-port|port|socks-port|redir-port|tproxy-port|proxies|proxy-groups|proxy-providers|rule-providers|rules)\s*:/m.test(text);
  if (!hasClashYamlShape) {
    const decoded = tryDecodeBase64(text);
    if (decoded && /(vmess|vless|trojan|ss|ssr):\/\//i.test(decoded)) {
      throw new Error("The server returned a generic proxy-link subscription, not Clash/Mihomo YAML. Choose the Clash/Mihomo subscription format from your provider.");
    }
    throw new Error("The subscription response does not look like a Clash/Mihomo YAML config.");
  }

  const managed = new Map([
    ["mixed-port", String(port)],
    ["allow-lan", "false"],
    ["mode", "rule"],
    ["log-level", "info"],
    ["external-controller", DEFAULT_CONTROLLER]
  ]);

  const managedKeyPattern = /^(mixed-port|allow-lan|mode|log-level|external-controller)\s*:/;
  const withoutManagedKeys = text
    .split("\n")
    .filter((line) => !managedKeyPattern.test(line))
    .join("\n")
    .trim();

  const header = Array.from(managed.entries())
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");

  return `${header}\n\n${withoutManagedKeys}\n`;
}

function tryDecodeBase64(text) {
  const compact = text.replace(/\s+/g, "");
  if (!compact || compact.length % 4 !== 0 || !/^[A-Za-z0-9+/=]+$/.test(compact)) {
    return "";
  }
  try {
    return Buffer.from(compact, "base64").toString("utf8");
  } catch {
    return "";
  }
}

module.exports = {
  maskUrl,
  isRetryableRefreshError,
  normalizeClashConfig,
  readSubscription,
  refreshConfig,
  requestBufferWithRetry,
  tryDecodeBase64
};
