/**
 * src/safety/platform-safety-guard.js
 * Centralized, fail-closed platform safety and policy guard.
 * Evaluates semantic action categories, enforces declarative platform policies,
 * manages security challenge quarantine, circuit breaker, rate limit budgets,
 * and guarantees zero bypass of platform authentication/security checks.
 */

const fs = require("fs");
const path = require("path");
const CONFIG = require("../../config");
const logger = require("../logging/logger");
const telemetry = require("../telemetry/action-telemetry");

const ACTION_CATEGORIES = Object.freeze([
  "DISCOVERY",
  "NAVIGATION",
  "READ",
  "PROFILE_EDIT",
  "LOGIN",
  "LEARNING",
  "APPLICATION",
  "MESSAGE",
  "COMMENT",
  "DM",
  "POST",
  "UPLOAD",
  "SUBMIT",
  "ACCOUNT_SECURITY"
]);

const HIGH_SEVERITY_SECURITY_EVENTS = Object.freeze([
  "CAPTCHA",
  "RECAPTCHA",
  "HCAPTCHA",
  "CLOUDFLARE_TURNSTILE",
  "MFA",
  "OTP",
  "PHONE_VERIFICATION",
  "IDENTITY_VERIFICATION",
  "PROCTORING",
  "ACCOUNT_RESTRICTION",
  "SUSPICIOUS_LOGIN",
  "SECURITY_CHECKPOINT",
  "PAYMENT_VERIFICATION"
]);

class PlatformSafetyGuard {
  constructor(options = {}) {
    this.policyPath = options.policyPath || path.resolve(CONFIG.ROOT_DIR, "config", "platform-safety-policy.json");
    this.safetyStatePath = options.safetyStatePath || path.resolve(CONFIG.ROOT_DIR, "job-state", "safety-state.json");
    this.policy = this.loadPolicy();
    this.safetyState = this.loadSafetyState();
    this.runCounters = new Map(); // key: platform:actionType
    this.activeActions = new Map(); // key: platform -> count
  }

  loadPolicy() {
    try {
      if (fs.existsSync(this.policyPath)) {
        return JSON.parse(fs.readFileSync(this.policyPath, "utf8"));
      }
    } catch (err) {
      logger.warn(`[SAFETY GUARD] Failed loading policy file ${this.policyPath}: ${err.message}`);
    }
    return {
      version: 1,
      defaultPolicy: {
        automationPolicy: "HUMAN_APPROVAL_REQUIRED",
        maxActionsPerRun: 10,
        maxActionsPerHour: 15,
        maxActionsPerDay: 50,
        maxConcurrentActions: 1,
        stopOnCaptcha: true,
        stopOnMfa: true,
        stopOnIdentityVerification: true,
        stopOnSecurityChallenge: true
      },
      platforms: {}
    };
  }

  loadSafetyState() {
    try {
      if (fs.existsSync(this.safetyStatePath)) {
        return JSON.parse(fs.readFileSync(this.safetyStatePath, "utf8"));
      }
    } catch (err) {
      logger.warn(`[SAFETY GUARD] Failed loading safety state file ${this.safetyStatePath}: ${err.message}`);
    }
    return {
      version: 1,
      lastUpdated: new Date().toISOString(),
      platforms: {}
    };
  }

  saveSafetyState() {
    try {
      fs.mkdirSync(path.dirname(this.safetyStatePath), { recursive: true });
      this.safetyState.lastUpdated = new Date().toISOString();
      const nonce = Math.random().toString(36).slice(2, 8);
      const tmp = `${this.safetyStatePath}.tmp.${Date.now()}.${process.pid}.${nonce}`;
      fs.writeFileSync(tmp, JSON.stringify(this.safetyState, null, 2), "utf8");
      fs.renameSync(tmp, this.safetyStatePath);
    } catch (err) {
      logger.warn(`[SAFETY GUARD] Failed saving safety state: ${err.message}`);
    }
  }

