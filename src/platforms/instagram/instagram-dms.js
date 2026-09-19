/**
 * src/platforms/instagram/instagram-dms.js
 * Instagram Direct Message (DM) monitoring and conversation extraction.
 * Connects to instagram.com/direct/inbox/.
 */

const crypto = require("crypto");
const CONFIG = require("../../../config");
const browserManager = require("../../browser/browser-manager");
const stateStore = require("../../storage/state-store");
const logger = require("../../logging/logger");

class InstagramDms {
  hashMessage(sender, text) {
    const clean = String(text || "").trim().toLowerCase();
    const hash = crypto.createHash("md5").update(`${sender}_${clean}`).digest("hex").slice(0, 10);
    return `dm_ig_${sender}_${hash}`;
  }

  /**
   * Scans Instagram DM inbox for conversations and latest incoming messages.
   */
  async scanDms() {
    logger.info("Scanning Instagram Direct Messages...", { action: "INSTAGRAM_DM_SCAN" });
    const page = await browserManager.getInstagramPage();

    try {
      await page.goto(CONFIG.INSTAGRAM_MESSAGES, {
        waitUntil: "domcontentloaded",
        timeout: 60000
      });
      await new Promise(r => setTimeout(r, 3000));

      const conversations = await page.evaluate(() => {
        const results = [];
        // Look for chat thread items in inbox
        const threadElements = [...document.querySelectorAll('div[role="listitem"], a[href*="/direct/t/"]')];

        for (const el of threadElements) {
          const text = (el.innerText || "").trim();
          const lines = text.split("\n").map(l => l.trim()).filter(Boolean);

          const link = el.querySelector('a[href*="/direct/t/"]') || el;
          const href = link.href || "";
          const match = href.match(/\/direct\/t\/([^/?#]+)/);
          const threadId = match ? match[1] : null;

          if (lines.length >= 2) {
            const sender = lines[0];
            const lastMessage = lines[1];
            results.push({
              threadId: threadId || sender,
              sender,
              lastMessage,
              fullText: text
            });
          }
        }
        return results;
      });

      logger.info(`Found ${conversations.length} conversations in Instagram DM inbox`, {
        action: "INSTAGRAM_DM_FOUND",
        count: conversations.length
      });

      return conversations;
    } catch (err) {
      logger.error("Failed scanning Instagram DMs", err);
      return [];
    }
  }
}

const instagramDms = new InstagramDms();
module.exports = instagramDms;
