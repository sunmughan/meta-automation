#!/usr/bin/env node
/**
 * Standalone Meta Automation desktop launcher.
 *
 * Social Autopilot only (solar-social-only branch) -> threads-agent.js (CDP :9222).
 * Only the Social Autopilot ships in this branch.
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
  launchSocialAutopilot
} = require("../src/core/autopilot-manager");

const ROOT = CONFIG.ROOT_DIR;
const LOG_DIR = CONFIG.LOGS_DIR;

function ensureDirectories() {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

async function main() {
  ensureDirectories();

  const foreground = process.argv.includes("--foreground") || process.argv.includes("-f");

  const selectedMode = await promptModeSelection();

  console.log("==================================================");
  console.log("  META AUTOMATION — AUTOPILOT RUNTIME");
  console.log("==================================================");
  console.log("  SELECTED MODE: SOCIAL AUTOPILOT (CDP :9222)");
  console.log("==================================================");

  const worker = await launchSocialAutopilot({ foreground });

  if (!foreground) {
    console.log("\n✅ Autopilot is running detached in background.");
    console.log("   Active Mode: Social Autopilot");
    console.log("   Log file   : logs/daemon.log");
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
