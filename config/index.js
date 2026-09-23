/**
 * config/index.js
 * Central configuration module for CodeAir Threads + Instagram AI Lead Generation & Engagement System.
 * Enforces safety constraints, default DRY_RUN=true, APPROVAL_MODE=true, rate limits, and paths.
 */

const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..");

// Environment loader without external dependencies
function loadEnvFile() {
  const envPath = path.resolve(ROOT_DIR, ".env");
  if (fs.existsSync(envPath)) {
    try {
      const content = fs.readFileSync(envPath, "utf8");
      const lines = content.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx !== -1) {
          const key = trimmed.slice(0, eqIdx).trim();
          let val = trimmed.slice(eqIdx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (process.env[key] === undefined) {
            process.env[key] = val;
          }
        }
      }
    } catch (e) {
      console.warn("Notice: Unable to parse .env file:", e.message);
    }
  }
}

loadEnvFile();

const CONFIG = {
  ROOT_DIR,
  KNOWLEDGE_DIR: path.resolve(ROOT_DIR, "knowledge"),
  STATE_FILE: path.resolve(ROOT_DIR, "threads-engagement-state.json"),
  LEADS_FILE: path.resolve(ROOT_DIR, "threads-leads.json"),
  LEADS_AI_FILE: path.resolve(ROOT_DIR, "threads-leads-ai.json"),
  LOGS_DIR: path.resolve(ROOT_DIR, "logs"),
  BACKUPS_DIR: path.resolve(ROOT_DIR, "backups"),

  // AI Provider Configuration
  AI_PROVIDER: (process.env.AI_PROVIDER || process.env.AI_RUNTIME || "antigravity").toLowerCase(),
  AI_RUNTIME: (process.env.AI_RUNTIME || "antigravity").toLowerCase(),
  MODEL: process.env.AI_MODEL || "gemini-3.8-flash-high",

  // MiniMax M3 API Configuration
  MINIMAX_API_KEY: process.env.MINIMAX_API_KEY || "",
  MINIMAX_BASE_URL: process.env.MINIMAX_BASE_URL || "https://api.minimax.io/v1",
  MINIMAX_MODEL: process.env.MINIMAX_MODEL || "MiniMax-M3",
  MINIMAX_TIMEOUT_MS: Math.max(1000, Number(process.env.MINIMAX_TIMEOUT_MS) || 90000),
  MINIMAX_MAX_RETRIES: Math.max(0, Number(process.env.MINIMAX_MAX_RETRIES) || 2),

  // Browser CDP & Display Configuration (Chrome, Edge, Brave, Chromium)
  BROWSER_TYPE: (process.env.BROWSER_TYPE || process.env.BROWSER || "auto").toLowerCase(),
  CDP_URL: process.env.THREADS_CDP_URL || process.env.CDP_URL || "http://127.0.0.1:9222",
  THREADS_CDP_URL: process.env.THREADS_CDP_URL || process.env.CDP_URL || "http://127.0.0.1:9222",
  DISPLAY: process.env.DISPLAY || ":1",
  BRAVE_BIN: process.env.BRAVE_BIN || "/usr/bin/brave-browser-stable",
  BRAVE_USER_DATA_DIR: process.env.BRAVE_USER_DATA_DIR || path.join(process.env.HOME || process.env.USERPROFILE || "", ".config/BraveSoftware/Brave-Browser"),
  VIEWPORT_WIDTH: 1440,
  VIEWPORT_HEIGHT: 1080,

  // URLs
  THREADS_HOME: "https://www.threads.com/",
  THREADS_MESSAGES: "https://www.threads.com/messages",
  THREADS_ACTIVITY: "https://www.threads.com/activity",
  INSTAGRAM_HOME: "https://www.instagram.com/",
  INSTAGRAM_MESSAGES: "https://www.instagram.com/direct/inbox/",
  LINKEDIN_HOME: "https://www.linkedin.com/feed/",
  LINKEDIN_MESSAGES: "https://www.linkedin.com/messaging/",
  FACEBOOK_HOME: "https://www.facebook.com/",
  FACEBOOK_MESSAGES: "https://www.facebook.com/messages/t/",

  // Operational Modes (Default: DRY_RUN=true, APPROVAL_MODE=true for safety)
  PLATFORM_TARGET: (process.env.PLATFORM_TARGET || "threads").toLowerCase(),
  APPROVAL_MODE: process.env.APPROVAL_MODE !== "false",
  DRY_RUN: process.env.DRY_RUN !== "false",
  POSTING_ENABLED: process.env.POSTING_ENABLED === "true",
  EXECUTION_MODE: (process.env.EXECUTION_MODE || "round-robin").toLowerCase(),

  // Rate Limits (per hour)
  MAX_NEW_POST_REPLIES_PER_HOUR: Number(process.env.MAX_NEW_POST_REPLIES_PER_HOUR) || 5,
  MAX_TOTAL_REPLIES_PER_HOUR: Number(process.env.MAX_TOTAL_REPLIES_PER_HOUR) || 15,
  MAX_DM_REPLIES_PER_HOUR: Number(process.env.MAX_DM_REPLIES_PER_HOUR) || 10,

  // Action Delays (ms)
  MIN_ACTION_DELAY_MS: Number(process.env.MIN_ACTION_DELAY_MS) || 15000,
  MAX_ACTION_DELAY_MS: Number(process.env.MAX_ACTION_DELAY_MS) || 45000,

  // Scanner Settings
  SCAN_INTERVAL_SECONDS: Number(process.env.SCAN_INTERVAL_SECONDS) || 300,
  AI_MAX_CONCURRENCY: Math.max(1, Number(process.env.AI_MAX_CONCURRENCY) || 3),
  MAX_POSTS_PER_SCAN: Number(process.env.MAX_POSTS_PER_SCAN) || 50,

  // Publishing Cadence (6 hours = 4 posts per 24 hours)
  POST_INTERVAL_HOURS: Number(process.env.POST_INTERVAL_HOURS) || 6,
  CAROUSEL_INTERVAL_DAYS: Number(process.env.CAROUSEL_INTERVAL_DAYS) || 2,

  // Dynamic reference to knowledge engine
  get knowledge() {
    return require("../src/knowledge/knowledge-engine");
  }
};

module.exports = CONFIG;
