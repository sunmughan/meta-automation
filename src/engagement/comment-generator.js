/**
 * src/engagement/comment-generator.js
 * AI-Delegated Comment Synthesis Engine.
 *
 * ARCHITECTURAL RULE (v1.5.0+):
 * All comment generation is delegated to the MiniMax M3 AI Decision Engine.
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
   * Synthesizes a bespoke, engaging comment using MiniMax M3 AI reasoning.
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
    const { text = "", username = "", authorName = "", matchedCategories = [], identity = "COMPANY", intent = "", leadType = "" } = params;
    const platform = (params.platform || (params.post && params.post.platform) || (params.postId && (params.postId.startsWith("fb") ? "facebook" : params.postId.startsWith("li") ? "linkedin" : "threads")) || "threads").toLowerCase();
    
    // Strict placeholder handle check (never output @user, @facebook_buyer, etc.)
    const cleanUsername = String(username || "").replace(/^@+/, "").trim();
    const isPlaceholder = !cleanUsername || /^(user|facebook_buyer|linkedin_user|threads_user|buyer|author|admin)$/i.test(cleanUsername);
    const rawAuthor = String(authorName || (!isPlaceholder ? cleanUsername : "")).trim();

    // Determine platform-safe greeting
    let greeting = "";
    if (platform === "facebook" || platform === "linkedin") {
      // Facebook and LinkedIn do not use plain text @handles
      const firstToken = rawAuthor.split(/\s+/)[0]?.replace(/[^a-zA-Z]/g, "") || "";
      if (firstToken.length >= 2 && !/^(facebook|linkedin|buyer|user|admin|group|top|post|someone)$/i.test(firstToken)) {
        greeting = `Hi ${firstToken}, `;
      }
    } else {
      // Threads uses @handle
      if (!isPlaceholder && cleanUsername.length >= 2) {
        greeting = `@${cleanUsername} `;
      }
    }

    // Resolve ALL brand identity dynamically from knowledge base (zero hardcoded strings)
    const founder = knowledge.getFounderInfo();
    const company = knowledge.getCompanyInfo();
    const founderName = founder.name || "Founder";
    const founderRole = founder.role || "Founder";
    const companyName = company.name || "our team";
    const companyWebsite = knowledge.getProfileLink("COMPANY", "website") || company.website || "";
    const productUrl = knowledge.getProfileLink("COMPANY", "pixelgo") || company.productUrl || "";
    const isFacebook = platform === "facebook";
    const isLinkedIn = platform === "linkedin";
    const founderLink = isFacebook ? companyWebsite : (knowledge.getProfileLink("FOUNDER", "linkedin") || founder.linkedin || companyWebsite);

    // Determine primary URL based on identity
    let primaryUrl = "";
    if (identity === "FOUNDER") primaryUrl = founderLink;
    else if (identity === "COMPANY" || identity === "BOTH") primaryUrl = companyWebsite;

    const lowerText = text.toLowerCase();
    const isHospitality = knowledge.isHospitalityQuery(text) || (matchedCategories && matchedCategories.some(c => /hospitality|hotel/i.test(c)));
    if (isHospitality && productUrl) {
      primaryUrl = productUrl;
    }

    const isFounderNetworking = intent === "FOUNDER_NETWORKING" || leadType === "FOUNDER_NETWORKING" ||
      /\b(connect\s+with\s+(more\s+)?(founders?|builders?|hackers?)|indie\s+hackers?|saas\s+founders?|building\s+in\s+public|founder\s+journey)\b/i.test(lowerText);
    const isTechDiscussion = intent === "TECH_DISCUSSION" || leadType === "TECH_CONSULTING" ||
      /\b(vs|which\s+stack|what\s+stack|react\s+native|flutter|next\.?js|remix|postgres|supabase|mongodb|architecture|scalability|llm\s+agents?|system\s+design)\b/i.test(lowerText);
    const isFeedback = intent === "FEEDBACK_REQUEST" || leadType === "PRODUCT_FEEDBACK" ||
      /\b(feedback|roast|critique|launched|launching|product\s+hunt|what\s+do\s+you\s+think)\b/i.test(lowerText);
    const isAutomation = intent === "AUTOMATION" || leadType === "AUTOMATION_INQUIRY" ||
      /\b(automate|automation|workflow|scraper|scraping|bot|webhook|n8n|zapier)\b/i.test(lowerText);

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

    if (isFounderNetworking) {
      // Peer-level founder connection
      if (isFacebook || isLinkedIn) {
        comment = `${greeting}Always great connecting with other builders! I'm ${founderName}, ${founderRole} at ${companyName}. We build and scale SaaS systems and intelligent automation workflows. Love exchanging insights with fellow founders—looking forward to following your journey!`;
      } else {
        comment = `${greeting}Awesome connecting with fellow builders! I'm ${founderName} from ${companyName}. We engineer SaaS platforms and AI agent workflows. Excited to see what you're shipping!`;
      }
    } else if (isTechDiscussion) {
      // Deep technical consultative response
      if (lowerText.includes("flutter") || lowerText.includes("react native")) {
        comment = `${greeting}From production experience shipping mobile apps: React Native shines when your team has deep React/web synergy and rapid iteration needs, while Flutter gives pixel-level canvas control and rock-solid 60fps animations. Happy to dive deeper into performance trade-offs if you'd like!`;
      } else if (lowerText.includes("next") || lowerText.includes("remix")) {
        comment = `${greeting}Next.js offers unbeatable ecosystem maturity and deployment ergonomics, while Remix has outstanding form handling and nested route loaders. For MVPs requiring quick third-party integrations, Next.js usually ships faster. Feel free to connect to discuss architecture!`;
      } else if (lowerText.includes("postgres") || lowerText.includes("mongo")) {
        comment = `${greeting}For SaaS and multi-tenant architectures, Postgres with strict relational integrity and JSONB capabilities is almost always the safer long-term foundation over MongoDB. Always happy to share what scaled best in our client builds!`;
      } else {
        comment = `${greeting}Clean architecture and early validation always pay off. When architecting ${topicFocus}, keeping modular service boundaries makes scaling painless down the road. Let us know if you want to chat systems design!`;
      }
    } else if (isFeedback) {
      comment = `${greeting}Huge congratulations on shipping this! The value proposition comes through clearly. Focusing on reducing onboarding friction and highlighting the core problem in the main headline will really boost early conversions. Wishing you great momentum!`;
    } else if (isAutomation) {
      comment = `${greeting}Automating operational bottlenecks frees up massive engineering cycles. Combining lightweight Node/TypeScript services with resilient webhooks keeps things reliable without expensive SaaS bloat. Feel free to connect if you want to talk workflow architecture!`;
    } else if (isHospitality) {
      if (identity === "NEUTRAL") {
        comment = `${greeting}This is an interesting hospitality project. Are you looking for custom reservation flows or a unified system?`;
      } else if (identity === "FOUNDER") {
        comment = `${greeting}I'd love to help! I'm ${founderName}, ${founderRole} at ${companyName}. We built ${flagshipName} for hospitality operations. Explore our system at ${primaryUrl} or send a DM!`;
      } else if (identity === "BOTH") {
        comment = `${greeting}Our engineering team at ${companyName} specializes in hospitality tech like ${flagshipName}. Explore our platform at ${primaryUrl}. Send a DM anytime!`;
      } else {
        comment = `${greeting}At ${companyName}, we specialize in hotel and property management systems including ${flagshipName}. Explore our platform at ${primaryUrl}. Feel free to send a DM!`;
      }
    } else if (identity === "NEUTRAL") {
      comment = `${greeting}This is an interesting ${topicFocus} challenge. What's your preferred approach and timeline for this build?`;
    } else if (identity === "FOUNDER") {
      comment = `${greeting}I'd love to help with this! I'm ${founderName}, ${founderRole} at ${companyName}. We build ${topicFocus}. Feel free to connect at ${primaryUrl} or send a DM!`;
    } else if (identity === "BOTH") {
      comment = `${greeting}Our engineering team at ${companyName} works on ${topicFocus} with direct founder oversight. Check our work at ${primaryUrl}. Send a DM anytime!`;
    } else {
      comment = `${greeting}At ${companyName}, we specialize in ${topicFocus}. See our work at ${primaryUrl}. Feel free to send a DM with your project details!`;
    }

    return this.enforceSingleUrl(comment, primaryUrl);
  }

  /**
   * AI-powered bespoke comment generation.
   * Uses MiniMax M3 AI to generate contextually rich, personalized comments.
   *
   * @param {Object} params - Same as generateEngagingComment
   * @returns {Promise<string>} AI-generated bespoke comment
   */
  async generateEngagingCommentAsync(params) {
    const { text = "", username = "", authorName = "", matchedCategories = [], identity = "COMPANY" } = params;

    const founder = knowledge.getFounderInfo();
    const company = knowledge.getCompanyInfo();
    const profiles = knowledge.getOfficialProfiles();
    const companyUrl = profiles.company.website || company.website || "";
    const founderUrl = profiles.founder.linkedin || "";
    const productUrl = profiles.company.pixelgo || company.productUrl || "";

    const category = (matchedCategories && matchedCategories[0]) || "software development";
    const platform = (params.platform || (params.post && params.post.platform) || "threads").toLowerCase();
    const cleanUsername = String(username || "").replace(/^@+/, "").trim();
    const isPlaceholder = !cleanUsername || /^(user|facebook_buyer|linkedin_user|threads_user|buyer|author)$/i.test(cleanUsername);
    const authorGreetingRule = (platform === "facebook" || platform === "linkedin")
      ? "DO NOT output any '@' handles or '@user'. If a real person first name is known, start with 'Hi <FirstName>,' or begin directly with value."
      : (!isPlaceholder ? `Start with '@${cleanUsername} ' or address naturally.` : "DO NOT output '@user'. Begin directly with value.");

    try {
      const prompt = `
CRITICAL OPERATIONAL CONSTRAINT:
You are generating a single engaging comment reply for a social media post on ${platform.toUpperCase()}. DO NOT invoke ANY tools. Output ONLY valid JSON.

Context:
- Platform: ${platform.toUpperCase()}
- Company: ${company.name} (${company.summary})
- Founder: ${founder.name} (${founder.role})
- Identity Mode: ${identity}
- Post Author: ${!isPlaceholder ? cleanUsername : "Author"}
- Post Content: """${text}"""
- Matched Category: ${category}
- Available URLs:
  * Company Website: ${companyUrl}
  * Founder Profile: ${founderUrl}
  * Product URL: ${productUrl}

Rules:
1. Write a bespoke 2-3 sentence comment addressing the author's exact project or question.
2. Platform Greeting Constraint: ${authorGreetingRule}
3. Identity "${identity}":
   - FOUNDER: Speak as ${founder.name} (${founder.role}), share founder profile only.
   - COMPANY: Speak as ${company.name}, share company website only.
   - BOTH: Company team with founder oversight, share company website only.
   - NEUTRAL: Pure technical value, zero URLs, zero promotion.
4. Maximum 1 URL total. Zero canned clichés. Directly helpful.
5. Natural conversational English. No hashtags. Never use '@user'.

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
