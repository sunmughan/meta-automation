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

    // Filter by platform if desired, or enforce aggregate limit across both
    const totalReplies = windowActions.filter(
      a => a.type === "COMMENT_POSTED" || a.type === "REPLY_POSTED" || a.type === "COMMENT_EXECUTED"
    ).length;

    if (totalReplies >= CONFIG.MAX_TOTAL_REPLIES_PER_HOUR) {
      return {
        allowed: false,
        reason: `Exceeded total hourly replies limit (${totalReplies}/${CONFIG.MAX_TOTAL_REPLIES_PER_HOUR}) on ${platform}.`
      };
    }

    if (normalizedType === "NEW_POST_COMMENT") {
      const newPostComments = windowActions.filter(
        a => a.type === "COMMENT_POSTED" || a.type === "COMMENT_EXECUTED"
      ).length;
      if (newPostComments >= CONFIG.MAX_NEW_POST_REPLIES_PER_HOUR) {
        return {
          allowed: false,
          reason: `Exceeded new post comments limit (${newPostComments}/${CONFIG.MAX_NEW_POST_REPLIES_PER_HOUR}) on ${platform}.`
        };
      }
    } else if (normalizedType === "DM_REPLY") {
      const dmReplies = windowActions.filter(
        a => a.type === "DM_REPLIED" || a.type === "DM_EXECUTED"
      ).length;
      if (dmReplies >= CONFIG.MAX_DM_REPLIES_PER_HOUR) {
        return {
          allowed: false,
          reason: `Exceeded DM replies limit (${dmReplies}/${CONFIG.MAX_DM_REPLIES_PER_HOUR}) on ${platform}.`
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
