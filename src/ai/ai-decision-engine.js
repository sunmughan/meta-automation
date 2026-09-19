/**
 * src/ai/ai-decision-engine.js
 * Central AI Decision Engine for CodeAir Threads + Instagram System.
 *
 * Integrates:
 * - Deterministic intent classification (intent-classifier.js)
 * - Approved service matching (service-matcher.js)
 * - Identity decision layer (identity-resolver.js)
 * - Detailed engaging comment generation (comment-generator.js)
 * - Dynamic knowledge base prompts (knowledge-engine.js)
 * - AI Runtime execution with graceful fallbacks
 */

const knowledge = require("../knowledge/knowledge-engine");
const intentClassifier = require("../leads/intent-classifier");
const identityResolver = require("../conversations/identity-resolver");
const commentGenerator = require("../engagement/comment-generator");
const aiRuntime = require("./ai-runtime");
const logger = require("../logging/logger");

class AiDecisionEngine {
  /**
   * Evaluates a post and generates an AI Decision Object.
   *
   * @param {Object} post - { text, username, url, postId }
   * @param {Object} [options]
   * @returns {Promise<Object>} AI Decision Object
   */
  async qualifyPost(post, options = {}) {
    // 1. Fast deterministic pre-check
    const preCheck = intentClassifier.classify(post);

    // If pre-check disqualified (recruitment, job seeker, provider, out-of-scope, no service match)
    if (!preCheck.qualified) {
      return {
        intent: preCheck.intent,
        service_match: false,
        service: null,
        identity: "NEUTRAL",
        company_mentioned_before: false,
        founder_mentioned_before: false,
        conversation_stage: "IGNORED",
        sales_intensity: "LOW",
        should_reply: false,
        is_genuine_buyer: false,
        relevance_score: preCheck.score || 0,
        temperature: "IGNORE",
        lead_type: preCheck.lead_type,
        matched_services: [],
        reason: preCheck.reason,
        generated_comment: null
      };
    }

    // 2. Resolve Identity: WHO SHOULD SPEAK?
    const identityResult = identityResolver.resolveIdentity({
      message: post.text,
      originalPost: post.text,
      conversationStage: "INITIAL",
      intent: preCheck.intent
    });

    // 3. Generate detailed, engaging comment
    const detailedComment = commentGenerator.generateEngagingComment({
      text: post.text,
      username: post.username,
      matchedCategories: preCheck.matchedCategories || [],
      identity: identityResult.identity
    });

    // 4. If AI runtime is available and not in offline/test mode, we can enrich with Gemini
    if (options.useAiCall) {
      try {
        const prompt = this.buildEnrichmentPrompt(post, preCheck, identityResult, detailedComment);
        const aiResponse = await aiRuntime.callAi(prompt);
        if (aiResponse && aiResponse.generated_comment) {
          return {
            ...aiResponse,
            identity: identityResult.identity,
            service_match: true,
            is_genuine_buyer: true
          };
        }
      } catch (err) {
        logger.warn(`AI model call bypassed or failed (${err.message}). Using knowledge-grounded synthesis.`);
      }
    }

    // 5. Return complete AI Decision Object
    const primaryService = (preCheck.matchedServices && preCheck.matchedServices[0]) || (preCheck.matchedCategories && preCheck.matchedCategories[0]) || "Custom Software";

    return {
      intent: preCheck.intent,
      service_match: true,
      service: primaryService,
      identity: identityResult.identity,
      company_mentioned_before: false,
      founder_mentioned_before: false,
      conversation_stage: "INITIAL",
      sales_intensity: "LOW",
      should_reply: true,
      is_genuine_buyer: true,
      relevance_score: preCheck.score || 90,
      temperature: preCheck.temperature || "HOT",
      lead_type: preCheck.lead_type || "PROJECT_BUYER",
      matched_services: preCheck.matchedServices || [primaryService],
      reason: preCheck.reason,
      identity_reason: identityResult.reason,
      generated_comment: detailedComment
    };
  }

