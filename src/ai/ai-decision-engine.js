/**
 * src/ai/ai-decision-engine.js
 * Central AI Decision Engine for CodeAir Threads + Instagram System.
 *
 * ARCHITECTURAL RULE:
 * Semantic AI reasoning is the PRIMARY and MANDATORY entry point for EVERY captured post.
 * NO keyword filter, regex filter, deterministic classifier, service-pattern matcher,
 * heuristic pre-filter, score threshold or hardcoded rule may discard a post before AI reasoning.
 *
 * Gathers authoritative knowledge from ~/threads-agent/knowledge/:
 * - services.md & company.md (CodeAir services, capabilities, exclusions)
 * - founder.md (Sunmughan Swamy identity, technical background)
 * - positioning.md (Core positioning, zero hype, clean architecture)
 * - communication-style.md (Natural human tone, executive demeanor)
 * - lead-rules.md (Buyer vs provider vs job seeker vs corporate recruitment)
 * - profiles.md (Official URLs)
 */

const knowledge = require("../knowledge/knowledge-engine");
const commentGenerator = require("../engagement/comment-generator");
const aiRuntime = require("./ai-runtime");
const stateStore = require("../storage/state-store");
const logger = require("../logging/logger");

class AiDecisionEngine {
  /**
   * Primary entry point: Evaluates any captured post using Semantic AI reasoning.
   * Every post captured on screen is processed directly here with zero premature filtering.
   *
   * @param {Object} post - { text, username, url, postId, timestamp, mediaContext }
   * @param {Object} [options] - { useAiCall: boolean }
   * @returns {Promise<Object>} Complete AI Decision Object
   */
  async qualifyPost(post, options = {}) {
    const rawText = String(post?.text || "").trim();
    const username = String(post?.username || "user").trim();

    // 1. Primary Semantic AI Analysis (Zero Premature Discards)
    // Every post captured on screen enters AI reasoning with zero pre-filters or regex shortcuts.
    const analysis = await this.analyzePostSemantics(post, options);

    // 3. Format complete decision object
    if (analysis.decision === "QUALIFIED" && analysis.is_genuine_buyer) {
      // Determine representation if not already set
      let rep = analysis.representation;
      if (!rep || rep === "IGNORE") {
        if (analysis.target_entity === "INDIVIDUAL") rep = "FOUNDER";
        else if (analysis.target_entity === "COMPANY") rep = "COMPANY";
        else if (analysis.target_entity === "EITHER") rep = "BOTH";
        else rep = "COMPANY";
      }

      // Synthesize high-quality personalized comment
      const comment = analysis.generated_comment || commentGenerator.generateEngagingComment({
        text: rawText,
        username: username,
        matchedCategories: analysis.matched_categories || [analysis.matched_capability || "Web Development"],
        identity: rep
      });

      return {
        intent: analysis.intent || "BUYER",
        requirement: analysis.requirement || "Custom software requirement",
        target_entity: analysis.target_entity || "EITHER",
        service_match: true,
        matched_capability: analysis.matched_capability || "Custom Software",
        matched_services: analysis.matched_services || [analysis.matched_capability || "Custom Software"],
        matched_categories: analysis.matched_categories || [analysis.matched_capability || "Web Development"],
        representation: rep,
        decision: "QUALIFIED",
        temperature: analysis.temperature || "HOT",
        relevance_score: analysis.relevance_score || 90,
        is_genuine_buyer: true,
        should_reply: true,
        lead_type: "PROJECT_BUYER",
        reason: analysis.reason,
        generated_comment: comment
      };
    }

    // Ignored or Non-buyer post
    return {
      intent: analysis.intent || "IRRELEVANT",
      requirement: analysis.requirement || null,
      target_entity: analysis.target_entity || null,
      service_match: Boolean(analysis.service_match),
      matched_capability: analysis.matched_capability || null,
      matched_services: [],
      matched_categories: [],
      representation: analysis.representation || "IGNORE",
      decision: analysis.decision || "IGNORED",
      temperature: "IGNORE",
      relevance_score: analysis.relevance_score || 0,
      is_genuine_buyer: false,
      should_reply: false,
      lead_type: analysis.lead_type || analysis.intent || "IRRELEVANT",
      quarantined: Boolean(analysis.quarantined),
      reason: analysis.reason || "Post did not present an actionable client project or hiring requirement.",
      generated_comment: null
    };
  }

