"use strict";

const fs = require("fs");
const path = require("path");
const { ensureDir, nowIso, stripAnsi, tailFile, todayStamp } = require("./utils");

class Logger {
  constructor(context) {
    this.context = context;
    this.lines = [];
    ensureDir(context.logDir);
    this.write("info", "Log session started", { pid: process.pid, baseDir: context.baseDir });
  }

  appLogPath() {
    return path.join(this.context.logDir, `app-${todayStamp()}.log`);
  }

  coreLogPath() {
    return path.join(this.context.logDir, `mihomo-${todayStamp()}.log`);
  }

  write(level, message, meta = {}) {
    ensureDir(this.context.logDir);
    const line = JSON.stringify({
      time: nowIso(),
      level,
      message: stripAnsi(message),
      ...meta
    });
    this.lines.push(line);
    if (this.lines.length > 500) {
      this.lines.splice(0, this.lines.length - 500);
    }
    fs.appendFileSync(this.appLogPath(), `${line}\n`, "utf8");
  }

  info(message, meta) {
    this.write("info", message, meta);
  }

  warn(message, meta) {
    this.write("warn", message, meta);
  }

  error(message, meta) {
    this.write("error", message, meta);
  }

  core(message) {
    ensureDir(this.context.logDir);
    fs.appendFileSync(this.coreLogPath(), `${stripAnsi(message).trimEnd()}\n`, "utf8");
  }

  tail(maxLines = 160) {
    if (this.lines.length) {
      return this.lines.slice(-maxLines).join("\n");
    }
    return tailFile(this.appLogPath(), maxLines);
  }

  tailCore(maxLines = 160) {
    return tailFile(this.coreLogPath(), maxLines);
  }
}

module.exports = {
  Logger
};
