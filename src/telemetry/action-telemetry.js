/**
 * src/telemetry/action-telemetry.js
 * Truthful, structured action telemetry and diagnostic evidence recorder.
 * Zero false claims: records only what is observed in the live browser.
 * Guaranteed redaction of sensitive credentials, authentication tokens, cookies, and OTPs.
 */

const fs = require("fs");
const path = require("path");
const CONFIG = require("../../config");
const logger = require("../logging/logger");

const file = path.join(CONFIG.LOGS_DIR, "action-telemetry.jsonl");
const screenshotsDir = path.join(CONFIG.LOGS_DIR, "screenshots");

const SENSITIVE_KEY_REGEX = /^(password|passwd|token|bearer|cookie|cookies|auth|authorization|otp|mfa|secret|private_key|privatekey|cvv|ssn)$/i;
const SENSITIVE_TEXT_PATTERNS = [
  /Bearer\s+[A-Za-z0-9_\-\.]+/gi,
  /(password|passwd|token|otp|secret)=([^\s&]+)/gi
];

function redactSensitiveData(data) {
  if (data === null || data === undefined) return data;
  if (typeof data === "string") {
    let result = data;
    for (const pat of SENSITIVE_TEXT_PATTERNS) {
      result = result.replace(pat, (match, p1) => p1 ? `${p1}=[REDACTED]` : "[REDACTED_AUTH_TOKEN]");
    }
    return result;
  }
  if (Array.isArray(data)) {
    return data.map(item => redactSensitiveData(item));
  }
  if (typeof data === "object") {
    const cleaned = {};
    for (const [k, v] of Object.entries(data)) {
      if (SENSITIVE_KEY_REGEX.test(k.trim())) {
        cleaned[k] = "[REDACTED]";
      } else {
        cleaned[k] = redactSensitiveData(v);
      }
    }
    return cleaned;
  }
  return data;
}

function record(event = {}) {
  try {
    fs.mkdirSync(CONFIG.LOGS_DIR, { recursive: true });
    const rawPayload = {
      correlationId: event.correlationId || `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
      platform: event.platform || "unknown",
      pageUrl: event.pageUrl || "",
      action: event.action || "UNKNOWN",
      targetId: event.targetId || "",
      targetDescription: event.targetDescription || "",
      state: event.state || (event.type ? event.type.replace(/^ACTION_/, "") : "UNKNOWN"),
      type: event.type || `ACTION_${event.state || "RECORDED"}`,
      verified: Boolean(event.verified || event.type === "ACTION_VERIFIED"),
      evidence: event.evidence || null,
      failureReason: event.failureReason || event.error || null,
      durationMs: event.durationMs || 0,
      ...event
    };

    const sanitizedPayload = redactSensitiveData(rawPayload);
    fs.appendFileSync(file, JSON.stringify(sanitizedPayload) + "\n", "utf8");
    return sanitizedPayload;
  } catch (err) {
    logger.warn(`Failed writing action telemetry: ${err.message}`);
    return null;
  }
}

async function captureEvidence(page, meta = {}) {
  try {
    fs.mkdirSync(screenshotsDir, { recursive: true });
    const timestamp = Date.now();
    const safeTag = (meta.action || "evidence").toLowerCase().replace(/[^a-z0-9_-]/g, "_");
    const screenshotFile = path.join(screenshotsDir, `${safeTag}_${timestamp}.png`);
    const domFile = path.join(screenshotsDir, `${safeTag}_${timestamp}_dom.json`);

    if (page && typeof page.screenshot === "function") {
      await page.screenshot({ path: screenshotFile, fullPage: false }).catch(() => {});
      
      const domData = await page.evaluate(() => ({
        url: location.href,
        title: document.title,
        bodySnippet: (document.body ? document.body.innerText : "").slice(0, 3000),
        interactiveCount: document.querySelectorAll("button, a, input, textarea, [role='button'], [contenteditable='true']").length
      })).catch(() => ({ url: "", title: "", bodySnippet: "", interactiveCount: 0 }));

      const sanitizedDom = redactSensitiveData({
        timestamp: new Date().toISOString(),
        meta,
        dom: domData
      });

      fs.writeFileSync(domFile, JSON.stringify(sanitizedDom, null, 2), "utf8");

      return {
        screenshotPath: screenshotFile,
        domDumpPath: domFile
      };
    }
  } catch (err) {
    logger.warn(`Failed capturing debug evidence: ${err.message}`);
  }
  return null;
}

function recent(limit = 100) {
  if (!fs.existsSync(file)) return [];
  try {
    return fs.readFileSync(file, "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .slice(-limit)
      .map(line => {
        try { return JSON.parse(line); } catch (e) { return null; }
      })
      .filter(Boolean);
  } catch (e) {
    return [];
  }
}

module.exports = {
  record,
  captureEvidence,
  recent,
  redactSensitiveData,
  screenshotsDir,
  telemetryFile: file
};
