/**
 * tests/cross-platform-audit.js
 * Verification suite auditing multi-platform compatibility across Linux, macOS, Windows, and Android Termux.
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { getPlatformBrowserConfig, isCdpActive } = require("../scripts/launch-browser-cdp");

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
  console.log("  CROSS-PLATFORM ARCHITECTURE & RUNNER AUDIT");
  console.log("==================================================\n");

  const ROOT = path.resolve(__dirname, "..");

  // 1. Universal Browser CDP Config
  test("Universal CDP: Resolves platform browser config properly", () => {
    const cfg = getPlatformBrowserConfig();
    assert(cfg.platform, "Platform must be defined");
    assert(cfg.binary, "Binary must be resolved");
    assert(cfg.userDataDir, "User data directory must be resolved");
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

  // 5. Antigravity Guide & Prompts
  test("Antigravity: ANTIGRAVITY_GUIDE.md documentation and prompts", () => {
    const guidePath = path.join(ROOT, "ANTIGRAVITY_GUIDE.md");
    assert(fs.existsSync(guidePath), "ANTIGRAVITY_GUIDE.md must exist");
    const content = fs.readFileSync(guidePath, "utf8");
    assert(content.includes("Full Autonomous Mode"), "Must include Autonomous prompt");
    assert(content.includes("Lead Discovery"), "Must include Discovery prompt");
    assert(content.includes("Approval Mode"), "Must include Approval prompt");
    assert(content.includes("Android (Termux)"), "Must include Termux instructions");
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
