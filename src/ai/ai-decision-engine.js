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

    // 1. Attempt LLM Semantic Reasoning via Antigravity AI Runtime
    // Options defaults useAiCall to true unless explicitly disabled
    const isTestEnv = process.env.NODE_ENV === "test";
    const shouldCallAi = options.useAiCall !== false && !options.offlineSimulation;

    if (shouldCallAi) {
      try {
        const prompt = this.buildFullSemanticPrompt(post);
        const aiRes = await aiRuntime.callAi(prompt, { taskType: "POST_ANALYSIS" });
        if (aiRes && (aiRes.intent || aiRes.decision)) {
          return this.normalizeAiResponse(aiRes, post);
        }
      } catch (err) {
        logger.warn(`Antigravity AI model call failed: ${err.message}`);
        // ARCHITECTURAL HARDENING (v1.1.8):
        // Zero Heuristic Guessing on AI Failure in production.
        // "A delayed decision is vastly superior to an erroneous AI decision."
        const allowFallback = options.allowLocalFallback === true || (isTestEnv && options.allowLocalFallback !== false);
        if (!allowFallback) {
          logger.warn(`[AI Engine] Quarantining post ${post?.postId || "unknown"} due to AI runtime failure. Zero heuristic guessing.`);
          return {
            intent: "AI_ERROR",
            decision: "IGNORED",
            lead_type: "QUARANTINED",
            quarantined: true,
            service_match: false,
            representation: "IGNORE",
            is_genuine_buyer: false,
            should_reply: false,
            reason: `Antigravity AI reasoning failed (${err.message}). Quarantined to avoid heuristic hallucination.`
          };
        }
      }
    }

    // 2. Offline Simulation / Grounded Semantic Reasoning Engine
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
    // DIRECT INQUIRIES (CodeAir Capabilities & Founder Identity)
    // -------------------------------------------------------------
    if (/\bwho\s+(is\s+)?(behind|founded|started|runs)\s+codeair\b/i.test(lower)) {
      return {
        intent: "BUYER",
        requirement: "User asking about the founder of CodeAir Software Solutions.",
        target_entity: "INDIVIDUAL",
        service_match: true,
        matched_capability: "Technical Leadership & Custom Architecture",
        matched_services: ["Custom software architecture", "Technical consulting"],
        matched_categories: ["Web Development"],
        representation: "FOUNDER",
        decision: "QUALIFIED",
        temperature: "HOT",
        relevance_score: 95,
        is_genuine_buyer: true,
        should_reply: true,
        reason: "User specifically asking about founder identity and leadership.",
        generated_comment: `@${post.username || "user"} Sunmughan Swamy is the founder and technical architect behind CodeAir Software Solutions. We build custom software, SaaS platforms, and AI automations. Connect on LinkedIn at https://www.linkedin.com/in/sunmughan/!`
      };
    }

    if (/\bwhat\s+(does\s+)?codeair\s+do\b/i.test(lower)) {
      return {
        intent: "BUYER",
        requirement: "User asking about CodeAir Software Solutions capabilities and services.",
        target_entity: "COMPANY",
        service_match: true,
        matched_capability: "Full-Cycle Software Engineering",
        matched_services: ["Custom software development", "Web applications", "SaaS platforms", "AI automation"],
        matched_categories: ["Web Development"],
        representation: "COMPANY",
        decision: "QUALIFIED",
        temperature: "HOT",
        relevance_score: 95,
        is_genuine_buyer: true,
        should_reply: true,
        reason: "User explicitly asking about CodeAir company capabilities.",
        generated_comment: `@${post.username || "user"} Over at CodeAir Software Solutions, we engineer custom web applications, multi-tenant SaaS platforms, Flutter mobile apps, and autonomous AI systems. Explore our portfolio at https://www.codeair.tech and connect with our founder at https://www.linkedin.com/in/sunmughan/.`
      };
    }

    // -------------------------------------------------------------
    // DISQUALIFIER 0: CAREER ADVICE & JOB/DEGREE TRANSITION (Strict Zero Sales Pitch)
    // -------------------------------------------------------------
    const isCareerAdvice =
      /\b(career\s+(advice|path|paths|change|transition|move|growth|options?)|job\s+(titles?|paths?|search|hunting|market)|what\s+(career|job|role|paths?|titles?)\s+should\s+i|(figure|figuring)\s+out\s+my\s+next\s+move|(finished|graduated|earned|completed)\s+my\s+(ba|bs|bachelor'?s|master'?s|degree|mba|phd)|(ba|bs|degree)\s+in\s+business(\s+administration)?|wfh[,\s]+(\$?\d+k\+?|remote)|minimal\s+phones?|entry[- ]level\s+(roles?|jobs?|positions?|advice)|how\s+do\s+i\s+break\s+into|how\s+to\s+get\s+into\s+(tech|software|data|product)|advice\s+for\s+(new\s+grads|beginners|career\s+changers|moms?)|resume\s+(feedback|review|help))\b/i.test(lower);

    if (isCareerAdvice) {
      return {
        intent: "CAREER_ADVICE",
        requirement: "Author asking for personal career advice, job titles, or education transition.",
        target_entity: null,
        service_match: false,
        representation: "IGNORE",
        decision: "IGNORED",
        temperature: "IGNORE",
        relevance_score: 0,
        is_genuine_buyer: false,
        should_reply: false,
        lead_type: "CAREER_ADVICE",
        reason: "Author is asking for personal career advice or job titles, not hiring for a software project."
      };
    }

    // -------------------------------------------------------------
    // DISQUALIFIER 0.5: B2B LEAD GENERATION & DATA SALES OFFERS
    // -------------------------------------------------------------
    const isLeadGeneration =
      /\b(b2b\s+leads?|lead\s+generation|batch\s+of\s+leads|deliver(ing)?\s+the\s+leads|budget\s+per\s+lead|decision[- ]maker\s+leads|sample\s+sheet|payment[- ]based\s+deal|flat\s+rate\s+per\s+batch|flat\s+rate\s+per\s+lead|targeted\s+leads|cold\s+email\s+leads|lead\s+gen\s+service|lead\s+scraper|verified\s+contact\s+info)\b/i.test(lower);

    if (isLeadGeneration) {
      return {
        intent: "LEAD_GENERATION_BUYER",
        requirement: "Author offering or discussing B2B lead generation / contact list delivery.",
        target_entity: null,
        service_match: false,
        representation: "IGNORE",
        decision: "IGNORED",
        temperature: "IGNORE",
        relevance_score: 0,
        is_genuine_buyer: false,
        should_reply: false,
        lead_type: "LEAD_GENERATION_BUYER",
        reason: "Author is proposing or offering B2B lead generation data, not purchasing software engineering."
      };
    }

    // -------------------------------------------------------------
    // BUYER INTENT DETECTION (Semantic cues of client demand or hiring intent)
    // -------------------------------------------------------------
    const hasBuyerIntent =
      /\b((i|we)\s+need|need\s+(someone(\s+who)?|somebody(\s+who)?|a\s+|an?\s+|to\s+hire)|needing|looking\s+for\s+(a\s+|an?\s+|someone(\s+who|\s+to)|somebody(\s+who|\s+to)|a\s+developer|a\s+designer|an\s+agency|proposals?|recommendations?|help\s+with|a\s+co[- ]?founder|a\s+cto|a\s+technical\s+partner)|looking\s+to\s+hire|(i|we)\s+want\s+(a\s+|an?\s+|to\s+build|to\s+create|to\s+develop|to\s+hire|to\s+redesign|someone|somebody)|seeking\s+(a\s+|an?\s+|someone(\s+who|\s+to)|a\s+developer|a\s+designer|an\s+agency|proposals?|recommendations?|a\s+co[- ]?founder|a\s+cto|a\s+technical\s+partner)|hiring\s+(a\s+|an?\s+|someone|a\s+developer|a\s+designer|an\s+agency|a\s+co[- ]?founder)|hire\s+(a\s+|an?\s+|someone|a\s+developer|a\s+designer|an\s+agency|a\s+co[- ]?founder)|in\s+search\s+of\s+(a\s+|an?\s+|someone|a\s+developer|a\s+designer|an\s+agency|a\s+co[- ]?founder)|in\s+need\s+of\s+(a\s+|an?\s+|someone|a\s+developer|a\s+designer|a\s+website|an?\s+app)|searching\s+for\s+(a\s+|an?\s+|someone|a\s+developer|a\s+designer|an\s+agency|a\s+co[- ]?founder)|can\s+(someone|anyone)(\s+help(\s+to)?)?\s*(build|develop|create|design|code|redesign|with)?|who\s+can(\s+help(\s+to)?)?\s*(build|develop|create|design|code|redesign)?|anyone\s+knows?\s+(a\s+|an?\s+|someone|how\s+to\s+build)|anyone\s+can(\s+help(\s+to)?)?\s*(build|develop|create|design|code)?|does\s+anyone\s+(build|know\s+a\s+developer|know\s+a\s+designer)|recommend\s+(a\s+|an?\s+|developers?|designers?|agenc)|recommendations?\s+for\s+(a\s+|an?\s+|developers?|designers?|agenc|software|websites?|apps?)|help\s+(me|us)\s*(to\s+)?(build|create|develop|design|code|redesign)|where\s+can\s+i\s+(find|hire)\s+(a\s+|an?\s+|someone|a\s+developer|a\s+designer|a\s+co[- ]?founder)|dm\s+(me\s+)?(your\s+)?(portfolio|rates|quotes?|pricing|charges|proposals?))\b/i.test(lower);

    // -------------------------------------------------------------
    // DISQUALIFIER 1: JOB SEEKER (Candidate asking for employment)
    // -------------------------------------------------------------
    const isJobSeeker =
      /\b(open\s+to\s+work|open\s+for\s+work|looking\s+for\s+(a\s+)?(job|internship)|looking\s+for\s+entry[- ]level|seeking\s+(opportunities|employment|job|roles?)|available\s+for\s+(work|hire|employment)|freelancer\s+available|actively\s+looking\s+for\s+(work|a\s+job)|seeking\s+(software|web|flutter|developer)\s+opportunities|hire\s+me\b|looking\s+to\s+break\s+into)\b/i.test(lower);

    if (isJobSeeker) {
      return {
        intent: "JOB_SEEKER",
        requirement: "Author seeking employment or freelance gigs for themselves.",
        target_entity: null,
        service_match: false,
        representation: "IGNORE",
        decision: "IGNORED",
        is_genuine_buyer: false,
        should_reply: false,
        lead_type: "JOB_SEEKER",
        reason: "Author is a job seeker looking for employment or gigs, not a software client."
      };
    }

    // -------------------------------------------------------------
    // DISQUALIFIER 2: SERVICE PROVIDER (Sellers advertising own services)
    // ONLY triggers if author is pitching themselves or advertising their own work,
    // and NOT expressing genuine buyer demand for their own project.
    // -------------------------------------------------------------
    const isRhetoricalSellerQuestion =
      (/\blooking\s+for\s+a\s+(website|web|app|mobile|software)?\s*(designer|developer|agency)\s*\?/i.test(lower) &&
       /\b(we|i|here|dm|contact|agency|studio|duo)\b/i.test(lower));

    const isDirectSellerPromotion =
      /\b(my\s+portfolio|check\s+(out\s+)?my\s+(work|portfolio|recent\s+project)|my\s+latest\s+(build|project|design|website)|built\s+this\s+(website|app|for\s+a\s+client)|taking\s+on\s+new\s+clients|accepting\s+new\s+clients|open\s+for\s+clients|dm\s+(me\s+)?for\s+(rates|pricing|inquiries|quotes?|orders?)|starting\s+at\s+[\$₹€£]\d+|[\$₹€£]\d+\s+per\s+(page|website|project)|link\s+in\s+bio|calendly\.com|i\s+build\s+(websites|apps|software)\s+for|we\s+build\s+(websites|apps|software)\s+for|i\s+can\s+help\s+you\s+(build|launch|turn\s+your\s+idea)|we\s+(design|build|create|develop)\s+(and\s+(build|design|develop)\s+)?(modern|custom|stunning|responsive|high[- ]converting)?\s*(websites|apps|software)|we\s+are\s+here|is\s+here\s*!\s*we|our\s+(agency|team|studio|services)|dm\s+(us|me)\s+to\s+(work|start|book|get\s+started)|booking\s+(open|now\s+for)|partner\s+up\s+with\s+me|work\s+with\s+(me|us)|let('?s|\s+us)\s+(start\s+)?work(ing)?\s+together|what\s+you\s+have\s+in\s+mind.*vercel\.app|looking\s+for\s+(\d+\s+)?(businesses|clients|companies|brands|startups|people)\s+(that|who)\s+(need|want)|independent\s+(web\s+developer|developer|designer|engineer))\b/i.test(lower) ||
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
    // DISQUALIFIER 3.5: EDUCATIONAL ARTICLES, COMPARISONS, & RHETORICAL ADVICE
    // (e.g. "When you need a website, the first decision...", "Website development vs website builder")
    // -------------------------------------------------------------
    const isEducationalOrComparison =
      /\b(((if|when|why|before|how)\s+you\s+need)|((do|are)\s+you\s+need)|((if|when)\s+you('?re|\s+are)\s+(looking|building|trying|planning))|(should\s+you\s+(hire|build|choose))|(which\s+is\s+(better|best))|(\bvs\b.*(which|better|difference))|(pros\s+and\s+cons)|(guide\s+to)|(tips\s+for)|(here('?s|\s+is)\s+(how|why|what)))\b/i.test(lower);

    const hasFirstPersonBuyerStatement =
      /\b((i|we)\s+need|looking\s+to\s+hire|hire\s+someone|looking\s+for\s+(a|someone)|dm\s+me\s+your\s+(rates|portfolio))\b/i.test(lower) &&
      !/\b((if|when|why|before)\s+(i|we)\s+need)\b/i.test(lower);

    if (isEducationalOrComparison && !hasFirstPersonBuyerStatement) {
      return {
        intent: "EDUCATIONAL_CONTENT",
        requirement: "Author sharing an educational comparison, blog article, or rhetorical advice for readers.",
        target_entity: null,
        service_match: false,
        representation: "IGNORE",
        decision: "IGNORED",
        is_genuine_buyer: false,
        should_reply: false,
        reason: "Author is sharing educational advice or product comparison for readers, not seeking software services for themselves."
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
      /\b(developer|dev|devs|programmer|coder|engineer|designer|web\s+designer|website\s+designer|web\s+developer|app\s+developer|flutter\s+developer|full[- ]?stack\s+developer|frontend\s+developer|backend\s+developer|ai\s+developer|ai\s+engineer|co[- ]?founder|cto|technical\s+partner|tech\s+lead|consultant|freelancer|contractor|agency|team|company|partner|firm|someone|somebody|expert|specialist)\b/i.test(lower);

    const hasProjectTarget =
      /\b(websites?|web\s+apps?|web\s+applications?|applications?|sites?|landing\s+pages?|stores?|online\s+stores?|ecommerce|e-commerce|shopify|mobile\s+apps?|ios\s+apps?|android\s+apps?|apps?|flutter\s+apps?|mvps?|saas|platforms?|crms?|erps?|dashboards?|admin\s+portals?|internal\s+tools?|hotels?|resorts?|restaurants?|pms|booking\s+systems?|reservation\s+systems?|hospitality\s+software|software|custom\s+software|systems?|tools?|ai\s+chatbots?|ai\s+agents?|automations?|co[- ]?founder|technical\s+partner|tech\s+consulting|architecture|mvp\s+build)\b/i.test(lower);

    const hasActionGoal =
      /\b(build|building|develop|developing|development|create|creating|creation|design|designing|redesign|redesigning|code|coding|program|programming|make|making|launch|launching|integrate|integrating|automate|automating|setup|set\s+up|overhaul|fix|fixing|finish|finishing|hire|hiring|portfolio|rates|quotes?|budget|estimate|charges|help|helping|assist|assisting|partner|partnering|specializ(e|es|ing)\s+in)\b/i.test(lower);

    // Identify and Match Capability against CodeAir Knowledge Base
    let matchedCapability = null;
    let matchedCategories = [];
    let matchedServices = [];

    if (/\b(hotel|resort|restaurant|hospitality|motel|vacation\s+rental|guest\s+house|pms|reservation\s+system)\b/i.test(lower)) {
      matchedCapability = "Hospitality";
      matchedCategories = ["Hospitality"];
      matchedServices = ["Hotel management software (PixelGo HMS)", "Hospitality booking platforms"];
    } else if (/\b(saas|multi[- ]?tenant|mvps?|platforms?)\b/i.test(lower)) {
      matchedCapability = "SaaS development";
      matchedCategories = ["SaaS development"];
      matchedServices = ["SaaS development", "MVP development", "Scalable cloud architecture"];
    } else if (/\b(ai|llm|chatbots?|rag|agents?|voice\s+ai|calling\s+agent|business\s+automation|workflow\s+automation)\b/i.test(lower)) {
      matchedCapability = "AI & Automation";
      matchedCategories = ["AI & Automation"];
      matchedServices = ["AI applications", "AI agents", "AI chatbots", "Workflow automation"];
    } else if (/\b(crms?|erps?|pos|dashboards?|admin\s+portals?|internal\s+tools?|inventory|billing\s+systems?)\b/i.test(lower)) {
      matchedCapability = "Business Systems";
      matchedCategories = ["Business Systems"];
      matchedServices = ["CRM systems", "ERP systems", "Admin dashboards", "Custom business portals"];
    } else if (/\b(backend|api|apis|databases?|postgres|node\.?js|laravel)\b/i.test(lower)) {
      matchedCapability = "Backend & APIs";
      matchedCategories = ["Backend & APIs"];
      matchedServices = ["Backend development", "Node.js engineering", "REST APIs", "Database architecture"];
    } else if (/\b(websites?|web\s+apps?|web\s+applications?|sites?|landing\s+pages?|stores?|online\s+stores?|ecommerce|e-commerce|shopify|web\s+designers?|web\s+developers?|frontend|full[- ]?stack)\b/i.test(lower)) {
      matchedCapability = "Web Development";
      matchedCategories = ["Web Development"];
      matchedServices = ["Custom web application development", "Business websites"];
    } else if (/\b(mobile|flutter|ios|android|react\s+native|mobile\s+apps?|apps?|app\s+developers?|app\s+development)\b/i.test(lower)) {
      matchedCapability = "Mobile Development";
      matchedCategories = ["Mobile Development"];
      matchedServices = ["Mobile applications", "Flutter applications", "iOS applications", "Android applications"];
    } else if (/\b(co[- ]?founder|cto|technical\s+partner|tech\s+consulting|architecture\s+guidance|tech\s+advisor)\b/i.test(lower)) {
      matchedCapability = "Technical Co-Founder & Consulting";
      matchedCategories = ["Web Development"];
      matchedServices = ["Technical consulting", "Custom software architecture", "MVP development"];
    } else if (/\b(developers?|programmers?|coders?|software|systems?|applications?|develop\s+this|build\s+this|code\s+this)\b/i.test(lower)) {
      matchedCapability = "Custom Software";
      matchedCategories = ["Web Development"];
      matchedServices = ["Custom software development", "Application engineering"];
    }

    // Strict Buyer Qualification: Buyer Intent + Software Capability + (Target Entity OR Project Target) + Action Goal
    if (hasBuyerIntent && matchedCapability && (hasTargetRoleOrEntity || hasProjectTarget) && (hasActionGoal || hasProjectTarget)) {
      // 1. Determine Target Entity (INDIVIDUAL vs COMPANY vs EITHER)
      let targetEntity = "EITHER";
      if (/\b(co[- ]?founder|cto|technical\s+partner|freelancer?|contractor|developer|dev|designer|individual|founder|person|guy)\b/i.test(lower)) {
        targetEntity = "INDIVIDUAL";
      } else if (/\b(agency|company|team|firm|studio)\b/i.test(lower)) {
        targetEntity = "COMPANY";
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
   * Generates conversational reply for comment replies or incoming DMs.
   * Dynamic context-aware reasoning replaces all static string fallbacks.
   */
  async generateConversationReply(context) {
    const {
      incomingMessage = "",
      originalPost = "",
      ourPreviousMessage = "",
      conversationStage = "DISCOVERY",
      companyMentionedBefore = false,
      founderMentionedBefore = false,
      username = "user",
      convId = null
    } = context;

    const lower = incomingMessage.toLowerCase();

    // 1. Check if verified link requested
    const requestedLink = knowledge.resolveRequestedLink(incomingMessage);

    // 2. Human review escalation check (pricing negotiations, contracts, legal, angry tones)
    const needsHumanReview =
      /\b(how\s+much\s+does\s+it\s+cost|send\s+a\s+quote|what\s+is\s+your\s+rate|discount|sign\s+contract|nda|lawyer|sue|angry|terrible)\b/i.test(lower);

    let responseMessage = "";
    let detectedIntent = "PROJECT_INQUIRY";
    let identity = "COMPANY";
    let updatedStage = conversationStage;
    let serviceMatch = true;

    if (requestedLink) {
      responseMessage = requestedLink.url
        ? `Here is the official link you requested: ${requestedLink.url}`
        : `Here are our official profiles:\n${requestedLink.text}`;
      detectedIntent = "LINK_REQUEST";
      identity = requestedLink.target || "COMPANY";
    } else if (/\b(b2b\s+leads?|lead\s+generation|batch\s+of\s+leads|deliver(ing)?\s+the\s+leads|budget\s+per\s+lead|decision[- ]maker\s+leads|sample\s+sheet|payment[- ]based\s+deal|flat\s+rate\s+per\s+batch|flat\s+rate\s+per\s+lead|targeted\s+leads|cold\s+email|leads\s+ready\s+to\s+get\s+converted)\b/i.test(lower)) {
      // B2B Lead Generation Offer / Outbound Pitch to Us:
      // Directly address their proposal, clarify CodeAir's software-only scope, and decline politely without software questions.
      responseMessage = `Thanks for clarifying your terms and pricing model. Over at CodeAir Software Solutions, we specialize strictly in custom software engineering, SaaS platforms, and AI systems, so we aren't purchasing lead generation batches or external lists right now. Wishing you the best with your outreach!`;
      detectedIntent = "LEAD_GENERATION_DECLINED";
      identity = "COMPANY";
      serviceMatch = false;
      updatedStage = "CLOSED";
    } else if (/\b(career\s+(advice|path|paths|change|transition)|job\s+(titles?|paths?|search|hunting)|open\s+to\s+work|looking\s+for\s+(a\s+)?job|internship|hiring\s+interns|entry[- ]level\s+role)\b/i.test(lower)) {
      // Career / Job Seeking Inquiry:
      responseMessage = `Thanks for connecting! We aren't currently taking on new engineering hires or interns, but we wish you tremendous success in your career journey.`;
      detectedIntent = "CAREER_INQUIRY";
      identity = "COMPANY";
      serviceMatch = false;
      updatedStage = "CLOSED";
    } else if (/\bwho\s+(is\s+)?(behind|founder|runs|started)\s+codeair\b/i.test(lower)) {
      responseMessage = `Sunmughan Swamy is the founder and technical architect behind CodeAir Software Solutions. We engineer custom software, SaaS platforms, and AI systems.`;
      detectedIntent = "FOUNDER_INQUIRY";
      identity = "FOUNDER";
    } else if (/\b(what\s+(does\s+)?codeair\s+do|what\s+services|what\s+do\s+you\s+(build|offer|do))\b/i.test(lower)) {
      responseMessage = `At CodeAir Software Solutions, we engineer custom web applications, multi-tenant SaaS platforms, Flutter mobile apps, and autonomous AI systems.`;
      detectedIntent = "CAPABILITY_INQUIRY";
      identity = "COMPANY";
    } else {
      // Genuine Software Project Inquiry / Multi-Turn Technical Exploration
      const prevLower = String(ourPreviousMessage || "").toLowerCase();
      if (prevLower.includes("architecture") || prevLower.includes("scope")) {
        responseMessage = `Got it. What are the key integrations or third-party APIs needed, and do you have an existing design or specification ready?`;
        updatedStage = "SCOPING";
      } else if (prevLower.includes("timeline") || lower.includes("timeline") || lower.includes("deadline")) {
        responseMessage = `Understood. Would you like to schedule a technical discovery call to review the core architecture and milestones in detail?`;
        updatedStage = "DISCOVERY_CALL";
      } else {
        responseMessage = `That sounds like an interesting project. Could you share a bit more detail about the core features and what target platforms (web, mobile, or backend) you have in mind?`;
        updatedStage = "DISCOVERY";
      }
    }

    // Enforce Relevance Gate on the proposed message
    const gateCheck = this.evaluateRelevanceGate(responseMessage, { ...context, convId }, incomingMessage);
    if (!gateCheck.approved) {
      logger.warn(`[AI Engine] Relevance gate blocked proposed response: ${gateCheck.reason}`);
      // Safe fallback closure that avoids repetitive questioning
      responseMessage = `Understood. Feel free to connect directly if you have any questions regarding CodeAir's custom software engineering services.`;
    }

    return {
      intent: detectedIntent,
      identity: identity,
      service_match: serviceMatch,
      conversation_stage: needsHumanReview ? "HUMAN_REVIEW" : updatedStage,
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
POST_ID: ${post.postId || "none"}
AUTHOR: @${post.username || "user"}
CONTENT:
"""${post.text || ""}"""

CRITICAL INSTRUCTIONS:
1. Classify INTENT: BUYER | CAREER_ADVICE | LEAD_GENERATION_BUYER | RECRUITMENT | JOB_SEEKER | SERVICE_PROVIDER | NETWORKING | IRRELEVANT | NEEDS_REVIEW
2. Genuine buyers are anyone needing, hiring, seeking, or asking for software development, web design/development, mobile apps, SaaS, AI automation, or hospitality systems.
3. Strict Disqualifications (Zero Sales Pitch):
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
   - For FOUNDER: Share Founder LinkedIn only.
   - For COMPANY: Share Company Website only (or PixelGo HMS for hospitality).
   - For NEUTRAL: Zero URLs.
   - Maximum 1 URL total.

OUTPUT STRICT JSON:
{
  "intent": "BUYER" | "CAREER_ADVICE" | "LEAD_GENERATION_BUYER" | "RECRUITMENT" | "JOB_SEEKER" | "SERVICE_PROVIDER" | "NETWORKING" | "IRRELEVANT" | "NEEDS_REVIEW",
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
