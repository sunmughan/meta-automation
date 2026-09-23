const { buildActionPlan } = require("../ai/job-ai");
const CONFIG = require("../../../config");

class JobAgentRunner {
  constructor({ aiRuntime, browserAgent }) {
    this.aiRuntime = aiRuntime;
    this.browserAgent = browserAgent;
  }

  async syncOpenedPage(authOrigin = null, preferredOrigin = null) {
    try {
      const browser = this.browserAgent.page?.browser();
      if (!browser) return;
      const pages = (await browser.pages()).filter(page => !page.isClosed());
      if (!pages.length) return;

      const current = this.browserAgent.page;
      const currentUrl = current?.url?.() || "";
      const originOf = page => {
        try { return new URL(page.url()).origin; } catch (_) { return ""; }
      };

      if (authOrigin) {
        const authPage = pages.find(page => originOf(page) === new URL(authOrigin).origin);
        if (authPage && originOf(current) !== new URL(authOrigin).origin) {
          this.browserAgent.page = authPage;
          return;
        }
      }

      const preferred = preferredOrigin ? new URL(preferredOrigin).origin : "";
      if (current?.isClosed?.() && preferred) {
        const preferredPage = pages.find(page => originOf(page) === preferred);
        if (preferredPage) {
          this.browserAgent.page = preferredPage;
          return;
        }
      }

      if (preferred && !authOrigin && originOf(current) !== preferred) {
        const preferredPage = pages.find(page => originOf(page) === preferred);
        if (preferredPage) {
          this.browserAgent.page = preferredPage;
          return;
        }
      }

      const newest = pages[pages.length - 1];
      if (newest && newest !== current && newest.url() !== "about:blank" && newest.url() !== currentUrl) {
        this.browserAgent.page = newest;
      }
    } catch (_) {}
  }
  async run({ goal, platform, candidateProfile, opportunity = null, allowedOrigin, context = {}, targetId, authFlow = false }) {
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
        // Capture FRESH snapshot to verify DONE state — never return stale pre-action snapshot
        const doneSnapshot = await this.browserAgent.captureLiveSnapshot(`done-verify-${iteration}`);
        return { status: "DONE", iterations: iteration, snapshot: doneSnapshot, plan, reason: plan.reason || "" };
      }

      if (["USER_ACTION_REQUIRED", "MANUAL_ACTION_REQUIRED", "BLOCKED"].includes(plan.status)) {
        return { status: plan.status, iterations: iteration, snapshot, plan, reason: plan.reason || plan.status };
      }

      const result = authFlow
        ? await this.browserAgent.executeAuthPlan(
            plan,
            targetId || `job-agent:${platform.id}`,
            allowedOrigin
          )
        : await this.browserAgent.executeJobPlan(
            plan,
            targetId || `job-agent:${platform.id}`,
            allowedOrigin
          );

      await this.syncOpenedPage(authFlow ? CONFIG.GOOGLE_AUTH_ORIGIN : null, allowedOrigin);

      // Capture FRESH snapshot after every action execution — this is the core agentic principle
      const postActionSnapshot = await this.browserAgent.captureLiveSnapshot(`post-action-${iteration}`);

      if (!result.success) {
        lastReason = result.reason || result.state || "Browser action failed";
        return {
          status: result.state || "FAILED",
          iterations: iteration,
          snapshot: postActionSnapshot,
          plan,
          result,
          reason: lastReason
        };
      }

      if (plan.actions?.some(a => String(a.type).toUpperCase() === "STOP")) {
        return { status: "DONE", iterations: iteration, snapshot: postActionSnapshot, plan, result, reason: "Planner requested STOP" };
      }
    }

    return {
      status: "MAX_ITERATIONS",
      reason: lastReason || "Agentic browser loop reached configured iteration limit"
    };
  }
}

module.exports = JobAgentRunner;
