param(
  [string]$SubscriptionUrl = "",
  [switch]$Open,
  [switch]$Build,
  [switch]$SkipTests
)

$ErrorActionPreference = 'Stop'

function Resolve-FullPath([string]$Path) {
  return [System.IO.Path]::GetFullPath($Path).TrimEnd('\')
}

function Assert-Command([string]$Name) {
  $command = Get-Command $Name -ErrorAction SilentlyContinue
  if ($null -eq $command) {
    throw "$Name is required but was not found on PATH."
  }
  return $command.Source
}

function Assert-ProjectRoot([string]$Root) {
  $packagePath = Join-Path $Root 'package.json'
  if (!(Test-Path -LiteralPath $packagePath)) {
    throw "package.json is missing; run this script from the Clash Sub Runner repository."
  }

  $package = Get-Content -LiteralPath $packagePath -Raw | ConvertFrom-Json
  if ($package.name -ne 'clash-sub-runner') {
    throw "package.json name is '$($package.name)', expected 'clash-sub-runner'."
  }
}

function Test-HttpUrl([string]$Value) {
  if ([string]::IsNullOrWhiteSpace($Value)) {
    return $false
  }

  try {
    $uri = [System.Uri]$Value
    return $uri.IsAbsoluteUri -and ($uri.Scheme -eq 'http' -or $uri.Scheme -eq 'https')
  } catch {
    return $false
  }
}

function Ensure-Subscription([string]$Root, [string]$Url) {
  $subscriptionPath = Join-Path $Root 'subscription.txt'
  $utf8NoBom = [System.Text.UTF8Encoding]::new($false)

  if (![string]::IsNullOrWhiteSpace($Url)) {
    if (!(Test-HttpUrl $Url)) {
      throw "The provided subscription URL must be an absolute http(s) URL."
    }
    [System.IO.File]::WriteAllText($subscriptionPath, "$($Url.Trim())$([Environment]::NewLine)", $utf8NoBom)
    Write-Host "Saved subscription URL to subscription.txt."
    return
  }

  if (Test-Path -LiteralPath $subscriptionPath) {
    Write-Host "Found subscription.txt."
    return
  }

  $entered = Read-Host "Enter your Clash/Mihomo subscription URL"
  if (!(Test-HttpUrl $entered)) {
    throw "The subscription URL must be an absolute http(s) URL."
  }
  [System.IO.File]::WriteAllText($subscriptionPath, "$($entered.Trim())$([Environment]::NewLine)", $utf8NoBom)
  Write-Host "Saved subscription URL to subscription.txt."
}

function Invoke-Step([string]$Label, [scriptblock]$Action) {
  Write-Host ""
  Write-Host "==> $Label"
  & $Action
}

$root = Resolve-FullPath (Join-Path $PSScriptRoot '..')
Set-Location $root
Assert-ProjectRoot $root

Invoke-Step "Checking local tools" {
  Assert-Command node | Out-Null
  Assert-Command npm | Out-Null
}

Invoke-Step "Installing npm dependencies" {
  npm install
}

Invoke-Step "Preparing subscription file" {
  Ensure-Subscription $root $SubscriptionUrl
}

Invoke-Step "Downloading or verifying Mihomo core" {
  node src\index.js --download-core-only
}

Invoke-Step "Refreshing Clash config without changing Windows proxy" {
  node src\index.js --refresh-only --no-system-proxy
}

if ($Build) {
  Invoke-Step "Building distributable executables" {
    npm run build
  }
}

if (!$SkipTests) {
  Invoke-Step "Running source tests" {
    node --test test/*.test.js
  }
}

Invoke-Step "Starting local console" {
  $startScript = Join-Path $root 'scripts\start-console.ps1'
  if ($Open) {
    & $startScript -Open
  } else {
    & $startScript
  }
}
