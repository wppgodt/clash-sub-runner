"use strict";

function renderHtml() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="icon" href="/favicon.ico?v=3" sizes="32x32">
  <link rel="icon" href="/favicon.svg?v=3" type="image/svg+xml">
  <link rel="manifest" href="/manifest.webmanifest?v=3">
  <meta name="theme-color" content="#1769aa">
  <title>Clash Sub Runner</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f5f7fa;
      --panel: #ffffff;
      --line: #d8dee8;
      --text: #1d2430;
      --muted: #657084;
      --accent: #1769aa;
      --accent-soft: #e8f1f8;
      --ok: #13795b;
      --danger: #b42318;
      --warn: #9a6700;
      --warn-bg: #fff7e6;
      --soft: #f8fafc;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: "Segoe UI", "Microsoft YaHei", Arial, sans-serif;
      letter-spacing: 0;
    }
    .app {
      width: min(1160px, calc(100vw - 32px));
      margin: 0 auto;
      padding: 20px 0 28px;
      display: grid;
      gap: 16px;
    }
    .topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
    }
    .mark {
      width: 34px;
      height: 34px;
      border-radius: 7px;
      display: grid;
      place-items: center;
      background: var(--accent);
      color: white;
      font-weight: 800;
      flex: 0 0 auto;
    }
    h1 {
      margin: 0;
      font-size: 22px;
      font-weight: 700;
    }
    .subtitle {
      margin-top: 2px;
      color: var(--muted);
      font-size: 12px;
    }
    .status-badge {
      min-width: 84px;
      text-align: center;
      border-radius: 999px;
      padding: 6px 12px;
      color: white;
      background: #64748b;
      font-size: 13px;
      font-weight: 700;
      white-space: nowrap;
    }
    .status-badge.ok { background: var(--ok); }
    .status-badge.warn { background: var(--warn); }
    .status-badge.bad { background: var(--danger); }
    section {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 18px;
    }
    .section-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      margin-bottom: 14px;
    }
    h2 {
      margin: 0;
      font-size: 16px;
      font-weight: 700;
    }
    .mini-pill {
      border-radius: 999px;
      padding: 4px 9px;
      color: #475569;
      background: #edf1f6;
      border: 1px solid var(--line);
      font-size: 11px;
      font-weight: 700;
      white-space: nowrap;
    }
    .route-title {
      font-size: 20px;
      font-weight: 750;
      line-height: 1.35;
      overflow-wrap: anywhere;
      margin-bottom: 14px;
    }
    .path-steps {
      display: flex;
      align-items: center;
      gap: 7px;
      flex-wrap: wrap;
      margin-bottom: 16px;
    }
    .path-step {
      border: 1px solid var(--line);
      border-radius: 7px;
      background: var(--soft);
      padding: 8px 10px;
      font-size: 13px;
      font-weight: 700;
      max-width: 210px;
      overflow-wrap: anywhere;
    }
    .path-arrow {
      color: var(--muted);
      font-size: 12px;
      font-weight: 800;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 16px;
    }
    button, select {
      border: 1px solid var(--line);
      background: white;
      color: var(--text);
      border-radius: 7px;
      min-height: 36px;
      padding: 0 12px;
      font: inherit;
      font-size: 14px;
    }
    button {
      cursor: pointer;
      font-weight: 700;
    }
    button.primary {
      background: var(--accent);
      border-color: var(--accent);
      color: white;
    }
    button.danger {
      border-color: #f3b5ad;
      color: var(--danger);
      background: white;
    }
    button:disabled {
      cursor: progress;
      opacity: .65;
    }
    .route-facts {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
      border-top: 1px solid var(--line);
      padding-top: 14px;
    }
    .fact {
      min-width: 0;
    }
    .fact span {
      display: block;
      color: var(--muted);
      font-size: 12px;
      margin-bottom: 5px;
    }
    .fact strong {
      display: block;
      font-size: 14px;
      overflow-wrap: anywhere;
    }
    .main-grid {
      display: grid;
      grid-template-columns: minmax(360px, 480px) 1fr;
      gap: 16px;
      align-items: start;
    }
    .field {
      display: grid;
      gap: 6px;
      margin-bottom: 12px;
    }
    .selection-hint {
      margin-top: -4px;
      margin-bottom: 12px;
    }
    label {
      color: var(--muted);
      font-size: 12px;
    }
    select { width: 100%; }
    .segmented {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      border: 1px solid var(--line);
      border-radius: 8px;
      overflow: hidden;
    }
    .segmented button {
      border: 0;
      border-right: 1px solid var(--line);
      border-radius: 0;
      background: white;
    }
    .segmented button:last-child { border-right: 0; }
    .segmented button.active {
      background: var(--accent-soft);
      color: #0f5d95;
    }
    .button-row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 4px;
    }
    .progress {
      margin-top: 12px;
    }
    .progress-label {
      color: var(--muted);
      font-size: 12px;
      line-height: 1.45;
      margin-bottom: 6px;
      overflow-wrap: anywhere;
    }
    .progress-track {
      height: 9px;
      border-radius: 999px;
      background: #edf1f6;
      overflow: hidden;
      border: 1px solid var(--line);
    }
    .progress-fill {
      height: 100%;
      width: 0%;
      background: var(--accent);
      transition: width 180ms ease;
    }
    .issues, .recommendations {
      display: grid;
      gap: 8px;
      margin-top: 12px;
    }
    .issue {
      border: 1px solid #f5d08a;
      background: var(--warn-bg);
      border-radius: 7px;
      padding: 8px 10px;
      color: #6f4b00;
      font-size: 13px;
      line-height: 1.45;
    }
    .recommendation {
      border-left: 3px solid #8dbce3;
      background: #f4f9fd;
      padding: 8px 10px;
      font-size: 13px;
      line-height: 1.45;
    }
    .muted {
      color: var(--muted);
      font-size: 12px;
      line-height: 1.6;
    }
    details {
      border-top: 1px solid var(--line);
      padding-top: 12px;
      margin-top: 12px;
    }
    summary {
      cursor: pointer;
      font-weight: 700;
      color: #334155;
      user-select: none;
    }
    .detail-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
      margin-top: 12px;
    }
    .detail-item {
      border-top: 1px solid var(--line);
      padding-top: 8px;
    }
    .detail-item span {
      display: block;
      color: var(--muted);
      font-size: 11px;
      margin-bottom: 4px;
    }
    .detail-item strong {
      display: block;
      font-size: 13px;
      overflow-wrap: anywhere;
    }
    .speed-summary {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin-top: 12px;
    }
    .speed-stat {
      border-top: 1px solid var(--line);
      padding-top: 8px;
    }
    .speed-stat .label {
      color: var(--muted);
      font-size: 11px;
      margin-bottom: 4px;
    }
    .speed-stat .value {
      font-weight: 700;
      overflow-wrap: anywhere;
    }
    .speed-list {
      display: grid;
      gap: 8px;
      max-height: 360px;
      overflow: auto;
      margin-top: 12px;
      padding-right: 2px;
    }
    .speed-card {
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 10px;
      background: white;
    }
    .speed-card.bad {
      border-color: #f3b5ad;
      background: #fff8f7;
    }
    .speed-top {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 8px;
    }
    .speed-name {
      font-weight: 700;
      font-size: 13px;
      overflow-wrap: anywhere;
    }
    .speed-region {
      color: var(--muted);
      font-size: 11px;
      margin-top: 2px;
    }
    .speed-ms {
      font-weight: 800;
      white-space: nowrap;
    }
    .speed-ms.good { color: var(--ok); }
    .speed-ms.mid { color: var(--accent); }
    .speed-ms.slow { color: var(--warn); }
    .speed-ms.bad { color: var(--danger); }
    .bar-track {
      height: 7px;
      background: #edf1f6;
      border-radius: 99px;
      overflow: hidden;
    }
    .bar-fill {
      height: 100%;
      border-radius: 99px;
      background: var(--accent);
      width: 0%;
    }
    .bar-fill.good { background: #18a058; }
    .bar-fill.mid { background: #2f80c9; }
    .bar-fill.slow { background: #d99a00; }
    .bar-fill.bad { background: #d64535; }
    pre {
      margin: 12px 0 0;
      padding: 12px;
      background: #111827;
      color: #dbeafe;
      border-radius: 7px;
      overflow: auto;
      font-size: 12px;
      line-height: 1.5;
      min-height: 140px;
      max-height: 320px;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    @media (max-width: 860px) {
      .app { width: calc(100vw - 24px); padding-top: 12px; }
      .topbar { align-items: flex-start; }
      .main-grid, .route-facts, .detail-grid { grid-template-columns: 1fr; }
      .actions button, .button-row button { flex: 1 1 140px; }
    }
  </style>
</head>
<body>
  <main class="app">
    <div class="topbar">
      <div class="brand">
        <div class="mark">C</div>
        <div>
          <h1>网络控制台</h1>
          <div class="subtitle">看默认流量到底走 WARP、Clash 还是直连</div>
        </div>
      </div>
      <div id="pathValue" class="status-badge">检查中</div>
    </div>

    <section>
      <div class="section-head">
        <h2>当前网络路线</h2>
        <span id="pathConfidence" class="mini-pill">UNKNOWN</span>
      </div>
      <div id="pathLabel" class="route-title">正在检查当前网络路线...</div>
      <div id="pathSteps" class="path-steps"></div>
      <div class="actions">
        <button id="useClashBtn" class="primary">切到 Clash 代理</button>
        <button id="useDirectBtn">恢复直连</button>
        <button id="refreshPathBtn">刷新状态</button>
      </div>
      <div class="route-facts">
        <div class="fact"><span>WARP</span><strong id="warpValue">-</strong></div>
        <div class="fact"><span>Clash</span><strong id="clashValue">-</strong></div>
        <div class="fact"><span>接管方式</span><strong id="captureValue">-</strong></div>
      </div>
      <div id="pathRecommendations" class="recommendations"></div>
      <div id="issues" class="issues"></div>
    </section>

    <div class="main-grid">
      <section>
        <div class="section-head">
          <h2>Clash 设置</h2>
        </div>
        <div class="field">
          <label>模式</label>
          <div id="modeButtons" class="segmented">
            <button data-mode="rule">规则</button>
            <button data-mode="global">全局</button>
            <button data-mode="direct">直连</button>
          </div>
        </div>
        <div class="field">
          <label>地区</label>
          <select id="regionSelect"></select>
        </div>
        <div class="field">
          <label>节点</label>
          <select id="nodeSelect"></select>
        </div>
        <div id="savedSelectionHint" class="muted selection-hint"></div>
        <div class="button-row">
          <button id="applyRegionBtn" class="primary">应用节点</button>
          <button id="testBtn">测速</button>
          <button id="refreshBtn">刷新订阅</button>
        </div>
        <div class="progress refresh-progress">
          <div id="refreshProgressText" class="progress-label">订阅刷新空闲</div>
          <div class="progress-track"><div id="refreshProgressBar" class="progress-fill"></div></div>
        </div>
      </section>

      <section>
        <div class="section-head">
          <h2>高级诊断</h2>
          <button id="resetBtn" class="danger">重置</button>
        </div>
        <div class="muted">默认只看路线和操作。需要排障时再展开 trace、测速结果和日志。</div>
        <details id="advancedDetails">
          <summary>展开诊断详情</summary>
          <div class="detail-grid">
            <div class="detail-item"><span>Cloudflare trace</span><strong id="traceValue">-</strong></div>
            <div class="detail-item"><span>诊断证据</span><strong id="pathEvidence">-</strong></div>
          </div>

          <div class="speed-summary">
            <div class="speed-stat"><div class="label">外网连通</div><div id="speedExternal" class="value">-</div></div>
            <div class="speed-stat"><div class="label">节点测速</div><div id="speedCount" class="value">-</div></div>
          </div>
          <div class="progress speed-progress">
            <div id="speedProgressText" class="progress-label">测速空闲</div>
            <div class="progress-track"><div id="speedProgressBar" class="progress-fill"></div></div>
          </div>
          <div id="speedList" class="speed-list"></div>

          <pre id="logView">日志会在展开诊断详情后加载。</pre>
        </details>
      </section>
    </div>
  </main>

  <script>
    const $ = (id) => document.getElementById(id);
    let lastStatus = null;
    let busy = false;
    let speedTesting = false;
    let refreshRunning = false;
    let logsLoadedAt = 0;

    async function api(path, options = {}) {
      const res = await fetch(path, {
        headers: { "Content-Type": "application/json" },
        ...options
      });
      const text = await res.text();
      const data = text ? JSON.parse(text) : null;
      if (!res.ok) throw new Error(data && data.error ? data.error : res.statusText);
      return data;
    }

    async function post(path, body = {}) {
      setBusy(true);
      try {
        return await api(path, { method: "POST", body: JSON.stringify(body) });
      } finally {
        setBusy(false);
      }
    }

    function setBusy(value) {
      busy = value;
      updateControlState();
    }

    function updateControlState() {
      for (const button of document.querySelectorAll("button")) button.disabled = busy;
      const running = Boolean(lastStatus && lastStatus.running);
      $("regionSelect").disabled = busy || !running;
      $("nodeSelect").disabled = busy || !running;
      $("applyRegionBtn").disabled = busy || !running;
      $("testBtn").disabled = busy || !running;
      for (const button of document.querySelectorAll("#modeButtons button")) {
        button.disabled = busy || !running;
      }
    }

    function setBadge(el, kind) {
      el.classList.remove("ok", "bad", "warn");
      if (kind) el.classList.add(kind);
    }

    function renderStatus(status) {
      lastStatus = status;
      const networkPath = status.networkPath || {};
      renderNetworkPath(networkPath, status);

      for (const button of document.querySelectorAll("#modeButtons button")) {
        button.classList.toggle("active", status.running && button.dataset.mode === status.mode);
      }

      renderRegions(status);
      renderRefreshProgress((status.state || {}).refreshProgress || {});
      renderIssues(status.issues || []);
      renderSpeed(status.state || {});
      updateControlState();
      maybeLoadLogs();
    }

    function renderNetworkPath(networkPath, status) {
      const pathId = networkPath.id || "unknown";
      const components = networkPath.components || {};
      const clash = components.clash || {};
      const warp = components.warp || {};
      const label = pathTitle(networkPath, status);
      const badge = pathBadge(pathId);

      $("pathValue").textContent = badge.text;
      setBadge($("pathValue"), badge.kind);
      $("pathConfidence").textContent = confidenceText(networkPath.confidence);
      $("pathLabel").textContent = label;

      const stepsBox = $("pathSteps");
      stepsBox.innerHTML = "";
      const steps = Array.isArray(networkPath.steps) ? networkPath.steps : [];
      for (let index = 0; index < steps.length; index += 1) {
        if (index > 0) {
          const arrow = document.createElement("span");
          arrow.className = "path-arrow";
          arrow.textContent = ">";
          stepsBox.appendChild(arrow);
        }
        const item = document.createElement("span");
        item.className = "path-step";
        item.textContent = translateStep(steps[index].label || String(steps[index] || ""));
        stepsBox.appendChild(item);
      }
      if (!steps.length) {
        const empty = document.createElement("span");
        empty.className = "muted";
        empty.textContent = "还没有路线数据。";
        stepsBox.appendChild(empty);
      }

      $("warpValue").textContent = warpText(warp);
      $("clashValue").textContent = clashText(clash);
      $("captureValue").textContent = captureText(networkPath.capture, clash);
      $("traceValue").textContent = traceText(warp);
      $("pathEvidence").textContent = (networkPath.evidence || []).join(" | ") || "-";

      const recBox = $("pathRecommendations");
      recBox.innerHTML = "";
      for (const item of compactRecommendations(networkPath)) {
        const div = document.createElement("div");
        div.className = "recommendation";
        div.textContent = item;
        recBox.appendChild(div);
      }
    }

    function pathTitle(networkPath, status) {
      const id = networkPath.id || "unknown";
      const clash = networkPath.components && networkPath.components.clash || {};
      if (id === "warp" && clash.running && !clash.capturing) {
        return "当前默认流量走 Cloudflare WARP；Clash 已运行，但还没有接管系统流量。";
      }
      if (id === "warp") return "当前默认流量走 Cloudflare WARP。";
      if (id === "direct") return "当前默认流量直连物理网络。";
      if (id === "clash-proxy" || id === "clash-proxy-warp-carried") return "当前默认流量进入 Clash，并按全局代理出口。";
      if (id === "clash-rule" || id === "clash-rule-warp-carried") return "当前默认流量进入 Clash，由规则决定代理或直连。";
      if (id === "clash-direct" || id === "clash-direct-warp") return "当前默认流量进入 Clash，但 Clash 处于直连模式。";
      if (id === "broken-local-proxy") return "系统代理指向 Clash 端口，但 Clash 没有响应。";
      if (id === "external-proxy" || id === "external-proxy-warp") return "系统代理指向另一个代理，不是本项目的 Clash。";
      if (id === "warp-unconfirmed") return "WARP 客户端显示已连接，但外部 trace 没确认成功。";
      return networkPath.label || "当前网络路线还无法确认。";
    }

    function pathBadge(id) {
      if (String(id || "").startsWith("clash")) return { text: "Clash", kind: "ok" };
      if (id === "warp" || id === "warp-unconfirmed") return { text: "WARP", kind: "ok" };
      if (id === "direct") return { text: "直连", kind: "warn" };
      if (String(id || "").startsWith("broken")) return { text: "异常", kind: "bad" };
      if (String(id || "").includes("proxy")) return { text: "代理", kind: "warn" };
      return { text: "未知", kind: "warn" };
    }

    function confidenceText(value) {
      return { high: "HIGH", medium: "MEDIUM", low: "LOW" }[value] || "UNKNOWN";
    }

    function translateStep(value) {
      const text = String(value || "");
      const exact = {
        "App": "软件",
        "Windows route": "Windows 路由",
        "Cloudflare WARP": "Cloudflare WARP",
        "Target": "目标",
        "Physical network": "物理网络",
        "Mihomo Direct": "Mihomo 直连",
        "Proxy node": "代理节点",
        "Rule decides proxy/direct": "规则判断",
        "Physical network carries node link": "物理网络承载节点连接",
        "WARP carries node link": "WARP 承载节点连接"
      };
      if (exact[text]) return exact[text];
      return text
        .replace("Windows system proxy -> Clash", "系统代理 -> Clash")
        .replace("Clash TUN captures default traffic", "Clash TUN 接管")
        .replace("Target?", "目标?")
        .replace("Cloudflare WARP?", "Cloudflare WARP?");
    }

    function compactRecommendations(networkPath) {
      const id = networkPath.id || "";
      const components = networkPath.components || {};
      const clash = components.clash || {};
      const list = [];
      if (id === "warp" && clash.running && !clash.capturing) {
        list.push("如果你希望本机软件走订阅节点，点“切到 Clash 代理”。");
      }
      if (id === "warp" && !clash.running) {
        list.push("WARP 当前正常；WARP 断开时建议点“切到 Clash 代理”作为备用路线。");
      }
      if (String(id).startsWith("clash")) {
        list.push("默认流量已经进入 Clash；需要恢复系统原路线时点“恢复直连”。");
      }
      if (id === "broken-local-proxy") {
        list.push("建议先点“恢复直连”，再重新切到 Clash。");
      }
      return list.slice(0, 2);
    }

    function warpText(warp) {
      if (!warp || !Object.keys(warp).length) return "-";
      if (warp.traceWarp === "on") {
        const place = [warp.loc, warp.colo].filter(Boolean).join("/");
        return "已连接" + (place ? "，出口 " + place : "");
      }
      if (warp.connected) return "客户端已连接，trace 未确认";
      if (warp.available) return "未连接";
      return "未检测到";
    }

    function clashText(clash) {
      if (!clash || !Object.keys(clash).length) return "-";
      if (!clash.running) return "未运行";
      const mode = { rule: "规则", global: "全局", direct: "直连" }[clash.mode] || clash.mode || "-";
      return "已运行，模式 " + mode;
    }

    function captureText(capture, clash) {
      if (clash && clash.captureMethod === "system-proxy") return "系统代理";
      if (clash && clash.captureMethod === "tun") return "TUN";
      if (clash && clash.running) return "未接管默认流量";
      return capture && capture.label ? translateStep(capture.label) : "-";
    }

    function traceText(warp) {
      if (!warp || !Object.keys(warp).length) return "-";
      const parts = [];
      if (warp.traceWarp) parts.push("warp=" + warp.traceWarp);
      if (warp.ip) parts.push(warp.ip);
      if (warp.loc || warp.colo) parts.push([warp.loc, warp.colo].filter(Boolean).join("/"));
      if (warp.gateway && warp.gateway !== "unknown") parts.push("gateway=" + warp.gateway);
      return parts.length ? parts.join(", ") : "-";
    }

    function renderRefreshProgress(progress) {
      const percent = Math.max(0, Math.min(100, Number(progress.percent || 0)));
      $("refreshProgressBar").style.width = percent + "%";
      if (progress.active) {
        $("refreshProgressText").textContent = (progress.phase || "正在刷新订阅") + " - " + percent + "%";
        return;
      }
      if (progress.cached) {
        $("refreshProgressBar").style.width = "100%";
        $("refreshProgressText").textContent = "刷新失败，正在使用缓存配置" + (progress.error ? "：" + progress.error : "");
        return;
      }
      if (progress.phase === "Refresh failed") {
        $("refreshProgressText").textContent = "刷新失败" + (progress.error ? "：" + progress.error : "");
        return;
      }
      if (progress.phase) {
        $("refreshProgressText").textContent = progress.phase + " - " + percent + "%";
        return;
      }
      $("refreshProgressText").textContent = "订阅刷新空闲";
    }

    function renderRegions(status) {
      const regionSelect = $("regionSelect");
      const nodeSelect = $("nodeSelect");
      const saved = status.savedSelection || {};
      const requestedRegion = regionSelect.value;
      const requestedNode = nodeSelect.value;
      $("savedSelectionHint").textContent = "";
      regionSelect.innerHTML = "";
      nodeSelect.innerHTML = "";

      if (!status.running) {
        const regionOption = document.createElement("option");
        regionOption.value = "";
        regionOption.textContent = "Clash 未运行，当前无地区生效";
        regionSelect.appendChild(regionOption);

        const nodeOption = document.createElement("option");
        nodeOption.value = "";
        nodeOption.textContent = "Clash 未运行，当前无节点生效";
        nodeSelect.appendChild(nodeOption);

        if (saved.selectedRegion || saved.selectedNode) {
          $("savedSelectionHint").textContent = "上次选择：" +
            [saved.selectedRegion, saved.selectedNode].filter(Boolean).join(" / ") +
            "。切到 Clash 后会尝试沿用。";
        }
        return;
      }

      const currentRegion = requestedRegion || status.selectedRegion;
      for (const region of status.regions || []) {
        const option = document.createElement("option");
        option.value = region.name;
        option.textContent = region.name + " (" + region.nodes.length + ")";
        regionSelect.appendChild(option);
      }
      if ([...regionSelect.options].some((option) => option.value === currentRegion)) {
        regionSelect.value = currentRegion;
      } else if (status.selectedRegion) {
        regionSelect.value = status.selectedRegion;
      }

      const selectedRegion = (status.regions || []).find((region) => region.name === regionSelect.value);
      const currentNode = requestedNode || status.selectedNode;
      for (const node of selectedRegion ? selectedRegion.nodes : []) {
        const option = document.createElement("option");
        option.value = node.name;
        option.textContent = node.name;
        nodeSelect.appendChild(option);
      }
      if ([...nodeSelect.options].some((option) => option.value === currentNode)) {
        nodeSelect.value = currentNode;
      }
      if (status.selectedRegion || status.selectedNode) {
        $("savedSelectionHint").textContent = "当前生效：" +
          [status.selectedRegion, status.selectedNode].filter(Boolean).join(" / ");
      }
    }

    function renderIssues(issues) {
      const box = $("issues");
      box.innerHTML = "";
      for (const issue of issues || []) {
        const div = document.createElement("div");
        div.className = "issue";
        div.textContent = translateIssue(issue);
        box.appendChild(div);
      }
    }

    function translateIssue(issue) {
      const text = String(issue || "");
      if (/Mihomo is running but Windows system proxy is off/i.test(text)) {
        return "Clash 正在运行，但 Windows 系统代理是关的，所以默认流量没有进入 Clash。";
      }
      return text;
    }

    function renderSpeed(state) {
      const external = state.lastConnectivity;
      const delay = state.lastDelayTest;
      const progress = state.speedTestProgress || {};
      const active = Boolean(progress.active);
      $("speedExternal").textContent = active && String(progress.phase || "").startsWith("Checking")
        ? "测试中"
        : external ? (external.ok ? "OK " + external.ip : "失败") : "-";
      $("speedCount").textContent = active
        ? progressCountText(progress)
        : delay ? delay.ok + "/" + delay.total + " 可用" : "-";
      renderSpeedProgress(progress, delay);

      const list = $("speedList");
      list.innerHTML = "";
      if (external) {
        list.appendChild(speedCard({
          region: "外网",
          name: external.ok ? "外网可达" : (external.error || "外网检查失败"),
          ok: external.ok,
          delay: null
        }));
      }
      if (delay) {
        for (const item of delay.results || []) {
          list.appendChild(speedCard(item));
        }
      }
      if (!external && !delay) {
        const empty = document.createElement("div");
        empty.className = "muted";
        empty.textContent = "还没有测速结果。";
        list.appendChild(empty);
      }
    }

    function renderSpeedProgress(progress, delay) {
      const percent = Math.max(0, Math.min(100, Number(progress.percent || 0)));
      $("speedProgressBar").style.width = percent + "%";
      if (progress.active) {
        const count = progress.total ? " (" + progress.current + "/" + progress.total + ")" : "";
        $("speedProgressText").textContent = (progress.phase || "正在测速") + count + " - " + percent + "%";
        return;
      }
      if (progress.phase === "Failed") {
        $("speedProgressText").textContent = "测速失败" + (progress.error ? "：" + progress.error : "");
        return;
      }
      if (delay) {
        $("speedProgressBar").style.width = "100%";
        $("speedProgressText").textContent = "完成 - " + delay.ok + "/" + delay.total + " 可用";
        return;
      }
      $("speedProgressText").textContent = "测速空闲";
    }

    function progressCountText(progress) {
      return progress.total ? progress.current + "/" + progress.total : "测试中";
    }

    function speedCard(item) {
      const card = document.createElement("div");
      const quality = speedQuality(item);
      card.className = "speed-card" + (item.ok ? "" : " bad");
      const percent = item.ok && item.delay ? Math.max(8, Math.min(100, 100 - (item.delay / 12))) : 100;
      const delayText = item.ok ? (item.delay ? item.delay + " ms" : "OK") : "失败";
      card.innerHTML =
        '<div class="speed-top">' +
          '<div><div class="speed-name">' + escapeHtml(item.name || "-") + '</div>' +
          '<div class="speed-region">' + escapeHtml(item.region || "") + '</div></div>' +
          '<div class="speed-ms ' + quality + '">' + escapeHtml(delayText) + '</div>' +
        '</div>' +
        '<div class="bar-track"><div class="bar-fill ' + quality + '" style="width:' + percent + '%"></div></div>';
      return card;
    }

    function speedQuality(item) {
      if (!item.ok) return "bad";
      if (!item.delay) return "good";
      if (item.delay <= 300) return "good";
      if (item.delay <= 650) return "mid";
      return "slow";
    }

    function escapeHtml(value) {
      return String(value).replace(/[&<>"']/g, (ch) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      }[ch]));
    }

    async function loadStatus(force = false) {
      if (busy && !force) return;
      try {
        const status = await api(force ? "/api/status?force=1" : "/api/status");
        renderStatus(status);
      } catch (error) {
        $("pathLabel").textContent = error.message;
        setBadge($("pathValue"), "bad");
        $("pathValue").textContent = "异常";
      }
    }

    async function maybeLoadLogs(force = false) {
      const details = $("advancedDetails");
      if (!details.open && !force) return;
      if (!force && Date.now() - logsLoadedAt < 5000) return;
      logsLoadedAt = Date.now();
      try {
        const logs = await api("/api/logs");
        $("logView").textContent = logs.app || "";
      } catch (error) {
        $("logView").textContent = error.message;
      }
    }

    $("useClashBtn").addEventListener("click", async () => {
      setBusy(true);
      try {
        await api("/api/start", { method: "POST", body: JSON.stringify({}) });
        await api("/api/mode", { method: "POST", body: JSON.stringify({ mode: "global" }) });
        await loadStatus(true);
      } catch (error) {
        alert(error.message);
      } finally {
        setBusy(false);
      }
    });
    $("useDirectBtn").addEventListener("click", async () => {
      try { await post("/api/stop"); await loadStatus(true); } catch (error) { alert(error.message); }
    });
    $("refreshPathBtn").addEventListener("click", async () => {
      await loadStatus(true);
    });
    $("refreshBtn").addEventListener("click", async () => {
      if (refreshRunning) return;
      refreshRunning = true;
      const progressTimer = setInterval(() => loadStatus(true), 700);
      try {
        $("refreshProgressText").textContent = "正在刷新订阅 - 0%";
        $("refreshProgressBar").style.width = "0%";
        $("refreshBtn").textContent = "刷新中...";
        const result = await post("/api/refresh");
        await loadStatus(true);
        if (result.cached) {
          $("refreshProgressText").textContent = result.warning || "订阅不可用，正在使用缓存配置。";
          $("refreshProgressBar").style.width = "100%";
        }
      } catch (error) {
        alert(error.message);
      } finally {
        clearInterval(progressTimer);
        refreshRunning = false;
        $("refreshBtn").textContent = "刷新订阅";
      }
    });
    $("testBtn").addEventListener("click", async () => {
      if (speedTesting) return;
      speedTesting = true;
      $("advancedDetails").open = true;
      const progressTimer = setInterval(() => loadStatus(true), 1000);
      try {
        $("speedExternal").textContent = "测试中";
        $("speedCount").textContent = "测试中";
        $("speedProgressText").textContent = "开始测速 - 0%";
        $("speedProgressBar").style.width = "0%";
        $("speedList").innerHTML = '<div class="muted">正在测试外网 IP 和节点延迟...</div>';
        await post("/api/connectivity");
        await loadStatus(true);
        await post("/api/test");
        await loadStatus(true);
      } catch (error) {
        alert(error.message);
      } finally {
        clearInterval(progressTimer);
        speedTesting = false;
      }
    });
    $("resetBtn").addEventListener("click", async () => {
      if (confirm("重置运行状态、系统代理和缓存？")) {
        try { await post("/api/reset"); await loadStatus(true); } catch (error) { alert(error.message); }
      }
    });
    $("modeButtons").addEventListener("click", async (event) => {
      const mode = event.target && event.target.dataset ? event.target.dataset.mode : "";
      if (mode) {
        try { await post("/api/mode", { mode }); await loadStatus(true); } catch (error) { alert(error.message); }
      }
    });
    $("regionSelect").addEventListener("change", async () => {
      renderRegions(lastStatus || { regions: [] });
      try {
        await post("/api/region", { region: $("regionSelect").value });
        await loadStatus(true);
      } catch (error) {
        alert(error.message);
        await loadStatus(true);
      }
    });
    $("applyRegionBtn").addEventListener("click", async () => {
      try {
        const node = $("nodeSelect").value;
        const region = $("regionSelect").value;
        await post("/api/region", { region, node });
        await loadStatus(true);
      } catch (error) {
        alert(error.message);
      }
    });
    $("advancedDetails").addEventListener("toggle", () => maybeLoadLogs(true));

    loadStatus();
    setInterval(loadStatus, 1000);
  </script>
</body>
</html>`;
}

module.exports = {
  renderHtml
};