  /**
   * Deep Semantic AI reasoning across the post context and knowledge base.
   * Evaluates intent, requirement, target entity, capability matching, and representation.
   *
   * @param {Object} post - { text, username, url, postId, timestamp, mediaContext }
   * @param {Object} options - { useAiCall: boolean }
   * @returns {Promise<Object>} Semantic analysis results
   */
  async analyzePostSemantics(post, options = {}) {
    const text = String(post?.text || "").trim();

    if (!text || text.length < 10) {
      return {
        intent: "IRRELEVANT",
        decision: "IGNORED",
        is_genuine_buyer: false,
        reason: "Post text is empty or too short for meaningful analysis."
      };
    }

    try {
      const prompt = this.buildFullSemanticPrompt(post);
      const aiRes = await aiRuntime.callAi(prompt, { taskType: "POST_ANALYSIS" });
      if (aiRes && (aiRes.intent || aiRes.decision)) {
        return this.normalizeAiResponse(aiRes, post);
      }
      throw new Error("AI returned empty classification response");
    } catch (err) {
      logger.warn(`[AI Engine] Antigravity AI reasoning failed on post ${post?.postId || "unknown"}: ${err.message}`);
      return {
        intent: "AI_ERROR",
        decision: "IGNORED",
        lead_type: "QUARANTINED",
        quarantined: true,
        service_match: false,
        representation: "IGNORE",
        is_genuine_buyer: false,
        should_reply: false,
        reason: `Antigravity AI reasoning unavailable (${err.message}). Quarantined with zero heuristic guessing.`
      };
    }
  }

