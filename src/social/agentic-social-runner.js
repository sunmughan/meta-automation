/**
 * Cross-platform end-to-end agentic social runner.
 * Uses one universal browser agent for Threads, Facebook, and LinkedIn.
 * The model sees the live page and chooses one semantic action at a time.
 */

const crypto = require("crypto");
const CONFIG = require("../../config");
const browserManager = require("../browser/browser-manager");
const aiRuntime = require("../ai/ai-runtime");
const GlobalGuard = require("../safety/global-guard");
const { UniversalBrowserAgent } = require("../agent/universal-browser-agent");
const VisualFallback = require("../agent/visual-fallback");
const NextBestAction = require("../agentic/next-best-action");
const relationshipEngine = require("../leads/relationship-engine");
const identityGraph = require("../leads/identity-graph");
const rateLimiter = require("../safety/rate-limiter");
const telemetry = require("../telemetry/action-telemetry");
const logger = require("../logging/logger");

const PLATFORM_STARTS = {
  threads: CONFIG.THREADS_HOME,
  facebook: CONFIG.FACEBOOK_HOME,
  linkedin: CONFIG.LINKEDIN_HOME
};

const PLATFORM_ORIGINS = {
  threads: "https://www.threads.com",
  facebook: "https://www.facebook.com",
  linkedin: "https://www.linkedin.com"
};

const SIDE_EFFECT_ACTIONS = new Set(["COMMENT", "REPLY", "DM", "CONNECT", "FOLLOW", "PUBLISH"]);

function buildAgentPlanPrompt({ platform, goal, snapshot, nextAction, visualEvidence, previous }) {
  return [
    "You are the execution planner inside a browser agent.",
    "The browser is the only source of truth.",
    "Use only the semantic elements in the current snapshot.",
    "Never output CSS selectors, XPath, regex, JavaScript snippets, or coordinates.",
    "Every interactive action target must use target.elementId from the current snapshot.",
    "Choose at most ONE action.",
    "Allowed execution actions: NAVIGATE, CLICK, TYPE, PRESS, SCROLL, WAIT, EXTRACT, STOP.",
    "For a side effect, set businessAction to the corresponding category.",
    "Do not post, send, follow, connect, or publish unless the next-best-action decision explicitly selects it.",
    "When a target is ambiguous, WAIT or EXTRACT instead of guessing.",
    "If security or login is visible, choose STOP.",
    "Return strict JSON.",
    "",
    "PLATFORM: " + platform,
    "GOAL: " + goal,
    "NEXT BEST ACTION:",
    JSON.stringify(nextAction || {}),
    "VISUAL RECOVERY EVIDENCE:",
    JSON.stringify(visualEvidence || {}),
    "PREVIOUS EXECUTION:",
    JSON.stringify(previous || []),
    "CURRENT LIVE SNAPSHOT:",
    JSON.stringify(snapshot),
    "",
    "SCHEMA:",
    JSON.stringify({
      status: "ACT or WAIT or STOP",
      reasoning: "string",
      action: {
        type: "CLICK",
        target: { elementId: 1 },
        value: "",
        clear: false
      },
      businessAction: "COMMENT"
    })
  ].join("\n");
}

async function verifyTransition({ platform, before, after, action }) {
  const prompt = [
    "You are an evidence verifier.",
    "Compare the two live browser observations and determine whether the requested action produced the expected visible change.",
    "Do not infer hidden state.",
    "Return JSON with verified, reason, and evidence.",
    "",
    "PLATFORM: " + platform,
    "ACTION:",
    JSON.stringify(action),
    "BEFORE:",
    JSON.stringify(before),
    "AFTER:",
    JSON.stringify(after)
  ].join("\n");

  return aiRuntime.callAi(prompt, {
    taskType: "ACTION_VERIFICATION",
    priority: 0,
    retries: 1
  });
}

class AgenticSocialRunner {
  constructor(options = {}) {
    this.aiRuntime = options.aiRuntime || aiRuntime;
    this.guard = new GlobalGuard({ aiRuntime: this.aiRuntime });
    this.visualFallback = new VisualFallback({ aiRuntime: this.aiRuntime });
    this.nextBestAction = new NextBestAction({ aiRuntime: this.aiRuntime });
    this.maxIterations = Number(options.maxIterations || process.env.SOCIAL_AGENT_MAX_ITERATIONS || 8);
  }

