const assert = require("assert");
const fs = require("fs");
const path = require("path");

const files = [
  "src/agent/universal-browser-agent.js",
  "src/safety/global-guard.js",
  "src/leads/relationship-engine.js",
  "src/agent/visual-fallback.js",
  "src/agentic/next-best-action.js",
  "src/content/omnichannel-content.js",
  "src/social/agentic-social-runner.js"
];

for (const relative of files) {
  const full = path.resolve(__dirname, "..", relative);
  const source = fs.readFileSync(full, "utf8");

  assert.ok(!source.includes("querySelector("), relative + " must not use CSS selectors");
  assert.ok(!source.includes("querySelectorAll("), relative + " must not use CSS selector lists");
  assert.ok(!source.includes("waitForSelector("), relative + " must not wait on selectors");
  assert.ok(!source.includes("xpath"), relative + " must not depend on XPath");
  assert.ok(!source.includes("elementHandle.$"), relative + " must not use selector handles");
  assert.ok(!source.includes("replace(/"), relative + " must not use regex replacements");
  assert.ok(!source.includes(".match(/"), relative + " must not use regex matching");
  assert.ok(!source.includes(".test(/"), relative + " must not use regex testing");
}

const lifecycle = require("../config/social-lifecycle.json");
assert.ok(lifecycle.stages.OBSERVED);
assert.ok(lifecycle.stages.CONVERSATION);
assert.ok(lifecycle.stages.HANDOFF);
assert.ok(lifecycle.stages.WON);

const UniversalBrowserAgent = require("../src/agent/universal-browser-agent").UniversalBrowserAgent;
assert.strictEqual(typeof UniversalBrowserAgent.prototype.captureLiveSnapshot, "function");
assert.strictEqual(typeof UniversalBrowserAgent.prototype.executePlan, "function");

console.log("Agentic V2 architecture audit passed.");
