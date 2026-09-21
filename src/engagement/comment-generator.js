/**
 * src/engagement/comment-generator.js
 * Synthesizes detailed, engaging, and contextually rich discovery comments for qualified leads.
 * Adheres strictly to identity representation standards & positioning guidelines:
 *
 * IDENTITY RULES:
 * 1. "FOUNDER": Written in first-person ("I", "as a founder & architect").
 *    Shares the founder's personal profile (LinkedIn) ONLY. NEVER includes company website.
 * 2. "COMPANY": Written in collective company voice ("We at <CompanyName>").
 *    Shares company website ONLY. NEVER includes personal founder link.
 * 3. "NEUTRAL": Pure technical value, architectural advice, or diagnostic question.
 *    ZERO promotional links.
 * 4. "BOTH": Introduces company engineering team with founder oversight.
 *    Single primary link (company website).
 *
 * STRICT URL DISCIPLINE:
 * - At most ONE (1) URL per comment across all modes.
 * - PixelGo HMS ONLY for explicit hospitality/hotel/resort/restaurant requests.
 * - ALL links and names are dynamically resolved from knowledge/profiles.md via knowledgeEngine.
 */

const knowledge = require("../knowledge/knowledge-engine");

class CommentGenerator {
  pickVariation(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

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
   * Determines the precise topic of the post using semantic matchedCategories first,
   * then strict word-boundary regular expressions (NEVER naive substring .includes("ai") or .includes("app")).
   */
  determineTopic(cleanText, matchedCategories = []) {
    // 1. Hospitality (PixelGo HMS)
    if (
      matchedCategories.includes("Hospitality") ||
      knowledge.isHospitalityQuery(cleanText) ||
      /\b(hotel|resort|hospitality|motel|homestay|guest\s*house|pms|room\s*reservation|hotel\s*booking)\b/i.test(cleanText)
    ) {
      return "HOSPITALITY";
    }

    // 2. Category-first routing (from semantic AI decision engine)
    if (matchedCategories.includes("Web Development")) return "WEB";
    if (matchedCategories.includes("Mobile Development")) return "MOBILE";
    if (matchedCategories.includes("AI & Automation")) return "AI";
    if (matchedCategories.includes("SaaS development")) return "SAAS";
    if (matchedCategories.includes("Business Systems")) return "BUSINESS";

    // 3. Strict word-boundary regex detection (Zero substring bugs like "paid" matching "ai")
    const isReactOrWeb = /\b(react|reactjs|next\.?js|frontend|fullstack|full-stack|web\s*developer|web\s*dev|web\s*development|web\s*apps?|web\s*applications?|websites?|node\.?js|javascript|typescript|html|css)\b/i.test(cleanText);
    const isMobile = /\b(mobile\s*apps?|flutter|react\s*native|ios\s*apps?|android\s*apps?|cross-platform|app\s*developer)\b/i.test(cleanText);
    const isAi = /\b(ai|artificial\s+intelligence|llms?|chatbots?|ai\s+agents?|ai\s+automations?|gpt|machine\s+learning|workflow\s+automation)\b/i.test(cleanText);
    const isSaas = /\b(saas|mvps?|multi[- ]?tenant|software\s+as\s+a\s+service)\b/i.test(cleanText);
    const isBusiness = /\b(crms?|erps?|pos|inventory|billing\s+systems?|dashboards?|admin\s+portals?)\b/i.test(cleanText);

    // Priority ordering for keyword detection
    if (isReactOrWeb && !isAi && !isMobile) return "WEB";
    if (isMobile && !isAi) return "MOBILE";
    if (isAi && !isReactOrWeb && !isMobile) return "AI";
    if (isSaas) return "SAAS";
    if (isBusiness) return "BUSINESS";

    if (isReactOrWeb) return "WEB";
    if (isMobile) return "MOBILE";
    if (isAi) return "AI";

    return "GENERAL";
  }

  /**
   * Synthesizes a detailed, engaging comment based on lead qualification context and strict identity.
   *
   * @param {Object} params
   * @param {string} params.text - Original post text
   * @param {string} params.username - Author username
   * @param {string[]} params.matchedCategories - Matched CodeAir categories
   * @param {string} params.identity - "FOUNDER"|"COMPANY"|"BOTH"|"NEUTRAL"
   * @returns {string} Detailed, engaging comment adhering to identity and URL constraints
   */
  generateEngagingComment(params) {
    const { text = "", username = "", matchedCategories = [], identity = "COMPANY" } = params;
    const cleanText = text.toLowerCase();
    const handle = username ? `@${username}` : "";
    const greeting = handle ? (Math.random() > 0.5 ? `${handle} ` : `Hey ${handle}, `) : "";

    // Resolve ALL brand identity dynamically from knowledge base (zero hardcoded strings)
    const founder = knowledge.getFounderInfo();
    const company = knowledge.getCompanyInfo();
    const founderName = founder.name || "Founder";
    const founderRole = founder.role || "Founder";
    const companyName = company.name || "our team";
    const companyWebsite = knowledge.getProfileLink("COMPANY", "website") || company.website || "";
    const pixelgoUrl = knowledge.getProfileLink("COMPANY", "pixelgo") || company.productUrl || "";
    const isFacebook = Boolean(params && (params.platform === "facebook" || (params.post && params.post.platform === "facebook")));
    // On Facebook, NEVER share LinkedIn URLs because Facebook's preview crawler gets blocked by Cloudflare reCAPTCHA!
    const founderLink = isFacebook ? companyWebsite : (knowledge.getProfileLink("FOUNDER", "linkedin") || founder.linkedin || companyWebsite);
    const founderConnectLabel = isFacebook ? `at ${founderLink}` : `on LinkedIn at ${founderLink}`;

    const topic = this.determineTopic(cleanText, matchedCategories);

    // ============================================================
    // MODE 1: NEUTRAL (Pure Technical Value, Zero Promotional Links)
    // ============================================================
    if (identity === "NEUTRAL") {
      if (topic === "MOBILE") {
        return this.pickVariation([
          `${greeting}When building a mobile app from scratch, choosing Flutter lets you launch on both iOS and Android with one clean codebase. What features are you building first?`,
          `${greeting}For a mobile app build, keeping your database and offline storage simple early on will save weeks of refactoring later. Are you launching on both iOS and Android?`
        ]);
      }
      if (topic === "AI") {
        return this.pickVariation([
          `${greeting}When building AI workflows, clear prompt rules and testing with real data are what make it reliable in production. What specific task are you looking to automate?`,
          `${greeting}The biggest win in AI automation comes from keeping your APIs clean and testing edge cases early. Are you connecting this to a database or a CRM?`
        ]);
      }
      if (topic === "WEB") {
        return this.pickVariation([
          `${greeting}Clean component structure, fast loading times, and responsive layouts are key for modern React and web apps. What is your preferred tech stack and timeline for this build?`,
          `${greeting}Clean design, fast loading, and smooth mobile layouts are the most important parts of any modern web app. What core features are you planning for your first version?`
        ]);
      }
      return this.pickVariation([
        `${greeting}Clean design, fast loading, and smooth mobile layouts are the most important parts of any modern web app. What is your target timeline and tech stack?`,
        `${greeting}Keeping your database and code simple early on is the best way to ship fast. What core features are you planning for your first version?`
      ]);
    }

    // ============================================================
    // MODE 2: FOUNDER (First-Person Perspective, Founder Link ONLY)
    // NEVER pushes company website when acting as Founder (except Facebook where LinkedIn is blocked)
    // ============================================================
    if (identity === "FOUNDER") {
      if (topic === "HOSPITALITY") {
        return this.enforceSingleUrl(this.pickVariation([
          `${greeting}I'm ${founderName}, ${founderRole} at ${companyName}. We built PixelGo HMS (${pixelgoUrl}) to help hotel and resort owners manage bookings, front desk, and billing in one simple system. Feel free to connect directly if you'd like a quick walkthrough!`,
          `${greeting}For hotel operations, having bookings, check-ins, and billing all in one clean tool saves hours every day. I built PixelGo HMS (${pixelgoUrl}) for simple property management. Message me anytime!`
        ]), pixelgoUrl);
      }

      if (topic === "WEB") {
        return this.enforceSingleUrl(this.pickVariation([
          `${greeting}I'd love to help build this! I'm ${founderName}, software engineer and ${founderRole} at ${companyName}. I specialize in React, Next.js, and modern full-stack web applications with clean code and fast turnaround. Connect with me ${founderConnectLabel} or send a DM to talk through your project scope!`,
          `${greeting}I can definitely help with your React and web applications! I build fast, clean, and responsive web apps. Feel free to connect with me ${founderConnectLabel} or drop a DM and let's discuss your project requirements!`,
          `${greeting}If you're looking for a React developer who writes clean, maintainable code and ships fast, let's connect! You can reach me directly ${founderConnectLabel} or message me with your project details.`
        ]), founderLink);
      }

      if (topic === "MOBILE") {
        return this.enforceSingleUrl(this.pickVariation([
          `${greeting}I can definitely help you build this! I'm ${founderName}, software engineer and ${founderRole} at ${companyName}. We build fast Flutter mobile apps for both iOS and Android. Connect with me ${founderConnectLabel} or send a DM with your app idea!`,
          `${greeting}Building a mobile app with Flutter gives you great performance on both iOS and Android from one codebase. Connect with me ${founderConnectLabel} and let's talk through your project!`
        ]), founderLink);
      }

      if (topic === "AI") {
        return this.enforceSingleUrl(this.pickVariation([
          `${greeting}I build custom AI automations and reliable business workflows. Feel free to connect ${founderConnectLabel} or send a DM to discuss what you'd like to automate!`,
          `${greeting}Building reliable AI automations and smart workflows is my main focus as a founder. Connect with me ${founderConnectLabel}. What repetitive tasks are you looking to automate?`
        ]), founderLink);
      }

      if (topic === "SAAS") {
        return this.enforceSingleUrl(this.pickVariation([
          `${greeting}I help founders design and build scalable SaaS platforms and MVPs. Connect with me ${founderConnectLabel} to talk through your product roadmap and core features!`,
          `${greeting}Keeping your code and database simple early on is key for shipping an MVP fast. Let's connect ${founderConnectLabel} and discuss your product launch plan!`
        ]), founderLink);
      }

      if (topic === "BUSINESS") {
        return this.enforceSingleUrl(this.pickVariation([
          `${greeting}I build custom internal tools, admin dashboards, and CRM systems for businesses. Let's connect ${founderConnectLabel} to talk through your operational workflows!`,
          `${greeting}If you need a custom CRM, dashboard, or business system built with clean architecture, reach out ${founderConnectLabel} or drop me a DM!`
        ]), founderLink);
      }

      // Founder general web / software development
      return this.enforceSingleUrl(this.pickVariation([
        `${greeting}I'd love to help you with this! I'm ${founderName}, ${founderRole} at ${companyName}. We build fast web apps, mobile apps, and custom platforms. Feel free to connect ${founderConnectLabel} or send over a DM!`,
        `${greeting}If you're looking for a developer to build this with clean code and fast delivery, let's connect! You can reach me directly ${founderConnectLabel}. What are your main goals and timeline?`
      ]), founderLink);
    }

    // ============================================================
    // MODE 3: COMPANY (Collective Voice, Company Website ONLY)
    // NEVER pushes personal LinkedIn when acting as Company
    // ============================================================
    if (identity === "COMPANY") {
      if (topic === "HOSPITALITY") {
        return this.enforceSingleUrl(this.pickVariation([
          `${greeting}For hotel and resort operations, having bookings, rooms, and payments all sync in real time saves so much headache. At ${companyName}, we built PixelGo HMS (${pixelgoUrl}) to make property management simple. What type of property do you run?`,
          `${greeting}Hotel operations run best when your front desk, bookings, and billing are all in one system. At ${companyName}, our platform PixelGo HMS (${pixelgoUrl}) was built for exactly that. Feel free to send a DM for a quick demo!`
        ]), pixelgoUrl);
      }

      if (topic === "WEB") {
        return this.enforceSingleUrl(this.pickVariation([
          `${greeting}Our engineering team at ${companyName} specializes in modern web applications using React, Next.js, and full-stack technologies. See our work and portfolio at ${companyWebsite}. Feel free to send us a DM with your project scope!`,
          `${greeting}Over at ${companyName}, we design and build custom, fast web applications and websites with clean code and responsive UI. Check our portfolio at ${companyWebsite}. Send us a DM anytime!`,
          `${greeting}We build custom websites and scalable web applications over at ${companyName}. We focus on clean code, fast loading, and reliable architecture. Explore our work at ${companyWebsite}. Let's chat via DM!`
        ]), companyWebsite);
      }

      if (topic === "MOBILE") {
        return this.enforceSingleUrl(this.pickVariation([
          `${greeting}Building mobile apps with Flutter lets you run smoothly on both iOS and Android with one codebase. At ${companyName}, we build fast, clean mobile apps. Check our work at ${companyWebsite}. Are you launching on both platforms?`,
          `${greeting}Over at ${companyName}, we build custom iOS and Android mobile apps using Flutter. We focus on clean design and fast APIs. See our portfolio at ${companyWebsite}. What features are you planning first?`
        ]), companyWebsite);
      }

      if (topic === "AI") {
        return this.enforceSingleUrl(this.pickVariation([
          `${greeting}A reliable AI workflow needs clean prompt rules and simple fallback checks. Over at ${companyName}, we build reliable AI automations for real businesses. Review our solutions at ${companyWebsite}. What tasks are you looking to automate?`,
          `${greeting}At ${companyName}, we build custom AI automations and workflows designed to run reliably without errors. Check our company work at ${companyWebsite}. Feel free to drop us a DM with your workflow details!`
        ]), companyWebsite);
      }

      if (topic === "SAAS") {
        return this.enforceSingleUrl(this.pickVariation([
          `${greeting}Keeping your code and database simple early on saves months of headache later. At ${companyName}, we build scalable SaaS platforms and MVPs for founders. Check our work at ${companyWebsite}. What core features are you building first?`,
          `${greeting}At ${companyName}, full-cycle product engineering and fast SaaS builds are our main focus. See our company work at ${companyWebsite}. What is your target launch date?`
        ]), companyWebsite);
      }

      if (topic === "BUSINESS") {
        return this.enforceSingleUrl(this.pickVariation([
          `${greeting}At ${companyName}, we build custom CRM systems, ERPs, and admin dashboards tailored to your workflows. Check our work at ${companyWebsite}. Send us a DM to discuss your setup!`,
          `${greeting}Over at ${companyName}, we build custom business software, dashboards, and internal tools. Check our portfolio at ${companyWebsite} or send a DM with your requirements!`
        ]), companyWebsite);
      }

      // Company general web / software development
      return this.enforceSingleUrl(this.pickVariation([
        `${greeting}Over at ${companyName}, we design and develop custom, modern websites and web apps. Fast loading, clean design, and great mobile support come standard. Review our work at ${companyWebsite}. What type of website or app are you planning?`,
        `${greeting}If you need a dedicated software team to build this, we'd be glad to help! At ${companyName}, we build fast web platforms and clean user interfaces. See our work at ${companyWebsite}. Send us a DM anytime!`,
        `${greeting}We build custom websites, scalable web apps, and mobile apps over at ${companyName}. We focus on clean code and reliable design. See our work at ${companyWebsite}. Let's chat via DM!`
      ]), companyWebsite);
    }

    // ============================================================
    // MODE 4: BOTH (Company Team with Founder Leadership, Max 1 Link)
    // ============================================================
    if (topic === "HOSPITALITY") {
      return this.enforceSingleUrl(
        `${greeting}For hotel and hospitality operations, our engineering team at ${companyName} built PixelGo HMS to combine room bookings, front desk, and billing into one clean system. See the platform at ${pixelgoUrl}. Feel free to reach out via DM!`,
        pixelgoUrl
      );
    }

    if (topic === "WEB") {
      return this.enforceSingleUrl(this.pickVariation([
        `${greeting}Our engineering team at ${companyName} specializes in building modern React and full-stack web applications with direct founder oversight. Check our work at ${companyWebsite}. Feel free to drop a DM with your project details!`,
        `${greeting}If you're looking for an experienced engineering team with direct founder oversight, ${companyName} builds clean, reliable web applications. See our work at ${companyWebsite}. Send a DM anytime!`
      ]), companyWebsite);
    }

    return this.enforceSingleUrl(this.pickVariation([
      `${greeting}Over at ${companyName}, our engineering team handles full-cycle development from design to launch. Check our work at ${companyWebsite}. What is your timeline and preferred tech stack?`,
      `${greeting}If you're looking for an experienced engineering team with direct founder oversight, ${companyName} builds reliable web and software systems. See our work at ${companyWebsite}. Send a DM anytime to chat!`
    ]), companyWebsite);
  }
}

const commentGenerator = new CommentGenerator();
module.exports = commentGenerator;
