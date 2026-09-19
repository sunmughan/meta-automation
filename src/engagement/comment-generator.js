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
    // MODE 1: NEUTRAL (Pure Technical Value, Zero Promotional Links)
    // ============================================================
    if (identity === "NEUTRAL") {
      if (cleanText.includes("mobile") || cleanText.includes("app") || cleanText.includes("flutter")) {
        return this.pickVariation([
          `${greeting}When architecting a mobile app from scratch, deciding between a cross-platform engine like Flutter versus fully native Swift/Kotlin usually comes down to whether you have heavy background hardware sensor requirements. What core features are you building first?`,
          `${greeting}For a cross-platform mobile build, structuring clean state management and decoupling offline storage from network layers early on will save massive refactoring down the line. Are you planning for both iOS and Android from day one?`
        ]);
      }
      if (cleanText.includes("ai") || cleanText.includes("llm") || cleanText.includes("bot")) {
        return this.pickVariation([
          `${greeting}For production AI workflows, combining deterministic fallback logic with strict context retrieval guardrails is essential to prevent hallucinations and latency spikes. What specific operational task are you looking to automate?`,
          `${greeting}The biggest ROI in AI automation usually comes from structuring clean API pipelines and prompt guardrails before scaling. Are you looking to integrate with an existing database or CRM?`
        ]);
      }
      return this.pickVariation([
        `${greeting}Clean architecture, responsive mobile layouts, and snappy load times are the foundational pillars of any modern web platform. What is your target timeline and preferred tech stack for this project?`,
        `${greeting}Structuring database schemas and API boundaries cleanly from day one makes future feature scaling much smoother. What specific functionality are you aiming to launch with your MVP?`
      ]);
    }

    // ============================================================
    // MODE 2: FOUNDER (First-Person Perspective, Founder Link ONLY)
    // NEVER pushes company website when acting as Founder
    // ============================================================
    if (identity === "FOUNDER") {
      if (isHospitality) {
        return this.enforceSingleUrl(this.pickVariation([
          `${greeting}I'm Sunmughan, software architect and founder behind CodeAir. We specialize in custom web and management systems, and engineered PixelGo HMS specifically for unified hotel PMS and POS operations. You can explore our hospitality system at ${pixelgoUrl} or feel free to message me here with your property requirements!`,
          `${greeting}For hospitality operations, having unified reservations, front-desk dispatch, and billing without third-party middleware lag is crucial. I designed PixelGo HMS (${pixelgoUrl}) for modern property management. Feel free to connect directly if you'd like a quick walkthrough!`
        ]), pixelgoUrl);
      }

      if (cleanText.includes("mobile") || cleanText.includes("flutter")) {
        return this.enforceSingleUrl(this.pickVariation([
          `${greeting}I can definitely help guide or build this out for you. As a technical architect, I specialize in full-stack product engineering and unified cross-platform mobile apps with Flutter. You can connect with me directly on LinkedIn at ${founderLinkedin} or send over a DM with your app specifications!`,
          `${greeting}Developing a smooth mobile experience with Flutter ensures high performance across both iOS and Android from a single clean codebase. Connect with me on LinkedIn at ${founderLinkedin} and let's discuss your project scope and milestones!`
        ]), founderLinkedin);
      }

      if (cleanText.includes("ai") || cleanText.includes("agent") || cleanText.includes("automation")) {
        return this.enforceSingleUrl(this.pickVariation([
          `${greeting}I specialize in building production-grade AI automations, autonomous agent workflows, and LLM integrations with strict reliability guardrails. Feel free to connect with me directly on LinkedIn at ${founderLinkedin} to talk through your architecture and use case!`,
          `${greeting}Architecting resilient AI workflows and business automations is my primary focus as a technical founder. You can review my background and connect with me at ${founderLinkedin}. What specific manual bottlenecks are you looking to automate?`
        ]), founderLinkedin);
      }

      // Founder general web / software development
      return this.enforceSingleUrl(this.pickVariation([
        `${greeting}I'd be glad to assist you with this! I'm Sunmughan, technical founder and software architect. I help businesses design and engineer high-performance web applications and custom digital platforms. Feel free to connect with me directly on LinkedIn at ${founderLinkedin} or DM me with your project requirements!`,
        `${greeting}If you're looking for an experienced technical engineer to bring this project to life with clean architecture and fast delivery, let's talk. You can reach me directly on LinkedIn at ${founderLinkedin}. What are your primary goals and timeline for this build?`
      ]), founderLinkedin);
    }

    // ============================================================
    // MODE 3: COMPANY (Collective Voice, Company Website ONLY)
    // NEVER pushes personal LinkedIn when acting as Company
    // ============================================================
    if (identity === "COMPANY") {
      if (isHospitality) {
        return this.enforceSingleUrl(this.pickVariation([
          `${greeting}For hotel and hospitality operations, having real-time synchronized room inventory, front desk PMS, POS, and guest check-ins makes all the difference. At CodeAir Software Solutions, our flagship platform PixelGo HMS is built specifically for unified property management. Explore the system at ${pixelgoUrl}. What type of property are you managing?`,
          `${greeting}Hospitality operations run best on a synchronized operational engine without middleware lag. At CodeAir Software Solutions, we engineered PixelGo HMS (${pixelgoUrl}) to power unified front-desk, reservation, and billing workflows. Feel free to send over a DM to explore tailored setup options!`
        ]), pixelgoUrl);
      }

      if (cleanText.includes("mobile") || cleanText.includes("flutter")) {
        return this.enforceSingleUrl(this.pickVariation([
          `${greeting}Cross-platform mobile apps built with Flutter offer native performance while keeping your codebase unified across iOS and Android. At CodeAir Software Solutions, we engineer responsive mobile apps with clean state management and secure backends. Check our company work at ${companyWebsite}. Are you planning for both mobile platforms from day one?`,
          `${greeting}Over at CodeAir Software Solutions, mobile app engineering is one of our core specialties. We build scalable iOS and Android apps with Flutter, focusing on responsive UI and reliable APIs. Explore our portfolio at ${companyWebsite}. What are the primary mobile features you're planning?`
        ]), companyWebsite);
      }

      if (cleanText.includes("ai") || cleanText.includes("automation")) {
        return this.enforceSingleUrl(this.pickVariation([
          `${greeting}Building a reliable AI workflow hinges on how cleanly you structure context retrieval, latency, and prompt guardrails. Over at CodeAir Software Solutions, we engineer deterministic multi-agent systems and custom LLM integrations. You can review our company solutions at ${companyWebsite}. What specific operational bottlenecks are you looking to automate?`,
          `${greeting}At CodeAir Software Solutions, we architect custom AI automations and autonomous workflows designed for zero hallucination and high reliability. Explore our company solutions at ${companyWebsite}. Feel free to drop us a DM with your workflow details!`
        ]), companyWebsite);
      }

      if (cleanText.includes("saas") || cleanText.includes("mvp")) {
        return this.enforceSingleUrl(this.pickVariation([
          `${greeting}Building a scalable SaaS foundation early on saves massive refactoring headaches later—especially around tenant data isolation, role-based access control, and billing lifecycle events. Over at CodeAir Software Solutions, we architect high-throughput multi-tenant SaaS platforms and MVPs. Review our work at ${companyWebsite}. What core workflows are you building?`,
          `${greeting}At CodeAir Software Solutions, full-cycle product engineering and scalable SaaS architecture are our primary focus. Explore our company credentials at ${companyWebsite}. What is your target launch timeline and scope?`
        ]), companyWebsite);
      }

      // Company general web / software development
      return this.enforceSingleUrl(this.pickVariation([
        `${greeting}Over at CodeAir Software Solutions, we design and develop custom, modern websites and high-performance web applications in React, Next.js, and modern CSS. Fast loading times, clean mobile responsiveness, and structured SEO are standard in every build. You can review our work and case studies at ${companyWebsite}. What type of website are you looking to create?`,
        `${greeting}If you need a dedicated software engineering team to turn this into reality, we'd be glad to assist! At CodeAir Software Solutions, we specialize in robust full-stack web development and clean modern interfaces. You can view our company credentials at ${companyWebsite}. Feel free to send over a DM with your project requirements!`,
        `${greeting}We engineer custom websites, scalable web platforms, and mobile apps over at CodeAir Software Solutions. We focus on clean code, responsive UI, and solid database architecture. Explore our company portfolio at ${companyWebsite}. Let's connect via DM to discuss details!`
      ]), companyWebsite);
    }

    // ============================================================
    // MODE 4: BOTH (Company Team with Founder Leadership, Max 1 Link)
    // ============================================================
    if (isHospitality) {
      return this.enforceSingleUrl(
        `${greeting}For hotel and hospitality operations, our engineering team at CodeAir Software Solutions built PixelGo HMS to unify real-time room sync, front desk PMS, POS, and billing. You can explore the platform at ${pixelgoUrl}. Feel free to reach out via DM with your property requirements!`,
        pixelgoUrl
      );
    }

    return this.enforceSingleUrl(this.pickVariation([
      `${greeting}Over at CodeAir Software Solutions, our dedicated engineering team handles full-cycle product development—from architectural design through deployment. Review our work and case studies at ${companyWebsite}. What is your target timeline and preferred tech stack for this project?`,
      `${greeting}If you're seeking an experienced engineering team with direct founder-led technical oversight, CodeAir Software Solutions builds production-grade web and software systems. Check out our work at ${companyWebsite}. Feel free to send a DM to discuss your milestones!`
    ]), companyWebsite);
  }
}

const commentGenerator = new CommentGenerator();
module.exports = commentGenerator;
