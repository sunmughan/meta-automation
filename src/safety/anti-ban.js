/**
 * src/safety/anti-ban.js
 * Comprehensive anti-ban protection across all platforms.
 *
 * Why this exists: platforms (Threads, Instagram, Facebook, LinkedIn) ban
 * accounts that behave like bots. This module makes automation behave like
 * a careful human: conservative limits, random delays, activity windows,
 * warm-up for new accounts, and automatic cooldown when warning signs appear.
 *
 * Every action MUST pass through AntiBan.check() before executing.
 */

const stateStore = require("../storage/state-store");
const logger = require("../logging/logger");

/**
 * Conservative per-platform limits, well below known ban thresholds.
 * Sources: platform docs, community ban reports, conservative margins.
 * Hourly caps prevent bursts; daily caps prevent sustained abuse.
 */
const PLATFORM_LIMITS = Object.freeze({
  threads: {
    like:     { hour: 20, day: 150 },
    comment:  { hour: 5,  day: 30  },
    reply:    { hour: 5,  day: 30  },
    dm:       { hour: 3,  day: 15  },
    follow:   { hour: 8,  day: 50  },
    publish:  { hour: 1,  day: 4   },
  },
  instagram: {
    like:     { hour: 25, day: 200 },
    comment:  { hour: 4,  day: 25  },
    reply:    { hour: 4,  day: 25  },
    dm:       { hour: 3,  day: 12  },
    follow:   { hour: 6,  day: 40  },
    publish:  { hour: 1,  day: 3   },
  },
  facebook: {
    like:     { hour: 20, day: 150 },
    comment:  { hour: 5,  day: 30  },
    reply:    { hour: 5,  day: 30  },
    dm:       { hour: 4,  day: 20  },
    follow:   { hour: 8,  day: 50  },
    publish:  { hour: 1,  day: 5   },
  },
  linkedin: {
    like:     { hour: 15, day: 100 },
    comment:  { hour: 3,  day: 20  },
    reply:    { hour: 3,  day: 20  },
    dm:       { hour: 3,  day: 15  },
    connect:  { hour: 3,  day: 14  },
    follow:   { hour: 5,  day: 30  },
    publish:  { hour: 1,  day: 2   },
  },
});

/**
 * Minimum seconds between two actions of the same type on the same platform.
 * Prevents machine-gun bursts that trigger instant flags.
 */
const MIN_ACTION_GAP_SECONDS = Object.freeze({
  like: 45,
  comment: 180,
  reply: 180,
  dm: 300,
  follow: 120,
  connect: 300,
  publish: 3600,
});

/**
 * Human activity window (local hour). Automation pauses outside these hours
 * to mimic human sleep. Format: [startHour, endHour].
 */
const ACTIVITY_WINDOW = [7, 23];

/**
 * After this many actions in a session, take a break.
 */
const SESSION_BREAK_AFTER_ACTIONS = 25;
const SESSION_BREAK_MINUTES = [15, 45];

class AntiBan {
  constructor() {
    this.cooldownUntil = 0;
    this.cooldownReason = "";
    this.warningStrikes = 0;
    this.sessionActionCount = 0;
    this.lastBreakAt = 0;
  }

  /**
   * Master check: call before EVERY platform action.
   * @param {string} action - like, comment, reply, dm, follow, connect, publish
   * @param {string} platform - threads, instagram, facebook, linkedin
   * @returns {{ allowed: boolean, reason?: string, delayMs?: number }}
   */
  check(action, platform) {
    const now = Date.now();
    const act = String(action || "").toLowerCase();
    const plat = String(platform || "").toLowerCase();

    // 1. Global cooldown (triggered by warning signs)
    if (now < this.cooldownUntil) {
      const minsLeft = Math.ceil((this.cooldownUntil - now) / 60000);
      return {
        allowed: false,
        reason: `Cooldown active (${minsLeft}m left): ${this.cooldownReason}`,
      };
    }

    // 2. Activity window (human sleep hours)
    const hour = new Date().getHours();
    if (hour < ACTIVITY_WINDOW[0] || hour >= ACTIVITY_WINDOW[1]) {
      return {
        allowed: false,
        reason: `Outside human activity window (${ACTIVITY_WINDOW[0]}:00-${ACTIVITY_WINDOW[1]}:00). Automation sleeps like a human.`,
      };
    }

    // 3. Session break (prevent marathon sessions)
    if (this.sessionActionCount >= SESSION_BREAK_AFTER_ACTIONS &&
        now - this.lastBreakAt > 60 * 60 * 1000) {
      const breakMs = this._randomBetween(SESSION_BREAK_MINUTES[0], SESSION_BREAK_MINUTES[1]) * 60 * 1000;
      this.lastBreakAt = now;
      this.sessionActionCount = 0;
      return {
        allowed: false,
        reason: `Session break: ${SESSION_BREAK_AFTER_ACTIONS} actions done, resting like a human.`,
        delayMs: breakMs,
      };
    }

    // 4. Platform limits (hourly + daily)
    const limits = (PLATFORM_LIMITS[plat] || PLATFORM_LIMITS.threads)[act];
    if (!limits) {
      return { allowed: false, reason: `Unknown action type: ${act}` };
    }

    const hourActions = this._countActions(plat, act, 3600 * 1000);
    if (hourActions >= limits.hour) {
      return {
        allowed: false,
        reason: `Hourly ${act} limit reached on ${plat} (${hourActions}/${limits.hour}).`,
      };
    }

    const dayActions = this._countActions(plat, act, 24 * 3600 * 1000);
    if (dayActions >= limits.day) {
      return {
        allowed: false,
        reason: `Daily ${act} limit reached on ${plat} (${dayActions}/${limits.day}).`,
      };
    }

    // 5. Minimum gap between same-type actions (anti-burst)
    const minGap = (MIN_ACTION_GAP_SECONDS[act] || 60) * 1000;
    const lastAction = this._lastActionTime(plat, act);
    if (lastAction && now - lastAction < minGap) {
      const waitSec = Math.ceil((minGap - (now - lastAction)) / 1000);
      return {
        allowed: false,
        reason: `Too soon since last ${act} on ${plat}. Wait ${waitSec}s (anti-burst).`,
        delayMs: minGap - (now - lastAction),
      };
    }

    // 6. Warm-up: new accounts go slower (first 7 days)
    const accountAge = this._accountAgeDays(plat);
    if (accountAge >= 0 && accountAge < 7) {
      const warmupFactor = 0.3 + (accountAge / 7) * 0.7;
      if (hourActions >= Math.floor(limits.hour * warmupFactor)) {
        return {
          allowed: false,
          reason: `Warm-up mode (day ${accountAge + 1}/7): reduced limits for new account safety.`,
        };
      }
    }

    // All checks passed. Return a human-like random delay before acting.
    const delayMs = this._humanDelay(act);
    this.sessionActionCount++;
    return { allowed: true, delayMs };
  }

