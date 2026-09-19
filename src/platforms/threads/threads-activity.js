/**
 * src/platforms/threads/threads-activity.js
 * Continuous monitor for replies to our posts and comments on Threads.
 * Navigates to threads.com/activity, reads incoming replies, and responds continuously.
 */

const crypto = require("crypto");
const CONFIG = require("../../../config");
const browserManager = require("../../browser/browser-manager");
const stateStore = require("../../storage/state-store");
const aiDecisionEngine = require("../../ai/ai-decision-engine");
const duplicateGuard = require("../../safety/duplicate-guard");
const logger = require("../../logging/logger");

const fs = require("fs");
const path = require("path");

async function captureDiagnosticScreenshot(page, prefix) {
  try {
    const dir = path.join(CONFIG.LOGS_DIR || path.resolve(__dirname, "../../../logs"), "screenshots");
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const file = path.join(dir, `${prefix}_${Date.now()}.png`);
    await page.screenshot({ path: file });
    logger.info(`Saved diagnostic screenshot to: ${file}`);
    return file;
  } catch (e) {
    logger.warn(`Failed capturing diagnostic screenshot: ${e.message}`);
    return null;
  }
}

class ThreadsActivityWatcher {
  /**
   * Hashes incoming text for unique multi-turn reply tracking.
   */
  hashReply(username, text) {
    const clean = String(text || "").trim().toLowerCase();
    const hash = crypto.createHash("md5").update(`${username}_${clean}`).digest("hex").slice(0, 10);
    return `reply_threads_${username}_${hash}`;
  }

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
      const rawNotifications = await page.evaluate(() => {
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
              text
            });
          }
        }
        return results;
      });

      const replyItems = rawNotifications.map(item => ({
        ...item,
        id: this.hashReply(item.username, item.text)
      }));

      logger.info(`Found ${replyItems.length} activity notifications`, { count: replyItems.length });

      for (const item of replyItems) {
        if (!item.url) continue;

        // Skip if this exact message turn was already handled
        if (stateStore.hasHandledReply(item.id, "threads")) {
          continue;
        }

        // Duplicate guard check
        const dupCheck = duplicateGuard.canExecute({
          platform: "threads",
          actionType: "REPLY",
          targetId: item.id,
          text: item.text
        });
        if (!dupCheck.allowed) {
          logger.warn(`Skipping reply for @${item.username}: ${dupCheck.reason}`);
          continue;
        }

        logger.info(`Responding to reply from @${item.username}...`);

        // Load existing conversation state to maintain multi-turn continuity
        const convId = `threads:${item.username}`;
        const existingConv = stateStore.getConversation(convId, "threads") || {};

        // Generate contextual reply via AI decision engine
        const replyDecision = await aiDecisionEngine.generateConversationReply({
          platform: "threads",
          username: item.username,
          originalPost: existingConv.originalPost || "",
          ourPreviousMessage: existingConv.lastResponse || "",
          incomingMessage: item.text,
          conversationStage: existingConv.conversationStage || "DISCOVERY",
          companyMentionedBefore: existingConv.companyIntroduced,
          founderMentionedBefore: existingConv.founderIntroduced
        });

        // Update persistent conversation state
        stateStore.saveConversation({
          platform: "threads",
          conversationId: convId,
          user: item.username,
          username: item.username,
          postId: item.url,
          identifiedIntent: replyDecision.intent,
          identityUsed: replyDecision.identity,
          companyIntroduced: replyDecision.identity === "COMPANY" || replyDecision.identity === "BOTH" || existingConv.companyIntroduced,
          founderIntroduced: replyDecision.identity === "FOUNDER" || replyDecision.identity === "BOTH" || existingConv.founderIntroduced,
          lastResponse: replyDecision.response_message,
          conversationStage: replyDecision.conversation_stage || "DISCOVERY",
          previousMessages: [
            ...(existingConv.previousMessages || []),
            { sender: item.username, text: item.text, timestamp: new Date().toISOString() },
            { sender: "CodeAir", text: replyDecision.response_message, timestamp: new Date().toISOString() }
          ],
          newAction: "REPLY_PROCESSED",
          newActionDetails: { replyId: item.id, identity: replyDecision.identity }
        });

        // If dry run or posting disabled or approval mode
        if (CONFIG.APPROVAL_MODE) {
          stateStore.recordHandledReply(item.id, {
            username: item.username,
            incomingText: item.text,
            responseText: replyDecision.response_message,
            status: "PENDING_APPROVAL"
          }, "threads");
          logger.info(`[REPLY] Reply to @${item.username} queued for approval.`);
          continue;
        }

        if (CONFIG.DRY_RUN || !CONFIG.POSTING_ENABLED) {
          stateStore.recordHandledReply(item.id, {
            username: item.username,
            incomingText: item.text,
            responseText: replyDecision.response_message,
            status: "SIMULATED"
          }, "threads");

          duplicateGuard.recordExecuted({
            platform: "threads",
            actionType: "REPLY",
            targetId: item.id,
            text: item.text
          });
          logger.info(`[SIMULATED REPLY] Replied to @${item.username}: "${replyDecision.response_message.slice(0, 50)}..."`);
          continue;
        }

        // Live execution in Threads browser
        stateStore.recordActionTransition("REPLY", item.id, "INIT", "PREPARING", {
          username: item.username,
          url: item.url
        });

        try {
          await page.goto(item.url, { waitUntil: "domcontentloaded", timeout: 45000 });
          await new Promise(r => setTimeout(r, 2500));

          // Ensure reply input is open; if not, click Reply action on the article
          let replyInput = await page.$('div[role="textbox"][contenteditable="true"]');
          if (!replyInput) {
            const opened = await page.evaluate(() => {
              const svgs = [...document.querySelectorAll('svg')];
              const replySvg = svgs.find(s => {
                const d = s.querySelector('path')?.getAttribute('d') || '';
                const aria = (s.getAttribute('aria-label') || '').toLowerCase();
                return aria.includes('reply') || d.startsWith('M12 3a9 9 0 0 0 0 18c1.414 0 2');
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
            if (opened) {
              await new Promise(r => setTimeout(r, 1500));
              replyInput = await page.$('div[role="textbox"][contenteditable="true"]');
            }
          }

          if (!replyInput) {
            stateStore.recordActionTransition("REPLY", item.id, "PREPARING", "FAILED", {
              reason: "Could not open reply input"
            });
            throw new Error(`Could not open reply input for @${item.username} on ${item.url}`);
          }

          stateStore.recordActionTransition("REPLY", item.id, "PREPARING", "OPENED");

          await replyInput.focus();
          await new Promise(r => setTimeout(r, 400));

          // State Transition: TYPING
          stateStore.recordActionTransition("REPLY", item.id, "OPENED", "TYPING");
          for (const char of replyDecision.response_message) {
            await page.keyboard.sendCharacter(char);
            await new Promise(res => setTimeout(res, Math.floor(Math.random() * 20) + 15));
          }
          await new Promise(res => setTimeout(res, 1500));

          // State Transition: SUBMITTING
          stateStore.recordActionTransition("REPLY", item.id, "TYPING", "SUBMITTING");
          const postClicked = await page.evaluate(() => {
            const dialog = document.querySelector('div[role="dialog"], [aria-modal="true"]');
            if (dialog) {
              const btns = Array.from(dialog.querySelectorAll('div[role="button"], button'));
              const pBtn = btns.find(b => {
                const txt = (b.innerText || "").trim().toLowerCase();
                const aria = (b.getAttribute("aria-label") || "").trim().toLowerCase();
                const isEnabled = !b.disabled && b.getAttribute('aria-disabled') !== "true";
                return (txt === 'post' || txt === 'reply' || aria === 'post' || aria === 'reply') && isEnabled;
              });
              if (pBtn) {
                pBtn.focus();
                pBtn.click();
                pBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                return true;
              }
            }

            const tb = document.querySelector('div[role="textbox"][contenteditable="true"]');
            if (tb) {
              let parent = tb.parentElement;
              for (let depth = 0; depth < 8; depth++) {
                if (!parent) break;
                const svgs = Array.from(parent.querySelectorAll('svg'));
                const submitSvg = svgs.find(s => {
                  const title = (s.querySelector('title')?.textContent || s.getAttribute('aria-label') || "").toLowerCase();
                  const d = s.querySelector('path')?.getAttribute('d') || "";
                  return title === 'reply' || title === 'post' || d.includes('M1 6h10');
                });
                if (submitSvg) {
                  const btn = submitSvg.closest('div[role="button"], button') || submitSvg;
                  btn.focus?.();
                  btn.click();
                  btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                  return true;
                }

                const btns = Array.from(parent.querySelectorAll('div[role="button"], button'));
                const pBtn = btns.find(b => {
                  const txt = (b.innerText || "").trim().toLowerCase();
                  const aria = (b.getAttribute("aria-label") || "").trim().toLowerCase();
                  const isEnabled = !b.disabled && b.getAttribute('aria-disabled') !== "true";
                  return (txt === 'reply' || txt === 'post' || aria === 'reply' || aria === 'post') && isEnabled;
                });
                if (pBtn) {
                  pBtn.focus();
                  pBtn.click();
                  pBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                  return true;
                }
                parent = parent.parentElement;
              }
            }
            return false;
          });

          if (!postClicked) {
            try {
              const submitHandle = await page.$('div[role="dialog"] div[role="button"]:not([aria-disabled="true"]), div[role="textbox"] ~ div div[role="button"], div[role="textbox"] ~ div button');
              if (submitHandle) {
                await submitHandle.click();
              }
            } catch (_) {}
          }

          // State Transition: VERIFYING
          stateStore.recordActionTransition("REPLY", item.id, "SUBMITTING", "VERIFYING");

          // Strict verification in DOM: confirm reply snippet rendered inside article or comment tree
          const textSnippet = replyDecision.response_message.replace(/https?:\/\/[^\s]+/g, "").slice(0, 30).trim();
          let isVerified = false;
          for (let attempt = 0; attempt < 10; attempt++) {
            await new Promise(r => setTimeout(r, 1000));
            isVerified = await page.evaluate((snippet) => {
              const bodyText = document.body.innerText || "";
              const hasError = /\b(couldn'?t post|something went wrong|action blocked|rate limit)\b/i.test(bodyText);
              if (hasError) return false;
              const articles = Array.from(document.querySelectorAll('article, [data-pressable-container="true"], div[dir="auto"], span'));
              return snippet && snippet.length > 5 && articles.some(a => {
                if (a.tagName === 'SCRIPT' || a.tagName === 'STYLE') return false;
                return (a.innerText || a.textContent || "").includes(snippet);
              });
            }, textSnippet);
            if (isVerified) break;
          }

          if (!isVerified) {
            stateStore.recordActionTransition("REPLY", item.id, "VERIFYING", "FAILED", {
              reason: "Reply snippet not found in thread DOM"
            });
            stateStore.recordActionTransition("REPLY", item.id, "FAILED", "DIAGNOSTIC", {
              reason: "Capturing diagnostic screenshot"
            });

            logger.warn(`Live reply to @${item.username} could not be verified in DOM. Skipping state recording.`);
            await captureDiagnosticScreenshot(page, `reply_unverified_${item.username}`);
            continue;
          }

          // State Transition: VERIFIED_SUCCESS
          stateStore.recordActionTransition("REPLY", item.id, "VERIFYING", "VERIFIED_SUCCESS", {
            username: item.username,
            textSnippet
          });

          // Record verified handled reply
          stateStore.recordHandledReply(item.id, {
            username: item.username,
            incomingText: item.text,
            responseText: replyDecision.response_message,
            status: "REPLIED"
          }, "threads");

          duplicateGuard.recordExecuted({
            platform: "threads",
            actionType: "REPLY",
            targetId: item.id,
            text: item.text
          });

          logger.info(`✅ Verified live reply to @${item.username}: "${replyDecision.response_message.slice(0, 50)}..."`);
        } catch (err) {
          logger.error(`Error executing live reply for @${item.username}: ${err.message}`);
          stateStore.recordActionTransition("REPLY", item.id, "SUBMITTING", "FAILED", {
            error: err.message
          });
          await captureDiagnosticScreenshot(page, `reply_exception_${item.username}`).catch(() => {});
        }
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
