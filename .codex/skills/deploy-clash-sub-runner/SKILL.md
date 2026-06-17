---
name: deploy-clash-sub-runner
description: 在 Windows 上部署并验证全新克隆的 Clash Sub Runner 仓库。用于用户要求 setup、install、deploy、bootstrap、首次运行、克隆后部署本项目时，包括准备依赖、订阅配置、Mihomo core、本地配置刷新、测试和本地网络控制台 URL。
---

# 部署 Clash Sub Runner

## 流程

1. 通过读取 `package.json` 确认当前工作区是 `clash-sub-runner` 项目。
2. 明确首次部署至少需要用户提供 Clash/Mihomo 订阅 URL。该 URL 会写入本地 `subscription.txt`，但不要在聊天中索要、读取或打印该文件内容。
3. 在仓库根目录运行项目部署脚本：

```powershell
.\scripts\deploy.ps1
```

如果缺少 `subscription.txt`，部署脚本会在用户终端中提示输入订阅 URL。让用户在终端里输入，不要要求用户把订阅 URL 粘贴到聊天中。

仅在用户要求或确有需要时使用这些参数：

```powershell
.\scripts\deploy.ps1 -Open
.\scripts\deploy.ps1 -Build
.\scripts\deploy.ps1 -SkipTests
.\scripts\deploy.ps1 -SubscriptionUrl "https://example.com/clash.yaml"
```

4. 读取脚本输出，并向用户报告本地控制台 URL。

## 约束

- 绝不打印、查看或提交 `subscription.txt`。
- 绝不提交 `data/`、`dist/`、`node_modules/`、`outputs/` 或日志。
- 如果脚本提示输入订阅 URL，让用户在自己的终端里输入；不要要求用户把订阅 URL 粘贴到聊天里。
- 如果全新克隆中的 `npm test` 仅因缺少 `dist\` 失败，使用部署脚本已经运行过的源码级验证，或运行 `.\scripts\deploy.ps1 -Build`。
- 部署脚本可以启动本地 GUI/API，但除非用户在 UI 或项目命令中明确要求，否则不要启用 Clash 代理。
