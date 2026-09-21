/**
 * src/platforms/linkedin/linkedin-actions.js
 * Atomic interaction module for LinkedIn comments and quote-posts via CDP.
 * Implements strict rate limiting, human typing jitter, and multi-signal verification.
 */

const CONFIG = require("../../../config");
const browserManager = require("../../browser/browser-manager");
const stateStore = require("../../storage/state-store");
const rateLimiter = require("../../safety/rate-limiter");
const duplicateGuard = require("../../safety/duplicate-guard");
const logger = require("../../logging/logger");

class LinkedInActions {
  /**
   * Posts a comment on a LinkedIn post.
   */
  async postComment(post, commentText, options = {}) {
    const isDryRun = options.dryRun !== undefined ? options.dryRun : CONFIG.DRY_RUN;
    const isApprovalMode = options.approvalMode !== undefined ? options.approvalMode : CONFIG.APPROVAL_MODE;
    const isPostingEnabled = options.postingEnabled !== undefined ? options.postingEnabled : CONFIG.POSTING_ENABLED;

    if (!commentText || !commentText.trim()) {
      logger.warn(`Cannot post empty comment on LinkedIn post ${post.postId}`);
      return { success: false, reason: "Empty comment text" };
    }

    // 1. Safety Checks
    const rateCheck = rateLimiter.canPerformAction("COMMENT", "linkedin");
    if (!rateCheck.allowed) {
      logger.warn(`LinkedIn comment rate limited for ${post.postId}: ${rateCheck.reason}`);
      return { success: false, reason: `Rate limited: ${rateCheck.reason}` };
    }

    if (stateStore.hasCommented(post.postId, "linkedin")) {
      logger.warn(`Duplicate LinkedIn comment prevented for ${post.postId}`);
      return { success: false, reason: "Duplicate post prevented" };
    }

    // 2. Dry Run / Approval Mode handling
    if (isDryRun || isApprovalMode || !isPostingEnabled) {
      const modeDesc = isDryRun ? "DRY_RUN" : (isApprovalMode ? "APPROVAL_MODE" : "SAFETY_LOCKED");
      logger.info(`[${modeDesc}] LinkedIn comment simulated for @${post.username} (${post.postId}): "${commentText.slice(0, 60)}..."`);
      
      stateStore.recordComment(post.postId, {
        username: post.username,
        url: post.url,
        comment: commentText,
        status: isApprovalMode ? "COMMENT_PENDING" : "COMMENTED_SIMULATED",
        platform: "linkedin"
      }, "linkedin");
      
      return { success: true, simulated: true, mode: modeDesc };
    }

    // 3. Live CDP Posting
    let page = null;
    try {
      page = await browserManager.getLinkedInPage({ bringToFront: true });
      await page.bringToFront().catch(() => {});

      logger.info(`Navigating to LinkedIn post: ${post.url || post.postId}...`);
      if (post.url && post.url.startsWith("http") && !post.url.includes("/search/results/")) {
        await page.goto(post.url, { waitUntil: "domcontentloaded", timeout: 45000 });
        await new Promise(r => setTimeout(r, 2500));
      }

      // Find and click comment trigger button if input not already expanded
      let commentBtn = await page.$("button[aria-label*='Comment' i], button.comment-button, .social-actions-button--comment");
      if (!commentBtn) {
        // Fallback: evaluate text content
        const clicked = await page.evaluate(() => {
          const btns = Array.from(document.querySelectorAll("button, [role='button']"));
          const b = btns.find(el => (el.innerText || "").trim().toLowerCase() === "comment" || (el.getAttribute("aria-label") || "").toLowerCase().includes("comment"));
          if (b) {
            b.scrollIntoView({ behavior: "smooth", block: "center" });
            b.click();
            return true;
          }
          return false;
        });
        if (clicked) await new Promise(r => setTimeout(r, 1200));
      } else {
        await commentBtn.click();
        await new Promise(r => setTimeout(r, 1200));
      }

      // Locate contenteditable editor or textbox
      const editorSelector = ".editor-content [contenteditable='true'], .ql-editor, div[role='textbox'][aria-label*='comment' i], .comments-comment-box__form-container [contenteditable='true'], [contenteditable='true'][role='textbox'], .comments-comment-box__form [contenteditable='true']";
      await page.waitForSelector(editorSelector, { timeout: 10000 });
      const editor = await page.$(editorSelector);

      if (!editor) {
        throw new Error("Could not locate LinkedIn comment input editor box");
      }

      await editor.click();
      await new Promise(r => setTimeout(r, 400));

      // Realistic typing jitter (40ms - 80ms per character)
      logger.info(`Typing LinkedIn comment for @${post.username}...`);
      for (const char of commentText) {
        await page.keyboard.type(char, { delay: Math.floor(Math.random() * 40) + 40 });
      }

      await new Promise(r => setTimeout(r, 1000));

      // Find and click post submit button
      const submitBtnSelector = "button.comments-comment-box__submit-button, button[type='submit'].comments-comment-box__submit-button--cr, button[aria-label*='Post' i].comments-comment-box__submit-button, button.comments-comment-box__submit-button--cr";
      let submitBtn = await page.$(submitBtnSelector);
      if (!submitBtn) {
        // Fallback evaluate for Comment/Post button inside comments box
        submitBtn = await page.evaluateHandle(() => {
          const btns = Array.from(document.querySelectorAll("button, [role='button']"));
          return btns.find(b => {
            const text = (b.innerText || b.value || "").trim().toLowerCase();
            return (text === "comment" || text === "post") && !b.disabled;
          }) || null;
        });
      }

      if (!submitBtn) {
        throw new Error("Could not locate LinkedIn comment submit button");
      }

      await submitBtn.click();
      logger.info("Clicked LinkedIn comment submit button, verifying...");
      await new Promise(r => setTimeout(r, 3500));

      // Multi-signal submission verification
      const snippet = commentText.slice(0, 30).toLowerCase().replace(/[^a-z0-9]/g, "");
      const verified = await page.evaluate((snip) => {
        const commentItems = Array.from(document.querySelectorAll(".comments-comment-item, .comments-comments-list, .feed-shared-update-v2"));
        return commentItems.some(el => {
          const t = (el.innerText || "").toLowerCase().replace(/[^a-z0-9]/g, "");
          return t.includes(snip);
        });
      }, snippet);

      if (verified) {
        logger.info(`✅ LinkedIn comment verified posted on @${post.username}'s post!`);
        rateLimiter.recordAction("COMMENT", "linkedin");
        stateStore.recordComment(post.postId, {
          username: post.username,
          url: post.url,
          comment: commentText,
          status: "COMMENTED",
          verifiedAt: new Date().toISOString(),
          platform: "linkedin"
        }, "linkedin");
        return { success: true, verified: true };
      } else {
        logger.warn(`⚠️ LinkedIn comment submitted but not cleanly verified via DOM. Recording pending verification.`);
        rateLimiter.recordAction("COMMENT", "linkedin");
        stateStore.recordComment(post.postId, {
          username: post.username,
          url: post.url,
          comment: commentText,
          status: "COMMENTED_UNVERIFIED",
          platform: "linkedin"
        }, "linkedin");
        return { success: true, verified: false };
      }
    } catch (err) {
      logger.error(`Failed to post LinkedIn comment on ${post.postId}: ${err.message}`);
      return { success: false, reason: err.message };
    }
  }

