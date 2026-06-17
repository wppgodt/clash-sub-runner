"use strict";

const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");
const {
  APP_NAME,
  CONNECTIVITY_URL,
  DEFAULT_CONTROLLER_HOST,
  DEFAULT_CONTROLLER_PORT,
  MIHOMO_RELEASE_LATEST
} = require("./constants");
const { ensureDir, execFileAsync, psQuote, requestBuffer, resolveRedirectUrl } = require("./utils");

async function ensureCore(context, options = {}) {
  const corePath = options.corePath || context.corePath;
  if (fs.existsSync(corePath)) {
    return corePath;
  }

  if (options.autoDownloadCore === false) {
    throw new Error(`Mihomo core not found: ${corePath}`);
  }

  ensureDir(context.coreDir);
  const assets = await findMihomoWindowsAssets();
  const zipPath = path.join(context.coreDir, assets[0].name);
  const extractDir = path.join(context.coreDir, "extract");

  await downloadFirstAvailableAsset(assets, zipPath);

  if (fs.existsSync(extractDir)) {
    fs.rmSync(extractDir, { recursive: true, force: true });
  }
  ensureDir(extractDir);
  await expandArchive(zipPath, extractDir);

  const extractedExe = findFirstFile(extractDir, (file) => {
    const name = path.basename(file).toLowerCase();
    return name.endsWith(".exe") && name.includes("mihomo");
  });

  if (!extractedExe) {
    throw new Error("Downloaded Mihomo archive did not contain an executable.");
  }

  fs.copyFileSync(extractedExe, context.corePath);
  fs.rmSync(extractDir, { recursive: true, force: true });
  fs.rmSync(zipPath, { force: true });
  return context.corePath;
}

async function findMihomoWindowsAssets() {
  const tag = await resolveLatestMihomoTag();
  const names = [
    `mihomo-windows-amd64-v1-${tag}.zip`,
    `mihomo-windows-amd64-compatible-${tag}.zip`,
    `mihomo-windows-amd64-${tag}.zip`,
    `mihomo-windows-amd64-v2-${tag}.zip`,
    `mihomo-windows-amd64-v3-${tag}.zip`
  ];

  return names.flatMap((name) => [
    {
      name,
      url: `https://github.com/MetaCubeX/mihomo/releases/download/${tag}/${name}`
    },
    {
      name,
      url: `https://sourceforge.net/projects/mihomo.mirror/files/${tag}/${name}/download`
    }
  ]);
}

async function resolveLatestMihomoTag() {
  const finalUrl = await resolveRedirectUrl(MIHOMO_RELEASE_LATEST);
  const match = finalUrl.match(/\/tag\/([^/?#]+)/);
  if (!match) {
    throw new Error("Could not resolve latest Mihomo release tag.");
  }
  return decodeURIComponent(match[1]);
}

async function downloadFirstAvailableAsset(assets, destination) {
  let lastError = null;

  for (const asset of assets) {
    try {
      await downloadFile(asset.url, destination);
      return asset;
    } catch (error) {
      lastError = error;
      fs.rmSync(destination, { force: true });
    }
  }

  throw new Error(`Could not download Mihomo Windows x64 build. ${lastError ? lastError.message : ""}`.trim());
}

async function downloadFile(url, destination) {
  const buffer = await requestBuffer(url, {
    headers: {
      "User-Agent": APP_NAME,
      "Accept": "application/octet-stream"
    },
    timeout: 120000
  });
  fs.writeFileSync(destination, buffer);
}

function expandArchive(zipPath, destination) {
  const script = [
    "$ErrorActionPreference = 'Stop'",
    `Expand-Archive -LiteralPath ${psQuote(zipPath)} -DestinationPath ${psQuote(destination)} -Force`
  ].join("; ");
  return execFileAsync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script]);
}

function findFirstFile(dir, predicate) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = findFirstFile(fullPath, predicate);
      if (nested) {
        return nested;
      }
    } else if (entry.isFile() && predicate(fullPath)) {
      return fullPath;
    }
  }
  return "";
}

function startCore(context, corePath, logger) {
  if (!fs.existsSync(context.configPath)) {
    throw new Error(`Config file not found: ${context.configPath}`);
  }

  const child = spawn(corePath, ["-d", context.dataDir, "-f", context.configPath], {
    cwd: context.dataDir,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });

  if (logger) {
    child.stdout.on("data", (chunk) => logger.core(chunk.toString("utf8")));
    child.stderr.on("data", (chunk) => logger.core(chunk.toString("utf8")));
  }

  return child;
}

class MihomoClient {
  constructor(host = DEFAULT_CONTROLLER_HOST, port = DEFAULT_CONTROLLER_PORT) {
    this.host = host;
    this.port = port;
  }

  async request(method, apiPath, body) {
    const payload = body === undefined ? null : Buffer.from(JSON.stringify(body), "utf8");

    return new Promise((resolve, reject) => {
      const req = http.request({
        host: this.host,
        port: this.port,
        method,
        path: apiPath,
        headers: payload ? {
          "Content-Type": "application/json",
          "Content-Length": payload.length
        } : {},
        timeout: 5000
      }, (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`Mihomo API ${method} ${apiPath} failed: HTTP ${res.statusCode} ${text}`.trim()));
            return;
          }
          if (!text) {
            resolve(null);
            return;
          }
          try {
            resolve(JSON.parse(text));
          } catch {
            resolve(text);
          }
        });
      });

      req.on("timeout", () => req.destroy(new Error("Mihomo controller timed out.")));
      req.on("error", reject);
      if (payload) {
        req.write(payload);
      }
      req.end();
    });
  }

  configs() {
    return this.request("GET", "/configs");
  }

  setMode(mode) {
    return this.request("PATCH", "/configs", { mode });
  }

  proxies() {
    return this.request("GET", "/proxies");
  }

  select(group, name) {
    return this.request("PUT", `/proxies/${encodeURIComponent(group)}`, { name });
  }

  delay(name, timeout = 5000, url = CONNECTIVITY_URL) {
    const apiPath = `/proxies/${encodeURIComponent(name)}/delay?timeout=${timeout}&url=${encodeURIComponent(url)}`;
    return this.request("GET", apiPath);
  }

  async isReachable() {
    try {
      await this.configs();
      return true;
    } catch {
      return false;
    }
  }
}

module.exports = {
  MihomoClient,
  ensureCore,
  findMihomoWindowsAssets,
  resolveLatestMihomoTag,
  startCore
};
