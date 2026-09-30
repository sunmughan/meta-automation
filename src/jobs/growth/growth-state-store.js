const fs = require("fs");
const path = require("path");
const CONFIG = require("../../../config");

const EMPTY = {
  version: 1,
  updatedAt: null,
  profileEvidence: {},
  goals: {},
  credentials: {},
  metrics: {
    profileScans: 0,
    goalsStarted: 0,
    goalsCompleted: 0,
    credentialsDiscovered: 0,
    credentialsCompleted: 0
  }
};

const GOAL_TRANSITIONS = {
  PLANNED: ["STARTED", "IN_PROGRESS", "FAILED", "BLOCKED"],
  STARTED: ["IN_PROGRESS", "FAILED", "BLOCKED", "DONE"],
  IN_PROGRESS: ["IN_PROGRESS", "DONE", "FAILED", "BLOCKED"],
  BLOCKED: ["STARTED", "IN_PROGRESS", "FAILED"],
  FAILED: ["STARTED", "IN_PROGRESS"],
  DONE: []
};

const CREDENTIAL_TRANSITIONS = {
  DISCOVERED: ["PLANNED", "ENROLLED", "IN_PROGRESS", "FAILED", "BLOCKED"],
  PLANNED: ["ENROLLED", "IN_PROGRESS", "FAILED", "BLOCKED"],
  ENROLLED: ["IN_PROGRESS", "DONE", "FAILED", "BLOCKED"],
  IN_PROGRESS: ["IN_PROGRESS", "DONE", "FAILED", "BLOCKED"],
  BLOCKED: ["ENROLLED", "IN_PROGRESS", "FAILED"],
  FAILED: ["ENROLLED", "IN_PROGRESS"],
  DONE: []
};

