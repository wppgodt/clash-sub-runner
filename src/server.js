"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const { DEFAULT_UI_PORT, DISPLAY_NAME, UI_PORT_FALLBACK_COUNT } = require("./constants");
const { APP_ICON_SVG, createIcoBuffer } = require("./icon");
const { renderHtml } = require("./ui");

function createServer(service) {
  return http.createServer(async (req, res) => {
    try {
      if (req.method === "GET" && req.url === "/") {
        send(res, 200, renderHtml(), "text/html; charset=utf-8");
        return;
      }

      if (req.method === "GET" && normalizePath(req.url) === "/favicon.svg") {
        send(res, 200, APP_ICON_SVG, "image/svg+xml; charset=utf-8");
        return;
      }

      if (req.method === "GET" && normalizePath(req.url) === "/favicon.ico") {
        send(res, 200, createIcoBuffer(), "image/x-icon");
        return;
      }

      if (req.method === "GET" && normalizePath(req.url) === "/manifest.webmanifest") {
        sendJson(res, 200, {
          name: DISPLAY_NAME,
          short_name: DISPLAY_NAME,
          start_url: "/",
          display: "standalone",
          background_color: "#f6f7f9",
          theme_color: "#27a1a1",
          icons: [
            { src: "/favicon.svg?v=3", sizes: "any", type: "image/svg+xml" },
            { src: "/favicon.ico?v=3", sizes: "32x32", type: "image/x-icon" }
          ]
        });
        return;
      }

      if (req.method === "GET" && normalizePath(req.url) === "/api/status") {
        if (hasQueryParam(req.url, "force") && typeof service.invalidateNetworkPath === "function") {
          service.invalidateNetworkPath();
        }
        sendJson(res, 200, await service.status());
        return;
      }

      if (req.method === "GET" && req.url === "/api/logs") {
        sendJson(res, 200, {
          app: service.logger.tail(180),
          core: service.logger.tailCore(180)
        });
        return;
      }

      if (req.method === "GET" && req.url === "/api/mcp-config") {
        sendJson(res, 200, await service.mcpConfig());
        return;
      }

      if (req.method === "POST" && req.url === "/api/start") {
        sendJson(res, 200, await service.start());
        return;
      }
      if (req.method === "POST" && req.url === "/api/stop") {
        sendJson(res, 200, await service.stop());
        return;
      }
      if (req.method === "POST" && req.url === "/api/reset") {
        sendJson(res, 200, await service.reset());
        return;
      }
      if (req.method === "POST" && req.url === "/api/refresh") {
        const body = await readJson(req);
        sendJson(res, 200, await service.refreshWithFallbackResult(body.subscription || ""));
        return;
      }
      if (req.method === "POST" && req.url === "/api/mode") {
        const body = await readJson(req);
        sendJson(res, 200, await service.setMode(body.mode));
        return;
      }
      if (req.method === "POST" && req.url === "/api/region") {
        const body = await readJson(req);
        sendJson(res, 200, await service.setRegion(body.node || body.region));
        return;
      }
      if (req.method === "POST" && req.url === "/api/test") {
        sendJson(res, 200, await service.testDelays());
        return;
      }
      if (req.method === "POST" && req.url === "/api/connectivity") {
        sendJson(res, 200, await service.connectivityTest());
        return;
      }

      sendJson(res, 404, { error: "Not found" });
    } catch (error) {
      service.logger.error("HTTP API error", { method: req.method, url: req.url, error: error.message });
      sendJson(res, 500, { error: error.message });
    }
  });
}

function listen(server, port = DEFAULT_UI_PORT) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", reject);
      resolve(server.address());
    });
  });
}

async function startGuiServer(service, options = {}) {
  const requestedPort = options.port || service.context.uiPort || DEFAULT_UI_PORT;
  const ports = options.allowPortFallback === false
    ? [requestedPort]
    : buildUiPortCandidates(requestedPort);
  let server = null;
  let address = null;
  let lastError = null;

  for (const port of ports) {
    server = createServer(service);
    try {
      address = await listen(server, port);
      break;
    } catch (error) {
      lastError = error;
      try {
        server.close();
      } catch {
      }
      server = null;
    }
  }

  if (!server || !address) {
    throw lastError || new Error("Could not start GUI API server.");
  }

  service.context.uiPort = address.port;
  writeUiPortFile(service.context, address.port);
  const url = `http://127.0.0.1:${address.port}/`;
  service.logger.info("GUI server started", { url });

  if (options.open !== false) {
    openAppWindow(url, service.logger);
  }

  if (options.autoStart !== false) {
    service.start().catch((error) => service.logger.error("Auto-start failed", { error: error.message }));
  }

  return { server, url };
}

function buildUiPortCandidates(startPort) {
  const first = Number(startPort) || DEFAULT_UI_PORT;
  return Array.from({ length: UI_PORT_FALLBACK_COUNT }, (_, index) => first + index);
}

function writeUiPortFile(context, port) {
  if (!context || !context.uiPortPath) {
    return;
  }
  fs.mkdirSync(path.dirname(context.uiPortPath), { recursive: true });
  fs.writeFileSync(context.uiPortPath, JSON.stringify({
    port,
    pid: process.pid,
    updatedAt: new Date().toISOString()
  }, null, 2), "utf8");
}

function openAppWindow(url, logger) {
  const browser = findBrowser();
  if (browser) {
    execFile(browser, [`--app=${url}`, "--new-window"], { windowsHide: true }, (error) => {
      if (error && logger) {
        logger.warn("Could not open app browser window", { error: error.message });
      }
    });
    return;
  }

  execFile("powershell.exe", ["-NoProfile", "-Command", `Start-Process ${psString(url)}`], { windowsHide: true }, (error) => {
    if (error && logger) {
      logger.warn("Could not open default browser", { error: error.message });
    }
  });
}

function findBrowser() {
  const candidates = [
    path.join(process.env.ProgramFiles || "C:\\Program Files", "Microsoft", "Edge", "Application", "msedge.exe"),
    path.join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Microsoft", "Edge", "Application", "msedge.exe"),
    path.join(process.env.ProgramFiles || "C:\\Program Files", "Google", "Chrome", "Application", "chrome.exe"),
    path.join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Google", "Chrome", "Application", "chrome.exe")
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || "";
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8").trim();
      if (!text) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(text));
      } catch (error) {
        reject(new Error(`Invalid JSON body: ${error.message}`));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, value) {
  send(res, status, JSON.stringify(value), "application/json; charset=utf-8");
}

function send(res, status, body, contentType) {
  res.writeHead(status, {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
    "X-App-Name": DISPLAY_NAME
  });
  res.end(body);
}

function normalizePath(url) {
  try {
    return new URL(url, "http://127.0.0.1").pathname;
  } catch {
    return url;
  }
}

function hasQueryParam(url, name) {
  try {
    return new URL(url, "http://127.0.0.1").searchParams.has(name);
  } catch {
    return false;
  }
}

function psString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

module.exports = {
  buildUiPortCandidates,
  createServer,
  openAppWindow,
  startGuiServer
};