  getPlatformPolicy(platformId) {
    if (!platformId) return null;
    const normalized = String(platformId).toLowerCase().trim();
    return this.policy.platforms?.[normalized] || null;
  }

  getAccountState(platformId, account = "default") {
    const platKey = String(platformId).toLowerCase().trim();
    if (!this.safetyState.platforms[platKey]) {
      this.safetyState.platforms[platKey] = {};
    }
    if (!this.safetyState.platforms[platKey][account]) {
      this.safetyState.platforms[platKey][account] = {
        platform: platKey,
        account,
        status: "ACTIVE", // ACTIVE | QUARANTINED | COOLDOWN | USER_ACTION_REQUIRED
        riskLevel: "NORMAL", // NORMAL | ELEVATED | HIGH | CRITICAL
        securityEvents: [],
        lastChallengeAt: null,
        cooldownUntil: null,
        quarantinedAt: null,
        actionHistory: [],
        reason: ""
      };
    }
    return this.safetyState.platforms[platKey][account];
  }

  /**
   * Evaluates if a consequential action can safely execute under current policy and state.
   * Fail-Closed design: anything unknown or unpermitted is blocked.
   */
  evaluateAction({
    platform,
    account = "default",
    actionType,
    workflow = "GENERAL",
    currentRiskState = "NORMAL",
    details = {}
  }) {
    // 1. Unknown platform -> FAIL CLOSED
    if (!platform) {
      return { allowed: false, status: "BLOCKED", reason: "Platform ID is required" };
    }
    const platKey = String(platform).toLowerCase().trim();
    const platPolicy = this.getPlatformPolicy(platKey);
    if (!platPolicy) {
      return { allowed: false, status: "BLOCKED", reason: `Unknown platform policy: ${platform}` };
    }

    // 2. Unknown action category -> FAIL CLOSED
    const normalizedAction = String(actionType || "").toUpperCase().trim();
    if (!ACTION_CATEGORIES.includes(normalizedAction)) {
      return { allowed: false, status: "BLOCKED", reason: `Unknown action category: ${actionType}` };
    }

    // 3. Inspect account safety state (Quarantine / Circuit Breaker)
    const accState = this.getAccountState(platKey, account);
    if (accState.status === "QUARANTINED") {
      return {
        allowed: false,
        status: "QUARANTINED",
        reason: `Account/platform is quarantined: ${accState.reason || "Security challenge encountered"}`
      };
    }
    if (accState.cooldownUntil && Date.now() < Date.parse(accState.cooldownUntil)) {
      return {
        allowed: false,
        status: "RATE_LIMITED",
        reason: `Account/platform is in cooldown until ${accState.cooldownUntil} due to previous security event`
      };
    }

    // 4. Concurrency check
    const activeCount = this.activeActions.get(platKey) || 0;
    const maxConcurrent = Number(platPolicy.maxConcurrentActions ?? 1);
    if (activeCount >= maxConcurrent) {
      return {
        allowed: false,
        status: "RATE_LIMITED",
        reason: `Concurrent action limit reached (${activeCount}/${maxConcurrent}) on ${platKey}`
      };
    }

    // 5. Evaluate platform-level automation policy
    const policyMode = String(platPolicy.automationPolicy || "HUMAN_APPROVAL_REQUIRED").toUpperCase();
    if (policyMode === "DISABLED") {
      return { allowed: false, status: "BLOCKED", reason: `Automation is disabled on ${platform}` };
    }
    if (policyMode === "DISCOVERY_ONLY" && !["DISCOVERY", "NAVIGATION", "READ"].includes(normalizedAction)) {
      return { allowed: false, status: "BLOCKED", reason: `Platform ${platform} is restricted to discovery only` };
    }
    if (policyMode === "HUMAN_APPROVAL_REQUIRED") {
      return {
        allowed: false,
        status: "USER_ACTION_REQUIRED",
        reason: `Platform policy requires human approval for actions on ${platform}`,
        approvalRequired: true,
        actionDetails: { platform, account, workflow, actionType: normalizedAction, reason: "Platform approval policy" }
      };
    }

    // 6. Action-specific permission gates
    if (normalizedAction === "ACCOUNT_SECURITY") {
      return {
        allowed: false,
        status: "USER_ACTION_REQUIRED",
        reason: "Account security modifications strictly require human intervention",
        approvalRequired: true
      };
    }
    if (normalizedAction === "PROFILE_EDIT" && !platPolicy.allowAutoProfileEdit) {
      return {
        allowed: false,
        status: "USER_ACTION_REQUIRED",
        reason: `Auto profile editing is not permitted on ${platform}`,
        approvalRequired: true
      };
    }
    if (normalizedAction === "APPLICATION" && !platPolicy.allowAutoApplication) {
      return {
        allowed: false,
        status: "USER_ACTION_REQUIRED",
        reason: `Auto application submission is not permitted on ${platform}`,
        approvalRequired: true
      };
    }
    if (normalizedAction === "SUBMIT" && workflow.includes("APPLICATION") && !platPolicy.allowAutoApplication) {
      return {
        allowed: false,
        status: "USER_ACTION_REQUIRED",
        reason: `Auto application submission is not permitted on ${platform}`,
        approvalRequired: true
      };
    }
    if (normalizedAction === "SUBMIT" && workflow.includes("POST") && !platPolicy.allowAutoPosting) {
      return {
        allowed: false,
        status: "USER_ACTION_REQUIRED",
        reason: `Auto posting is not permitted on ${platform}`,
        approvalRequired: true
      };
    }
    if (normalizedAction === "LEARNING" && !platPolicy.allowAutoLearning) {
      return {
        allowed: false,
        status: "USER_ACTION_REQUIRED",
        reason: `Auto learning is not permitted on ${platform}`,
        approvalRequired: true
      };
    }
    if (normalizedAction === "COMMENT" && !platPolicy.allowAutoCommenting) {
      return {
        allowed: false,
        status: "USER_ACTION_REQUIRED",
        reason: `Auto commenting is not permitted on ${platform}`,
        approvalRequired: true
      };
    }
    if (normalizedAction === "POST" && !platPolicy.allowAutoPosting) {
      return {
        allowed: false,
        status: "USER_ACTION_REQUIRED",
        reason: `Auto posting is not permitted on ${platform}`,
        approvalRequired: true
      };
    }
    if ((normalizedAction === "DM" || normalizedAction === "MESSAGE") && (!platPolicy.allowAutoDM && !platPolicy.allowAutoMessaging)) {
      return {
        allowed: false,
        status: "USER_ACTION_REQUIRED",
        reason: `Auto direct messaging is not permitted on ${platform}`,
        approvalRequired: true
      };
    }
    if (normalizedAction === "LOGIN" && !platPolicy.allowAutoLogin) {
      return {
        allowed: false,
        status: "USER_ACTION_REQUIRED",
        reason: `Auto login is not permitted on ${platform}`,
        approvalRequired: true
      };
    }

    // 7. Rate limits / Action Budgets
    const budgetCheck = this.checkActionBudget(platKey, account, platPolicy, normalizedAction);
    if (!budgetCheck.allowed) {
      return {
        allowed: false,
        status: "RATE_LIMITED",
        reason: budgetCheck.reason
      };
    }

    return {
      allowed: true,
      status: "ALLOWED",
      policy: platPolicy
    };
  }

