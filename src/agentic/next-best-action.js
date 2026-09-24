/**
 * AI Next-Best-Action engine.
 * Business strategy is decided from current evidence and relationship history.
 */

const knowledge = require("../knowledge/knowledge-engine");

class NextBestAction {
  constructor({ aiRuntime }) {
    this.aiRuntime = aiRuntime;
  }

  async decide({ platform, snapshot, people = [], goal }) {
    const company = knowledge.getCompanyInfo();
    const founder = knowledge.getFounderInfo();

    const prompt = [
      "You are the next-best-action planner for an omnichannel B2B relationship agent.",
      "Use only current supplied evidence and relationship history.",
      "Do not rely on platform-specific selectors.",
      "Choose one action category: OBSERVE, WAIT, LIKE, COMMENT, REPLY, FOLLOW, CONNECT, DM, PUBLISH, HANDOFF, STOP.",
      "Prefer the least intrusive action that meaningfully advances the stated goal.",
      "A public interaction must directly respond to visible context.",
      "Do not fabricate facts, identities, requirements, or previous conversations.",
      "Return JSON with action, rationale, personId, confidence, and draftText.",
      "",
      "COMPANY: " + String(company?.name || ""),
      "FOUNDER: " + String(founder?.name || ""),
      "GOAL: " + String(goal || ""),
      "PLATFORM: " + String(platform || ""),
      "LIVE SNAPSHOT:",
      JSON.stringify(snapshot),
      "RELATIONSHIPS:",
      JSON.stringify(people)
    ].join("\n");

    return this.aiRuntime.callAi(prompt, {
      taskType: "NEXT_BEST_ACTION",
      priority: 1
    });
  }
}

module.exports = NextBestAction;
