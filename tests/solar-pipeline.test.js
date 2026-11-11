/**
 * tests/solar-pipeline.test.js
 * Solar pipeline scaffold checks. No network, no browser, no live actions.
 * Run: node tests/solar-pipeline.test.js
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

const results = [];

async function check(name, fn) {
  try {
    await fn();
    results.push(["PASS", name]);
  } catch (err) {
    results.push(["FAIL", `${name}: ${err.message}`]);
  }
}

async function main() {
  await check("solar pipeline config loads and has three pipelines", () => {
    const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, "config", "solar-pipelines.json"), "utf8"));
    assert.deepStrictEqual(Object.keys(cfg.pipelines).sort(), ["buyer-discovery", "pain-point-hunting", "warranty-angle"]);
    assert.strictEqual(cfg.safety.dryRun, true);
    assert.strictEqual(cfg.safety.livePosting, false);
    assert.strictEqual(cfg.safety.approvalRequired, true);
  });

  await check("solar search queries load for all three pipelines", () => {
    const q = JSON.parse(fs.readFileSync(path.join(ROOT, "config", "solar-search-queries.json"), "utf8"));
    for (const p of ["buyer-discovery", "pain-point-hunting", "warranty-angle"]) {
      assert.ok(Array.isArray(q[p]) && q[p].length > 0, `${p} has no queries`);
    }
  });

  await check("solar knowledge files exist", () => {
    for (const f of ["solar-client.md", "solar-services.md"]) {
      assert.ok(fs.existsSync(path.join(ROOT, "knowledge", f)), f);
    }
  });

  await check("solar classifier exposes pipelines", () => {
    const classifier = require("../src/leads/solar-intent-classifier");
    assert.deepStrictEqual(classifier.SolarIntentClassifier.pipelines().sort(), ["buyer-discovery", "pain-point-hunting", "warranty-angle"]);
  });

  await check("solar comment generator guardrails strip invented warranty coverage", () => {
    const gen = require("../src/engagement/solar-comment-generator");
    const out = gen.applySolarGuardrails("Our 5-year replacement warranty covers monkey damage completely.");
    assert.ok(!/covers monkey/i.test(out), "invented coverage must be removed");
    assert.ok(/5-year replacement warranty/i.test(out), "general phrase must survive");
    const out2 = gen.applySolarGuardrails("We are Reliance and we will fix it.");
    assert.ok(!/we are Reliance/i.test(out2), "must never claim to be Reliance");
  });

  await check("solar runner refuses live posting", async () => {
    const Runner = require("../src/solar/solar-pipeline-runner");
    const runner = new Runner({ stateDir: path.join(__dirname, "tmp-solar-state") });
    let threw = false;
    try {
      await runner.postLive();
    } catch (err) {
      threw = /disabled/i.test(err.message);
    }
    assert.ok(threw, "postLive must throw while disabled");
  });

  for (const [status, name] of results) console.log(`${status}: ${name}`);
  const failed = results.filter(([s]) => s === "FAIL");
  if (failed.length) {
    console.log("Solar pipeline tests: FAILURES present");
    process.exitCode = 1;
  } else {
    console.log("Solar pipeline tests: all passed");
  }
}

main();
