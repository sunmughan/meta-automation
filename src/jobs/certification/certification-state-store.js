const fs = require("fs");
const path = require("path");
const CONFIG = require("../../../config");

const EMPTY = {
  version: 1,
  lastUpdated: null,
  certifications: {},
  metrics: { discovered: 0, enrolled: 0, inProgress: 0, completed: 0, blocked: 0, failed: 0 }
};

const CERT_TRANSITIONS = {
  DISCOVERED: ["ENROLLED", "IN_PROGRESS", "FAILED", "BLOCKED"],
  ENROLLED: ["IN_PROGRESS", "COMPLETED", "FAILED", "BLOCKED"],
  IN_PROGRESS: ["IN_PROGRESS", "COMPLETED", "FAILED", "BLOCKED"],
  BLOCKED: ["ENROLLED", "IN_PROGRESS", "FAILED"],
  FAILED: ["ENROLLED", "IN_PROGRESS"],
  COMPLETED: []
};

class CertificationStateStore {
  constructor(filePath = CONFIG.JOB_CERTIFICATION_STATE_FILE) {
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
        certifications: parsed.certifications || {},
        metrics: { ...EMPTY.metrics, ...(parsed.metrics || {}) }
      };
    } catch (_) {
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

  transition(key, nextState, metadata = {}) {
    if (!key || typeof key !== "string") throw new Error("Certification key is required");
    if (!nextState || typeof nextState !== "string") throw new Error("Next certification state is required");

    let targetState = nextState.toUpperCase();
    if (targetState === "DONE") targetState = "COMPLETED";

    const now = new Date().toISOString();
    let item = this.state.certifications[key];

    if (!item) {
      item = {
        key,
        status: targetState,
        hasCompleted: targetState === "COMPLETED",
        completedAt: targetState === "COMPLETED" ? now : null,
        createdAt: now,
        updatedAt: now,
        history: [{
          from: null,
          to: targetState,
          timestamp: now,
          reason: metadata.reason || "Certification registered"
        }],
        ...metadata
      };
      if (targetState === "ENROLLED") this.state.metrics.enrolled += 1;
      if (targetState === "COMPLETED") this.state.metrics.completed += 1;
      this.state.certifications[key] = item;
      this.save();
      return item;
    }

    let currentStatus = (item.status || "DISCOVERED").toUpperCase();
    if (currentStatus === "DONE") currentStatus = "COMPLETED";

    // Idempotent no-op
    if (currentStatus === targetState) {
      this.state.certifications[key] = {
        ...item,
        ...metadata,
        status: currentStatus,
        updatedAt: now
      };
      this.save();
      return this.state.certifications[key];
    }

    if (currentStatus === "COMPLETED") {
      throw new Error(`Invalid certification transition: cannot transition completed certificate '${key}' from COMPLETED to '${targetState}'`);
    }

    const allowed = CERT_TRANSITIONS[currentStatus] || [];
    if (!allowed.includes(targetState)) {
      throw new Error(`Illegal certification transition for '${key}': ${currentStatus} -> ${targetState}`);
    }

    item.status = targetState;
    item.updatedAt = now;
    Object.assign(item, metadata);

    if (targetState === "ENROLLED" && !item.hasEnrolled) {
      item.hasEnrolled = true;
      this.state.metrics.enrolled += 1;
    }

    if (targetState === "COMPLETED" && !item.hasCompleted) {
      item.hasCompleted = true;
      item.completedAt = now;
      this.state.metrics.completed += 1;
    }

    item.history = item.history || [];
    item.history.push({
      from: currentStatus,
      to: targetState,
      timestamp: now,
      reason: metadata.reason || "",
      error: metadata.error || ""
    });

    this.state.certifications[key] = item;
    this.save();
    return item;
  }

  upsert(item) {
    if (!item || !item.key) throw new Error("Certification key is required");
    if (item.status) {
      return this.transition(item.key, item.status, item);
    }
    this.state.certifications[item.key] = {
      ...(this.state.certifications[item.key] || {}),
      ...item,
      updatedAt: new Date().toISOString()
    };
    this.save();
    return this.state.certifications[item.key];
  }

  get(key) {
    return this.state.certifications[key] || null;
  }

  list() {
    return Object.values(this.state.certifications);
  }

  metric(name, delta = 1) {
    this.state.metrics[name] = Number(this.state.metrics[name] || 0) + delta;
    this.save();
  }
}

const defaultCertInstance = new CertificationStateStore();
defaultCertInstance.CertificationStateStore = CertificationStateStore;
module.exports = defaultCertInstance;
