/**
 * src/leads/follow-up-scheduler.js
 * Durable Follow-Up Engine.
 *
 * Manages automatic follow-ups for leads that haven't responded.
 * Integrates with the IdentityGraph to determine when and how to follow up.
 *
 * Rules:
 *   - Max 3 follow-ups per lead (configurable)
 *   - 3-day interval between follow-ups (configurable)
 *   - Different follow-up strategy per stage
 *   - Cross-platform: if DM didn't work, try email; if email didn't work, try LinkedIn
 */

const identityGraph = require("./identity-graph");
const logger = require("../logging/logger");

class FollowUpScheduler {
  /**
   * @param {Object} [options={}]
   * @param {number} [options.maxFollowUps=3] — Max follow-ups per person
   * @param {number} [options.intervalDays=3] — Days between follow-ups
   */
  constructor(options = {}) {
    this.maxFollowUps = options.maxFollowUps || 3;
    this.intervalDays = options.intervalDays || 3;
  }

  /**
   * Gets all leads that are due for a follow-up.
   * @returns {Array<Object>} — Array of { person, suggestedPlatform, suggestedAction, followUpNumber }
   */
  getDueFollowUps() {
    const personsNeedingFollowUp = identityGraph.getPersonsNeedingFollowUp(
      this.maxFollowUps,
      this.intervalDays
    );

    return personsNeedingFollowUp.map(person => {
      const followUpNumber = person.touchpoints.filter(t => t.type === "FOLLOW_UP").length + 1;
      const { platform, action } = this.selectFollowUpStrategy(person, followUpNumber);

      return {
        person,
        personId: person.id,
        displayName: person.displayName,
        suggestedPlatform: platform,
        suggestedAction: action,
        followUpNumber,
        maxFollowUps: this.maxFollowUps
      };
    });
  }

  /**
   * Selects the best platform and action for a follow-up.
   * Strategy: try different channels to maximize response probability.
   */
  selectFollowUpStrategy(person, followUpNumber) {
    const platforms = person.identities.map(i => i.platform);
    const previousFollowUps = person.touchpoints
      .filter(t => t.type === "FOLLOW_UP")
      .map(t => t.platform);

    // Follow-up escalation strategy
    if (followUpNumber === 1) {
      // First follow-up: same platform as initial outreach
      const initialOutreach = person.touchpoints.find(t =>
        ["COMMENT", "DM_SENT"].includes(t.type)
      );
      const platform = initialOutreach?.platform || platforms[0] || "threads";
      return { platform, action: "DM" };
    }

    if (followUpNumber === 2) {
      // Second follow-up: try a different platform
      const unusedPlatforms = platforms.filter(p => !previousFollowUps.includes(p));
      const platform = unusedPlatforms[0] || platforms[0] || "linkedin";
      return { platform, action: "DM" };
    }

    // Third follow-up: try email if available, otherwise last resort DM
    if (person.emails.length > 0) {
      return { platform: "email", action: "EMAIL" };
    }

    const platform = platforms[platforms.length - 1] || "linkedin";
    return { platform, action: "DM" };
  }

  /**
   * Records that a follow-up was executed.
   */
  recordFollowUp(personId, { platform, action, content, success }) {
    identityGraph.recordTouchpoint(personId, {
      type: "FOLLOW_UP",
      platform,
      action,
      content: content?.slice(0, 200),
      success,
      followUpNumber: (identityGraph.getPerson(personId)?.touchpoints || [])
        .filter(t => t.type === "FOLLOW_UP").length
    });
  }

  /**
   * Generates follow-up message content based on context.
   * @param {Object} person — Person object from IdentityGraph
   * @param {number} followUpNumber — Which follow-up this is (1, 2, 3)
   * @returns {Object} — { context, instruction } for AI to generate the actual message
   */
  getFollowUpContext(person, followUpNumber) {
    const lastOutreach = person.touchpoints
      .filter(t => ["COMMENT", "DM_SENT", "EMAIL_SENT", "FOLLOW_UP"].includes(t.type))
      .pop();

    return {
      personName: person.displayName,
      followUpNumber,
      maxFollowUps: this.maxFollowUps,
      lastOutreachType: lastOutreach?.type || "UNKNOWN",
      lastOutreachContent: lastOutreach?.content || "",
      daysSinceLastOutreach: lastOutreach
        ? Math.floor((Date.now() - new Date(lastOutreach.timestamp).getTime()) / (24 * 60 * 60 * 1000))
        : 0,
      leadStage: person.leadStage,
      instruction: `Generate a ${followUpNumber === 1 ? "friendly" : followUpNumber === 2 ? "professional value-adding" : "final polite"} follow-up message.
${followUpNumber >= this.maxFollowUps ? "This is the FINAL follow-up. Be respectful of their time and clearly state this is the last message." : ""}
Reference the previous conversation naturally. Don't be pushy.`
    };
  }
}

module.exports = FollowUpScheduler;
