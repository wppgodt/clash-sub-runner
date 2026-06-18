$ErrorActionPreference = 'Stop'

$script = Join-Path (Join-Path $PSScriptRoot 'scripts') 'start-console.ps1'
& $script @args
