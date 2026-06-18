#!/usr/bin/env node
"use strict";

const fs = require("fs");
const http = require("http");
const path = require("path");
const { spawn } = require("child_process");

const DEFAULT_PORT = 17980;
const FALLBACK_COUNT = 10;

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exit(1);
});

async function main() {
  const root = path.resolve(__dirname, "..");
  process.chdir(root);
  assertProjectRoot(root);

  const open = process.argv.slice(2).some((arg) => /^-Open$/i.test(arg) || arg === "--open");

  for (const port of fallbackPorts()) {
    const status = await getStatusOnPort(port);
    if (status) {
      await complete({
        ok: true,
        reused: true,
        url: `http://127.0.0.1:${port}/`,
        port,
        pid: status.app.childPid,
        path: status.networkPath && status.networkPath.id
      }, open);
      return;
    }
  }

  const child = spawn(process.execPath, [
    path.join("src", "index.js"),
    "--no-open",
    "--no-auto-start",
    "--ui-port",
    String(DEFAULT_PORT)
  ], {
    cwd: root,
    detached: true,
    stdio: "ignore",
    windowsHide: true
  });
  child.unref();

  for (const port of fallbackPorts()) {
    const status = await waitForStatus(port, 10000);
    if (status) {
      await complete({
        ok: true,
        reused: false,
        url: `http://127.0.0.1:${port}/`,
        port,
        pid: status.app.childPid,
        path: status.networkPath && status.networkPath.id
      }, open);
      return;
    }
  }

  throw new Error(`Started the GUI process, but no local API became available on ports ${DEFAULT_PORT}-${DEFAULT_PORT + FALLBACK_COUNT - 1}.`);
}

function assertProjectRoot(root) {
  const packagePath = path.join(root, "package.json");
  if (!fs.existsSync(packagePath)) {
    throw new Error("package.json is missing; this does not look like the Clash Sub Runner project.");
  }

  const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));
  if (pkg.name !== "clash-sub-runner") {
    throw new Error(`package.json name is '${pkg.name}', expected 'clash-sub-runner'.`);
  }
}

function fallbackPorts() {
  return Array.from({ length: FALLBACK_COUNT }, (_, index) => DEFAULT_PORT + index);
}

async function complete(result, open) {
  console.log(JSON.stringify(result));
  if (open) {
    openUrl(result.url);
  }
  await refreshConnectivity(result.port);
}

function getStatusOnPort(port) {
  return requestJson({
    hostname: "127.0.0.1",
    port,
    path: "/api/status",
    method: "GET",
    timeout: 2000
  }).then((status) => {
    if (status && status.app && status.app.uiPort === port) {
      return status;
    }
    return null;
  }).catch(() => null);
}

async function waitForStatus(port, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const status = await getStatusOnPort(port);
    if (status) {
      return status;
    }
    await sleep(400);
  }
  return null;
}

async function refreshConnectivity(port) {
  try {
    const payload = await requestJson({
      hostname: "127.0.0.1",
      port,
      path: "/api/connectivity",
      method: "POST",
      timeout: 30000,
      headers: {
        "Content-Type": "application/json",
        "Content-Length": 2
      }
    }, "{}");

    if (payload.ok) {
      console.log(`Connectivity OK: ${payload.ip || "external IP detected"}`);
    } else {
      console.error(`Connectivity refresh failed: ${payload.error || "unknown error"}`);
    }
  } catch (error) {
    console.error(`Connectivity refresh failed: ${error.message}`);
  }
}

function requestJson(options, body = "") {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`HTTP ${res.statusCode} ${text}`.trim()));
          return;
        }
        try {
          resolve(text ? JSON.parse(text) : {});
        } catch (error) {
          reject(error);
        }
      });
    });

    req.setTimeout(options.timeout || 0, () => {
      req.destroy(new Error("request timed out"));
    });
    req.on("error", reject);
    req.end(body);
  });
}

function openUrl(url) {
  let command;
  let args;

  if (process.platform === "win32") {
    command = "cmd";
    args = ["/c", "start", "", url];
  } else if (process.platform === "darwin") {
    command = "open";
    args = [url];
  } else {
    command = "xdg-open";
    args = [url];
  }

  const child = spawn(command, args, {
    detached: true,
    stdio: "ignore",
    windowsHide: true
  });
  child.unref();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
