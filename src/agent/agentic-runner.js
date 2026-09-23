/**
 * src/agent/agentic-runner.js
 * Universal Agentic Browser Loop Engine.
 *
 * THE CORE PRINCIPLE:
 *   LIVE screen → AI observes → AI decides → ONE atomic action → FRESH screen → AI verifies → Loop or Done
 *
 * This is the SINGLE engine that drives ALL browser operations:
 *   - Social media (Threads, LinkedIn, Facebook, Instagram)
 *   - Job platforms (Upwork, Freelancer, Contra, etc.)
 *   - Email (Gmail inbox, verification, responses)
 *   - Meetings (Google Meet, Microsoft Teams)
 *
 * Zero hardcoded selectors. Zero assumed UI structure.
 * Every decision comes from live screen observation + AI reasoning.
 */

const CONFIG = require("../../config");
const logger = require("../logging/logger");
const { ACTION_STATES } = require("./browser-agent");

class AgenticRunner {
  /**
   * @param {Object} options
   * @param {Object} options.aiRuntime — MiniMax M3 AI runtime
   * @param {Object} options.browserAgent — BrowserAgent instance with page
   * @param {number} [options.maxIterations=12] — Safety cap on loop iterations
   * @param {number} [options.snapshotMaxChars=12000] — Max body text in snapshot for AI prompt
   */
  constructor({ aiRuntime, browserAgent, maxIterations, snapshotMaxChars }) {
    if (!aiRuntime) throw new Error("AgenticRunner requires an AI runtime");
    if (!browserAgent) throw new Error("AgenticRunner requires a BrowserAgent");
    this.aiRuntime = aiRuntime;
    this.browserAgent = browserAgent;
    this.maxIterations = maxIterations || CONFIG.JOB_MAX_PLAN_ITERATIONS || 12;
    this.snapshotMaxChars = snapshotMaxChars || 12000;
  }

