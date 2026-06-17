"use strict";

const { createContext } = require("./paths");
const { localApi } = require("./local-api");
const { VpnService } = require("./service");

let directService = null;

const TOOLS = [
  {
    name: "vpn_get_status",
    description: "Get current VPN/Mihomo status, mode, selected region, node, proxy, and known issues.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false }
  },
  {
    name: "vpn_start",
    description: "Start the local VPN service and enable the Windows system proxy.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false }
  },
  {
    name: "vpn_stop",
    description: "Stop the local VPN service and restore the Windows system proxy.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false }
  },
  {
    name: "vpn_set_mode",
    description: "Set routing mode: rule, global, or direct.",
    inputSchema: {
      type: "object",
      properties: {
        mode: { type: "string", enum: ["rule", "global", "direct"] }
      },
      required: ["mode"],
      additionalProperties: false
    }
  },
  {
    name: "vpn_select_region",
    description: "Select a region or node name. The app chooses the best matching node by delay where possible.",
    inputSchema: {
      type: "object",
      properties: {
        region: { type: "string" }
      },
      required: ["region"],
      additionalProperties: false
    }
  },
  {
    name: "vpn_reset",
    description: "Reset runtime state, restore proxy settings, clear cache, and restart if the service was running.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false }
  },
  {
    name: "vpn_test_connectivity",
    description: "Test current external HTTPS connectivity through the local proxy and return the observed IP if successful.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false }
  },
  {
    name: "vpn_tail_logs",
    description: "Read recent app and Mihomo logs.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false }
  }
];

function runMcpServer() {
  const parser = new McpFrameParser(async (message) => {
    const response = await handleMessage(message);
    if (response) {
      writeFrame(response);
    }
  });

  process.stdin.on("data", (chunk) => parser.push(chunk));
  process.stdin.on("end", () => process.exit(0));
}

async function handleMessage(message) {
  if (!message || !message.method) {
    return null;
  }

  if (message.method === "notifications/initialized") {
    return null;
  }

  try {
    if (message.method === "initialize") {
      return result(message.id, {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "clash-sub-runner", version: "1.0.0" }
      });
    }

    if (message.method === "tools/list") {
      return result(message.id, { tools: TOOLS });
    }

    if (message.method === "tools/call") {
      const name = message.params && message.params.name;
      const args = (message.params && message.params.arguments) || {};
      const value = await callTool(name, args);
      return result(message.id, {
        content: [{ type: "text", text: JSON.stringify(value, null, 2) }]
      });
    }

    return error(message.id, -32601, `Unknown method: ${message.method}`);
  } catch (err) {
    return error(message.id, -32000, err.message);
  }
}

async function callTool(name, args) {
  switch (name) {
    case "vpn_get_status":
      return withDirectFallback(() => localApi("GET", "/api/status"), (service) => service.status());
    case "vpn_start":
      return withDirectFallback(() => localApi("POST", "/api/start", {}), (service) => service.start());
    case "vpn_stop":
      return withDirectFallback(() => localApi("POST", "/api/stop", {}), (service) => service.stop());
    case "vpn_set_mode":
      return withDirectFallback(() => localApi("POST", "/api/mode", { mode: args.mode }), (service) => service.setMode(args.mode));
    case "vpn_select_region":
      return withDirectFallback(() => localApi("POST", "/api/region", { region: args.region }), (service) => service.setRegion(args.region));
    case "vpn_reset":
      return withDirectFallback(() => localApi("POST", "/api/reset", {}), (service) => service.reset());
    case "vpn_test_connectivity":
      return withDirectFallback(() => localApi("POST", "/api/connectivity", {}), (service) => service.connectivityTest());
    case "vpn_tail_logs":
      return withDirectFallback(() => localApi("GET", "/api/logs"), (service) => ({
        app: service.logger.tail(180),
        core: service.logger.tailCore(180)
      }));
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

async function withDirectFallback(localFn, directFn) {
  try {
    return await localFn();
  } catch {
    return directFn(getDirectService());
  }
}

function getDirectService() {
  if (!directService) {
    const context = createContext();
    directService = new VpnService(context);
  }
  return directService;
}

class McpFrameParser {
  constructor(onMessage) {
    this.onMessage = onMessage;
    this.buffer = Buffer.alloc(0);
  }

  push(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (true) {
      const headerEnd = this.buffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) {
        return;
      }

      const header = this.buffer.slice(0, headerEnd).toString("utf8");
      const match = header.match(/Content-Length:\s*(\d+)/i);
      if (!match) {
        this.buffer = Buffer.alloc(0);
        return;
      }

      const length = Number(match[1]);
      const frameStart = headerEnd + 4;
      if (this.buffer.length < frameStart + length) {
        return;
      }

      const body = this.buffer.slice(frameStart, frameStart + length).toString("utf8");
      this.buffer = this.buffer.slice(frameStart + length);
      Promise.resolve()
        .then(() => this.onMessage(JSON.parse(body)))
        .catch((err) => {
          writeFrame(error(null, -32700, err.message));
        });
    }
  }
}

function writeFrame(message) {
  const body = Buffer.from(JSON.stringify(message), "utf8");
  process.stdout.write(`Content-Length: ${body.length}\r\n\r\n`);
  process.stdout.write(body);
}

function result(id, value) {
  return { jsonrpc: "2.0", id, result: value };
}

function error(id, code, message) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

module.exports = {
  McpFrameParser,
  TOOLS,
  handleMessage,
  runMcpServer
};
