"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { normalizeClashConfig, refreshConfig, tryDecodeBase64 } = require("../src/subscription");

test("normalizeClashConfig replaces managed top-level keys", () => {
  const input = [
    "mixed-port: 1234",
    "allow-lan: true",
    "mode: global",
    "log-level: debug",
    "external-controller: 0.0.0.0:9999",
    "proxies:",
    "  - { name: a, type: direct }",
    "rules:",
    "  - MATCH,DIRECT"
  ].join("\n");

  const output = normalizeClashConfig(input, 7890);
  assert.match(output, /^mixed-port: 7890\nallow-lan: false\nmode: rule\nlog-level: info\nexternal-controller: 127\.0\.0\.1:9090/m);
  assert.equal((output.match(/mixed-port:/g) || []).length, 1);
  assert.match(output, /proxies:/);
  assert.match(output, /rules:/);
});

test("normalizeClashConfig rejects HTML subscription responses", () => {
  assert.throws(() => normalizeClashConfig("<html>bad gateway</html>", 7890), /HTML/);
});

test("normalizeClashConfig rejects base64 proxy-link subscriptions", () => {
  const encoded = Buffer.from("ss://example\nvmess://example", "utf8").toString("base64");
  assert.throws(() => normalizeClashConfig(encoded, 7890), /generic proxy-link/);
  assert.match(tryDecodeBase64(encoded), /vmess/);
});

test("refreshConfig retries transient subscription 5xx responses", async () => {
  let hits = 0;
  const server = http.createServer((req, res) => {
    hits += 1;
    if (hits < 3) {
      res.writeHead(502, { "Content-Type": "text/plain" });
      res.end("bad gateway");
      return;
    }
    res.writeHead(200, { "Content-Type": "text/yaml" });
    res.end("proxies: []\nproxy-groups: []\nrules: []\n");
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const context = {
      dataDir: fs.mkdtempSync(path.join(os.tmpdir(), "clash-sub-runner-refresh-")),
      configPath: ""
    };
    context.configPath = path.join(context.dataDir, "config.yaml");
    const configPath = await refreshConfig(context, `http://127.0.0.1:${server.address().port}/sub`, 7890, {
      attempts: 3,
      retryDelayMs: 1
    });
    assert.equal(hits, 3);
    assert.equal(configPath, context.configPath);
    assert.match(fs.readFileSync(configPath, "utf8"), /mixed-port: 7890/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
