/**
 * Dynamic job-platform registry.
 * Platform targets live in config/job-platforms.json so the agent logic stays platform-agnostic.
 */
const fs = require("fs");
const path = require("path");
const CONFIG = require("../../config");

function loadRegistry() {
  const file = path.join(CONFIG.ROOT_DIR, "config", "job-platforms.json");
  const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!parsed || !Array.isArray(parsed.platforms)) {
    throw new Error("config/job-platforms.json must contain a platforms array");
  }
  return parsed.platforms.map(platform => ({
    ...platform,
    enabled: platform.enabled !== false
  }));
}

function getAllPlatforms() {
  return loadRegistry();
}

function getEnabledPlatforms() {
  const activeOnly = process.env.JOB_ACTIVE_PLATFORM ? process.env.JOB_ACTIVE_PLATFORM.toLowerCase() : null;
  return loadRegistry().filter(platform => {
    if (activeOnly && platform.id.toLowerCase() !== activeOnly) return false;
    const envKey = `JOB_${platform.id.toUpperCase()}_ENABLED`;
    return platform.enabled && process.env[envKey] !== "false";
  });
}

function getPlatform(id) {
  return loadRegistry().find(platform => platform.id === id) || null;
}

module.exports = { getAllPlatforms, getEnabledPlatforms, getPlatform };
