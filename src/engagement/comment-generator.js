/**
 * src/engagement/comment-generator.js
 * Synthesizes detailed, engaging, and contextually rich discovery comments for qualified leads.
 * Adheres strictly to identity representation standards & positioning guidelines:
 *
 * IDENTITY RULES:
 * 1. "FOUNDER": Written in first-person ("I", "as a founder & architect").
 *    Shares Sunmughan's personal profile (LinkedIn) ONLY. NEVER includes company website.
 * 2. "COMPANY": Written in collective company voice ("We at CodeAir Software Solutions").
 *    Shares company website (https://www.codeair.tech) ONLY. NEVER includes personal founder link.
 * 3. "NEUTRAL": Pure technical value, architectural advice, or diagnostic question.
 *    ZERO promotional links.
 * 4. "BOTH": Introduces CodeAir engineering team with founder oversight.
 *    Single primary link (company website).
 *
 * STRICT URL DISCIPLINE:
 * - At most ONE (1) URL per comment across all modes.
 * - PixelGo HMS (https://pixelgo.live) ONLY for explicit hospitality/hotel/resort/restaurant requests.
 * - Links are dynamically resolved from knowledge/profiles.md via knowledgeEngine.
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

    // Resolve official links dynamically from knowledge base (single source of truth)
    const companyWebsite = knowledge.getProfileLink("COMPANY", "website") || "https://www.codeair.tech";
    const pixelgoUrl = knowledge.getProfileLink("COMPANY", "pixelgo") || "https://pixelgo.live";
    const founderLinkedin = knowledge.getProfileLink("FOUNDER", "linkedin") || "https://www.linkedin.com/in/sunmughan/";

    const isHospitality = knowledge.isHospitalityQuery(cleanText) || matchedCategories.includes("Hospitality");

    // ============================================================
    // ============================================================
    // MODE 1: NEUTRAL (Pure Technical Value, Zero Promotional Links)
    // ============================================================
    if (identity === "NEUTRAL") {
      if (cleanText.includes("mobile") || cleanText.includes("app") || cleanText.includes("flutter")) {
        return this.pickVariation([
          `${greeting}When building a mobile app from scratch, choosing Flutter lets you launch on both iOS and Android with one clean codebase. What features are you building first?`,
          `${greeting}For a mobile app build, keeping your database and offline storage simple early on will save weeks of refactoring later. Are you launching on both iOS and Android?`
        ]);
      }
      if (cleanText.includes("ai") || cleanText.includes("llm") || cleanText.includes("bot")) {
        return this.pickVariation([
          `${greeting}When building AI workflows, clear prompt rules and testing with real data are what make it reliable in production. What specific task are you looking to automate?`,
          `${greeting}The biggest win in AI automation comes from keeping your APIs clean and testing edge cases early. Are you connecting this to a database or a CRM?`
        ]);
      }
      return this.pickVariation([
        `${greeting}Clean design, fast loading, and smooth mobile layouts are the most important parts of any modern web app. What is your target timeline and tech stack?`,
        `${greeting}Keeping your database and code simple early on is the best way to ship fast. What core features are you planning for your first version?`
      ]);
    }

    // ============================================================
    // MODE 2: FOUNDER (First-Person Perspective, Founder Link ONLY)
    // NEVER pushes company website when acting as Founder
    // ============================================================
    if (identity === "FOUNDER") {
      if (isHospitality) {
        return this.enforceSingleUrl(this.pickVariation([
          `${greeting}I'm Sunmughan, founder and tech architect behind CodeAir. We built PixelGo HMS (${pixelgoUrl}) to help hotel and resort owners manage bookings, front desk, and billing in one simple system. Feel free to connect directly if you'd like a quick walkthrough!`,
          `${greeting}For hotel operations, having bookings, check-ins, and billing all in one clean tool saves hours every day. I designed PixelGo HMS (${pixelgoUrl}) for simple property management. Message me anytime!`
        ]), pixelgoUrl);
      }

      if (cleanText.includes("mobile") || cleanText.includes("flutter")) {
        return this.enforceSingleUrl(this.pickVariation([
          `${greeting}I can definitely help you build this! I'm Sunmughan, software engineer and founder at CodeAir. We build fast Flutter mobile apps for both iOS and Android. Connect with me on LinkedIn at ${founderLinkedin} or send a DM with your app idea!`,
          `${greeting}Building a mobile app with Flutter gives you great performance on both iOS and Android from one codebase. Connect with me on LinkedIn at ${founderLinkedin} and let's talk through your project!`
        ]), founderLinkedin);
      }

      if (cleanText.includes("ai") || cleanText.includes("agent") || cleanText.includes("automation")) {
        return this.enforceSingleUrl(this.pickVariation([
          `${greeting}I build custom AI automations and reliable workflows for businesses. Let's connect on LinkedIn at ${founderLinkedin} to talk through what you want to automate!`,
          `${greeting}Building reliable AI automations and simple workflows is my main focus as a founder. Connect with me on LinkedIn at ${founderLinkedin}. What repetitive tasks are you looking to automate?`
        ]), founderLinkedin);
      }

      // Founder general web / software development
      return this.enforceSingleUrl(this.pickVariation([
        `${greeting}I'd love to help you with this! I'm Sunmughan, founder and software engineer at CodeAir. We build fast web apps, mobile apps, and custom platforms. Feel free to connect on LinkedIn at ${founderLinkedin} or send over a DM!`,
        `${greeting}If you're looking for a developer to build this with clean code and fast delivery, let's connect! You can reach me directly on LinkedIn at ${founderLinkedin}. What are your main goals and timeline?`
      ]), founderLinkedin);
    }

    // ============================================================
    // MODE 3: COMPANY (Collective Voice, Company Website ONLY)
    // NEVER pushes personal LinkedIn when acting as Company
    // ============================================================
    if (identity === "COMPANY") {
      if (isHospitality) {
        return this.enforceSingleUrl(this.pickVariation([
          `${greeting}For hotel and resort operations, having bookings, rooms, and payments all sync in real time saves so much headache. At CodeAir Software Solutions, we built PixelGo HMS (${pixelgoUrl}) to make property management simple. What type of property do you run?`,
          `${greeting}Hotel operations run best when your front desk, bookings, and billing are all in one system. At CodeAir Software Solutions, our platform PixelGo HMS (${pixelgoUrl}) was built for exactly that. Feel free to send a DM for a quick demo!`
        ]), pixelgoUrl);
      }

      if (cleanText.includes("mobile") || cleanText.includes("flutter")) {
        return this.enforceSingleUrl(this.pickVariation([
          `${greeting}Building mobile apps with Flutter lets you run smoothly on both iOS and Android with one codebase. At CodeAir Software Solutions, we build fast, clean mobile apps. Check our work at ${companyWebsite}. Are you launching on both platforms?`,
          `${greeting}Over at CodeAir Software Solutions, we build custom iOS and Android mobile apps using Flutter. We focus on clean design and fast APIs. See our portfolio at ${companyWebsite}. What features are you planning first?`
        ]), companyWebsite);
      }

      if (cleanText.includes("ai") || cleanText.includes("automation")) {
        return this.enforceSingleUrl(this.pickVariation([
          `${greeting}A reliable AI workflow needs clean prompt rules and simple fallback checks. Over at CodeAir Software Solutions, we build reliable AI automations for real businesses. Review our solutions at ${companyWebsite}. What tasks are you looking to automate?`,
          `${greeting}At CodeAir Software Solutions, we build custom AI automations and workflows designed to run reliably without errors. Check our company work at ${companyWebsite}. Feel free to drop us a DM with your workflow details!`
        ]), companyWebsite);
      }

      if (cleanText.includes("saas") || cleanText.includes("mvp")) {
        return this.enforceSingleUrl(this.pickVariation([
          `${greeting}Keeping your code and database simple early on saves months of headache later. At CodeAir Software Solutions, we build scalable SaaS platforms and MVPs for founders. Check our work at ${companyWebsite}. What core features are you building first?`,
          `${greeting}At CodeAir Software Solutions, full-cycle product engineering and fast SaaS builds are our main focus. See our company work at ${companyWebsite}. What is your target launch date?`
        ]), companyWebsite);
      }

      // Company general web / software development
      return this.enforceSingleUrl(this.pickVariation([
        `${greeting}Over at CodeAir Software Solutions, we design and develop custom, modern websites and web apps. Fast loading, clean design, and great mobile support come standard. Review our work at ${companyWebsite}. What type of website or app are you planning?`,
        `${greeting}If you need a dedicated software team to build this, we'd be glad to help! At CodeAir Software Solutions, we build fast web platforms and clean user interfaces. See our work at ${companyWebsite}. Send us a DM anytime!`,
        `${greeting}We build custom websites, scalable web apps, and mobile apps over at CodeAir Software Solutions. We focus on clean code and reliable design. See our work at ${companyWebsite}. Let's chat via DM!`
      ]), companyWebsite);
    }

    // ============================================================
    // MODE 4: BOTH (Company Team with Founder Leadership, Max 1 Link)
    // ============================================================
    if (isHospitality) {
      return this.enforceSingleUrl(
        `${greeting}For hotel and hospitality operations, our engineering team at CodeAir Software Solutions built PixelGo HMS to combine room bookings, front desk, and billing into one clean system. See the platform at ${pixelgoUrl}. Feel free to reach out via DM!`,
        pixelgoUrl
      );
    }

    return this.enforceSingleUrl(this.pickVariation([
      `${greeting}Over at CodeAir Software Solutions, our engineering team handles full-cycle development from design to launch. Check our work at ${companyWebsite}. What is your timeline and preferred tech stack?`,
      `${greeting}If you're looking for an experienced engineering team with direct founder oversight, CodeAir Software Solutions builds reliable web and software systems. See our work at ${companyWebsite}. Send a DM anytime to chat!`
    ]), companyWebsite);
  }
}

const commentGenerator = new CommentGenerator();
module.exports = commentGenerator;
