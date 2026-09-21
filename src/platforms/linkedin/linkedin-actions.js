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
   * Sanitizes comment text for LinkedIn by replacing linkedin.com/in/* profile URLs
   * (which trigger Cloudflare reCAPTCHA preview cards) with the company website.
   */
  sanitizeForLinkedIn(text) {
    if (!text || typeof text !== "string") return text;
    // LinkedIn profile URLs in comments trigger reCAPTCHA preview cards
    const knowledge = require("../../knowledge/knowledge-engine");
    const companyUrl = knowledge.getCompanyInfo().website || knowledge.getProfileLink("COMPANY", "website") || "";
    return companyUrl ? text.replace(/https?:\/\/(www\.)?linkedin\.com\/in\/[a-zA-Z0-9_-]+\/?/gi, companyUrl) : text;
  }

  /**
   * Posts a comment on a LinkedIn post.
   */
  async postComment(post, commentText, options = {}) {
    const isDryRun = options.dryRun !== undefined ? options.dryRun : CONFIG.DRY_RUN;
    const isApprovalMode = options.approvalMode !== undefined ? options.approvalMode : CONFIG.APPROVAL_MODE;
    const isPostingEnabled = options.postingEnabled !== undefined ? options.postingEnabled : CONFIG.POSTING_ENABLED;

    // CRITICAL: Sanitize LinkedIn profile URLs to prevent reCAPTCHA preview cards
    commentText = this.sanitizeForLinkedIn(commentText);

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

      // 1. Check if comment editor is already expanded on this card
      const isAlreadyExpanded = await page.evaluate((card) => {
        const c = card || document;
        const ed = c.querySelector("div[role='textbox'][contenteditable='true'], .comments-comment-box__form [contenteditable='true']");
        return Boolean(ed && ed.offsetParent !== null);
      }, cardHandle);

      if (!isAlreadyExpanded) {
        // Locate Comment action button in the social action bar of the card (ignore all dropdown options)
        const btnCoords = await page.evaluate((card) => {
          const c = card || document;
          const socialBar = c.querySelector(".feed-shared-social-actions, .feed-shared-social-action-bar, [data-view-name*='social-actions']") || c;
          const btn = Array.from(socialBar.querySelectorAll("button")).find(b => {
            const t = (b.innerText || "").trim().toLowerCase();
            const label = (b.getAttribute("aria-label") || "").toLowerCase();
            if (label.includes("option") || label.includes("action") || label.includes("menu") || b.classList.contains("artdeco-dropdown__trigger")) return false;
            return t === "comment" || (label.includes("comment") && !label.includes("reaction") && !label.includes("reply"));
          });
          if (!btn) return null;
          btn.scrollIntoView({ behavior: "instant", block: "center" });
          const r = btn.getBoundingClientRect();
          return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        }, cardHandle);

        if (btnCoords && btnCoords.y > 0 && btnCoords.y < 900) {
          await page.mouse.click(btnCoords.x, btnCoords.y);
          await new Promise(r => setTimeout(r, 1200));
        } else {
          await page.evaluate((card) => {
            const c = card || document;
            const socialBar = c.querySelector(".feed-shared-social-actions, .feed-shared-social-action-bar, [data-view-name*='social-actions']") || c;
            const btn = Array.from(socialBar.querySelectorAll("button")).find(b => {
              const t = (b.innerText || "").trim().toLowerCase();
              const label = (b.getAttribute("aria-label") || "").toLowerCase();
              if (label.includes("option") || label.includes("action") || label.includes("menu") || b.classList.contains("artdeco-dropdown__trigger")) return false;
              return t === "comment" || (label.includes("comment") && !label.includes("reaction") && !label.includes("reply"));
            });
            if (btn) btn.click();
          }, cardHandle);
          await new Promise(r => setTimeout(r, 1200));
        }
      }

      // 2. Wait for contenteditable editor specifically on this card
      await page.waitForFunction((card) => {
        const c = card || document;
        return Boolean(c.querySelector("div[role='textbox'][contenteditable='true'], .comments-comment-box__form [contenteditable='true'], [contenteditable='true'][role='textbox']"));
      }, { timeout: 12000 }, cardHandle);

      // Focus and click inside the editor on this card
      const edCoords = await page.evaluate((card) => {
        const c = card || document;
        const el = c.querySelector("div[role='textbox'][contenteditable='true'], .comments-comment-box__form [contenteditable='true'], [contenteditable='true'][role='textbox']");
        if (!el) return null;
        el.scrollIntoView({ behavior: "instant", block: "center" });
        const r = el.getBoundingClientRect();
        return { x: r.left + 35, y: r.top + 20 };
      }, cardHandle);

      if (edCoords && edCoords.y > 0 && edCoords.y < 900) {
        await page.mouse.click(edCoords.x, edCoords.y);
      } else {
        await page.evaluate((card) => {
          const c = card || document;
          const el = c.querySelector("div[role='textbox'][contenteditable='true'], .comments-comment-box__form [contenteditable='true'], [contenteditable='true'][role='textbox']");
          if (el) { el.focus(); el.click(); }
        }, cardHandle);
      }
      await new Promise(r => setTimeout(r, 500));

      // 3. Realistic typing jitter (35ms - 70ms per character)
      logger.info(`Typing LinkedIn comment for @${post.username}...`);
      for (const char of commentText) {
        await page.keyboard.type(char, { delay: Math.floor(Math.random() * 35) + 30 });
      }

      await new Promise(r => setTimeout(r, 1200));

      // 4. Find and click comment submit button inside this card
      const submitSuccess = await page.evaluate((card) => {
        const c = card || document;
        const form = c.querySelector(".comments-comment-box__form, .comments-comment-box, form") || c;
        const btn = Array.from(form.querySelectorAll("button")).find(b => {
          const text = (b.innerText || b.value || "").trim().toLowerCase();
          const label = (b.getAttribute("aria-label") || "").toLowerCase();
          if (label.includes("option") || label.includes("action") || label.includes("menu")) return false;
          return (text === "comment" || text === "post" || label === "comment" || label === "post") && !b.disabled;
        }) || form.querySelector("button.comments-comment-box__submit-button:not([disabled])");

        if (btn) {
          btn.scrollIntoView({ behavior: "instant", block: "center" });
          btn.click();
          return true;
        }
        return false;
      }, cardHandle);

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

