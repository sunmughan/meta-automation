/**
 * src/core/autopilot-manager.js
 *
 * Core architecture dividing Meta Automation into 2 mutually exclusive autopilot modes:
 *   1. Social Autopilot (Threads, Instagram, LinkedIn, Facebook)
 *   2. Job Autopilot (Freelancer.com Autonomous Revenue Engine)
 *
 * Enforces:
 *   - Only ONE autopilot mode can be active at any time.
 *   - Prompts the user interactively on every launch to choose the mode.
 *   - In Job Autopilot, ONLY Freelancer.com is active; all other platform tabs are closed.
 */

const fs = require("fs");
const path = require("path");
const http = require("http");
const readline = require("readline");
const { spawn } = require("child_process");
const CONFIG = require("../../config");
const { launchBrowser, isCdpActive } = require("../../scripts/launch-browser-cdp");

const ROOT = CONFIG.ROOT_DIR;
const LOG_DIR = CONFIG.LOGS_DIR;

const PID_FILES = {
  social: path.join(ROOT, "threads-agent.pid"),
  job: path.join(ROOT, "job-agent.pid")
};

const LOG_FILES = {
  social: path.join(LOG_DIR, "daemon.log"),
  job: path.join(LOG_DIR, "job-daemon.log")
};

const STATE_FILE = path.join(ROOT, "autopilot-mode.json");

const MODES = {
  SOCIAL: "social",
  JOB: "job"
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
  const jobPid = readPid(PID_FILES.job);

  const socialAlive = socialPid && isProcessAlive(socialPid);
  const jobAlive = jobPid && isProcessAlive(jobPid);

  if (socialAlive && !jobAlive) {
    return { mode: MODES.SOCIAL, name: "Social Autopilot", pid: socialPid };
  }
  if (jobAlive && !socialAlive) {
    return { mode: MODES.JOB, name: "Job Autopilot", pid: jobPid };
  }
  if (socialAlive && jobAlive) {
    return { mode: "conflict", name: "Conflicting (Both Running)", socialPid, jobPid };
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
    console.log(`🛑 Stopping ${mode === MODES.SOCIAL ? "Social Autopilot" : "Job Autopilot"} (PID ${pid})...`);
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
  stopMode(MODES.JOB);
  recordActiveMode(null);
}

function stopInactiveModes(selectedMode) {
  if (selectedMode === MODES.SOCIAL) {
    stopMode(MODES.JOB);
  } else if (selectedMode === MODES.JOB) {
    stopMode(MODES.SOCIAL);
  }
}

/**
 * Interactive prompt to select which autopilot to run.
 */
async function promptModeSelection() {
  // Check CLI flags first
  const args = process.argv.slice(2);
  for (const arg of args) {
    if (arg === "--social" || arg === "-s" || arg === "--mode=social" || arg === "social") {
      return MODES.SOCIAL;
    }
    if (arg === "--job" || arg === "-j" || arg === "--mode=job" || arg === "job") {
      return MODES.JOB;
    }
  }

  // Check env variable
  const envMode = (process.env.AUTOPILOT_MODE || "").toLowerCase();
  if (envMode === "social") return MODES.SOCIAL;
  if (envMode === "job") return MODES.JOB;

  // If not running in a TTY, fallback to default or current active
  if (!process.stdin.isTTY) {
    console.log("ℹ️ Non-interactive terminal detected. Defaulting to Social Autopilot.");
    return MODES.SOCIAL;
  }

  const active = getActiveMode();

  console.log("\n==================================================");
  console.log("  🤖 META AUTOMATION — AUTOPILOT MODE SELECTOR");
  console.log("==================================================");
  if (active.mode) {
    console.log(`  CURRENTLY ACTIVE: 🟢 ${active.name} (PID ${active.pid})`);
  } else {
    console.log("  CURRENTLY ACTIVE: ⚪ None (All Idle)");
  }
  console.log("--------------------------------------------------");
  console.log("  Select which Autopilot Mode to launch:");
  console.log("  (Note: Exactly ONE mode runs at a time)\n");
  console.log("  [1] Social Autopilot");
  console.log("      • Autonomous Audience & Growth Engine");
  console.log("      • Threads, Instagram, LinkedIn & Facebook\n");
  console.log("  [2] Job Autopilot");
  console.log("      • Freelancer.com Autonomous Revenue Engine");
  console.log("      • Isolated Mode: ONLY Freelancer.com active\n");
  console.log("  [3] Exit");
  console.log("==================================================");

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise(resolve => {
    rl.question("  Enter choice [1 or 2] (default: 1): ", answer => {
      rl.close();
      const choice = answer.trim();
      if (choice === "2" || choice.toLowerCase() === "job") {
        resolve(MODES.JOB);
      } else if (choice === "3" || choice.toLowerCase() === "exit") {
        console.log("Exiting.");
        process.exit(0);
      } else {
        // default 1
        resolve(MODES.SOCIAL);
      }
    });
  });
}

/**
 * Enforces that in Job Autopilot, ONLY Freelancer.com is open in the browser.
 * Closes all other tabs (Facebook, Threads, LinkedIn, Upwork, Fiverr, etc.).
 */
async function enforceFreelancerOnlyBrowser(cdpPort = 9222) {
  console.log(`\n🛡️ Platform Isolation: Enforcing ONLY Freelancer.com on browser CDP :${cdpPort}...`);
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const listRes = await new Promise((resolve, reject) => {
        const req = http.get(`http://127.0.0.1:${cdpPort}/json`, res => {
          let data = "";
          res.on("data", chunk => data += chunk);
          res.on("end", () => {
            try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
          });
        });
        req.on("error", reject);
        req.setTimeout(2500, () => { req.destroy(); reject(new Error("CDP timeout")); });
      });

      const pages = (listRes || []).filter(t => t.type === "page");
      const nonFreelancerPages = pages.filter(p => !(p.url || "").includes("freelancer.com"));

      if (nonFreelancerPages.length === 0) break;

      for (const page of nonFreelancerPages) {
        if (page.url.startsWith("chrome://") || page.url.startsWith("chrome-extension://")) continue;
        console.log(`   Closing non-freelancer tab: ${page.title?.slice(0, 30)} (${page.url?.slice(0, 40)}...)`);
        await new Promise(r => {
          const req = http.get(`http://127.0.0.1:${cdpPort}/json/close/${page.id}`, () => r());
          req.on("error", () => r());
        });
      }
      await new Promise(r => setTimeout(r, 500));
    }

    // Now verify Freelancer page exists
    const finalPages = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${cdpPort}/json`, res => {
        let data = "";
        res.on("data", chunk => data += chunk);
        res.on("end", () => {
          try { resolve(JSON.parse(data).filter(t => t.type === "page")); } catch (_) { resolve([]); }
        });
      }).on("error", () => resolve([]));
    });

    const flPages = finalPages.filter(p => (p.url || "").includes("freelancer.com"));
    if (flPages.length === 0) {
      console.log("   Navigating browser to https://www.freelancer.com/...");
      await new Promise(r => {
        const req = http.get(`http://127.0.0.1:${cdpPort}/json/new?https://www.freelancer.com/`, () => r());
        req.on("error", () => r());
      });
    } else {
      const primaryId = flPages[0].id;
      await new Promise(r => {
        const req = http.get(`http://127.0.0.1:${cdpPort}/json/activate/${primaryId}`, () => r());
        req.on("error", () => r());
      });
      console.log(`   Activated Freelancer tab: ${flPages[0].title || "Freelancer.com"}`);
    }

    console.log("✅ Platform Isolation active: ONLY Freelancer.com is present in browser tabs.\n");
    return true;
  } catch (err) {
    console.warn(`⚠️ Could not enforce tab isolation over CDP: ${err.message}`);
    return false;
  }
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

  // Stop Job Autopilot if running
  stopMode(MODES.JOB);

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

