/**
 * src/platforms/linkedin/linkedin-activity.js
 * Comprehensive LinkedIn Inbound Engagement Engine.
 * 
 * Features:
 * 1. Connection Requests: Automatically accepts profile connection requests, ignores page/group invites.
 * 2. Inbound Messaging: Monitors unread direct messages, checks context, and sends grounded AI responses.
 * 3. Inbound Notifications: Checks replies to our posts and comments, generating threaded responses.
 */

const crypto = require("crypto");
const CONFIG = require("../../../config");
const browserManager = require("../../browser/browser-manager");
const stateStore = require("../../storage/state-store");
const aiDecisionEngine = require("../../ai/ai-decision-engine");
const knowledge = require("../../knowledge/knowledge-engine");
const duplicateGuard = require("../../safety/duplicate-guard");
const logger = require("../../logging/logger");

class LinkedInActivityWatcher {
  /**
   * Hashes text for unique reply tracking.
   */
  hashItem(username, text, type = "li_msg") {
    const clean = String(text || "").trim().toLowerCase();
    const hash = crypto.createHash("md5").update(`${username}_${clean}`).digest("hex").slice(0, 10);
    return `${type}_${username}_${hash}`;
  }

  /**
   * 1. Monitors and accepts incoming Profile Connection Requests.
   * Filters out page follows, group invitations, and event invites.
   */
  async checkConnectionRequests(options = {}) {
    logger.info("[LINKEDIN NETWORK] Checking incoming connection requests...", { action: "LINKEDIN_INVITES_CHECK" });

    let page = null;
    try {
      page = await browserManager.getLinkedInPage({ bringToFront: true });
      await page.bringToFront().catch(() => {});

      const networkUrl = "https://www.linkedin.com/mynetwork/grow/";
      await page.goto(networkUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
      await new Promise(r => setTimeout(r, 3000));

      const acceptedCount = await page.evaluate(() => {
        // Locate invitation list cards
        const inviteCards = Array.from(document.querySelectorAll(".invitation-card, [data-view-name*='invitation'], li[class*='invitation']"));
        let accepted = 0;

        for (const card of inviteCards) {
          const text = (card.innerText || "").toLowerCase();
          
          // Check if this is a Page follow or Event or Group invite - REJECT / SKIP
          const isPageOrGroup = text.includes("invited you to follow") || 
                                text.includes("invited you to join") || 
                                text.includes("invited you to attend") ||
                                text.includes("newsletter") ||
                                text.includes("company");

          const acceptBtn = card.querySelector("button[aria-label*='Accept' i], button.artdeco-button--secondary[aria-label*='accept' i], button:not([disabled])");
          const btnText = acceptBtn ? (acceptBtn.innerText || "").trim().toLowerCase() : "";

          if (isPageOrGroup) {
            // Reject page/group invites if reject button exists
            const ignoreBtn = card.querySelector("button[aria-label*='Ignore' i], button[aria-label*='Withdraw' i]");
            if (ignoreBtn) {
              try { ignoreBtn.click(); } catch (e) {}
            }
            continue;
          }

          // Individual Profile connection request: must have link to /in/
          const profileLink = card.querySelector("a[href*='/in/']");
          if (profileLink && (btnText === "accept" || acceptBtn?.getAttribute("aria-label")?.toLowerCase()?.includes("accept"))) {
            try {
              acceptBtn.click();
              accepted++;
            } catch (e) {}
          }
        }
        return accepted;
      });

      if (acceptedCount > 0) {
        logger.info(`✅ Accepted ${acceptedCount} incoming LinkedIn profile connection requests!`, {
          action: "LINKEDIN_INVITES_ACCEPTED",
          count: acceptedCount
        });
        stateStore.state.stats.total_actions = (stateStore.state.stats.total_actions || 0) + acceptedCount;
        stateStore.saveState();
      } else {
        logger.info("[LINKEDIN NETWORK] No pending profile connection requests to accept.");
      }

      return { acceptedCount };
    } catch (err) {
      logger.warn(`[LINKEDIN NETWORK] Error checking connection requests: ${err.message}`);
      return { acceptedCount: 0, error: err.message };
    }
  }

  /**
   * 2. Monitors incoming direct messages on LinkedIn and responds to prospects.
   * Only responds to new inbound messages from the other user.
   */
  async checkMessages(options = {}) {
    logger.info("[LINKEDIN MESSAGES] Checking unread direct messages on LinkedIn...", { action: "LINKEDIN_DM_SCAN" });

    let page = null;
    try {
      page = await browserManager.getLinkedInPage({ bringToFront: true });
      await page.bringToFront().catch(() => {});

      const messagingUrl = "https://www.linkedin.com/messaging/";
      if (!page.url().includes("/messaging")) {
        await page.goto(messagingUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
        await new Promise(r => setTimeout(r, 3500));
      }

      // Check for unread conversations or top conversation
      const conversationList = await page.evaluate(() => {
        const items = Array.from(document.querySelectorAll(".msg-conversation-listitem, .msg-conversation-card, [data-view-name*='conversation']"));
        return items.slice(0, 5).map(item => {
          const text = (item.innerText || "").trim();
          const unread = Boolean(item.querySelector(".msg-conversation-card__unread-count, [class*='unread'], .notification-badge"));
          const nameEl = item.querySelector(".msg-conversation-listitem__participant-names, h3, [class*='participant']");
          const username = nameEl ? nameEl.innerText.trim().replace(/[\r\n]+/g, " ") : "prospect";
          return { username, text: text.slice(0, 200), unread };
        });
      });

      logger.info(`[LINKEDIN MESSAGES] Found ${conversationList.length} conversations (${conversationList.filter(c => c.unread).length} unread).`);

      let processedCount = 0;
      for (let idx = 0; idx < conversationList.length; idx++) {
        const conv = conversationList[idx];
        if (!conv.unread && idx > 0) continue; // Prioritize unread or top conversation

        // Click into the conversation
        const opened = await page.evaluate((targetIdx) => {
          const items = Array.from(document.querySelectorAll(".msg-conversation-listitem, .msg-conversation-card, [data-view-name*='conversation']"));
          if (items[targetIdx]) {
            items[targetIdx].click();
            return true;
          }
          return false;
        }, idx);

        if (!opened) continue;
        await new Promise(r => setTimeout(r, 2000));

        // Inspect messages in active conversation
        const messageData = await page.evaluate(() => {
          const bubbleNodes = Array.from(document.querySelectorAll(".msg-s-event-listitem__body, .msg-s-message-group__bubble, [data-view-name*='message']"));
          if (!bubbleNodes.length) return null;

          const lastBubble = bubbleNodes[bubbleNodes.length - 1];
          const lastText = (lastBubble.innerText || "").trim();

          // Check if last message was sent by us
          const isFromSelf = Boolean(lastBubble.closest(".msg-s-message-group--from-self, [class*='from-self']"));

          return {
            lastText,
            isFromSelf,
            totalMessages: bubbleNodes.length
          };
        });

        if (!messageData || messageData.isFromSelf) {
          logger.info(`[LINKEDIN MESSAGES] Skipping @${conv.username}: Last message was sent by us or awaiting reply.`);
          continue;
        }

        if (messageData.lastText.length < 3) continue;

        const convId = this.hashItem(conv.username, messageData.lastText, "li_dm");
        const dupCheck = duplicateGuard.canExecute({
          platform: "linkedin",
          actionType: "DM",
          targetId: convId,
          text: messageData.lastText
        });

        if (!dupCheck.allowed) {
          logger.info(`[LINKEDIN MESSAGES] Skipping @${conv.username}: Already responded to this message.`);
          continue;
        }

        // Generate grounded AI response
        logger.info(`[LINKEDIN MESSAGES] Generating tailored response for @${conv.username}: "${messageData.lastText.slice(0, 60)}..."`);
        const aiResponse = await aiDecisionEngine.handleInboundReply({
          username: conv.username,
          text: messageData.lastText,
          platform: "linkedin",
          replyToText: "LinkedIn Direct Message"
        });

        const company = knowledge.getCompanyInfo();
        const companyName = company.name || "our team";
        const companyWebsite = company.website || knowledge.getProfileLink("COMPANY", "website") || "";
        const replyMessage = aiResponse.response_message || 
          (companyWebsite
            ? `Hi ${conv.username.split(" ")[0] || ""}, thanks for reaching out! At ${companyName}, we specialize in high-performance web applications, custom SaaS, and AI automation. Feel free to explore our work at ${companyWebsite}.`
            : `Hi ${conv.username.split(" ")[0] || ""}, thanks for reaching out! Great to connect with you.`);

        // Type and send reply
        const editorSelector = ".msg-form__contenteditable[contenteditable='true'], div[role='textbox'][aria-label*='message' i], .msg-form__message-texteditor [contenteditable='true']";
        const editor = await page.$(editorSelector);

        if (editor) {
          await editor.click();
          await new Promise(r => setTimeout(r, 400));

          logger.info(`[LINKEDIN MESSAGES] Typing response for @${conv.username}...`);
          for (const char of replyMessage) {
            await page.keyboard.type(char, { delay: Math.floor(Math.random() * 30) + 25 });
          }
          await new Promise(r => setTimeout(r, 1000));

          // Click Send button
          const sendBtnSelector = "button.msg-form__send-button, button[type='submit'].msg-form__send-btn";
          const sendBtn = await page.$(sendBtnSelector);
          if (sendBtn) {
            await sendBtn.click();
            await new Promise(r => setTimeout(r, 2000));
            duplicateGuard.recordExecuted({
              platform: "linkedin",
              actionType: "DM",
              targetId: convId,
              text: replyMessage,
              username: conv.username
            });
            logger.info(`✅ Sent live LinkedIn message response to @${conv.username}!`);
            processedCount++;
          }
        }
      }

      return { processedCount };
    } catch (err) {
      logger.warn(`[LINKEDIN MESSAGES] Error checking direct messages: ${err.message}`);
      return { processedCount: 0, error: err.message };
    }
  }

  /**
   * 3. Checks LinkedIn Notifications for replies to our posts and comments.
   * Continues the conversation with grounded AI responses.
   */
  async checkNotifications(options = {}) {
    logger.info("[LINKEDIN NOTIFICATIONS] Checking replies to our posts and comments...", { action: "LINKEDIN_NOTIFS_CHECK" });

    let page = null;
    try {
      page = await browserManager.getLinkedInPage({ bringToFront: true });
      await page.bringToFront().catch(() => {});

      const notifsUrl = "https://www.linkedin.com/notifications/";
      await page.goto(notifsUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
      await new Promise(r => setTimeout(r, 3000));

      const notifications = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll("article, [data-view-name*='notification'], div[role='article']"));
        const results = [];

        for (const row of rows) {
          const text = (row.innerText || "").trim();
          // Find notifications indicating someone replied or commented
          if (/replied to your comment|commented on your post|mentioned you in a comment/i.test(text)) {
            const link = row.querySelector("a[href*='/feed/update/'], a[href*='/posts/'], a[href*='activity']");
            const url = link ? link.href : "";
            const authorMatch = text.match(/^([^\n]+)/);
            const username = authorMatch ? authorMatch[1].trim() : "linkedin_user";
            results.push({ username, text: text.slice(0, 200), url });
          }
        }
        return results;
      });

      logger.info(`[LINKEDIN NOTIFICATIONS] Found ${notifications.length} relevant comment reply notifications.`);

      let repliesSent = 0;
      for (const notif of notifications.slice(0, 3)) {
        if (!notif.url) continue;

        const notifId = this.hashItem(notif.username, notif.text, "li_notif");
        const dupCheck = duplicateGuard.canExecute({
          platform: "linkedin",
          actionType: "REPLY",
          targetId: notifId,
          text: notif.text
        });

        if (!dupCheck.allowed) continue;

        logger.info(`[LINKEDIN NOTIFICATIONS] Opening post from notification for @${notif.username}...`);
        await page.goto(notif.url, { waitUntil: "domcontentloaded", timeout: 45000 });
        await new Promise(r => setTimeout(r, 3500));

        // Generate tailored contextual AI response
        const aiResponse = await aiDecisionEngine.handleInboundReply({
          username: notif.username,
          text: notif.text,
          platform: "linkedin",
          replyToText: "LinkedIn post comment"
        });

        const notifWebsite = knowledge.getCompanyInfo().website || knowledge.getProfileLink("COMPANY", "website") || "";
        const replyMessage = aiResponse.response_message ||
          (notifWebsite
            ? `@${notif.username} Appreciate your thoughts and perspective on this! Feel free to connect or learn more at ${notifWebsite}.`
            : `@${notif.username} Appreciate your thoughts and perspective on this!`);

        // Locate comment / reply box
        const editorSelector = ".comments-comment-box__form [contenteditable='true'], div[role='textbox'][aria-label*='comment' i], .ql-editor";
        const editor = await page.$(editorSelector);

        if (editor) {
          await editor.click();
          await new Promise(r => setTimeout(r, 500));

          logger.info(`[LINKEDIN NOTIFICATIONS] Typing reply to @${notif.username}...`);
          for (const char of replyMessage) {
            await page.keyboard.type(char, { delay: Math.floor(Math.random() * 30) + 20 });
          }
          await new Promise(r => setTimeout(r, 1000));

          // Click Post / Submit
          const submitBtn = await page.$("button.comments-comment-box__submit-button, button[type='submit'].comments-comment-box__submit-btn");
          if (submitBtn) {
            await submitBtn.click();
            await new Promise(r => setTimeout(r, 3000));
            duplicateGuard.recordExecuted({
              platform: "linkedin",
              actionType: "REPLY",
              targetId: notifId,
              text: replyMessage,
              username: notif.username
            });
            logger.info(`✅ Live LinkedIn reply sent to @${notif.username}!`);
            repliesSent++;
          }
        }
      }

      return { notificationsCount: notifications.length, repliesSent };
    } catch (err) {
      logger.warn(`[LINKEDIN NOTIFICATIONS] Error checking notifications: ${err.message}`);
      return { notificationsCount: 0, repliesSent: 0, error: err.message };
    }
  }
}

const linkedInActivityWatcher = new LinkedInActivityWatcher();

module.exports = {
  linkedInActivityWatcher,
  checkLinkedInConnectionRequests: (opts) => linkedInActivityWatcher.checkConnectionRequests(opts),
  checkLinkedInMessages: (opts) => linkedInActivityWatcher.checkMessages(opts),
  checkLinkedInNotifications: (opts) => linkedInActivityWatcher.checkNotifications(opts)
};