  /**
   * Record a completed action for limit tracking.
   */
  record(action, platform, targetId, details = {}) {
    stateStore.recordAction(
      `ANTIBAN_${String(action).toUpperCase()}`,
      targetId || `antiban_${Date.now()}`,
      { platform, action: String(action).toLowerCase(), ...details }
    );
  }

  /**
   * Report a warning sign (captcha, "try again later", action block, etc).
   * Escalates cooldown automatically. Three strikes = long pause.
   */
  reportWarning(platform, signal) {
    this.warningStrikes++;
    const baseCooldown = [30, 120, 480][Math.min(this.warningStrikes - 1, 2)];
    this.cooldownUntil = Date.now() + baseCooldown * 60 * 1000;
    this.cooldownReason = `Warning on ${platform}: ${signal} (strike ${this.warningStrikes})`;
    logger.warn(`[ANTI-BAN] ${this.cooldownReason}. Cooldown ${baseCooldown}m.`);

    if (this.warningStrikes >= 3) {
      this.cooldownUntil = Date.now() + 24 * 3600 * 1000;
      this.cooldownReason = `3 warning strikes on ${platform}. 24h emergency pause.`;
      logger.error(`[ANTI-BAN] EMERGENCY: ${this.cooldownReason}`);
    }
  }

  /**
   * Report a hard block (account restricted, banned). Stops all automation.
   */
  reportBlock(platform, details) {
    this.cooldownUntil = Date.now() + 7 * 24 * 3600 * 1000;
    this.cooldownReason = `BLOCKED on ${platform}: ${details}. 7-day halt. Manual review required.`;
    logger.error(`[ANTI-BAN] BLOCKED: ${this.cooldownReason}`);
  }

  /**
   * Clear warnings after a clean period (called by orchestrator daily).
   */
  resetStrikes() {
    this.warningStrikes = 0;
    this.sessionActionCount = 0;
  }

  _countActions(platform, action, windowMs) {
    try {
      const actions = stateStore.getActionsInWindow(null, windowMs) || [];
      return actions.filter(a => {
        const p = String(a.platform || "").toLowerCase();
        const t = String(a.businessAction || a.type || "").toLowerCase();
        return p === platform && (t === action || t === `antiban_${action}`);
      }).length;
    } catch (_) {
      return 0;
    }
  }

  _lastActionTime(platform, action) {
    try {
      const actions = stateStore.getActionsInWindow(null, 24 * 3600 * 1000) || [];
      const match = actions
        .filter(a => {
          const p = String(a.platform || "").toLowerCase();
          const t = String(a.businessAction || a.type || "").toLowerCase();
          return p === platform && (t === action || t === `antiban_${action}`);
        })
        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))[0];
      return match ? (match.timestamp || 0) : 0;
    } catch (_) {
      return 0;
    }
  }

  _accountAgeDays(platform) {
    try {
      const key = `antiban_account_since_${platform}`;
      let since = stateStore.get(key);
      if (!since) {
        since = Date.now();
        stateStore.set(key, since);
        return 0;
      }
      return Math.floor((Date.now() - since) / (24 * 3600 * 1000));
    } catch (_) {
      return -1;
    }
  }

  _humanDelay(action) {
    const base = {
      like: [3000, 12000],
      comment: [8000, 30000],
      reply: [8000, 30000],
      dm: [10000, 40000],
      follow: [5000, 20000],
      connect: [10000, 30000],
      publish: [5000, 15000],
    }[action] || [5000, 15000];
    return this._randomBetween(base[0], base[1]);
  }

  _randomBetween(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
}

module.exports = new AntiBan();
