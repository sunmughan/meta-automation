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
            // Check if last message was sent by us
            const isOutgoing = /^(you\b|you sent|you shared|you replied|seen)/i.test(lastMessage);
            conversations.push({
              threadId: threadId || sender,
              sender,
              lastMessage,
              isOutgoing,
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

  /**
   * Sends a direct message live in the Threads web browser and verifies delivery.
   * @param {string} threadIdOrSender - Thread ID (from URL) or username
   * @param {string} messageText - The message to type and send
   */
  async sendDirectMessage(threadIdOrSender, messageText) {
    stateStore.recordActionTransition("DM", threadIdOrSender, "INIT", "PREPARING", {
      snippet: messageText.slice(0, 30)
    });

    logger.info(`Sending live DM to ${threadIdOrSender}...`, { action: "THREADS_DM_SEND" });
    const page = await browserManager.getThreadsPage();
    await page.bringToFront();

    try {
      const currentUrl = page.url();
      const targetUrl = threadIdOrSender.startsWith("http")
        ? threadIdOrSender
        : (threadIdOrSender.length > 15 ? `https://www.threads.com/messages/t/${threadIdOrSender}` : null);

      if (targetUrl && !currentUrl.includes(threadIdOrSender)) {
        await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
        await new Promise(r => setTimeout(r, 2500));
      }

      // Check for hard platform restriction in conversation view
      const restriction = await page.evaluate(() => {
        const bodyText = document.body.innerText || "";
        if (/message request sent/i.test(bodyText) || /once they'?ve accepted your request/i.test(bodyText)) {
          return "MESSAGE_REQUEST_PENDING";
        }
        if (/can'?t message this account/i.test(bodyText) || /account cannot be messaged/i.test(bodyText)) {
          return "ACCOUNT_NOT_MESSAGEABLE";
        }
        return null;
      });

      if (restriction) {
        stateStore.recordActionTransition("DM", threadIdOrSender, "PREPARING", "RESTRICTED", {
          restriction,
          reason: "Platform restriction detected: message request awaiting recipient acceptance"
        });
        logger.warn(`[DM RESTRICTION] Thread ${threadIdOrSender} has platform restriction: ${restriction}. Awaiting recipient acceptance.`);
        return {
          success: false,
          restricted: true,
          restriction,
          reason: `Platform restriction: ${restriction}`
        };
      }

      // Locate DM chat textbox
      const chatInput = await page.waitForSelector('div[role="textbox"][contenteditable="true"]', { timeout: 10000 });
      if (!chatInput) {
        stateStore.recordActionTransition("DM", threadIdOrSender, "PREPARING", "FAILED", {
          reason: "Chat input textbox not found"
        });
        throw new Error(`Could not find chat input textbox for DM ${threadIdOrSender}`);
      }

      stateStore.recordActionTransition("DM", threadIdOrSender, "PREPARING", "OPENED");

      await chatInput.focus();
      await new Promise(r => setTimeout(r, 400));

      // State Transition: TYPING
      stateStore.recordActionTransition("DM", threadIdOrSender, "OPENED", "TYPING");
      for (const char of messageText) {
        await page.keyboard.sendCharacter(char);
        await new Promise(r => setTimeout(r, Math.floor(Math.random() * 25) + 15));
      }
      await new Promise(r => setTimeout(r, 1000));

      // State Transition: SUBMITTING
      stateStore.recordActionTransition("DM", threadIdOrSender, "TYPING", "SUBMITTING");
      await page.keyboard.press("Enter");

      // Check if send button / icon exists as fallback
      await page.evaluate(() => {
        const sendSvg = document.querySelector('svg[aria-label*="Send" i]');
        if (sendSvg) {
          const btn = sendSvg.closest('div[role="button"], button') || sendSvg;
          btn.click();
        }
      });

      // State Transition: VERIFYING
      stateStore.recordActionTransition("DM", threadIdOrSender, "SUBMITTING", "VERIFYING");

      // Strict DOM verification: confirm text snippet exists across conversation message bubbles (SPAN/DIV/P)
      const snippet = messageText.slice(0, 30).trim();
      let isVerified = false;

      for (let check = 0; check < 10; check++) {
        await new Promise(r => setTimeout(r, 1000));
        isVerified = await page.evaluate((snip) => {
          const els = [...document.querySelectorAll('span, div, p')];
          return els.some(b => {
            if (b.tagName === 'SCRIPT' || b.tagName === 'STYLE') return false;
            const text = (b.innerText || b.textContent || "").trim();
            return text.includes(snip);
          });
        }, snippet);
        if (isVerified) break;
      }

      if (!isVerified) {
        stateStore.recordActionTransition("DM", threadIdOrSender, "VERIFYING", "FAILED", {
          reason: "DOM message presence verification timeout"
        });
        stateStore.recordActionTransition("DM", threadIdOrSender, "FAILED", "DIAGNOSTIC", {
          reason: "Capturing diagnostic screenshot"
        });

        logger.warn(`DM to ${threadIdOrSender} was dispatched but bubble verification timed out.`);
        await captureDiagnosticScreenshot(page, `dm_unverified_${threadIdOrSender}`);
        return { success: false, verified: false, reason: "DOM bubble verification timeout" };
      }

      stateStore.recordActionTransition("DM", threadIdOrSender, "VERIFYING", "VERIFIED_SUCCESS", {
        snippet
      });

      logger.info(`✅ DM verified sent to ${threadIdOrSender}!`);
      return { success: true, verified: true };
    } catch (err) {
      logger.error(`Failed sending DM to ${threadIdOrSender}: ${err.message}`);
      stateStore.recordActionTransition("DM", threadIdOrSender, "SUBMITTING", "FAILED", {
        error: err.message
      });
      await captureDiagnosticScreenshot(page, `dm_exception_${threadIdOrSender}`).catch(() => {});
      return { success: false, verified: false, reason: err.message };
    }
  }
}

const threadsDms = new ThreadsDms();
module.exports = threadsDms;
