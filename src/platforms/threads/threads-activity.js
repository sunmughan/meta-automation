/**
 * src/platforms/threads/threads-activity.js
 * Continuous monitor for replies to our posts and comments on Threads.
 * Navigates to threads.com/activity, reads incoming replies, and responds continuously.
 */

const CONFIG = require("../../../config");
const browserManager = require("../../browser/browser-manager");
const stateStore = require("../../storage/state-store");
const aiDecisionEngine = require("../../ai/ai-decision-engine");
const duplicateGuard = require("../../safety/duplicate-guard");
const logger = require("../../logging/logger");

class ThreadsActivityWatcher {
  /**
   * Scans Threads Activity/Notifications for incoming replies to our posts or comments.
   */
  async checkReplies() {
    logger.info("Checking Threads Activity for new replies...", { action: "ACTIVITY_SCAN" });

    const page = await browserManager.getThreadsPage();
    await page.bringToFront();

    try {
      await page.goto(CONFIG.THREADS_ACTIVITY, {
        waitUntil: "domcontentloaded",
        timeout: 45000
      });
      await new Promise(r => setTimeout(r, 2500));

      // Extract reply items from notifications
      const replyItems = await page.evaluate(() => {
        const results = [];
        const rows = [...document.querySelectorAll('div[role="listitem"], a[href*="/post/"]')];

        for (const row of rows) {
          const text = (row.innerText || "").trim();
          // Check if notification indicates a reply
          if (/replied|commented|mentioned/i.test(text)) {
            const link = row.querySelector('a[href*="/post/"]') || (row.tagName === "A" ? row : null);
            const href = link ? link.href : null;
            const authorMatch = text.match(/@?([a-zA-Z0-9._]+)\s+(replied|commented)/i);
            const username = authorMatch ? authorMatch[1] : "user";

            results.push({
              username,
              url: href,
              text,
              id: href || `reply_${username}_${text.slice(0, 30)}`
            });
          }
        }
        return results;
      });

      logger.info(`Found ${replyItems.length} activity notifications`, { count: replyItems.length });

      for (const item of replyItems) {
        if (!item.url) continue;

        // Skip if already handled
        if (stateStore.hasHandledReply(item.id, "threads")) {
          continue;
        }

        logger.info(`Responding to reply from @${item.username}...`);

        // Generate contextual reply
        const replyDecision = await aiDecisionEngine.generateConversationReply({
          platform: "threads",
          username: item.username,
          incomingMessage: item.text,
          conversationStage: "DISCOVERY"
        });

        // If posting is enabled, type and submit the reply live
        if (CONFIG.POSTING_ENABLED && !CONFIG.DRY_RUN) {
          await page.goto(item.url, { waitUntil: "domcontentloaded", timeout: 45000 });
          await new Promise(r => setTimeout(r, 2500));

          // Look for reply input
          const replyInput = await page.$('div[role="textbox"][contenteditable="true"]');
          if (replyInput) {
            await replyInput.focus();
            for (const char of replyDecision.response_message) {
              await page.keyboard.sendCharacter(char);
              await new Promise(res => setTimeout(res, 20));
            }
            await new Promise(res => setTimeout(res, 1200));

            // Two-step submission: Click reply up-arrow icon then confirm in modal
            const clickedUpArrow = await page.evaluate(() => {
              const svgs = [...document.querySelectorAll('svg')];
              const replySvg = svgs.find(s => {
                const p = s.querySelector('path');
                const d = p ? p.getAttribute('d') || '' : '';
                return d.includes('M1 6h10') || (s.getAttribute('aria-label') || '').toLowerCase().includes('reply');
              });
              if (replySvg) {
                const btn = replySvg.closest('div[role="button"], button');
                if (btn) {
                  btn.click();
                  return true;
                }
              }
              return false;
            });

            if (clickedUpArrow) {
              await new Promise(res => setTimeout(res, 1500));
              await page.evaluate(() => {
                const buttons = [...document.querySelectorAll('div[role="button"], button')];
                const postBtn = buttons.find(b => (b.innerText || '').trim().toLowerCase() === 'post');
                if (postBtn) postBtn.click();
              });
            } else {
              await page.keyboard.press("Enter");
            }
            await new Promise(res => setTimeout(res, 3000));
          }
        }

        // Record handled reply
        stateStore.recordHandledReply(item.id, {
          username: item.username,
          incomingText: item.text,
          responseText: replyDecision.response_message,
          status: "REPLIED"
        }, "threads");

        logger.info(`✅ Replied to @${item.username}: "${replyDecision.response_message.slice(0, 50)}..."`);
      }

      return replyItems;
    } catch (err) {
      logger.error("Failed checking Threads activity", err);
      return [];
    }
  }
}

const threadsActivityWatcher = new ThreadsActivityWatcher();
module.exports = threadsActivityWatcher;
