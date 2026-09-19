/**
 * src/ai/ai-decision-engine.js
 * Central AI Decision Engine for CodeAir Threads + Instagram System.
 *
 * Integrates:
 * - Agentic AI on-screen post screening (screens real hiring & buyer intent)
 * - Deterministic intent classification (intent-classifier.js)
 * - Approved service matching (service-matcher.js)
 * - Identity decision layer (identity-resolver.js)
 * - Detailed engaging comment generation (comment-generator.js)
 * - Dynamic knowledge base prompts (knowledge-engine.js)
 * - AI Runtime execution with graceful fallbacks
 */

const knowledge = require("../knowledge/knowledge-engine");
const intentClassifier = require("../leads/intent-classifier");
const serviceMatcher = require("../leads/service-matcher");
const identityResolver = require("../conversations/identity-resolver");
const commentGenerator = require("../engagement/comment-generator");
const aiRuntime = require("./ai-runtime");
const logger = require("../logging/logger");

class AiDecisionEngine {
  /**
   * Evaluates a post and generates an AI Decision Object.
   * Leverages Agentic AI screening to evaluate real buyer/hiring intent on-screen.
   *
   * @param {Object} post - { text, username, url, postId }
   * @param {Object} [options]
   * @returns {Promise<Object>} AI Decision Object
   */
  async qualifyPost(post, options = {}) {
    // 1. Fast pre-check
    const preCheck = intentClassifier.classify(post);

    // 2. If preCheck qualified, double check with AI screening to ensure author is not a disguised seller
    if (preCheck.qualified) {
      // Resolve Identity: WHO SHOULD SPEAK?
      const identityResult = identityResolver.resolveIdentity({
        message: post.text,
        originalPost: post.text,
        conversationStage: "INITIAL",
        intent: preCheck.intent
      });

      // Generate detailed, engaging comment
      const detailedComment = commentGenerator.generateEngagingComment({
        text: post.text,
        username: post.username,
        matchedCategories: preCheck.matchedCategories || [],
        identity: identityResult.identity
      });

      // If AI runtime call requested, optionally enrich with Gemini
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
          logger.warn(`AI enrichment call skipped (${err.message}). Using knowledge-grounded synthesis.`);
        }
      }

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

    // 3. If preCheck was not qualified (e.g. GENERAL_TECH, AMBIGUOUS, NO_SERVICE_MATCH, or borderline text),
    // execute Agentic AI post screening so we never miss genuine hiring/building requests
    const aiScreening = await this.screenPostWithAgenticAi(post, options);

    if (aiScreening.is_genuine_buyer && aiScreening.is_hiring_or_requesting) {
      const matchedCategories = aiScreening.matched_categories || [aiScreening.primary_category || "Web Development"];
      const primaryService = aiScreening.primary_service || matchedCategories[0] || "Custom Software";

      const identityResult = identityResolver.resolveIdentity({
        message: post.text,
        originalPost: post.text,
        conversationStage: "INITIAL",
        intent: "BUYER"
      });

      const detailedComment = commentGenerator.generateEngagingComment({
        text: post.text,
        username: post.username,
        matchedCategories: matchedCategories,
        identity: identityResult.identity
      });

      logger.info(`[AI Agentic Screening] Successfully qualified buyer post from @${post.username}: ${aiScreening.reason}`);

      return {
        intent: "BUYER",
        service_match: true,
        service: primaryService,
        identity: identityResult.identity,
        company_mentioned_before: false,
        founder_mentioned_before: false,
        conversation_stage: "INITIAL",
        sales_intensity: "LOW",
        should_reply: true,
        is_genuine_buyer: true,
        relevance_score: 95,
        temperature: aiScreening.temperature || "HOT",
        lead_type: "PROJECT_BUYER",
        matched_services: [primaryService],
        matched_categories: matchedCategories,
        reason: `[AI Screened] ${aiScreening.reason}`,
        identity_reason: identityResult.reason,
        generated_comment: detailedComment
      };
    }

