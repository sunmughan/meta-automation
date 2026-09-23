#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");
const CONFIG = require("../config");
const { getBrowserCatalog, detectRunningBrowser, detectSystemDefaultBrowser } = require("./launch-browser-cdp");

function isActive(port, timeoutMs = 1200) {
  return new Promise(resolve => {
    const req = http.get({
      hostname: "127.0.0.1",
      port,
      path: "/json/version",
      timeout: timeoutMs
    }, res => resolve(res.statusCode === 200));
    req.on("error", () => resolve(false));
    req.on("timeout", () => { req.destroy(); resolve(false); });
  });
}

function resolveBrowser() {
  const catalog = getBrowserCatalog();
  const preference = String(CONFIG.JOB_BROWSER_TYPE || "auto").toLowerCase();
  const candidates = [];
  if (preference !== "auto" && catalog[preference]) candidates.push(preference);
  const running = detectRunningBrowser();
  if (running && catalog[running] && !candidates.includes(running)) candidates.push(running);
  const system = detectSystemDefaultBrowser();
  if (system && catalog[system] && !candidates.includes(system)) candidates.push(system);
  for (const type of ["brave", "chrome", "edge", "chromium"]) {
    if (catalog[type] && !candidates.includes(type)) candidates.push(type);
  }
  for (const type of candidates) {
    const item = catalog[type];
    const binary = item.binaries.find(p => fs.existsSync(p));
    if (binary) return { ...item, binary };
  }
  throw new Error("No supported Chromium-based browser found for the job browser.");
}

async function launch() {
  const cdpUrl = new URL(CONFIG.JOB_BROWSER_CDP_URL);
  const port = Number(cdpUrl.port || 9223);
  if (await isActive(port)) {
    console.log(`Job browser CDP already active on ${CONFIG.JOB_BROWSER_CDP_URL}`);
    return true;
  }

  const browser = resolveBrowser();
  const userDataDir = path.resolve(CONFIG.JOB_BROWSER_USER_DATA_DIR);
  fs.mkdirSync(userDataDir, { recursive: true });

  const logFile = path.join(CONFIG.LOGS_DIR, "job-browser.log");
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  const out = fs.openSync(logFile, "a");

  const args = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--restore-last-session",
    ...(browser.flags || [])
  ];

  const env = { ...process.env };
  if (browser.display) env.DISPLAY = browser.display;

  const child = spawn(browser.binary, args, {
    detached: true,
    stdio: ["ignore", out, out],
    env
  });
  child.unref();

  for (let i = 0; i < 20; i++) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    if (await isActive(port)) {
      console.log(`Job browser ready: ${CONFIG.JOB_BROWSER_CDP_URL}`);
      return true;
    }
  }
  throw new Error(`Job browser did not become ready. Check ${logFile}`);
}

launch().then(ok => process.exit(ok ? 0 : 1)).catch(err => {
  console.error(err.message);
  process.exit(1);
});