  async runPlatform(platform, goal) {
    const page = await this.getPage(platform);
    const agent = new UniversalBrowserAgent(page, platform);
    const correlation = "social_" + Date.now() + "_" + crypto.randomBytes(4).toString("hex");

    if (!page.url().startsWith(PLATFORM_ORIGINS[platform])) {
      await page.goto(PLATFORM_STARTS[platform], {
        waitUntil: "domcontentloaded",
        timeout: 60000
      });
    }

    let previous = [];
    let visualEvidence = null;

    for (let iteration = 1; iteration <= this.maxIterations; iteration += 1) {
      const snapshot = await agent.captureLiveSnapshot("agentic-" + iteration);
      const guard = await this.guard.inspect(snapshot, platform);
      if (!guard.safe) {
        return {
          platform,
          status: "MANUAL_ACTION_REQUIRED",
          reason: guard.reason,
          iteration
        };
      }

      const people = [];
      for (const card of snapshot.visibleCards || []) {
        if (!card.author) continue;
        const person = identityGraph.findOrCreate({
          platform,
          username: card.author,
          displayName: card.author,
          url: ""
        });
        relationshipEngine.ensurePerson(person.id, {
          displayName: person.displayName
        });
        relationshipEngine.attachIdentity(person.id, {
          platform,
          username: card.author,
          displayName: card.author,
          url: ""
        });
        people.push(relationshipEngine.get(person.id));
      }

      const nextAction = await this.nextBestAction.decide({
        platform,
        snapshot,
        people,
        goal
      });

      if (String(nextAction?.action || "").toUpperCase() === "STOP") {
        return {
          platform,
          status: "DONE",
          reason: nextAction?.rationale || "Agent chose to stop",
          iteration
        };
      }

      const planPrompt = buildAgentPlanPrompt({
        platform,
        goal,
        snapshot,
        nextAction,
        visualEvidence,
        previous
      });

      let plan = await this.aiRuntime.callAi(planPrompt, {
        taskType: "AGENTIC_PLAN",
        priority: 1
      });

      if (!plan || typeof plan !== "object") {
        throw new Error("Agent planner returned invalid plan");
      }

      const action = plan.action;
      if (!action || !action.type) {
        previous.push({ iteration, result: "NO_ACTION", reasoning: plan.reasoning || "" });
        continue;
      }

      const businessAction = String(plan.businessAction || "").toUpperCase();
      if (SIDE_EFFECT_ACTIONS.has(businessAction)) {
        const allowed = rateLimiter.canPerformAction(
          businessAction === "DM" ? "DM_REPLY" : "COMMENT",
          platform
        );
        if (!allowed.allowed) {
          previous.push({ iteration, result: "RATE_LIMITED", reason: allowed.reason });
          await new Promise(resolve => setTimeout(resolve, 1200));
          continue;
        }
      }

      try {
        agent.validatePlan({ actions: [action] });
        const before = snapshot;
        const result = await agent.executePlan({ actions: [action] }, correlation);
        const after = await agent.captureLiveSnapshot("agentic-after-" + iteration);
        const verification = await verifyTransition({
          platform,
          before,
          after,
          action
        });

        telemetry.record({
          type: verification?.verified ? "ACTION_VERIFIED" : "ACTION_UNVERIFIED",
          platform,
          action: String(action.type || "").toUpperCase(),
          state: verification?.verified ? "VERIFIED" : "UNVERIFIED",
          correlationId: correlation,
          pageUrl: page.url(),
          evidence: verification
        });

        previous.push({
          iteration,
          action: action.type,
          businessAction,
          result,
          verification
        });

        if (!verification?.verified && action.target?.elementId) {
          visualEvidence = await this.visualFallback.inspect(
            page,
            "Recover the intended control for the last planned action",
            after,
            platform
          );
        } else {
          visualEvidence = null;
        }

        if (verification?.verified && businessAction) {
          const personId = nextAction?.personId;
          if (personId) {
            relationshipEngine.recordTouchpoint(personId, {
              type: businessAction,
              platform,
              goal,
              verified: true
            });
            relationshipEngine.setNextAction(personId, nextAction.action || "OBSERVE");
          }
        }
      } catch (err) {
        previous.push({
          iteration,
          action: action.type,
          result: "FAILED",
          error: err.message
        });
        visualEvidence = await this.visualFallback.inspect(
          page,
          "Recover the intended control for the failed action",
          await agent.captureLiveSnapshot("agentic-failure"),
          platform
        );
      }
    }

    return {
      platform,
      status: "ITERATION_LIMIT",
      iterations: this.maxIterations,
      previous
    };
  }

  async getPage(platform) {
    if (platform === "threads") return browserManager.getThreadsPage({ bringToFront: true });
    if (platform === "facebook") return browserManager.getFacebookPage({ bringToFront: true });
    if (platform === "linkedin") return browserManager.getLinkedInPage({ bringToFront: true });
    throw new Error("Unsupported social platform: " + platform);
  }

  async runOnce(options = {}) {
    const targets = options.platform
      ? [String(options.platform).toLowerCase()]
      : ["threads", "facebook", "linkedin"];
    const goal = options.goal ||
      "Discover relevant business conversations, contribute only when useful, and advance genuine relationships without guessing or spamming.";

    const results = [];
    for (const platform of targets) {
      if (!PLATFORM_STARTS[platform]) continue;
      results.push(await this.runPlatform(platform, goal));
      if (this.guard.isPaused()) break;
    }
    return results;
  }

  async runContinuous(options = {}) {
    const intervalMs = Math.max(
      60000,
      Number(options.intervalMs || (CONFIG.SCAN_INTERVAL_SECONDS * 1000))
    );
    let cycle = 0;

    while (!this.guard.isPaused()) {
      cycle += 1;
      logger.info("[AGENTIC SOCIAL] Starting cycle " + cycle);
      await this.runOnce(options);
      if (options.once) break;
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }

    return {
      status: this.guard.isPaused() ? "MANUAL_ACTION_REQUIRED" : "STOPPED",
      cycle
    };
  }
}

module.exports = {
  AgenticSocialRunner,
  PLATFORM_STARTS,
  PLATFORM_ORIGINS
};