    // Disqualified post
    return {
      intent: preCheck.intent || "IRRELEVANT",
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
      lead_type: preCheck.lead_type || "IRRELEVANT",
      matched_services: [],
      reason: aiScreening.reason || preCheck.reason,
      generated_comment: null
    };
  }

  /**
   * Screen post using Agentic AI reasoning with semantic fallback.
   * Determines if the author is genuinely requesting or hiring someone to build software/websites/apps.
   *
   * @param {Object} post - { text, username, url }
   * @param {Object} [options]
   * @returns {Promise<Object>} Screening decision
   */
  async screenPostWithAgenticAi(post, options = {}) {
    const text = String(post?.text || "").trim();
    if (!text || text.length < 15) {
      return { is_genuine_buyer: false, is_hiring_or_requesting: false, reason: "Text too short." };
    }

    // 1. If options.useAiCall is enabled or AI Runtime is accessible, try LLM screening
    if (options.useAiCall) {
      try {
        const prompt = `
You are the AI Lead Screening Specialist for CodeAir Software Solutions (custom software, websites, mobile apps, SaaS, AI automations, hospitality systems).
Evaluate the following social media post from Threads/Instagram:

POST AUTHOR: @${post.username || "user"}
POST CONTENT:
"""${text}"""

TASK:
Determine whether the author is actively requesting, seeking, or hiring someone (developer, designer, agency, engineer) to build or design software, web applications, websites, mobile apps, AI automations, or hospitality systems.

CRITICAL DISTINCTIONS:
- TRUE BUYER / HIRING: Author is looking to pay/hire/collaborate with someone to build a product or project for them.
- FALSE (SERVICE PROVIDER): Author is advertising, promoting, showing off, or selling their OWN services/skills.
- FALSE (JOB SEEKER): Author is looking for a job or work for themselves.
- FALSE (RECRUITER): Corporate HR posting salaried employee jobs with resume/CV/careers link.
- FALSE (CHATTER): Lifestyle, memes, non-actionable opinions.

OUTPUT FORMAT: Return strict JSON:
{
  "is_hiring_or_requesting": true/false,
  "is_genuine_buyer": true/false,
  "intent": "PROJECT_BUYER" | "SERVICE_PROVIDER" | "JOB_SEEKER" | "CORPORATE_RECRUITMENT" | "GENERAL_CHATTER",
  "primary_category": "Web Development" | "Mobile Development" | "AI & Automation" | "Hospitality" | "SaaS development" | "Business Systems" | "Backend & APIs" | null,
  "temperature": "HOT" | "WARM" | "IGNORE",
  "reason": "Brief reason for qualification or disqualification"
}
`;
        const aiRes = await aiRuntime.callAi(prompt);
        if (aiRes && typeof aiRes.is_genuine_buyer === "boolean") {
          return aiRes;
        }
      } catch (err) {
        logger.warn(`AI model screening call failed (${err.message}). Using semantic intent analysis.`);
      }
    }

    // 2. High-precision semantic intent analysis
    return this.screenPostSemantically(post);
  }

  /**
   * High-precision semantic intent analyzer.
   * Distinguishes buyer hiring requests vs service sellers vs job seekers.
   */
  screenPostSemantically(post) {
    const text = String(post?.text || "").toLowerCase();

    // Check service provider markers (Sellers advertising own work)
    const isSeller =
      /\b(i('?m|\s+am)\s+a\s+(freelance\s+)?(developer|designer|engineer)|my\s+portfolio|check\s+(out\s+)?my\s+work|my\s+latest\s+(build|project|design|website)|built\s+this\s+(website|app|for\s+a\s+client)|taking\s+on\s+new\s+clients|accepting\s+clients|dm\s+(me\s+)?for\s+(rates|pricing|inquiries|quotes?)|starting\s+at\s+[\$₹€£]\d+)\b/i.test(text);

    if (isSeller) {
      return {
        is_genuine_buyer: false,
        is_hiring_or_requesting: false,
        intent: "SERVICE_PROVIDER",
        reason: "Author is showcasing or advertising their own services."
      };
    }

    // Check job seeker markers
    const isJobSeeker =
      /\b(hire\s+me|open\s+to\s+work|looking\s+for\s+(a\s+)?job|seeking\s+(employment|roles?)|available\s+for\s+hire)\b/i.test(text);

    if (isJobSeeker) {
      return {
        is_genuine_buyer: false,
        is_hiring_or_requesting: false,
        intent: "JOB_SEEKER",
        reason: "Author is a job seeker looking for employment."
      };
    }

    // Check corporate HR markers
    const isCorporateHr =
      /\b((submit|send)\s+(your\s+)?(cv|resume)|apply\s+(at|via|to)\s+(our\s+)?(careers?|portal)|annual\s+salary|base\s+salary\s+of|benefits\s*\(401k)\b/i.test(text);

    if (isCorporateHr) {
      return {
        is_genuine_buyer: false,
        is_hiring_or_requesting: false,
        intent: "CORPORATE_RECRUITMENT",
        reason: "Corporate recruitment with formal application/resume requirement."
      };
    }

    // Check buyer hiring / project request signals
    const hasRequestIntent =
      /\b(hiring|looking\s+for|need|seeking|want\s+to\s+hire|can\s+(someone|anyone)|who\s+can|anyone\s+knows?|anyone\s+can|recommend\s+a|where\s+can\s+i\s+find|help\s+(me|us)?\s*(to\s+)?(build|create|develop|design|code)|in\s+search\s+of)\b/i.test(text);

    const hasTarget =
      /\b(developer|dev|designer|agency|team|someone|somebody|freelancer|engineer|expert|firm)\b/i.test(text) ||
      /\b(website|web\s+app|mobile\s+app|app|mvp|saas|platform|crm|erp|hotel|hospitality|restaurant|pms|software|ecommerce|online\s+store|automation)\b/i.test(text);

    const hasAction =
      /\b(build|develop|create|design|code|redesign|launch|make|integrate|automate|hiring|hire|portfolio|rates|quotes?|budget)\b/i.test(text);

    // Combination A: Genuine request to build, develop, hire, or create
    if (hasRequestIntent && hasTarget && hasAction) {
      // Determine primary category
      let category = "Web Development";
      if (/\b(hotel|resort|restaurant|hospitality|pms)\b/i.test(text)) {
        category = "Hospitality";
      } else if (/\b(mobile|flutter|ios|android|react\s+native)\b/i.test(text)) {
        category = "Mobile Development";
      } else if (/\b(ai|llm|chatbot|rag|agent|automation)\b/i.test(text)) {
        category = "AI & Automation";
      } else if (/\b(saas|multi[- ]?tenant|mvp)\b/i.test(text)) {
        category = "SaaS development";
      } else if (/\b(crm|erp|pos|dashboard|admin\s+portal)\b/i.test(text)) {
        category = "Business Systems";
      }

      return {
        is_genuine_buyer: true,
        is_hiring_or_requesting: true,
        intent: "PROJECT_BUYER",
        primary_category: category,
        matched_categories: [category],
        temperature: "HOT",
        reason: `Genuine client hiring/project request for ${category}.`
      };
    }

    return {
      is_genuine_buyer: false,
      is_hiring_or_requesting: false,
      intent: "GENERAL_CHATTER",
      reason: "No active buyer hiring or project request detected."
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

    // 2. Check if a verified link was requested (including PixelGo for hospitality)
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

COMPANY: CodeAir Software Solutions (Custom software, SaaS, AI automation, Mobile, Web, Hospitality, APIs).
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
5. Mentions company website (https://www.codeair.tech) EXACTLY ONCE. Never repeat URLs.

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
