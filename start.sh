#!/usr/bin/env sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$script_dir"

ps_script=".\\scripts\\start-console.ps1"

ps_cmd=""
if command -v pwsh >/dev/null 2>&1; then
  ps_cmd="pwsh"
elif command -v powershell.exe >/dev/null 2>&1; then
  ps_cmd="powershell.exe"
elif command -v powershell >/dev/null 2>&1; then
  ps_cmd="powershell"
else
  echo "PowerShell was not found. Install PowerShell or run the .ps1 script directly." >&2
  exit 1
fi

start_output=$("$ps_cmd" -NoProfile -ExecutionPolicy Bypass -File "$ps_script" "$@")
echo "$start_output"

node_cmd=""
if command -v node >/dev/null 2>&1; then
  node_cmd="node"
elif command -v node.exe >/dev/null 2>&1; then
  node_cmd="node.exe"
else
  echo "Skipped connectivity refresh because node was not found." >&2
  exit 0
fi

START_OUTPUT=$start_output "$node_cmd" - "$start_output" <<'NODE'
const http = require("http");

const raw = (process.env.START_OUTPUT || process.argv[2] || "").replace(/\0/g, "");
const jsonLine = raw.split(/\r?\n/)
  .map((line) => {
    const start = line.indexOf("{");
    const end = line.lastIndexOf("}");
    return start >= 0 && end > start ? line.slice(start, end + 1) : "";
  })
  .find(Boolean);
if (!jsonLine) {
  console.error("Skipped connectivity refresh because start output did not include JSON.");
  process.exit(0);
}

let result;
try {
  result = JSON.parse(jsonLine);
} catch (error) {
  console.error(`Skipped connectivity refresh because start output JSON could not be parsed: ${error.message}`);
  process.exit(0);
}

if (!result.ok || !result.port) {
  console.error("Skipped connectivity refresh because the console did not start cleanly.");
  process.exit(0);
}

const body = "{}";
const request = http.request({
  hostname: "127.0.0.1",
  port: Number(result.port),
  path: "/api/connectivity",
  method: "POST",
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body)
  }
}, (response) => {
  const chunks = [];
  response.on("data", (chunk) => chunks.push(chunk));
  response.on("end", () => {
    const text = Buffer.concat(chunks).toString("utf8");
    let payload = {};
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      payload = {};
    }

    if (response.statusCode < 200 || response.statusCode >= 300) {
      console.error(`Connectivity refresh failed: HTTP ${response.statusCode} ${text}`.trim());
      process.exit(0);
    }

    if (payload.ok) {
      console.log(`Connectivity OK: ${payload.ip || "external IP detected"}`);
    } else {
      console.error(`Connectivity refresh failed: ${payload.error || "unknown error"}`);
    }
  });
});

request.on("timeout", () => {
  request.destroy(new Error("connectivity refresh timed out"));
});

request.on("error", (error) => {
  console.error(`Connectivity refresh failed: ${error.message}`);
});

request.end(body);
NODE
