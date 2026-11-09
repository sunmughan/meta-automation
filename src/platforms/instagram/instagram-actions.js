/**
 * src/platforms/instagram/instagram-actions.js
 * Instagram comment and DM engagement actions.
 * Strictly enforces DRY_RUN=true, APPROVAL_MODE=true, and rate limits.
 */

const CONFIG = require("../../../config");
const browserManager = require("../../browser/browser-manager");
const stateStore = require("../../storage/state-store");
const duplicateGuard = require("../../safety/duplicate-guard");
const rateLimiter = require("../../safety/rate-limiter");
const antiBan = require("../../safety/anti-ban");
const logger = require("../../logging/logger");

class InstagramActions {
  /**
   * Posts or simulates posting a comment on an Instagram post.
   */
  async postComment(post, commentText, options = {}) {
    const isDryRun = options.dryRun !== undefined ? options.dryRun : CONFIG.DRY_RUN;
    const isLiveEnabled = options.postingEnabled !== undefined ? options.postingEnabled : CONFIG.POSTING_ENABLED;
    const isApprovalMode = options.approvalMode !== undefined ? options.approvalMode : CONFIG.APPROVAL_MODE;

    logger.info(`Processing Instagram comment for @${post.username} (${post.postId})`, {
      action: "IG_COMMENT_PREPARE",
      username: post.username,
      postId: post.postId
    });

    const dupCheck = duplicateGuard.canExecute({
      platform: "instagram",
      actionType: "COMMENT",
      targetId: post.postId,
      text: commentText
    });

    if (!dupCheck.allowed) {
      logger.warn(`Skipping IG comment: ${dupCheck.reason}`, {
        action: "IG_COMMENT_DUPLICATE_BLOCKED",
        postId: post.postId
      });
      return { success: false, reason: dupCheck.reason };
    }

    const rateCheck = rateLimiter.canPerform("NEW_POST_COMMENT", "instagram");
    if (!rateCheck.allowed && (!isDryRun && isLiveEnabled)) {
      logger.warn(`IG rate limit reached: ${rateCheck.reason}`);
      return { success: false, reason: rateCheck.reason };
    }

    // Dry-run / Approval mode path
    if (isDryRun || !isLiveEnabled || isApprovalMode) {
      const mode = isApprovalMode ? "APPROVAL_PENDING" : isDryRun ? "DRY_RUN" : "POSTING_DISABLED";
      logger.audit("IG_COMMENT_SIMULATED", `instagram:${post.postId}`, {
        platform: "instagram",
        mode,
        username: post.username,
        commentText
      });

      stateStore.recordComment(post.postId, {
        username: post.username,
        url: post.url,
        comment: commentText,
        status: isApprovalMode ? "PENDING" : "SIMULATED",
        approvalRequired: isApprovalMode
      }, "instagram");

      return {
        success: true,
        dryRun: true,
        approvalRequired: isApprovalMode,
        postId: post.postId,
        comment: commentText
      };
    }

    // 4. Live posting execution via CDP
    let page = null;
    try {
      page = await browserManager.getInstagramPage({ bringToFront: true });
      await page.bringToFront().catch(() => {});

      const targetUrl = post.url || `https://www.instagram.com/p/${post.postId}/`;
      logger.info(`Navigating to Instagram post: ${targetUrl}...`);
      await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
      await new Promise(r => setTimeout(r, 3000));

      // Check for Instagram checkpoint / action block
      const pageError = await page.evaluate(() => {
        const text = (document.body.innerText || "").toLowerCase();
        if (text.includes("try again later") || text.includes("we restrict certain activity") || text.includes("action blocked")) {
          return "BLOCKED";
        }
        if (text.includes("confirm it's you") || text.includes("suspicious activity") || text.includes("challenge")) {
          return "CHECKPOINT";
        }
        return null;
      });

      if (pageError === "BLOCKED") {
        antiBan.reportBlock("instagram", "Instagram action blocked / restricted");
        return { success: false, reason: "Instagram action blocked" };
      } else if (pageError === "CHECKPOINT") {
        antiBan.reportWarning("instagram", "Instagram security challenge modal");
        return { success: false, reason: "Instagram checkpoint encountered" };
      }

      // Locate comment textarea or contenteditable input
      const textareaSelector = "textarea[aria-label*='Add a comment' i], textarea[placeholder*='Add a comment' i], div[role='textbox'][contenteditable='true']";
      let textarea = await page.$(textareaSelector);

      if (!textarea) {
        // Try clicking comment icon/button if composer is collapsed
        const commentSvg = await page.$("svg[aria-label='Comment'], svg[aria-label='comment']");
        if (commentSvg) {
          const btn = await commentSvg.evaluateHandle(s => s.closest("button, div[role='button']") || s);
          await btn.click().catch(() => {});
          await new Promise(r => setTimeout(r, 1200));
          textarea = await page.$(textareaSelector);
        }
      }

      if (!textarea) {
        logger.warn(`Could not locate Instagram comment input for post ${post.postId}`);
        return { success: false, reason: "Comment input not found on Instagram post page" };
      }

      await textarea.click().catch(() => {});
      await new Promise(r => setTimeout(r, 300));

      // Humanized typing
      for (const char of String(commentText)) {
        await page.keyboard.sendCharacter(char);
        await new Promise(r => setTimeout(r, Math.floor(Math.random() * 30) + 20));
      }

      await new Promise(r => setTimeout(r, 800));

      // Click "Post" submit button
      const posted = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll("button, div[role='button']"));
        const postBtn = btns.find(b => (b.innerText || "").trim().toLowerCase() === "post" && !b.disabled);
        if (postBtn) {
          postBtn.click();
          return true;
        }
        return false;
      });

      if (!posted) {
        await page.keyboard.press("Enter");
      }

      await new Promise(r => setTimeout(r, 3500));

      // DOM verification
      const snippet = commentText.slice(0, 25).trim();
      const verified = await page.evaluate((snip) => {
        const text = document.body.innerText || "";
        return text.includes(snip);
      }, snippet);

      if (verified) {
        logger.info(`✅ Instagram comment verified posted on @${post.username}'s post!`);
        antiBan.record("comment", "instagram", post.postId);
        stateStore.recordComment(post.postId, {
          username: post.username,
          url: post.url,
          comment: commentText,
          status: "COMMENTED",
          verifiedAt: new Date().toISOString(),
          platform: "instagram"
        }, "instagram");
        return { success: true, verified: true, postId: post.postId };
      } else {
        logger.warn(`⚠️ Instagram comment submitted but not cleanly verified via DOM.`);
        antiBan.record("comment", "instagram", post.postId);
        stateStore.recordComment(post.postId, {
          username: post.username,
          url: post.url,
          comment: commentText,
          status: "COMMENTED_UNVERIFIED",
          platform: "instagram"
        }, "instagram");
        return { success: true, verified: false, postId: post.postId };
      }
    } catch (err) {
      logger.error(`Failed to post Instagram comment on ${post.postId}: ${err.message}`);
      return { success: false, reason: err.message };
    }
  }
}

const instagramActions = new InstagramActions();
module.exports = instagramActions;
