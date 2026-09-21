/**
 * src/telemetry/action-telemetry.js
 * Truthful, structured action telemetry and diagnostic evidence recorder.
 * Zero false claims: records only what is observed in the live browser.
 */

const fs = require("fs");
const path = require("path");
const CONFIG = require("../../config");
const logger = require("../logging/logger");

const file = path.join(CONFIG.LOGS_DIR, "action-telemetry.jsonl");
const screenshotsDir = path.join(CONFIG.LOGS_DIR, "screenshots");

function record(event = {}) {
  try {
    fs.mkdirSync(CONFIG.LOGS_DIR, { recursive: true });
    const recordPayload = {
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

    fs.appendFileSync(file, JSON.stringify(recordPayload) + "\n", "utf8");
    return recordPayload;
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

      fs.writeFileSync(domFile, JSON.stringify({
        timestamp: new Date().toISOString(),
        meta,
        dom: domData
      }, null, 2), "utf8");

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
  screenshotsDir,
  telemetryFile: file
};
