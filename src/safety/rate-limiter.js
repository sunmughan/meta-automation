/**
 * src/safety/rate-limiter.js
 * Configurable rate limiting and cooldown engine for Threads + Instagram operations.
 * Enforces hourly limits, cooldowns, and human delay jitter.
 */

const CONFIG = require("../../config");
const stateStore = require("../storage/state-store");

class RateLimiter {
  /**
   * Checks if an action is within allowed rate limits.
   *
   * @param {string} actionType - "NEW_POST_COMMENT" | "REPLY" | "DM_REPLY"
   * @param {string} [platform] - "threads" | "instagram"
   * @returns {{ allowed: boolean, reason?: string }}
   */
  canPerform(actionType, platform = "threads") {
    const normalizedType = (actionType === "COMMENT" || actionType === "NEW_POST_COMMENT")
      ? "NEW_POST_COMMENT"
      : actionType;
    const windowActions = stateStore.getActionsInWindow(null, 3600 * 1000); // 1 hour

    // Filter out mock/test actions and isolate by platform
    const realActions = windowActions.filter(a => {
      const tid = String(a.targetId || "").toLowerCase();
      const user = String(a.username || "").toLowerCase();
      const actPlatform = a.platform || (tid.startsWith("fb") ? "facebook" : (tid.startsWith("li") ? "linkedin" : "threads"));
      if (platform && actPlatform !== platform) return false;
      return !tid.includes("test") && !tid.includes("mock") && !user.includes("test") && !user.includes("mock");
    });

    // Deduplicate by targetId to prevent double-counting from multiple event logs (e.g. COMMENT_POSTED + COMMENT_EXECUTED)
    const uniqueCommentTargets = new Set(
      realActions.filter(a => a.type === "COMMENT_POSTED" || a.type === "COMMENT_EXECUTED").map(a => a.targetId)
    );
    const uniqueReplyTargets = new Set(
      realActions.filter(a => a.type === "REPLY_POSTED").map(a => a.targetId)
    );
    const uniqueDmTargets = new Set(
      realActions.filter(a => a.type === "DM_REPLIED" || a.type === "DM_EXECUTED").map(a => a.targetId)
    );

    const totalReplies = uniqueCommentTargets.size + uniqueReplyTargets.size;

    if (totalReplies >= CONFIG.MAX_TOTAL_REPLIES_PER_HOUR) {
      return {
        allowed: false,
        reason: `Exceeded total hourly replies limit (${totalReplies}/${CONFIG.MAX_TOTAL_REPLIES_PER_HOUR}) on ${platform}.`
      };
    }

    if (normalizedType === "NEW_POST_COMMENT") {
      if (uniqueCommentTargets.size >= CONFIG.MAX_NEW_POST_REPLIES_PER_HOUR) {
        return {
          allowed: false,
          reason: `Exceeded new post comments limit (${uniqueCommentTargets.size}/${CONFIG.MAX_NEW_POST_REPLIES_PER_HOUR}) on ${platform}.`
        };
      }
    } else if (normalizedType === "DM_REPLY") {
      if (uniqueDmTargets.size >= CONFIG.MAX_DM_REPLIES_PER_HOUR) {
        return {
          allowed: false,
          reason: `Exceeded DM replies limit (${uniqueDmTargets.size}/${CONFIG.MAX_DM_REPLIES_PER_HOUR}) on ${platform}.`
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Alias for canPerform to support standard rate limiter API.
   */
  canPerformAction(actionType, platform = "threads") {
    return this.canPerform(actionType, platform);
  }

  /**
   * Records an executed action for hourly tracking.
   */
  recordAction(actionType, platform = "threads", targetId = null, details = {}) {
    const normType = (actionType === "COMMENT" || actionType === "NEW_POST_COMMENT") ? "COMMENT_POSTED" : actionType;
    if (typeof stateStore.recordAction === "function") {
      stateStore.recordAction(normType, targetId || `action_${Date.now()}`, { platform, ...details });
    }
  }

  /**
   * Returns a random human delay in milliseconds between MIN and MAX.
   */
  getRandomDelay() {
    const min = CONFIG.MIN_ACTION_DELAY_MS || 15000;
    const max = CONFIG.MAX_ACTION_DELAY_MS || 45000;
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /**
   * Sleeps for a human-like delay.
   */
  async sleepHumanDelay() {
    const delay = this.getRandomDelay();
    await new Promise(resolve => setTimeout(resolve, delay));
    return delay;
  }
}

const rateLimiter = new RateLimiter();
module.exports = rateLimiter;
