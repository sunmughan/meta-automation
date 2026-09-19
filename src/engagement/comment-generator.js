/**
 * src/engagement/comment-generator.js
 * Synthesizes detailed, engaging, and contextually rich discovery comments for qualified leads.
 * Adheres strictly to the user requirement: "comment must be detailed and engaging".
 *
 * Implements communication-style.md & positioning.md:
 * - Natural, human, professional, technically insightful
 * - Acknowledges specific technical requirement
 * - Offers practical architectural or workflow insight
 * - Asks an engaging, thoughtful discovery question
 * - Strictly prevents category mismatch (e.g. mobile vs AI) using word-boundary regexes
 */

const knowledge = require("../knowledge/knowledge-engine");

class CommentGenerator {
  pickVariation(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

  /**
   * Synthesizes a detailed, engaging comment based on lead qualification context.
   * Dynamically varies text and includes username to avoid duplicate text hashes.
   *
   * @param {Object} params
   * @param {string} params.text - Original post text
   * @param {string} params.username - Author username
   * @param {string[]} params.matchedCategories - Matched CodeAir categories
   * @param {string} params.identity - "NEUTRAL"|"COMPANY"|"FOUNDER"|"BOTH"
   * @returns {string} Detailed, engaging comment
   */
  generateEngagingComment(params) {
    const { text = "", username = "", matchedCategories = [], identity = "COMPANY" } = params;
    const cleanText = text.toLowerCase();
    const handle = username ? `@${username}` : "";
    const greeting = handle ? (Math.random() > 0.5 ? `${handle} ` : `Hey ${handle}, `) : "";

    // 1. Explicit Dedicated Developer / Freelance / Agency Inquiries
    const isAgencyReq = /\b(agency|company|team|partner)\b/i.test(cleanText);
    const isDedicatedReq = /\b(hire|hiring|looking\s+for\s+a\s+developer|looking\s+for\s+an\s+engineer|freelancer?|contract|consultant|need\s+someone\s+to\s+build|dm\s+me\s+your\s+portfolio)\b/i.test(cleanText);

    // Explicit Agency Inquiries
    if (isAgencyReq && /\b(build|develop|software|website|web|app)\b/i.test(cleanText)) {
      return this.pickVariation([
        `${greeting}Over at CodeAir Software Solutions, custom software development, scalable SaaS engineering, and business automations are our core specialty. We partner with growing companies to build production-grade web applications, Flutter mobile apps, and robust cloud backends from architectural design all the way through deployment. What is your target timeline and scope for this project? Would love to share some relevant case studies and explore how we can help.`,
        `${greeting}If you're seeking a dedicated software team, CodeAir Software Solutions handles full-cycle product engineering. We specialize in custom SaaS platforms, modern web apps, and automated backend systems with strict clean architecture. What are the key features and milestones you're planning? Happy to connect and discuss details.`,
        `${greeting}We would love to collaborate on this! At CodeAir Software Solutions, we build tailored web, mobile, and backend systems for businesses needing high reliability. What is your preferred tech stack and target launch timeline?`
      ]);
    }

    // Category 1: Mobile Development (iOS, Android, Flutter, React Native)
    if (
      matchedCategories.includes("Mobile Development") ||
      /\b(mobile\s+app|flutter|react\s+native|ios\s+app|android\s+app|app\s+developer)\b/i.test(cleanText)
    ) {
      return this.pickVariation([
        `${greeting}Developing a smooth mobile experience really depends on whether you have heavy native device requirements (like offline caching and background Bluetooth) or if a cross-platform framework like Flutter/React Native can get your MVP into users' hands twice as fast. Are you building for both iOS and Android from day one, and what does your backend API look like so far?`,
        `${greeting}Cross-platform mobile apps built with Flutter offer native performance while keeping your codebase unified across iOS and Android. Over at CodeAir Software Solutions, mobile app development is one of our key specialties. What are the primary mobile features and user flows you're planning?`,
        `${greeting}I would love to help you build this out! I engineer high-performance mobile applications and backend systems at CodeAir Software Solutions. We build unified iOS and Android apps with Flutter, focusing on responsive UI, smooth state management, and reliable APIs. What's your target launch timeline? Feel free to DM me.`
      ]);
    }

    // Category 2: Web Development, Websites & E-Commerce
    if (
      matchedCategories.includes("Web Development") ||
      /\b(website|web\s+app|web\s+developer|web\s+designer|landing\s+page|ecommerce|online\s+store)\b/i.test(cleanText)
    ) {
      if (/\b(store|ecommerce|shopify|woocommerce|checkout)\b/i.test(cleanText)) {
        return this.pickVariation([
          `${greeting}For an online business or store, performance, clean mobile responsiveness, and a frictionless checkout flow are critical for conversion rates. Are you looking for a custom-built solution tailored around your specific inventory and order workflows, or integrating with an existing platform? Would be great to understand your product catalog and feature requirements.`,
          `${greeting}Fast load speeds, mobile responsiveness, and clean SEO architecture are essential for driving conversions. At CodeAir Software Solutions, we engineer custom web applications and high-converting modern stores. What's your target design style or reference site?`
        ]);
      }
      return this.pickVariation([
        `${greeting}Over at CodeAir Software Solutions, we design and develop custom, modern websites and high-performance web applications in React, Next.js, and modern CSS. Fast loading times, clean mobile responsiveness, and structured SEO are standard in every build. What type of website or platform are you looking to create, and what is your target launch date?`,
        `${greeting}I can definitely help build this for you! I engineer custom software, web platforms, and mobile apps with CodeAir Software Solutions. We focus on clean code, responsive UI, and solid database architecture. What specific features and timeline are you looking at? Let's connect via DM to discuss details.`,
        `${greeting}If you need an experienced engineer to turn this into reality, I'd be glad to assist. Over at CodeAir Software Solutions, we specialize in robust full-stack web development and clean modern interfaces. Feel free to send over a DM with your project requirements!`
      ]);
    }

    // Category 3: AI & Automation (Chatbots, RAG, Agents, Voice AI)
    if (
      matchedCategories.includes("AI & Automation") ||
      /\b(ai\s+chatbot|ai\s+agent|autonomous\s+agent|llm|rag\s+system|voice\s+ai|calling\s+agent|business\s+automation)\b/i.test(cleanText)
    ) {
      if (/\b(support|customer\s+service|helpdesk)\b/i.test(cleanText)) {
        return this.pickVariation([
          `${greeting}Automating customer support with AI usually delivers the best ROI when you combine a deterministic fallback flow with an LLM for nuanced queries. Are you looking to handle repetitive triage and FAQs first, or do you need deep bidirectional integrations into your existing CRM and ticketing tools? Curious what your current support volume and tooling look like.`,
          `${greeting}For AI customer support workflows, low latency and strict guardrails are essential to prevent hallucinations. Over at CodeAir, we build custom AI support agents integrated directly into helpdesks and databases. What CRM or ticketing platform are you looking to connect?`
        ]);
      }
      if (/\b(calling|voice|telephony)\b/i.test(cleanText)) {
        return this.pickVariation([
          `${greeting}Voice and AI calling architectures have evolved a lot recently—the main technical challenges usually come down to ultra-low latency audio streaming and handling unexpected caller interruptions gracefully. Are you aiming for inbound customer service, outbound qualification calls, or a hybrid setup? Would love to hear more about your target call flow.`,
          `${greeting}Low latency streaming and natural interruption handling make all the difference in voice AI agents. At CodeAir, we build custom voice and telephony automation pipelines. What telephony provider (Twilio, Vonage, etc.) are you integrating with?`
        ]);
      }
      return this.pickVariation([
        `${greeting}Building a reliable AI workflow generally hinges on how cleanly you structure your context retrieval and prompt guardrails so the agent doesn't hallucinate on edge cases. What does your current data pipeline or workflow look like, and which specific bottlenecks are you hoping to automate first?`,
        `${greeting}Over at CodeAir Software Solutions, we build deterministic multi-agent systems and custom LLM integrations. The biggest gains usually come from automating repetitive data entry and document triage. What repetitive steps in your workflow are you aiming to automate?`
      ]);
    }

    // Category 4: SaaS Platforms & MVPs
    if (
      matchedCategories.includes("SaaS development") ||
      /\b(saas|multi[- ]?tenant|mvp)\b/i.test(cleanText)
    ) {
      return this.pickVariation([
        `${greeting}Building a scalable SaaS foundation early on saves massive refactoring headaches later—especially around tenant data isolation, role-based access control, and billing lifecycle events. Are you currently planning an MVP to validate the core user loop, or are you already architecting for multi-tenancy and third-party integrations? What tech stack are you leaning toward?`,
        `${greeting}Tenant isolation and modular schema design are definitely the most critical early SaaS decisions. Over at CodeAir, we architect high-throughput multi-tenant SaaS platforms on Node/Postgres and React. What core workflows are you building for your users?`
      ]);
    }

    // Category 5: Business Systems & Dashboards (CRM, ERP, POS, Portals)
    if (
      matchedCategories.includes("Business Systems") ||
      /\b(crm|erp|pos|dashboard|admin\s+portal|internal\s+tool)\b/i.test(cleanText)
    ) {
      return this.pickVariation([
        `${greeting}Custom admin portals and dashboards work best when they mirror your team's exact daily operational flow rather than forcing you into rigid off-the-shelf templates. Is this dashboard primarily for internal operational analytics and user management, or will external clients have authenticated access as well? Also curious if you have an existing database/API you're connecting to or building from scratch.`,
        `${greeting}Tailored internal tools and operational portals save dozens of manual hours every week. At CodeAir Software Solutions, we build role-based admin panels and custom CRM integrations. Do you already have an active database, or are you designing the schema from scratch?`
      ]);
    }

    // Category 6: Backend & APIs
    if (
      matchedCategories.includes("Backend & APIs") ||
      /\b(apis?|backend|database|postgres|node\.?js|laravel)\b/i.test(cleanText)
    ) {
      return this.pickVariation([
        `${greeting}Clean API design, proper indexing, and resilient background job handling make all the difference as traffic scales. What does your current backend architecture look like, and are you optimizing for real-time throughput or complex relational data integrations?`,
        `${greeting}Over at CodeAir Software Solutions, we specialize in high-concurrency Node.js and PostgreSQL backends. What specific third-party integrations or latency targets are you designing around?`
      ]);
    }

    // Default Dedicated Developer Response for Qualified Leads
    return this.pickVariation([
      `${greeting}I would love to help you build this out! I'm an engineer over at CodeAir Software Solutions. We build custom web applications, cross-platform mobile apps (Flutter), scalable backends (Node.js/PostgreSQL), and custom AI automations. Whether you need an on-demand dedicated developer or full project execution, we can jump in right away. Feel free to DM me with your requirements!`,
      `${greeting}Solid engineering and clear architecture make all the difference. At CodeAir Software Solutions, we help companies build and scale custom digital products. What's your planned tech stack and timeline? Feel free to connect via DM.`
    ]);
  }
}

const commentGenerator = new CommentGenerator();
module.exports = commentGenerator;
