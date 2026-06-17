"use strict";

const path = require("path");
const { DEFAULT_UI_PORT } = require("./constants");

function isSingleExecutable() {
  try {
    return require("node:sea").isSea();
  } catch {
    return false;
  }
}

function getBaseDir() {
  if (process.pkg || isSingleExecutable()) {
    return path.dirname(process.execPath);
  }
  return process.cwd();
}

function createContext(overrides = {}) {
  const baseDir = overrides.baseDir || getBaseDir();
  const dataDir = path.join(baseDir, "data");

  return {
    baseDir,
    dataDir,
    subscriptionPath: path.join(baseDir, "subscription.txt"),
    configPath: path.join(dataDir, "config.yaml"),
    coreDir: path.join(dataDir, "core"),
    corePath: overrides.corePath || path.join(dataDir, "core", "mihomo.exe"),
    uiPortPath: path.join(dataDir, "ui-port.json"),
    proxyBackupPath: path.join(dataDir, "proxy-session-backup.json"),
    statePath: path.join(dataDir, "app-state.json"),
    logDir: path.join(dataDir, "logs"),
    uiPort: overrides.uiPort || DEFAULT_UI_PORT
  };
}

module.exports = {
  createContext,
  getBaseDir,
  isSingleExecutable
};
