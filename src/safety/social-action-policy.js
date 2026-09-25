/**
 * V2 side-effect budget.
 * Limits are a safety and quality control, not a mechanism for bypassing platform enforcement.
 */
const stateStore = require("../storage/state-store");

const DEFAULT_LIMITS = Object.freeze({
  LIKE: 30,
  COMMENT: 5,
  REPLY: 5,
  DM: 5,
  CONNECT: 10,
  FOLLOW: 10,
  PUBLISH: 2
});

function limits() {
  return {
    ...DEFAULT_LIMITS,
    LIKE: Number(process.env.SOCIAL_MAX_LIKES_PER_HOUR || DEFAULT_LIMITS.LIKE),
    COMMENT: Number(process.env.SOCIAL_MAX_COMMENTS_PER_HOUR || DEFAULT_LIMITS.COMMENT),
    REPLY: Number(process.env.SOCIAL_MAX_REPLIES_PER_HOUR || DEFAULT_LIMITS.REPLY),
    DM: Number(process.env.SOCIAL_MAX_DMS_PER_HOUR || DEFAULT_LIMITS.DM),
    CONNECT: Number(process.env.SOCIAL_MAX_CONNECTS_PER_HOUR || DEFAULT_LIMITS.CONNECT),
    FOLLOW: Number(process.env.SOCIAL_MAX_FOLLOWS_PER_HOUR || DEFAULT_LIMITS.FOLLOW),
    PUBLISH: Number(process.env.SOCIAL_MAX_PUBLISHES_PER_HOUR || DEFAULT_LIMITS.PUBLISH)
  };
}

class SocialActionPolicy {
  canPerform(action, platform) {
    const type = String(action || "").toUpperCase();
    const cap = limits()[type];
    if (!cap || cap < 1) return { allowed: false, reason: "Action type is not enabled in V2 policy" };

    const recent = stateStore.getActionsInWindow(null, 3600000).filter(item =>
      String(item.platform || "") === String(platform || "") &&
      String(item.businessAction || item.type || "").toUpperCase() === type
    );

    return recent.length < cap
      ? { allowed: true, count: recent.length, cap }
      : { allowed: false, count: recent.length, cap, reason: "V2 side-effect budget exhausted for this action and platform" };
  }

  record(action, platform, targetId, details = {}) {
    stateStore.recordAction(String(action || "").toUpperCase(), targetId || "social_action_" + Date.now(), {
      platform,
      businessAction: String(action || "").toUpperCase(),
      ...details
    });
  }
}

module.exports = new SocialActionPolicy();
