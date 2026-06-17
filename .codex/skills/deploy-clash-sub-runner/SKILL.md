---
name: deploy-clash-sub-runner
description: Deploy and validate a freshly cloned Clash Sub Runner repository on Windows. Use when the user asks to set up, install, deploy, bootstrap, or first-run this project after cloning, including preparing dependencies, subscription config, Mihomo core, local config refresh, tests, and the local network console URL.
---

# Deploy Clash Sub Runner

## Workflow

1. Verify the current workspace is the `clash-sub-runner` project by reading `package.json`.
2. Do not read or print `subscription.txt`.
3. Run the project deployment script from the repository root:

```powershell
.\scripts\deploy.ps1
```

Use these options only when requested or appropriate:

```powershell
.\scripts\deploy.ps1 -Open
.\scripts\deploy.ps1 -Build
.\scripts\deploy.ps1 -SkipTests
.\scripts\deploy.ps1 -SubscriptionUrl "https://example.com/clash.yaml"
```

4. Read the script output and report the local console URL.

## Guardrails

- Never print, inspect, or commit `subscription.txt`.
- Never commit `data/`, `dist/`, `node_modules/`, `outputs/`, or logs.
- If the script prompts for a subscription URL, let the user provide it in their terminal; do not ask them to paste it into chat.
- If `npm test` fails in a fresh clone only because `dist\` is absent, use the source-level validation already run by the deployment script or run `.\scripts\deploy.ps1 -Build`.
- The deployment script may start the local GUI/API but must not enable Clash proxying unless the user explicitly requests that in the UI or through project commands.
