/**
 * src/platforms/facebook/facebook-activity.js
 * Comprehensive Facebook Inbound Activity & Engagement Watcher.
 * 
 * Features:
 * 1. Facebook Notifications: Monitors replies to our posts and comments, responding back with user tags.
 * 2. Facebook Messenger: Monitors unread direct messages from prospects, responding with grounded AI.
 */

const crypto = require("crypto");
const CONFIG = require("../../../config");
const browserManager = require("../../browser/browser-manager");
const stateStore = require("../../storage/state-store");
const aiDecisionEngine = require("../../ai/ai-decision-engine");
const knowledge = require("../../knowledge/knowledge-engine");
const duplicateGuard = require("../../safety/duplicate-guard");
const logger = require("../../logging/logger");
const BrowserOperator = require("../../browser/browser-operator");
const telemetry = require("../../telemetry/action-telemetry");
const { verifyTextPresence } = require("../../agent/action-verifier");

class FacebookActivityWatcher {
  hashItem(username, text, type = "fb_activity") {
    const clean = String(text || "").trim().toLowerCase();
    const hash = crypto.createHash("md5").update(`${username}_${clean}`).digest("hex").slice(0, 10);
    return `${type}_${username}_${hash}`;
  }

  /**
   * 1. Checks Facebook Notifications for comments or replies on our posts.
   * Continues the conversation with tagged, grounded replies.
   */
  async checkNotifications(options = {}) {
    logger.info("[FACEBOOK NOTIFICATIONS] Checking replies and inbound comments on Facebook...", { action: "FB_NOTIFS_CHECK" });

    let page = null;
    try {
      page = await browserManager.getFacebookPage({ bringToFront: true });
      await page.bringToFront().catch(() => {});

      const notifsUrl = "https://www.facebook.com/notifications";
      await page.goto(notifsUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
      await new Promise(r => setTimeout(r, 3500));

      // Extract unread or recent comment notifications
      const notifications = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll("div[role='row'], div[role='article'], a[href*='notif']"));
        const results = [];

        for (const row of rows) {
          const text = (row.innerText || "").trim();
          if (/commented on your|replied to your comment|mentioned you/i.test(text)) {
            const link = row.querySelector("a[href*='facebook.com'], a[href*='story.php'], a[href*='permalink']");
            const url = link ? link.href : "";
            const authorMatch = text.match(/^([^\n]+)/);
            const username = authorMatch ? authorMatch[1].trim() : "facebook_user";
            results.push({ username, text: text.slice(0, 200), url });
          }
        }
        return results;
      });

      logger.info(`[FACEBOOK NOTIFICATIONS] Found ${notifications.length} relevant inbound comment notifications.`);

      let repliesSent = 0;
      for (const notif of notifications.slice(0, 3)) {
        if (!notif.url) continue;

        const notifId = this.hashItem(notif.username, notif.text, "fb_notif");
        const dupCheck = duplicateGuard.canExecute({
          platform: "facebook",
          actionType: "REPLY",
          targetId: notifId,
          text: notif.text
        });

        if (!dupCheck.allowed) continue;

        logger.info(`[FACEBOOK NOTIFICATIONS] Inspecting comment from @${notif.username}...`);
        await page.goto(notif.url, { waitUntil: "domcontentloaded", timeout: 45000 });
        await new Promise(r => setTimeout(r, 3000));

        // Generate tailored response
        const aiResponse = await aiDecisionEngine.handleInboundReply({
          username: notif.username,
          text: notif.text,
          platform: "facebook",
          replyToText: "Facebook post comment"
        });

        const companyWebsite = knowledge.getCompanyInfo().website || knowledge.getProfileLink("COMPANY", "website") || "";
        const replyMessage = aiResponse.response_message ||
          (companyWebsite ? `@${notif.username} Thanks for connecting! Feel free to check out our work at ${companyWebsite}.` : `@${notif.username} Thanks for connecting! Great to be in touch.`);

        // Locate comment box
        const commentInputSelector = "div[aria-label*='Write a comment' i][role='textbox'], div[aria-label*='Write a reply' i][role='textbox'], div[contenteditable='true'][role='textbox']";
        const commentInput = await page.$(commentInputSelector);

        if (commentInput) {
          await commentInput.click();
          await new Promise(r => setTimeout(r, 500));

          logger.info(`[FACEBOOK NOTIFICATIONS] Typing reply to @${notif.username}...`);
          for (const char of replyMessage) {
            await page.keyboard.type(char, { delay: Math.floor(Math.random() * 30) + 25 });
          }
          await new Promise(r => setTimeout(r, 1000));

          await page.keyboard.press("Enter");
          await new Promise(r => setTimeout(r, 3000));

          duplicateGuard.recordExecuted({
            platform: "facebook",
            actionType: "REPLY",
            targetId: notifId,
            text: replyMessage,
            username: notif.username
          });

          logger.info(`✅ Sent live Facebook reply to @${notif.username}!`);
          repliesSent++;
        }
      }

