/**
 * src/leads/identity-graph.js
 * Unified Cross-Platform Lead Identity Graph.
 *
 * Resolves the same person across multiple platforms into a single entity.
 * Tracks the complete lead lifecycle: discovery → qualification → outreach →
 * follow-up → meeting → conversion.
 *
 * Enables: "This person on Threads @john is the same John Smith on LinkedIn
 * who also emailed us — here's the full conversation history."
 */

const fs = require("fs");
const path = require("path");
const CONFIG = require("../../config");
const logger = require("../logging/logger");

const IDENTITY_FILE = path.resolve(CONFIG.ROOT_DIR, "leads", "identity-graph.json");

class IdentityGraph {
  constructor() {
    this.persons = {};  // personId → Person
    this.platformIndex = {};  // "platform:username" → personId
    this.emailIndex = {};  // email → personId
    this.load();
  }

  // ═══════════════════════════════════════════════════════════════
  // PERSON RESOLUTION — find or create a unified person
  // ═══════════════════════════════════════════════════════════════

  /**
   * Finds or creates a person from platform signals.
   * Automatically merges if we find the same email across platforms.
   *
   * @param {Object} signals — { platform, username, displayName, email, url }
   * @returns {Object} — The unified person object
   */
  findOrCreate(signals) {
    const { platform, username, displayName, email, url } = signals;
    const platformKey = `${platform}:${(username || "").toLowerCase()}`;

    // Check if we already know this platform:username
    if (this.platformIndex[platformKey]) {
      const person = this.persons[this.platformIndex[platformKey]];
      if (person) {
        // Update with new signals
        this.updatePerson(person.id, signals);
        return person;
      }
    }

    // Check if we know this email
    if (email && this.emailIndex[email.toLowerCase()]) {
      const person = this.persons[this.emailIndex[email.toLowerCase()]];
      if (person) {
        // Merge this platform identity into existing person
        this.addPlatformIdentity(person.id, signals);
        return person;
      }
    }

    // Create new person
    const personId = `person_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const person = {
      id: personId,
      displayName: displayName || username || "Unknown",
      emails: email ? [email.toLowerCase()] : [],
      identities: [{
        platform,
        username: (username || "").toLowerCase(),
        displayName: displayName || "",
        url: url || "",
        discoveredAt: new Date().toISOString()
      }],
      touchpoints: [],
      conversations: [],
      opportunities: [],
      leadStage: "DISCOVERED",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.persons[personId] = person;
    this.platformIndex[platformKey] = personId;
    if (email) this.emailIndex[email.toLowerCase()] = personId;

    this.save();
    return person;
  }

  /**
   * Merges two persons into one (when we discover they're the same).
   */
  mergePerson(sourceId, targetId) {
    const source = this.persons[sourceId];
    const target = this.persons[targetId];
    if (!source || !target) return null;

    // Merge identities
    target.identities = [...target.identities, ...source.identities];
    target.emails = [...new Set([...target.emails, ...source.emails])];
    target.touchpoints = [...target.touchpoints, ...source.touchpoints].sort((a, b) =>
      new Date(a.timestamp) - new Date(b.timestamp)
    );
    target.conversations = [...target.conversations, ...source.conversations];
    target.opportunities = [...target.opportunities, ...source.opportunities];
    target.updatedAt = new Date().toISOString();

    // Update indexes
    for (const identity of source.identities) {
      const key = `${identity.platform}:${identity.username}`;
      this.platformIndex[key] = targetId;
    }
    for (const email of source.emails) {
      this.emailIndex[email] = targetId;
    }

    // Remove source
    delete this.persons[sourceId];
    this.save();

    logger.info(`[IDENTITY GRAPH] Merged person ${sourceId} into ${targetId}`);
    return target;
  }

  // ═══════════════════════════════════════════════════════════════
  // TOUCHPOINT TRACKING — record every interaction
  // ═══════════════════════════════════════════════════════════════

  /**
   * Records a touchpoint (interaction) with a person.
   */
  recordTouchpoint(personId, touchpoint) {
    const person = this.persons[personId];
    if (!person) return null;

    person.touchpoints.push({
      ...touchpoint,
      timestamp: new Date().toISOString()
    });

    // Update lead stage based on touchpoint type
    this.updateLeadStage(person, touchpoint);
    person.updatedAt = new Date().toISOString();
    this.save();
    return person;
  }

  /**
   * Automatically advances the lead stage based on interactions.
   */
  updateLeadStage(person, touchpoint) {
    const stageProgression = {
      DISCOVERED: ["QUALIFIED"],
      QUALIFIED: ["CONTACTED"],
      CONTACTED: ["RESPONDED"],
      RESPONDED: ["MEETING_SCHEDULED"],
      MEETING_SCHEDULED: ["MEETING_COMPLETED"],
      MEETING_COMPLETED: ["PROPOSAL_SENT"],
      PROPOSAL_SENT: ["CONVERTED", "LOST"]
    };

    const typeToStage = {
      "COMMENT": "CONTACTED",
      "DM_SENT": "CONTACTED",
      "DM_RECEIVED": "RESPONDED",
      "EMAIL_SENT": "CONTACTED",
      "EMAIL_RECEIVED": "RESPONDED",
      "MEETING_SCHEDULED": "MEETING_SCHEDULED",
      "MEETING_COMPLETED": "MEETING_COMPLETED",
      "PROPOSAL_SENT": "PROPOSAL_SENT",
      "DEAL_WON": "CONVERTED"
    };

    const suggestedStage = typeToStage[touchpoint.type];
    if (suggestedStage) {
      const allowed = stageProgression[person.leadStage] || [];
      if (allowed.includes(suggestedStage)) {
        person.leadStage = suggestedStage;
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // FOLLOW-UP SCHEDULING
  // ═══════════════════════════════════════════════════════════════

  /**
   * Gets persons who need follow-up.
   */
  getPersonsNeedingFollowUp(maxFollowUps = 3, followUpIntervalDays = 3) {
    const now = Date.now();
    const intervalMs = followUpIntervalDays * 24 * 60 * 60 * 1000;

    return Object.values(this.persons).filter(person => {
      // Only follow up on CONTACTED or RESPONDED leads
      if (!["CONTACTED", "RESPONDED"].includes(person.leadStage)) return false;

      // Count existing follow-ups
      const followUpCount = person.touchpoints.filter(t => t.type === "FOLLOW_UP").length;
      if (followUpCount >= maxFollowUps) return false;

      // Check last interaction time
      const lastTouchpoint = person.touchpoints[person.touchpoints.length - 1];
      if (!lastTouchpoint) return false;

      const lastTime = new Date(lastTouchpoint.timestamp).getTime();
      return (now - lastTime) >= intervalMs;
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // LOOKUP & QUERY
  // ═══════════════════════════════════════════════════════════════

  getPersonByPlatform(platform, username) {
    const key = `${platform}:${(username || "").toLowerCase()}`;
    const personId = this.platformIndex[key];
    return personId ? this.persons[personId] : null;
  }

  getPersonByEmail(email) {
    const personId = this.emailIndex[(email || "").toLowerCase()];
    return personId ? this.persons[personId] : null;
  }

  getPerson(personId) {
    return this.persons[personId] || null;
  }

  getAllPersons() {
    return Object.values(this.persons);
  }

  getLeadsByStage(stage) {
    return Object.values(this.persons).filter(p => p.leadStage === stage);
  }

  // ═══════════════════════════════════════════════════════════════
  // INTERNAL
  // ═══════════════════════════════════════════════════════════════

  addPlatformIdentity(personId, signals) {
    const person = this.persons[personId];
    if (!person) return;

    const exists = person.identities.some(
      i => i.platform === signals.platform && i.username === (signals.username || "").toLowerCase()
    );

    if (!exists) {
      person.identities.push({
        platform: signals.platform,
        username: (signals.username || "").toLowerCase(),
        displayName: signals.displayName || "",
        url: signals.url || "",
        discoveredAt: new Date().toISOString()
      });

      const key = `${signals.platform}:${(signals.username || "").toLowerCase()}`;
      this.platformIndex[key] = personId;
    }

    if (signals.email && !person.emails.includes(signals.email.toLowerCase())) {
      person.emails.push(signals.email.toLowerCase());
      this.emailIndex[signals.email.toLowerCase()] = personId;
    }

    person.updatedAt = new Date().toISOString();
    this.save();
  }

  updatePerson(personId, signals) {
    const person = this.persons[personId];
    if (!person) return;

    if (signals.displayName && !person.displayName) {
      person.displayName = signals.displayName;
    }
    if (signals.email && !person.emails.includes(signals.email.toLowerCase())) {
      person.emails.push(signals.email.toLowerCase());
      this.emailIndex[signals.email.toLowerCase()] = personId;
    }
    person.updatedAt = new Date().toISOString();
  }

  load() {
    try {
      if (fs.existsSync(IDENTITY_FILE)) {
        const data = JSON.parse(fs.readFileSync(IDENTITY_FILE, "utf8"));
        this.persons = data.persons || {};
        this.platformIndex = data.platformIndex || {};
        this.emailIndex = data.emailIndex || {};
      }
    } catch (err) {
      logger.warn(`[IDENTITY GRAPH] Failed to load: ${err.message}`);
    }
  }

  save() {
    try {
      const dir = path.dirname(IDENTITY_FILE);
      fs.mkdirSync(dir, { recursive: true });
      const tmp = `${IDENTITY_FILE}.tmp.${Date.now()}`;
      fs.writeFileSync(tmp, JSON.stringify({
        version: 1,
        lastUpdated: new Date().toISOString(),
        persons: this.persons,
        platformIndex: this.platformIndex,
        emailIndex: this.emailIndex
      }, null, 2), "utf8");
      fs.renameSync(tmp, IDENTITY_FILE);
    } catch (err) {
      logger.warn(`[IDENTITY GRAPH] Failed to save: ${err.message}`);
    }
  }
}

const identityGraph = new IdentityGraph();
module.exports = identityGraph;
