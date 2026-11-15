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
  assert(!fs.existsSync(path.join(root, "scripts", "layout-cdp-windows.js")), "job/social split layout must not exist");
});

test("npm start uses the standalone runtime", () => {
  assert.strictEqual(pkg.scripts.start, "node scripts/desktop-runner.js");
  assert.strictEqual(pkg.scripts["desktop:layout"], undefined, "desktop:layout script must not exist");
  assert.strictEqual(pkg.scripts["start:job"], undefined, "start:job script must not exist");
});

test("Single social CDP plane is wired", () => {
  const code = fs.readFileSync(path.join(root, "scripts", "desktop-runner.js"), "utf8");
  assert(code.includes("CDP :9222"));
  assert(!code.includes("CDP :9223"), "job browser CDP :9223 must not be referenced");
  assert(code.includes("threads-agent.js"));
  assert(!code.includes("job-agent.js"), "job-agent.js must not be referenced");
});

console.log("\nDesktop Runner Audit: PASS\n");
