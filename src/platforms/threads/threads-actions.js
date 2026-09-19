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
const aiDecisionEngine = require("../../ai/ai-decision-engine");
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

      // 1. Check if the post is already rendered on the page, or navigate directly
      let alreadyOnScreen = await page.evaluate((pid, uname) => {
        const bodyText = (document.body.innerText || "").toLowerCase();
        const hasPidLink = Array.from(document.querySelectorAll('a[href]')).some(a => a.href && a.href.includes(pid));
        const hasPidUrl = window.location.href.includes(pid);
        const hasUname = uname ? bodyText.includes(uname.toLowerCase()) : false;
        return hasPidUrl || (hasPidLink && hasUname);
      }, post.postId, post.username);

      if (!alreadyOnScreen) {
        const directPostUrl = post.url || `https://www.threads.com/@${post.username}/post/${post.postId}`;
        logger.info(`Navigating directly to verified post URL: ${directPostUrl}`, {
          postId: post.postId,
          username: post.username
        });

        await page.goto(directPostUrl, { waitUntil: "domcontentloaded", timeout: 35000 });
        await new Promise(r => setTimeout(r, 2500));
      }

      // 2. Resilient Post Verification Guard (Handles Threads client-side routing & SPAs)
      let postVerified = false;
      for (let attempt = 0; attempt < 5; attempt++) {
        postVerified = await page.evaluate((pid, uname, ptext) => {
          const currentUrl = window.location.href || "";
          if (currentUrl.includes(pid)) return true;

          const hasPostLink = Array.from(document.querySelectorAll('a[href]')).some(a => a.href && a.href.includes(pid));
          if (hasPostLink) return true;

          const bodyText = (document.body.innerText || "").toLowerCase();
          const title = (document.title || "").toLowerCase();
          const hasUsername = uname ? (bodyText.includes(uname.toLowerCase()) || title.includes(uname.toLowerCase())) : false;
          const cleanSnippet = (ptext || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").trim().slice(0, 30);
          const hasSnippet = cleanSnippet.length > 5 ? (bodyText.includes(cleanSnippet) || title.includes(cleanSnippet)) : true;

          return hasUsername && hasSnippet;
        }, post.postId, post.username, post.text);

        if (postVerified) break;
        await new Promise(r => setTimeout(r, 1000));
      }

      if (!postVerified) {
        logger.error(`Navigation verification failed: post ${post.postId} (@${post.username}) not found on page. Aborting comment.`, {
          currentUrl: page.url(),
          postId: post.postId,
          username: post.username
        });
        return { success: false, reason: "Target post URL mismatch or post no longer available." };
      }

      // 3. Double-Guard: Verify post context is genuine buyer requirement before typing (if not already qualified)
      if (!options.skipRecheck && post.decision !== "QUALIFIED" && post.status !== "COMMENT_PENDING") {
        const postTextToVerify = post.text || (await page.evaluate(() => {
          const article = document.querySelector('article, [data-pressable-container="true"]');
          return article ? (article.innerText || "").trim() : "";
        }));

        const recheck = await aiDecisionEngine.qualifyPost({
          text: postTextToVerify,
          username: post.username
        });

        if (!recheck.is_genuine_buyer || recheck.decision !== "QUALIFIED") {
          logger.warn(`Post ${post.postId} failed live qualification double-guard: ${recheck.reason}. Aborting live comment.`, {
            action: "COMMENT_GUARD_ABORTED",
            postId: post.postId,
            username: post.username,
            reason: recheck.reason,
            leadType: recheck.lead_type
          });
          return {
            success: false,
            reason: `Qualification double-guard rejected: ${recheck.reason}`
          };
        }
      }

      // Wait for or activate reply composer by clicking Reply SVG or placeholder
      let textbox = await page.$('div[role="textbox"][contenteditable="true"]');
      if (!textbox) {
        await page.evaluate((targetUsername) => {
          // 1. Search inside the target post container
          const containers = Array.from(document.querySelectorAll('article, [data-pressable-container="true"]'));
          const targetCont = containers.find(c => targetUsername ? (c.innerText || "").toLowerCase().includes(targetUsername.toLowerCase()) : false) || containers[0];
          
          if (targetCont) {
            const svgs = Array.from(targetCont.querySelectorAll('svg'));
            const replySvg = svgs.find(s => {
              const title = (s.querySelector('title')?.textContent || s.getAttribute('aria-label') || "").toLowerCase();
              const d = s.querySelector('path')?.getAttribute('d') || "";
              return title === 'reply' || d.startsWith('M12 3a9');
            }) || (svgs.length >= 5 ? svgs[4] : null);
            
            if (replySvg) {
              const btn = replySvg.closest('div[role="button"], button') || replySvg;
              btn.click();
              return;
            }
          }

          // 2. Global SVG search
          const allSvgs = Array.from(document.querySelectorAll('svg'));
          const replySvg = allSvgs.find(s => {
            const title = (s.querySelector('title')?.textContent || s.getAttribute('aria-label') || "").toLowerCase();
            const d = s.querySelector('path')?.getAttribute('d') || "";
            return title === 'reply' || d.startsWith('M12 3a9');
          });
          if (replySvg) {
            const btn = replySvg.closest('div[role="button"], button') || replySvg;
            btn.click();
            return;
          }

          // 3. Fallback: placeholder text
          const allElements = [...document.querySelectorAll('span, p, div')];
          const placeholder = allElements.find(s => (s.innerText || "").toLowerCase().includes('reply to'));
          if (placeholder) placeholder.click();
        }, post.username);

        await new Promise(r => setTimeout(r, 1500));
        textbox = await page.$('div[role="textbox"][contenteditable="true"]');
      }

      if (!textbox) {
        throw new Error("Reply composer textbox not found on post page");
      }

      await textbox.focus();
      await textbox.click();
      await new Promise(r => setTimeout(r, 400));

      // Type message visibly so user watches it typing live
      logger.info(`Visibly typing comment on @${post.username}'s post...`);
      for (const char of commentText) {
        await page.keyboard.sendCharacter(char);
        await new Promise(r => setTimeout(r, Math.floor(Math.random() * 20) + 15));
      }

      await new Promise(r => setTimeout(r, 1500));

      // Click the "Post" button
      logger.info(`Clicking Post button...`);
      const postClicked = await page.evaluate(() => {
        // Priority 1: Check modal dialog if open
        const dialog = document.querySelector('div[role="dialog"], [aria-modal="true"]');
        if (dialog) {
          const btns = Array.from(dialog.querySelectorAll('div[role="button"], button'));
          const pBtn = btns.find(b => (b.innerText || "").trim().toLowerCase() === 'post' && !b.getAttribute('aria-disabled'));
          if (pBtn) {
            pBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
            pBtn.click();
            return true;
          }
        }

        // Priority 2: Inline Post button near textbox
        const tb = document.querySelector('div[role="textbox"][contenteditable="true"]');
        if (tb) {
          const container = tb.closest('div[data-pressable-container="true"], article, form') || document.body;
          const btns = Array.from(container.querySelectorAll('div[role="button"], button'));
          const pBtn = btns.find(b => (b.innerText || "").trim().toLowerCase() === 'post' && !b.getAttribute('aria-disabled'));
          if (pBtn) {
            pBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
            pBtn.click();
            return true;
          }
        }

        // Priority 3: Any enabled Post button in document
        const allBtns = Array.from(document.querySelectorAll('div[role="button"], button'));
        const pBtn = allBtns.find(b => (b.innerText || "").trim().toLowerCase() === 'post' && !b.getAttribute('aria-disabled'));
        if (pBtn) {
          pBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
          pBtn.click();
          return true;
        }

        return false;
      });

      if (!postClicked) {
        logger.info("Direct submit button not triggered; dispatching Control+Enter...");
        await page.keyboard.down("Control");
        await page.keyboard.press("Enter");
        await page.keyboard.up("Control");
      }

      // Step 4: Verify submission (poll until textbox is cleared or toast "Posted" appears)
      let isVerifiedPosted = false;
      for (let attempt = 0; attempt < 8; attempt++) {
        await new Promise(r => setTimeout(r, 1000));
        isVerifiedPosted = await page.evaluate(() => {
          const bodyText = document.body.innerText || "";
          const hasPostedToast = bodyText.includes("✓ Posted") || bodyText.includes("Posted\nView") || bodyText.includes("Posted");
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
