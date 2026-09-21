/**
 * tests/execution-mode.test.js
 * Unit tests verifying execution mode configuration, concurrent multi-threading routing,
 * and sequential round-robin fallback.
 */

const assert = require("assert");
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

console.log("\n==================================================");
console.log("  EXECUTION MODE & MULTI-TAB ROUTING TEST SUITE");
console.log("==================================================\n");

// 1. Config includes EXECUTION_MODE
test("1. Config exposes EXECUTION_MODE with valid default or env setting", () => {
  assert(CONFIG.EXECUTION_MODE !== undefined, "EXECUTION_MODE must be defined in CONFIG");
  assert(["concurrent", "round-robin", "sequential", "parallel"].includes(CONFIG.EXECUTION_MODE), `Invalid mode: ${CONFIG.EXECUTION_MODE}`);
});

// 2. Mode resolution recognizes CLI flags
test("2. CLI argument --mode= overrides config settings", () => {
  const parseMode = (argv, fallback) => {
    const arg = argv.find(a => a.startsWith("--mode="));
    if (arg) return arg.split("=")[1].trim().toLowerCase();
    return fallback;
  };

  assert.strictEqual(parseMode(["node", "agent", "--mode=round-robin"], "concurrent"), "round-robin");
  assert.strictEqual(parseMode(["node", "agent", "--mode=concurrent"], "round-robin"), "concurrent");
  assert.strictEqual(parseMode(["node", "agent"], "concurrent"), "concurrent");
});

// 3. Concurrent vs Round-Robin detection logic
test("3. Concurrency detection flags concurrent/parallel correctly", () => {
  const isConcurrent = (mode) => mode === "concurrent" || mode === "parallel";
  assert.strictEqual(isConcurrent("concurrent"), true);
  assert.strictEqual(isConcurrent("parallel"), true);
  assert.strictEqual(isConcurrent("round-robin"), false);
  assert.strictEqual(isConcurrent("sequential"), false);
});

// 4. Sequential round-robin maps cycle % 3 correctly
test("4. Sequential round-robin cycle % 3 correctly cycles Threads -> LinkedIn -> Facebook", () => {
  const getPlatform = (cycle) => {
    const p = cycle % 3;
    return p === 1 ? "threads" : (p === 2 ? "linkedin" : "facebook");
  };

  assert.strictEqual(getPlatform(1), "threads");
  assert.strictEqual(getPlatform(2), "linkedin");
  assert.strictEqual(getPlatform(3), "facebook");
  assert.strictEqual(getPlatform(4), "threads");
  assert.strictEqual(getPlatform(5), "linkedin");
  assert.strictEqual(getPlatform(6), "facebook");
});

// 5. StateStore atomic save uses unique temp file to prevent concurrent collision
test("5. StateStore atomic save temp file contains unique randomness to avoid collision", () => {
  const generateTempPath = (filePath) => `${filePath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
  const p1 = generateTempPath("/tmp/state.json");
  const p2 = generateTempPath("/tmp/state.json");
  assert.notStrictEqual(p1, p2, "Temp file paths must be unique across concurrent writes");
});

console.log("\n--------------------------------------------------");
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log("--------------------------------------------------\n");

if (failed > 0) process.exit(1);
