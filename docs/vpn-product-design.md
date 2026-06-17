# VPN Product Design

目标：把这个项目做成一个“网络路径可视化 + Clash 代理控制”的实用型 VPN 工具。

这个产品不应该先追求复杂代理配置，而应该先解决用户最痛的问题：

> 我现在到底在走哪条网络路径？如果不通，下一步应该怎么切？

## 产品定位

这是一个 Windows 桌面网络工具，不是单纯的 Clash 启动器。

它应该同时回答三件事：

- 当前流量路径：直连、WARP、Clash、Clash + WARP、断网。
- 当前风险点：系统代理没开、TUN 没开、WARP 断开、Clash 节点不可用、DNS 异常。
- 当前操作建议：继续使用 WARP、切到 Clash、切换节点、恢复系统代理、停止代理。

## 推荐用户模型

用户不应该被迫理解所有底层概念。产品里只保留 4 个用户模式：

| 模式 | 含义 | 底层行为 |
|---|---|---|
| 自动 | 推荐模式，产品自己选当前最可靠路线 | 优先 WARP；WARP 不健康时启用 Clash 系统代理 |
| WARP 优先 | 主要使用 Cloudflare WARP | 监控 WARP 状态和出口，Clash 可作为备用 |
| Clash 代理 | 使用 Clash 节点作为出口 | 打开系统代理，Mihomo 按 rule/global/direct 运行 |
| 直连 | 不使用本产品代理 | 关闭系统代理，停止或旁路 Mihomo |

不建议把 `rule/global/direct/TUN/mixed-port` 直接暴露成主要入口。它们应该在“高级设置”里。

## 第一屏设计

第一屏就是工具本体，不做介绍页。

```text
┌──────────────────────────────────────────────────────────┐
│ 当前路径                                                  │
│ PowerShell / 浏览器 -> Windows 路由 -> Cloudflare WARP -> US LAX │
│ 状态：可用  延迟：xx ms  出口 IP：104.x.x.x  DNS：WARP/本地       │
├──────────────────────────────────────────────────────────┤
│ 路径图                                                    │
│ [应用] -> [系统代理/Clash? 否] -> [Windows 路由] -> [WARP] -> [目标] │
├──────────────────────┬───────────────────────────────────┤
│ 当前能力              │ 操作                              │
│ WARP: 已连接/healthy  │ [使用 WARP] [切到 Clash] [直连]     │
│ Clash: 运行/未接管    │ [测试节点] [选择地区] [修复代理]    │
│ 系统代理: 关闭        │                                   │
│ DNS: 正常             │                                   │
└──────────────────────┴───────────────────────────────────┘
```

第一屏必须清楚显示：

- 当前实际路径，而不是只显示软件开关。
- 当前出口 IP、国家/机房、是否 WARP。
- Clash 是否运行、是否接管、当前模式、当前节点。
- 系统代理是否打开，指向哪个端口。
- 一键操作：切到 WARP、切到 Clash、恢复直连。

## 路径判定引擎

核心模块应该叫 `NetworkPathEngine`。它不直接控制网络，只负责检测和解释。

输入：

- Windows 系统代理：`ProxyEnable`、`ProxyServer`。
- WinHTTP 代理：`netsh winhttp show proxy`。
- 环境变量代理：`HTTP_PROXY`、`HTTPS_PROXY`、`ALL_PROXY`、`NO_PROXY`。
- Mihomo controller：`/configs`、`/proxies`、`/connections`。
- WARP 状态：`warp-cli status`、`warp-cli settings`。
- 路由表：`Get-NetRoute`，重点看 WARP 路由和默认路由。
- DNS：系统 DNS、WARP DNS、本地 Clash DNS。
- 外部 trace：Cloudflare trace、ipify、目标连通性测试。

输出：

```json
{
  "path": "app -> windows-route -> warp -> target",
  "label": "当前默认走 Cloudflare WARP",
  "confidence": "high",
  "components": {
    "warp": "healthy",
    "clash": "running-not-capturing",
    "systemProxy": "off",
    "tun": "off",
    "dns": "ok"
  },
  "recommendation": "保持 WARP；如 WARP 断开，切到 Clash 代理模式"
}
```

路径枚举：

- `direct`: 应用 -> Windows 路由 -> 物理网卡/ISP -> 目标。
- `warp`: 应用 -> Windows 路由 -> WARP -> 目标。
- `clash-direct`: 应用 -> Clash -> DIRECT -> Windows 路由 -> 目标。
- `clash-direct-warp`: 应用 -> Clash -> DIRECT -> Windows 路由 -> WARP -> 目标。
- `clash-proxy`: 应用 -> Clash -> 代理节点 -> 目标。
- `clash-proxy-warp-carried`: 应用 -> Clash -> WARP 承载到代理节点 -> 代理节点 -> 目标。
- `broken`: DNS、路由、代理端口、节点或 WARP 至少一项失败。

## 控制策略

控制模块应该叫 `NetworkController`。它只执行用户明确选择的模式。

### 自动模式

自动模式推荐策略：

