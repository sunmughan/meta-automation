/**
 * tests/browser-e2e.js
 * End-to-End Live Browser Diagnostic Suite for Meta Automation.
 * Connects directly to authenticated CDP browser session (Chrome/Brave/Edge) on port 9222.
 * 
 * Verifies:
 *  1. CDP connection & port responsiveness
 *  2. Browser instance reachability & version
 *  3. Page/Tab enumeration
 *  4. Dedicated Threads tab discovery
 *  5. Dedicated LinkedIn tab discovery
 *  6. Dedicated Facebook tab discovery
 *  7. Platform authentication verification
 *  8. URL health & routing verification
 *  9. Live Semantic DOM snapshot capture
 * 10. Interactive elements discovery (buttons, links, textboxes)
 * 11. Platform health summary table
 * 12. Safe read-only viewport inspection & scrolling
 */

const assert = require("assert");
const http = require("http");
const CONFIG = require("../config");
const browserManager = require("../src/browser/browser-manager");
const { BrowserAgent } = require("../src/agent/browser-agent");
const featureHealth = require("../src/agent/feature-health");
const telemetry = require("../src/telemetry/action-telemetry");

let passed = 0;
let failed = 0;

function reportPass(name, detail = "") {
  console.log(`  \x1b[32m✓ PASS\x1b[0m: ${name}${detail ? ` (${detail})` : ""}`);
  passed++;
}

function reportFail(name, err) {
  console.error(`  \x1b[31m✗ FAIL\x1b[0m: ${name}`);
  console.error(`    Error: ${err.message || err}`);
  failed++;
}

