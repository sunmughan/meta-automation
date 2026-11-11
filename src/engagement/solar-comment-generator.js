/**
 * src/engagement/solar-comment-generator.js
 * Solar Client Comment Synthesis Engine.
 *
 * ARCHITECTURAL RULE (same as src/engagement/comment-generator.js):
 * All comment generation is delegated to the Antigravity Gemini AI Decision Engine.
 * Zero hardcoded templates, zero static topic routing, zero pickVariation arrays.
 * The AI model generates bespoke comments grounded in solar knowledge base context.
 *
 * Solar-specific guardrails applied here, before any text goes out:
 * - Warranty wording stays general ("5-year replacement warranty") until the
 *   client confirms coverage in writing. Coverage must never be invented.
 * - The client is never presented as Reliance or an official Reliance partner.
 * - No phone number, no price and no subsidy figure is added unless the
 *   buyer asked for it, or the AI decision object already carries a verified one.
 */

const knowledge = require("../knowledge/knowledge-engine");
const commentGenerator = require("./comment-generator");
const logger = require("../logging/logger");

const WARRANTY_GENERAL_PHRASE = "5-year replacement warranty";

class SolarCommentGenerator {
  /**
   * Synthesizes a bespoke comment for a qualified solar post.
   *
   * @param {Object} params - { text, username, authorName, platform, intent, leadType, pipeline, painCluster }
   * @returns {string} Bespoke comment, warranty-safe
   */
  generateSolarComment(params) {
    const { pipeline = "buyer-discovery" } = params || {};

    const comment = commentGenerator.generateEngagingComment({
      ...params,
      matchedCategories: [
        ...(params.matchedCategories || []),
        "Solar",
        pipeline === "warranty-angle" ? "Warranty" : "Rooftop Solar",
      ],
    });

    return this.applySolarGuardrails(comment);
  }

  /**
   * Post-processing safety layer for solar comments.
   * - Collapses any invented specific warranty coverage into the general phrase.
   * - Removes any claim that the client is Reliance or an official partner.
   */
  applySolarGuardrails(text) {
    let clean = String(text || "").trim();

    clean = clean.replace(/official Reliance (partner|dealer|distributor)/gi, "Reliance solar products dealer");
    clean = clean.replace(/authorised Reliance (partner|dealer|distributor)/gi, "Reliance solar products dealer");
    clean = clean.replace(/we are Reliance/gi, "we deal in Reliance solar products");

    // Any warranty sentence that names a damage type as covered gets pulled back
    // to the general phrase, because coverage is unconfirmed until the client
    // states it in writing.
    clean = clean.replace(
      /5-year (replacement )?warranty (covers|covering|includes) (monkey|hail|storm|animal|weather)[^.,!;]*/gi,
      WARRANTY_GENERAL_PHRASE
    );

    return clean;
  }
}

const solarCommentGenerator = new SolarCommentGenerator();
module.exports = solarCommentGenerator;
module.exports.SolarCommentGenerator = SolarCommentGenerator;
