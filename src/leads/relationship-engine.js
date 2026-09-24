/**
 * Cross-platform relationship lifecycle.
 * Transition rules live in configuration rather than platform code.
 */

const fs = require("fs");
const path = require("path");
const CONFIG = require("../../config");

class RelationshipEngine {
  constructor() {
    this.filePath = path.resolve(CONFIG.ROOT_DIR, "leads", "relationship-state.json");
    this.rulesPath = path.resolve(CONFIG.ROOT_DIR, "config", "social-lifecycle.json");
    this.state = this.load(this.filePath, { people: {} });
    this.rules = this.load(this.rulesPath, { stages: {} });
  }

  load(filePath, fallback) {
    try {
      if (fs.existsSync(filePath)) {
        return { ...fallback, ...JSON.parse(fs.readFileSync(filePath, "utf8")) };
      }
    } catch (_) {}
    return JSON.parse(JSON.stringify(fallback));
  }

  save() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temp = this.filePath + ".tmp";
    fs.writeFileSync(temp, JSON.stringify({
      version: 1,
      updatedAt: new Date().toISOString(),
      ...this.state
    }, null, 2), "utf8");
    fs.renameSync(temp, this.filePath);
  }

  ensurePerson(personId, seed = {}) {
    if (!this.state.people[personId]) {
      this.state.people[personId] = {
        id: personId,
        stage: "OBSERVED",
        identities: [],
        touchpoints: [],
        opportunities: [],
        nextAction: "OBSERVE",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...seed
      };
    }
    return this.state.people[personId];
  }

  attachIdentity(personId, identity) {
    const person = this.ensurePerson(personId);
    const exists = person.identities.some(item =>
      item.platform === identity.platform &&
      item.username === identity.username
    );
    if (!exists) person.identities.push(identity);
    person.updatedAt = new Date().toISOString();
    this.save();
    return person;
  }

  recordTouchpoint(personId, touchpoint, requestedStage = null) {
    const person = this.ensurePerson(personId);
    person.touchpoints.push({
      ...touchpoint,
      at: new Date().toISOString()
    });

    const nextStage = requestedStage || this.rules.stages?.[person.stage]?.defaultNext;
    if (nextStage && this.canTransition(person.stage, nextStage)) {
      person.stage = nextStage;
    }

    person.updatedAt = new Date().toISOString();
    this.save();
    return person;
  }

  canTransition(from, to) {
    const allowed = this.rules.stages?.[from]?.allowedTransitions || [];
    return allowed.includes(to);
  }

  setNextAction(personId, action) {
    const person = this.ensurePerson(personId);
    person.nextAction = action;
    person.updatedAt = new Date().toISOString();
    this.save();
    return person;
  }

  get(personId) {
    return this.state.people[personId] || null;
  }

  getAll() {
    return Object.values(this.state.people);
  }
}

module.exports = new RelationshipEngine();
