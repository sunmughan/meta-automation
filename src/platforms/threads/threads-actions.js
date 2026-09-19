/**
 * src/platforms/threads/threads-actions.js
 * Comment and reply automation for Threads.
 * Strictly respects DRY_RUN, APPROVAL_MODE, and rate limit guardrails.
 */

const fs = require("fs");
const path = require("path");
const CONFIG = require("../../../config");
const browserManager = require("../../browser/browser-manager");
const stateStore = require("../../storage/state-store");
const duplicateGuard = require("../../safety/duplicate-guard");
const rateLimiter = require("../../safety/rate-limiter");
const aiDecisionEngine = require("../../ai/ai-decision-engine");
const logger = require("../../logging/logger");

async function captureDiagnosticScreenshot(page, prefix) {
  try {
    const dir = path.join(CONFIG.LOGS_DIR || path.resolve(__dirname, "../../../logs"), "screenshots");
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const file = path.join(dir, `${prefix}_${Date.now()}.png`);
    await page.screenshot({ path: file });
    logger.info(`Saved diagnostic screenshot to: ${file}`);
    return file;
  } catch (e) {
    logger.warn(`Failed capturing diagnostic screenshot: ${e.message}`);
    return null;
  }
}

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

      // Click the Reply submit button (Arrow button or Reply button strictly in composer / dialog)
      logger.info(`Clicking Reply submit button...`);
      const postClicked = await page.evaluate(() => {
        // Priority 1: Check modal dialog if open (Ensure it is a reply modal, not "New thread")
        const dialog = document.querySelector('div[role="dialog"], [aria-modal="true"]');
        if (dialog) {
          const isNewThreadModal = (dialog.innerText || "").toLowerCase().includes("new thread");
          if (isNewThreadModal) {
            // Cancel accidental profile post modal immediately
            const cancelBtn = Array.from(dialog.querySelectorAll('div[role="button"], button'))
              .find(b => (b.innerText || "").trim().toLowerCase() === 'cancel');
            if (cancelBtn) cancelBtn.click();
          } else {
            const btns = Array.from(dialog.querySelectorAll('div[role="button"], button'));
            const pBtn = btns.find(b => {
              const txt = (b.innerText || "").trim().toLowerCase();
              return (txt === 'post' || txt === 'reply') && !b.getAttribute('aria-disabled');
            });
            if (pBtn) {
              pBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
              pBtn.click();
              return true;
            }
          }
        }

        // Priority 2: Inline Reply submit arrow or button strictly within the textbox parent tree
        const tb = document.querySelector('div[role="textbox"][contenteditable="true"]');
        if (tb) {
          let parent = tb.parentElement;
          for (let depth = 0; depth < 8; depth++) {
            if (!parent) break;
            
            // Look for the submit arrow SVG icon (M1 6h10 or title "Reply")
            const svgs = Array.from(parent.querySelectorAll('svg'));
            const submitSvg = svgs.find(s => {
              const title = (s.querySelector('title')?.textContent || s.getAttribute('aria-label') || "").toLowerCase();
              const d = s.querySelector('path')?.getAttribute('d') || "";
              return title === 'reply' || d.includes('M1 6h10');
            });
            if (submitSvg) {
              const btn = submitSvg.closest('div[role="button"], button') || submitSvg;
              btn.click();
              return true;
            }

            // Look for Post or Reply button strictly inside this composer row
            const btns = Array.from(parent.querySelectorAll('div[role="button"], button'));
            const pBtn = btns.find(b => {
              const txt = (b.innerText || "").trim().toLowerCase();
              return (txt === 'reply' || txt === 'post') && !b.getAttribute('aria-disabled');
            });
            if (pBtn) {
              pBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
              pBtn.click();
              return true;
            }

            parent = parent.parentElement;
          }
        }

        return false;
      });

      if (!postClicked) {
        logger.info("Direct submit button not triggered; dispatching Control+Enter...");
        await page.keyboard.down("Control");
        await page.keyboard.press("Enter");
        await page.keyboard.up("Control");
      }

      // Safeguard: Ensure no "New thread" profile modal was left open
      await page.evaluate(() => {
        const dialog = document.querySelector('div[role="dialog"], [aria-modal="true"]');
        if (dialog && (dialog.innerText || "").toLowerCase().includes("new thread")) {
          const cancelBtn = Array.from(dialog.querySelectorAll('div[role="button"], button'))
            .find(b => (b.innerText || "").trim().toLowerCase() === 'cancel');
          if (cancelBtn) cancelBtn.click();
        }
      });

      // Step 4: Multi-Signal True Submit Verification
      const textSnippet = commentText.replace(/https?:\/\/[^\s]+/g, "").slice(0, 35).trim();
      let isVerifiedPosted = false;
      let verificationReason = "";

      for (let attempt = 0; attempt < 10; attempt++) {
        await new Promise(r => setTimeout(r, 1000));
        const check = await page.evaluate((snippet) => {
          const bodyText = document.body.innerText || "";
          
          // 1. Check for error alerts or rate limit toasts
          const hasError = /\b(couldn'?t post|something went wrong|try again later|action blocked|rate limit)\b/i.test(bodyText);
          if (hasError) {
            return { verified: false, error: "Threads displayed error dialog or rate limit alert" };
          }

          // 2. Check if snippet rendered inside any article container on thread
          const articles = Array.from(document.querySelectorAll('article, [data-pressable-container="true"]'));
          const snippetFound = snippet && snippet.length > 5 && articles.some(a => (a.innerText || "").includes(snippet));

          // 3. Check toast confirmation
          const hasPostedToast = bodyText.includes("✓ Posted") || bodyText.includes("Posted\nView") || (bodyText.includes("Posted") && bodyText.includes("View"));

          // 4. Check composer state
          const tb = document.querySelector('div[role="textbox"][contenteditable="true"]');
          const isCleared = !tb || (tb.innerText || "").trim() === "";
          const noModal = !document.querySelector('div[role="dialog"], [aria-modal="true"]');

          if (snippetFound) {
            return { verified: true, reason: "Comment snippet verified in thread DOM" };
          }
          if (hasPostedToast && noModal && isCleared) {
            return { verified: true, reason: "Threads posted toast and composer dismissed" };
          }

          return { verified: false, error: "Awaiting confirmed DOM insertion or toast" };
        }, textSnippet);

        if (check.verified) {
          isVerifiedPosted = true;
          verificationReason = check.reason;
          break;
        }
        if (check.error && check.error.includes("error dialog")) {
          verificationReason = check.error;
          break;
        }
      }

      if (!isVerifiedPosted) {
        logger.error(`Comment verification failed on post ${post.postId}: ${verificationReason || "Confirmation timeout"}. Aborting success record.`, {
          postId: post.postId,
          username: post.username
        });
        await captureDiagnosticScreenshot(page, `comment_failed_${post.postId}`);
        await page.keyboard.press("Escape").catch(() => {});
        return {
          success: false,
          verified: false,
          reason: verificationReason || "Comment submit verification failed: comment not found in thread DOM",
          postId: post.postId
        };
      }

      // ONLY RECORD SUCCESS IF TRULY VERIFIED
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
        verifiedReason: verificationReason,
        postedAt: new Date().toISOString()
      }, "threads");

      logger.audit("COMMENT_POSTED_LIVE", `threads:${post.postId}`, {
        username: post.username,
        commentText,
        verificationReason
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

      return { success: true, live: true, verified: true, postId: post.postId, comment: commentText };
    } catch (err) {
      logger.error(`Live comment failed on Threads post ${post.postId}`, err);
      if (page) {
        await captureDiagnosticScreenshot(page, `comment_exception_${post.postId}`).catch(() => {});
      }
      return { success: false, error: err.message };
    }
  }
}

const threadsActions = new ThreadsActions();
module.exports = threadsActions;
