---
name: clash-console-start
description: Start the local Clash Sub Runner network console for this repository and report the browser URL. Use when the user asks to start, open, launch, or get the URL for this project's local VPN/network console, Clash Sub Runner UI, or local proxy dashboard.
---

# Clash Console Start

## Workflow

1. Verify the current workspace is the `clash-sub-runner` project by reading `package.json`.
2. Run the project PowerShell script from the repository root. If the user asks to open the web page, pass `-Open`; if they only ask for the URL, omit it:

```powershell
.\scripts\start-console.ps1
.\scripts\start-console.ps1 -Open
```

3. Read the script output and tell the user the URL.

## Guardrails

- Do not print or inspect `subscription.txt`.
- Start only the local GUI API unless the user explicitly asks to enable Clash proxying.
- `-Open` only opens the local web UI in the default browser; it must not enable Clash proxying.
- The script may reuse an existing GUI service on ports `17980` through `17989`.
- If startup fails, report the script error and do not try unrelated ports outside the configured fallback range.
