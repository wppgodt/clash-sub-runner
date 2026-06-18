#!/usr/bin/env sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$script_dir"

if command -v node >/dev/null 2>&1; then
  exec node scripts/start-console.js "$@"
else
  echo "Node.js was not found. Install Node.js in this shell or run scripts/start-console.ps1 from PowerShell." >&2
  exit 1
fi
