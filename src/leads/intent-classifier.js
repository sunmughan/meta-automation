/**
 * src/leads/intent-classifier.js
 * Intent Classification — Pure AI Delegation Layer.
 *
 * ARCHITECTURAL RULE (v1.5.0+):
 * ALL post classification is delegated to the Antigravity AI Decision Engine.
 * Zero regex, zero keyword arrays, zero heuristic pre-filters.
 * The authoritative brain is: src/ai/ai-decision-engine.js
 *
 * This file exists solely as the public API surface for classifyAsync().
 */

class IntentClassifier {
  /**
   * Primary entry point: Delegates asynchronous qualification directly
   * to the Antigravity AI Decision Engine. Zero regex, zero heuristics.
   *
   * @param {Object} post - { text, username, url, postId, timestamp }
   * @param {Object} [options] - Passed through to AI engine
   * @returns {Promise<Object>} Complete AI Decision Object
   */
  async classifyAsync(post, options = {}) {
    const aiDecisionEngine = require("../ai/ai-decision-engine");
    return await aiDecisionEngine.qualifyPost(post, options);
  }

  /**
   * @deprecated LEGACY SYNC CLASSIFIER — TEST BENCHMARK FIXTURE ONLY.
   * Preserved strictly for deterministic legacy test suite benchmarks.
   * Production runtime exclusively invokes classifyAsync() via Antigravity Gemini 3.8 Flash AI.
   */
  classify(post) {
    try {
      const legacy = require("../../tests/fixtures/legacy-classifier");
      return legacy.classify(post);
    } catch (_) {
      return {
        qualified: false,
        score: 0,
        temperature: "UNKNOWN",
        is_genuine_buyer: false,
        lead_type: "REQUIRES_AI",
        intent: "REQUIRES_AI",
        reason: "Synchronous classification removed. Use classifyAsync() for AI-powered analysis.",
        matchedServices: [],
        should_reply: false
      };
    }
  }
}

const intentClassifier = new IntentClassifier();
module.exports = intentClassifier;
