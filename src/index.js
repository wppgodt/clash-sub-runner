#!/usr/bin/env node
"use strict";

const fs = require("fs");
const readline = require("readline");
const { createContext } = require("./paths");
const { VpnService } = require("./service");
const { openAppWindow, startGuiServer } = require("./server");
const { runMcpServer } = require("./mcp-server");
const { localApi } = require("./local-api");
const { DEFAULT_PROXY_PORT, DEFAULT_UI_PORT } = require("./constants");

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const context = createContext({ uiPort: args.uiPort, corePath: args.corePath || undefined });
  const service = new VpnService(context, {
    proxyPort: args.proxyPort,
    systemProxy: args.systemProxy,
    autoDownloadCore: args.autoDownloadCore,
    corePath: args.corePath || context.corePath
  });

  if (args.help) {
    printHelp();
    return;
  }

  if (args.mcp) {
    runMcpServer();
    return;
  }

  if (args.cmd.length) {
    await runCommand(args.cmd, args.uiPortExplicit ? args.uiPort : undefined);
    return;
  }

  if (args.restoreProxy) {
    await service.stop();
    return;
  }

  if (args.downloadCoreOnly) {
    const { ensureCore } = require("./mihomo");
    await ensureCore(context, { corePath: args.corePath || context.corePath, autoDownloadCore: args.autoDownloadCore });
    console.log(`Mihomo core ready: ${args.corePath || context.corePath}`);
    return;
  }

  if (args.refreshOnly) {
    await service.refreshWithFallback(args.subscription);
    console.log(`Config ready: ${context.configPath}`);
    return;
  }

  if (args.console) {
    await service.start({ subscription: args.subscription });
    console.log(`Running. Local proxy: 127.0.0.1:${args.proxyPort}`);
    console.log("Press Ctrl+C to stop.");
    process.on("SIGINT", async () => {
      await service.stop();
      process.exit(0);
    });
    process.on("SIGTERM", async () => {
      await service.stop();
      process.exit(0);
    });
    return;
  }

  const existing = await getRunningGuiStatus(args.uiPortExplicit ? args.uiPort : undefined);
  if (existing) {
    const existingPort = existing.app && existing.app.uiPort ? existing.app.uiPort : args.uiPort;
    const existingUrl = `http://127.0.0.1:${existingPort}/`;
    if (args.open) {
      openAppWindow(existingUrl, service.logger);
    }
    console.log(`Existing GUI: ${existingUrl}`);
    return;
  }

  const { url } = await startGuiServer(service, {
    port: args.uiPort,
    open: args.open,
    autoStart: args.autoStart
  });
  console.log(`GUI: ${url}`);
}

async function getRunningGuiStatus(uiPort) {
  try {
    const status = await localApi("GET", "/api/status", undefined, uiPort, 1200);
    return status && status.app ? status : null;
  } catch {
    return null;
  }
}

function parseArgs(argv) {
  const args = {
    help: false,
    mcp: false,
    console: false,
    cmd: [],
    refreshOnly: false,
    restoreProxy: false,
    downloadCoreOnly: false,
    systemProxy: true,
    autoDownloadCore: true,
    autoStart: true,
    open: true,
    subscription: "",
    proxyPort: DEFAULT_PROXY_PORT,
    uiPort: DEFAULT_UI_PORT,
    uiPortExplicit: false,
    corePath: ""
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") {
      args.help = true;
    } else if (arg === "--mcp") {
      args.mcp = true;
    } else if (arg === "--console") {
      args.console = true;
    } else if (arg === "--cmd") {
      args.cmd = argv.slice(i + 1);
      break;
    } else if (arg === "--refresh-only") {
      args.refreshOnly = true;
    } else if (arg === "--restore-proxy") {
      args.restoreProxy = true;
    } else if (arg === "--download-core-only") {
      args.downloadCoreOnly = true;
    } else if (arg === "--no-system-proxy") {
      args.systemProxy = false;
    } else if (arg === "--no-core-download") {
      args.autoDownloadCore = false;
    } else if (arg === "--no-auto-start") {
      args.autoStart = false;
    } else if (arg === "--no-open") {
      args.open = false;
    } else if (arg === "--subscription") {
      args.subscription = readArgValue(argv, i, arg);
      i += 1;
    } else if (arg.startsWith("--subscription=")) {
      args.subscription = arg.slice("--subscription=".length);
    } else if (arg === "--port") {
      args.proxyPort = parsePort(readArgValue(argv, i, arg));
      i += 1;
    } else if (arg.startsWith("--port=")) {
      args.proxyPort = parsePort(arg.slice("--port=".length));
    } else if (arg === "--ui-port") {
      args.uiPort = parsePort(readArgValue(argv, i, arg));
      args.uiPortExplicit = true;
      i += 1;
    } else if (arg.startsWith("--ui-port=")) {
      args.uiPort = parsePort(arg.slice("--ui-port=".length));
      args.uiPortExplicit = true;
    } else if (arg === "--core") {
      args.corePath = readArgValue(argv, i, arg);
      i += 1;
    } else if (arg.startsWith("--core=")) {
      args.corePath = arg.slice("--core=".length);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return args;
}

function readArgValue(argv, index, name) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${name}`);
  }
  return value;
}

function parsePort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid port: ${value}`);
  }
  return port;
}

