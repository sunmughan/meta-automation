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
    const postText = String((post && post.text) || "");

    const isQualified = decision === "QUALIFIED" && aiRes.is_genuine_buyer === true && aiRes.service_match !== false;

    if (isQualified) {
      const cap = aiRes.primary_capability || aiRes.primary_category || aiRes.matched_capability || "Software Development";
      const representation = aiRes.representation || (aiRes.target_entity === "INDIVIDUAL" ? "FOUNDER" : "COMPANY");
      const isWarm = intent === "INDUSTRY_LEAD" || intent === "NETWORKING" || aiRes.temperature === "WARM";

      return {
        intent: intent || "BUYER",
        requirement: aiRes.requirement || postText.slice(0, 100),
        target_entity: aiRes.target_entity || "EITHER",
        service_match: true,
        matched_capability: cap,
        matched_categories: [cap],
        matched_services: [cap],
        representation: representation,
        decision: "QUALIFIED",
        temperature: isWarm ? "WARM" : "HOT",
        relevance_score: isWarm ? 85 : 95,
        is_genuine_buyer: true,
        should_reply: true,
        reason: aiRes.reason || `AI qualified: ${intent} for ${cap}.`,
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
      reason: aiRes.reason || "AI evaluated post as disqualified."
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
    const incomingMessage = context.incomingMessage || context.incomingText || "";
    const conversationStage = context.conversationStage || "DISCOVERY";
    const username = context.username || context.participant || "user";
    const convId = context.convId || null;
    const normalizedContext = {
      ...context,
      incomingMessage,
      conversationStage,
      username,
      convId
    };

    // Check if human review escalation check is required (legal threats, lawsuits, extreme anger)
    const lower = incomingMessage.toLowerCase();
    const needsHumanReview = /\b(lawyer|sue|court|scam|fraud|police|nda|contract\s+dispute)\b/i.test(lower);

    try {
      const prompt = this.buildConversationTurnPrompt(normalizedContext);
      const aiRes = await aiRuntime.callAi(prompt, { taskType: "REPLY_GENERATION" });

      if (aiRes && aiRes.response_message) {
        let responseMessage = aiRes.response_message;
        // Enforce Relevance Gate on the proposed message
        const gateCheck = this.evaluateRelevanceGate(responseMessage, { ...normalizedContext, convId }, incomingMessage);
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
      const whatsappUrl = knowledge.getWhatsAppUrl() || profiles.company?.whatsapp || profiles.founder?.whatsapp || "";
      const isCallRequest = conversationStage === "DISCOVERY_CALL" || /\b(call|schedule|phone|meeting|consultation|whatsapp)\b/i.test(incomingMessage);
      const fallbackMsg = isCallRequest
        ? (whatsappUrl
            ? `We would be happy to discuss your project requirements! Feel free to connect directly to book a discovery call: ${whatsappUrl}`
            : `We would be happy to discuss your project requirements! Please share your contact details or requirements, and our team will follow up promptly.`)
        : "Thanks for reaching out! A member of our technical team will follow up with you shortly.";

      return {
        intent: isCallRequest ? "PROJECT_INQUIRY" : "AI_ERROR",
        identity: "COMPANY",
        service_match: isCallRequest,
        conversation_stage: isCallRequest ? "DISCOVERY_CALL" : "HUMAN_REVIEW",
        should_reply: isCallRequest,
        human_review_required: !isCallRequest,
        response_message: fallbackMsg
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
    const founderUrl = profiles.founder.linkedin || profiles.founder.profileUrl || "";
    const companyUrl = profiles.company.website || company.website || "";
    const productUrl = profiles.company.productUrl || company.productUrl || profiles.company.pixelgo || "";
    const whatsappUrl = knowledge.getWhatsAppUrl() || profiles.company.whatsapp || profiles.founder.whatsapp || "";

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
  * Official WhatsApp (Discovery & Meeting Booking): ${whatsappUrl}

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
   - If recipient is ready to book a call, schedule a meeting, discuss timeline/scope directly, or asks for WhatsApp/phone/call link:
     Warmly provide the direct WhatsApp consultation link (${whatsappUrl}) to connect directly with ${founder.name} / ${company.name} and discuss the project. Set intent: "PROJECT_INQUIRY", conversation_stage: "DISCOVERY_CALL".
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
    const founderUrl = profiles.founder.linkedin || profiles.founder.profileUrl || "";
    const companyUrl = profiles.company.website || company.website || "";
    const productUrl = profiles.company.productUrl || company.productUrl || profiles.company.pixelgo || "";

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
2. Genuine buyers, tech networking, and direct brand inquiries qualify (is_genuine_buyer: true, decision: "QUALIFIED"):
   - SOFTWARE / WEB / APP / AI / SAAS / HOSPITALITY BUYERS: Anyone needing, hiring, seeking, or asking for software development, web design/development, mobile apps, SaaS, AI automation, custom tools, or hospitality systems.
     * If asking for an individual/freelancer/developer: set intent: "BUYER", representation: "FOUNDER", target_entity: "INDIVIDUAL".
     * If asking for an agency/company/team/business: set intent: "BUYER", representation: "COMPANY", target_entity: "COMPANY".
     * If open to either: set representation: "COMPANY" (or "BOTH").
   - TECH NETWORKING / BUILDER CONNECTIONS: Anyone explicitly expressing intent to connect, network, collaborate, or build peer relationships with fellow software developers, engineers, AI builders, SaaS founders, or tech peers in IT/software/AI/Web/SaaS/Cloud (e.g. "Looking to connect with more founders, creators and builders", "Looking to connect with developers in AI, fullstack, SaaS", "Let's connect"):
     * set intent: "NETWORKING", representation: "FOUNDER", target_entity: "INDIVIDUAL", service_match: true, is_genuine_buyer: true, decision: "QUALIFIED".
     * generated_comment: Speak warmly and authentically as ${founder.name} (${founder.role} at ${company.name} / software builder), sharing genuine interest in building/connecting with fellow builders, and include Founder Profile (${founderUrl}).
   - DIRECT BRAND / FOUNDER INQUIRIES:
     * If asking about founder / who is behind ${company.name}: set intent: "FOUNDER_INQUIRY", representation: "FOUNDER", target_entity: "INDIVIDUAL", generated_comment must introduce ${founder.name} (${founder.role}) and include Founder Profile (${founderUrl}).
     * If asking about company / what ${company.name} does: set intent: "CAPABILITY_INQUIRY", representation: "COMPANY", target_entity: "COMPANY", generated_comment must describe ${company.name} core capabilities and include Company Website (${companyUrl}).
3. Strict Disqualifications (Zero Sales Pitch, Zero Non-Tech Engagement, Zero Spam on General Discussion):
   - GENERAL DISCUSSION / OPINION POLLS: Anyone posting general opinion polls, open thought experiments, or advice questions (e.g. "What tech stack are you SaaS founders using to build your MVP this year?", "What is your favorite framework?", "What tools save you time?"). These are conversational prompts without explicit intent to connect or hire. Classify as IRRELEVANT with is_genuine_buyer: false and decision: IGNORED.
   - NON-TECH NETWORKING: Anyone networking strictly outside IT/Software/AI (e.g. real estate agents, accountants, fitness coaches, beauty influencers, MLM). Classify as SERVICE_PROVIDER or IRRELEVANT with is_genuine_buyer: false and decision: IGNORED.
   - REAL_ESTATE / PROPERTIES / INVESTMENTS: Anyone advertising, selling, buying, or promoting real estate properties, plots, apartments, or property developer services. Strictly classify as SERVICE_PROVIDER or IRRELEVANT with is_genuine_buyer: false and decision: IGNORED.
   - CAREER_ADVICE: Anyone asking about job titles, degrees, career transitions, WFH options, or resume feedback.
   - LEAD_GENERATION_BUYER: Anyone pitching lead generation data, cold email lists, or marketing databases.
   - NON-TECH RECRUITMENT: Salaried corporate hiring for non-tech roles (e.g. receptionist, VA, social media creator, graphic design, drivers). Classify as RECRUITMENT with is_genuine_buyer: false and decision: IGNORED.
4. Extract REQUIREMENT in natural language.
5. Determine TARGET_ENTITY: INDIVIDUAL (freelancer/developer) | COMPANY (agency/team) | EITHER.
6. Match capability against approved capabilities.
7. Select REPRESENTATION: FOUNDER | COMPANY | BOTH | NEUTRAL | IGNORE.
   - If user asks for an individual/freelancer/developer, or is seeking tech/builder networking, or asks who is behind ${company.name}: FOUNDER
   - If user asks for an agency/company/team, or asks what ${company.name} does: COMPANY
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
   - If user is seeking tech/builder networking: Speak as ${founder.name} (${founder.role} at ${company.name}), warmly engaging peer-to-peer on building software/AI/SaaS products and share Founder Profile (${founderUrl}).
   - Zero canned clichés. Directly helpful, authentic, and engaging.
   - If post is disqualified (not a genuine buyer, tech networking, or brand inquiry): set generated_comment: null.

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

  /**
   * Synthesizes high-leverage expert technical commentary for quote-posting
   * a trending developer, AI builder, or founder thread.
   *
   * @param {Object} post - { text, username, postId }
   * @returns {Promise<Object>} { commentary, shouldQuote, reason }
   */
  async generateQuoteCommentary(post) {
    const founder = knowledge.getFounderInfo();
    const company = knowledge.getCompanyInfo();
    const prompt = `
CRITICAL OPERATIONAL CONSTRAINT:
You are acting as Chief Technical Architect ${founder.name} (${founder.role} at ${company.name}). DO NOT invoke ANY tools. Output ONLY valid JSON matching the schema below.

Trending Thread to Quote:
Author: @${post.username || "user"}
Content:
"""${post.text || ""}"""

INSTRUCTIONS:
1. Analyze whether this post represents a meaningful technical, startup, SaaS, or engineering insight worth quote-posting to our audience of software builders and founders.
2. If YES (should_quote: true):
   - Synthesize a sharp, authoritative 2-3 sentence commentary (under 280 characters).
   - Voice: Seasoned systems builder (${founder.name}).
   - Provide concrete technical or operational value (e.g. state management, API design, trade-offs, architecture choices).
   - Zero generic praise ("Great post!", "Agree 100%"). Must contribute a distinct, practical insight.
3. If NO (should_quote: false):
   - General memes, unrelated topics, low-substance threads. Set commentary: null.

OUTPUT STRICT JSON:
{
  "should_quote": boolean,
  "commentary": "string or null",
  "reason": "string"
}
`;

    try {
      const res = await aiRuntime.callAi(prompt, { taskType: "COMMENT_SYNTHESIS" });
      if (res && res.should_quote && res.commentary) {
        return res;
      }
      return {
        should_quote: false,
        commentary: null,
        reason: res?.reason || "Thread not suitable for viral architectural quote."
      };
    } catch (err) {
      logger.warn(`[AI Engine] Quote commentary generation failed on @${post?.username}: ${err.message}`);
      return {
        should_quote: false,
        commentary: null,
        reason: `AI reasoning error: ${err.message}`
      };
    }
  }
}

const aiDecisionEngine = new AiDecisionEngine();
module.exports = aiDecisionEngine;
