const telemetry = require("../telemetry/action-telemetry");

function summarize(limit = 500) {
  const events = telemetry.recent(limit);
  const result = {};
  for (const e of events) {
    const key = `${e.platform || "system"}:${e.action || e.type}`;
    if (!result[key]) result[key] = { verified:0, failed:0, unverified:0, simulated:0 };
    if (e.type === "ACTION_VERIFIED") result[key].verified++;
    if (e.type === "ACTION_FAILED") result[key].failed++;
    if (e.type === "ACTION_UNVERIFIED") result[key].unverified++;
    if (e.type === "ACTION_SIMULATED") result[key].simulated++;
  }
  return result;
}

function print() {
  const rows = summarize();
  console.log("\n=== VERIFIED AGENTIC FEATURE HEALTH ===");
  for (const [k,v] of Object.entries(rows)) {
    console.log(`${k.padEnd(38)} verified=${v.verified} failed=${v.failed} unverified=${v.unverified} simulated=${v.simulated}`);
  }
  console.log("========================================\n");
  return rows;
}

module.exports = { summarize, print };
