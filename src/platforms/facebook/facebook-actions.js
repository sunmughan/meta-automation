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
   * Sanitizes comment text for Facebook by replacing LinkedIn profile URLs
   * (which trigger Cloudflare reCAPTCHA preview cards) with the company website.
   */
  sanitizeForFacebook(text) {
    if (!text || typeof text !== "string") return text;
    // LinkedIn profile URLs trigger reCAPTCHA on Facebook's link preview scraper
    const knowledge = require("../../knowledge/knowledge-engine");
    const companyUrl = knowledge.getCompanyInfo().website || knowledge.getProfileLink("COMPANY", "website") || "";
    return companyUrl ? text.replace(/https?:\/\/(www\.)?linkedin\.com\/in\/[a-zA-Z0-9_-]+\/?/gi, companyUrl) : text;
  }

  /**
   * Posts a comment on a Facebook post.
   */
  async postComment(post, commentText, options = {}) {
    const isDryRun = options.dryRun !== undefined ? options.dryRun : CONFIG.DRY_RUN;
    const isApprovalMode = options.approvalMode !== undefined ? options.approvalMode : CONFIG.APPROVAL_MODE;
    const isPostingEnabled = options.postingEnabled !== undefined ? options.postingEnabled : CONFIG.POSTING_ENABLED;

    // CRITICAL: Sanitize LinkedIn URLs before posting on Facebook
    commentText = this.sanitizeForFacebook(commentText);

    if (!commentText || !commentText.trim()) {
      logger.warn(`Cannot post empty comment on Facebook post ${post.postId}`);
      return { success: false, reason: "Empty comment text" };
    }

    if (!post.url || typeof post.url !== "string" || !post.url.startsWith("http")) {
      logger.warn(`Cannot post Facebook comment on post ${post.postId}: Missing or invalid individual post URL (${post.url || "empty"})`);
      return { success: false, reason: "Missing or invalid post URL" };
    }

    // 1. Safety & Multi-Factor Deduplication Checks
    const rateCheck = rateLimiter.canPerformAction("COMMENT", "facebook");
    if (!rateCheck.allowed) {
      logger.warn(`Facebook comment rate limited for ${post.postId}: ${rateCheck.reason}`);
      return { success: false, reason: `Rate limited: ${rateCheck.reason}` };
    }

    if (stateStore.hasCommented(post.postId, "facebook", post.url, post.text)) {
      logger.warn(`Duplicate Facebook comment prevented for post ${post.postId} (URL: ${post.url})`);
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
      page = await browserManager.getFacebookPage({ bringToFront: true });
      await page.bringToFront().catch(() => {});

      const isSearchCard = post.url.includes("/search/");
      if (isSearchCard) {
        if (!page.url().includes("/search/")) {
          logger.info(`Navigating to Facebook search page: ${post.url}...`);
          await page.goto(post.url.split("#")[0], { waitUntil: "domcontentloaded", timeout: 45000 });
          await new Promise(r => setTimeout(r, 3500));
        }
      } else {
        logger.info(`Navigating to dedicated Facebook post: ${post.url}...`);
        await page.goto(post.url, { waitUntil: "domcontentloaded", timeout: 45000 });
        await new Promise(r => setTimeout(r, 3500));
      }

      // Locate comment input trigger or contenteditable box
      const commentInputSelector = "div[aria-label*='Write a comment' i][role='textbox'], div[aria-label*='Write a public comment' i], div[contenteditable='true'][role='textbox'], div[aria-label*='Comment as' i][role='textbox'], div[aria-label*='Write an answer' i][role='textbox']";
      let commentInput = await page.$(commentInputSelector);

      if (!commentInput) {
        // Try clicking a comment button on the card if comment box is collapsed
        await page.evaluate(() => {
          const btns = Array.from(document.querySelectorAll("div[role='button'], span"));
          const cBtn = btns.find(b => {
            const t = (b.innerText || "").trim().toLowerCase();
            return t === "comment" || t === "leave a comment";
          });
          if (cBtn) {
            try { cBtn.click(); } catch (e) {}
          }
        });
        await new Promise(r => setTimeout(r, 1500));
        commentInput = await page.$(commentInputSelector);
      }

      if (!commentInput) {
        throw new Error("Could not find Facebook comment input box on target post");
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
  FacebookActions,
  postComment: (post, text, opts) => facebookActions.postComment(post, text, opts),
  postFacebookComment: (post, text, opts) => facebookActions.postComment(post, text, opts)
};