/**
 * Launch Job Autopilot (Freelancer.com ONLY).
 */
async function launchJobAutopilot({ foreground = false } = {}) {
  console.log("\n==================================================");
  console.log("  LAUNCHING JOB AUTOPILOT (FREELANCER.COM ONLY)");
  console.log("==================================================");

  // Stop Social Autopilot if running
  stopMode(MODES.SOCIAL);

  // Ensure Browser is active (CDP 9222 on Termux/Desktop)
  let cdpPort = 9222;
  if (!await isCdpActive(cdpPort)) {
    console.log(`🌐 Launching Browser for Job Autopilot (CDP :${cdpPort})...`);
    await launchBrowser();
  } else {
    console.log(`✅ Browser CDP :${cdpPort} is active.`);
  }

  // Enforce ONLY Freelancer.com tabs
  await enforceFreelancerOnlyBrowser(cdpPort);

  // Ensure Job candidate profile exists
  if (!fs.existsSync(CONFIG.JOB_PROFILE_PATH)) {
    console.warn("⚠️ Job candidate profile is missing. Run: npm run jobs:setup");
  }

  const worker = startWorker({
    name: "Job Autopilot (Freelancer)",
    entryFile: "job-agent.js",
    args: ["run"],
    pidFile: PID_FILES.job,
    logFile: LOG_FILES.job,
    foreground,
    extraEnv: {
      JOB_ACTIVE_PLATFORM: "freelancer",
      JOB_FREELANCER_ENABLED: "true",
      JOB_UPWORK_ENABLED: "false",
      JOB_FIVERR_ENABLED: "false",
      JOB_CONTRA_ENABLED: "false",
      JOB_PEOPLEPERHOUR_ENABLED: "false",
      JOB_GURU_ENABLED: "false",
      JOB_WORKANA_ENABLED: "false",
      JOB_MALT_ENABLED: "false",
      JOB_ARC_ENABLED: "false",
      JOB_TOPTAL_ENABLED: "false",
      JOB_BROWSER_CDP_URL: `http://127.0.0.1:${cdpPort}`
    }
  });

  recordActiveMode(MODES.JOB);
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
  stopInactiveModes,
  promptModeSelection,
  enforceFreelancerOnlyBrowser,
  launchSocialAutopilot,
  launchJobAutopilot
};
