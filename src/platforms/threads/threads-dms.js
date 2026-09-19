/**
 * src/platforms/threads/threads-dms.js
 * Threads Direct Message (DM) monitoring and conversational processing.
 * Connects to threads.com/messages, tracks conversation threads, and handles incoming DMs.
 */

const crypto = require("crypto");
const CONFIG = require("../../../config");
const browserManager = require("../../browser/browser-manager");
const stateStore = require("../../storage/state-store");
const duplicateGuard = require("../../safety/duplicate-guard");
const logger = require("../../logging/logger");

class ThreadsDms {
  hashMessage(sender, text) {
    const clean = String(text || "").trim().toLowerCase();
    const hash = crypto.createHash("md5").update(`${sender}_${clean}`).digest("hex").slice(0, 10);
    return `dm_threads_${sender}_${hash}`;
  }

  /**
   * Scans Threads DM inbox for incoming conversations.
   */
  async scanDms() {
    logger.info("Scanning Threads Direct Messages...", { action: "THREADS_DM_SCAN" });
    const page = await browserManager.getThreadsPage();

    try {
      await page.goto(CONFIG.THREADS_MESSAGES, {
        waitUntil: "domcontentloaded",
        timeout: 60000
      });
      await new Promise(r => setTimeout(r, 2500));

      const inboxItems = await page.evaluate(() => {
        const conversations = [];
        const rows = [...document.querySelectorAll('div[role="listitem"], a[href*="/messages/t/"]')];

        for (const row of rows) {
          const text = (row.innerText || "").trim();
          const link = row.querySelector('a[href*="/messages/t/"]') || row;
          const href = link.href || "";
          const match = href.match(/\/messages\/t\/([^/?#]+)/);
          const threadId = match ? match[1] : null;

          const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
          if (lines.length >= 2) {
            const sender = lines[0].replace(/^@/, "");
            const lastMessage = lines[1];
            conversations.push({
              threadId: threadId || sender,
              sender,
              lastMessage,
              fullText: text
            });
          }
        }
        return conversations;
      });

      logger.info(`Found ${inboxItems.length} conversations in Threads DM inbox`, {
        action: "THREADS_DM_FOUND",
        count: inboxItems.length
      });

      return inboxItems;
    } catch (err) {
      logger.error("Failed scanning Threads DMs", err);
      return [];
    }
  }
}

const threadsDms = new ThreadsDms();
module.exports = threadsDms;
