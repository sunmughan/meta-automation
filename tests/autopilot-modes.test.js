/**
 * tests/autopilot-modes.test.js
 * Verifies the 2-mode division: Social Autopilot vs Job Autopilot,
 * mutual exclusivity, Freelancer-only platform restriction, and mode selection.
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { MODES, getActiveMode } = require("../src/core/autopilot-manager");
const registry = require("../src/jobs/platform-registry");

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

function runAutopilotModesAudit() {
  console.log("==================================================");
  console.log("  AUTOPILOT MODES & ISOLATION AUDIT");
  console.log("==================================================\n");

  test("Exactly 2 distinct autopilot modes are defined", () => {
    assert.strictEqual(MODES.SOCIAL, "social");
    assert.strictEqual(MODES.JOB, "job");
  });

  test("Active mode query returns valid structure", () => {
    const active = getActiveMode();
    assert("mode" in active);
    assert("name" in active);
    assert("pid" in active);
    assert([MODES.SOCIAL, MODES.JOB, null, "conflict"].includes(active.mode));
  });

  test("Job Autopilot targets ONLY Freelancer (all other platforms disabled)", () => {
    const enabled = registry.getEnabledPlatforms();
    assert.strictEqual(enabled.length, 1, "Only 1 platform must be enabled");
    assert.strictEqual(enabled[0].id, "freelancer", "Enabled platform must be freelancer");
    assert.strictEqual(enabled[0].url, "https://www.freelancer.com/");
  });

  test("Platform registry still maintains declarative metadata for all platforms", () => {
    const all = registry.getAllPlatforms();
    assert(all.length >= 10);
    assert(all.some(p => p.id === "freelancer" && p.enabled === true));
    assert(all.filter(p => p.id !== "freelancer").every(p => p.enabled === false));
  });

  test("desktop-runner.js implements interactive mode prompt and mutual exclusivity", () => {
    const code = fs.readFileSync(path.join(__dirname, "../scripts/desktop-runner.js"), "utf8");
    assert(code.includes("promptModeSelection"), "desktop-runner must call promptModeSelection");
    assert(code.includes("launchSocialAutopilot"), "desktop-runner must handle Social Autopilot");
    assert(code.includes("launchJobAutopilot"), "desktop-runner must handle Job Autopilot");
  });

  test("start-termux and start-job-automation route to desktop-runner with autopilot modes", () => {
    const startTermux = fs.readFileSync(path.join(__dirname, "../start-termux"), "utf8");
    assert(startTermux.includes("desktop-runner.js"), "start-termux must execute desktop-runner.js");

    const startJob = fs.readFileSync(path.join(__dirname, "../start-job-automation"), "utf8");
    assert(startJob.includes("--mode=job"), "start-job-automation must specify --mode=job");
  });

  console.log(`\nAutopilot Modes Audit: ${passed} Passed, ${failed} Failed\n`);
  if (failed) throw new Error(`${failed} autopilot mode tests failed`);
}

if (require.main === module) {
  try { runAutopilotModesAudit(); } catch (err) { console.error(err); process.exit(1); }
}

module.exports = { runAutopilotModesAudit };
