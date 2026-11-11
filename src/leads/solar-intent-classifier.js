/**
 * src/leads/solar-intent-classifier.js
 * Solar Client Intent Classification - Pure AI Delegation Layer.
 *
 * ARCHITECTURAL RULE (same as src/leads/intent-classifier.js):
 * ALL post classification is delegated to the Antigravity Gemini AI Decision Engine.
 * Zero regex, zero keyword arrays, zero heuristic pre-filters.
 * The authoritative brain is: src/ai/ai-decision-engine.js
 *
 * This module adds solar client context to the post before delegation:
 * which pipeline it was found by, and which pain cluster it may belong to.
 * The AI still makes the final call, live, per post.
 */

const SOLAR_PIPELINES = ["buyer-discovery", "pain-point-hunting", "warranty-angle"];

class SolarIntentClassifier {
  /**
   * Classify a post for the solar client.
   *
   * @param {Object} post - { text, username, url, postId, timestamp, platform }
   * @param {Object} [options] - { pipeline, useAiCall }
   * @returns {Promise<Object>} Complete AI Decision Object
   */
  async classifyAsync(post, options = {}) {
    const pipeline = String(options.pipeline || "buyer-discovery");
    if (!SOLAR_PIPELINES.includes(pipeline)) {
      throw new Error(`Unknown solar pipeline: ${pipeline}`);
    }

    const aiDecisionEngine = require("../ai/ai-decision-engine");

    const solarPost = {
      ...post,
      client: "solar-india-dealer",
      pipeline,
      knowledgeFiles: ["solar-client.md", "solar-services.md"],
    };

    return await aiDecisionEngine.qualifyPost(solarPost, options);
  }

  static pipelines() {
    return [...SOLAR_PIPELINES];
  }
}

const solarIntentClassifier = new SolarIntentClassifier();
module.exports = solarIntentClassifier;
module.exports.SolarIntentClassifier = SolarIntentClassifier;
