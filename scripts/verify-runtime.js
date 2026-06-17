"use strict";

const fs = require("fs");
const http = require("http");
const path = require("path");
const { spawn, execFileSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const configPath = path.join(root, "dist", "data", "config.yaml");
const corePath = path.join(root, "dist", "data", "core", "mihomo.exe");
const nativeGuiPath = path.join(root, "dist", "Clash Sub Runner.exe");
const iconPath = path.join(root, "dist", "app.ico");
const port = 18790;

run("node", [path.join(root, "src", "index.js"), "--help"]);

if (!fs.existsSync(nativeGuiPath)) {
  throw new Error(`Native GUI executable is missing: ${nativeGuiPath}`);
}
if (!fs.existsSync(iconPath)) {
  throw new Error(`App icon is missing: ${iconPath}`);
}

if (fs.existsSync(corePath) && fs.existsSync(configPath)) {
  run(corePath, ["-t", "-d", path.dirname(configPath), "-f", configPath]);
}

const child = spawn(process.execPath, [
  path.join(root, "src", "index.js"),
  "--no-open",
  "--no-auto-start",
  "--ui-port",
  String(port)
], {
  cwd: root,
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true
});

let output = "";
child.stdout.on("data", (chunk) => { output += chunk.toString("utf8"); });
child.stderr.on("data", (chunk) => { output += chunk.toString("utf8"); });

(async () => {
  try {
    await waitForStatus();
    const status = await getJson("/api/status");
    if (!status.app || status.app.uiPort !== port) {
      throw new Error("GUI API status did not include expected app metadata.");
    }
    const second = spawn(process.execPath, [
      path.join(root, "src", "index.js"),
      "--no-open",
      "--no-auto-start",
      "--ui-port",
      String(port)
    ], {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    const exitCode = await waitForExit(second, 8000);
    if (exitCode !== 0) {
      throw new Error(`Second GUI launch did not exit cleanly: ${exitCode}`);
    }
    if (child.exitCode !== null) {
      throw new Error("Primary GUI server exited during single-instance check.");
    }
  } finally {
    child.kill();
  }
})().catch((error) => {
  child.kill();
  console.error(output);
  console.error(error.stack || error.message);
  process.exit(1);
});

function run(file, args) {
  execFileSync(file, args, {
    cwd: root,
    stdio: "inherit",
    windowsHide: true
  });
}

async function waitForStatus() {
  const started = Date.now();
  while (Date.now() - started < 15000) {
    try {
      await getJson("/api/status");
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }
  throw new Error("Timed out waiting for GUI API.");
}

function getJson(apiPath) {
  return new Promise((resolve, reject) => {
    http.get({ host: "127.0.0.1", port, path: apiPath, timeout: 3000 }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      });
    }).on("error", reject);
  });
}

function waitForExit(childProcess, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      childProcess.kill();
      reject(new Error("Timed out waiting for second GUI launch to exit."));
    }, timeoutMs);
    childProcess.on("exit", (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
}
