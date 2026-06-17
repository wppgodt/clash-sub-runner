param(
  [switch]$Open
)

$ErrorActionPreference = 'Stop'

$DefaultPort = 17980
$FallbackCount = 10

function Resolve-FullPath([string]$Path) {
  return [System.IO.Path]::GetFullPath($Path).TrimEnd('\')
}

function Get-ProjectRoot {
  if (![string]::IsNullOrWhiteSpace($PSScriptRoot)) {
    return Resolve-FullPath (Join-Path $PSScriptRoot '..')
  }
  return Resolve-FullPath (Get-Location).Path
}

function Get-StatusOnPort([int]$Port) {
  try {
    $response = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/status" -TimeoutSec 2
    if ($null -ne $response.app -and $response.app.uiPort -eq $Port) {
      return $response
    }
  } catch {
  }
  return $null
}

function Wait-ForStatus([int]$Port, [int]$TimeoutSeconds) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    $status = Get-StatusOnPort -Port $Port
    if ($null -ne $status) {
      return $status
    }
    Start-Sleep -Milliseconds 400
  }
  return $null
}

function Complete-ConsoleStart([pscustomobject]$Result) {
  if ($Open -and $Result.ok -and ![string]::IsNullOrWhiteSpace($Result.url)) {
    Start-Process $Result.url
  }

  $Result | ConvertTo-Json -Compress
  exit 0
}

$root = Get-ProjectRoot
$packagePath = Join-Path $root 'package.json'
if (!(Test-Path -LiteralPath $packagePath)) {
  throw "缺少 package.json；当前目录不像 Clash Sub Runner 项目。"
}

$package = Get-Content -LiteralPath $packagePath -Raw | ConvertFrom-Json
if ($package.name -ne 'clash-sub-runner') {
  throw "package.json 的 name 是 '$($package.name)'，预期为 'clash-sub-runner'。"
}

foreach ($port in $DefaultPort..($DefaultPort + $FallbackCount - 1)) {
  $status = Get-StatusOnPort -Port $port
  if ($null -ne $status) {
    Complete-ConsoleStart ([pscustomobject]@{
      ok = $true
      reused = $true
      url = "http://127.0.0.1:$port/"
      port = $port
      pid = $status.app.childPid
      path = $status.networkPath.id
    })
  }
}

$node = (Get-Command node -ErrorAction Stop).Source
$args = @('src\index.js', '--no-open', '--no-auto-start', '--ui-port', [string]$DefaultPort)
Start-Process -FilePath $node -ArgumentList $args -WorkingDirectory $root -WindowStyle Hidden | Out-Null

foreach ($port in $DefaultPort..($DefaultPort + $FallbackCount - 1)) {
  $status = Wait-ForStatus -Port $port -TimeoutSeconds 10
  if ($null -ne $status) {
    Complete-ConsoleStart ([pscustomobject]@{
      ok = $true
      reused = $false
      url = "http://127.0.0.1:$port/"
      port = $port
      pid = $status.app.childPid
      path = $status.networkPath.id
    })
  }
}

throw "已启动 GUI 进程，但端口 $DefaultPort-$($DefaultPort + $FallbackCount - 1) 上没有本地 API 可用。"