      return { processedCount: repliesSent };
    } catch (err) {
      logger.warn(`[FACEBOOK NOTIFICATIONS] Error checking notifications: ${err.message}`);
      return { processedCount: 0, error: err.message };
    }
  }

  /**
   * 2. Checks Facebook Messenger for unread incoming DMs.
   * Only responds to new messages from prospects (never self-sent).
   */
  async checkMessages(options = {}) {
    logger.info("[FACEBOOK MESSENGER] Checking unread direct messages...", { action: "FB_DM_SCAN" });

    let page = null;
    try {
      page = await browserManager.getFacebookPage({ bringToFront: true });
      await page.bringToFront().catch(() => {});

      const messagesUrl = "https://www.facebook.com/messages/t/";
      if (!page.url().includes("/messages/")) {
        await page.goto(messagesUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
        await new Promise(r => setTimeout(r, 3500));
      }

      // Check conversation list
      const conversations = await page.evaluate(() => {
        const items = Array.from(document.querySelectorAll("[data-testid*='mwthreadlist_item'], [role='row'], [role='listitem']"));
        return items.slice(0, 5).map(item => {
          const text = (item.innerText || "").trim();
          const unread = Boolean(item.querySelector("[aria-label*='unread' i], [class*='unread']"));
          const nameEl = item.querySelector("span[dir='auto']");
          const username = nameEl ? nameEl.innerText.trim() : "prospect";
          return { username, text: text.slice(0, 200), unread };
        });
      });

      const unread = conversations.filter(c => c.unread);
      logger.info(`[FACEBOOK MESSENGER] Found ${conversations.length} conversations (${unread.length} unread).`);

      let processedCount = 0;
      for (const conv of unread.slice(0, 5)) {
        try {
          const items = await page.$x ? [] : [];
          const opened = await page.evaluate((targetText) => {
            const candidates = [...document.querySelectorAll("[data-testid*='mwthreadlist_item'], [role='row'], [role='listitem']")];
            const target = candidates.find(el => (el.innerText || "").includes(targetText));
            if (!target) return false;
            target.click();
            return true;
          }, conv.username);

          if (!opened) {
            telemetry.record({type:"ACTION_FAILED",platform:"facebook",action:"DM_OPEN",targetId:conv.username,error:"Conversation row not found"});
            continue;
          }
          await new Promise(r => setTimeout(r, 1800));

          const messageData = await page.evaluate(() => {
            const bubbles = [...document.querySelectorAll("[data-testid*='message'], [role='row'], div[dir='auto']")];
            const texts = bubbles.map(x => (x.innerText || "").trim()).filter(Boolean);
            const last = texts[texts.length - 1] || "";
            return { lastText:last, body:(document.body.innerText||"").slice(-8000) };
          });
          if (!messageData.lastText || messageData.lastText.length < 3) continue;

          const aiResponse = await aiDecisionEngine.handleInboundReply({
            username: conv.username,
            text: messageData.lastText,
            platform: "facebook",
            replyToText: "Facebook Messenger"
          });
          const replyMessage = aiResponse.response_message;
          if (!replyMessage) continue;

          if (CONFIG.APPROVAL_MODE || CONFIG.DRY_RUN || !CONFIG.POSTING_ENABLED) {
            telemetry.record({type:"ACTION_SIMULATED",platform:"facebook",action:"DM_SEND",targetId:conv.username});
            continue;
          }

          const operator = new BrowserOperator(page);
          const editor = await operator.findVisible({aria:"message", selector:"div[contenteditable='true'][role='textbox']"}, 12000);
          if (!editor) {
            telemetry.record({type:"ACTION_FAILED",platform:"facebook",action:"DM_SEND",targetId:conv.username,error:"Messenger composer not found"});
            continue;
          }
          await operator.typeInto({selector:"div[contenteditable='true'][role='textbox']"}, replyMessage);
          const sendCandidates = ["Send","send"];
          let sent = false;
          for (const label of sendCandidates) {
            try { await operator.visibleClick({aria:label,text:label},{timeout:3000}); sent=true; break; } catch(e) {}
          }
          if (!sent) {
            await page.keyboard.press("Enter");
          }
          const verification = await verifyTextPresence(page, replyMessage, {platform:"facebook",action:"DM_SEND",targetId:conv.username,timeout:12000});
          if (verification.verified) processedCount++;
        } catch (e) {
          telemetry.record({type:"ACTION_FAILED",platform:"facebook",action:"DM_SEND",targetId:conv.username,error:e.message});
        }
      }
      return { conversationCount: conversations.length, unreadCount: unread.length, processedCount };
    } catch (err) {
      logger.warn(`[FACEBOOK MESSENGER] Error checking messages: ${err.message}`);
      return { conversationCount: 0, error: err.message };
    }
  }
}

const facebookActivityWatcher = new FacebookActivityWatcher();

module.exports = {
  facebookActivityWatcher,
  checkFacebookNotifications: (opts) => facebookActivityWatcher.checkNotifications(opts),
  checkFacebookMessages: (opts) => facebookActivityWatcher.checkMessages(opts)
};
