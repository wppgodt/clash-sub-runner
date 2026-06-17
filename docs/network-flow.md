# 网络流量路径说明

Clash/Mihomo、TUN、Windows 系统代理、Cloudflare WARP 不在同一层。读图时按四层理解：

- 入口层：流量是否被 Clash 接收。
- Clash 策略层：Clash 收到流量后，按 `rule` / `global` / `direct` 决定动作。
- Clash 出站层：Clash 最后是直连原网站，还是连接代理节点。
- Windows 承载层：真正发出的连接再由 Windows 路由表、WARP、物理网卡决定出口。

## 通用正确图

适用于 Windows 上同时可能有 Clash/Mihomo 和 Cloudflare WARP 的情况。

```mermaid
flowchart TD
  A["软件要访问域名或 IP"] --> B{"软件自己指定 Clash 代理？"}

  B -- "是" --> C["被 Clash 入站接收<br/>HTTP / SOCKS / Mixed"]
  B -- "否" --> D{"Windows 系统代理指向 Clash<br/>且软件遵守？"}

  D -- "是" --> C
  D -- "否" --> E{"Clash TUN 捕获这条流量？"}

  E -- "是" --> T["被 Clash 入站接收<br/>TUN 虚拟网卡"]
  E -- "否" --> R["Windows TCP/IP 栈<br/>目标 = 原网站"]

  C --> F["Clash 解析模式和规则<br/>Rule / Global / Direct"]
  T --> F

  F --> G["得到最终出站动作<br/>策略组先解析到当前成员"]

  G --> H{"最终动作是 REJECT？"}
  H -- "是" --> X["阻断"]
  H -- "否" --> I{"最终动作是 DIRECT？"}

  I -- "是" --> J["Clash 直连目标<br/>目标 = 原网站"]
  I -- "否" --> K["Clash 连接代理节点<br/>目标 = 代理服务器"]

  J --> R2["Windows TCP/IP 栈<br/>决定这条连接从哪出去"]
  K --> R2

  R2 --> W{"WARP 承载这条连接？"}
  R --> W

  W -- "是" --> M["经 Cloudflare WARP 隧道"]
  W -- "否" --> N["经普通网卡 / ISP / 其他 VPN"]

  M --> O{"这条连接是去代理节点？"}
  N --> O

  O -- "是" --> P["代理节点再访问原网站"]
  O -- "否" --> Q["直接到达原网站"]
```

## 本机裁剪图

按当前项目和当前观察状态，能确定删掉的是 `Clash TUN 捕获` 这一支：

- 本项目默认写入 `mixed-port`，依赖手动代理或 Windows 系统代理入口。
- 本项目不主动生成 `tun:` 配置。
- 当前后台 Mihomo 报告 `tun.enable = false`。

其他分支仍保留：手动代理、Windows 系统代理、`REJECT`、`DIRECT`、代理节点、WARP 命中/不命中都仍可能发生。

```mermaid
flowchart TD
  A["软件要访问域名或 IP"] --> B{"软件自己指定 Clash 代理？"}

  B -- "是" --> C["被 Clash 入站接收<br/>HTTP / SOCKS / Mixed"]
  B -- "否" --> D{"Windows 系统代理指向 Clash<br/>且软件遵守？"}

  D -- "是" --> C
  D -- "否" --> R["Windows TCP/IP 栈<br/>目标 = 原网站"]

  C --> F["Clash 解析模式和规则<br/>Rule / Global / Direct"]
  F --> G["得到最终出站动作<br/>策略组先解析到当前成员"]

  G --> H{"最终动作是 REJECT？"}
  H -- "是" --> X["阻断"]
  H -- "否" --> I{"最终动作是 DIRECT？"}

  I -- "是" --> J["Clash 直连目标<br/>目标 = 原网站"]
  I -- "否" --> K["Clash 连接代理节点<br/>目标 = 代理服务器"]

  J --> R2["Windows TCP/IP 栈<br/>决定这条连接从哪出去"]
  K --> R2

  R2 --> W{"WARP 承载这条连接？"}
  R --> W

  W -- "是" --> M["经 Cloudflare WARP 隧道"]
  W -- "否" --> N["经普通网卡 / ISP / 其他 VPN"]

  M --> O{"这条连接是去代理节点？"}
  N --> O

  O -- "是" --> P["代理节点再访问原网站"]
  O -- "否" --> Q["直接到达原网站"]
```

## 读图要点

- `TUN` 是入口方式，不是 `rule` / `global` / `direct` 的同类概念。
- `DIRECT` 不是裸连，只是不走代理节点；后续仍会经过 Windows 路由，可能继续被 WARP 承载。
- `GLOBAL` 不等于一定走代理，它取决于 Global 选择器当前选中的成员。
- WARP 属于 Windows 路由/虚拟网卡承载层，可承载普通软件流量，也可承载 Clash 的直连或代理节点连接。
- DNS 可能单独走应用 DNS、Windows DNS、Clash DNS、fake-ip、WARP DNS/Gateway；上图主要描述数据连接。
