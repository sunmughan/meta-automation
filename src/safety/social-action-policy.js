/**
 * V2 side-effect budget.
 * Limits are a safety and quality control, not a mechanism for bypassing platform enforcement.
 *
 * UPGRADED: Now delegates to the anti-ban module for comprehensive protection.
 * These caps are the absolute ceiling; anti-ban enforces stricter per-platform
 * daily/hourly limits, human delays, and activity windows underneath.
 */
const stateStore = require("../storage/state-store");
const antiBan = require("./anti-ban");

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
    const plat = String(platform || "threads").toLowerCase();

    // Anti-ban is the primary gate.
    try {
      const banCheck = antiBan.check(type.toLowerCase(), plat);
      if (!banCheck.allowed) {
        return { allowed: false, reason: `[AntiBan] ${banCheck.reason}`, delayMs: banCheck.delayMs };
      }
    } catch (_) {
      // Fail-open if anti-ban errors.
    }

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
