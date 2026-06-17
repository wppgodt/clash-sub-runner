"use strict";

const http = require("http");
const fs = require("fs");
const { DEFAULT_UI_PORT, UI_PORT_FALLBACK_COUNT } = require("./constants");
const { createContext } = require("./paths");

async function localApi(method, apiPath, body, port, timeoutMs = 120000) {
  if (port) {
    return requestLocalApi(method, apiPath, body, port, timeoutMs);
  }

  const discoveredPort = await discoverUiPort(Math.min(timeoutMs, 3000));
  return requestLocalApi(method, apiPath, body, discoveredPort, timeoutMs);
}

function requestLocalApi(method, apiPath, body, port, timeoutMs) {
  const payload = body === undefined ? null : Buffer.from(JSON.stringify(body), "utf8");

  return new Promise((resolve, reject) => {
    const req = http.request({
      host: "127.0.0.1",
      port,
      method,
      path: apiPath,
      headers: payload ? {
        "Content-Type": "application/json",
        "Content-Length": payload.length
      } : {},
      timeout: timeoutMs
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let data = null;
        try {
          data = text ? JSON.parse(text) : null;
        } catch {
          data = text;
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(data && data.error ? data.error : `HTTP ${res.statusCode}`));
          return;
        }
        resolve(data);
      });
    });

    req.on("timeout", () => req.destroy(new Error("Local GUI API timed out. Is the app running or busy?")));
    req.on("error", (error) => reject(new Error(`Local GUI API unavailable: ${error.message}`)));
    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

function resolveUiPortCandidates() {
  const ports = [];
  const saved = readSavedUiPort();
  if (saved) {
    ports.push(saved);
  }
  for (let i = 0; i < UI_PORT_FALLBACK_COUNT; i += 1) {
    ports.push(DEFAULT_UI_PORT + i);
  }
  return [...new Set(ports)];
}

async function discoverUiPort(timeoutMs = 3000) {
  let lastError = null;
  for (const candidate of resolveUiPortCandidates()) {
    try {
      const status = await requestLocalApi("GET", "/api/status", undefined, candidate, timeoutMs);
      if (status && status.app) {
        return candidate;
      }
      lastError = new Error(`Port ${candidate} is not a Clash Sub Runner GUI API.`);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("Local GUI API unavailable.");
}

function readSavedUiPort() {
  try {
    const context = createContext();
    const text = fs.readFileSync(context.uiPortPath, "utf8");
    const parsed = JSON.parse(text);
    const port = Number(parsed.port);
    return Number.isInteger(port) && port > 0 && port <= 65535 ? port : 0;
  } catch {
    return 0;
  }
}

module.exports = {
  discoverUiPort,
  localApi,
  readSavedUiPort,
  resolveUiPortCandidates
};