async function runCommand(cmd, uiPort) {
  const [name, ...rest] = cmd;
  if (!name) {
    throw new Error("Missing command name.");
  }

  let result;
  if (name === "status") {
    result = await localApi("GET", "/api/status", undefined, uiPort);
  } else if (name === "start") {
    result = await localApi("POST", "/api/start", {}, uiPort);
  } else if (name === "stop") {
    result = await localApi("POST", "/api/stop", {}, uiPort);
  } else if (name === "reset") {
    result = await localApi("POST", "/api/reset", {}, uiPort);
  } else if (name === "refresh") {
    result = await localApi("POST", "/api/refresh", {}, uiPort);
  } else if (name === "mode") {
    result = await localApi("POST", "/api/mode", { mode: rest[0] }, uiPort);
  } else if (name === "region") {
    result = await localApi("POST", "/api/region", { region: rest.join(" ") }, uiPort);
  } else if (name === "logs") {
    result = await localApi("GET", "/api/logs", undefined, uiPort);
  } else if (name === "test") {
    const external = await localApi("POST", "/api/connectivity", {}, uiPort);
    const delays = await localApi("POST", "/api/test", {}, uiPort);
    result = {
      external,
      delays: {
        total: delays.length,
        ok: delays.filter((item) => item.ok).length,
        fastest: delays
          .filter((item) => item.ok && item.delay)
          .sort((a, b) => a.delay - b.delay)
          .slice(0, 10)
      }
    };
  } else if (name === "mcp-config") {
    result = await localApi("GET", "/api/mcp-config", undefined, uiPort);
  } else {
    throw new Error(`Unknown command: ${name}`);
  }

  console.log(typeof result === "string" ? result : JSON.stringify(result, null, 2));
}

function printHelp() {
  console.log(`Clash Sub Runner

Usage:
  clash-sub-runner.exe                 Open GUI and auto-start VPN.
  clash-sub-runner.exe --console       Run without GUI.
  clash-sub-runner.exe --mcp           Run MCP stdio server.
  clash-sub-runner.exe --cmd <name>    Control the running GUI service.

Commands:
  --cmd status
  --cmd start
  --cmd stop
  --cmd mode rule|global|direct
  --cmd region <region-or-node>
  --cmd reset
  --cmd test
  --cmd logs
  --cmd mcp-config

Options:
  --refresh-only          Fetch and write config, then exit.
  --no-system-proxy      Do not change Windows proxy settings.
  --restore-proxy        Restore proxy backup and stop owned core.
  --download-core-only   Download/verify Mihomo core, then exit.
  --subscription <url>   Save/update the subscription URL.
  --port <number>        Local mixed proxy port. Default: ${DEFAULT_PROXY_PORT}.
  --ui-port <number>     Local GUI API port. Default: ${DEFAULT_UI_PORT}.
  --core <path>          Use an existing Mihomo executable.
  --no-auto-start        Open GUI without starting VPN.
  --no-open              Start local GUI API without opening a browser window.
  -h, --help             Show this help.
`);
}

main().catch(async (error) => {
  console.error(`Error: ${error.message}`);
  if (shouldPauseOnFatalError()) {
    await prompt("Press Enter to exit...");
  }
  process.exit(1);
});

function prompt(message) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise((resolve) => {
    rl.question(message, () => {
      rl.close();
      resolve();
    });
  });
}

function shouldPauseOnFatalError() {
  return process.argv.slice(2).length === 0 && process.stdin.isTTY && process.stdout.isTTY;
}

module.exports = {
  parseArgs,
  runCommand
};