1. WARP healthy 且 trace 显示 `warp=on`：保持 WARP，不启用系统代理。
2. WARP disconnected 或 trace 失败：启动 Mihomo，打开 Windows 系统代理到本地 mixed port。
3. Clash 节点测试失败：切换到 fallback/url-test 组中可用节点。
4. 用户点“恢复直连”：关闭系统代理，停止本项目持有的 Mihomo core。

### Clash 代理模式

底层行为：

- 确保 Mihomo core 运行。
- 确保 config 存在并可用。
- 打开 Windows 用户系统代理到 `127.0.0.1:<mixed-port>`。
- 默认 `mode=rule`。
- 允许用户切 `global`，但 UI 文案必须说明：Global 是全局选择器，不等于必然代理。

建议优先使用系统代理，不默认启用 TUN。原因：

- 当前项目已经支持系统代理。
- TUN 需要更严格的路由、防回环、DNS 和权限处理。
- 对普通用户，系统代理更可解释、恢复风险更低。

### WARP 优先模式

底层行为：

- 不控制 Cloudflare One Client 的账号策略，只读取状态。
- 展示 WARP mode、status、network、gateway、split tunnel 信息。
- 如 WARP 不健康，提示切换到 Clash 代理模式。

## 可视化设计

图形不要展示完整复杂拓扑，只展示当前命中的路径。

示例：

```text
当前路径
[应用] -> [Windows 路由] -> [WARP: LAX / US] -> [目标]
```

当切到 Clash：

```text
当前路径
[应用] -> [Clash: rule / Hong Kong] -> [代理节点] -> [目标]
```

当 Clash 连接代理节点仍被 WARP 承载：

```text
当前路径
[应用] -> [Clash] -> [WARP 承载] -> [代理节点] -> [目标]
```

图中每个节点都可点击，右侧展示原始证据：

- WARP 节点：`warp-cli status`、trace `warp=on/off`。
- Clash 节点：controller `/configs`、当前模式、当前节点。
- 系统代理节点：`ProxyEnable`、`ProxyServer`。
- 目标节点：出口 IP、国家、连通性。

## 告警和修复

产品应内置“问题 -> 解释 -> 修复”映射。

| 问题 | 用户看到的解释 | 修复按钮 |
|---|---|---|
| WARP disconnected | WARP 已断开，当前不会走 Cloudflare 隧道 | 切到 Clash |
| Mihomo running but system proxy off | Clash 在运行，但普通软件没有进入 Clash | 打开系统代理 |
| System proxy points to dead port | 系统代理指向了不可用端口，可能导致浏览器断网 | 恢复直连 |
| Clash controller unavailable | 无法控制 Mihomo，可能是 core 未启动或端口冲突 | 重启 Clash |
| Node delay failed | 当前节点不可用或被网络阻断 | 测试并切换节点 |
| DNS mismatch | 域名解析路径和数据路径不一致 | 查看 DNS / 重启代理 |

## 推荐技术架构

可以复用当前项目，但建议重组模块边界。

```text
src/
  app/
    main.js                 # 程序入口
    tray.js                 # 托盘和窗口生命周期
  core/
    mihomo-runtime.js       # 下载、启动、停止 Mihomo
    mihomo-client.js        # controller API
    subscription.js         # 订阅刷新和配置规范化
  network/
    system-proxy.js         # Windows 用户代理读写
    winhttp-proxy.js        # WinHTTP 代理读取
    warp-client.js          # warp-cli 状态读取
    routes.js               # Windows 路由读取和解释
    dns.js                  # DNS 状态读取
    trace.js                # 外部 IP / Cloudflare trace
    path-engine.js          # 路径判定引擎
  product/
    controller.js           # 自动/WARP/Clash/直连模式
    recommendations.js      # 问题和修复建议
  ui/
    server.js
    views/
```

当前可复用：

- `src/system-proxy.js`
- `src/subscription.js`
- `src/mihomo.js`
- `src/service.js` 里的部分 controller 操作
- 现有 GUI/API 框架和 MCP 命令

建议重写：

- 状态模型。现在状态更像服务状态，不是网络路径状态。
- UI。应该围绕“当前路径”和“修复建议”，不是围绕启动器日志。
- 网络诊断。应从零设计为独立模块，不混在 service 里。

## 最小可用版本

第一版只做 6 个能力：

1. 展示当前路径。
2. 展示 WARP 状态和出口 trace。
3. 展示 Clash 是否运行、是否接管、当前模式、当前节点。
4. 一键切到 Clash 代理模式。
5. 一键恢复直连。
6. WARP 断开时提示并提供切到 Clash。

不建议第一版做：

- 默认 TUN 接管。
- 复杂规则编辑器。
- 多配置文件市场。
- 复杂测速排行榜。
- 自动修改 Cloudflare One 策略。

## 推荐路线

最可用的产品路线：

```text
先做“网络路径可视化”
再做“一键切换 WARP / Clash / 直连”
最后再做“TUN、高级规则、自动故障切换”
```

这样用户不会再被“软件开着但实际没走它”这种问题困住。
