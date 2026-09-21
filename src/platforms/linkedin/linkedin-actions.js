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

      logger.info(`Processing LinkedIn post engagement: ${post.url || post.postId}...`);
      
      // Determine if we have a direct standalone post URL or if we need to navigate to search results
      const hasDirectPostUrl = Boolean(post.url && post.url.startsWith("http") && !post.url.includes("/search/"));
      if (hasDirectPostUrl) {
        logger.info(`Navigating directly to LinkedIn standalone post: ${post.url}...`);
        await page.goto(post.url, { waitUntil: "domcontentloaded", timeout: 45000 });
        await new Promise(r => setTimeout(r, 3000));
      } else {
        // Post discovered via search: ensure we are on the search results page
        const searchUrl = post.url && post.url.includes("/search/")
          ? post.url
          : `https://www.linkedin.com/search/results/content/?keywords=${encodeURIComponent(post.query || "looking for a web developer")}&sortBy=%22date_posted%22`;
        
        if (!page.url().includes("/search/results/content/")) {
          logger.info(`Navigating to LinkedIn search page for post context: ${searchUrl}...`);
          await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
          await new Promise(r => setTimeout(r, 3500));
        }
      }

      // Locate the specific card on the page (matching text snippet or author)
      const postSnippet = (post.text || "").slice(0, 40).toLowerCase().replace(/[^a-z0-9]/g, "");
      const cardHandle = await page.evaluateHandle((targetSnippet) => {
        const cards = Array.from(document.querySelectorAll("div[role='listitem'][componentkey*='update-card'], .feed-shared-update-v2, [data-view-name='feed-full-update']"));
        if (!cards.length) return document.body;
        if (!targetSnippet) return cards[0];
        const match = cards.find(c => {
          const t = (c.innerText || "").toLowerCase().replace(/[^a-z0-9]/g, "");
          return t.includes(targetSnippet);
        });
        return match || cards[0];
      }, postSnippet);

      // Scroll the Comment button of this card directly into center view
      await page.evaluate((card) => {
        const container = card || document;
        const btn = Array.from(container.querySelectorAll("button")).find(b => {
          const t = (b.innerText || "").trim().toLowerCase();
          return t === "comment" && !b.getAttribute("aria-label")?.includes("reaction");
        });
        if (btn) btn.scrollIntoView({ behavior: "instant", block: "center" });
      }, cardHandle);
      await new Promise(r => setTimeout(r, 1000));

      // Click comment trigger button if input not already expanded
      const btnCoords = await page.evaluate((card) => {
        const container = card || document;
        const btn = Array.from(container.querySelectorAll("button")).find(b => {
          const t = (b.innerText || "").trim().toLowerCase();
          return t === "comment" && !b.getAttribute("aria-label")?.includes("reaction");
        });
        if (!btn) return null;
        const r = btn.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2, top: r.top };
      }, cardHandle);

      if (btnCoords && btnCoords.y > 0 && btnCoords.y < 800) {
        await page.mouse.click(btnCoords.x, btnCoords.y);
        await new Promise(r => setTimeout(r, 1200));
      } else {
        await page.evaluate((card) => {
          const container = card || document;
          const btn = Array.from(container.querySelectorAll("button")).find(b => {
            const t = (b.innerText || "").trim().toLowerCase();
            return t === "comment" && !b.getAttribute("aria-label")?.includes("reaction");
          });
          if (btn) btn.click();
        }, cardHandle);
        await new Promise(r => setTimeout(r, 1200));
      }

      // Locate contenteditable editor or textbox
      const editorSelector = "div[role='textbox'][contenteditable='true'][aria-label*='comment' i], .editor-content [contenteditable='true'], .comments-comment-box__form-container [contenteditable='true'], [contenteditable='true'][role='textbox'], .comments-comment-box__form [contenteditable='true']";
      await page.waitForSelector(editorSelector, { timeout: 10000 });
      
      const edCoords = await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.left + 25, y: r.top + 20 };
      }, editorSelector);

      if (edCoords && edCoords.y > 0 && edCoords.y < 800) {
        await page.mouse.click(edCoords.x, edCoords.y);
      } else {
        const editor = await page.$(editorSelector);
        if (editor) await editor.click();
      }
      await new Promise(r => setTimeout(r, 400));

      // Realistic typing jitter (40ms - 80ms per character)
      logger.info(`Typing LinkedIn comment for @${post.username}...`);
      for (const char of commentText) {
        await page.keyboard.type(char, { delay: Math.floor(Math.random() * 40) + 40 });
      }

      await new Promise(r => setTimeout(r, 1200));

      // Find and click post submit button inside editor container
      const submitSuccess = await page.evaluate(() => {
        const editor = document.querySelector("div[role='textbox'][contenteditable='true'][aria-label*='comment' i], .editor-content [contenteditable='true']");
        if (!editor) return false;
        
        let p = editor;
        for (let i = 0; i < 15 && p; i++) {
          p = p.parentElement;
          if (!p) break;
          const btn = Array.from(p.querySelectorAll("button")).find(b => {
            const text = (b.innerText || b.value || "").trim().toLowerCase();
            return (text === "comment" || text === "post") && !b.disabled && !b.getAttribute("aria-label")?.includes("reaction");
          });
          if (btn) {
            btn.scrollIntoView({ behavior: "instant", block: "center" });
            btn.click();
            return true;
          }
        }
        // Fallback selector
        const submitBtnSelector = "button.comments-comment-box__submit-button, button[type='submit'].comments-comment-box__submit-button--cr, button[aria-label*='Post' i].comments-comment-box__submit-button";
        const fb = document.querySelector(submitBtnSelector);
        if (fb && !fb.disabled) {
          fb.click();
          return true;
        }
        return false;
      });

      if (!submitSuccess) {
        throw new Error("Could not locate or click LinkedIn active comment submit button");
      }

      logger.info("Clicked LinkedIn comment submit button, verifying...");
      await new Promise(r => setTimeout(r, 4000));

      // Multi-signal submission verification
      const snippet = commentText.slice(0, 30).toLowerCase().replace(/[^a-z0-9]/g, "");
      const verified = await page.evaluate((snip) => {
        const commentItems = Array.from(document.querySelectorAll(".comments-comment-item, .comments-comments-list, .feed-shared-update-v2, div[role='listitem']"));
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
module.exports.LinkedInActions = LinkedInActions;

