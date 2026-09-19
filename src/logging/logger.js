/**
 * src/logging/logger.js
 * Structured logging and audit history for CodeAir Threads + Instagram System.
 * Ensures security: never logs passwords, session cookies, or full API keys.
 */

const fs = require("fs");
const path = require("path");

const LOGS_DIR = path.resolve(__dirname, "../../logs");
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

const LOG_FILE = path.join(LOGS_DIR, "agent.log");
const AUDIT_FILE = path.join(LOGS_DIR, "audit.log");

function sanitize(obj) {
  if (!obj) return obj;
  if (typeof obj === "string") {
    return obj
      .replace(/AIza[0-9A-Za-z-_]{35}/g, "[REDACTED_API_KEY]")
      .replace(/sessionid=[^;]+/gi, "sessionid=[REDACTED]")
      .replace(/ds_user_id=[^;]+/gi, "ds_user_id=[REDACTED]")
      .replace(/csrftoken=[^;]+/gi, "csrftoken=[REDACTED]");
  }
  if (typeof obj !== "object") return obj;

  const copy = Array.isArray(obj) ? [] : {};
  for (const key of Object.keys(obj)) {
    const lk = key.toLowerCase();
    if (lk.includes("cookie") || lk.includes("password") || lk.includes("token") || lk.includes("apikey")) {
      copy[key] = "[REDACTED]";
    } else {
      copy[key] = sanitize(obj[key]);
    }
  }
  return copy;
}

function writeToFile(filePath, entry) {
  try {
    fs.appendFileSync(filePath, JSON.stringify(entry) + "\n", "utf8");
  } catch (err) {
    // Ignore file write errors to prevent crashes
  }
}

class Logger {
  formatMessage(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    return {
      timestamp,
      level,
      message,
      meta: sanitize(meta)
    };
  }

  info(message, meta = {}) {
    const entry = this.formatMessage("INFO", message, meta);
    console.log(`[${entry.timestamp}] \x1b[36mINFO\x1b[0m: ${message}`, Object.keys(meta).length ? meta : "");
    writeToFile(LOG_FILE, entry);
  }

  warn(message, meta = {}) {
    const entry = this.formatMessage("WARN", message, meta);
    console.warn(`[${entry.timestamp}] \x1b[33mWARN\x1b[0m: ${message}`, Object.keys(meta).length ? meta : "");
    writeToFile(LOG_FILE, entry);
  }

  error(message, error = null, meta = {}) {
    const errObj = error ? { error_message: error.message, stack: error.stack } : {};
    const entry = this.formatMessage("ERROR", message, { ...errObj, ...meta });
    console.error(`[${entry.timestamp}] \x1b[31mERROR\x1b[0m: ${message}`, error ? error.message : "");
    writeToFile(LOG_FILE, entry);
  }

  debug(message, meta = {}) {
    if (process.env.DEBUG === "true") {
      const entry = this.formatMessage("DEBUG", message, meta);
      console.log(`[${entry.timestamp}] \x1b[90mDEBUG\x1b[0m: ${message}`, Object.keys(meta).length ? meta : "");
      writeToFile(LOG_FILE, entry);
    }
  }

  audit(action, target, details = {}) {
    const timestamp = new Date().toISOString();
    const entry = {
      timestamp,
      type: "AUDIT",
      action,
      target,
      details: sanitize(details)
    };
    console.log(`\x1b[35m[AUDIT]\x1b[0m ${action} -> ${target}`, details.status || "");
    writeToFile(AUDIT_FILE, entry);
    writeToFile(LOG_FILE, { level: "AUDIT", message: `${action} on ${target}`, meta: entry });
  }
}

const logger = new Logger();
module.exports = logger;
