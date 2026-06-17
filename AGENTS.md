# Repository Instructions

## Environment

- This project targets Windows. Use PowerShell-native commands by default.
- Prefer `rg` for search and native PowerShell cmdlets for filesystem work.
- Keep parser-sensitive files such as JSON, YAML, TOML, `.env`, and lockfiles as UTF-8 without BOM.

## Safety

- Do not read, print, commit, or expose `subscription.txt`.
- Do not commit runtime or generated directories: `data/`, `dist/`, `node_modules/`, or `outputs/`.
- Do not commit logs or local credentials.
- Before public commits, scan staged files for subscription URLs, tokens, passwords, and private keys.

## Project Workflows

- For first-time setup after cloning, use `scripts\deploy.ps1`.
- To start the local network console, use `scripts\start-console.ps1` or `./start.sh`.
- Run `npm test` after code changes when the local build artifacts required by the runtime verifier are available.
- If `npm test` fails only because `dist\` is absent in a fresh clone, run `npm run build` first or run `node --test test/*.test.js` for source-level validation.
