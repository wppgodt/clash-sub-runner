# Clash Sub Runner

Windows GUI launcher for a Clash/Mihomo subscription.

## Use

Put `subscription.txt` next to `clash-sub-runner.exe`. The first non-empty line is the subscription URL.

Run:

```powershell
.\clash-sub-runner.exe
```

The app opens a local GUI window and auto-starts Mihomo. It uses:

- local mixed proxy: `127.0.0.1:7890`
- local GUI/API: `http://127.0.0.1:17980` by default, with automatic fallback through `17989` if another local service already owns the port
- Mihomo controller: `http://127.0.0.1:9090`

## GUI Features

- start, stop, refresh subscription, node delay test, one-click reset
- rule/global/direct mode switching
- region and node selection
- live status polling from the running Mihomo controller
- persistent speed-test results and live progress in the `Speed Test` panel
- app and core logs under `data\logs`
- cached config fallback when the subscription server returns errors such as `HTTP 502`
- transient subscription `5xx` responses are retried before falling back to the cached config
- current-process app logs in the GUI, so stale errors from earlier runs do not mask the live state

One-click reset restores the Windows proxy, stops the owned Mihomo process, clears runtime cache files, resets mode to `rule`, and restarts if the service was running.

## PowerShell Control

These commands control the running GUI service:

```powershell
.\clash-sub-runner.exe --cmd status
.\clash-sub-runner.exe --cmd mode global
.\clash-sub-runner.exe --cmd mode rule
.\clash-sub-runner.exe --cmd region Japan
.\clash-sub-runner.exe --cmd region "Hong Kong"
.\clash-sub-runner.exe --cmd reset
.\clash-sub-runner.exe --cmd test
.\clash-sub-runner.exe --cmd logs
```

The GUI refreshes every second, so changes made through PowerShell or MCP are reflected in the app.
`--cmd test` runs both the external-IP check and node delay checks; the same latest result is saved in `data\app-state.json` and shown in the GUI.

## MCP

Run the same executable as a stdio MCP server:

```powershell
.\clash-sub-runner.exe --mcp
```

Codex or Claude Desktop configuration:

```json
{
  "mcpServers": {
    "clashSubRunner": {
      "command": "D:\\\\path\\\\to\\\\clash-sub-runner.exe",
      "args": ["--mcp"]
    }
  }
}
```

MCP tools:

- `vpn_get_status`
- `vpn_start`
- `vpn_stop`
- `vpn_set_mode`
- `vpn_select_region`
- `vpn_reset`
- `vpn_test_connectivity`
- `vpn_tail_logs`

## Build

```powershell
npm install
npm run build
```

The executable is created at:

```text
dist\clash-sub-runner.exe
```

## Tests

```powershell
npm test
```

Covered cases:

- subscription YAML normalization and invalid response handling
- region detection and selectable-node filtering
- MCP initialize/tools contract
- GUI required controls
- external-IP parsing for connectivity diagnostics
- runtime help output
- cached Mihomo config validation
- local GUI API startup

## Useful Options

```text
--console              Run without GUI.
--mcp                  Run MCP stdio server.
--cmd <name>           Control the running GUI service.
--refresh-only         Fetch and write config, then exit.
--no-system-proxy      Do not change Windows proxy settings.
--restore-proxy        Restore proxy backup and stop owned core.
--download-core-only   Download/verify the Mihomo core, then exit.
--subscription <url>   Save/update the subscription URL.
--port <number>        Local mixed proxy port. Default: 7890.
--ui-port <number>     Local GUI/API port. Default: 17980; GUI startup can fall back through 17989.
--core <path>          Use an existing Mihomo executable.
--no-auto-start        Open GUI without starting VPN.
--no-open              Start GUI/API without opening a browser window.
```
