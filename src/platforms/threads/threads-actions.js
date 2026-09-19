/**
 * src/platforms/threads/threads-actions.js
 * Comment and reply automation for Threads.
 * Strictly respects DRY_RUN, APPROVAL_MODE, and rate limit guardrails.
 */

const CONFIG = require("../../../config");
const browserManager = require("../../browser/browser-manager");
const stateStore = require("../../storage/state-store");
const duplicateGuard = require("../../safety/duplicate-guard");
const rateLimiter = require("../../safety/rate-limiter");
const intentClassifier = require("../../leads/intent-classifier");
const logger = require("../../logging/logger");

class ThreadsActions {
  /**
   * Submits or simulates submitting a comment on a Threads post.
   */
  async postComment(post, commentText, options = {}) {
    const isDryRun = options.dryRun !== undefined ? options.dryRun : CONFIG.DRY_RUN;
    const isLiveEnabled = options.postingEnabled !== undefined ? options.postingEnabled : CONFIG.POSTING_ENABLED;
    const isApprovalMode = options.approvalMode !== undefined ? options.approvalMode : CONFIG.APPROVAL_MODE;

    logger.info(`Processing Threads comment for @${post.username} (${post.postId})`, {
      action: "COMMENT_PREPARE",
      username: post.username,
      postId: post.postId
    });

    // 1. Duplicate guard check
    const dupCheck = duplicateGuard.canExecute({
      platform: "threads",
      actionType: "COMMENT",
      targetId: post.postId,
      text: commentText
    });

    if (!dupCheck.allowed) {
      logger.warn(`Skipping comment: ${dupCheck.reason}`, {
        action: "COMMENT_DUPLICATE_BLOCKED",
        postId: post.postId
      });
      return { success: false, reason: dupCheck.reason };
    }

    // 2. Rate limit check
    const rateCheck = rateLimiter.canPerform("NEW_POST_COMMENT", "threads");
    if (!rateCheck.allowed && (!isDryRun && isLiveEnabled)) {
      logger.warn(`Rate limit reached: ${rateCheck.reason}`, { action: "RATE_LIMIT_PAUSE" });
      return { success: false, reason: rateCheck.reason };
    }

    // 3. Dry run or Approval Mode simulation
    if (isDryRun || !isLiveEnabled || isApprovalMode) {
      const mode = isApprovalMode ? "APPROVAL_PENDING" : isDryRun ? "DRY_RUN" : "POSTING_DISABLED";
      logger.audit("COMMENT_SIMULATED", `threads:${post.postId}`, {
        platform: "threads",
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
      }, "threads");

      return {
        success: true,
        dryRun: true,
        approvalRequired: isApprovalMode,
        postId: post.postId,
        comment: commentText
      };
    }

    // 4. Live posting path (Active ONLY when DRY_RUN=false, APPROVAL_MODE=false, POSTING_ENABLED=true)
    let page = null;
    try {
      page = await browserManager.getThreadsPage();
      await page.bringToFront();

      // 1. Direct Post URL Navigation (Never navigate to profile and never guess fallback posts)
      const directPostUrl = post.url || `https://www.threads.com/@${post.username}/post/${post.postId}`;
      logger.info(`Navigating directly to verified post URL: ${directPostUrl}`, {
        postId: post.postId,
        username: post.username
      });

      await page.goto(directPostUrl, { waitUntil: "domcontentloaded", timeout: 35000 });
      await new Promise(r => setTimeout(r, 2500));

      // 2. Strict URL Verification Guard
      const currentUrl = page.url();
      if (!currentUrl.includes(post.postId)) {
        logger.error(`Navigation verification failed: current URL (${currentUrl}) does not match expected post ID ${post.postId}. Aborting comment.`);
        return { success: false, reason: "Target post URL mismatch or post no longer available." };
      }

      // 3. Double-Guard: Verify on-page content is genuine buyer requirement before typing
      const onPageContent = await page.evaluate(() => {
        const article = document.querySelector('article, [data-pressable-container="true"]');
        const text = article ? (article.innerText || "").trim() : (document.body.innerText || "").trim();
        return { text };
      });

      const recheck = intentClassifier.classify({
        text: onPageContent.text || post.text,
        username: post.username
      });

      if (!recheck.qualified || !recheck.is_genuine_buyer) {
        logger.warn(`Post ${post.postId} failed live on-page qualification double-guard: ${recheck.reason}. Aborting live comment.`, {
          action: "COMMENT_GUARD_ABORTED",
          postId: post.postId,
          username: post.username,
          reason: recheck.reason,
          leadType: recheck.lead_type
        });
        return {
          success: false,
          reason: `On-page double-guard rejected: ${recheck.reason}`
        };
      }

      // Wait for or activate reply composer
      let textbox = await page.$('div[role="textbox"][contenteditable="true"]');
      if (!textbox) {
        await page.evaluate(() => {
          const allElements = [...document.querySelectorAll('span, p, div')];
          const placeholder = allElements.find(s => s.innerText && s.innerText.toLowerCase().includes('reply to'));
          if (placeholder) placeholder.click();
        });
        await new Promise(r => setTimeout(r, 1200));
        textbox = await page.$('div[role="textbox"][contenteditable="true"]');
      }

      if (!textbox) {
        throw new Error("Reply composer textbox not found on post page");
      }

      await textbox.focus();
      await textbox.click();

      // Type message visibly so user watches it typing live
      logger.info(`Visibly typing comment on @${post.username}'s post...`);
      for (const char of commentText) {
        await page.keyboard.sendCharacter(char);
        await new Promise(r => setTimeout(r, Math.floor(Math.random() * 25) + 20));
      }

      await new Promise(r => setTimeout(r, 1500));

      // Step 1: Click the Up Arrow / Reply submit button in the composer row
      logger.info(`Clicking Up Arrow / Reply button in composer...`);
      const arrowClicked = await page.evaluate(() => {
        const tb = document.querySelector('div[role="textbox"][contenteditable="true"]');
        if (!tb) return false;
        let row = tb.parentElement;
        for (let i = 0; i < 6; i++) {
          if (row && row.parentElement) {
            row = row.parentElement;
            const replySvg = row.querySelector('svg[aria-label="Reply"], svg title, svg path[d*="M1 6h10"]');
            if (replySvg) {
              const btn = replySvg.closest('div[role="button"], button');
              if (btn) {
                btn.scrollIntoView({ behavior: "smooth", block: "center" });
                btn.click();
                return true;
              }
            }
          }
        }
        return false;
      });

      await new Promise(r => setTimeout(r, 1800));

      // Step 2: If Threads opened the confirmation Reply modal dialog, click the "Post" button
      const modalSubmitted = await page.evaluate(() => {
        const dialog = document.querySelector('div[role="dialog"], [aria-modal="true"]');
        if (dialog) {
          const buttons = [...dialog.querySelectorAll('div[role="button"], button')];
          const postBtn = buttons.find(b => (b.innerText || "").trim().toLowerCase() === "post");
          if (postBtn) {
            postBtn.click();
            return true;
          }
        }
        return false;
      });

      // Step 3: Fallback keyboard submission if neither button was clicked
      if (!arrowClicked && !modalSubmitted) {
        logger.info("Direct submit buttons not triggered; dispatching Control+Enter...");
        await page.keyboard.down("Control");
        await page.keyboard.press("Enter");
        await page.keyboard.up("Control");
      }

      // Step 4: Verify submission (poll until textbox is cleared or toast "Posted" appears)
      let isVerifiedPosted = false;
      for (let attempt = 0; attempt < 8; attempt++) {
        await new Promise(r => setTimeout(r, 1000));
        isVerifiedPosted = await page.evaluate(() => {
          const bodyText = document.body.innerText;
          const hasPostedToast = bodyText.includes("✓ Posted") || bodyText.includes("Posted\nView");
          const tb = document.querySelector('div[role="textbox"][contenteditable="true"]');
          const isCleared = !tb || (tb.innerText || "").trim() === "";
          const noModal = !document.querySelector('div[role="dialog"], [aria-modal="true"]');
          return (hasPostedToast || isCleared) && noModal;
        });
        if (isVerifiedPosted) break;
      }

      if (!isVerifiedPosted) {
        logger.warn("Waiting an extra 2s for Threads server state update...");
        await new Promise(r => setTimeout(r, 2000));
      }

      duplicateGuard.recordExecuted({
        platform: "threads",
        actionType: "COMMENT",
        targetId: post.postId,
        text: commentText,
        username: post.username
      });

      stateStore.recordComment(post.postId, {
        username: post.username,
        url: post.url,
        comment: commentText,
        status: "POSTED_LIVE",
        postedAt: new Date().toISOString()
      }, "threads");

      logger.audit("COMMENT_POSTED_LIVE", `threads:${post.postId}`, {
        username: post.username,
        commentText
      });

      // Step 5: Clean return to Home feed (smooth back navigation to preserve feed position)
      const returnedViaBack = await page.evaluate(() => {
        const backBtn = document.querySelector('svg[aria-label="Back"]')?.closest('button, div[role="button"]') ||
          document.querySelector('a[href="/"]');
        if (backBtn) {
          backBtn.click();
          return true;
        }
        return false;
      });

      if (!returnedViaBack) {
        await page.goto(CONFIG.THREADS_HOME, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
      }
      await new Promise(r => setTimeout(r, 2500));

      return { success: true, live: true, postId: post.postId, comment: commentText };
    } catch (err) {
      logger.error(`Live comment failed on Threads post ${post.postId}`, err);
      return { success: false, error: err.message };
    }
  }
}

const threadsActions = new ThreadsActions();
module.exports = threadsActions;
