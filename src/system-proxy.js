"use strict";

const fs = require("fs");
const path = require("path");
const { DEFAULT_PROXY_PORT } = require("./constants");
const { execFileAsync, psQuote } = require("./utils");

async function readCurrentProxy() {
  const script = [
    "$ErrorActionPreference = 'Stop'",
    "$p = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'",
    "$o = Get-ItemProperty -Path $p",
    "$r = [ordered]@{ ProxyEnable = $o.ProxyEnable; ProxyServer = $o.ProxyServer; ProxyOverride = $o.ProxyOverride }",
    "$r | ConvertTo-Json -Compress"
  ].join("; ");

  const result = await execFileAsync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script]);
  return JSON.parse(result.stdout);
}

async function enableSystemProxy(context, port) {
  const current = await readCurrentProxy();
  const backup = selectProxyBackup(current, readProxyBackup(context), port);
  if (backup) {
    fs.mkdirSync(path.dirname(context.proxyBackupPath), { recursive: true });
    fs.writeFileSync(context.proxyBackupPath, JSON.stringify(backup, null, 2), "utf8");
  }

  const proxyServer = `127.0.0.1:${port}`;
  const script = [
    "$ErrorActionPreference = 'Stop'",
    "$p = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'",
    "Set-ItemProperty -Path $p -Name ProxyEnable -Type DWord -Value 1",
    `Set-ItemProperty -Path $p -Name ProxyServer -Type String -Value ${psQuote(proxyServer)}`,
    "Set-ItemProperty -Path $p -Name ProxyOverride -Type String -Value '<local>'",
    notifyProxyChangedScript()
  ].join("; ");

  await execFileAsync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script]);
  return proxyServer;
}

async function restoreSystemProxy(context, options = {}) {
  const port = options.port || DEFAULT_PROXY_PORT;
  if (!fs.existsSync(context.proxyBackupPath)) {
    const current = await readCurrentProxy();
    if (isLocalProxy(current, port)) {
      await applyProxySettings(makeDirectProxy(current.ProxyOverride));
      return true;
    }
    return false;
  }

  const backup = sanitizeRestoredProxy(readProxyBackup(context), port);
  await applyProxySettings(backup);
  fs.rmSync(context.proxyBackupPath, { force: true });
  return true;
}

function readProxyBackup(context) {
  try {
    if (!context || !context.proxyBackupPath || !fs.existsSync(context.proxyBackupPath)) {
      return null;
    }
    return JSON.parse(fs.readFileSync(context.proxyBackupPath, "utf8"));
  } catch {
    return null;
  }
}

function selectProxyBackup(current, existingBackup, port = DEFAULT_PROXY_PORT) {
  if (existingBackup && !isLocalProxy(existingBackup, port)) {
    return null;
  }
  if (isLocalProxy(current, port)) {
    return makeDirectProxy(current && current.ProxyOverride);
  }
  return normalizeProxy(current);
}

function sanitizeRestoredProxy(proxy, port = DEFAULT_PROXY_PORT) {
  if (isLocalProxy(proxy, port)) {
    return makeDirectProxy(proxy && proxy.ProxyOverride);
  }
  return normalizeProxy(proxy);
}

function normalizeProxy(proxy) {
  return {
    ProxyEnable: Number(proxy && proxy.ProxyEnable) === 1 ? 1 : 0,
    ProxyServer: proxy && proxy.ProxyServer !== undefined ? proxy.ProxyServer : null,
    ProxyOverride: proxy && proxy.ProxyOverride !== undefined ? proxy.ProxyOverride : null
  };
}

function makeDirectProxy(proxyOverride = "<local>") {
  return {
    ProxyEnable: 0,
    ProxyServer: "",
    ProxyOverride: proxyOverride || "<local>"
  };
}

function isLocalProxy(proxy, port = DEFAULT_PROXY_PORT) {
  return Number(proxy && proxy.ProxyEnable) === 1 && proxyServerUsesPort(proxy.ProxyServer, port);
}

function proxyServerUsesPort(proxyServer, port = DEFAULT_PROXY_PORT) {
  const text = String(proxyServer || "").toLowerCase().replace(/\s+/g, "");
  if (!text) {
    return false;
  }
  return [
    `127.0.0.1:${port}`,
    `localhost:${port}`,
    `[::1]:${port}`
  ].some((value) => text.includes(value));
}

async function applyProxySettings(proxy) {
  const script = [
    "$ErrorActionPreference = 'Stop'",
    `$backup = ${psQuote(JSON.stringify(normalizeProxy(proxy)))} | ConvertFrom-Json`,
    "$p = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'",
    "Set-ItemProperty -Path $p -Name ProxyEnable -Type DWord -Value ([int]$backup.ProxyEnable)",
    "if ($null -ne $backup.ProxyServer) { Set-ItemProperty -Path $p -Name ProxyServer -Type String -Value ([string]$backup.ProxyServer) } else { Remove-ItemProperty -Path $p -Name ProxyServer -ErrorAction SilentlyContinue }",
    "if ($null -ne $backup.ProxyOverride) { Set-ItemProperty -Path $p -Name ProxyOverride -Type String -Value ([string]$backup.ProxyOverride) } else { Remove-ItemProperty -Path $p -Name ProxyOverride -ErrorAction SilentlyContinue }",
    notifyProxyChangedScript()
  ].join("; ");

  await execFileAsync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script]);
}

function notifyProxyChangedScript() {
  return [
    "$signature = '[DllImport(\"wininet.dll\", SetLastError = true)] public static extern bool InternetSetOption(IntPtr hInternet, int dwOption, IntPtr lpBuffer, int dwBufferLength);'",
    "$type = Add-Type -MemberDefinition $signature -Name NativeMethods -Namespace WinInet -PassThru",
    "$type::InternetSetOption([IntPtr]::Zero, 39, [IntPtr]::Zero, 0) | Out-Null",
    "$type::InternetSetOption([IntPtr]::Zero, 37, [IntPtr]::Zero, 0) | Out-Null"
  ].join("; ");
}

module.exports = {
  enableSystemProxy,
  isLocalProxy,
  makeDirectProxy,
  readCurrentProxy,
  restoreSystemProxy,
  sanitizeRestoredProxy,
  selectProxyBackup
};
