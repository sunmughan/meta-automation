const fs = require("fs");
const path = require("path");
const CONFIG = require("../../../config");

const FILE = path.join(CONFIG.ROOT_DIR, "config", "professional-growth-platforms.json");

function load() {
  if (!fs.existsSync(FILE)) throw new Error("Professional growth platform registry is missing");
  const data = JSON.parse(fs.readFileSync(FILE, "utf8"));
  if (!Array.isArray(data.platforms)) throw new Error("Professional growth platform registry must contain platforms[]");
  return data;
}

function getEnabled() {
  return load().platforms.filter(platform => platform.enabled !== false);
}

function getSkillPlatforms() {
  return getEnabled().filter(platform => {
    const kinds = Array.isArray(platform.goalTypes) ? platform.goalTypes : [];
    return platform.kind === "SKILL_DEVELOPMENT" || kinds.length > 0;
  });
}

function getPlatform(id) {
  return getEnabled().find(platform => platform.id === id) || null;
}

function getDiscoveryConfig() {
  return load().discovery || {};
}

module.exports = { load, getEnabled, getSkillPlatforms, getPlatform, getDiscoveryConfig };
