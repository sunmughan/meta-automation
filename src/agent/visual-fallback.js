/**
 * Vision recovery bridge.
 * It never clicks from raw vision output. Vision describes the missing target;
 * the browser agent then re-observes the live DOM and re-plans against semantic element IDs.
 */

const fs = require("fs");
const path = require("path");
const CONFIG = require("../../config");
const logger = require("../logging/logger");

class VisualFallback {
  constructor({ aiRuntime }) {
    this.aiRuntime = aiRuntime;
  }

  async inspect(page, intent, snapshot, platform) {
    const dir = path.resolve(CONFIG.LOGS_DIR || path.resolve(CONFIG.ROOT_DIR, "logs"), "screenshots");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, "vision-recovery-" + Date.now() + ".png");
    await page.screenshot({ path: file, fullPage: false });

    if (typeof this.aiRuntime.callVision !== "function") {
      return {
        available: false,
        imagePath: file,
        reason: "Multimodal AI transport is not configured"
      };
    }

    try {
      const result = await this.aiRuntime.callVision(
        [
          "You are visual recovery for a browser agent.",
          "Inspect the current screenshot only.",
          "Do not invent selectors, XPath, DOM attributes, or hidden state.",
          "Describe the visible control or region that would satisfy the requested intent.",
          "Return JSON with targetDescription, visibleText, approximateRegion, confidence.",
          "Do not request or perform any action.",
          "",
          "PLATFORM: " + String(platform || ""),
          "INTENT: " + String(intent || ""),
          "CURRENT SEMANTIC SNAPSHOT:",
          JSON.stringify({
            url: snapshot?.url,
            title: snapshot?.title,
            interactiveElements: snapshot?.interactiveElements
          })
        ].join("\n"),
        file
      );

      logger.info("[VISION FALLBACK] Recovered visual description for " + String(intent || "target"));
      return {
        available: true,
        imagePath: file,
        ...result
      };
    } catch (err) {
      return {
        available: false,
        imagePath: file,
        reason: err.message
      };
    }
  }
}

module.exports = VisualFallback;
