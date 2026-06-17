"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { McpFrameParser, TOOLS, handleMessage } = require("../src/mcp-server");

test("MCP exposes required VPN configuration tools", () => {
  const names = TOOLS.map((tool) => tool.name).sort();
  assert.deepEqual(names, [
    "vpn_get_status",
    "vpn_reset",
    "vpn_select_region",
    "vpn_set_mode",
    "vpn_start",
    "vpn_stop",
    "vpn_test_connectivity",
    "vpn_tail_logs"
  ].sort());
});

test("MCP initialize and tools/list return protocol responses", async () => {
  const init = await handleMessage({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
  assert.equal(init.result.serverInfo.name, "clash-sub-runner");
  assert.equal(init.result.capabilities.tools.constructor, Object);

  const list = await handleMessage({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
  assert.equal(list.result.tools.length, TOOLS.length);
});

test("MCP frame parser accepts Content-Length stdio frames", async () => {
  const messages = [];
  const parser = new McpFrameParser((message) => messages.push(message));
  const body = Buffer.from(JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/list" }), "utf8");
  parser.push(Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, "utf8"));
  parser.push(body);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(messages.length, 1);
  assert.equal(messages[0].method, "tools/list");
});
