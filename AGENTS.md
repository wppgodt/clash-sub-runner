# 仓库协作规则

## 环境

- 本项目面向 Windows，默认使用 PowerShell 原生命令。
- 搜索优先使用 `rg`；文件操作优先使用 PowerShell cmdlet。
- JSON、YAML、TOML、`.env`、lockfile 等解析敏感文件应保持 UTF-8 无 BOM。

## 安全

- 不要读取、打印、提交或暴露 `subscription.txt`。
- 不要提交运行时或生成目录：`data/`、`dist/`、`node_modules/`、`outputs/`。
- 不要提交日志、本地凭据或个人配置。
- 公开提交前，先扫描 staged 文件，确认没有订阅 URL、token、密码或私钥。

## 项目流程

- clone 后首次部署使用 `scripts\deploy.ps1`。
- 启动本地网络控制台使用 `scripts\start-console.ps1` 或 `./start.sh`。
- 修改代码后，在本地运行时验证所需构建产物可用的情况下运行 `npm test`。
- 如果 fresh clone 中的 `npm test` 仅因缺少 `dist\` 失败，先运行 `npm run build`，或用 `node --test test/*.test.js` 做源码级验证。
