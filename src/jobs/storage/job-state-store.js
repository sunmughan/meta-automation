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

const APPLICATION_TRANSITIONS = {
  PLANNED: ["DOCUMENTS_GENERATED", "APPLICATION_READY", "FAILED", "BLOCKED"],
  DOCUMENTS_GENERATED: ["APPLICATION_READY", "FORM_STARTED", "FAILED", "USER_ACTION_REQUIRED"],
  APPLICATION_READY: ["FORM_STARTED", "FAILED", "USER_ACTION_REQUIRED", "MANUAL_ACTION_REQUIRED", "BLOCKED"],
  FORM_STARTED: ["FORM_FILLED", "FAILED", "USER_ACTION_REQUIRED", "BLOCKED"],
  FORM_FILLED: ["SUBMITTING", "SUBMITTED", "FAILED", "USER_ACTION_REQUIRED", "BLOCKED"],
  SUBMITTING: ["SUBMITTED", "FAILED", "UNVERIFIED", "USER_ACTION_REQUIRED"],
  SUBMITTED: ["VERIFIED", "UNVERIFIED", "FAILED"],
  VERIFIED: [],
  UNVERIFIED: ["VERIFIED", "FAILED", "MANUAL_ACTION_REQUIRED"],
  FAILED: ["PLANNED", "DOCUMENTS_GENERATED", "APPLICATION_READY", "FORM_STARTED", "SUBMITTING"],
  USER_ACTION_REQUIRED: ["FORM_STARTED", "FORM_FILLED", "SUBMITTING", "SUBMITTED", "FAILED"],
  MANUAL_ACTION_REQUIRED: ["FORM_STARTED", "FORM_FILLED", "SUBMITTING", "SUBMITTED", "FAILED"],
  BLOCKED: ["FORM_STARTED", "FAILED"]
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
    const nonce = Math.random().toString(36).slice(2, 8);
    const tmp = `${this.filePath}.tmp.${Date.now()}.${process.pid}.${nonce}`;
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
    return Object.values(this.state.applications).some(app =>
      app.opportunityKey === key && ["SUBMITTED", "VERIFIED"].includes(app.status)
    );
  }

  getApplicationForOpportunity(key) {
    return Object.values(this.state.applications).find(app => app.opportunityKey === key) || null;
  }

  transitionApplication(key, nextState, metadata = {}) {
    if (!key || typeof key !== "string") throw new Error("Application key is required");
    if (!nextState || typeof nextState !== "string") throw new Error("Next application state is required");

    const targetState = nextState.toUpperCase();
    const now = new Date().toISOString();
    let app = this.state.applications[key];

    if (!app) {
      app = {
        key,
        status: targetState,
        hasSubmitted: ["SUBMITTED", "VERIFIED"].includes(targetState),
        submittedAt: ["SUBMITTED", "VERIFIED"].includes(targetState) ? now : null,
        hasVerified: targetState === "VERIFIED",
        verifiedAt: targetState === "VERIFIED" ? now : null,
        createdAt: now,
        updatedAt: now,
        history: [{
          from: null,
          to: targetState,
          timestamp: now,
          reason: metadata.reason || "Application initialized"
        }],
        ...metadata
      };
      if (app.hasSubmitted) {
        this.state.metrics.submitted = Number(this.state.metrics.submitted || 0) + 1;
      }
      if (app.hasVerified) {
        this.state.metrics.verified = Number(this.state.metrics.verified || 0) + 1;
      }
      this.state.applications[key] = app;
      this.save();
      return app;
    }

    const currentStatus = (app.status || "PLANNED").toUpperCase();

    // Idempotent no-op
    if (currentStatus === targetState) {
      this.state.applications[key] = {
        ...app,
        ...metadata,
        status: currentStatus,
        updatedAt: now
      };
      this.save();
      return this.state.applications[key];
    }

    // Terminal guard: VERIFIED cannot transition backwards
    if (currentStatus === "VERIFIED") {
      throw new Error(`Invalid application transition: cannot transition verified application '${key}' from VERIFIED to '${targetState}'`);
    }

    const allowed = APPLICATION_TRANSITIONS[currentStatus] || [];
    if (!allowed.includes(targetState)) {
      throw new Error(`Illegal application transition for '${key}': ${currentStatus} -> ${targetState}`);
    }

    app.status = targetState;
    app.updatedAt = now;
    Object.assign(app, metadata);

    // Event-based metric tracking
    if (targetState === "SUBMITTED" && !app.hasSubmitted) {
      app.hasSubmitted = true;
      app.submittedAt = now;
      this.state.metrics.submitted = Number(this.state.metrics.submitted || 0) + 1;
    }

    if (targetState === "VERIFIED" && !app.hasVerified) {
      app.hasVerified = true;
      app.verifiedAt = now;
      this.state.metrics.verified = Number(this.state.metrics.verified || 0) + 1;
    }

    if (targetState === "FAILED") {
      this.state.metrics.failed = Number(this.state.metrics.failed || 0) + 1;
    }

    if (["USER_ACTION_REQUIRED", "MANUAL_ACTION_REQUIRED"].includes(targetState)) {
      this.state.metrics.manualAction = Number(this.state.metrics.manualAction || 0) + 1;
    }

    app.history = app.history || [];
    app.history.push({
      from: currentStatus,
      to: targetState,
      timestamp: now,
      reason: metadata.reason || "",
      error: metadata.error || ""
    });

    this.state.applications[key] = app;
    this.save();
    return app;
  }

  upsertApplication(application) {
    if (!application || !application.key) throw new Error("Application key is required");
    if (application.status) {
      return this.transitionApplication(application.key, application.status, application);
    }
    const existing = this.state.applications[application.key] || {
      key: application.key,
      status: "PLANNED",
      createdAt: new Date().toISOString()
    };
    this.state.applications[application.key] = {
      ...existing,
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

const defaultJobStateInstance = new JobStateStore();
defaultJobStateInstance.JobStateStore = JobStateStore;
module.exports = defaultJobStateInstance;
