"use strict";

const CONTROL_PROXY_TYPES = new Set([
  "Selector",
  "URLTest",
  "Fallback",
  "LoadBalance",
  "Relay",
  "Compatible",
  "Direct",
  "Reject",
  "Pass"
]);

const REGION_PATTERNS = [
  ["Hong Kong", /\b(hong\s*kong|hongkong|hk)\b/i],
  ["Taiwan", /\b(taiwan|tw)\b/i],
  ["Japan", /\b(japan|jp)\b/i],
  ["Singapore", /\b(singapore|sg)\b/i],
  ["South Korea", /\b(south\s*korea|korea|kr)\b/i],
  ["United States", /\b(united\s*states|usa|us)\b/i],
  ["Turkey", /\b(turkey)\b/i],
  ["Argentina", /\b(argentina)\b/i],
  ["India", /\b(india)\b/i],
  ["Malaysia", /\b(malaysia)\b/i],
  ["England", /\b(england|united\s*kingdom|uk|gb)\b/i]
];

function isSelectableProxy(name, proxy) {
  if (!name || !proxy) {
    return false;
  }
  if (CONTROL_PROXY_TYPES.has(proxy.type)) {
    return false;
  }
  if (/\bipv6 only\b/i.test(name)) {
    return false;
  }
  return true;
}

function inferRegion(name) {
  for (const [region, pattern] of REGION_PATTERNS) {
    if (pattern.test(name)) {
      return region;
    }
  }

  const match = String(name).match(/^([A-Za-z][A-Za-z ]+?)(?:\s+\d|\s+\||$)/);
  return match ? match[1].trim() : "Other";
}

function buildRegionList(proxies, group) {
  const names = Array.isArray(group && group.all) ? group.all : Object.keys(proxies || {});
  const regions = new Map();

  for (const name of names) {
    const proxy = proxies[name];
    if (!isSelectableProxy(name, proxy)) {
      continue;
    }
    const region = inferRegion(name);
    if (!regions.has(region)) {
      regions.set(region, []);
    }
    regions.get(region).push({
      name,
      type: proxy.type || "",
      history: Array.isArray(proxy.history) ? proxy.history : []
    });
  }

  return Array.from(regions.entries()).map(([name, nodes]) => ({
    name,
    nodes
  })).sort((a, b) => a.name.localeCompare(b.name));
}

function findPrimarySelector(proxies) {
  if (proxies.AntLink && proxies.AntLink.type === "Selector") {
    return "AntLink";
  }

  const selector = Object.entries(proxies || {}).find(([name, proxy]) => {
    return proxy.type === "Selector" && !["GLOBAL", "COMPATIBLE"].includes(name);
  });

  return selector ? selector[0] : "";
}

function findGlobalSelector(proxies) {
  if (proxies.GLOBAL && proxies.GLOBAL.type === "Selector") {
    return "GLOBAL";
  }
  return "";
}

function selectNodesByRegion(regions, query) {
  const clean = String(query || "").trim();
  if (!clean) {
    return [];
  }
  const lower = clean.toLowerCase();

  const exactNode = regions.flatMap((region) => region.nodes).find((node) => node.name.toLowerCase() === lower);
  if (exactNode) {
    return [exactNode.name];
  }

  const exactRegion = regions.find((region) => region.name.toLowerCase() === lower);
  if (exactRegion) {
    return exactRegion.nodes.map((node) => node.name);
  }

  const fuzzyRegion = regions.find((region) => region.name.toLowerCase().includes(lower) || lower.includes(region.name.toLowerCase()));
  if (fuzzyRegion) {
    return fuzzyRegion.nodes.map((node) => node.name);
  }

  const fuzzyNodes = regions.flatMap((region) => region.nodes)
    .filter((node) => node.name.toLowerCase().includes(lower))
    .map((node) => node.name);

  return fuzzyNodes;
}

module.exports = {
  buildRegionList,
  findGlobalSelector,
  findPrimarySelector,
  inferRegion,
  isSelectableProxy,
  selectNodesByRegion
};
