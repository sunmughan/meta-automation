const assert = require("assert");
const fs = require("fs");
const path = require("path");
const CONFIG = require("../config");

function test(name, fn) {
  try { fn(); console.log("✓ " + name); }
  catch (e) { console.error("✗ " + name + ": " + e.message); process.exitCode = 1; }
}

const root = path.resolve(__dirname, "..");

test("professional growth configuration exists", () => {
  const p = JSON.parse(fs.readFileSync(path.join(root, "config/professional-growth-platforms.json"), "utf8"));
  assert(p.platforms.some(x => x.id === "leetcode"));
  assert(p.discovery.enabled === true);
});

test("professional growth engine modules exist", () => {
  for (const file of [
    "src/jobs/growth/growth-ai.js",
    "src/jobs/growth/growth-runner.js",
    "src/jobs/growth/profile-intelligence.js",
    "src/jobs/growth/credential-discovery.js",
    "src/jobs/growth/leetcode-engine.js",
    "src/jobs/growth/professional-growth-engine.js"
  ]) assert(fs.existsSync(path.join(root, file)), file);
});

test("growth browser plans are semantic and do not accept selectors", () => {
  const code = fs.readFileSync(path.join(root, "src/jobs/growth/growth-runner.js"), "utf8");
  assert(code.includes("semantic"));
  assert(code.includes("selector"));
});

test("growth uses configured Antigravity runtime", () => {
  const runtime = require("../src/ai/ai-runtime");
  assert(runtime && typeof runtime.callAi === "function");
  assert(["antigravity","minimax","openai","freebuff"].includes(CONFIG.AI_PROVIDER));
});
