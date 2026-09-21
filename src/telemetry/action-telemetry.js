const fs = require("fs");
const path = require("path");
const CONFIG = require("../../config");

const file = path.join(CONFIG.LOGS_DIR, "action-telemetry.jsonl");

function record(event) {
  fs.mkdirSync(CONFIG.LOGS_DIR, { recursive: true });
  fs.appendFileSync(file, JSON.stringify({
    timestamp: new Date().toISOString(),
    ...event
  }) + "\n", "utf8");
}

function recent(limit = 100) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8").trim().split("\n").filter(Boolean).slice(-limit).map(JSON.parse);
}

module.exports = { record, recent };
