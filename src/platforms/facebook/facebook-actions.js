/**
 * src/platforms/facebook/facebook-actions.js
 * Atomic interaction module for Facebook comments and public engagements via CDP.
 * Implements strict rate limiting, human typing jitter, and multi-signal verification.
 */

const CONFIG = require("../../../config");
const browserManager = require("../../browser/browser-manager");
const stateStore = require("../../storage/state-store");
const rateLimiter = require("../../safety/rate-limiter");
const duplicateGuard = require("../../safety/duplicate-guard");
const logger = require("../../logging/logger");

class FacebookActions {
  /**
   * Posts a comment on a Facebook post.
   */
  async postComment(post, commentText, options = {}) {
    const isDryRun = options.dryRun !== undefined ? options.dryRun : CONFIG.DRY_RUN;
    const isApprovalMode = options.approvalMode !== undefined ? options.approvalMode : CONFIG.APPROVAL_MODE;
    const isPostingEnabled = options.postingEnabled !== undefined ? options.postingEnabled : CONFIG.POSTING_ENABLED;

    if (!commentText || !commentText.trim()) {
      logger.warn(`Cannot post empty comment on Facebook post ${post.postId}`);
      return { success: false, reason: "Empty comment text" };
    }

    // 1. Safety Checks
    const rateCheck = rateLimiter.canPerformAction("COMMENT", "facebook");
    if (!rateCheck.allowed) {
      logger.warn(`Facebook comment rate limited for ${post.postId}: ${rateCheck.reason}`);
      return { success: false, reason: `Rate limited: ${rateCheck.reason}` };
    }

    if (stateStore.hasCommented(post.postId, "facebook")) {
      logger.warn(`Duplicate Facebook comment prevented for ${post.postId}`);
      return { success: false, reason: "Duplicate post prevented" };
    }

    // 2. Dry Run / Approval Mode handling
    if (isDryRun || isApprovalMode || !isPostingEnabled) {
      const modeDesc = isDryRun ? "DRY_RUN" : (isApprovalMode ? "APPROVAL_MODE" : "SAFETY_LOCKED");
      logger.info(`[${modeDesc}] Facebook comment simulated for @${post.username} (${post.postId}): "${commentText.slice(0, 60)}..."`);
      
      stateStore.recordComment(post.postId, {
        username: post.username,
        url: post.url,
        comment: commentText,
        status: isApprovalMode ? "COMMENT_PENDING" : "COMMENTED_SIMULATED",
        platform: "facebook"
      }, "facebook");
      
      return { success: true, simulated: true, mode: modeDesc };
    }

    // 3. Live CDP Posting
    let page = null;
    try {
      page = await browserManager.getFacebookPage();

      logger.info(`Navigating to Facebook post: ${post.url || post.postId}...`);
      if (post.url) {
        await page.goto(post.url, { waitUntil: "domcontentloaded", timeout: 45000 });
        await new Promise(r => setTimeout(r, 2500));
      }

      // Locate comment input trigger or contenteditable box
      const commentInputSelector = "div[aria-label*='Write a comment' i][role='textbox'], div[aria-label*='Write a public comment' i], div[contenteditable='true'][role='textbox']";
      await page.waitForSelector(commentInputSelector, { timeout: 12000 });
      const commentInput = await page.$(commentInputSelector);

      if (!commentInput) {
        throw new Error("Could not find Facebook comment input box");
      }

      await commentInput.click();
      await new Promise(r => setTimeout(r, 500));

      // Realistic typing jitter
      logger.info(`Typing Facebook comment for @${post.username}...`);
      for (const char of commentText) {
        await page.keyboard.type(char, { delay: Math.floor(Math.random() * 40) + 40 });
      }

      await new Promise(r => setTimeout(r, 1200));

      // Press Enter to submit comment on Facebook
      logger.info("Submitting Facebook comment via Enter key...");
      await page.keyboard.press("Enter");
      await new Promise(r => setTimeout(r, 4000));

      // Verification via DOM
      const snippet = commentText.slice(0, 30).toLowerCase().replace(/[^a-z0-9]/g, "");
      const verified = await page.evaluate((snip) => {
        const comments = Array.from(document.querySelectorAll("div[dir='auto'], [role='article']"));
        return comments.some(el => {
          const t = (el.innerText || "").toLowerCase().replace(/[^a-z0-9]/g, "");
          return t.includes(snip);
        });
      }, snippet);

      if (verified) {
        logger.info(`✅ Facebook comment verified posted on @${post.username}'s post!`);
        rateLimiter.recordAction("COMMENT", "facebook");
        stateStore.recordComment(post.postId, {
          username: post.username,
          url: post.url,
          comment: commentText,
          status: "COMMENTED",
          verifiedAt: new Date().toISOString(),
          platform: "facebook"
        }, "facebook");
        return { success: true, verified: true };
      } else {
        logger.warn(`⚠️ Facebook comment submitted but not cleanly verified via DOM.`);
        rateLimiter.recordAction("COMMENT", "facebook");
        stateStore.recordComment(post.postId, {
          username: post.username,
          url: post.url,
          comment: commentText,
          status: "COMMENTED_UNVERIFIED",
          platform: "facebook"
        }, "facebook");
        return { success: true, verified: false };
      }
    } catch (err) {
      logger.error(`Failed to post Facebook comment on ${post.postId}: ${err.message}`);
      return { success: false, reason: err.message };
    }
  }
}

const facebookActions = new FacebookActions();
module.exports = {
  facebookActions,
  postFacebookComment: (post, text, opts) => facebookActions.postComment(post, text, opts)
};
