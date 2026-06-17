"use strict";

const fs = require("fs");
const http = require("http");
const https = require("https");
const zlib = require("zlib");
const { execFile } = require("child_process");
const { APP_NAME } = require("./constants");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function psQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function maskUrl(value) {
  try {
    const url = new URL(value);
    for (const key of ["token", "key", "password", "passwd"]) {
      if (url.searchParams.has(key)) {
        const secret = url.searchParams.get(key) || "";
        const masked = secret.length > 8 ? `${secret.slice(0, 4)}...${secret.slice(-4)}` : "***";
        url.searchParams.set(key, masked);
      }
    }
    return url.toString();
  } catch {
    return "<invalid-url>";
  }
}

function isValidUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function execFileAsync(file, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(file, args, {
      windowsHide: true,
      maxBuffer: 1024 * 1024 * 16,
      ...options
    }, (error, stdout, stderr) => {
      if (error) {
        const message = stderr ? `${error.message}\n${stderr}` : error.message;
        reject(new Error(message));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

async function requestBuffer(url, options = {}, redirectsLeft = 5) {
  const parsed = new URL(url);
  const client = parsed.protocol === "http:" ? http : https;
  const headers = Object.assign({
    "User-Agent": options.userAgent || APP_NAME,
    "Accept": options.accept || "text/yaml, application/yaml, application/json, text/plain, */*",
    "Accept-Encoding": "gzip, deflate, br"
  }, options.headers || {});

  return new Promise((resolve, reject) => {
    const request = client.request(parsed, {
      method: options.method || "GET",
      headers,
      timeout: options.timeout || 30000
    }, (response) => {
      const status = response.statusCode || 0;
      const location = response.headers.location;

      if ([301, 302, 303, 307, 308].includes(status) && location) {
        response.resume();
        if (redirectsLeft <= 0) {
          reject(new Error("Too many HTTP redirects."));
          return;
        }
        requestBuffer(new URL(location, parsed).toString(), options, redirectsLeft - 1).then(resolve, reject);
        return;
      }

      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const body = Buffer.concat(chunks);
        if (status < 200 || status >= 300) {
          const error = new Error(`HTTP ${status} from ${parsed.host}`);
          error.statusCode = status;
          error.host = parsed.host;
          reject(error);
          return;
        }
        decompress(body, response.headers["content-encoding"]).then(resolve, reject);
      });
    });

    request.on("timeout", () => {
      request.destroy(new Error(`Request timed out: ${parsed.host}`));
    });
    request.on("error", reject);
    request.end(options.body || undefined);
  });
}

function decompress(body, encoding) {
  const normalized = String(encoding || "").toLowerCase();
  if (normalized.includes("gzip")) {
    return promisifyZlib(zlib.gunzip, body);
  }
  if (normalized.includes("deflate")) {
    return promisifyZlib(zlib.inflate, body);
  }
  if (normalized.includes("br")) {
    return promisifyZlib(zlib.brotliDecompress, body);
  }
  return Promise.resolve(body);
}

function promisifyZlib(fn, body) {
  return new Promise((resolve, reject) => {
    fn(body, (error, result) => {
      if (error) {
        reject(error);
      } else {
        resolve(result);
      }
    });
  });
}

function resolveRedirectUrl(url, redirectsLeft = 5) {
  const parsed = new URL(url);
  const client = parsed.protocol === "http:" ? http : https;

  return new Promise((resolve, reject) => {
    const request = client.request(parsed, {
      method: "GET",
      headers: {
        "User-Agent": APP_NAME,
        "Accept": "text/html, */*"
      },
      timeout: 30000
    }, (response) => {
      const status = response.statusCode || 0;
      const location = response.headers.location;
      response.resume();

      if ([301, 302, 303, 307, 308].includes(status) && location) {
        if (redirectsLeft <= 0) {
          reject(new Error("Too many HTTP redirects."));
          return;
        }
        resolveRedirectUrl(new URL(location, parsed).toString(), redirectsLeft - 1).then(resolve, reject);
        return;
      }

      if (status < 200 || status >= 300) {
        reject(new Error(`HTTP ${status} from ${parsed.host}`));
        return;
      }
      resolve(parsed.toString());
    });

    request.on("timeout", () => {
      request.destroy(new Error(`Request timed out: ${parsed.host}`));
    });
    request.on("error", reject);
    request.end();
  });
}

function tailFile(file, maxLines = 160) {
  if (!fs.existsSync(file)) {
    return "";
  }
  const text = fs.readFileSync(file, "utf8");
  return text.split(/\r?\n/).slice(-maxLines).join("\n");
}

function todayStamp(date = new Date()) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function nowIso() {
  return new Date().toISOString();
}

function stripAnsi(text) {
  return String(text).replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "");
}

module.exports = {
  ensureDir,
  execFileAsync,
  isValidUrl,
  maskUrl,
  nowIso,
  psQuote,
  requestBuffer,
  resolveRedirectUrl,
  sleep,
  stripAnsi,
  tailFile,
  todayStamp
};
