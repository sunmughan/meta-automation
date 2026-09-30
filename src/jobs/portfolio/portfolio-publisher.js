const fs = require("fs");
const path = require("path");
const CONFIG = require("../../../config");
const { BrowserAgent } = require("../../agent/browser-agent");
const { buildPortfolioPublishPlan } = require("./portfolio-ai");
const { resolveAssetPath } = require("./portfolio-repository");

function getPortfolioStateFile() {
  return path.resolve(CONFIG.ROOT_DIR, "private", "portfolio-publishing-state.json");
}

function loadPortfolioPublishState() {
  const file = getPortfolioStateFile();
  if (!fs.existsSync(file)) return {};
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch (_) { return {}; }
}

function savePortfolioPublishState(state) {
  const file = getPortfolioStateFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const nonce = Math.random().toString(36).slice(2, 8);
  const tmp = `${file}.tmp.${Date.now()}.${process.pid}.${nonce}`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), "utf8");
  fs.renameSync(tmp, file);
}

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
    const stateKey = `${platform.id}:${project.id}`;
    const allState = loadPortfolioPublishState();
    const existing = allState[stateKey];
    if (existing && existing.status === "DONE") {
      return {
        status: "DONE",
        projectId: project.id,
        skipped: true,
        reason: existing.reason || "Project already published on platform",
        publishedAt: existing.publishedAt
      };
    }

    allState[stateKey] = {
      platformId: platform.id,
      projectId: project.id,
      status: "IN_PROGRESS",
      startedAt: existing?.startedAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    savePortfolioPublishState(allState);

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

    for (let iteration = 1; iteration <= Number(platform.portfolio.maxAgentIterations || 12); iteration++) {
      const snapshot = await agent.captureLiveSnapshot("portfolio-" + project.id + "-" + iteration);
      const plan = await buildPortfolioPublishPlan({
        project, brand, platform, snapshot, aiRuntime: this.aiRuntime, assetPath
      });

      if (plan.status === "DONE") {
        allState[stateKey] = {
          ...allState[stateKey],
          status: "DONE",
          publishedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          reason: plan.reason || "Already published or visibly completed"
        };
        savePortfolioPublishState(allState);
        return { status: "DONE", projectId: project.id, iterations: iteration, snapshot, reason: plan.reason || "Already published or visibly completed" };
      }
      if (["USER_ACTION_REQUIRED", "BLOCKED"].includes(plan.status)) {
        allState[stateKey] = {
          ...allState[stateKey],
          status: plan.status,
          updatedAt: new Date().toISOString(),
          reason: plan.reason || plan.status
        };
        savePortfolioPublishState(allState);
        return { status: plan.status, projectId: project.id, iterations: iteration, snapshot, reason: plan.reason || plan.status };
      }

      const result = await agent.executePortfolioPlan(
        plan,
        "portfolio:" + platform.id + ":" + project.id,
        platform.origin
      );
      if (!result.success) {
        allState[stateKey] = {
          ...allState[stateKey],
          status: result.state || "FAILED",
          updatedAt: new Date().toISOString(),
          reason: result.reason || result.state
        };
        savePortfolioPublishState(allState);
        return { status: result.state || "FAILED", projectId: project.id, iterations: iteration, reason: result.reason || result.state };
      }
    }

    allState[stateKey] = {
      ...allState[stateKey],
      status: "IN_PROGRESS",
      updatedAt: new Date().toISOString(),
      reason: "Portfolio publishing iteration budget reached"
    };
    savePortfolioPublishState(allState);
    return { status: "IN_PROGRESS", projectId: project.id, reason: "Portfolio publishing iteration budget reached" };
  }
}

module.exports = {
  PortfolioPublisher,
  PortfolioBrowserAgent,
  loadPortfolioPublishState,
  savePortfolioPublishState,
  getPortfolioStateFile
};
