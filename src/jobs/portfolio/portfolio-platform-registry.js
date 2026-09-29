const fs = require("fs");
const path = require("path");
const CONFIG = require("../../../config");

const FILE = path.join(CONFIG.ROOT_DIR, "config", "portfolio-platforms.json");

function load() {
  if (!fs.existsSync(FILE)) throw new Error("Portfolio platform registry is missing");
  return JSON.parse(fs.readFileSync(FILE, "utf8"));
}

function getEnabledPlatforms() {
  return (load().platforms || []).filter(platform => platform.enabled !== false && platform.portfolio);
}

function getPlatform(id) {
  return getEnabledPlatforms().find(platform => platform.id === id) || null;
}

module.exports = { load, getEnabledPlatforms, getPlatform };
