/**
 * src/engagement/comment-generator.js
 * AI-Delegated Comment Synthesis Engine.
 *
 * ARCHITECTURAL RULE (v1.5.0+):
 * All comment generation is delegated to the Antigravity AI Decision Engine.
 * Zero hardcoded templates, zero static topic routing, zero pickVariation arrays.
 * The AI model generates bespoke comments grounded in knowledge base context.
 *
 * Retained utilities:
 * - enforceSingleUrl(): Post-processing safety layer ensuring max 1 URL per comment.
 * - generateEngagingComment(): Thin AI delegation wrapper with enforceSingleUrl() post-processing.
 */

const knowledge = require("../knowledge/knowledge-engine");
const aiRuntime = require("../ai/ai-runtime");
const logger = require("../logging/logger");

class CommentGenerator {
  /**
   * Enforces the Single URL Discipline.
   * Ensures that no generated comment contains more than 1 URL.
   */
  enforceSingleUrl(text, preferredUrl) {
    if (!text) return "";
    const urlRegex = /https?:\/\/[^\s)]+/gi;
    const matches = text.match(urlRegex) || [];
    if (matches.length <= 1) return text;

    // More than 1 URL found: keep only preferredUrl or the first one
    let targetUrlToKeep = preferredUrl || matches[0];
    let replaced = false;
    return text.replace(urlRegex, (url) => {
      if (!replaced && (url.includes(targetUrlToKeep) || targetUrlToKeep.includes(url))) {
        replaced = true;
        return url;
      }
      return "";
    }).replace(/\s{2,}/g, " ").replace(/\s+([.,!])/g, "$1").trim();
  }

  /**
   * Synthesizes a bespoke, engaging comment using Antigravity AI reasoning.
   * Falls back to a minimal dynamic template only if AI is unavailable.
   *
   * @param {Object} params
   * @param {string} params.text - Original post text
   * @param {string} params.username - Author username
   * @param {string[]} params.matchedCategories - Matched categories from AI analysis
   * @param {string} params.identity - "FOUNDER"|"COMPANY"|"BOTH"|"NEUTRAL"
   * @returns {string} Bespoke engaging comment
   */
  generateEngagingComment(params) {
    const { text = "", username = "", matchedCategories = [], identity = "COMPANY" } = params;
    const handle = username ? `@${username}` : "";
    const greeting = handle ? `${handle} ` : "";

    // Resolve ALL brand identity dynamically from knowledge base (zero hardcoded strings)
    const founder = knowledge.getFounderInfo();
    const company = knowledge.getCompanyInfo();
    const founderName = founder.name || "Founder";
    const founderRole = founder.role || "Founder";
    const companyName = company.name || "our team";
    const companyWebsite = knowledge.getProfileLink("COMPANY", "website") || company.website || "";
    const productUrl = knowledge.getProfileLink("COMPANY", "pixelgo") || company.productUrl || "";
    const isFacebook = Boolean(params && (params.platform === "facebook" || (params.post && params.post.platform === "facebook")));
    const founderLink = isFacebook ? companyWebsite : (knowledge.getProfileLink("FOUNDER", "linkedin") || founder.linkedin || companyWebsite);

    // Determine primary URL based on identity
    let primaryUrl = "";
    if (identity === "FOUNDER") primaryUrl = founderLink;
    else if (identity === "COMPANY" || identity === "BOTH") primaryUrl = companyWebsite;

    const isHospitality = knowledge.isHospitalityQuery(text) || (matchedCategories && matchedCategories.some(c => /hospitality|hotel/i.test(c)));
    if (isHospitality && productUrl) {
      primaryUrl = productUrl;
    }

    const lowerText = text.toLowerCase();
    const isAiSupport = lowerText.includes("support") || lowerText.includes("customer") || (matchedCategories && matchedCategories.some(c => /ai/i.test(c)));
    const isReact = lowerText.includes("react") || (matchedCategories && matchedCategories.some(c => /react/i.test(c)));

    const category = (matchedCategories && matchedCategories[0]) || "software development";
    let topicFocus = category;
    if (isHospitality) {
      topicFocus = "hospitality and hotel management systems";
    } else if (isReact) {
      topicFocus = "React and modern web applications";
    } else if (isAiSupport) {
      topicFocus = "AI customer support automation and workflows";
    }

    let comment;
    const flagshipName = company.flagshipProduct || (company.flagship ? company.flagship.split("(")[0].trim() : "PixelGo HMS");

    if (isHospitality) {
      if (identity === "NEUTRAL") {
        comment = `${greeting}This is an interesting hospitality project. Are you looking for custom reservation flows or a unified system?`;
      } else if (identity === "FOUNDER") {
        comment = `${greeting}I'd love to help! I'm ${founderName}, ${founderRole} at ${companyName}. We built ${flagshipName} for hospitality operations. Explore our system at ${primaryUrl} or send a DM!`;
      } else if (identity === "BOTH") {
        comment = `${greeting}Our engineering team at ${companyName} specializes in hospitality tech like ${flagshipName}. Explore our platform at ${primaryUrl}. Send a DM anytime!`;
      } else {
        // COMPANY
        comment = `${greeting}At ${companyName}, we specialize in hotel and property management systems including ${flagshipName}. Explore our platform at ${primaryUrl}. Feel free to send a DM!`;
      }
    } else if (identity === "NEUTRAL") {
      comment = `${greeting}This is an interesting ${topicFocus} challenge. What's your preferred approach and timeline for this build?`;
    } else if (identity === "FOUNDER") {
      comment = `${greeting}I'd love to help with this! I'm ${founderName}, ${founderRole} at ${companyName}. We build ${topicFocus}. Feel free to connect at ${primaryUrl} or send a DM!`;
    } else if (identity === "BOTH") {
      comment = `${greeting}Our engineering team at ${companyName} works on ${topicFocus} with direct founder oversight. Check our work at ${primaryUrl}. Send a DM anytime!`;
    } else {
      // COMPANY
      comment = `${greeting}At ${companyName}, we specialize in ${topicFocus}. See our work at ${primaryUrl}. Feel free to send a DM with your project details!`;
    }

    return this.enforceSingleUrl(comment, primaryUrl);
  }

  /**
   * AI-powered bespoke comment generation.
   * Uses Antigravity AI to generate contextually rich, personalized comments.
   *
   * @param {Object} params - Same as generateEngagingComment
   * @returns {Promise<string>} AI-generated bespoke comment
   */
  async generateEngagingCommentAsync(params) {
    const { text = "", username = "", matchedCategories = [], identity = "COMPANY" } = params;

    const founder = knowledge.getFounderInfo();
    const company = knowledge.getCompanyInfo();
    const profiles = knowledge.getOfficialProfiles();
    const companyUrl = profiles.company.website || company.website || "";
    const founderUrl = profiles.founder.linkedin || "";
    const productUrl = profiles.company.pixelgo || company.productUrl || "";

    const category = (matchedCategories && matchedCategories[0]) || "software development";

    try {
      const prompt = `
CRITICAL OPERATIONAL CONSTRAINT:
You are generating a single engaging comment reply for a social media post. DO NOT invoke ANY tools. Output ONLY valid JSON.

Context:
- Company: ${company.name} (${company.summary})
- Founder: ${founder.name} (${founder.role})
- Identity Mode: ${identity}
- Post Author: @${username}
- Post Content: """${text}"""
- Matched Category: ${category}
- Available URLs:
  * Company Website: ${companyUrl}
  * Founder Profile: ${founderUrl}
  * Product URL: ${productUrl}

Rules:
1. Write a bespoke 2-3 sentence comment addressing the author's exact project or question.
2. Identity "${identity}":
   - FOUNDER: Speak as ${founder.name} (${founder.role}), share founder profile only.
   - COMPANY: Speak as ${company.name}, share company website only.
   - BOTH: Company team with founder oversight, share company website only.
   - NEUTRAL: Pure technical value, zero URLs, zero promotion.
3. Maximum 1 URL total. Zero canned clichés. Directly helpful.
4. Natural conversational English. No hashtags.

OUTPUT STRICT JSON:
{
  "comment": "string"
}
`;

      const res = await aiRuntime.callAi(prompt, { taskType: "COMMENT_SYNTHESIS" });
      if (res && res.comment) {
        const primaryUrl = identity === "FOUNDER" ? founderUrl : companyUrl;
        return this.enforceSingleUrl(res.comment, primaryUrl);
      }
    } catch (err) {
      logger.warn(`[CommentGenerator] AI comment generation failed for @${username}: ${err.message}`);
    }

    // Fallback to dynamic template
    return this.generateEngagingComment(params);
  }
}

const commentGenerator = new CommentGenerator();
module.exports = commentGenerator;
