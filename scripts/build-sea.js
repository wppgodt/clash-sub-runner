"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const esbuild = require("esbuild");
const { createIcoBuffer } = require("../src/icon");

const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");
const exePath = path.join(distDir, "clash-sub-runner.exe");
const nativeGuiPath = path.join(distDir, "Clash Sub Runner.exe");
const iconPath = path.join(distDir, "app.ico");
const bundlePath = path.join(distDir, "bundle.cjs");
const blobPath = path.join(distDir, "sea-prep.blob");
const configPath = path.join(distDir, "sea-config.json");
const entryPath = path.join(rootDir, "src", "index.js");
const postjectCli = path.join(rootDir, "node_modules", "postject", "dist", "cli.js");
const seaFuse = "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2";

fs.mkdirSync(distDir, { recursive: true });

for (const file of [exePath, nativeGuiPath, iconPath, bundlePath, blobPath, configPath]) {
  fs.rmSync(file, { force: true });
}

esbuild.buildSync({
  entryPoints: [entryPath],
  bundle: true,
  platform: "node",
  target: "node20",
  outfile: bundlePath,
  format: "cjs"
});

fs.writeFileSync(configPath, JSON.stringify({
  main: bundlePath,
  output: blobPath,
  disableExperimentalSEAWarning: true
}, null, 2), "utf8");

run(process.execPath, ["--experimental-sea-config", configPath]);
fs.copyFileSync(process.execPath, exePath);

const signtool = findSignTool();
if (signtool) {
  try {
    run(signtool, ["remove", "/s", exePath]);
  } catch (error) {
    console.warn(`Warning: could not remove the copied Node signature: ${error.message}`);
  }
} else {
  console.warn("Warning: signtool.exe was not found. Continuing without signature removal.");
}

run(process.execPath, [
  postjectCli,
  exePath,
  "NODE_SEA_BLOB",
  blobPath,
  "--sentinel-fuse",
  seaFuse
]);

for (const file of [bundlePath, blobPath, configPath]) {
  fs.rmSync(file, { force: true });
}

console.log(`Built ${exePath}`);
fs.writeFileSync(iconPath, createIcoBuffer());
console.log(`Wrote ${iconPath}`);

const csc = findCsc();
if (csc) {
  run(csc, [
    "/nologo",
    "/target:winexe",
    "/platform:x64",
    `/out:${nativeGuiPath}`,
    `/win32icon:${iconPath}`,
    "/reference:System.dll",
    "/reference:System.Drawing.dll",
    "/reference:System.Windows.Forms.dll",
    "/reference:System.Web.Extensions.dll",
    path.join(rootDir, "native", "ClashSubRunnerGui.cs")
  ]);
  console.log(`Built ${nativeGuiPath}`);
} else {
  console.warn("Warning: csc.exe was not found. Native GUI wrapper was not built.");
}

function run(file, args) {
  execFileSync(file, args, {
    cwd: rootDir,
    stdio: "inherit",
    windowsHide: true
  });
}

function findSignTool() {
  const pathDirs = String(process.env.PATH || "").split(path.delimiter).filter(Boolean);
  const candidates = [];

  for (const dir of pathDirs) {
    candidates.push(path.join(dir, "signtool.exe"));
  }

  const kitsRoot = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
  const kitsDir = path.join(kitsRoot, "Windows Kits", "10", "bin");
  if (fs.existsSync(kitsDir)) {
    for (const version of fs.readdirSync(kitsDir).sort().reverse()) {
      candidates.push(path.join(kitsDir, version, "x64", "signtool.exe"));
    }
  }

  return candidates.find((candidate) => fs.existsSync(candidate)) || "";
}

function findCsc() {
  const candidates = [
    path.join(process.env.WINDIR || "C:\\Windows", "Microsoft.NET", "Framework64", "v4.0.30319", "csc.exe"),
    path.join(process.env.WINDIR || "C:\\Windows", "Microsoft.NET", "Framework", "v4.0.30319", "csc.exe")
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || "";
}