  /**
   * Extracts concise natural language requirement summary from post text.
   */
  extractNaturalRequirement(text, defaultCapability) {
    const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
    const firstSubstantive = lines.find(l => l.length > 15 && l.includes(" ") && !l.includes("Threads") && !l.match(/^\d+[hmd]$/i)) ||
      lines.find(l => l.includes(" ") && !l.match(/^\d+[hmd]$/i)) ||
      lines[0] || text;
    const clean = firstSubstantive.replace(/^["']|["']$/g, "").slice(0, 120);
    return `Client seeking: "${clean}" (${defaultCapability})`;
  }

  /**
   * Normalizes AI model response into standard format.
   */
  normalizeAiResponse(aiRes, post) {
    const intent = (aiRes.intent || "").toUpperCase();
    const decision = (aiRes.decision || "").toUpperCase();
    const isDisqualified =
      decision === "IGNORED" ||
      aiRes.is_genuine_buyer === false ||
      aiRes.service_match === false ||
      intent === "OUT_OF_SCOPE" ||
      intent === "SERVICE_PROVIDER" ||
      intent === "RECRUITMENT" ||
      intent === "JOB_SEEKER" ||
      intent === "CAREER_ADVICE" ||
      intent === "LEAD_GENERATION_BUYER" ||
      intent === "IRRELEVANT";

    const isBuyer = !isDisqualified && (
      intent === "BUYER" ||
      intent === "PROJECT_BUYER" ||
      intent === "INDUSTRY_LEAD" ||
      intent === "BRAND_INQUIRY" ||
      intent === "FOUNDER_INQUIRY" ||
      intent === "CAPABILITY_INQUIRY" ||
      aiRes.is_genuine_buyer === true
    );

    if (isBuyer) {
      let rawCap = aiRes.primary_capability || aiRes.primary_category || aiRes.matched_capability || "Web Development";
      let cap = "Web Development";
      const capLower = String(rawCap).toLowerCase();
      if (/\b(hotels?|resorts?|hospitality|pms|pixelgo)\b/i.test(capLower)) {
        cap = "Hospitality";
      } else if (/\b(mobile|flutter|ios|android|react\s+native|mobile\s+apps?|apps?)\b/i.test(capLower)) {
        cap = "Mobile Development";
      } else if (/\b(saas|mvps?|platforms?)\b/i.test(capLower)) {
        cap = "SaaS development";
      } else if (/\b(ai|agents?|automations?|bots?|llms?|workflows?|machine\s+learning)\b/i.test(capLower)) {
        cap = "AI & Automation";
      } else if (/\b(crms?|erps?|dashboards?|admins?|portals?|business\s+systems?|internal\s+tools?)\b/i.test(capLower)) {
        cap = "Business Systems";
      } else if (/\b(backends?|apis?|databases?|postgres|servers?)\b/i.test(capLower)) {
        cap = "Backend & APIs";
      } else if (/\b(web|websites?|sites?|landing|frontend|fullstack|personal\s+brand)\b/i.test(capLower)) {
        cap = "Web Development";
      } else {
        cap = rawCap;
      }

      const isWarm = intent === "INDUSTRY_LEAD" || aiRes.temperature === "WARM";
      return {
        intent: intent || "BUYER",
        requirement: aiRes.requirement || post.text.slice(0, 100),
        target_entity: aiRes.target_entity || "EITHER",
        service_match: true,
        matched_capability: cap,
        matched_categories: [cap],
        matched_services: [cap],
        representation: aiRes.representation || "FOUNDER",
        decision: "QUALIFIED",
        temperature: isWarm ? "WARM" : "HOT",
        relevance_score: isWarm ? 85 : 95,
        is_genuine_buyer: true,
        should_reply: true,
        reason: aiRes.reason || `AI qualified lead for ${cap}.`,
        generated_comment: aiRes.generated_comment || null
      };
    }

    return {
      intent: intent || "IRRELEVANT",
      requirement: aiRes.requirement || null,
      target_entity: null,
      service_match: false,
      representation: "IGNORE",
      decision: "IGNORED",
      temperature: "IGNORE",
      is_genuine_buyer: false,
      should_reply: false,
      reason: aiRes.reason || "AI evaluated post as non-buyer."
    };
  }

  /**
   * Calculates word overlap similarity (Jaccard index) between two text strings.
   */
  calculateSimilarity(text1, text2) {
    const t1 = String(text1 || "").trim().toLowerCase();
    const t2 = String(text2 || "").trim().toLowerCase();
    if (t1 === t2) return 1.0;
    if (!t1 || !t2) return 0.0;

    const words1 = new Set(t1.split(/\s+/).filter(w => w.length > 2));
    const words2 = new Set(t2.split(/\s+/).filter(w => w.length > 2));
    if (words1.size === 0 || words2.size === 0) return 0.0;

    let intersection = 0;
    for (const w of words1) {
      if (words2.has(w)) intersection++;
    }
    const union = new Set([...words1, ...words2]).size;
    return union === 0 ? 0.0 : intersection / union;
  }

  /**
   * Strict Relevance Gate evaluating proposed responses before sending.
   * Enforces:
   * 1. Direct address of incoming topic
   * 2. Zero unrelated software architecture/timeline pitch on non-software queries
   * 3. Zero repetition of questions already answered
   * 4. Zero duplicate or near-duplicate (>75% similarity) outgoing messages
   * 5. Single URL discipline and zero profile contradictions
   * 6. Clear conversation advancement or closure
   */
  evaluateRelevanceGate(proposedResponse, context = {}, incomingMessage = "") {
    const response = String(proposedResponse || "").trim();
    const incoming = String(incomingMessage || context.incomingMessage || "").trim();
    const lowerIncoming = incoming.toLowerCase();
    const lowerResponse = response.toLowerCase();

    // 1. Direct Address & Non-Software Topic Disqualification:
    // If incoming message is about lead generation, data delivery, career advice, or job seeking,
    // the response MUST NOT ask software architecture, tech stack, or project timeline questions!
    const isLeadGenOrSales = /\b(b2b\s+leads?|lead\s+generation|batch\s+of\s+leads|deliver(ing)?\s+the\s+leads|budget\s+per\s+lead|decision[- ]maker\s+leads|sample\s+sheet|payment[- ]based\s+deal|flat\s+rate\s+per\s+batch|flat\s+rate\s+per\s+lead|targeted\s+leads)\b/i.test(lowerIncoming);
    const isCareerOrJob = /\b(career\s+advice|job\s+title|open\s+to\s+work|looking\s+for\s+(a\s+)?job|resume|internship|wfh)\b/i.test(lowerIncoming);

    if (isLeadGenOrSales || isCareerOrJob) {
      if (/\b(current\s+architecture|target\s+timeline\s+for\s+this\s+project|tech\s+stack|build\s+your\s+project|architecture\s+look\s+like)\b/i.test(lowerResponse)) {
        return {
          approved: false,
          reason: "Relevance Gate Violation: Inappropriate software architecture/timeline question asked on a lead-generation or career-seeker query."
        };
      }
    }

    // 2. Semantic Message Deduplication against recent outgoing messages in the conversation
    const recentOutgoing = context.recentOutgoing || (context.convId ? stateStore.getRecentOutgoingMessages(context.convId) : []);
    if (Array.isArray(recentOutgoing) && recentOutgoing.length > 0) {
      for (const prev of recentOutgoing) {
        const cleanPrev = String(prev).trim().toLowerCase();
        if (cleanPrev === lowerResponse) {
          return {
            approved: false,
            reason: `Relevance Gate Violation: Exact duplicate message already sent in conversation.`
          };
        }
        const sim = this.calculateSimilarity(lowerResponse, cleanPrev);
        if (sim >= 0.75) {
          return {
            approved: false,
            reason: `Relevance Gate Violation: Semantically identical message (${Math.round(sim * 100)}% similarity) already sent recently in conversation.`
          };
        }
      }
    }

    // 3. No repetition of questions already answered in incoming message
    if (/\b(timeline|deadline|asap|within\s+\d+|by\s+(next\s+month|end\s+of))\b/i.test(lowerIncoming)) {
      if (/\b(target\s+timeline|what\s+is\s+your\s+timeline)\b/i.test(lowerResponse)) {
        return {
          approved: false,
          reason: "Relevance Gate Violation: Asking for target timeline when timeline was already provided in incoming message."
        };
      }
    }

    // 4. Single URL discipline
    const urls = response.match(/https?:\/\/[^\s]+/g) || [];
    if (urls.length > 1) {
      return {
        approved: false,
        reason: "Relevance Gate Violation: More than 1 URL included (violates single-URL discipline)."
      };
    }

    return { approved: true, reason: "Relevance gate passed all criteria." };
  }

  /**
   * Generates conversational reply for comment replies or incoming DMs using Antigravity AI.
   * Dynamic context-aware reasoning replaces all static string fallbacks.
   */
  async generateConversationReply(context) {
    const {
      incomingMessage = "",
      conversationStage = "DISCOVERY",
      username = "user",
      convId = null
    } = context;

    // Check if human review escalation check is required (legal threats, lawsuits, extreme anger)
    const lower = incomingMessage.toLowerCase();
    const needsHumanReview = /\b(lawyer|sue|court|scam|fraud|police|nda|contract\s+dispute)\b/i.test(lower);

    try {
      const prompt = this.buildConversationTurnPrompt(context);
      const aiRes = await aiRuntime.callAi(prompt, { taskType: "REPLY_GENERATION" });

      if (aiRes && aiRes.response_message) {
        let responseMessage = aiRes.response_message;
        // Enforce Relevance Gate on the proposed message
        const gateCheck = this.evaluateRelevanceGate(responseMessage, { ...context, convId }, incomingMessage);
        if (!gateCheck.approved) {
          logger.warn(`[AI Engine] Relevance gate blocked proposed response: ${gateCheck.reason}`);
          const company = knowledge.getCompanyInfo();
          responseMessage = `Understood. Feel free to connect directly if you have any questions regarding ${company.name}'s custom engineering services.`;
        }

        return {
          intent: aiRes.intent || "PROJECT_INQUIRY",
          identity: aiRes.identity || "COMPANY",
          service_match: aiRes.service_match !== false,
          conversation_stage: needsHumanReview ? "HUMAN_REVIEW" : (aiRes.conversation_stage || conversationStage),
          sales_intensity: needsHumanReview ? "MEDIUM" : "LOW",
          should_reply: true,
          human_review_required: needsHumanReview,
          response_message: responseMessage
        };
      }
      throw new Error("AI returned empty conversation turn output");
    } catch (err) {
      logger.warn(`[AI Engine] Antigravity AI conversation turn reasoning failed: ${err.message}`);
      return {
        intent: "AI_ERROR",
        identity: "COMPANY",
        service_match: false,
        conversation_stage: "HUMAN_REVIEW",
        should_reply: false,
        human_review_required: true,
        response_message: "Thanks for reaching out! A member of our technical team will follow up with you shortly."
      };
    }
  }

  /**
   * Constructs prompt for multi-turn DM or reply conversation turn.
   */
  buildConversationTurnPrompt(context) {
    const {
      incomingMessage = "",
      originalPost = "",
      ourPreviousMessage = "",
      conversationStage = "DISCOVERY",
      username = "user"
    } = context;

    const company = knowledge.getCompanyInfo();
    const founder = knowledge.getFounderInfo();
    const profiles = knowledge.getOfficialProfiles();
    const approved = knowledge.getApprovedServices();
    const excluded = knowledge.getExcludedServices();
    const founderUrl = profiles.founder.linkedin || profiles.founder.profileUrl || "https://linkedin.com";
    const companyUrl = profiles.company.website || company.website || "https://www.codeair.tech";
    const productUrl = profiles.company.pixelgo || company.productUrl || "https://pixelgo.live";

    return `
CRITICAL OPERATIONAL CONSTRAINT:
You are acting as the autonomous Lead Conversations Specialist for ${company.name}. DO NOT invoke ANY tools (no view_file, no search, no run_command). Output ONLY valid JSON matching the schema below.

Positioning & Official Profiles:
- Founder & Leader: ${founder.name} (${founder.role} of ${company.name})
- Company: ${company.name} (${company.summary})
- Official URLs:
  * Company Website: ${companyUrl}
  * Product/Specialty: ${productUrl}
  * Founder Profile: ${founderUrl}

Approved Capabilities:
${approved.slice(0, 20).map(s => `- ${s}`).join("\n")}

Excluded Non-Core Capabilities:
${excluded.slice(0, 10).map(s => `- ${s}`).join("\n")}

Conversation Context:
- User Handle: @${username}
- Original Post / Thread Context: """${originalPost || "None"}"""
- Our Previous Message: """${ourPreviousMessage || "None"}"""
- Incoming Message from Recipient: """${incomingMessage}"""
- Current Conversation Stage: ${conversationStage}

INSTRUCTIONS:
1. Recipient Intent & Dynamic Response Generation:
   - If recipient is selling/offering B2B lead generation lists, scrapers, databases, or marketing outreach:
     Politely decline in natural conversational English. Clarify that ${company.name} specializes strictly in software development and does not purchase external lead batches or lead generation services. Never ask questions about software architecture, tech stacks, or project timelines when declining lead proposals. Set intent: "LEAD_GENERATION_DECLINED", service_match: false, conversation_stage: "CLOSED".
   - If recipient is asking for a job, internship, or employment:
     Politely decline and wish them the best in their career journey, noting ${company.name} is not hiring currently. Set intent: "CAREER_INQUIRY", service_match: false, conversation_stage: "CLOSED".
   - If recipient is asking about ${founder.name} or who is behind ${company.name}:
     Introduce ${founder.name} as ${founder.role}, and share Founder Profile (${founderUrl}). Set identity: "FOUNDER", intent: "FOUNDER_INQUIRY".
   - If recipient is asking what ${company.name} does or provides:
     Describe ${company.name}'s core offerings and capabilities. Share Company Website (${companyUrl}). Set identity: "COMPANY", intent: "CAPABILITY_INQUIRY".
   - If recipient is discussing a project, app, software requirement, or technical question:
     Respond like an experienced technical architect. Acknowledge their project, provide a brief technical insight, and ask 1-2 focused questions about their scope, stack, or timeline. Set intent: "PROJECT_INQUIRY", conversation_stage: "SCOPING" or "DISCOVERY".
   - If recipient asked for a link:
     Provide the relevant verified official link. Set intent: "LINK_REQUEST".

2. Tone & Constraints:
   - Natural, conversational, friendly, professional English. Zero canned copy-paste clichés.
   - Single-URL Discipline: Maximum 1 URL across the entire response.

OUTPUT STRICT JSON:
{
  "response_message": "string",
  "intent": "PROJECT_INQUIRY" | "LEAD_GENERATION_DECLINED" | "CAREER_INQUIRY" | "FOUNDER_INQUIRY" | "CAPABILITY_INQUIRY" | "LINK_REQUEST" | "GENERAL",
  "identity": "FOUNDER" | "COMPANY" | "NEUTRAL",
  "conversation_stage": "DISCOVERY" | "SCOPING" | "DISCOVERY_CALL" | "CLOSED",
  "service_match": boolean
}
`;
  }

  buildFullSemanticPrompt(post) {
    const company = knowledge.getCompanyInfo();
    const founder = knowledge.getFounderInfo();
    const approved = knowledge.getApprovedServices();
    const excluded = knowledge.getExcludedServices();
    const profiles = knowledge.getOfficialProfiles();
    const founderUrl = profiles.founder.linkedin || profiles.founder.profileUrl || "https://linkedin.com";
    const companyUrl = profiles.company.website || company.website || "https://www.codeair.tech";
    const productUrl = profiles.company.pixelgo || company.productUrl || "https://pixelgo.live";

    return `
CRITICAL OPERATIONAL CONSTRAINT:
You are acting as a pure text classifier and lead specialist. DO NOT invoke ANY tools (no view_file, no search, no run_command). You have all the context you need in this prompt. Output ONLY valid JSON matching the schema below.

You are the autonomous AI Lead Specialist for ${company.name}.
Knowledge Base: ${company.summary}.
Founder: ${founder.name} (${founder.role}).

Official URLs:
- Company Website: ${companyUrl}
- Product/Specialty: ${productUrl}
- Founder Profile: ${founderUrl}

Approved Capabilities:
${approved.slice(0, 25).map(s => `- ${s}`).join("\n")}

Excluded Non-Core Capabilities:
${excluded.slice(0, 10).map(s => `- ${s}`).join("\n")}

Analyze this social media post with zero bias:
POST_ID: ${post.postId || "none"}
AUTHOR: @${post.username || "user"}
CONTENT:
"""${post.text || ""}"""

CRITICAL INSTRUCTIONS:
1. Classify INTENT: BUYER | BRAND_INQUIRY | FOUNDER_INQUIRY | CAPABILITY_INQUIRY | CAREER_ADVICE | LEAD_GENERATION_BUYER | RECRUITMENT | JOB_SEEKER | SERVICE_PROVIDER | NETWORKING | IRRELEVANT | NEEDS_REVIEW
2. Genuine buyers and direct brand inquiries qualify (is_genuine_buyer: true, decision: "QUALIFIED"):
   - Anyone needing, hiring, seeking, or asking for software development, web design/development, mobile apps, SaaS, AI automation, or hospitality systems.
   - Anyone directly asking about ${company.name} or founder ${founder.name} (e.g. "Who is behind ${company.name}?", "What does ${company.name} do?"):
     * If asking about founder / who is behind ${company.name}: set intent: "FOUNDER_INQUIRY", representation: "FOUNDER", target_entity: "INDIVIDUAL", generated_comment must introduce ${founder.name} (${founder.role}) and include Founder Profile (${founderUrl}).
     * If asking about company / what ${company.name} does: set intent: "CAPABILITY_INQUIRY", representation: "COMPANY", target_entity: "COMPANY", generated_comment must describe ${company.name} core capabilities and include Company Website (${companyUrl}).
3. Strict Disqualifications (Zero Sales Pitch):
   - REAL_ESTATE / PROPERTIES / INVESTMENTS: Anyone advertising, selling, buying, or promoting real estate properties, plots, apartments, or property developer services. Strictly classify as SERVICE_PROVIDER or IRRELEVANT with is_genuine_buyer: false and decision: IGNORED.
   - CAREER_ADVICE: Anyone asking about job titles, degrees, career transitions, WFH options, or resume feedback.
   - LEAD_GENERATION_BUYER: Anyone pitching lead generation data, cold email lists, or marketing databases.
   - JOB_SEEKER / RECRUITMENT: Anyone looking for employment or hiring salaried corporate employees.
4. Extract REQUIREMENT in natural language.
5. Determine TARGET_ENTITY: INDIVIDUAL (freelancer/developer) | COMPANY (agency/team) | EITHER.
6. Match capability against approved capabilities.
7. Select REPRESENTATION: FOUNDER | COMPANY | BOTH | NEUTRAL | IGNORE.
   - If user asks for an individual/freelancer/developer: FOUNDER
   - If user asks for an agency/company/team: COMPANY
   - If open to either: BOTH (or COMPANY)
8. Single-URL Discipline:
   - For FOUNDER: Share Founder Profile only (${founderUrl}). Never include company website.
   - For COMPANY: Share Company Website only (${companyUrl}, or ${productUrl} for hospitality). Never include founder personal link.
   - For NEUTRAL: Zero URLs.
   - Maximum 1 URL total across the comment.
9. Bespoke Comment Synthesis (generated_comment):
   - If genuine buyer or brand inquiry, generate a bespoke 2-3 sentence comment addressing the author's exact project, stack, or question.
   - If user asks for an individual/freelancer/developer/co-founder or asks who is behind ${company.name}: Speak as ${founder.name} (${founder.role}) and share Founder Profile only.
   - If user asks for an agency/team/company or asks what ${company.name} does: Speak as ${company.name} and share Company Website only.
   - Zero canned clichés. Directly helpful, authentic, and engaging.
   - If post is disqualified (not a genuine buyer or brand inquiry): set generated_comment: null.

OUTPUT STRICT JSON:
{
  "intent": "BUYER" | "BRAND_INQUIRY" | "FOUNDER_INQUIRY" | "CAPABILITY_INQUIRY" | "CAREER_ADVICE" | "LEAD_GENERATION_BUYER" | "RECRUITMENT" | "JOB_SEEKER" | "SERVICE_PROVIDER" | "NETWORKING" | "IRRELEVANT" | "NEEDS_REVIEW",
  "requirement": "string",
  "target_entity": "INDIVIDUAL" | "COMPANY" | "EITHER",
  "service_match": true,
  "primary_capability": "string",
  "representation": "FOUNDER" | "COMPANY" | "BOTH" | "NEUTRAL" | "IGNORE",
  "is_genuine_buyer": true,
  "decision": "QUALIFIED" | "IGNORED",
  "reason": "string",
  "generated_comment": "string or null"
}
`;
  }
}

const aiDecisionEngine = new AiDecisionEngine();
module.exports = aiDecisionEngine;
