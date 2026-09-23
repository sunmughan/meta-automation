const BrowserAgent = require("../../agent/browser-agent");
const CONFIG = require("../../../config");

class JobBrowserAgent extends BrowserAgent {
  constructor(page, platformId = "jobs") {
    super(page, platformId);
  }

  validateJobPlan(plan, allowedOrigin, allowGoogleOAuth = false) {
    this.validateActionPlan(plan);

    for (const action of plan.actions || []) {
      const type = action.type.toUpperCase();
      const loc = action.target || {};
      if (loc.selector || loc.selectors || loc.xpath || loc.css || loc.coordinates || loc.point) {
        throw new Error("Job plans may not use CSS/XPath selectors or coordinates");
      }
      if (type === "NAVIGATE") {
        const value = String(action.value || action.url || "");
        if (!value.startsWith("http")) throw new Error("Job navigation requires an absolute HTTP URL");
        const targetOrigin = new URL(value).origin;
        const origin = new URL(allowedOrigin).origin;
        const oauthOrigin = "https://accounts.google.com";
        if (targetOrigin !== origin && !(allowGoogleOAuth && targetOrigin === oauthOrigin)) {
          throw new Error(`Blocked navigation outside allowed origin: ${targetOrigin}`);
        }
      }
    }
  }

  async executeJobPlan(plan, targetId, allowedOrigin) {
    if (plan?.status && !["READY", "DONE"].includes(plan.status)) {
      return { success: false, state: "BLOCKED", reason: plan.reason || plan.status };
    }
    const origin = allowedOrigin || new URL(this.page.url()).origin;
    this.validateJobPlan(plan, origin, false);
    return this.executePlan(plan, targetId);
  }

  async executeAuthPlan(plan, targetId, allowedOrigin) {
    this.validateJobPlan(plan, allowedOrigin, true);
    return this.executePlan(plan, targetId);
  }
}

module.exports = JobBrowserAgent;
