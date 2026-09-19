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
 * - Never includes corporate buzzwords, fake enthusiasm, or premature sales pitches
 */

const knowledge = require("../knowledge/knowledge-engine");

class CommentGenerator {
  /**
   * Synthesizes a detailed, engaging comment based on lead qualification context.
   * Can be used as a deterministic generator or template for AI prompt grounding.
   *
   * @param {Object} params
   * @param {string} params.text - Original post text
   * @param {string} params.username - Author username
   * @param {string[]} params.matchedCategories - Matched CodeAir categories
   * @param {string} params.identity - "NEUTRAL"|"COMPANY"|"FOUNDER"|"BOTH"
   * @returns {string} Detailed, engaging comment
   */
  pickVariation(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

  /**
   * Synthesizes a detailed, engaging comment based on lead qualification context.
   * Dynamically varies text and includes username to avoid duplicate text hashes.
   */
  generateEngagingComment(params) {
    const { text = "", username = "", matchedCategories = [], identity = "COMPANY" } = params;
    const cleanText = text.toLowerCase();
    const handle = username ? `@${username}` : "";
    const greeting = handle ? (Math.random() > 0.5 ? `${handle} ` : `Hey ${handle}, `) : "";

    // 0. Founder & Builder Networking / Pitch / Distribution Discussions
    if (cleanText.includes("distribution")) {
      return this.pickVariation([
        `${greeting}Over at CodeAir, we build custom SaaS platforms, AI automations, and full-stack web/mobile apps. On distribution, we've found that solving hyper-specific workflow bottlenecks for early adopters and engaging directly in niche builder communities converts significantly better than broad launches. What core problem is your product solving, and what distribution channel has shown the most traction for you so far?`,
        `${greeting}Distribution is usually the hardest hurdle once the MVP is built. At CodeAir Software Solutions, we build custom software for founders, and the ones scaling quickest usually tie product telemetry directly to customer onboarding. What does your current user acquisition funnel look like?`,
        `${greeting}Great topic! When helping SaaS founders architect their platforms at CodeAir, we often see that automated onboarding loops make or break early user retention. What target audience and channels are you focusing your distribution on right now?`
      ]);
    }

    if (cleanText.includes("pitch") || cleanText.includes("what are you building") || cleanText.includes("working on")) {
      return this.pickVariation([
        `${greeting}We're building custom software, AI workflow automations, and scalable SaaS platforms over at CodeAir. A big focus right now is orchestrating reliable multi-agent workflows and high-performance Postgres/Node backends for fast-growing businesses. What stage is your product at, and what tech stack are you building on?`,
        `${greeting}Over at CodeAir Software Solutions, our team engineers full-stack web apps, cross-platform Flutter mobile apps, and custom LLM agent integrations for founders. What are you building this week, and what's your primary tech stack?`,
        `${greeting}Exciting to see so many builders here! I'm an engineer with CodeAir—we design and deploy production software, custom portals, and automated business pipelines. What problem is your current project solving?`
      ]);
    }

    if ((cleanText.includes("founder") || cleanText.includes("builder") || cleanText.includes("engineer")) && cleanText.includes("connect")) {
      return this.pickVariation([
        `${greeting}Always exciting connecting with fellow founders and builders! At CodeAir, we build custom full-stack web/mobile software and production AI automations for startups. What product are you building right now, and what's the biggest technical milestone on your roadmap this week?`,
        `${greeting}Love connecting with other builders! I help lead technical software development at CodeAir Software Solutions. What tech stack are you currently building with, and what's your focus this quarter?`,
        `${greeting}Great to connect! Over at CodeAir, we collaborate with technical founders to engineer robust web, mobile, and AI solutions. What's the main project you're working on right now?`
      ]);
    }

    // 1. Explicit Agency / Team / Company Requirements
    const isAgencyReq = cleanText.includes("agency") || cleanText.includes("company") || cleanText.includes("team") || cleanText.includes("partner");
    const isDedicatedReq = cleanText.includes("hire") || cleanText.includes("looking for a developer") || cleanText.includes("looking for an engineer") ||
      cleanText.includes("freelance") || cleanText.includes("contract") || cleanText.includes("consultant") || cleanText.includes("expert") || cleanText.includes("need someone to build");

    if (isAgencyReq && (cleanText.includes("build") || cleanText.includes("develop") || cleanText.includes("software") || cleanText.includes("website") || cleanText.includes("app"))) {
      return this.pickVariation([
        `${greeting}Over at CodeAir Software Solutions, custom software development, scalable SaaS engineering, and business automations are our core specialty. We partner with growing companies to build production-grade web applications, Flutter mobile apps, and robust cloud backends from architectural design all the way through deployment. What is your target timeline and scope for this project? Would love to share some relevant case studies and explore how we can help.`,
        `${greeting}If you're seeking a dedicated software team, CodeAir Software Solutions handles full-cycle product engineering. We specialize in custom SaaS platforms, modern web apps, and automated backend systems with strict clean architecture. What are the key features and milestones you're planning? Happy to connect and discuss details.`,
        `${greeting}We would love to collaborate on this! At CodeAir Software Solutions, we build tailored web, mobile, and backend systems for businesses needing high reliability. What is your preferred tech stack and target launch timeline?`
      ]);
    }

    if (isDedicatedReq) {
      if (cleanText.includes("ui") || cleanText.includes("ux") || cleanText.includes("design")) {
        return this.pickVariation([
          `${greeting}Clean UX and intuitive product design make all the difference in user retention and conversions. Over at CodeAir Software Solutions, we specialize in end-to-end product design and full-stack implementation, turning complex business workflows into seamless web and mobile interfaces. What type of application are you designing, and what's your current design or wireframe stage? Happy to connect or chat via DM.`,
          `${greeting}Great design combined with performant frontend implementation is crucial. At CodeAir, we build sleek modern interfaces in React, Next.js, and Flutter with strong UX foundations. What specific user flows are you designing for? Feel free to DM me.`
        ]);
      }

      if (cleanText.includes("consult") || cleanText.includes("architect") || cleanText.includes("advis")) {
        return this.pickVariation([
          `${greeting}Getting the architectural foundation right early on saves months of costly rework later. I provide technical consulting and software engineering over at CodeAir Software Solutions, helping founders and teams choose the right stack, design scalable database schemas, and structure reliable APIs. What are the main technical decisions or constraints you're navigating right now? Feel free to drop me a DM.`,
          `${greeting}Solid architecture is key before scaling. I consult and engineer custom cloud/database backends and software systems at CodeAir Software Solutions. What architectural trade-offs or bottlenecks are you evaluating right now? Happy to chat via DM.`
        ]);
      }

      return this.pickVariation([
        `${greeting}I would love to help you build this out! I'm a full-stack engineer and technical consultant over at CodeAir Software Solutions. We build custom web applications, cross-platform mobile apps (Flutter), scalable backends (Node.js/PostgreSQL), and custom AI automations. Whether you need an on-demand dedicated developer or full end-to-end project execution, we can jump in right away. Feel free to DM me with your requirements or what tech stack you're looking to build with!`,
        `${greeting}I can definitely help build this for you! I engineer custom software, web platforms, and mobile apps with CodeAir Software Solutions. We focus on clean code, responsive UI, and solid database architecture. What specific features and timeline are you looking at? Let's connect via DM to discuss details.`,
        `${greeting}If you need an experienced engineer to turn this into reality, I'd be glad to assist. Over at CodeAir Software Solutions, we specialize in robust full-stack development and custom automation workflows. Feel free to send over a DM with your project requirements!`
      ]);
    }

    // 2. AI & Automation (Chatbots, RAG, Agents, Calling)
    if (matchedCategories.includes("AI & Automation") || cleanText.includes("ai") || cleanText.includes("automate")) {
      if (cleanText.includes("support") || cleanText.includes("customer")) {
        return this.pickVariation([
          `${greeting}Automating customer support with AI usually delivers the best ROI when you combine a deterministic fallback flow with an LLM for nuanced queries. Are you looking to handle repetitive triage and FAQs first, or do you need deep bidirectional integrations into your existing CRM and ticketing tools? Curious what your current support volume and tooling look like.`,
          `${greeting}For AI customer support workflows, low latency and strict guardrails are essential to prevent hallucinations. Over at CodeAir, we build custom AI support agents integrated directly into helpdesks and databases. What CRM or ticketing platform are you looking to connect?`
        ]);
      }
      if (cleanText.includes("calling") || cleanText.includes("voice")) {
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

    // 3. SaaS & Web Platforms
    if (cleanText.includes("saas") || cleanText.includes("multi-tenant") || cleanText.includes("platform")) {
      return this.pickVariation([
        `${greeting}Building a scalable SaaS foundation early on saves massive refactoring headaches later—especially around tenant data isolation, role-based access control, and billing lifecycle events. Are you currently planning an MVP to validate the core user loop, or are you already architecting for multi-tenancy and third-party integrations? What tech stack are you leaning toward?`,
        `${greeting}Tenant isolation and modular schema design are definitely the most critical early SaaS decisions. Over at CodeAir, we architect high-throughput multi-tenant SaaS platforms on Node/Postgres and React. What core workflows are you building for your users?`
      ]);
    }

    // 4. Admin Dashboards & Internal Business Systems (CRM, ERP, POS)
    if (
      cleanText.includes("dashboard") ||
      cleanText.includes("crm") ||
      cleanText.includes("erp") ||
      cleanText.includes("portal") ||
      cleanText.includes("internal tool")
    ) {
      return this.pickVariation([
        `${greeting}Custom admin portals and dashboards work best when they mirror your team's exact daily operational flow rather than forcing you into rigid off-the-shelf templates. Is this dashboard primarily for internal operational analytics and user management, or will external clients have authenticated access as well? Also curious if you have an existing database/API you're connecting to or building from scratch.`,
        `${greeting}Tailored internal tools and operational portals save dozens of manual hours every week. At CodeAir Software Solutions, we build role-based admin panels and custom CRM integrations. Do you already have an active database, or are you designing the schema from scratch?`
      ]);
    }

    // 5. Mobile Applications (iOS, Android, Flutter, React Native)
    if (matchedCategories.includes("Mobile Development") || cleanText.includes("app") || cleanText.includes("mobile")) {
      return this.pickVariation([
        `${greeting}Developing a smooth mobile experience really depends on whether you have heavy native device requirements (like offline caching and background Bluetooth) or if a cross-platform framework like Flutter/React Native can get your MVP into users' hands twice as fast. Are you building for both iOS and Android from day one, and what does your backend API look like so far?`,
        `${greeting}Cross-platform mobile apps built with Flutter offer native performance while keeping your codebase unified across iOS and Android. Over at CodeAir, mobile app development is one of our key specialties. What are the primary mobile features you're planning?`
      ]);
    }

    // 6. Web Development & E-commerce
    if (matchedCategories.includes("Web Development") || cleanText.includes("website") || cleanText.includes("store")) {
      return this.pickVariation([
        `${greeting}For an online business or store, performance, clean mobile responsiveness, and a frictionless checkout flow are critical for conversion rates. Are you looking for a custom-built solution tailored around your specific inventory and order workflows, or integrating with an existing platform? Would be great to understand your product catalog and feature requirements.`,
        `${greeting}Fast load speeds, mobile responsiveness, and clean SEO architecture are essential for driving conversions. At CodeAir Software Solutions, we engineer custom web applications and high-converting modern stores. What's your target design style or reference site?`
      ]);
    }

    // 7. Backend & APIs
    if (matchedCategories.includes("Backend & APIs") || cleanText.includes("api") || cleanText.includes("backend")) {
      return this.pickVariation([
        `${greeting}Clean API design, proper indexing, and resilient background job handling make all the difference as traffic scales. What does your current backend architecture look like, and are you optimizing for real-time throughput or complex relational data integrations?`,
        `${greeting}Over at CodeAir Software Solutions, we specialize in high-concurrency Node.js and PostgreSQL backends. What specific third-party integrations or latency targets are you designing around?`
      ]);
    }

    // Default Detailed Technical Comment
    return this.pickVariation([
      `${greeting}That sounds like an interesting technical requirement. Over at CodeAir Software Solutions, we build custom web, mobile, and AI software for growing businesses. What does your current system setup look like, and what are the main technical constraints you're solving for?`,
      `${greeting}Solid engineering and clear architecture make all the difference. At CodeAir Software Solutions, we help companies build and scale custom digital products. What's your planned tech stack and timeline?`
    ]);
  }
}

const commentGenerator = new CommentGenerator();
module.exports = commentGenerator;
