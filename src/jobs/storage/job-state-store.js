const fs = require("fs");
const path = require("path");
const CONFIG = require("../../../config");
const logger = require("../../logging/logger");

const EMPTY = {
  version: 1,
  lastUpdated: null,
  opportunities: {},
  applications: {},
  platforms: {},
  metrics: {
    discovered: 0,
    remoteVerified: 0,
    qualified: 0,
    skipped: 0,
    submitted: 0,
    verified: 0,
    failed: 0,
    manualAction: 0
  }
};

class JobStateStore {
  constructor(filePath = CONFIG.JOB_STATE_FILE) {
    this.filePath = filePath;
    this.state = this.load();
  }

  load() {
    if (!fs.existsSync(this.filePath)) return JSON.parse(JSON.stringify(EMPTY));
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
      return {
        ...JSON.parse(JSON.stringify(EMPTY)),
        ...parsed,
        opportunities: parsed.opportunities || {},
        applications: parsed.applications || {},
        platforms: parsed.platforms || {},
        metrics: { ...EMPTY.metrics, ...(parsed.metrics || {}) }
      };
    } catch (err) {
      logger.warn(`Job state reset after read failure: ${err.message}`);
      return JSON.parse(JSON.stringify(EMPTY));
    }
  }

  save() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    this.state.lastUpdated = new Date().toISOString();
    const tmp = `${this.filePath}.tmp.${Date.now()}`;
    fs.writeFileSync(tmp, JSON.stringify(this.state, null, 2), "utf8");
    fs.renameSync(tmp, this.filePath);
  }

  upsertOpportunity(opportunity) {
    if (!opportunity || !opportunity.key) throw new Error("Opportunity key is required");
    const existing = this.state.opportunities[opportunity.key] || {};
    this.state.opportunities[opportunity.key] = {
      ...existing,
      ...opportunity,
      updatedAt: new Date().toISOString()
    };
    this.save();
    return this.state.opportunities[opportunity.key];
  }

  getOpportunity(key) {
    return this.state.opportunities[key] || null;
  }

  listOpportunities() {
    return Object.values(this.state.opportunities);
  }

  hasApplicationForOpportunity(key) {
    return Object.values(this.state.applications).some(app => app.opportunityKey === key);
  }

  upsertApplication(application) {
    if (!application || !application.key) throw new Error("Application key is required");
    this.state.applications[application.key] = {
      ...(this.state.applications[application.key] || {}),
      ...application,
      updatedAt: new Date().toISOString()
    };
    this.save();
    return this.state.applications[application.key];
  }

  listApplications() {
    return Object.values(this.state.applications);
  }

  setPlatformState(platformId, state) {
    this.state.platforms[platformId] = {
      ...(this.state.platforms[platformId] || {}),
      ...state,
      updatedAt: new Date().toISOString()
    };
    this.save();
  }

  updateMetric(metric, delta = 1) {
    this.state.metrics[metric] = Number(this.state.metrics[metric] || 0) + delta;
    this.save();
  }
}

module.exports = new JobStateStore();
