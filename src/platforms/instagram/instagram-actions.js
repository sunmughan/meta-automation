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

    // Live posting placeholder (when live is explicitly turned on)
    return {
      success: false,
      reason: "Live Instagram posting is disabled for safety. Use approval mode."
    };
  }
}

const instagramActions = new InstagramActions();
module.exports = instagramActions;