class GrowthStateStore {
  constructor(filePath = CONFIG.PROFESSIONAL_GROWTH_STATE_FILE) {
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
        profileEvidence: parsed.profileEvidence || {},
        goals: parsed.goals || {},
        credentials: parsed.credentials || {},
        metrics: { ...EMPTY.metrics, ...(parsed.metrics || {}) }
      };
    } catch (_) {
      return JSON.parse(JSON.stringify(EMPTY));
    }
  }

  save() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    this.state.updatedAt = new Date().toISOString();
    const nonce = Math.random().toString(36).slice(2, 8);
    const tmp = `${this.filePath}.tmp.${Date.now()}.${process.pid}.${nonce}`;
    fs.writeFileSync(tmp, JSON.stringify(this.state, null, 2), "utf8");
    fs.renameSync(tmp, this.filePath);
  }

  transitionGoal(id, nextState, metadata = {}) {
    if (!id || typeof id !== "string") throw new Error("Growth goal id is required");
    if (!nextState || typeof nextState !== "string") throw new Error("Next goal state is required");

    const targetState = nextState.toUpperCase();
    const now = new Date().toISOString();
    let goal = this.state.goals[id];

    if (!goal) {
      if (!["PLANNED", "STARTED", "IN_PROGRESS"].includes(targetState)) {
        throw new Error(`Cannot initialize new goal '${id}' in state '${targetState}'`);
      }
      goal = {
        id,
        status: targetState,
        hasStarted: ["STARTED", "IN_PROGRESS"].includes(targetState),
        startedAt: ["STARTED", "IN_PROGRESS"].includes(targetState) ? now : null,
        hasCompleted: false,
        completedAt: null,
        createdAt: now,
        updatedAt: now,
        history: [{
          from: null,
          to: targetState,
          timestamp: now,
          reason: metadata.reason || metadata.lastDecision || "Goal initialized"
        }],
        ...metadata
      };
      if (goal.hasStarted) {
        this.state.metrics.goalsStarted = Number(this.state.metrics.goalsStarted || 0) + 1;
      }
      this.state.goals[id] = goal;
      this.save();
      return goal;
    }

    const currentStatus = (goal.status || "PLANNED").toUpperCase();

    // Idempotent no-op
    if (currentStatus === targetState) {
      this.state.goals[id] = {
        ...goal,
        ...metadata,
        status: currentStatus,
        updatedAt: now
      };
      this.save();
      return this.state.goals[id];
    }

    // Terminal guard: DONE cannot transition backwards
    if (currentStatus === "DONE") {
      throw new Error(`Invalid goal transition: cannot transition completed goal '${id}' from DONE to '${targetState}'`);
    }

    // Transition validation
    const allowed = GOAL_TRANSITIONS[currentStatus] || [];
    if (!allowed.includes(targetState)) {
      throw new Error(`Illegal goal transition for '${id}': ${currentStatus} -> ${targetState}`);
    }

    // Apply state change
    goal.status = targetState;
    goal.updatedAt = now;
    Object.assign(goal, metadata);

    // Event-based idempotent metric tracking
    if ((targetState === "STARTED" || targetState === "IN_PROGRESS") && !goal.hasStarted) {
      goal.hasStarted = true;
      goal.startedAt = now;
      this.state.metrics.goalsStarted = Number(this.state.metrics.goalsStarted || 0) + 1;
    }

    if (targetState === "DONE" && !goal.hasCompleted) {
      goal.hasCompleted = true;
      goal.completedAt = now;
      this.state.metrics.goalsCompleted = Number(this.state.metrics.goalsCompleted || 0) + 1;
    }

    // Audit trail
    goal.history = goal.history || [];
    goal.history.push({
      from: currentStatus,
      to: targetState,
      timestamp: now,
      reason: metadata.reason || metadata.lastDecision || "",
      error: metadata.error || ""
    });

    this.state.goals[id] = goal;
    this.save();
    return goal;
  }

  setGoal(goal) {
    if (!goal || !goal.id) throw new Error("Growth goal id is required");
    if (goal.status) {
      return this.transitionGoal(goal.id, goal.status, goal);
    }
    const existing = this.state.goals[goal.id] || { id: goal.id, status: "PLANNED", createdAt: new Date().toISOString() };
    this.state.goals[goal.id] = {
      ...existing,
      ...goal,
      updatedAt: new Date().toISOString()
    };
    this.save();
    return this.state.goals[goal.id];
  }

  getGoal(id) { return this.state.goals[id] || null; }
  listGoals() { return Object.values(this.state.goals); }

  transitionCredential(id, nextState, metadata = {}) {
    if (!id || typeof id !== "string") throw new Error("Credential id is required");
    if (!nextState || typeof nextState !== "string") throw new Error("Next credential state is required");

    const targetState = nextState.toUpperCase();
    const now = new Date().toISOString();
    let item = this.state.credentials[id];

    if (!item) {
      item = {
        id,
        status: targetState,
        hasCompleted: targetState === "DONE",
        completedAt: targetState === "DONE" ? now : null,
        createdAt: now,
        updatedAt: now,
        history: [{
          from: null,
          to: targetState,
          timestamp: now,
          reason: metadata.reason || "Credential initialized"
        }],
        ...metadata
      };
      if (item.hasCompleted) {
        this.state.metrics.credentialsCompleted = Number(this.state.metrics.credentialsCompleted || 0) + 1;
      }
      this.state.credentials[id] = item;
      this.save();
      return item;
    }

    const currentStatus = (item.status || "DISCOVERED").toUpperCase();

    // Idempotent no-op
    if (currentStatus === targetState) {
      this.state.credentials[id] = {
        ...item,
        ...metadata,
        status: currentStatus,
        updatedAt: now
      };
      this.save();
      return this.state.credentials[id];
    }

    if (currentStatus === "DONE") {
      throw new Error(`Invalid credential transition: cannot transition completed credential '${id}' from DONE to '${targetState}'`);
    }

    const allowed = CREDENTIAL_TRANSITIONS[currentStatus] || [];
    if (!allowed.includes(targetState)) {
      throw new Error(`Illegal credential transition for '${id}': ${currentStatus} -> ${targetState}`);
    }

    item.status = targetState;
    item.updatedAt = now;
    Object.assign(item, metadata);

    if (targetState === "DONE" && !item.hasCompleted) {
      item.hasCompleted = true;
      item.completedAt = now;
      this.state.metrics.credentialsCompleted = Number(this.state.metrics.credentialsCompleted || 0) + 1;
    }

    item.history = item.history || [];
    item.history.push({
      from: currentStatus,
      to: targetState,
      timestamp: now,
      reason: metadata.reason || "",
      error: metadata.error || ""
    });

    this.state.credentials[id] = item;
    this.save();
    return item;
  }

  setCredential(item) {
    if (!item || !item.id) throw new Error("Credential id is required");
    if (item.status) {
      return this.transitionCredential(item.id, item.status, item);
    }
    const existing = this.state.credentials[item.id] || { id: item.id, status: "DISCOVERED", createdAt: new Date().toISOString() };
    this.state.credentials[item.id] = {
      ...existing,
      ...item,
      updatedAt: new Date().toISOString()
    };
    this.save();
    return this.state.credentials[item.id];
  }

  setProfileEvidence(source, evidence) {
    this.state.profileEvidence[source] = {
      source,
      ...evidence,
      updatedAt: new Date().toISOString()
    };
    this.state.metrics.profileScans += 1;
    this.save();
    return this.state.profileEvidence[source];
  }

  metric(name, delta = 1) {
    this.state.metrics[name] = Number(this.state.metrics[name] || 0) + delta;
    this.save();
  }
}

const defaultInstance = new GrowthStateStore();
defaultInstance.GrowthStateStore = GrowthStateStore;
module.exports = defaultInstance;
