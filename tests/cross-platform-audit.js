/**
 * tests/cross-platform-audit.js
 * Verification suite auditing multi-platform & multi-browser compatibility
 * across Linux, macOS, Windows, and Android Termux.
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const {
  getPlatformBrowserConfig,
  getBrowserCatalog,
  resolveBrowser,
  detectSystemDefaultBrowser,
  detectRunningBrowser,
  isCdpActive
} = require("../scripts/launch-browser-cdp");
const CONFIG = require("../config");

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  \x1b[32m✓ PASS\x1b[0m: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  \x1b[31m✗ FAIL\x1b[0m: ${name}`);
    console.error(`    Error: ${err.message}`);
    failed++;
  }
}

async function runCrossPlatformAudit() {
  console.log("\n==================================================");
  console.log("  CROSS-PLATFORM & MULTI-BROWSER AUDIT");
  console.log("==================================================\n");

  const ROOT = path.resolve(__dirname, "..");

  // 1. Multi-Browser Catalog & Auto-Detection
  test("Browser Catalog: Contains Chrome, Edge, Brave, and Chromium", () => {
    const catalog = getBrowserCatalog();
    assert(catalog.chrome, "Catalog must contain Chrome");
    assert(catalog.edge, "Catalog must contain Edge");
    assert(catalog.brave, "Catalog must contain Brave");
    assert(catalog.chromium, "Catalog must contain Chromium");
  });

  test("Browser Detection: Resolves Auto / Default browser cleanly", () => {
    const autoBrowser = resolveBrowser("auto");
    assert(autoBrowser, "Must resolve auto browser");
    assert(autoBrowser.name, "Resolved browser must have a name");
    assert(autoBrowser.binary, "Resolved browser must have a binary");
    assert(autoBrowser.userDataDir, "Resolved browser must have a user data dir");
  });

  test("Browser Choice: Supports explicit browser resolution (Brave, Edge, Chromium)", () => {
    const brave = resolveBrowser("brave");
    assert(brave.type === "brave", "Must resolve Brave");

    const edge = resolveBrowser("edge");
    assert(edge.type === "edge", "Must resolve Edge");

    const chromium = resolveBrowser("chromium");
    assert(chromium.type === "chromium", "Must resolve Chromium");
  });

  test("Config: Exposes BROWSER_TYPE setting", () => {
    assert(CONFIG.BROWSER_TYPE !== undefined, "CONFIG.BROWSER_TYPE must be defined");
  });

  // 2. Installers verification
  const installers = [
    "installers/install-linux.sh",
    "installers/install-macos.sh",
    "installers/install-windows.ps1",
    "installers/install-windows.bat",
    "installers/install-android-termux.sh"
  ];

  for (const inst of installers) {
    test(`Installer present: ${inst}`, () => {
      const fullPath = path.join(ROOT, inst);
      assert(fs.existsSync(fullPath), `File must exist: ${inst}`);
      const content = fs.readFileSync(fullPath, "utf8");
      assert(content.length > 100, `Installer ${inst} must not be empty`);
    });
  }

  // 3. Android Termux runner
  test("Android Termux: start-termux launcher configured", () => {
    const termuxPath = path.join(ROOT, "start-termux");
    assert(fs.existsSync(termuxPath), "start-termux must exist");
    const content = fs.readFileSync(termuxPath, "utf8");
    assert(content.includes("DISPLAY="), "Must configure DISPLAY");
    assert(content.includes("termux-x11"), "Must handle termux-x11 server");
    assert(content.includes("chromium"), "Must handle chromium CDP");
  });

  // 4. Windows runners
  const winRunners = [
    "start-automation.ps1",
    "start-automation.bat",
    "status-automation.ps1",
    "stop-automation.ps1",
    "scripts/launch-brave-cdp.ps1",
    "scripts/launch-brave-cdp.bat"
  ];

  for (const wr of winRunners) {
    test(`Windows Runner present: ${wr}`, () => {
      const fullPath = path.join(ROOT, wr);
      assert(fs.existsSync(fullPath), `File must exist: ${wr}`);
      const content = fs.readFileSync(fullPath, "utf8");
      assert(content.length > 50, `File ${wr} must not be empty`);
    });
  }

  // 5. MiniMax M3 runtime configuration
  test("AI Runtime: MiniMax M3 is the default provider", () => {
    assert(CONFIG.AI_PROVIDER === "minimax", "AI_PROVIDER must default to minimax");
    assert(CONFIG.MINIMAX_MODEL === "MiniMax-M3", "MINIMAX_MODEL must be MiniMax-M3");
    assert(CONFIG.MINIMAX_BASE_URL, "MINIMAX_BASE_URL must be configured");
    assert(CONFIG.MINIMAX_ENDPOINT, "MINIMAX_ENDPOINT must be configured");
  });

  // 6. Runtime must not require the Antigravity CLI
  test("AI Runtime: no Antigravity CLI dependency", () => {
    const runtimeCode = fs.readFileSync(path.join(ROOT, "src/ai/ai-runtime.js"), "utf8");
    assert(!runtimeCode.includes("resolveAgyBinary"), "Runtime must not depend on resolveAgyBinary");
    assert(!runtimeCode.includes("spawn("), "Runtime must not spawn the Antigravity CLI");
    assert(runtimeCode.includes("callMiniMax"), "Runtime must include MiniMax execution");
  });

  // 7. Termux installer must not install Antigravity
  test("Termux: installer is MiniMax-based", () => {
    const termuxScript = path.join(ROOT, "installers/install-android-termux.sh");
    const content = fs.readFileSync(termuxScript, "utf8");
    assert(!content.includes("wallentx/antigravity-cli-termux"), "Termux installer must not install Antigravity CLI");
    assert(content.includes("MINIMAX"), "Termux installer must mention MiniMax configuration");
    assert(content.includes("termux-x11-nightly"), "Must include termux-x11-nightly");
  });

  // 8. Onboarding Wizard WhatsApp Integration
  test("Onboarding Wizard: includes WhatsApp booking link prompt and profile output", () => {
    const agentCode = fs.readFileSync(path.join(ROOT, "threads-agent.js"), "utf8");
    assert(agentCode.includes("WhatsApp Booking URL"), "Onboarding wizard must prompt for WhatsApp Booking URL");
    assert(agentCode.includes("WhatsApp: ${founderWhatsApp"), "Must save WhatsApp to knowledge base files");
  });

  console.log("\n--------------------------------------------------");
  console.log(`Cross-Platform Results: ${passed} Passed, ${failed} Failed`);
  console.log("--------------------------------------------------\n");

  if (failed > 0) {
    throw new Error(`${failed} cross-platform tests failed`);
  }
}

if (require.main === module) {
  runCrossPlatformAudit().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { runCrossPlatformAudit };
