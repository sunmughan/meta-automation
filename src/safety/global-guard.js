/**
 * Global cross-platform safety controller.
 * Security decisions are semantic AI classifications over current live state.
 * No selector tables or regex signatures are used for security decisions.
 */

const fs = require("fs");
const path = require("path");
const CONFIG = require("../../config");
const logger = require("../logging/logger");
const telemetry = require("../telemetry/action-telemetry");

class GlobalGuard {
  constructor({ aiRuntime }) {
    if (!aiRuntime) throw new Error("GlobalGuard requires aiRuntime");
    this.aiRuntime = aiRuntime;
    this.statePath = path.resolve(CONFIG.ROOT_DIR, "runtime", "global-guard.json");
    this.state = {
      mode: "NORMAL",
      reason: "",
      platform: "",
      updatedAt: new Date().toISOString()
    };
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(this.statePath)) {
        this.state = { ...this.state, ...JSON.parse(fs.readFileSync(this.statePath, "utf8")) };
      }
    } catch (err) {
      logger.warn("[GLOBAL GUARD] State load failed: " + err.message);
    }
  }

  save() {
    try {
      fs.mkdirSync(path.dirname(this.statePath), { recursive: true });
      const tmp = this.statePath + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify(this.state, null, 2), "utf8");
      fs.renameSync(tmp, this.statePath);
    } catch (err) {
      logger.warn("[GLOBAL GUARD] State save failed: " + err.message);
    }
  }

  async inspect(snapshot, platform) {
    if (this.state.mode === "PAUSED") {
      return {
        safe: false,
        mode: "PAUSED",
        reason: this.state.reason || "Global guard is paused"
      };
    }

    const prompt = [
      "You are the security gate for a browser automation system.",
      "Inspect only the supplied live browser observation.",
      "Classify the current page into exactly one state:",
      "SAFE, SECURITY_CHALLENGE, LOGIN_REQUIRED, UNKNOWN_SECURITY_STATE.",
      "Security challenge includes CAPTCHA, account checkpoint, identity verification,",
      "phone verification, suspicious-login review, bot detection, or any user-only gate.",
      "Do not infer from CSS classes or hidden application state.",
      "Return strict JSON with state, reason, confidence, and manualActionRequired.",
      "",
      "PLATFORM: " + String(platform || ""),
      "LIVE OBSERVATION:",
      JSON.stringify({
        url: snapshot?.url,
        title: snapshot?.title,
        bodyText: snapshot?.bodyText,
        dialogs: snapshot?.activeDialogs,
        interactiveElements: snapshot?.interactiveElements
      })
    ].join("
");

    let result;
    try {
      result = await this.aiRuntime.callAi(prompt, {
        taskType: "SECURITY_GUARD",
        priority: 0,
        retries: 1
      });
    } catch (err) {
      result = {
        state: "UNKNOWN_SECURITY_STATE",
        reason: err.message,
        confidence: 0,
        manualActionRequired: true
      };
    }

    const state = String(result?.state || "UNKNOWN_SECURITY_STATE").toUpperCase();
    const safe = state === "SAFE";

    if (!safe) {
      this.state = {
        mode: "PAUSED",
        reason: String(result?.reason || state),
        platform: String(platform || ""),
        updatedAt: new Date().toISOString()
      };
      this.save();
      telemetry.record({
        type: "GLOBAL_SAFETY_PAUSE",
        state: "QUARANTINED",
        platform,
        action: "SECURITY_CHECK",
        pageUrl: snapshot?.url || "",
        failureReason: this.state.reason,
        evidence: result
      });
      logger.warn("[GLOBAL GUARD] Automation paused: " + this.state.reason);
    }

    return {
      safe,
      state,
      reason: String(result?.reason || state),
      confidence: Number(result?.confidence || 0),
      manualActionRequired: !safe
    };
  }

  resume() {
    this.state = {
      mode: "NORMAL",
      reason: "",
      platform: "",
      updatedAt: new Date().toISOString()
    };
    this.save();
    logger.info("[GLOBAL GUARD] Automation resumed.");
  }

  isPaused() {
    return this.state.mode === "PAUSED";
  }
}

module.exports = GlobalGuard;
