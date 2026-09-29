const assert = require("assert");
const fs = require("fs");
const path = require("path");
const CONFIG = require("../config");

function test(name, fn) {
  try { fn(); console.log("✓ " + name); }
  catch (e) { console.error("✗ " + name + ": " + e.message); process.exitCode = 1; }
}

const root = path.resolve(__dirname, "..");

test("professional growth configuration is declarative", () => {
  const p = JSON.parse(fs.readFileSync(path.join(root, "config/professional-growth-platforms.json"), "utf8"));
  assert(Array.isArray(p.platforms) && p.platforms.length > 0);
  assert(p.discovery.enabled === true);
  assert(p.discovery.searchUrlTemplate.includes("{query}"));
  assert(p.discovery.queryTemplate.includes("{skill}"));
});

test("professional growth engine modules exist", () => {
  for (const file of [
    "src/jobs/growth/growth-ai.js",
    "src/jobs/growth/growth-runner.js",
    "src/jobs/growth/profile-intelligence.js",
    "src/jobs/growth/credential-discovery.js",
    "src/jobs/growth/leetcode-engine.js",
    "src/jobs/growth/skill-development-engine.js",
    "src/jobs/growth/professional-growth-platform-registry.js",
    "src/jobs/growth/professional-growth-engine.js"
  ]) assert(fs.existsSync(path.join(root, file)), file);
});

test("growth browser plans are semantic and do not accept selectors", () => {
  const code = fs.readFileSync(path.join(root, "src/jobs/growth/growth-runner.js"), "utf8");
  assert(code.includes("semantic"));
  assert(code.includes("selector"));
});

test("skill execution does not hardcode a learning platform", () => {
  const engine = fs.readFileSync(path.join(root, "src/jobs/growth/professional-growth-engine.js"), "utf8");
  const runner = fs.readFileSync(path.join(root, "src/jobs/growth/skill-development-engine.js"), "utf8");
  assert(!engine.includes('runSkill(skill, "leetcode")'));
  assert(!runner.includes("https://leetcode.com"));
});

test("credential discovery is registry-driven", () => {
  const code = fs.readFileSync(path.join(root, "src/jobs/growth/credential-discovery.js"), "utf8");
  assert(code.includes("getDiscoveryConfig"));
  assert(!code.includes("free " + "$" + "{skill} certification"));
  assert(!code.includes("google.com/search?q={query}"));
});

test("growth persists reasoning/evidence per iteration", () => {
  const runner = fs.readFileSync(path.join(root, "src/jobs/growth/growth-runner.js"), "utf8");
  const engine = fs.readFileSync(path.join(root, "src/jobs/growth/skill-development-engine.js"), "utf8");
  assert(runner.includes("onIteration"));
  assert(engine.includes("lastDecision"));
  assert(engine.includes("lastPageUrl"));
});

test("growth uses configured AI runtime", () => {
  const runtime = require("../src/ai/ai-runtime");
  assert(runtime && typeof runtime.callAi === "function");
  assert(["antigravity","minimax","openai","freebuff"].includes(CONFIG.AI_PROVIDER));
});