async function runBrowserE2E() {
  console.log("\n==================================================");
  console.log("  AGENTIC BROWSER E2E VERIFICATION SUITE");
  console.log("  Direct CDP Attachment & Authenticated DOM Audit");
  console.log("==================================================\n");
  console.log(`Configured CDP Endpoint : ${CONFIG.CDP_URL || "http://127.0.0.1:9222"}`);

  let browser = null;
  const correlationId = `e2e_${Date.now()}`;

  // 1. CDP connection
  try {
    const isReachable = await browserManager.isCdpReachable();
    assert.strictEqual(isReachable, true, `CDP port is not reachable at ${CONFIG.CDP_URL}`);
    reportPass("1. CDP Connection", "Port 9222 responding with HTTP 200");
  } catch (err) {
    reportFail("1. CDP Connection", err);
    console.error("\n❌ Live authenticated browser is not running with remote debugging.");
    console.error("Please launch your browser via: node scripts/launch-browser-cdp.js\n");
    process.exit(1);
  }

  // 2. Browser reachability
  try {
    browser = await browserManager.connect();
    const version = await browser.version();
    assert(version && version.length > 0, "Browser version string must be non-empty");
    reportPass("2. Browser Reachable", version);
  } catch (err) {
    reportFail("2. Browser Reachable", err);
  }

  // 3. Page discovery
  let allPages = [];
  try {
    allPages = await browser.pages();
    assert(allPages.length > 0, "At least one browser page must exist");
    reportPass("3. Pages Discovered", `Count: ${allPages.length} pages`);
  } catch (err) {
    reportFail("3. Pages Discovered", err);
  }

  // 4, 5, 6. Dedicated Tab Architecture (Threads, LinkedIn, Facebook)
  let tabs = {};
  try {
    tabs = await browserManager.ensureAllPlatformTabs();
    assert(tabs.threadsPage, "Threads page instance must exist");
    assert(tabs.linkedInPage, "LinkedIn page instance must exist");
    assert(tabs.facebookPage, "Facebook page instance must exist");

    reportPass("4. Threads Tab Discovered", tabs.threadsPage.url());
    reportPass("5. LinkedIn Tab Discovered", tabs.linkedInPage.url());
    reportPass("6. Facebook Tab Discovered", tabs.facebookPage.url());
  } catch (err) {
    reportFail("4-6. Platform Tabs Discovery", err);
  }

  // 7. Authentication state
  try {
    const authStatus = {};
    for (const [platform, page] of Object.entries({
      threads: tabs.threadsPage,
      linkedin: tabs.linkedInPage,
      facebook: tabs.facebookPage
    })) {
      if (!page) continue;
      const url = page.url().toLowerCase();
      const isLoginOrCheckpoint =
        url.includes("login") ||
        url.includes("checkpoint") ||
        url.includes("auth") ||
        url.includes("challenge");
      authStatus[platform] = !isLoginOrCheckpoint;
      assert.strictEqual(authStatus[platform], true, `${platform} must be logged in (current URL: ${url})`);
    }
    reportPass("7. Authentication State", "All 3 platforms verified authenticated");
  } catch (err) {
    reportFail("7. Authentication State", err);
  }

  // 8. URL state & platform routing
  try {
    assert(tabs.threadsPage.url().includes("threads"), "Threads tab URL must match threads.com");
    assert(tabs.linkedInPage.url().includes("linkedin"), "LinkedIn tab URL must match linkedin.com");
    assert(tabs.facebookPage.url().includes("facebook"), "Facebook tab URL must match facebook.com");
    reportPass("8. URL State Verification", "Target platform domains confirmed");
  } catch (err) {
    reportFail("8. URL State Verification", err);
  }

  // 9. Live Semantic DOM snapshot capture
  let threadSnapshot = null;
  try {
    const agent = new BrowserAgent(tabs.threadsPage, "threads");
    threadSnapshot = await agent.captureLiveSnapshot("e2e_threads_audit");
    assert(threadSnapshot.url, "Snapshot must include live URL");
    assert(Array.isArray(threadSnapshot.interactiveElements), "Interactive elements must be an array");
    reportPass("9. Live Semantic DOM Snapshot", `${threadSnapshot.interactiveElements.length} elements captured`);
  } catch (err) {
    reportFail("9. Live Semantic DOM Snapshot", err);
  }

  // 10. Interactive elements discovery
  try {
    const buttons = threadSnapshot.interactiveElements.filter(e => e.role.includes("button") || e.tag === "button");
    const links = threadSnapshot.interactiveElements.filter(e => e.role.includes("link") || e.tag === "a");
    assert(buttons.length > 0, "Must discover interactive buttons on active page");
    assert(links.length > 0, "Must discover interactive links on active page");
    reportPass("10. Interactive Elements Discovery", `${buttons.length} buttons, ${links.length} links`);
  } catch (err) {
    reportFail("10. Interactive Elements Discovery", err);
  }

  // 11. Safe read-only viewport inspection & scrolling
  try {
    const agent = new BrowserAgent(tabs.threadsPage, "threads");
    const scrollRes = await agent.executeAtomicAction({ type: "SCROLL", value: 300 }, correlationId);
    assert.strictEqual(scrollRes.success, true, "Safe scroll must succeed");
    await new Promise(r => setTimeout(r, 1000));
    await agent.executeAtomicAction({ type: "SCROLL", value: -300 }, correlationId);
    reportPass("11. Safe Read-Only Viewport Inspection", "Smooth scroll tested cleanly");
  } catch (err) {
    reportFail("11. Safe Read-Only Viewport Inspection", err);
  }

  // 12. Platform health & telemetry recording
  try {
    for (const [platform, page] of Object.entries({
      threads: tabs.threadsPage,
      linkedin: tabs.linkedInPage,
      facebook: tabs.facebookPage
    })) {
      if (!page) continue;
      telemetry.record({
        type: "ACTION_VERIFIED",
        state: "VERIFIED",
        platform,
        action: "E2E_AUDIT",
        pageUrl: page.url(),
        targetId: `tab_${platform}`,
        evidence: { verifiedAt: new Date().toISOString() }
      });
    }
    reportPass("12. Platform Health & Telemetry", "Health telemetry written to action-telemetry.jsonl");
  } catch (err) {
    reportFail("12. Platform Health & Telemetry", err);
  }

  console.log("\n--------------------------------------------------");
  console.log(`Live Browser E2E Results: ${passed} Passed, ${failed} Failed`);
  console.log("--------------------------------------------------\n");

  featureHealth.print();

  browserManager.disconnect();

  if (failed > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  runBrowserE2E().catch(err => {
    console.error("Browser E2E crash:", err);
    process.exit(1);
  });
}

module.exports = { runBrowserE2E };
