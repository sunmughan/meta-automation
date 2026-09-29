const fs = require("fs");
const path = require("path");
const CONFIG = require("../../../config");

function load() {
  const file = path.join(CONFIG.ROOT_DIR, "config", "job-certification-platforms.json");
  const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!parsed || !Array.isArray(parsed.platforms)) {
    throw new Error("config/job-certification-platforms.json must contain a platforms array");
  }
  return parsed.platforms.map(p => ({ ...p, enabled: p.enabled !== false }));
}

function getAll() {
  return load();
}

function envKey(id) {
  return `JOB_CERT_${id.toUpperCase().replace(/-/g, "_")}_ENABLED`;
}

function getEnabled() {
  return load().filter(p =>
    p.free &&
    p.enabled &&
    process.env[envKey(p.id)] !== "false"
  );
}

function getById(id) {
  return load().find(p => p.id === id) || null;
}

module.exports = { getAll, getEnabled, getById };
