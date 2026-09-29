const fs = require("fs");
const path = require("path");
const CONFIG = require("../../../config");

const EMPTY = {
  version: 1,
  lastUpdated: null,
  certifications: {},
  metrics: { discovered: 0, enrolled: 0, inProgress: 0, completed: 0, blocked: 0, failed: 0 }
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
    const tmp = `${this.filePath}.tmp.${Date.now()}`;
    fs.writeFileSync(tmp, JSON.stringify(this.state, null, 2), "utf8");
    fs.renameSync(tmp, this.filePath);
  }

  upsert(item) {
    if (!item || !item.key) throw new Error("Certification key is required");
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

module.exports = new CertificationStateStore();
