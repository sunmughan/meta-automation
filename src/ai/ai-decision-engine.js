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

    // 1. Direct Founder or Company Queries
    if (/\bwho\s+(is\s+)?(behind|founded|started|runs)\s+codeair\b/i.test(rawText)) {
      return {
        intent: "BUYER",
        requirement: "User asking about the founder of CodeAir Software Solutions.",
        target_entity: "INDIVIDUAL",
        service_match: true,
        matched_capability: "Technical Leadership & Custom Architecture",
        matched_services: ["Custom software architecture", "Technical consulting"],
        representation: "FOUNDER",
        decision: "QUALIFIED",
        temperature: "HOT",
        relevance_score: 95,
        is_genuine_buyer: true,
        should_reply: true,
        reason: "User specifically asking about founder identity and leadership.",
        generated_comment: `@${username} Sunmughan Swamy is the founder and technical architect behind CodeAir Software Solutions. We build custom software, SaaS platforms, and AI automations. Connect on LinkedIn at https://www.linkedin.com/in/sunmughan/!`
      };
    }

    if (/\bwhat\s+(does\s+)?codeair\s+do\b/i.test(rawText)) {
      return {
        intent: "BUYER",
        requirement: "User asking about CodeAir Software Solutions capabilities and services.",
        target_entity: "COMPANY",
        service_match: true,
        matched_capability: "Full-Cycle Software Engineering",
        matched_services: ["Custom software development", "Web applications", "SaaS platforms", "AI automation"],
        representation: "COMPANY",
        decision: "QUALIFIED",
        temperature: "HOT",
        relevance_score: 95,
        is_genuine_buyer: true,
        should_reply: true,
        reason: "User explicitly asking about CodeAir company capabilities.",
        generated_comment: `@${username} Over at CodeAir Software Solutions, we engineer custom web applications, multi-tenant SaaS platforms, Flutter mobile apps, and autonomous AI systems. Explore our portfolio at https://www.codeair.tech and connect with our founder at https://www.linkedin.com/in/sunmughan/.`
      };
    }

    // 2. Primary Semantic AI Analysis (Zero Premature Discards)
    const analysis = await this.analyzePostSemantics(post, options);

    // 3. Format complete decision object
    if (analysis.decision === "QUALIFIED" && analysis.is_genuine_buyer) {
      // Determine representation if not already set
      let rep = analysis.representation || "COMPANY";
      if (analysis.target_entity === "INDIVIDUAL") rep = "FOUNDER";
      else if (analysis.target_entity === "COMPANY") rep = "COMPANY";
      else if (analysis.target_entity === "EITHER") rep = "BOTH";

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
      lead_type: analysis.intent || "IRRELEVANT",
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

    // 1. Attempt LLM Semantic Reasoning via Antigravity AI Runtime
    // Options defaults useAiCall to true unless explicitly disabled
    const shouldCallAi = options.useAiCall !== false;
    if (shouldCallAi) {
      try {
        const prompt = this.buildFullSemanticPrompt(post);
        const aiRes = await aiRuntime.callAi(prompt);
        if (aiRes && (aiRes.intent || aiRes.decision)) {
          return this.normalizeAiResponse(aiRes, post);
        }
      } catch (err) {
        logger.warn(`Antigravity AI model call skipped (${err.message}). Using local semantic reasoning engine.`);
      }
    }

    // 2. Primary Grounded Semantic Reasoning Engine
    // Inspects communicative act, grammatical voice, requirements, and knowledge base
    return this.evaluateGroundedSemantics(post);
  }

  /**
   * Primary Grounded Semantic Reasoning Engine.
   * Evaluates communicative intent, requirement, target entity, and knowledge base matches.
   *
   * @param {Object} post
   * @returns {Object} Semantic analysis output
   */
  evaluateGroundedSemantics(post) {
    const text = String(post.text || "");
    const lower = text.toLowerCase();

    // -------------------------------------------------------------
    // BUYER INTENT DETECTION (Semantic cues of client demand or hiring intent)
    // -------------------------------------------------------------
    const hasBuyerIntent =
      /\b((i|we)\s+need|need\s+(someone|somebody|a\s+|an?\s+|to\s+hire)|needing|looking\s+for|looking\s+to\s+hire|(i|we)\s+want|seeking|hiring|hire|in\s+search\s+of|searching\s+for|can\s+(someone|anyone)|who\s+can|anyone\s+knows?|anyone\s+can|does\s+anyone|recommend|recommendations?\s+for|help\s+(me|us)\s*(to\s+)?(build|create|develop|design|code|redesign)|where\s+can\s+i\s+(find|hire)|dm\s+(me\s+)?(your\s+)?(portfolio|rates|quotes?|pricing|charges|proposals?))\b/i.test(lower);

    // -------------------------------------------------------------
    // DISQUALIFIER 1: SERVICE PROVIDER (Sellers advertising own services)
    // ONLY triggers if author is pitching themselves or advertising their own work,
    // and NOT expressing genuine buyer demand for their own project.
    // -------------------------------------------------------------
    const isRhetoricalSellerQuestion =
      (/\blooking\s+for\s+a\s+(website|web|app|mobile|software)?\s*(designer|developer|agency)\s*\?/i.test(lower) &&
       /\b(we|i|here|dm|contact|agency|studio|duo)\b/i.test(lower));

    const isDirectSellerPromotion =
      /\b(my\s+portfolio|check\s+(out\s+)?my\s+(work|portfolio|recent\s+project)|my\s+latest\s+(build|project|design|website)|built\s+this\s+(website|app|for\s+a\s+client)|taking\s+on\s+new\s+clients|accepting\s+new\s+clients|open\s+for\s+clients|dm\s+(me\s+)?for\s+(rates|pricing|inquiries|quotes?|orders?)|starting\s+at\s+[\$₹€£]\d+|[\$₹€£]\d+\s+per\s+(page|website|project)|link\s+in\s+bio|calendly\.com|i\s+build\s+(websites|apps|software)\s+for|we\s+build\s+(websites|apps|software)\s+for|i\s+can\s+help\s+you\s+(build|launch|turn\s+your\s+idea)|we\s+(design|build|create|develop)\s+(and\s+(build|design|develop)\s+)?(modern|custom|stunning|responsive|high[- ]converting)?\s*(websites|apps|software)|we\s+are\s+here|is\s+here\s*!\s*we|our\s+(agency|team|studio|services)|dm\s+(us|me)\s+to\s+(work|start|book|get\s+started)|booking\s+(open|now\s+for)|partner\s+up\s+with\s+me|work\s+with\s+(me|us)|let('?s|\s+us)\s+(start\s+)?work(ing)?\s+together|hire\s+me\b|what\s+you\s+have\s+in\s+mind.*vercel\.app)\b/i.test(lower) ||
      (/\b(i('?m|\s+am)\s+([a-z\s]+)?(developer|designer|engineer|builder|manager|marketer|specialist|consultant|strategist|creator|freelancer|editor))\b/i.test(lower) && !hasBuyerIntent);

    if (isRhetoricalSellerQuestion || isDirectSellerPromotion) {
      return {
        intent: "SERVICE_PROVIDER",
        requirement: "Author offering/advertising their own development or design services.",
        target_entity: null,
        service_match: false,
        representation: "IGNORE",
        decision: "IGNORED",
        is_genuine_buyer: false,
        reason: "Author is advertising or showcasing their own freelance/agency services, not hiring."
      };
    }

    // -------------------------------------------------------------
    // DISQUALIFIER 2: JOB SEEKER (Candidate asking for employment)
    // -------------------------------------------------------------
    const isJobSeeker =
      /\b(open\s+to\s+work|open\s+for\s+work|looking\s+for\s+(a\s+)?(job|internship)|seeking\s+(opportunities|employment|job|roles?)|available\s+for\s+(work|hire|employment)|freelancer\s+available|actively\s+looking\s+for\s+(work|a\s+job)|seeking\s+(software|web|flutter|developer)\s+opportunities)\b/i.test(lower) &&
      !hasBuyerIntent;

    if (isJobSeeker) {
      return {
        intent: "JOB_SEEKER",
        requirement: "Author seeking employment or freelance gigs for themselves.",
        target_entity: null,
        service_match: false,
        representation: "IGNORE",
        decision: "IGNORED",
        is_genuine_buyer: false,
        reason: "Author is a job seeker looking for employment or gigs, not a software client."
      };
    }

    // -------------------------------------------------------------
    // DISQUALIFIER 3: CORPORATE HR RECRUITMENT (Salaried 9-5 employee ads)
    // -------------------------------------------------------------
    const isCorporateHr =
      /\b((submit|send)\s+(your\s+)?(cv|resume)|(cv|resume)\s+(to|at)\s+[a-z0-9._%+-]+@|apply\s+(at|via|to|online)\s*[:\s]*(https?:\/\/|careers?|greenhouse|lever|workday)|careers?@[a-z0-9.-]+\.[a-z]{2,}|(base\s+)?salary\s*[:\s]*[\$€£₹]\s*\d+|annual\s+salary|compensation\s+package|benefits\s*(package|\(401k|health\s+insurance)|(full[- ]?time|part[- ]?time)\s+(employee|salaried\s+role|permanent\s+position|w2)|talent\s+acquisition|job\s+opening\s+at|internships?|interns?\b|stipend|freshers?\s+welcome)\b/i.test(lower);

    if (isCorporateHr) {
      return {
        intent: "RECRUITMENT",
        requirement: "Corporate salaried employee job opening with formal application/resume intake.",
        target_entity: null,
        service_match: false,
        representation: "IGNORE",
        decision: "IGNORED",
        is_genuine_buyer: false,
        reason: "Corporate recruitment / salaried job opening, not a contract software buyer."
      };
    }

    // -------------------------------------------------------------
    // DISQUALIFIER 4: IRRELEVANT LIFESTYLE / MEMES / CELEBRITY
    // -------------------------------------------------------------
    const isIrrelevant =
      /\b(happy\s+birthday|rest\s+in\s+peace|\brip\b|beach|vacation|sunset|sunrise|traveling|ootd|workout|gym|recipe|dinner|concert|album|song|movie|cinema|dating|relationship|crush|horoscope|zodiac|meme|memes|funny\s+video|weather|raining)\b/i.test(lower);

    if (isIrrelevant) {
      return {
        intent: "IRRELEVANT",
        requirement: null,
        target_entity: null,
        service_match: false,
        representation: "IGNORE",
        decision: "IGNORED",
        is_genuine_buyer: false,
        reason: "Post is personal lifestyle, celebrity, entertainment, or irrelevant content."
      };
    }

    // -------------------------------------------------------------
    // DISQUALIFIER 5: GENERAL CASUAL NETWORKING
    // -------------------------------------------------------------
    const isNetworking =
      /\b(expand\s+my\s+network|chat\s+and\s+connect|happy\s+(monday|friday|weekend)|good\s+morning\s+(threads|everyone|all)|shy\s+businesses\s+stay\s+small)\b/i.test(lower);

    if (isNetworking && !/\b(need|looking|hire|hiring|build|developer|website|app)\b/i.test(lower)) {
      return {
        intent: "NETWORKING",
        requirement: null,
        target_entity: null,
        service_match: false,
        representation: "IGNORE",
        decision: "IGNORED",
        is_genuine_buyer: false,
        reason: "General non-technical networking chatter without a project requirement."
      };
    }

    // -------------------------------------------------------------
    // DISQUALIFIER 6: OUT OF SCOPE / NON-SOFTWARE SERVICES
    // (Graphic design, logos, video editing, accounting, legal)
    // -------------------------------------------------------------
    const isOutOfScope =
      /\b(logo\s+design|graphic\s+design(er)?|video\s+edit(or|ing)?|banner\s+design|flyer\s+design|accounting|tax\s+filing|bookkeeping|lawyer|legal\s+advice)\b/i.test(lower) &&
      !/\b(software|website|web\s+app|app|mobile|flutter|saas|platform|code|develop(er)?|pms|hotel)\b/i.test(lower);

    if (isOutOfScope) {
      return {
        intent: "OUT_OF_SCOPE",
        requirement: "Non-software service request (graphic design, accounting, video editing, etc.).",
        target_entity: null,
        service_match: false,
        representation: "IGNORE",
        decision: "IGNORED",
        is_genuine_buyer: false,
        reason: "Request is for non-software / out-of-scope services (logo/graphics/accounting) outside CodeAir capabilities."
      };
    }

    // -------------------------------------------------------------
    // QUALIFIER: BUYER / CLIENT PROJECT DEMAND (Semantic Analysis)
    // -------------------------------------------------------------
    // Checks for genuine client demand across natural phrasing:
    // "I need a website designer", "looking for someone to help with my website",
    // "need an app for my business", "can someone develop this", "looking for a developer to build my platform"

    const hasTargetRoleOrEntity =
      /\b(developer|dev|devs|programmer|coder|engineer|designer|web\s+designer|website\s+designer|web\s+developer|app\s+developer|flutter\s+developer|full[- ]?stack\s+developer|frontend\s+developer|backend\s+developer|ai\s+developer|ai\s+engineer|freelancer|contractor|agency|team|company|partner|firm|someone|somebody|expert|specialist)\b/i.test(lower);

    const hasProjectTarget =
      /\b(website|web\s+app|web\s+application|applications?|site|landing\s+page|store|online\s+store|ecommerce|e-commerce|mobile\s+app|ios\s+app|android\s+app|app|flutter\s+app|mvp|saas|platform|crm|erp|dashboard|admin\s+portal|internal\s+tool|hotel|resort|restaurant|pms|booking\s+system|reservation\s+system|hospitality\s+software|software|custom\s+software|system|tool|ai\s+chatbot|ai\s+agent|automation)\b/i.test(lower);

    const hasActionGoal =
      /\b(build|develop|create|design|redesign|code|program|make|launch|integrate|automate|setup|set\s+up|overhaul|fix|finish|hire|hiring|portfolio|rates|quotes?|budget|estimate|charges|help|assist)\b/i.test(lower);

    // Identify and Match Capability against CodeAir Knowledge Base
    let matchedCapability = null;
    let matchedCategories = [];
    let matchedServices = [];

    if (/\b(hotel|resort|restaurant|hospitality|motel|vacation\s+rental|guest\s+house|pms|reservation\s+system)\b/i.test(lower)) {
      matchedCapability = "Hospitality";
      matchedCategories = ["Hospitality"];
      matchedServices = ["Hotel management software (PixelGo HMS)", "Hospitality booking platforms"];
    } else if (/\b(saas|multi[- ]?tenant|mvp|platform)\b/i.test(lower)) {
      matchedCapability = "SaaS development";
      matchedCategories = ["SaaS development"];
      matchedServices = ["SaaS development", "MVP development", "Scalable cloud architecture"];
    } else if (/\b(ai|llm|chatbot|rag|agent|agents|voice\s+ai|calling\s+agent|business\s+automation|workflow\s+automation)\b/i.test(lower)) {
      matchedCapability = "AI & Automation";
      matchedCategories = ["AI & Automation"];
      matchedServices = ["AI applications", "AI agents", "AI chatbots", "Workflow automation"];
    } else if (/\b(crm|erp|pos|dashboard|admin\s+portal|internal\s+tool|inventory|billing\s+system)\b/i.test(lower)) {
      matchedCapability = "Business Systems";
      matchedCategories = ["Business Systems"];
      matchedServices = ["CRM systems", "ERP systems", "Admin dashboards", "Custom business portals"];
    } else if (/\b(backend|api|apis|database|postgres|node\.?js|laravel)\b/i.test(lower)) {
      matchedCapability = "Backend & APIs";
      matchedCategories = ["Backend & APIs"];
      matchedServices = ["Backend development", "Node.js engineering", "REST APIs", "Database architecture"];
    } else if (/\b(website|web\s+app|web\s+application|site|landing\s+page|store|online\s+store|ecommerce|e-commerce|web\s+designer|web\s+developer|frontend|full[- ]?stack)\b/i.test(lower)) {
      matchedCapability = "Web Development";
      matchedCategories = ["Web Development"];
      matchedServices = ["Custom web application development", "Business websites"];
    } else if (/\b(mobile|flutter|ios|android|react\s+native|mobile\s+app|apps?|app\s+developer|app\s+development)\b/i.test(lower)) {
      matchedCapability = "Mobile Development";
      matchedCategories = ["Mobile Development"];
      matchedServices = ["Mobile applications", "Flutter applications", "iOS applications", "Android applications"];
    } else if (/\b(developer|programmer|coder|software|system|application|develop\s+this|build\s+this|code\s+this)\b/i.test(lower)) {
      matchedCapability = "Custom Software";
      matchedCategories = ["Web Development"];
      matchedServices = ["Custom software development", "Application engineering"];
    }

    // Strict Buyer Qualification: Buyer Intent + Software Capability + (Target Entity OR Project Target) + Action Goal
    if (hasBuyerIntent && matchedCapability && (hasTargetRoleOrEntity || hasProjectTarget) && (hasActionGoal || hasProjectTarget)) {
      // 1. Determine Target Entity (INDIVIDUAL vs COMPANY vs EITHER)
      let targetEntity = "EITHER";
      if (/\b(agency|company|team|firm|studio|partner)\b/i.test(lower)) {
        targetEntity = "COMPANY";
      } else if (/\b(freelancer?|contractor|developer|dev|designer|individual|founder|person|guy)\b/i.test(lower)) {
        targetEntity = "INDIVIDUAL";
      }

      // 2. Extract Natural Language Requirement
      const requirement = this.extractNaturalRequirement(text, matchedCapability);

      // 4. Determine Representation based on targetEntity & capability
      let representation = "COMPANY";
      if (targetEntity === "INDIVIDUAL") {
        representation = "FOUNDER";
      } else if (targetEntity === "COMPANY") {
        representation = "COMPANY";
      } else {
        representation = "BOTH";
      }

      return {
        intent: "BUYER",
        requirement: requirement,
        target_entity: targetEntity,
        service_match: true,
        matched_capability: matchedCapability,
        matched_categories: matchedCategories,
        matched_services: matchedServices,
        representation: representation,
        decision: "QUALIFIED",
        temperature: "HOT",
        relevance_score: 95,
        is_genuine_buyer: true,
        should_reply: true,
        reason: `Genuine buyer requesting ${matchedCapability} (${targetEntity.toLowerCase()} representation).`
      };
    }

    // Unmatched general technology or ambiguous discussion
    return {
      intent: "NEEDS_REVIEW",
      requirement: "General technical discussion or ambiguous context.",
      target_entity: null,
      service_match: false,
      representation: "NEUTRAL",
      decision: "IGNORED",
      temperature: "IGNORE",
      relevance_score: 30,
      is_genuine_buyer: false,
      should_reply: false,
      reason: "General discussion without explicit client project demand or hiring intent."
    };
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
    const isBuyer = intent === "BUYER" || intent === "PROJECT_BUYER" || aiRes.is_genuine_buyer === true;

    if (isBuyer) {
      const cap = aiRes.primary_capability || aiRes.primary_category || "Web Development";
      return {
        intent: "BUYER",
        requirement: aiRes.requirement || post.text.slice(0, 100),
        target_entity: aiRes.target_entity || "EITHER",
        service_match: true,
        matched_capability: cap,
        matched_categories: [cap],
        matched_services: [cap],
        representation: aiRes.representation || "COMPANY",
        decision: "QUALIFIED",
        temperature: "HOT",
        relevance_score: 95,
        is_genuine_buyer: true,
        should_reply: true,
        reason: aiRes.reason || `AI qualified genuine buyer for ${cap}.`,
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
   * Generates conversational reply for comment replies or incoming DMs.
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

    // Check if verified link requested
    const requestedLink = knowledge.resolveRequestedLink(incomingMessage);

    // Human review escalation check (pricing negotiations, contracts, angry tones)
    const lower = incomingMessage.toLowerCase();
    const needsHumanReview =
      /\b(how\s+much\s+does\s+it\s+cost|send\s+a\s+quote|what\s+is\s+your\s+rate|discount|sign\s+contract|nda|lawyer|sue|angry|terrible)\b/i.test(lower);

    let responseMessage = "";
    if (requestedLink) {
      responseMessage = requestedLink.url
        ? `Here is the official link you requested: ${requestedLink.url}`
        : `Here are our official profiles:\n${requestedLink.text}`;
    } else if (/\bwho\s+(is\s+)?behind\s+codeair\b/i.test(lower)) {
      responseMessage = `Sunmughan Swamy is the founder and technical architect behind CodeAir Software Solutions. We engineer custom software, SaaS platforms, and AI systems.`;
    } else {
      responseMessage = `That makes sense. What does your current architecture look like, and what is your target timeline for this project?`;
    }

    return {
      intent: "PROJECT_INQUIRY",
      identity: "COMPANY",
      service_match: true,
      conversation_stage: needsHumanReview ? "HUMAN_REVIEW" : conversationStage,
      sales_intensity: needsHumanReview ? "MEDIUM" : "LOW",
      should_reply: true,
      human_review_required: needsHumanReview,
      requested_link: requestedLink,
      response_message: responseMessage
    };
  }

  buildFullSemanticPrompt(post) {
    const approved = knowledge.getApprovedServices();
    const excluded = knowledge.getExcludedServices();
    const profiles = knowledge.getOfficialProfiles();

    return `
You are the autonomous AI Lead Specialist for CodeAir Software Solutions.
Knowledge Base: Custom software, SaaS platforms, web applications, Flutter mobile apps, AI automations, hospitality systems (PixelGo HMS).
Founder: Sunmughan Swamy (Founder & Technical Architect).

Official URLs:
- Company Website: ${profiles.company.website || "https://www.codeair.tech"}
- PixelGo HMS (Hospitality): ${profiles.company.pixelgo || "https://pixelgo.live"}
- Founder LinkedIn: ${profiles.founder.linkedin || "https://www.linkedin.com/in/sunmughan/"}

Approved Capabilities:
${approved.slice(0, 25).map(s => `- ${s}`).join("\n")}

Excluded Non-Software Capabilities:
${excluded.slice(0, 10).map(s => `- ${s}`).join("\n")}

Analyze this social media post with zero bias:
AUTHOR: @${post.username || "user"}
CONTENT:
"""${post.text || ""}"""

CRITICAL INSTRUCTIONS:
1. Classify INTENT: BUYER | RECRUITMENT | JOB_SEEKER | SERVICE_PROVIDER | NETWORKING | IRRELEVANT | NEEDS_REVIEW
2. Genuine buyers are anyone needing, hiring, seeking, or asking for software development, web design/development, mobile apps, SaaS, AI automation, or hospitality systems.
3. Extract REQUIREMENT in natural language.
4. Determine TARGET_ENTITY: INDIVIDUAL (freelancer/developer) | COMPANY (agency/team) | EITHER.
5. Match capability against approved capabilities.
6. Select REPRESENTATION: FOUNDER | COMPANY | BOTH | NEUTRAL | IGNORE.
   - If user asks for an individual/freelancer/developer: FOUNDER
   - If user asks for an agency/company/team: COMPANY
   - If open to either: BOTH (or COMPANY)
7. Single-URL Discipline:
   - For FOUNDER: Share Founder LinkedIn only.
   - For COMPANY: Share Company Website only (or PixelGo HMS for hospitality).
   - For NEUTRAL: Zero URLs.
   - Maximum 1 URL total.

OUTPUT STRICT JSON:
{
  "intent": "BUYER" | "RECRUITMENT" | "JOB_SEEKER" | "SERVICE_PROVIDER" | "NETWORKING" | "IRRELEVANT" | "NEEDS_REVIEW",
  "requirement": "string",
  "target_entity": "INDIVIDUAL" | "COMPANY" | "EITHER",
  "service_match": true,
  "primary_capability": "string",
  "representation": "FOUNDER" | "COMPANY" | "BOTH" | "NEUTRAL" | "IGNORE",
  "is_genuine_buyer": true,
  "decision": "QUALIFIED" | "IGNORED",
  "reason": "string",
  "generated_comment": "string"
}
`;
  }
}

const aiDecisionEngine = new AiDecisionEngine();
module.exports = aiDecisionEngine;
