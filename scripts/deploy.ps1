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
    throw "需要 $Name，但 PATH 中未找到该命令。"
  }
  return $command.Source
}

function Assert-ProjectRoot([string]$Root) {
  $packagePath = Join-Path $Root 'package.json'
  if (!(Test-Path -LiteralPath $packagePath)) {
    throw "缺少 package.json；请在 Clash Sub Runner 仓库中运行此脚本。"
  }

  $package = Get-Content -LiteralPath $packagePath -Raw | ConvertFrom-Json
  if ($package.name -ne 'clash-sub-runner') {
    throw "package.json 的 name 是 '$($package.name)'，预期为 'clash-sub-runner'。"
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
      throw "提供的订阅 URL 必须是完整的 http(s) URL。"
    }
    [System.IO.File]::WriteAllText($subscriptionPath, "$($Url.Trim())$([Environment]::NewLine)", $utf8NoBom)
    Write-Host "已保存订阅 URL 到 subscription.txt。"
    return
  }

  if (Test-Path -LiteralPath $subscriptionPath) {
    Write-Host "已找到 subscription.txt。"
    return
  }

  Write-Host "未找到 subscription.txt。首次部署需要提供 Clash/Mihomo 订阅 URL。"
  Write-Host "该 URL 只会写入本地 subscription.txt，不会提交到仓库。"
  $entered = Read-Host "请输入 Clash/Mihomo 订阅 URL"
  if (!(Test-HttpUrl $entered)) {
    throw "订阅 URL 必须是完整的 http(s) URL。"
  }
  [System.IO.File]::WriteAllText($subscriptionPath, "$($entered.Trim())$([Environment]::NewLine)", $utf8NoBom)
  Write-Host "已保存订阅 URL 到 subscription.txt。"
}

function Invoke-Step([string]$Label, [scriptblock]$Action) {
  Write-Host ""
  Write-Host "==> $Label"
  & $Action
}

$root = Resolve-FullPath (Join-Path $PSScriptRoot '..')
Set-Location $root
Assert-ProjectRoot $root

Invoke-Step "检查本地工具" {
  Assert-Command node | Out-Null
  Assert-Command npm | Out-Null
}

Invoke-Step "安装 npm 依赖" {
  npm install
}

Invoke-Step "准备订阅文件" {
  Ensure-Subscription $root $SubscriptionUrl
}

Invoke-Step "下载或验证 Mihomo core" {
  node src\index.js --download-core-only
}

Invoke-Step "刷新 Clash 配置但不修改 Windows 系统代理" {
  node src\index.js --refresh-only --no-system-proxy
}

if ($Build) {
  Invoke-Step "构建可分发可执行文件" {
    npm run build
  }
}

if (!$SkipTests) {
  Invoke-Step "运行源码测试" {
    node --test test/*.test.js
  }
}

Invoke-Step "启动本地控制台" {
  $startScript = Join-Path $root 'scripts\start-console.ps1'
  if ($Open) {
    & $startScript -Open
  } else {
    & $startScript
  }
}