  /**
   * THE UNIVERSAL AGENTIC LOOP
   *
   * 1. Capture LIVE snapshot of the current browser screen
   * 2. Send snapshot + goal + context to AI for reasoning
   * 3. AI returns: action plan (or terminal state: DONE/BLOCKED/USER_ACTION_REQUIRED)
   * 4. Execute ONE logical action group from the plan
   * 5. Capture FRESH snapshot (never use the pre-action snapshot)
   * 6. AI verifies: did the action produce the expected result?
   * 7. If not done → loop back to step 1 with updated context
   *
   * @param {Object} params
   * @param {string} params.goal — Natural language description of what to achieve
   * @param {Object} [params.context={}] — Operation context (platform, targetId, previous actions, etc.)
   * @param {string[]} [params.allowedOrigins] — Security: restrict navigation to these origins
   * @param {Object} [params.securityPolicy] — Security constraints (noCaptchaBypass, noCredentials, etc.)
   * @param {Object} [params.candidateProfile] — Candidate data for job operations
   * @param {Object} [params.platform] — Platform config object
   * @returns {Promise<Object>} — { status, snapshot, plan, iterations, reason }
   */
  async run({ goal, context = {}, allowedOrigins, securityPolicy, candidateProfile, platform }) {
    const runId = `agentic_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const previousActions = [];
    let lastFailure = null;
    let lastSnapshot = null;

    logger.info(`[AGENTIC RUNNER] Starting goal: "${goal.slice(0, 120)}..." (runId: ${runId})`);

    for (let iteration = 1; iteration <= this.maxIterations; iteration++) {
      // ═══════════════════════════════════════════════════════
      // STEP 1: Capture LIVE snapshot — observe the real screen
      // ═══════════════════════════════════════════════════════
      const snapshot = await this.browserAgent.captureLiveSnapshot(`agentic-${iteration}`);
      lastSnapshot = snapshot;

      // ═══════════════════════════════════════════════════════
      // STEP 2: AI REASONING — send screen to AI for decision
      // ═══════════════════════════════════════════════════════
      const prompt = this.buildReasoningPrompt({
        goal,
        snapshot,
        context,
        iteration,
        previousActions,
        lastFailure,
        candidateProfile,
        platform,
        securityPolicy
      });

      let plan;
      try {
        plan = await this.aiRuntime.callAi(prompt, {
          taskType: "AGENTIC_PLAN",
          priority: 1
        });
      } catch (aiErr) {
        logger.error(`[AGENTIC RUNNER] AI reasoning failed on iteration ${iteration}: ${aiErr.message}`);
        return {
          status: "AI_ERROR",
          iterations: iteration,
          snapshot,
          reason: `AI reasoning failed: ${aiErr.message}`,
          runId
        };
      }

      // Validate plan structure
      if (!plan || typeof plan !== "object") {
        logger.warn(`[AGENTIC RUNNER] AI returned invalid plan on iteration ${iteration}`);
        lastFailure = "AI returned non-object response";
        continue;
      }

      const planStatus = String(plan.status || "").toUpperCase();

      // Log AI reasoning
      if (plan.reasoning) {
        logger.info(`[AGENTIC RUNNER] AI reasoning (iter ${iteration}): ${String(plan.reasoning).slice(0, 200)}`);
      }

      // ═══════════════════════════════════════════════════════
      // STEP 3: Check for TERMINAL states
      // ═══════════════════════════════════════════════════════
      if (planStatus === "DONE") {
        // Capture FRESH snapshot to confirm DONE state
        const doneSnapshot = await this.browserAgent.captureLiveSnapshot(`agentic-done-${iteration}`);
        logger.info(`[AGENTIC RUNNER] Goal achieved in ${iteration} iterations (runId: ${runId})`);
        return {
          status: "DONE",
          iterations: iteration,
          snapshot: doneSnapshot,
          plan,
          data: plan.data || plan.extracted || null,
          reason: plan.reason || "Goal completed",
          runId
        };
      }

      if (["USER_ACTION_REQUIRED", "MANUAL_ACTION_REQUIRED"].includes(planStatus)) {
        logger.warn(`[AGENTIC RUNNER] User action required: ${plan.reason || planStatus}`);
        return {
          status: planStatus,
          iterations: iteration,
          snapshot,
          plan,
          reason: plan.reason || "Human intervention needed",
          runId
        };
      }

      if (planStatus === "BLOCKED") {
        logger.warn(`[AGENTIC RUNNER] Goal blocked: ${plan.reason}`);
        return {
          status: "BLOCKED",
          iterations: iteration,
          snapshot,
          plan,
          reason: plan.reason || "Goal cannot be achieved from current state",
          runId
        };
      }

      if (planStatus === "NEEDS_EMAIL_VERIFICATION") {
        logger.info(`[AGENTIC RUNNER] Email verification required (runId: ${runId})`);
        return {
          status: "NEEDS_EMAIL_VERIFICATION",
          iterations: iteration,
          snapshot,
          plan,
          reason: plan.reason || "Email verification needed",
          nextStep: "CHECK_GMAIL_VERIFICATION",
          runId
        };
      }

      // ═══════════════════════════════════════════════════════
      // STEP 4: Validate and execute the action plan
      // ═══════════════════════════════════════════════════════
      if (!plan.actions || !Array.isArray(plan.actions) || plan.actions.length === 0) {
        logger.warn(`[AGENTIC RUNNER] AI returned no actions on iteration ${iteration}`);
        lastFailure = "AI returned no actionable steps";
        continue;
      }

      // Security: validate allowed origins if configured
      if (allowedOrigins && allowedOrigins.length > 0) {
        const navigateActions = plan.actions.filter(a =>
          String(a.type).toUpperCase() === "NAVIGATE" && a.url
        );
        for (const nav of navigateActions) {
          try {
            const navOrigin = new URL(nav.url).origin;
            if (!allowedOrigins.includes(navOrigin)) {
              logger.warn(`[AGENTIC RUNNER] Blocked navigation to unauthorized origin: ${navOrigin}`);
              plan.actions = plan.actions.filter(a => a !== nav);
            }
          } catch (_) {
            plan.actions = plan.actions.filter(a => a !== nav);
          }
        }
      }

      // Execute via BrowserAgent
      let result;
      try {
        result = await this.browserAgent.executePlan(plan, context.targetId || runId);
      } catch (execErr) {
        logger.error(`[AGENTIC RUNNER] Action execution failed: ${execErr.message}`);
        lastFailure = execErr.message;
        previousActions.push({
          iteration,
          actions: plan.actions.map(a => a.type),
          result: "EXECUTION_ERROR",
          error: execErr.message
        });
        continue;
      }

      // ═══════════════════════════════════════════════════════
      // STEP 5: Capture FRESH snapshot after action execution
      // ═══════════════════════════════════════════════════════
      const postSnapshot = await this.browserAgent.captureLiveSnapshot(`agentic-post-${iteration}`);
      lastSnapshot = postSnapshot;

      // ═══════════════════════════════════════════════════════
      // STEP 6: Record result and check verification
      // ═══════════════════════════════════════════════════════
      const actionRecord = {
        iteration,
        actions: plan.actions.map(a => ({ type: a.type, target: a.target || a.text || "" })),
        success: result.success,
        state: result.state,
        postUrl: postSnapshot.url
      };

      if (!result.success) {
        lastFailure = result.reason || result.state || "Action failed";
        actionRecord.failure = lastFailure;
        logger.warn(`[AGENTIC RUNNER] Action failed on iteration ${iteration}: ${lastFailure}`);
      } else {
        lastFailure = null;

        // If the plan included verification and it returned UNVERIFIED, record as failure for retry
        if (result.state === ACTION_STATES.UNVERIFIED) {
          lastFailure = result.reason || "Post-condition verification failed";
          actionRecord.failure = lastFailure;
          logger.warn(`[AGENTIC RUNNER] Verification unconfirmed on iteration ${iteration}: ${lastFailure}`);
        }
      }

      previousActions.push(actionRecord);

      // ═══════════════════════════════════════════════════════
      // STEP 7: Loop continues — AI will see fresh snapshot next iteration
      // ═══════════════════════════════════════════════════════
    }

    // Max iterations reached without achieving goal
    logger.warn(`[AGENTIC RUNNER] Max iterations (${this.maxIterations}) reached without completing goal (runId: ${runId})`);
    return {
      status: "MAX_ITERATIONS",
      iterations: this.maxIterations,
      snapshot: lastSnapshot,
      reason: "Agentic loop reached configured iteration limit without achieving goal",
      previousActions,
      runId
    };
  }

  /**
   * Builds the universal AI reasoning prompt.
   * The AI receives the LIVE screen and decides what to do.
   * ZERO hardcoded knowledge about any website structure.
   */
  buildReasoningPrompt({ goal, snapshot, context, iteration, previousActions, lastFailure, candidateProfile, platform, securityPolicy }) {
    const parts = [];

    parts.push(`You are an autonomous browser agent. You can ONLY see what's on the screen.
You must figure out what to do by observing the live page — never assume UI structure.
Every decision must come from what you see in the snapshot below.`);

    parts.push(`\nGOAL: ${goal}`);

    // Platform context (if provided)
    if (platform) {
      parts.push(`\nPLATFORM: ${platform.name || platform.id} (${platform.url || ""})`);
    }

    // Live screen state
    parts.push(`\nLIVE SCREEN STATE:`);
    parts.push(`- Current URL: ${snapshot.url || "unknown"}`);
    parts.push(`- Page Title: ${snapshot.title || "untitled"}`);

    if (snapshot.interactiveElements && snapshot.interactiveElements.length > 0) {
      parts.push(`- Interactive Elements (buttons, links, inputs): ${JSON.stringify(snapshot.interactiveElements.slice(0, 50))}`);
    }

    if (snapshot.forms && snapshot.forms.length > 0) {
      parts.push(`- Forms on page: ${JSON.stringify(snapshot.forms.slice(0, 10))}`);
    }

    if (snapshot.activeDialogs && snapshot.activeDialogs.length > 0) {
      parts.push(`- Active Dialogs/Modals: ${JSON.stringify(snapshot.activeDialogs)}`);
    }

    if (snapshot.visibleLinks && snapshot.visibleLinks.length > 0) {
      parts.push(`- Visible Links: ${JSON.stringify(snapshot.visibleLinks.slice(0, 30))}`);
    }

    // Body text excerpt for AI to read page content
    if (snapshot.bodyText) {
      const bodyExcerpt = snapshot.bodyText.slice(0, this.snapshotMaxChars);
      parts.push(`- Visible Text Content:\n${bodyExcerpt}`);
    }

    // Candidate profile (for job operations)
    if (candidateProfile) {
      parts.push(`\nCANDIDATE PROFILE (verified source of truth — use ONLY these facts):`);
      parts.push(JSON.stringify(candidateProfile, null, 0).slice(0, 3000));
    }

    // Operation context
    if (context && Object.keys(context).length > 0) {
      const safeContext = { ...context };
      delete safeContext.previousActions; // Prevent duplication
      delete safeContext.lastSnapshot;
      parts.push(`\nOPERATION CONTEXT: ${JSON.stringify(safeContext)}`);
    }

    // Iteration and history
    parts.push(`\nITERATION: ${iteration} of ${this.maxIterations}`);

    if (previousActions.length > 0) {
      parts.push(`PREVIOUS ACTIONS THIS SESSION:`);
      for (const pa of previousActions.slice(-5)) {
        const actSummary = pa.actions?.map(a => typeof a === "string" ? a : `${a.type}(${a.target || ""})`).join(", ") || "unknown";
        const status = pa.failure ? `FAILED: ${pa.failure}` : `OK → ${pa.postUrl || ""}`;
        parts.push(`  Iter ${pa.iteration}: [${actSummary}] → ${status}`);
      }
    }

    if (lastFailure) {
      parts.push(`\nLAST FAILURE: ${lastFailure}`);
      parts.push(`INSTRUCTION: Adapt your approach based on this failure. Try a different strategy.`);
    }

    // Security policy
    if (securityPolicy) {
      parts.push(`\nSECURITY CONSTRAINTS:`);
      if (securityPolicy.noCaptchaBypass) parts.push(`- Return USER_ACTION_REQUIRED for any CAPTCHA`);
      if (securityPolicy.noCredentials) parts.push(`- Never type passwords or security codes`);
      if (securityPolicy.noPayment) parts.push(`- Never authorize payments or purchases`);
    }

    // Rules
    parts.push(`
RULES:
1. Decide ONLY from what you see on screen right now.
2. Use semantic locators: visible text, aria-label, role, placeholder, name — NEVER CSS selectors or XPath.
3. Return one logical action group per iteration (1-5 related actions max).
4. Return status "DONE" ONLY when visible evidence on screen confirms the goal is completed.
5. Return "USER_ACTION_REQUIRED" for CAPTCHA, 2FA, payment, phone verification, or identity checks.
6. Return "BLOCKED" when the goal is impossible from the current screen state.
7. Return "NEEDS_EMAIL_VERIFICATION" when email verification is required before proceeding.
8. Never fabricate or assume UI elements that aren't in the snapshot.
9. Never type passwords or bypass security challenges.
10. For each action, specify the target using the visible text or aria-label you see.

OUTPUT FORMAT (JSON only):
{
  "status": "READY" | "DONE" | "BLOCKED" | "USER_ACTION_REQUIRED" | "NEEDS_EMAIL_VERIFICATION",
  "reasoning": "What I see on screen and why I chose this action",
  "actions": [
    { "type": "CLICK|TYPE|SCROLL|NAVIGATE|PRESS|WAIT|UPLOAD|EXTRACT|STOP", "target": "visible text or aria-label", "value": "text to type (for TYPE)" }
  ],
  "verification": { "expected": "what should appear on screen after this action", "type": "TEXT|COMMENT|DM" },
  "data": {},
  "reason": "explanation if DONE/BLOCKED/USER_ACTION_REQUIRED"
}`);

    return parts.join("\n");
  }
}

module.exports = AgenticRunner;
