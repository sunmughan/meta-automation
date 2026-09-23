/**
 * tests/job-engine-audit.js
 * Static/configuration audit for the data-driven, agentic job revenue engine.
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const CONFIG = require("../config");
const registry = require("../src/jobs/platform-registry");
const { ALLOWED_ACTIONS } = require("../src/agent/browser-agent");

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

function runJobEngineAudit() {
  const root = path.resolve(__dirname, "..");

  test("Job platform registry exposes all configured target platforms", () => {
    const ids = registry.getAllPlatforms().map(p => p.id);
    const expected = ["upwork","freelancer","contra","peopleperhour","guru","workana","malt","arc","toptal","fiverr"];
    assert.deepStrictEqual(ids.sort(), expected.sort());
  });

  test("Every platform has only declarative configuration", () => {
    for (const platform of registry.getAllPlatforms()) {
      assert(platform.url.startsWith("https://"), `${platform.id} must use HTTPS`);
      assert(platform.mode, `${platform.id} must declare a workflow mode`);
    }
  });

  test("Job browser agent is closed-loop and selector-free", () => {
    const files = [
      "src/jobs/ai/job-ai.js",
      "src/jobs/browser/job-browser-agent.js",
      "src/jobs/browser/job-runner.js",
      "src/jobs/discovery/opportunity-engine.js",
      "src/jobs/application/application-engine.js",
      "src/jobs/profile/profile-engine.js",
      "src/jobs/platform-session.js"
    ];
    for (const file of files) {
      const content = fs.readFileSync(path.join(root, file), "utf8");
      assert(!content.includes("document.querySelector(") && !content.includes("page.$("), `${file} must not hardcode browser selectors`);
    }
  });

  test("Job engine has no hardcoded search query list", () => {
    const files = [
      "src/jobs/ai/job-ai.js",
      "src/jobs/discovery/opportunity-engine.js",
      "src/jobs/application/application-engine.js"
    ];
    for (const file of files) {
      const content = fs.readFileSync(path.join(root, file), "utf8");
      assert(!/need a website|looking for web developer|hire software developer/i.test(content), `${file} contains a hardcoded discovery query`);
    }
  });

  test("Browser action contract contains file upload", () => {
    assert(ALLOWED_ACTIONS.has("UPLOAD"), "UPLOAD action must be available to the agent");
  });

  test("Remote/project constraints are configuration-driven", () => {
    assert.strictEqual(CONFIG.JOB_REMOTE_ONLY, true);
    assert.strictEqual(CONFIG.JOB_PROJECT_ONLY, true);
    assert(CONFIG.JOB_MIN_MATCH_SCORE >= 0 && CONFIG.JOB_MIN_MATCH_SCORE <= 100);
    assert(CONFIG.JOB_MAX_PLAN_ITERATIONS >= 1);
  });

  test("Dedicated job browser uses isolated CDP endpoint and profile", () => {
    assert(String(CONFIG.JOB_BROWSER_CDP_URL).includes(":9223"));
    assert(String(CONFIG.JOB_BROWSER_USER_DATA_DIR).length > 0);
  });

  console.log(`\nJob Engine Audit: ${passed} Passed, ${failed} Failed\n`);
  if (failed) throw new Error(`${failed} job engine audit test(s) failed`);
}

if (require.main === module) {
  try { runJobEngineAudit(); } catch (err) { console.error(err); process.exit(1); }
}

module.exports = { runJobEngineAudit };
