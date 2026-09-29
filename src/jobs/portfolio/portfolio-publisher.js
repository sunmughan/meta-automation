const fs = require("fs");
const { BrowserAgent } = require("../../agent/browser-agent");
const { buildPortfolioPublishPlan } = require("./portfolio-ai");
const { resolveAssetPath } = require("./portfolio-repository");

class PortfolioBrowserAgent extends BrowserAgent {
  validatePortfolioPlan(plan, allowedOrigin) {
    this.validateActionPlan(plan);
    for (const action of plan.actions || []) {
      const target = action.target || {};
      if (target.selector || target.selectors || target.css || target.xpath || target.coordinates || target.point) {
        throw new Error("Portfolio plans must use semantic targets");
      }
      if (String(action.type).toUpperCase() === "NAVIGATE") {
        const url = String(action.value || action.url || "");
        if (!url.startsWith("http")) throw new Error("Portfolio navigation requires an absolute HTTP URL");
        if (new URL(url).origin !== new URL(allowedOrigin).origin) {
          throw new Error("Portfolio navigation outside the configured platform origin is blocked");
        }
      }
    }
  }

  async executePortfolioPlan(plan, targetId, allowedOrigin) {
    this.validatePortfolioPlan(plan, allowedOrigin);
    return this.executePlan(plan, targetId);
  }
}

class PortfolioPublisher {
  constructor({ browserManager, aiRuntime, knowledgeEngine }) {
    this.browserManager = browserManager;
    this.aiRuntime = aiRuntime;
    this.knowledge = knowledgeEngine;
  }

  async publishProject({ project, platform }) {
    const page = await this.browserManager.open(platform.portfolio.manageUrl);
    const agent = new PortfolioBrowserAgent(page, "portfolio:" + platform.id);
    const brand = {
      founder: this.knowledge.getFounderInfo(),
      company: this.knowledge.getCompanyInfo()
    };
    const assetPath = resolveAssetPath(project);
    if (!fs.existsSync(assetPath)) {
      throw new Error("Portfolio asset missing: " + assetPath);
    }

    for (let iteration = 1; iteration <= 10; iteration++) {
      const snapshot = await agent.captureLiveSnapshot("portfolio-" + project.id + "-" + iteration);
      const plan = await buildPortfolioPublishPlan({
        project, brand, platform, snapshot, aiRuntime: this.aiRuntime, assetPath
      });

      if (plan.status === "DONE") {
        return { status: "DONE", projectId: project.id, iterations: iteration, snapshot, reason: plan.reason || "Already published or visibly completed" };
      }
      if (["USER_ACTION_REQUIRED", "BLOCKED"].includes(plan.status)) {
        return { status: plan.status, projectId: project.id, iterations: iteration, snapshot, reason: plan.reason || plan.status };
      }

      const result = await agent.executePortfolioPlan(
        plan,
        "portfolio:" + platform.id + ":" + project.id,
        platform.origin
      );
      if (!result.success) {
        return { status: result.state || "FAILED", projectId: project.id, iterations: iteration, reason: result.reason || result.state };
      }
    }

    return { status: "IN_PROGRESS", projectId: project.id, reason: "Portfolio publishing iteration budget reached" };
  }
}

module.exports = { PortfolioPublisher, PortfolioBrowserAgent };
