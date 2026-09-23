const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const pkg = require(path.join(root, "package.json"));

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ PASS: ${name}`);
  } catch (err) {
    console.error(`  ✗ FAIL: ${name}`);
    throw err;
  }
}

test("Standalone desktop runtime files exist", () => {
  assert(fs.existsSync(path.join(root, "scripts", "desktop-runner.js")));
  assert(fs.existsSync(path.join(root, "scripts", "layout-cdp-windows.js")));
});

test("npm start uses the standalone runtime", () => {
  assert.strictEqual(pkg.scripts.start, "node scripts/desktop-runner.js");
  assert.strictEqual(pkg.scripts["desktop:layout"], "node scripts/layout-cdp-windows.js");
});

test("Two isolated CDP planes are wired", () => {
  const code = fs.readFileSync(path.join(root, "scripts", "desktop-runner.js"), "utf8");
  assert(code.includes("CDP :9222"));
  assert(code.includes("CDP :9223"));
  assert(code.includes("threads-agent.js"));
  assert(code.includes("job-agent.js"));
});

test("Desktop split defaults to 50 percent and remains configurable", () => {
  const config = fs.readFileSync(path.join(root, "config", "index.js"), "utf8");
  const env = fs.readFileSync(path.join(root, ".env.example"), "utf8");
  assert(config.includes("DESKTOP_SPLIT_PERCENT"));
  assert(env.includes("DESKTOP_SPLIT_PERCENT=50"));
});

test("Native CDP window management is used for 50/50 layout", () => {
  const code = fs.readFileSync(path.join(root, "scripts", "layout-cdp-windows.js"), "utf8");
  assert(code.includes("Browser.getWindowForTarget"));
  assert(code.includes("Browser.setWindowBounds"));
  assert(code.includes("const split = CONFIG.DESKTOP_SPLIT_PERCENT / 100"));
  assert(code.includes("--social-only"));
});

console.log("\nDesktop Runner Audit: PASS\n");