  checkActionBudget(platformId, account, policy, actionType) {
    const accState = this.getAccountState(platformId, account);
    const history = accState.actionHistory || [];
    const now = Date.now();

    // 1 Hour window
    const oneHourAgo = now - 3600 * 1000;
    const pastHourActions = history.filter(a => Date.parse(a.timestamp || 0) >= oneHourAgo);
    const maxHour = Number(policy.maxActionsPerHour ?? 30);
    if (pastHourActions.length >= maxHour) {
      return {
        allowed: false,
        reason: `Hourly action limit reached (${pastHourActions.length}/${maxHour}) on ${platformId}`
      };
    }

    // 24 Hour window
    const oneDayAgo = now - 24 * 3600 * 1000;
    const pastDayActions = history.filter(a => Date.parse(a.timestamp || 0) >= oneDayAgo);
    const maxDay = Number(policy.maxActionsPerDay ?? 100);
    if (pastDayActions.length >= maxDay) {
      return {
        allowed: false,
        reason: `Daily action limit reached (${pastDayActions.length}/${maxDay}) on ${platformId}`
      };
    }

    // Per-run limit
    const runKey = `${platformId}:${account}`;
    const currentRun = this.runCounters.get(runKey) || 0;
    const maxRun = Number(policy.maxActionsPerRun ?? 20);
    if (currentRun >= maxRun) {
      return {
        allowed: false,
        reason: `Per-run action limit reached (${currentRun}/${maxRun}) on ${platformId}`
      };
    }

    return { allowed: true };
  }

