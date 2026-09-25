#!/usr/bin/env node
/**
 * Standalone Meta Automation desktop launcher.
 *
 * Divided into 2 mutually exclusive runtime modes:
 *   [1] Social Autopilot -> threads-agent.js (CDP :9222)
 *   [2] Job Autopilot    -> job-agent.js (Freelancer.com ONLY, CDP :9222 / CDP :9223)
 *
 * Exactly ONE mode is active at any time.
 * On every launch, prompts the user to select the desired autopilot mode.
 * In Job Autopilot, all non-freelancer tabs are automatically purged.
 */

const fs = require("fs");
const path = require("path");
const CONFIG = require("../config");
const {
  MODES,
  PID_FILES,
  LOG_FILES,
  getActiveMode,
  promptModeSelection,
  launchSocialAutopilot,
  launchJobAutopilot
} = require("../src/core/autopilot-manager");

const ROOT = CONFIG.ROOT_DIR;
const LOG_DIR = CONFIG.LOGS_DIR;

function ensureDirectories() {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

async function main() {
  ensureDirectories();

  const foreground = process.argv.includes("--foreground") || process.argv.includes("-f");

  // Interactive mode selection every time start is executed
  const selectedMode = await promptModeSelection();

  console.log("==================================================");
  console.log("  META AUTOMATION — AUTOPILOT RUNTIME");
  console.log("==================================================");
  console.log(`  SELECTED MODE: ${selectedMode === MODES.SOCIAL ? "SOCIAL AUTOPILOT (CDP :9222)" : "JOB AUTOPILOT (FREELANCER.COM ONLY, CDP :9222 / CDP :9223)"}`);
  console.log("  MUTUAL EXCLUSIVITY: EXACTLY ONE ACTIVE ENGINE");
  console.log("==================================================");

  let worker = null;
  if (selectedMode === MODES.SOCIAL) {
    worker = await launchSocialAutopilot({ foreground });
  } else if (selectedMode === MODES.JOB) {
    worker = await launchJobAutopilot({ foreground });
  }

  if (!foreground) {
    console.log("\n✅ Autopilot is running detached in background.");
    console.log(`   Active Mode: ${selectedMode === MODES.SOCIAL ? "Social Autopilot" : "Job Autopilot (Freelancer)"}`);
    console.log(`   Log file   : ${selectedMode === MODES.SOCIAL ? "logs/daemon.log" : "logs/job-daemon.log"}`);
    console.log("   Status     : ./status-automation");
    console.log("   Stop       : ./stop-automation");
    return;
  }

  if (worker && worker.child) {
    console.log("\nForeground mode active. Press Ctrl+C to stop the worker.");
    await new Promise(resolve => {
      worker.child.on("exit", () => resolve());
    });
  }
}

main().catch(err => {
  console.error(`\n❌ Standalone runtime failed: ${err.message}`);
  process.exit(1);
});
