/**
 * src/safety/duplicate-guard.js
 * Robust duplicate protection engine for Threads + Instagram actions.
 * Prevents duplicate comments on the same post, duplicate replies, and repeated DMs.
 * Uses content hashing to block identical responses across users.
 */

const crypto = require("crypto");
const stateStore = require("../storage/state-store");
const logger = require("../logging/logger");

class DuplicateGuard {
  hashText(text) {
    return crypto
      .createHash("sha256")
      .update(String(text || "").trim().toLowerCase())
      .digest("hex")
      .slice(0, 16);
  }

  /**
   * Checks if an action is allowed or duplicate.
   *
   * @param {Object} params
   * @param {string} params.platform - "threads"|"instagram"
   * @param {string} params.actionType - "COMMENT"|"REPLY"|"DM"
   * @param {string} params.targetId - postId | replyId | dmId | userId
   * @param {string} [params.text] - generated text to check for repetition
   * @returns {{ allowed: boolean, reason?: string }}
   */
  canExecute(params) {
    const { platform = "threads", actionType, targetId, text } = params;

    if (!targetId) {
      return { allowed: false, reason: "Missing targetId." };
    }

    // 1. Target ID level check
    if (actionType === "COMMENT") {
      if (stateStore.hasCommented(targetId, platform)) {
        return {
          allowed: false,
          reason: `Already commented on ${platform} post ${targetId}. Duplicate comment blocked.`
        };
      }
    } else if (actionType === "REPLY") {
      if (stateStore.hasHandledReply(targetId, platform)) {
        return {
          allowed: false,
          reason: `Already replied to ${platform} reply ${targetId}. Duplicate reply blocked.`
        };
      }
    } else if (actionType === "DM") {
      if (stateStore.hasHandledDm(targetId, platform)) {
        return {
          allowed: false,
          reason: `Already responded to ${platform} DM message ${targetId}. Duplicate DM blocked.`
        };
      }
    }

    // 2. Exact text repetition check across recent actions
    if (text) {
      const textHash = this.hashText(text);
      const recentActions = stateStore.getActionsInWindow(null, 24 * 3600 * 1000); // 24 hours
      const duplicateTextCount = recentActions.filter(a => a.textHash === textHash).length;

      if (duplicateTextCount >= 2) {
        return {
          allowed: false,
          reason: `Substantially identical response has already been sent ${duplicateTextCount} times recently. Re-generating fresh response required.`
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Records a validated action to protect against future duplicates.
   */
  recordExecuted(params) {
    const { platform = "threads", actionType, targetId, text, username } = params;
    const textHash = text ? this.hashText(text) : null;

    if (actionType === "COMMENT") {
      stateStore.recordComment(targetId, { username, comment: text, status: "POSTED" }, platform);
    } else if (actionType === "REPLY") {
      stateStore.recordHandledReply(targetId, { username, responseText: text, status: "REPLIED" }, platform);
    } else if (actionType === "DM") {
      stateStore.recordHandledDm(targetId, { username, responseText: text, status: "REPLIED" }, platform);
    }

    stateStore.recordAction(`${actionType}_EXECUTED`, targetId, {
      platform,
      username,
      textHash
    });
  }
}

const duplicateGuard = new DuplicateGuard();
module.exports = duplicateGuard;
