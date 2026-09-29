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
    const tmp = this.filePath + ".tmp." + Date.now();
    fs.writeFileSync(tmp, JSON.stringify(this.state, null, 2), "utf8");
    fs.renameSync(tmp, this.filePath);
  }

  setGoal(goal) {
    if (!goal || !goal.id) throw new Error("Growth goal id is required");
    this.state.goals[goal.id] = {
      ...(this.state.goals[goal.id] || {}),
      ...goal,
      updatedAt: new Date().toISOString()
    };
    this.save();
    return this.state.goals[goal.id];
  }

  getGoal(id) { return this.state.goals[id] || null; }
  listGoals() { return Object.values(this.state.goals); }

  setCredential(item) {
    if (!item || !item.id) throw new Error("Credential id is required");
    this.state.credentials[item.id] = {
      ...(this.state.credentials[item.id] || {}),
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

module.exports = new GrowthStateStore();