  acquireSlot(platformId) {
    const platKey = String(platformId).toLowerCase().trim();
    const count = this.activeActions.get(platKey) || 0;
    this.activeActions.set(platKey, count + 1);
  }

  releaseSlot(platformId) {
    const platKey = String(platformId).toLowerCase().trim();
    const count = this.activeActions.get(platKey) || 0;
    this.activeActions.set(platKey, Math.max(0, count - 1));
  }

  recordSuccessfulAction(platformId, account = "default", actionType, details = {}) {
    const platKey = String(platformId).toLowerCase().trim();
    const accState = this.getAccountState(platKey, account);
    const now = new Date().toISOString();

    const entry = {
      actionType: String(actionType).toUpperCase(),
      timestamp: now,
      correlationId: details.correlationId || `act_${Date.now()}`
    };

    if (!accState.actionHistory) accState.actionHistory = [];
    accState.actionHistory.push(entry);

    // Keep history manageable
    if (accState.actionHistory.length > 500) {
      accState.actionHistory = accState.actionHistory.slice(-500);
    }

    const runKey = `${platKey}:${account}`;
    this.runCounters.set(runKey, (this.runCounters.get(runKey) || 0) + 1);

    this.saveSafetyState();
  }

  /**
   * Evaluates text/snapshot for security challenge indicators without attempting bypass.
   */
  detectSecurityChallenge(snapshotOrText) {
    if (!snapshotOrText) return { detected: false };

    let text = "";
    if (typeof snapshotOrText === "string") {
      text = snapshotOrText.toLowerCase();
    } else {
      text = [
        snapshotOrText.title || "",
        snapshotOrText.url || "",
        snapshotOrText.bodyText || "",
        snapshotOrText.bodySnippet || ""
      ].join(" ").toLowerCase();
    }

    const challengePatterns = [
      { type: "CAPTCHA", test: /captcha|recaptcha|hcaptcha|arkoselabs|funcaptcha/i },
      { type: "CLOUDFLARE_TURNSTILE", test: /cf-turnstile|turnstile challenge|checking your browser/i },
      { type: "MFA", test: /two-factor authentication|enter 6-digit code|authenticator app|2-step verification/i },
      { type: "OTP", test: /enter the code sent to|verification code sent|one-time passcode/i },
      { type: "PHONE_VERIFICATION", test: /verify your phone number|sms code|phone verification/i },
      { type: "IDENTITY_VERIFICATION", test: /verify your identity|upload government-issued id|identity checkpoint|passport verification/i },
      { type: "SUSPICIOUS_LOGIN", test: /suspicious login attempt|unusual activity detected|verify it's you|device not recognized/i },
      { type: "ACCOUNT_RESTRICTION", test: /your account has been restricted|temporarily locked|account suspended|checkpoint required/i },
      { type: "SECURITY_CHECKPOINT", test: /security checkpoint|we detected automated behavior|prove you are human/i },
      { type: "PROCTORING", test: /proctored exam|webcam access required|screen recording permission/i }
    ];

    for (const pat of challengePatterns) {
      if (pat.test.test(text)) {
        return {
          detected: true,
          type: pat.type,
          evidence: `Matched security challenge pattern: ${pat.type}`
        };
      }
    }

    return { detected: false };
  }

  /**
   * Records a security event.
   * High-severity challenges immediately quarantine the account.
   * Repeated events trigger the safety circuit breaker.
   */
  recordSecurityEvent(platformId, eventType, details = {}) {
    const platKey = String(platformId).toLowerCase().trim();
    const account = details.account || "default";
    const accState = this.getAccountState(platKey, account);
    const now = new Date().toISOString();
    const normalizedEvent = String(eventType || "SECURITY_CHALLENGE").toUpperCase().trim();

    const sanitizedDetails = {
      platform: platKey,
      eventType: normalizedEvent,
      timestamp: now,
      reason: details.reason || "Live page indicated security challenge",
      url: details.url ? String(details.url).split("?")[0] : undefined // redact query params
    };

    accState.securityEvents.push(sanitizedDetails);
    accState.lastChallengeAt = now;

    const isHighSeverity = HIGH_SEVERITY_SECURITY_EVENTS.includes(normalizedEvent);
    const eventCount = accState.securityEvents.length;

    // Circuit Breaker:
    // High severity OR 3+ events -> QUARANTINED
    // 2 events -> COOLDOWN (30 mins)
    // 1 event -> WARNING
    if (isHighSeverity || eventCount >= 3) {
      accState.status = "QUARANTINED";
      accState.riskLevel = "CRITICAL";
      accState.quarantinedAt = now;
      accState.reason = `Security quarantine triggered by ${normalizedEvent} (total events: ${eventCount})`;
    } else if (eventCount === 2) {
      accState.status = "COOLDOWN";
      accState.riskLevel = "ELEVATED";
      accState.cooldownUntil = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      accState.reason = `Cooldown active after repeated security event (${eventCount})`;
    } else {
      accState.riskLevel = "ELEVATED";
      accState.reason = `Security warning: ${normalizedEvent}`;
    }

    this.saveSafetyState();

    // Log telemetry (guaranteed sanitized)
    telemetry.record({
      type: "SECURITY_CHALLENGE_OBSERVED",
      platform: platKey,
      action: "SECURITY_GUARD",
      state: accState.status,
      failureReason: accState.reason,
      evidence: { eventType: normalizedEvent, totalEvents: eventCount }
    });

    logger.warn(`[SAFETY GUARD] Platform ${platKey} account ${account} state changed to ${accState.status}: ${accState.reason}`);

    return {
      quarantined: accState.status === "QUARANTINED",
      status: accState.status,
      riskLevel: accState.riskLevel,
      reason: accState.reason
    };
  }

  resolveQuarantine(platformId, account = "default", reviewer = "human") {
    const platKey = String(platformId).toLowerCase().trim();
    const accState = this.getAccountState(platKey, account);

    accState.status = "ACTIVE";
    accState.riskLevel = "NORMAL";
    accState.cooldownUntil = null;
    accState.quarantinedAt = null;
    accState.securityEvents = [];
    accState.reason = `Quarantine resolved by ${reviewer} at ${new Date().toISOString()}`;

    this.saveSafetyState();
    logger.info(`[SAFETY GUARD] Resolved quarantine for ${platKey}:${account} by ${reviewer}`);
    return accState;
  }
}

const platformSafetyGuard = new PlatformSafetyGuard();

module.exports = {
  PlatformSafetyGuard,
  platformSafetyGuard,
  ACTION_CATEGORIES,
  HIGH_SEVERITY_SECURITY_EVENTS
};
