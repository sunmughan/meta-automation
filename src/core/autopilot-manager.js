/**
 * src/core/autopilot-manager.js
 *
 * Social Autopilot only (solar-social-only branch): Threads, Instagram,
 * LinkedIn, Facebook. The former second autopilot mode was removed
 * from this branch, so there is exactly one mode and no
 * mode-selection prompt.
 */

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const CONFIG = require("../../config");
const { launchBrowser, isCdpActive } = require("../../scripts/launch-browser-cdp");

const ROOT = CONFIG.ROOT_DIR;
const LOG_DIR = CONFIG.LOGS_DIR;

const PID_FILES = {
  social: path.join(ROOT, "threads-agent.pid")
};

const LOG_FILES = {
  social: path.join(LOG_DIR, "daemon.log")
};

const STATE_FILE = path.join(ROOT, "autopilot-mode.json");

const MODES = {
  SOCIAL: "social"
};

function readPid(file) {
  try {
    const pid = Number(fs.readFileSync(file, "utf8").trim());
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch (_) {
    return null;
  }
}

function isProcessAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (_) {
    return false;
  }
}

function clearStalePid(file) {
  const pid = readPid(file);
  if (!pid || !isProcessAlive(pid)) {
    try { fs.rmSync(file, { force: true }); } catch (_) {}
  }
}

function getActiveMode() {
  const socialPid = readPid(PID_FILES.social);
  const socialAlive = socialPid && isProcessAlive(socialPid);

  if (socialAlive) {
    return { mode: MODES.SOCIAL, name: "Social Autopilot", pid: socialPid };
  }

  return { mode: null, name: "None (Idle)", pid: null };
}

function recordActiveMode(mode) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify({
      activeMode: mode,
      updatedAt: new Date().toISOString(),
      pid: mode ? readPid(PID_FILES[mode]) : null
    }, null, 2), "utf8");
  } catch (_) {}
}

function stopMode(mode) {
  const file = PID_FILES[mode];
  if (!file) return false;

  const pid = readPid(file);
  let stopped = false;

  if (pid && isProcessAlive(pid)) {
    console.log(`🛑 Stopping Social Autopilot (PID ${pid})...`);
    try {
      process.kill(pid, "SIGTERM");
    } catch (_) {}

    // Give it a moment to terminate gracefully
    const start = Date.now();
    while (Date.now() - start < 1500) {
      if (!isProcessAlive(pid)) break;
    }

    if (isProcessAlive(pid)) {
      try { process.kill(pid, "SIGKILL"); } catch (_) {}
    }
    stopped = true;
  }

  try { fs.rmSync(file, { force: true }); } catch (_) {}
  return stopped;
}

function stopAllModes() {
  stopMode(MODES.SOCIAL);
  recordActiveMode(null);
}

/**
 * Single-mode selection: only Social Autopilot exists in this branch,
 * so this always resolves to it. Kept as a function so desktop-runner
 * keeps its existing call shape.
 */
async function promptModeSelection() {
  return MODES.SOCIAL;
}

/**
 * Starts a worker process.
 */
function startWorker({ name, entryFile, args = ["run"], pidFile, logFile, foreground, extraEnv = {} }) {
  clearStalePid(pidFile);
  fs.mkdirSync(path.dirname(logFile), { recursive: true });

  const output = fs.openSync(logFile, "a");
  const child = spawn(process.execPath, [entryFile, ...args], {
    cwd: ROOT,
    detached: !foreground,
    windowsHide: !foreground,
    stdio: foreground ? "inherit" : ["ignore", output, output],
    env: { ...process.env, ...extraEnv }
  });

  if (!foreground) {
    child.unref();
    fs.writeFileSync(pidFile, String(child.pid), "utf8");
  }

  console.log(`🚀 ${name} started (PID ${child.pid}).`);
  return { started: true, pid: child.pid, child };
}

/**
 * Launch Social Autopilot.
 */
async function launchSocialAutopilot({ foreground = false } = {}) {
  console.log("\n==================================================");
  console.log("  LAUNCHING SOCIAL AUTOPILOT");
  console.log("==================================================");

  // Ensure Social Browser (CDP 9222)
  if (!await isCdpActive(9222)) {
    console.log("🌐 Launching Browser for Social Autopilot (CDP :9222)...");
    await launchBrowser();
  } else {
    console.log("✅ Browser CDP :9222 is active.");
  }

  const worker = startWorker({
    name: "Social Autopilot",
    entryFile: "threads-agent.js",
    args: ["run"],
    pidFile: PID_FILES.social,
    logFile: LOG_FILES.social,
    foreground
  });

  recordActiveMode(MODES.SOCIAL);
  return worker;
}

module.exports = {
  MODES,
  PID_FILES,
  LOG_FILES,
  readPid,
  isProcessAlive,
  getActiveMode,
  stopMode,
  stopAllModes,
  promptModeSelection,
  launchSocialAutopilot
};