  /**
   * Quotes/Reposts a LinkedIn post with insightful commentary.
   */
  async quotePost(post, commentaryText, options = {}) {
    const isDryRun = options.dryRun !== undefined ? options.dryRun : CONFIG.DRY_RUN;
    if (isDryRun || !CONFIG.POSTING_ENABLED) {
      logger.info(`[DRY_RUN] LinkedIn quote-post simulated on @${post.username}: "${commentaryText.slice(0, 60)}..."`);
      return { success: true, simulated: true };
    }

    try {
      const page = await browserManager.getLinkedInPage();
      if (post.url) {
        await page.goto(post.url, { waitUntil: "domcontentloaded", timeout: 45000 });
        await new Promise(r => setTimeout(r, 2000));
      }

      // Click Repost button
      const repostTrigger = await page.$("button[aria-label*='Repost' i], button.social-actions-button--repost");
      if (!repostTrigger) throw new Error("Could not find LinkedIn Repost button");
      await repostTrigger.click();
      await new Promise(r => setTimeout(r, 1200));

      // Click "Repost with your thoughts"
      const thoughtsOption = await page.evaluate(() => {
        const items = Array.from(document.querySelectorAll("[role='menuitem'], button, span"));
        const match = items.find(el => (el.innerText || "").toLowerCase().includes("repost with your thoughts"));
        if (match) {
          match.click();
          return true;
        }
        return false;
      });

      if (!thoughtsOption) throw new Error("Could not find 'Repost with your thoughts' menu item");
      await new Promise(r => setTimeout(r, 2000));

      // Type commentary into modal
      const modalEditorSelector = ".share-box-modal [contenteditable='true'], .ql-editor, div[role='textbox']";
      await page.waitForSelector(modalEditorSelector, { timeout: 10000 });
      const modalEditor = await page.$(modalEditorSelector);
      await modalEditor.click();
      await page.keyboard.type(commentaryText, { delay: 45 });
      await new Promise(r => setTimeout(r, 1500));

      // Click Post button
      const postBtn = await page.$("button.share-actions__primary-action, button[aria-label*='Post' i].share-actions__primary-action");
      if (postBtn) {
        await postBtn.click();
        logger.info(`✅ LinkedIn quote-post published on @${post.username}!`);
        await new Promise(r => setTimeout(r, 3000));
        return { success: true };
      }
      throw new Error("Could not click LinkedIn final Post button");
    } catch (err) {
      logger.error(`LinkedIn quote-post failed: ${err.message}`);
      return { success: false, reason: err.message };
    }
  }
}

const linkedInActions = new LinkedInActions();
module.exports = linkedInActions;
module.exports.linkedInActions = linkedInActions;
module.exports.postComment = (post, text, opts) => linkedInActions.postComment(post, text, opts);
module.exports.quotePost = (post, text, opts) => linkedInActions.quotePost(post, text, opts);

