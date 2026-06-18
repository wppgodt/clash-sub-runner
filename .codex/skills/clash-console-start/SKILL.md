---
name: clash-console-start
description: 启动本仓库的 Clash Sub Runner 本地网络控制台并报告浏览器 URL。用于用户要求启动、打开、launch，或获取本项目本地 VPN/network console、Clash Sub Runner UI、本地代理控制台 URL 时。
---

# 启动 Clash 控制台

## 流程

1. 通过读取 `package.json` 确认当前工作区是 `clash-sub-runner` 项目。
2. 在仓库根目录运行项目 PowerShell 入口。如果用户要求打开网页，传入 `-Open`；如果只要 URL，则省略：

```powershell
.\start.ps1
.\start.ps1 -Open
```

3. 读取脚本输出，并告诉用户 URL。

## 约束

- 不要打印或查看 `subscription.txt`。
- 除非用户明确要求启用 Clash 代理，否则只启动本地 GUI API。
- `-Open` 只会用默认浏览器打开本地 Web UI，不能启用 Clash 代理。
- 脚本可能复用 `17980` 到 `17989` 端口上的已有 GUI 服务。
- 如果启动失败，报告脚本错误，不要尝试配置范围外的无关端口。
