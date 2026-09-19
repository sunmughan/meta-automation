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
        `${greeting}Over at CodeAir Software Solutions (https://www.codeair.tech), custom software development, scalable SaaS engineering, and business automations are our core specialty. We partner with growing companies to build production-grade web applications, Flutter mobile apps, and robust cloud backends from architectural design all the way through deployment. You can view our verified company portfolio at https://www.codeair.tech and connect directly with our founder at https://www.linkedin.com/in/sunmughan/. What is your target timeline and scope for this project?`,
        `${greeting}If you're seeking a dedicated software team, CodeAir Software Solutions (https://www.codeair.tech) handles full-cycle product engineering. We specialize in custom SaaS platforms, modern web apps, and automated backend systems with strict clean architecture. Check out our work at https://www.codeair.tech or connect with our founder on LinkedIn at https://www.linkedin.com/in/sunmughan/. Happy to discuss milestones and share relevant case studies in DM!`,
        `${greeting}We would love to collaborate on this! At CodeAir Software Solutions (https://www.codeair.tech), we build tailored web, mobile, and backend systems for businesses needing high reliability. Explore our live portfolio at https://www.codeair.tech and feel free to connect with our founder at https://www.linkedin.com/in/sunmughan/. What is your preferred tech stack and launch timeline?`
      ]);
    }

    // Category 1: Mobile Development (iOS, Android, Flutter, React Native)
    if (
      matchedCategories.includes("Mobile Development") ||
      /\b(mobile\s+app|flutter|react\s+native|ios\s+app|android\s+app|app\s+developer)\b/i.test(cleanText)
    ) {
      return this.pickVariation([
        `${greeting}Developing a smooth mobile experience really depends on whether you have heavy native device requirements or if a cross-platform framework like Flutter can get your MVP into users' hands twice as fast. Over at CodeAir Software Solutions (https://www.codeair.tech), mobile app engineering is one of our key specialties. You can review our company builds at https://www.codeair.tech and connect with our founder at https://www.linkedin.com/in/sunmughan/. Are you building for both iOS and Android from day one?`,
        `${greeting}Cross-platform mobile apps built with Flutter offer native performance while keeping your codebase unified across iOS and Android. At CodeAir Software Solutions (https://www.codeair.tech), we engineer responsive mobile apps with clean state management and secure backends. Check our work at https://www.codeair.tech or reach our founder at https://www.linkedin.com/in/sunmughan/. What are the primary mobile features you're planning?`,
        `${greeting}I would love to help you build this out! Over at CodeAir Software Solutions (https://www.codeair.tech), we build unified iOS and Android apps with Flutter, focusing on responsive UI, smooth state management, and reliable APIs. Explore our portfolio at https://www.codeair.tech and connect with our founder at https://www.linkedin.com/in/sunmughan/. Feel free to send over a DM with your project scope!`
      ]);
    }

    // Category 2: Web Development, Websites & E-Commerce
    if (
      matchedCategories.includes("Web Development") ||
      /\b(website|web\s+app|web\s+developer|web\s+designer|landing\s+page|ecommerce|online\s+store)\b/i.test(cleanText)
    ) {
      if (/\b(store|ecommerce|shopify|woocommerce|checkout)\b/i.test(cleanText)) {
        return this.pickVariation([
          `${greeting}For an online store, ultra-fast load speeds, clean mobile responsiveness, and a frictionless checkout flow are critical for conversion rates. Over at CodeAir Software Solutions (https://www.codeair.tech), we build custom modern e-commerce stores and high-converting web applications. You can review our live portfolio at https://www.codeair.tech and connect with our founder at https://www.linkedin.com/in/sunmughan/. What's your target product catalog and design reference?`,
          `${greeting}Fast load speeds, mobile responsiveness, and clean SEO architecture are essential for driving conversions. At CodeAir Software Solutions (https://www.codeair.tech), we engineer custom web applications and high-converting modern stores. Explore our portfolio at https://www.codeair.tech or connect with our founder at https://www.linkedin.com/in/sunmughan/. What specific features and timeline are you looking at?`
        ]);
      }
      return this.pickVariation([
        `${greeting}Over at CodeAir Software Solutions (https://www.codeair.tech), we design and develop custom, modern websites and high-performance web applications in React, Next.js, and modern CSS. Fast loading times, clean mobile responsiveness, and structured SEO are standard in every build. You can review our work and case studies at https://www.codeair.tech and connect with our founder directly at https://www.linkedin.com/in/sunmughan/. What type of website are you looking to create?`,
        `${greeting}If you need an experienced engineer or dedicated team to turn this into reality, we'd be glad to assist! At CodeAir Software Solutions (https://www.codeair.tech), we specialize in robust full-stack web development and clean modern interfaces. You can view our company credentials at https://www.codeair.tech and connect with our founder at https://www.linkedin.com/in/sunmughan/. Feel free to send over a DM with your project requirements!`,
        `${greeting}I can definitely help build this for you! We engineer custom websites, web platforms, and mobile apps with CodeAir Software Solutions (https://www.codeair.tech). We focus on clean code, responsive UI, and solid database architecture. Explore our portfolio at https://www.codeair.tech or connect with our founder at https://www.linkedin.com/in/sunmughan/. Let's connect via DM to discuss details.`
      ]);
    }

    // Category 3: AI & Automation (Chatbots, RAG, Agents, Voice AI)
    if (
      matchedCategories.includes("AI & Automation") ||
      /\b(ai\s+chatbot|ai\s+agent|autonomous\s+agent|llm|rag\s+system|voice\s+ai|calling\s+agent|business\s+automation)\b/i.test(cleanText)
    ) {
      if (/\b(support|customer\s+service|helpdesk)\b/i.test(cleanText)) {
        return this.pickVariation([
          `${greeting}Automating customer support with AI delivers the best ROI when combining deterministic flows with LLM reasoning. Over at CodeAir Software Solutions (https://www.codeair.tech), we build custom AI support agents integrated directly into CRMs and databases with strict guardrails against hallucination. Check our AI solutions at https://www.codeair.tech and connect with our founder at https://www.linkedin.com/in/sunmughan/. What ticketing platform are you connecting?`,
          `${greeting}For AI customer support workflows, low latency and strict guardrails are essential to prevent hallucinations. Over at CodeAir Software Solutions (https://www.codeair.tech), we build custom AI support agents. You can check our portfolio at https://www.codeair.tech or connect with our founder at https://www.linkedin.com/in/sunmughan/. What CRM or ticketing tool are you using?`
        ]);
      }
      return this.pickVariation([
        `${greeting}Building a reliable AI workflow hinges on how cleanly you structure context retrieval, latency, and prompt guardrails. Over at CodeAir Software Solutions (https://www.codeair.tech), we build deterministic multi-agent systems, AI chatbots, and custom LLM integrations. You can review our company work at https://www.codeair.tech and connect with our founder at https://www.linkedin.com/in/sunmughan/. What specific bottlenecks are you looking to automate?`,
        `${greeting}Over at CodeAir Software Solutions (https://www.codeair.tech), we architect custom AI automations and autonomous workflows. The biggest ROI usually comes from automating repetitive triage and manual data tasks. Explore our solutions at https://www.codeair.tech or reach out to our founder on LinkedIn at https://www.linkedin.com/in/sunmughan/. Let's connect via DM!`
      ]);
    }

    // Category 4: SaaS Platforms & MVPs
    if (
      matchedCategories.includes("SaaS development") ||
      /\b(saas|multi[- ]?tenant|mvp)\b/i.test(cleanText)
    ) {
      return this.pickVariation([
        `${greeting}Building a scalable SaaS foundation early on saves massive refactoring headaches later—especially around tenant data isolation, role-based access control, and billing lifecycle events. Over at CodeAir Software Solutions (https://www.codeair.tech), we architect high-throughput multi-tenant SaaS platforms and MVPs. Review our work at https://www.codeair.tech and connect with our founder at https://www.linkedin.com/in/sunmughan/. What tech stack are you leaning toward?`,
        `${greeting}Tenant isolation and modular schema design are the most critical early SaaS decisions. At CodeAir Software Solutions (https://www.codeair.tech), we architect multi-tenant SaaS systems on Node/Postgres and React. Check our portfolio at https://www.codeair.tech and connect with our founder at https://www.linkedin.com/in/sunmughan/. What core workflows are you building?`
      ]);
    }

    // Category 5: Business Systems & Dashboards (CRM, ERP, POS, Portals, Hospital/HMS)
    if (
      matchedCategories.includes("Business Systems") ||
      /\b(crm|erp|pos|dashboard|admin\s+portal|internal\s+tool|hospital|clinic|healthcare)\b/i.test(cleanText)
    ) {
      const isHealth = /\b(hospital|clinic|healthcare|patient|doctor)\b/i.test(cleanText);
      if (isHealth) {
        return `${greeting}Over at CodeAir Software Solutions, we engineered PixelGo HMS (https://pixelgo.live), a complete hospital and healthcare management system covering patient admissions, billing, electronic health records, and analytics. You can view our flagship HMS platform at https://pixelgo.live and explore CodeAir at https://www.codeair.tech. Connect with our founder at https://www.linkedin.com/in/sunmughan/ to discuss how we can tailor this for your facility!`;
      }
      return this.pickVariation([
        `${greeting}Custom admin portals and dashboards work best when they mirror your team's exact daily operational flow. Over at CodeAir Software Solutions (https://www.codeair.tech), we build role-based admin panels, custom CRM workflows, and enterprise dashboards. Explore our work at https://www.codeair.tech and connect with our founder at https://www.linkedin.com/in/sunmughan/. What database or integrations are you planning?`,
        `${greeting}Tailored internal tools and operational portals save dozens of manual hours every week. At CodeAir Software Solutions (https://www.codeair.tech), we build role-based admin panels and custom business systems. Check our portfolio at https://www.codeair.tech or connect with our founder at https://www.linkedin.com/in/sunmughan/. Let's connect via DM!`
      ]);
    }

    // Category 6: Backend & APIs
    if (
      matchedCategories.includes("Backend & APIs") ||
      /\b(apis?|backend|database|postgres|node\.?js|laravel)\b/i.test(cleanText)
    ) {
      return this.pickVariation([
        `${greeting}Clean API design, proper indexing, and resilient background job handling make all the difference as traffic scales. Over at CodeAir Software Solutions (https://www.codeair.tech), we specialize in high-concurrency Node.js and PostgreSQL backends. You can review our case studies at https://www.codeair.tech and connect with our founder at https://www.linkedin.com/in/sunmughan/. What third-party integrations are you designing around?`,
        `${greeting}Solid backend architecture and low latency are our core specialty at CodeAir Software Solutions (https://www.codeair.tech). Explore our portfolio at https://www.codeair.tech and connect with our founder at https://www.linkedin.com/in/sunmughan/. What specific latency or scale targets are you planning for?`
      ]);
    }

    // Default Dedicated Developer Response for Qualified Leads
    return this.pickVariation([
      `${greeting}I would love to help you build this out! We engineer custom software, web platforms, mobile apps (Flutter), and business automations over at CodeAir Software Solutions (https://www.codeair.tech). You can review our company portfolio and verified builds directly at https://www.codeair.tech and connect with our founder at https://www.linkedin.com/in/sunmughan/. Feel free to send over a DM with your requirements!`,
      `${greeting}Solid engineering and clean architecture make all the difference. At CodeAir Software Solutions (https://www.codeair.tech), we help companies build and scale custom digital products. Check out our portfolio at https://www.codeair.tech and connect with our founder at https://www.linkedin.com/in/sunmughan/. Feel free to connect via DM!`
    ]);
  }
}

const commentGenerator = new CommentGenerator();
module.exports = commentGenerator;
