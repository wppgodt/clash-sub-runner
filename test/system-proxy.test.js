"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  isLocalProxy,
  makeDirectProxy,
  sanitizeRestoredProxy,
  selectProxyBackup
} = require("../src/system-proxy");

test("proxy backup keeps the original non-runner settings", () => {
  const original = {
    ProxyEnable: 0,
    ProxyServer: "",
    ProxyOverride: "<local>"
  };
  const currentRunnerProxy = {
    ProxyEnable: 1,
    ProxyServer: "127.0.0.1:7890",
    ProxyOverride: "<local>"
  };

  assert.equal(selectProxyBackup(currentRunnerProxy, original, 7890), null);
});

test("proxy backup does not persist a runner proxy as the restore target", () => {
  const polluted = {
    ProxyEnable: 1,
    ProxyServer: "127.0.0.1:7890",
    ProxyOverride: "<local>"
  };

  assert.deepEqual(selectProxyBackup(polluted, null, 7890), makeDirectProxy("<local>"));
  assert.deepEqual(selectProxyBackup(polluted, polluted, 7890), makeDirectProxy("<local>"));
  assert.deepEqual(sanitizeRestoredProxy(polluted, 7890), makeDirectProxy("<local>"));
});

test("polluted backup is replaced when a real proxy setting is available", () => {
  const polluted = {
    ProxyEnable: 1,
    ProxyServer: "127.0.0.1:7890",
    ProxyOverride: "<local>"
  };
  const corporateProxy = {
    ProxyEnable: 1,
    ProxyServer: "proxy.example.test:8080",
    ProxyOverride: "localhost"
  };

  assert.deepEqual(selectProxyBackup(corporateProxy, polluted, 7890), corporateProxy);
});

test("local proxy detection handles common Windows proxy server formats", () => {
  assert.equal(isLocalProxy({ ProxyEnable: 1, ProxyServer: "127.0.0.1:7890" }, 7890), true);
  assert.equal(isLocalProxy({ ProxyEnable: 1, ProxyServer: "http=127.0.0.1:7890;https=127.0.0.1:7890" }, 7890), true);
  assert.equal(isLocalProxy({ ProxyEnable: 1, ProxyServer: "socks=localhost:7890" }, 7890), true);
  assert.equal(isLocalProxy({ ProxyEnable: 0, ProxyServer: "127.0.0.1:7890" }, 7890), false);
  assert.equal(isLocalProxy({ ProxyEnable: 1, ProxyServer: "proxy.example.test:7890" }, 7890), false);
});
