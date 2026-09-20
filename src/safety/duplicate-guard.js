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
   * Calculates word overlap similarity (Jaccard index) between two text strings.
   */
  calculateSimilarity(text1, text2) {
    const t1 = String(text1 || "").trim().toLowerCase();
    const t2 = String(text2 || "").trim().toLowerCase();
    if (t1 === t2) return 1.0;
    if (!t1 || !t2) return 0.0;

    const words1 = new Set(t1.split(/\s+/).filter(w => w.length > 2));
    const words2 = new Set(t2.split(/\s+/).filter(w => w.length > 2));
    if (words1.size === 0 || words2.size === 0) return 0.0;

    let intersection = 0;
    for (const w of words1) {
      if (words2.has(w)) intersection++;
    }
    const union = new Set([...words1, ...words2]).size;
    return union === 0 ? 0.0 : intersection / union;
  }

  /**
   * Conversation-level message deduplication:
   * Prevents sending exact identical or semantically duplicate (>75% similarity)
   * messages within the same conversation thread.
   *
   * @param {string} convId
   * @param {string} text
   * @param {string} [platform="threads"]
   * @returns {{ allowed: boolean, reason?: string }}
   */
  canSendChatMessage(convId, text, platform = "threads") {
    if (!convId || !text) return { allowed: true };
    const recent = stateStore.getRecentOutgoingMessages(convId, 5, platform);
    const cleanText = String(text).trim().toLowerCase();

    for (const prev of recent) {
      const cleanPrev = String(prev).trim().toLowerCase();
      if (cleanPrev === cleanText) {
        return {
          allowed: false,
          reason: `Exact identical message was already sent in conversation ${convId}. Repetition blocked.`
        };
      }
      const sim = this.calculateSimilarity(cleanText, cleanPrev);
      if (sim >= 0.75) {
        return {
          allowed: false,
          reason: `Semantically identical message (${Math.round(sim * 100)}% similarity) was already sent recently in conversation ${convId}. Repetition blocked.`
        };
      }
    }
    return { allowed: true };
  }

  /**
   * Checks if an action is allowed or duplicate.
   *
   * @param {Object} params
   * @param {string} params.platform - "threads"|"instagram"
   * @param {string} params.actionType - "COMMENT"|"REPLY"|"DM"
   * @param {string} params.targetId - postId | replyId | dmId | userId
   * @param {string} [params.text] - generated text to check for repetition
   * @param {string} [params.convId] - conversation ID for conversation-level deduplication
   * @returns {{ allowed: boolean, reason?: string }}
   */
  canExecute(params) {
    const { platform = "threads", actionType, targetId, text, convId } = params;

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

    // 2. Conversation-level message deduplication
    if (convId && text) {
      const convCheck = this.canSendChatMessage(convId, text, platform);
      if (!convCheck.allowed) {
        return convCheck;
      }
    }

    // 3. Exact text repetition check across recent actions
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