  /**
   * Generates a conversational reply to an incoming comment reply or DM.
   */
  async generateConversationReply(context) {
    const {
      incomingMessage = "",
      originalPost = "",
      ourPreviousMessage = "",
      conversationStage = "DISCOVERY",
      companyMentionedBefore = false,
      founderMentionedBefore = false,
      username = "user"
    } = context;

    // 1. Resolve Identity
    const identityResult = identityResolver.resolveIdentity({
      message: incomingMessage,
      originalPost,
      conversationStage,
      companyMentionedBefore,
      founderMentionedBefore
    });

    // 2. Check if a verified link was requested
    const requestedLink = knowledge.resolveRequestedLink(incomingMessage);

    // 3. Human review escalation check (pricing negotiations, contracts, angry tones)
    const lower = incomingMessage.toLowerCase();
    const needsHumanReview =
      /\b(how\s+much\s+does\s+it\s+cost|send\s+a\s+quote|what\s+is\s+your\s+rate|discount|sign\s+contract|nda|lawyer|sue|angry|terrible)\b/i.test(lower);

    // 4. Generate contextual response message
    let responseMessage = "";

    if (requestedLink) {
      if (requestedLink.url) {
        responseMessage = `Here is the official link you requested: ${requestedLink.url}`;
      } else {
        responseMessage = `Here are our official profiles:\n${requestedLink.text}`;
      }
    } else if (identityResult.identity === "FOUNDER") {
      if (/\bwho\s+(is\s+)?behind\s+codeair\b/i.test(lower) || /\bwho\s+founded\b/i.test(lower)) {
        responseMessage = `I'm the founder behind CodeAir Software Solutions. We build custom software, SaaS products, AI systems and business automation.`;
      } else {
        responseMessage = `I'm the founder behind CodeAir. Tell me a little about what you're building and the core technical requirement first.`;
      }
    } else if (identityResult.identity === "BOTH") {
      responseMessage = `CodeAir Software Solutions is a software and technology company focused on custom software, SaaS, AI and business automation. I'm the founder behind the company.`;
    } else if (identityResult.identity === "COMPANY" && /\bwhat\s+(does\s+)?codeair\s+do\b/i.test(lower)) {
      responseMessage = `We build custom software, SaaS platforms, business applications, AI systems and automation solutions for companies.`;
    } else {
      // Conversational follow-up
      responseMessage = `That makes sense. What does your current architecture or toolchain look like, and are you working towards an immediate launch timeline?`;
    }

    return {
      intent: "PROJECT_INQUIRY",
      identity: identityResult.identity,
      identity_reason: identityResult.reason,
      service_match: true,
      conversation_stage: needsHumanReview ? "HUMAN_REVIEW" : conversationStage,
      sales_intensity: needsHumanReview ? "MEDIUM" : "LOW",
      should_reply: true,
      human_review_required: needsHumanReview,
      requested_link: requestedLink,
      response_message: responseMessage
    };
  }

  buildEnrichmentPrompt(post, preCheck, identityResult, fallbackComment) {
    return `
You are the AI Lead Specialist for CodeAir Software Solutions.
Strictly adhere to the CodeAir Knowledge Base.

COMPANY: CodeAir Software Solutions (Custom software, SaaS, AI automation, Mobile, Web, APIs).
COMMUNICATION STYLE: Natural, professional, human, detailed, and engaging.
IDENTITY DECISION: ${identityResult.identity} (${identityResult.reason})

POST AUTHOR: @${post.username || "user"}
POST CONTENT:
"""${post.text || ""}"""

MATCHED CATEGORIES: ${(preCheck.matchedCategories || []).join(", ")}
PRIMARY SERVICE: ${(preCheck.matchedServices || [])[0] || "Custom Software"}

TASK:
Generate a detailed and engaging discovery comment that:
1. Demonstrates clear technical understanding of their need.
2. Offers a brief architectural perspective or practical insight.
3. Asks an engaging discovery question about their workflow, stack, or constraints.
4. Does NOT sound like an advertisement, spam, or corporate pitch.

OUTPUT FORMAT: Strict JSON matching:
{
  "intent": "BUYER",
  "service": "${(preCheck.matchedServices || [])[0] || "Custom Software"}",
  "identity": "${identityResult.identity}",
  "conversation_stage": "INITIAL",
  "sales_intensity": "LOW",
  "should_reply": true,
  "is_genuine_buyer": true,
  "relevance_score": 90,
  "temperature": "HOT",
  "lead_type": "PROJECT_BUYER",
  "matched_services": ${JSON.stringify(preCheck.matchedServices || [])},
  "reason": "${preCheck.reason}",
  "generated_comment": "${fallbackComment}"
}
`;
  }
}

const aiDecisionEngine = new AiDecisionEngine();
module.exports = aiDecisionEngine;
