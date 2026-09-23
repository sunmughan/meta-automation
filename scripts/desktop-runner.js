#!/usr/bin/env node
/**
 * Standalone Meta Automation desktop launcher.
 *
 * LEFT  50% -> Social Automation, CDP :9222
 * RIGHT 50% -> Job Revenue Engine, CDP :9223
 *
 * The two Node workers are detached from the launching shell. No IDE is
 * required; the repository itself is the runtime.
 */

const fs = require("fs");
const path = require("path");
const { spawn, spawnSync } = require("child_process");
const CONFIG = require("../config");
const { launchBrowser } = require("./launch-browser-cdp");

const ROOT = CONFIG.ROOT_DIR;
const LOG_DIR = CONFIG.LOGS_DIR;
const PID_FILES = {
  social: path.join(ROOT, "threads-agent.pid"),
  jobs: path.join(ROOT, "job-agent.pid")
};
const LOG_FILES = {
  social: path.join(LOG_DIR, "daemon.log"),
  jobs: path.join(LOG_DIR, "job-daemon.log")
};

function ensureDirectories() {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

function readPid(file) {
  try {
    const pid = Number(fs.readFileSync(file, "utf8").trim());
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch (_) {
    return null;
  }
}

function isAlive(pid) {
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
  if (!pid || !isAlive(pid)) {
    fs.rmSync(file, { force: true });
  }
}

function runNodeScript(script, args = []) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: ROOT,
    stdio: "inherit",
    env: { ...process.env }
  });
  if (result.status !== 0) {
    throw new Error(`${path.basename(script)} exited with code ${result.status ?? "unknown"}`);
  }
}

function startWorker({ name, entryFile, pidFile, logFile, foreground }) {
  const existingPid = readPid(pidFile);
  if (existingPid && isAlive(existingPid)) {
    console.log(`✅ ${name} already running (PID ${existingPid}).`);
    return { started: false, pid: existingPid };
  }

  clearStalePid(pidFile);
  fs.mkdirSync(path.dirname(logFile), { recursive: true });

  const output = fs.openSync(logFile, "a");
  const child = spawn(process.execPath, [entryFile, "run"], {
    cwd: ROOT,
    detached: !foreground,
    windowsHide: !foreground,
    stdio: foreground ? "inherit" : ["ignore", output, output],
    env: { ...process.env }
  });

  if (!foreground) {
    child.unref();
    fs.writeFileSync(pidFile, String(child.pid), "utf8");
  }

  console.log(`🚀 ${name} started (PID ${child.pid}).`);
  return { started: true, pid: child.pid, child };
}

async function ensureBrowsers() {
  console.log("\n[1/3] SOCIAL browser: CDP :9222");
  if (!await launchBrowser()) {
    throw new Error("Could not establish the social browser CDP session.");
  }

  if (CONFIG.JOB_AUTOMATION_ENABLED) {
    console.log("[2/3] JOB browser: CDP :9223");
    runNodeScript(path.join(ROOT, "scripts", "launch-job-browser.js"));

    console.log("[3/3] Applying 50/50 browser layout...");
    runNodeScript(path.join(ROOT, "scripts", "layout-cdp-windows.js"));
  } else {
    console.log("[2/3] JOB browser disabled by JOB_AUTOMATION_ENABLED=false.");
    console.log("[3/3] Applying social browser layout...");
    runNodeScript(path.join(ROOT, "scripts", "layout-cdp-windows.js"), ["--social-only"]);
  }
}

function startWorkers() {
  const foreground = process.argv.includes("--foreground") || process.argv.includes("-f");

  const social = startWorker({
    name: "Social Automation",
    entryFile: "threads-agent.js",
    pidFile: PID_FILES.social,
    logFile: LOG_FILES.social,
    foreground
  });

  let jobs = null;
  if (CONFIG.JOB_AUTOMATION_ENABLED) {
    if (!fs.existsSync(CONFIG.JOB_PROFILE_PATH)) {
      console.warn("⚠️ Job candidate profile is missing; job worker was not started.");
      console.warn("   Run: npm run jobs:setup");
    } else {
      jobs = startWorker({
        name: "Job Revenue Engine",
        entryFile: "job-agent.js",
        pidFile: PID_FILES.jobs,
        logFile: LOG_FILES.jobs,
        foreground
      });
    }
  }

  return { foreground, social, jobs };
}

async function main() {
  ensureDirectories();

  console.log("==================================================");
  console.log("  META AUTOMATION — STANDALONE DESKTOP RUNTIME");
  console.log("==================================================");
  const split = CONFIG.DESKTOP_SPLIT_PERCENT;
  console.log(`  LEFT  ${split}% : SOCIAL AUTOMATION  :9222`);
  console.log(`  RIGHT ${100 - split}% : JOB HUNTING ENGINE :9223`);
  console.log("  IDE        : NOT REQUIRED");
  console.log("==================================================");

  clearStalePid(PID_FILES.social);
  clearStalePid(PID_FILES.jobs);

  await ensureBrowsers();

  const runtime = startWorkers();

  if (!runtime.foreground) {
    console.log("\n✅ Both execution planes are detached and running.");
    console.log("   Social log : logs/daemon.log");
    console.log("   Job log    : logs/job-daemon.log");
    console.log("   Status     : ./status-automation");
    console.log("   Stop       : ./stop-automation");
    return;
  }

  const children = [runtime.social?.child, runtime.jobs?.child].filter(Boolean);
  if (!children.length) return;

  console.log("\nForeground mode active. Press Ctrl+C to stop the workers.");
  await new Promise(resolve => {
    let remaining = children.length;
    for (const child of children) {
      child.on("exit", () => {
        remaining -= 1;
        if (remaining <= 0) resolve();
      });
    }
  });
}

main().catch(err => {
  console.error(`\n❌ Standalone runtime failed: ${err.message}`);
  process.exit(1);
});
