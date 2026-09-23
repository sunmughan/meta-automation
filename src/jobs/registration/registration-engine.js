/**
 * src/jobs/registration/registration-engine.js
 * Agentic Platform Registration Engine.
 *
 * Handles the complete registration flow for all 10 job platforms:
 *   1. Try Google OAuth ("Continue with Google") first
 *   2. If unavailable, manual registration with candidate profile data
 *   3. Email verification via Gmail when required
 *
 * ZERO hardcoded selectors — AI observes each platform's unique sign-up UI.
 */

const CONFIG = require("../../../config");
const AgenticRunner = require("../../agent/agentic-runner");
const jobState = require("../storage/job-state-store");
const logger = require("../../logging/logger");

/**
 * Attempts to register/authenticate on a platform.
 * Strategy: Google OAuth first → manual registration fallback → email verification if needed.
 *
 * @param {Object} params
 * @param {Object} params.platform — Platform config { id, name, url, mode }
 * @param {Object} params.page — Puppeteer page instance
 * @param {Object} params.browserAgent — BrowserAgent instance
 * @param {Object} params.aiRuntime — AI runtime
 * @param {Object} params.candidateProfile — Candidate data
 * @returns {Promise<Object>} — { status, authenticated, nextStep? }
 */
async function registerOnPlatform({ platform, page, browserAgent, aiRuntime, candidateProfile }) {
  const runner = new AgenticRunner({ aiRuntime, browserAgent, maxIterations: 15 });
  const allowedOrigins = [
    new URL(platform.url).origin,
    CONFIG.GOOGLE_AUTH_ORIGIN,
    "https://accounts.google.com",
    "https://myaccount.google.com"
  ];

  logger.info(`[REGISTRATION] Starting registration flow on ${platform.name} (${platform.url})`);

  // ═══════════════════════════════════════════════════
  // STEP 1: Try Google OAuth first
  // ═══════════════════════════════════════════════════
  const googleResult = await runner.run({
    goal: `On ${platform.name} (${platform.url}), I need to sign in or create an account.
First, check if I'm already logged in (look for dashboard, profile, or account indicators).
If already authenticated, return DONE.

If NOT authenticated, look for these sign-in options (in priority order):
1. "Sign in with Google" / "Continue with Google" / Google OAuth button
2. "Sign up with Google" / "Register with Google"
3. Any Google/Gmail authentication option

If a Google sign-in option exists:
- Click it
- On the Google account chooser, select the account: ${CONFIG.GOOGLE_ACCOUNT_EMAIL}
- If the account is already listed, click it
- If prompted to allow access/permissions, click "Allow" / "Continue"
- Wait for redirect back to ${platform.name}
- Verify authentication by checking for dashboard/profile elements

If NO Google OAuth option exists on this platform, return BLOCKED with reason "NO_GOOGLE_OAUTH".
If CAPTCHA, phone verification, or 2FA is required, return USER_ACTION_REQUIRED.
Never type a Google password — the account should already be signed into the browser.`,
    context: {
      workflow: "GOOGLE_OAUTH_ATTEMPT",
      platform: platform.id,
      targetId: `auth:${platform.id}`
    },
    allowedOrigins,
    securityPolicy: { noCaptchaBypass: true, noCredentials: true },
    platform,
    candidateProfile
  });

  if (googleResult.status === "DONE") {
    logger.info(`[REGISTRATION] Successfully authenticated on ${platform.name} via Google OAuth`);
    jobState.setPlatformState(platform.id, {
      status: "AUTHENTICATED",
      method: "GOOGLE_OAUTH",
      authenticatedAt: new Date().toISOString()
    });
    return { status: "AUTHENTICATED", method: "GOOGLE_OAUTH", result: googleResult };
  }

  if (googleResult.status === "USER_ACTION_REQUIRED") {
    logger.warn(`[REGISTRATION] User action required on ${platform.name}: ${googleResult.reason}`);
    jobState.setPlatformState(platform.id, {
      status: "USER_ACTION_REQUIRED",
      reason: googleResult.reason
    });
    return { status: "USER_ACTION_REQUIRED", reason: googleResult.reason, result: googleResult };
  }

  // ═══════════════════════════════════════════════════
  // STEP 2: Manual registration (Google OAuth not available)
  // ═══════════════════════════════════════════════════
  if (googleResult.reason && googleResult.reason.includes("NO_GOOGLE_OAUTH")) {
    logger.info(`[REGISTRATION] Google OAuth not available on ${platform.name}. Attempting manual registration...`);

    const registerResult = await runner.run({
      goal: `On ${platform.name}, I need to create a new account manually.
Find the "Sign Up" / "Register" / "Create Account" / "Get Started" page or link.

Fill the registration form using ONLY these verified candidate facts:
- Full Name: ${candidateProfile.name || ""}
- Email: ${CONFIG.GOOGLE_ACCOUNT_EMAIL}
- For any username field, use a professional variation of the name
- For password: return USER_ACTION_REQUIRED (never create passwords autonomously)

If the form has additional fields (title, company, skills, etc.):
- Fill them from the candidate profile if data is available
- Leave optional fields empty rather than guessing
- Return USER_ACTION_REQUIRED for required fields not in the candidate profile

Submit the registration form.
If email verification is required (verify email page, "check your email" message), return status "NEEDS_EMAIL_VERIFICATION".
If registration succeeds directly, verify authentication and return DONE.

Never bypass CAPTCHA — return USER_ACTION_REQUIRED instead.`,
      context: {
        workflow: "MANUAL_REGISTRATION",
        platform: platform.id,
        targetId: `register:${platform.id}`
      },
      allowedOrigins,
      securityPolicy: { noCaptchaBypass: true },
      platform,
      candidateProfile
    });

    if (registerResult.status === "DONE") {
      logger.info(`[REGISTRATION] Successfully registered on ${platform.name} manually`);
      jobState.setPlatformState(platform.id, {
        status: "AUTHENTICATED",
        method: "MANUAL_REGISTRATION",
        authenticatedAt: new Date().toISOString()
      });
      return { status: "AUTHENTICATED", method: "MANUAL_REGISTRATION", result: registerResult };
    }

    if (registerResult.status === "NEEDS_EMAIL_VERIFICATION") {
      logger.info(`[REGISTRATION] Email verification required for ${platform.name}`);
      jobState.setPlatformState(platform.id, {
        status: "NEEDS_EMAIL_VERIFICATION",
        method: "MANUAL_REGISTRATION"
      });
      return {
        status: "NEEDS_EMAIL_VERIFICATION",
        method: "MANUAL_REGISTRATION",
        nextStep: "CHECK_GMAIL_VERIFICATION",
        platform: platform.id,
        result: registerResult
      };
    }

    jobState.setPlatformState(platform.id, {
      status: registerResult.status || "FAILED",
      reason: registerResult.reason
    });
    return { status: registerResult.status || "FAILED", reason: registerResult.reason, result: registerResult };
  }

  // Google OAuth failed for other reasons
  jobState.setPlatformState(platform.id, {
    status: googleResult.status || "FAILED",
    reason: googleResult.reason
  });
  return { status: googleResult.status || "FAILED", reason: googleResult.reason, result: googleResult };
}

module.exports = { registerOnPlatform };
