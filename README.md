# Clash Sub Runner

Windows 上的 Clash/Mihomo 图形启动器，用于基于订阅配置启动本地代理、查看网络路径并控制节点。

## 使用

把 `subscription.txt` 放在 `clash-sub-runner.exe` 同级目录下。文件第一行非空内容应为订阅 URL。

运行：

```powershell
.\clash-sub-runner.exe
```

应用会打开本地图形窗口并自动启动 Mihomo。默认使用：

- 本地 mixed proxy 端口：`127.0.0.1:7890`
- 本地 GUI/API：默认 `http://127.0.0.1:17980`，如果端口被占用，会自动回退到 `17989`
- Mihomo 控制器：`http://127.0.0.1:9090`

## 从源码部署

在 Windows 上克隆后运行：

```powershell
.\scripts\deploy.ps1
```

部署脚本会安装 npm 依赖、准备 `subscription.txt`、下载或验证 Mihomo core、在不修改 Windows 系统代理的前提下刷新 Clash 配置、运行源码测试、启动本地控制台并输出 URL。

首次部署至少需要一个 Clash/Mihomo 订阅 URL。如果仓库根目录缺少 `subscription.txt`，部署脚本会在终端中提示输入订阅 URL，并把它保存到本地 `subscription.txt`。该文件已被 `.gitignore` 忽略，不应提交到仓库。

常用部署参数：

```powershell
.\scripts\deploy.ps1 -Open
.\scripts\deploy.ps1 -Build
.\scripts\deploy.ps1 -SkipTests
.\scripts\deploy.ps1 -SubscriptionUrl "https://example.com/clash.yaml"
```

Codex 用户克隆后也可以调用项目技能：`$deploy-clash-sub-runner`。

## 启动本地控制台

Windows PowerShell 用户建议直接运行：

```powershell
.\start.ps1
.\start.ps1 -Open
```

Git Bash、macOS、Linux 或其他已经能直接运行 `node` 的 shell 可以运行：

```sh
./start.sh
```

`start.sh` 只调用当前 shell 中的 `node`，不会再选择 `pwsh.exe` 或 `powershell.exe`。如果你使用 WSL 的 `bash.exe`，需要先在 WSL 内安装 Node.js，或者改用 PowerShell 脚本。
底层 Windows 启动逻辑仍在 `scripts\start-console.ps1`，日常使用根目录入口即可。

## GUI 功能

- 启动、停止、刷新订阅、节点测速、一键重置
- `rule` / `global` / `direct` 模式切换
- 地区和节点选择
- 从正在运行的 Mihomo 控制器实时轮询状态
- 在 `Speed Test` 面板持久化测速结果并显示实时进度
- 应用日志和 core 日志写入 `data\logs`
- 订阅服务器返回 `HTTP 502` 等错误时，可回退到缓存配置
- 订阅临时 `5xx` 错误会先重试，再回退到缓存配置
- GUI 只展示当前进程的应用日志，避免旧错误掩盖当前状态

一键重置会恢复 Windows 代理、停止本项目持有的 Mihomo 进程、清理运行时缓存文件、把模式重置为 `rule`，并在服务原本运行时重新启动。

## PowerShell 控制

以下命令可以控制正在运行的 GUI 服务：

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

GUI 每秒刷新一次，因此通过 PowerShell 或 MCP 做出的改动会反映到界面中。
`--cmd test` 会同时运行外部 IP 检查和节点延迟测试，最新结果会保存到 `data\app-state.json` 并显示在 GUI 中。

## MCP

同一个可执行文件可以作为 stdio MCP 服务运行：

```powershell
.\clash-sub-runner.exe --mcp
```

Codex 或 Claude Desktop 配置示例：

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

MCP 工具：

- `vpn_get_status`
- `vpn_start`
- `vpn_stop`
- `vpn_set_mode`
- `vpn_select_region`
- `vpn_reset`
- `vpn_test_connectivity`
- `vpn_tail_logs`

## 构建

```powershell
npm install
npm run build
```

构建产物位于：

```text
dist\clash-sub-runner.exe
```

## 测试

```powershell
npm test
```

覆盖场景：

- 订阅 YAML 规范化和非法响应处理
- 地区识别和可选择节点过滤
- MCP 初始化和工具列表协议
- GUI 必需控件
- 连通性诊断中的外部 IP 解析
- 运行时帮助输出
- 缓存 Mihomo 配置验证
- 本地 GUI API 启动

## 常用参数

```text
--console              不打开 GUI，直接运行。
--mcp                  作为 MCP stdio 服务运行。
--cmd <name>           控制正在运行的 GUI 服务。
--refresh-only         拉取并写入配置后退出。
--no-system-proxy      不修改 Windows 系统代理。
--restore-proxy        恢复代理备份并停止本项目持有的 core。
--download-core-only   下载或验证 Mihomo core 后退出。
--subscription <url>   保存或更新订阅 URL。
--port <number>        本地 mixed proxy 端口，默认 7890。
--ui-port <number>     本地 GUI/API 端口，默认 17980；启动时可回退到 17989。
--core <path>          使用已有 Mihomo 可执行文件。
--no-auto-start        打开 GUI/API，但不自动启动 VPN。
--no-open              启动 GUI/API，但不打开浏览器窗口。
```
