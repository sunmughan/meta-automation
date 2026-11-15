/**
 * tests/autopilot-modes.test.js
 * Verifies the single-mode division in the solar-social-only branch:
 * Social Autopilot only. The Job Autopilot was removed.
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { MODES, getActiveMode } = require("../src/core/autopilot-manager");

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
  console.log("  AUTOPILOT MODES AUDIT (SOCIAL ONLY)");
  console.log("==================================================\n");

  test("Exactly 1 autopilot mode is defined (social only)", () => {
    assert.strictEqual(MODES.SOCIAL, "social");
    assert.strictEqual(MODES.JOB, undefined, "JOB mode must not exist in this branch");
    assert.deepStrictEqual(Object.keys(MODES), ["SOCIAL"]);
  });

  test("Active mode query returns valid structure", () => {
    const active = getActiveMode();
    assert("mode" in active);
    assert("name" in active);
    assert("pid" in active);
    assert([MODES.SOCIAL, null].includes(active.mode));
  });

  test("No job-automation module remains in the tree", () => {
    assert(!fs.existsSync(path.join(__dirname, "../src/jobs")), "src/jobs must not exist");
    assert(!fs.existsSync(path.join(__dirname, "../job-agent.js")), "job-agent.js must not exist");
    assert(!fs.existsSync(path.join(__dirname, "../config/job-platforms.json")), "config/job-platforms.json must not exist");
    assert(!fs.existsSync(path.join(__dirname, "../src/orchestrator/master-orchestrator.js")), "master-orchestrator.js must not exist");
  });

  test("desktop-runner.js launches Social Autopilot only", () => {
    const code = fs.readFileSync(path.join(__dirname, "../scripts/desktop-runner.js"), "utf8");
    assert(code.includes("promptModeSelection"), "desktop-runner must call promptModeSelection");
    assert(code.includes("launchSocialAutopilot"), "desktop-runner must handle Social Autopilot");
    assert(!code.includes("launchJobAutopilot"), "desktop-runner must not reference Job Autopilot");
    assert(!code.includes("job-agent.js"), "desktop-runner must not reference job-agent.js");
  });

  test("start-termux routes to desktop-runner", () => {
    const startTermux = fs.readFileSync(path.join(__dirname, "../start-termux"), "utf8");
    assert(startTermux.includes("desktop-runner.js"), "start-termux must execute desktop-runner.js");
  });

  console.log(`\nAutopilot Modes Audit: ${passed} Passed, ${failed} Failed\n`);
  if (failed) throw new Error(`${failed} autopilot mode tests failed`);
}

if (require.main === module) {
  try { runAutopilotModesAudit(); } catch (err) { console.error(err); process.exit(1); }
}

module.exports = { runAutopilotModesAudit };
