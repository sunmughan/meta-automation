const { BrowserAgent } = require("../../agent/browser-agent");
const { buildBrowserPlan } = require("./growth-ai");
const CONFIG = require("../../../config");

class GrowthBrowserAgent extends BrowserAgent {
  constructor(page, platformId = "professional-growth") {
    super(page, platformId);
  }

  validatePlan(plan, allowedOrigin) {
    this.validateActionPlan(plan);
    for (const action of plan.actions || []) {
      const target = action.target || {};
      if (target.selector || target.selectors || target.xpath || target.css || target.coordinates || target.point) {
        throw new Error("Professional Growth plans must use semantic targets");
      }
      if (String(action.type).toUpperCase() === "NAVIGATE") {
        const value = String(action.value || action.url || "");
        if (!value.startsWith("http")) throw new Error("NAVIGATE requires an absolute HTTP URL");
      }
    }
  }

  async execute(plan, targetId, allowedOrigin) {
    this.validatePlan(plan, allowedOrigin);
    return this.executePlan(plan, targetId);
  }
}

class GrowthRunner {
  constructor({ aiRuntime, page, platformId }) {
    this.aiRuntime = aiRuntime;
    this.agent = new GrowthBrowserAgent(page, platformId);
  }

  async run({ goal, platform, profile, context = {}, allowedOrigin, onIteration = null }) {
    let lastReason = "";
    for (let iteration = 1; iteration <= CONFIG.PROFESSIONAL_GROWTH_MAX_ITERATIONS; iteration++) {
      const snapshot = await this.agent.captureLiveSnapshot("growth-" + iteration);
      const plan = await buildBrowserPlan({
        goal,
        platform,
        snapshot,
        profile,
        contextData: context,
        aiRuntime: this.aiRuntime
      });

      if (plan.status === "DONE") {
        const verified = await this.agent.captureLiveSnapshot("growth-done-verify");
        const result = { status: "DONE", iterations: iteration, snapshot: verified, plan };
        await onIteration?.({ iteration, snapshot: verified, plan, result });
        return result;
      }

      if (["USER_ACTION_REQUIRED", "BLOCKED"].includes(plan.status)) {
        const result = {
          status: plan.status,
          iterations: iteration,
          snapshot,
          plan,
          reason: plan.reason || plan.status
        };
        await onIteration?.({ iteration, snapshot, plan, result });
        return result;
      }

      const result = await this.agent.execute(
        plan,
        "growth:" + platform.id + ":" + Date.now(),
        allowedOrigin
      );
      const post = await this.agent.captureLiveSnapshot("growth-post-" + iteration);
      const iterationResult = {
        success: result.success,
        state: result.state,
        reason: result.reason || "",
        correlationId: result.correlationId || ""
      };
      await onIteration?.({
        iteration,
        snapshot: post,
        plan,
        result: iterationResult
      });

      if (!result.success) {
        return {
          status: result.state || "FAILED",
          iterations: iteration,
          snapshot: post,
          plan,
          reason: result.reason || result.state
        };
      }

      if (plan.actions?.some(a => String(a.type).toUpperCase() === "STOP")) {
        return {
          status: "DONE",
          iterations: iteration,
          snapshot: post,
          plan
        };
      }
      lastReason = plan.reason || "";
    }

    return {
      status: "IN_PROGRESS",
      reason: lastReason || "Iteration budget reached"
    };
  }
}

module.exports = { GrowthRunner, GrowthBrowserAgent };
