const { buildActionPlan } = require("../ai/job-ai");
const CONFIG = require("../../../config");

class JobAgentRunner {
  constructor({ aiRuntime, browserAgent }) {
    this.aiRuntime = aiRuntime;
    this.browserAgent = browserAgent;
  }

  async run({ goal, platform, candidateProfile, opportunity = null, allowedOrigin, context = {}, targetId }) {
    let lastReason = "";
    for (let iteration = 1; iteration <= CONFIG.JOB_MAX_PLAN_ITERATIONS; iteration++) {
      const snapshot = await this.browserAgent.captureLiveSnapshot(`agent-loop-${iteration}`);
      const plan = await buildActionPlan({
        goal,
        platform,
        opportunity,
        candidateProfile,
        browserSnapshot: snapshot,
        allowedOrigin,
        actionBudget: {
          maxActions: CONFIG.JOB_MAX_PLAN_ACTIONS,
          maxScrolls: CONFIG.JOB_MAX_SCROLLS,
          iteration,
          context
        }
      }, this.aiRuntime);

      if (plan.status === "DONE") {
        return { status: "DONE", iterations: iteration, snapshot, plan, reason: plan.reason || "" };
      }

      if (["USER_ACTION_REQUIRED", "MANUAL_ACTION_REQUIRED", "BLOCKED"].includes(plan.status)) {
        return { status: plan.status, iterations: iteration, snapshot, plan, reason: plan.reason || plan.status };
      }

      const result = await this.browserAgent.executeJobPlan(
        plan,
        targetId || `job-agent:${platform.id}`,
        allowedOrigin
      );

      if (!result.success) {
        lastReason = result.reason || result.state || "Browser action failed";
        return {
          status: result.state || "FAILED",
          iterations: iteration,
          plan,
          result,
          reason: lastReason
        };
      }

      if (plan.actions?.some(a => String(a.type).toUpperCase() === "STOP")) {
        return { status: "DONE", iterations: iteration, plan, result, reason: "Planner requested STOP" };
      }
    }

    return {
      status: "MAX_ITERATIONS",
      reason: lastReason || "Agentic browser loop reached configured iteration limit"
    };
  }
}

module.exports = JobAgentRunner;
