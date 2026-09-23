/**
 * src/platforms/threads/threads-media.js
 * Ultra-clean social media graphics & 5-6 slide carousel generator.
 * Stripe/x.ai/Linear/PayPal grade dark mode visuals rendered via Chromium.
 *
 * Covers 5 Core Pillars:
 * 1. PixelGo HMS (Unified Hotel Management Operations) - Every 2-3 days
 * 2. Developer Network & Revenue Sharing (Connecting software engineers)
 * 3. Startup Founders & Co-Founders (Building revolutionary products)
 * 4. Tech Mentorship & Architecture Guidance (For ambitious builders)
 * 5. Production Agentic AI & Modern Tech Trends
 */

const fs = require("fs");
const path = require("path");
const CONFIG = require("../../../config");
const renderer = require("./threads-html-renderer");
const logger = require("../../logging/logger");
const knowledge = require("../../knowledge/knowledge-engine");

const MEDIA_DIR = path.resolve(CONFIG.ROOT_DIR, "logs/media_slides");

class ThreadsMedia {
  constructor() {
    if (!fs.existsSync(MEDIA_DIR)) {
      fs.mkdirSync(MEDIA_DIR, { recursive: true });
    }
  }

  /**
   * Generates a single high-impact quote or discussion card.
   */
  async generateSingleCard(cardSpec, filename = `card_${Date.now()}.png`) {
    const outPath = path.join(MEDIA_DIR, filename);
    let html = "";
    if (cardSpec.isQuoteCard || cardSpec.quote) {
      html = renderer.generateQuoteCardHtml(cardSpec);
    } else {
      html = renderer.generateSlideHtml(cardSpec);
    }
    return await renderer.renderHtmlToImage(html, outPath);
  }

  /**
   * Generates a dark-mode terminal code snippet card.
   */
  async generateCodeSnippetCard(spec = {}, filename = `code_${Date.now()}.png`) {
    const outPath = path.join(MEDIA_DIR, filename);
    const html = renderer.generateCodeCardHtml(spec);
    return await renderer.renderHtmlToImage(html, outPath);
  }

  /**
   * Generates a system architecture topology diagram card.
   */
  async generateArchitectureCard(spec = {}, filename = `arch_${Date.now()}.png`) {
    const outPath = path.join(MEDIA_DIR, filename);
    const html = renderer.generateArchitectureCardHtml(spec);
    return await renderer.renderHtmlToImage(html, outPath);
  }

  /**
   * Generates a high-impact "Developers Connect" executive announcement card matching Image 2.
   * Features cyber lime green (#00FF66) 3D extruded title boxes, code chip, vector QR code,
   * right-side vertical spine text, and launch calendar badge.
   */
  async generateDeveloperConnectCard(spec = {}, filename = `dev_connect_${Date.now()}.png`) {
    const outPath = path.join(MEDIA_DIR, filename);
    const html = renderer.generateDeveloperConnectCardHtml(spec);
    return await renderer.renderHtmlToImage(html, outPath);
  }

  /**
   * Generates a full 5-slide carousel deck for a theme.
   * Returns array of absolute image paths.
   */
  async generateCarouselDeck(theme = "pixelgo_hms", dynamicSlides = null) {
    let deckSpecs = [];
    if (dynamicSlides && Array.isArray(dynamicSlides) && dynamicSlides.length >= 2) {
      const baseSpecs = this.getDeckSpecs(theme);
      const base0 = baseSpecs[0] || {};
      const compTag = (knowledge.getCompanyInfo().name || "COMPANY").toUpperCase().slice(0, 10);
      deckSpecs = dynamicSlides.map((s, idx) => {
        const base = baseSpecs[idx] || baseSpecs[0] || {};
        let cards = [];
        if (Array.isArray(s.cards) && s.cards.length > 0) {
          cards = s.cards;
        } else if (Array.isArray(base.cards) && base.cards.length > 0) {
          cards = base.cards;
        } else {
          cards = [
            { num: "01", title: "Architectural Rationale", desc: s.subtitle || "High-performance modular systems designed for scale." },
            { num: "02", title: "Deterministic Execution", desc: "Strict verification pipelines and real-time state synchronization." },
            { num: "03", title: "Enterprise Impact", desc: "Zero operational waste, high velocity, and production-ready reliability." }
          ];
        }
        return {
          badge: s.badge || base.badge || base0.badge || `${compTag} • ARCHITECTURE`,
          accentColor: s.accentColor || base.accentColor || base0.accentColor || "#00F0FF",
          glowColor: s.glowColor || base.glowColor || base0.glowColor || "rgba(0, 240, 255, 0.12)",
          title: s.title || base.title || `Key Insight #${idx + 1}`,
          subtitle: s.subtitle || base.subtitle || "",
          cards,
          footerTag: s.footerTag || base.footerTag || base0.footerTag || "TECH ARCHITECTURE"
        };
      });
    } else {
      deckSpecs = this.getDeckSpecs(theme);
    }
    const generatedPaths = [];
    const timestamp = Date.now();

    for (let i = 0; i < deckSpecs.length; i++) {
      const spec = deckSpecs[i];
      spec.slide_num = i + 1;
      spec.total_slides = deckSpecs.length;

      const filename = `carousel_${theme}_${timestamp}_slide_${i + 1}.png`;
      const outPath = path.join(MEDIA_DIR, filename);
      const html = renderer.generateSlideHtml(spec);
      const renderedPath = await renderer.renderHtmlToImage(html, outPath);

      if (renderedPath && fs.existsSync(renderedPath)) {
        generatedPaths.push(renderedPath);
      }
    }

    logger.info(`Generated ${generatedPaths.length}-slide Stripe-grade carousel deck for theme: ${theme}`);
    return generatedPaths;
  }

  /**
   * Generates a single visual quote/perspective card for any pillar.
   */
  async generatePillarQuoteCard(pillar = "builder_network", dynamicSpec = {}) {
    const baseSpec = this.getPillarQuoteSpec(pillar);
    const spec = {
      ...baseSpec,
      quote: dynamicSpec?.quote || baseSpec.quote,
      badge: dynamicSpec?.badge || baseSpec.badge,
      takeaways: dynamicSpec?.takeaways || baseSpec.takeaways,
      cards: dynamicSpec?.cards || baseSpec.cards
    };
    const filename = `quote_${pillar}_${Date.now()}.png`;
    return await this.generateSingleCard(spec, filename);
  }

  /**
   * Quote specs for single visual card posts.
   */
  getPillarQuoteSpec(pillar) {
    const founder = knowledge.getFounderInfo();
    const company = knowledge.getCompanyInfo();
    const compTag = (company.name || "COMPANY").toUpperCase().slice(0, 10);
    const authorName = founder.name || "Founder";
    const authorRole = `${founder.role || "Founder"}, ${company.name || "Software"}`;

    switch (pillar) {
      case "pixelgo_hms":
        return {
          isQuoteCard: true,
          badge: "PIXELGO HMS • REVOLUTION",
          accentColor: "#00F0FF",
          glowColor: "rgba(0, 240, 255, 0.16)",
          quote: "Hotel operations shouldn’t require 6 disconnected software tools. One unified reactive engine changes everything.",
          author: authorName,
          role: authorRole,
          footerTag: "HOSPITALITY TECH",
          takeaways: [
            { num: "01", title: "Single Source of Truth", desc: "Eliminates sync discrepancies between PMS, POS, channel managers & housekeeping." },
            { num: "02", title: "Automated Guest Journeys", desc: "Zero-touch contactless check-in, dynamic rate updates, and digital folios." },
            { num: "03", title: "Operational RevPAR Surge", desc: "Direct bookings without intermediary OTA commission loss." }
          ]
        };

      case "founders_revolution":
        return {
          isQuoteCard: true,
          badge: `STARTUP FOUNDERS • ${compTag}`,
          accentColor: "#7928CA",
          glowColor: "rgba(121, 40, 202, 0.18)",
          quote: "Premature microservices and AI hype kill early startups. Clean architecture and fast shipping create real market value.",
          author: authorName,
          role: authorRole,
          footerTag: "FOUNDER MINDSET",
          takeaways: [
            { num: "01", title: "Monolith Over Microservices", desc: "Keep domain boundaries simple until user scale dictates distributed complexity." },
            { num: "02", title: "Relentless Shipping Velocity", desc: "Turn real customer feedback loops into deployed features within 24 hours." },
            { num: "03", title: "Unit Economics First", desc: "Validate paying demand before investing in heavy infrastructure overhead." }
          ]
        };

      case "tech_mentorship":
        return {
          isQuoteCard: true,
          badge: "MENTORSHIP • SYSTEM DESIGN",
          accentColor: "#10B981",
          glowColor: "rgba(16, 185, 129, 0.16)",
          quote: "If you're an ambitious developer stuck on database scaling, system design, or launching your first SaaS—let’s talk.",
          author: authorName,
          role: authorRole,
          footerTag: "DEVELOPER GUIDANCE",
          takeaways: [
            { num: "01", title: "System Design Fundamentals", desc: "Master caching layers, database indexing, and event-driven architectures." },
            { num: "02", title: "Production Code Craftsmanship", desc: "Deterministic testing, clean refactoring, and zero unhandled rejections." },
            { num: "03", title: "Career & SaaS Scaling", desc: "Transition from junior tasks to architecting mission-critical platforms." }
          ]
        };

      case "agentic_ai":
        return {
          isQuoteCard: true,
          badge: "AGENTIC AI • PRODUCTION",
          accentColor: "#00F0FF",
          glowColor: "rgba(0, 240, 255, 0.16)",
          quote: "AI prompts without deterministic guardrails are just toys. Enterprise autonomy requires strict schemas and state machines.",
          author: authorName,
          role: authorRole,
          footerTag: "AI ARCHITECTURE",
          takeaways: [
            { num: "01", title: "Deterministic State Machines", desc: "Strict schema contracts prevent hallucinations and runaway agent loops." },
            { num: "02", title: "Verified Action Handshake", desc: "Every DOM mutation or API write must be verified across multiple signals." },
            { num: "03", title: "Sub-Second Ingestion", desc: "Aggressive DOM pruning ensures ultra-fast reasoning with minimal latency." }
          ]
        };

      case "meta_automation": {
        const metaUrl = knowledge.getMetaAutomationUrl();
        const metaHandle = metaUrl ? metaUrl.replace("https://", "").replace("http://", "") : "github.com";
        return {
          isQuoteCard: true,
          badge: "OPEN SOURCE • META AUTOMATION",
          accentColor: "#00F0FF",
          glowColor: "rgba(0, 240, 255, 0.18)",
          quote: "Autonomous AI doesn't need costly cloud servers. Open-source agents running locally on Linux, macOS, Windows & Termux with zero token cost change the game.",
          author: authorName,
          role: authorRole,
          footerTag: `GITHUB: ${metaHandle.toUpperCase()}`,
          takeaways: [
            { num: "01", title: "100% Free & Open-Source", desc: "Zero API token costs using local MiniMax M3 runtime reasoning." },
            { num: "02", title: "Cross-Platform Everywhere", desc: "Runs 24/7 on Android (Termux:X11), Linux, Windows & macOS." },
            { num: "03", title: "Community Star & Fork", desc: `Full code and setup guide at ${metaHandle}.` }
          ]
        };
      }

      case "builder_network":
      default:
        return {
          isQuoteCard: true,
          badge: `${compTag} • DEVELOPER NETWORK`,
          accentColor: "#00FF66",
          glowColor: "rgba(0, 255, 102, 0.18)",
          quote: "Looking for passionate software engineers who want to build real systems, collaborate on client work, and share project revenue.",
          author: authorName,
          role: authorRole,
          footerTag: "REV-SHARE COLLABORATION",
          takeaways: [
            { num: "01", title: "Direct Revenue Share", desc: "Fair, transparent compensation directly tied to delivered project milestones." },
            { num: "02", title: "Enterprise Stack Standards", desc: "Build using modern TypeScript, Next.js, Node.js, and scalable cloud backends." },
            { num: "03", title: "Collaborative Velocity", desc: "Work with experienced architects solving real client engineering challenges." }
          ]
        };
    }
  }

  /**
   * Curated high-impact carousel decks tailored to the configured brand identity.
   * ALL brand names, URLs, and usernames are resolved dynamically from knowledge engine.
   */
  getDeckSpecs(theme) {
    // Resolve all brand identity dynamically — zero hardcoded strings
    const founder = knowledge.getFounderInfo();
    const company = knowledge.getCompanyInfo();
    const founderName = founder.name || "Founder";
    const founderUsername = founder.threadsUsername || "";
    const founderHandle = founderUsername ? `@${founderUsername}` : founderName;
    const companyName = company.name || "our team";
    const compTag = company.badgeName || (company.shortName || "COMPANY").toUpperCase();
    const metaRepoUrl = knowledge.getMetaAutomationUrl();
    const metaRepoHandle = metaRepoUrl ? metaRepoUrl.replace("https://", "").replace("http://", "") : "github.com";
    const founderGithub = founder.github || metaRepoUrl || "";
    const founderGithubHandle = founderGithub ? founderGithub.replace("https://github.com/", "").split("/")[0] : founderHandle;
    switch (theme) {
      case "pixelgo_hms":
        return [
          {
            badge: "PIXELGO HMS • REVOLUTION",
            accentColor: "#00F0FF",
            glowColor: "rgba(0, 240, 255, 0.12)",
            title: "Why Hotel Tech Is Broken",
            subtitle: "And how PixelGo HMS is building the world’s first unified hospitality operations engine.",
            cards: [
              {
                num: "01",
                title: "Disparate Legacy Stacks",
                desc: "Hotels juggle 5 to 7 disconnected tools daily—PMS, POS, Channel Managers, and Housekeeping never stay in sync."
              },
              {
                num: "02",
                title: "Fragile Middleware Silos",
                desc: "API sync delays cause double bookings, manual reconciliation headaches, and lost guest revenue."
              },
              {
                num: "03",
                title: "The Unified PixelGo Paradigm",
                desc: "One reactive core engine uniting front desk, restaurant POS, booking engine, and staff dispatch with zero latency."
              }
            ]
          },
          {
            badge: "PIXELGO HMS • ARCHITECTURE",
            accentColor: "#00F0FF",
            glowColor: "rgba(0, 240, 255, 0.12)",
            title: "The Unified Architecture",
            subtitle: "Eliminating middleware by designing a single reactive core for hotel operations.",
            cards: [
              {
                num: "01",
                title: "Single Source of Truth",
                desc: "Rooms, billing folios, inventory, and staff rosters live in one unified transactional state machine."
              },
              {
                num: "02",
                title: "Zero-Latency WebSockets Sync",
                desc: "Every room status change, guest check-in, or restaurant charge updates all staff screens in real time."
              },
              {
                num: "03",
                title: "Multi-Property Multi-Tenancy",
                desc: "Manage multiple hotel chains, boutique resorts, and amenities under one unified administrative pane."
              }
            ]
          },
          {
            badge: "PIXELGO HMS • OPERATIONS",
            accentColor: "#10B981",
            glowColor: "rgba(16, 185, 129, 0.12)",
            title: "Autonomous Guest & Staff Telemetry",
            subtitle: "Transforming manual hotel friction into streamlined, automated operations.",
            cards: [
              {
                num: "01",
                title: "Instant Digital Check-In",
                desc: "Self-service guest arrival, automated digital key issuance, and zero front desk queues."
              },
              {
                num: "02",
                title: "Smart Housekeeping Dispatch",
                desc: "Housekeeping tasks automatically trigger and reorder based on actual checkout timestamps."
              },
              {
                num: "03",
                title: "Unified Restaurant & Amenity POS",
                desc: "Direct billing to room folios with instant credit limits and audit-ready receipts."
              }
            ]
          },
          {
            badge: "PIXELGO HMS • SCALABILITY",
            accentColor: "#7928CA",
            glowColor: "rgba(121, 40, 202, 0.12)",
            title: "Engineered for 99.99% Reliability",
            subtitle: "Hospitality operates 24/7/365—your management infrastructure must be invincible.",
            cards: [
              {
                num: "01",
                title: "Offline-First Resilience",
                desc: "Front desk and POS operations keep working locally even during internet or network outages."
              },
              {
                num: "02",
                title: "Automated OTA Rate Sync",
                desc: "Instant two-way synchronization with booking channels to maximize RevPAR and eliminate overbookings."
              },
              {
                num: "03",
                title: "Audit-Grade Financials",
                desc: "Built-in tax compliance, night-audit automation, and comprehensive revenue analytics."
              }
            ]
          },
          {
            badge: "PIXELGO HMS • CONNECT",
            accentColor: "#00F0FF",
            glowColor: "rgba(0, 240, 255, 0.14)",
            title: "Reinventing Hospitality Software",
            subtitle: `Built by ${founderName} and ${companyName}.`,
            cards: [
              {
                num: "01",
                title: "For Hoteliers & Resort Owners",
                desc: "Ready to eliminate legacy software fees and operational friction? Let's schedule a private demo."
              },
              {
                num: "02",
                title: "For Passionate Engineers",
                desc: "Excited by complex real-time distributed systems? Join our builder network and collaborate."
              },
              {
                num: "03",
                title: "Start the Conversation",
                desc: `Drop a comment or DM ${founderHandle} to explore PixelGo HMS in depth.`
              }
            ]
          }
        ];

      case "founders_revolution":
        return [
          {
            badge: `FOUNDERS • ${compTag}`,
            accentColor: "#7928CA",
            glowColor: "rgba(121, 40, 202, 0.14)",
            title: "For Founders Building What Matters",
            subtitle: "How visionary startups avoid engineering traps and ship revolutionary software.",
            cards: [
              {
                num: "01",
                title: "The Over-Engineering Trap",
                desc: "Premature microservices and complex Kubernetes clusters burn seed capital before finding product-market fit."
              },
              {
                num: "02",
                title: "The Velocity Advantage",
                desc: "Winning startups build on clean, pragmatic monoliths with strict domain boundaries and instant deployments."
              },
              {
                num: "03",
                title: "Architecture That Scales",
                desc: "Design data models that easily handle 100x traffic growth without requiring costly mid-flight rewrites."
              }
            ]
          },
          {
            badge: "STARTUP TECH • STRATEGY",
            accentColor: "#00F0FF",
            glowColor: "rgba(0, 240, 255, 0.12)",
            title: "The 0-to-1 Technical Blueprint",
            subtitle: `${companyName}'s principles for launching high-performance MVPs and SaaS products.`,
            cards: [
              {
                num: "01",
                title: "Single Source of Truth DB",
                desc: "PostgreSQL with robust JSONB, strict schemas, and indexing beats multiple disjointed databases every time."
              },
              {
                num: "02",
                title: "Automated CI/CD from Day 1",
                desc: "Eliminate deploy friction so your team ships customer-requested features multiple times a day."
              },
              {
                num: "03",
                title: "Built-in Observability",
                desc: "Structured logging and exception alerts give you instant visibility into user friction before they complain."
              }
            ]
          },
          {
            badge: "AI INTEGRATION • REALITY",
            accentColor: "#10B981",
            glowColor: "rgba(16, 185, 129, 0.12)",
            title: "AI That Actually Delivers ROI",
            subtitle: "Moving beyond superficial wrappers into real enterprise automation.",
            cards: [
              {
                num: "01",
                title: "Deterministic Guardrails",
                desc: "Force schema validation and strict state machines so AI outputs never break downstream business logic."
              },
              {
                num: "02",
                title: "Low-Latency Context",
                desc: "Pruned vector search and structured cache retrieval deliver sub-second intelligence to users."
              },
              {
                num: "03",
                title: "Autonomous Workflows",
                desc: "Automate repetitive data reconciliation, customer triage, and dispatch with human-in-the-loop safety."
              }
            ]
          },
          {
            badge: `SCALING • ${compTag}`,
            accentColor: "#00F0FF",
            glowColor: "rgba(0, 240, 255, 0.12)",
            title: "Partnering With Technical Founders",
            subtitle: "We help ambitious startups build, harden, and scale their core platforms.",
            cards: [
              {
                num: "01",
                title: "Full-Stack MVP Delivery",
                desc: "Rapid execution from system architecture to production web and Flutter mobile applications."
              },
              {
                num: "02",
                title: "Technical Advisory & Audits",
                desc: "In-depth code reviews, database optimization, and cloud architecture security hardening."
              },
              {
                num: "03",
                title: "Founder-to-Founder Collaboration",
                desc: `Direct communication with ${founderName}—no account manager telephone games.`
              }
            ]
          },
          {
            badge: "CONNECT • BUILD TOGETHER",
            accentColor: "#7928CA",
            glowColor: "rgba(121, 40, 202, 0.14)",
            title: "What Revolutionary Thing Are You Building?",
            subtitle: "Let’s connect, compare tech stacks, and accelerate your vision.",
            cards: [
              {
                num: "01",
                title: "Share Your Tech Stack",
                desc: "What is your biggest architectural challenge right now? Node, Python, Flutter, or PostgreSQL?"
              },
              {
                num: "02",
                title: "Need Dev Bandwidth?",
                desc: `${companyName} partners with visionary founders to build and deliver mission-critical software.`
              },
              {
                num: "03",
                title: "Let’s Connect",
                desc: "Drop a comment below or send a DM to start an authentic founder-to-founder dialogue."
              }
            ]
          }
        ];

      case "tech_mentorship":
        return [
          {
            badge: `MENTORSHIP • ${compTag}`,
            accentColor: "#10B981",
            glowColor: "rgba(16, 185, 129, 0.14)",
            title: "Technical Mentorship for Builders",
            subtitle: "Stuck on architecture, database scaling, or launching your first SaaS product?",
            cards: [
              {
                num: "01",
                title: "No Fluff, Real Systems",
                desc: "Direct technical guidance on database schemas, backend concurrency, and clean API design."
              },
              {
                num: "02",
                title: "Unblocking Early Engineers",
                desc: "Get an experienced senior perspective on your tricky bugs, architectural bottlenecks, or tech choices."
              },
              {
                num: "03",
                title: "Open Community Guidance",
                desc: "I believe in lifting fellow developers and sharing battle-tested engineering lessons openly."
              }
            ]
          },
          {
            badge: "SYSTEM DESIGN • DEEP DIVE",
            accentColor: "#00F0FF",
            glowColor: "rgba(0, 240, 255, 0.12)",
            title: "SaaS Architecture Fundamentals",
            subtitle: "The core patterns every full-stack builder must master before scaling.",
            cards: [
              {
                num: "01",
                title: "Multi-Tenant Isolation",
                desc: "Choosing the right tenant separation strategy: shared schema with tenant IDs vs isolated schemas."
              },
              {
                num: "02",
                title: "Background Job Queues",
                desc: "Offload heavy tasks (emails, webhooks, AI processing) to Redis BullMQ for instant UI responsiveness."
              },
              {
                num: "03",
                title: "Idempotency & Resiliency",
                desc: "Design API endpoints that safely handle duplicate requests and network retries without side effects."
              }
            ]
          },
          {
            badge: "AI PIPELINES • REAL WORLD",
            accentColor: "#7928CA",
            glowColor: "rgba(121, 40, 202, 0.12)",
            title: "Integrating AI Without the Mess",
            subtitle: "How to add real intelligence to your application without creating a maintenance nightmare.",
            cards: [
              {
                num: "01",
                title: "Enforce Strict Output Schemas",
                desc: "Never let raw LLM text drive business decisions without schema validation and boundary checks."
              },
              {
                num: "02",
                title: "Optimize Context Windows",
                desc: "Pass only concise, relevant metadata to the model to cut token latency and cost by 80%."
              },
              {
                num: "03",
                title: "Isolate Read from Write Tools",
                desc: "Keep data discovery and analysis separate from state-modifying actions with explicit safeguards."
              }
            ]
          },
          {
            badge: `CAREER & CRAFT • ${compTag}`,
            accentColor: "#00F0FF",
            glowColor: "rgba(0, 240, 255, 0.12)",
            title: "From Coder to System Architect",
            subtitle: "The mental shift required to design software that lasts for years.",
            cards: [
              {
                num: "01",
                title: "Think in Data Flows, Not Code",
                desc: "Map how data moves, transforms, and persists across systems before writing a single function."
              },
              {
                num: "02",
                title: "Value Simplicity Over Cleverness",
                desc: "The best systems are boring, obvious, and easy for any engineer to understand and debug."
              },
              {
                num: "03",
                title: "Ship Continuously",
                desc: "Working software in production teaches you more in a week than months of isolated theory."
              }
            ]
          },
          {
            badge: `REACH OUT • ${founderName.toUpperCase()}`,
            accentColor: "#10B981",
            glowColor: "rgba(16, 185, 129, 0.14)",
            title: "Need Guidance on Your Project?",
            subtitle: `I'm always happy to help ambitious developers solve real engineering problems.`,
            cards: [
              {
                num: "01",
                title: "Drop Your Questions",
                desc: "Ask any question about system design, tech stack choices, or database bottlenecks below."
              },
              {
                num: "02",
                title: "Code Reviews & Advice",
                desc: `Send me a DM with your GitHub repo or project description for thoughtful feedback.`
              },
              {
                num: "03",
                title: "Collaborate With Us",
                desc: `Passionate engineers can also join ${companyName}'s builder network and work on rev-share projects.`
              }
            ]
          }
        ];

      case "agentic_ai":
        return [
          {
            badge: "AGENTIC AI • SYSTEM DESIGN",
            accentColor: "#7928CA",
            glowColor: "rgba(121, 40, 202, 0.14)",
            title: "Production AI Agents: 5 Hard Truths",
            subtitle: "Why 90% of prototype AI agents fail when deployed to real customers.",
            cards: [
              {
                num: "01",
                title: "Unconstrained Prompting Fails",
                desc: "Chained LLM prompts without deterministic state machines hallucinate and derail."
              },
              {
                num: "02",
                title: "Unbounded Tool Loops",
                desc: "Agents without strict step budgets burn through API quotas and get stuck in infinite loops."
              },
              {
                num: "03",
                title: "Zero State Recovery",
                desc: "If an agent crashes midway through a multi-step workflow without persistence, all context is lost."
              }
            ]
          },
          {
            badge: "AGENTIC AI • PRINCIPLE 1 & 2",
            accentColor: "#00F0FF",
            glowColor: "rgba(0, 240, 255, 0.12)",
            title: "Deterministic Guardrails & FSMs",
            subtitle: `${companyName}'s architecture blueprint for reliable autonomous software.`,
            cards: [
              {
                num: "01",
                title: "Strict JSON Schema Enforcement",
                desc: "Validate every tool argument and response against rigid schemas before executing actions."
              },
              {
                num: "02",
                title: "Finite-State Machine Routing",
                desc: "Transition through explicit phases (Scan -> Qualify -> Propose -> Execute) deterministically."
              },
              {
                num: "03",
                title: "Isolate Sensitive Tools",
                desc: "Keep read-only analysis tools completely separate from write or transaction operations."
              }
            ]
          },
          {
            badge: "AGENTIC AI • OPTIMIZATION",
            accentColor: "#10B981",
            glowColor: "rgba(16, 185, 129, 0.12)",
            title: "Context Minimization & Resiliency",
            subtitle: "Keep agents lightning fast, laser focused, and cost efficient.",
            cards: [
              {
                num: "01",
                title: "Aggressive DOM & Text Pruning",
                desc: "Strip unnecessary HTML and styling before injecting into the model's context window."
              },
              {
                num: "02",
                title: "Few-Shot In-Tool Guidance",
                desc: "Embed precise, verified examples in tool descriptions so the agent calls them accurately."
              },
              {
                num: "03",
                title: "Idempotent Retry Queues",
                desc: "Implement exponential backoff and persistent deduplication guards across all network calls."
              }
            ]
          },
          {
            badge: "AGENTIC AI • SPECIALIST PATTERN",
            accentColor: "#00F0FF",
            glowColor: "rgba(0, 240, 255, 0.12)",
            title: "The Specialist Multi-Agent Model",
            subtitle: "One mega-agent breaks; specialized subagents coordinate seamlessly.",
            cards: [
              {
                num: "01",
                title: "Discovery Subagent",
                desc: "Continuously scans high-volume incoming feeds and filters out 95% of noise instantly."
              },
              {
                num: "02",
                title: "Qualification Subagent",
                desc: "Performs deep contextual reasoning against exact business and domain constraints."
              },
              {
                num: "03",
                title: "Execution Subagent",
                desc: "Conducts live browser/API actions with human approval gates and safety locks."
              }
            ]
          },
          {
            badge: "AGENTIC AI • DISCUSSION",
            accentColor: "#7928CA",
            glowColor: "rgba(121, 40, 202, 0.14)",
            title: "What AI Workflow Are You Building?",
            subtitle: "Let’s connect and share real-world engineering experiences.",
            cards: [
              {
                num: "01",
                title: "Enterprise Multi-Agent Workflows",
                desc: `At ${companyName}, we engineer deterministic multi-agent systems for high-value business operations.`
              },
              {
                num: "02",
                title: "What’s Your Roadblock?",
                desc: "Are you struggling with latency, agent loops, or LLM hallucinations? Let’s compare notes."
              },
              {
                num: "03",
                title: `Connect With ${founderName}`,
                desc: "Drop a comment or DM to talk agent architectures and practical AI deployment."
              }
            ]
          }
        ];

      case "meta_automation":
        return [
          {
            badge: "META AUTOMATION • OPEN SOURCE",
            accentColor: "#00F0FF",
            glowColor: "rgba(0, 240, 255, 0.14)",
            title: "24/7 AI Growth Engine: 100% Free & Open-Source",
            subtitle: `How we engineered an autonomous Meta & Threads agent running on Linux, macOS, Windows & Android Termux.`,
            cards: [
              {
                num: "01",
                title: "Zero API Token Cost",
                desc: "Uses local MiniMax M3 Language Server reasoning via Gemini 3.8 Flash High without recurring API bills."
              },
              {
                num: "02",
                title: "Cross-Platform Freedom",
                desc: "1-click native runners for Termux:X11 on Android, Windows PowerShell, and macOS/Linux daemons."
              },
              {
                num: "03",
                title: "Production Guardrails",
                desc: "Finite-state machine boundaries eliminate spam, enforce human-level cooldowns, and prevent hallucinations."
              }
            ]
          },
          {
            badge: "SYSTEM DESIGN • DETERMINISTIC",
            accentColor: "#7928CA",
            glowColor: "rgba(121, 40, 202, 0.14)",
            title: "The Deterministic Multi-Agent Architecture",
            subtitle: "Why browser-level DOM telemetry beats fragile REST API bots every single time.",
            cards: [
              {
                num: "01",
                title: "CDP Remote Telemetry",
                desc: "Attaches directly to Chromium port 9222, preserving logged-in sessions, cookies, and human fidelity."
              },
              {
                num: "02",
                title: "Deep Semantic Lead Scoring",
                desc: "Categorizes high-intent buyer inquiries while strictly ignoring general polls, noise, and spam."
              },
              {
                num: "03",
                title: "Verified DOM Transactions",
                desc: "Inspects live profile DOM post-submission to verify 100% delivery before committing state transitions."
              }
            ]
          },
          {
            badge: "ANDROID TERMUX • MOBILE AI",
            accentColor: "#10B981",
            glowColor: "rgba(16, 185, 129, 0.14)",
            title: "Running Full AI Automation on Your Phone",
            subtitle: "Turn any spare Android smartphone into a 24/7 autonomous social growth server.",
            cards: [
              {
                num: "01",
                title: "1-Click Termux Setup",
                desc: "Automated bash script sets up Node.js, Chromium, Pulseaudio, and companion X11 environment in minutes."
              },
              {
                num: "02",
                title: "Termux:X11 Mobile Display",
                desc: "High-performance visual or headless X11 session running smoothly in the background without overheating."
              },
              {
                num: "03",
                title: "Native MiniMax M3 CLI",
                desc: "Run real-time reasoning and agentic pipelines right from your Termux terminal."
              }
            ]
          },
          {
            badge: "GITHUB BLUEPRINT • OPEN SOURCE",
            accentColor: "#00F0FF",
            glowColor: "rgba(0, 240, 255, 0.12)",
            title: "Explore the Full Open-Source Codebase",
            subtitle: `Every line of code is open-source at ${metaRepoHandle}.`,
            cards: [
              {
                num: "01",
                title: "Clean Modular Engine",
                desc: "Separate layers for browser drivers, state store, multi-brand knowledge base, and safety limits."
              },
              {
                num: "02",
                title: "100% Brand Isolation",
                desc: "Onboard any founder or agency in 60 seconds with zero hardcoded code changes."
              },
              {
                num: "03",
                title: "Contributions Welcome",
                desc: "Fork the repo, submit PRs for new platforms, and build on top of our autonomous agent foundation."
              }
            ]
          },
          {
            badge: "JOIN THE REVOLUTION • GITHUB",
            accentColor: "#10B981",
            glowColor: "rgba(16, 185, 129, 0.14)",
            title: "Star the Repo & Build With Us",
            subtitle: `Available now on GitHub: ${metaRepoHandle}.`,
            cards: [
              {
                num: "01",
                title: "Star & Fork on GitHub",
                desc: `Visit ${metaRepoHandle} and leave a star to support open-source AI.`
              },
              {
                num: "02",
                title: "Follow for Daily Breakdowns",
                desc: `Follow ${founderHandle} for daily systems architecture, software engineering craft, and agentic AI tutorials.`
              },
              {
                num: "03",
                title: "Connect With Our Network",
                desc: `Drop a comment or DM ${founderName} to discuss custom AI automation or software development.`
              }
            ]
          }
        ];

      case "builder_network":
      default:
        return [
          {
            badge: `DEVELOPER NETWORK • ${compTag}`,
            accentColor: "#00F0FF",
            glowColor: "rgba(0, 240, 255, 0.14)",
            title: "Calling All Engineers & Builders",
            subtitle: "Let’s collaborate, build real software, and share project revenue.",
            cards: [
              {
                num: "01",
                title: `The ${companyName} Builder Community`,
                desc: "We’re assembling an elite network of full-stack, mobile, and AI engineers."
              },
              {
                num: "02",
                title: "High-Impact Client Projects",
                desc: "Work on cutting-edge SaaS, custom business systems, Flutter apps, and AI automations."
              },
              {
                num: "03",
                title: "Transparent Revenue Sharing",
                desc: "Earn ongoing rev-share on client projects you collaborate on or refer to the network."
              }
            ]
          },
          {
            badge: `${compTag} • REV-SHARE MODEL`,
            accentColor: "#10B981",
            glowColor: "rgba(16, 185, 129, 0.12)",
            title: "Fair Revenue Share Partnerships",
            subtitle: "Grow your income while building production software with autonomy.",
            cards: [
              {
                num: "01",
                title: "Referral Revenue Share",
                desc: "Bring client leads or projects and receive a generous, transparent cut of ongoing revenue."
              },
              {
                num: "02",
                title: "Engineering Lead Ownership",
                desc: "Lead core modules, architect features, and get rewarded for high-quality delivery."
              },
              {
                num: "03",
                title: "Specialist Architecture Audits",
                desc: "Contribute specialist security, database, or performance reviews on enterprise accounts."
              }
            ]
          },
          {
            badge: "TECH STACK • STANDARDS",
            accentColor: "#7928CA",
            glowColor: "rgba(121, 40, 202, 0.12)",
            title: "Our Core Engineering Stack",
            subtitle: "Clean architecture, high throughput, and modern battle-tested technologies.",
            cards: [
              {
                num: "01",
                title: "Web & Front-End",
                desc: "Next.js, React, Node.js, TypeScript, Tailwind CSS, and ultra-responsive interfaces."
              },
              {
                num: "02",
                title: "Mobile & Cross-Platform",
                desc: "Flutter for performant iOS and Android apps with native device integrations."
              },
              {
                num: "03",
                title: "Backend, Data & AI",
                desc: "PostgreSQL, Redis, Docker, Cloudflare, Local LLMs, and deterministic AI agent pipelines."
              }
            ]
          },
          {
            badge: "MENTORSHIP & SUPPORT",
            accentColor: "#00F0FF",
            glowColor: "rgba(0, 240, 255, 0.12)",
            title: "Guidance for Ambitious Devs",
            subtitle: "Stuck on a complex architecture or scaling bottleneck?",
            cards: [
              {
                num: "01",
                title: "1-on-1 Code & Schema Reviews",
                desc: "Get direct, candid feedback on database models, API design, and system scalability."
              },
              {
                num: "02",
                title: "Technical Advisory for SaaS",
                desc: "Practical guidance for developers building and launching their first commercial software."
              },
              {
                num: "03",
                title: "Zero Gatekeeping",
                desc: "Direct access to real-world experience building enterprise systems and production platforms."
              }
            ]
          },
          {
            badge: `LET'S CONNECT • ${compTag}`,
            accentColor: "#10B981",
            glowColor: "rgba(16, 185, 129, 0.14)",
            title: `Join the ${companyName} Developer Network`,
            subtitle: `Drop a comment or DM to connect with ${founderName}.`,
            cards: [
              {
                num: "01",
                title: "What Are You Building?",
                desc: "Tell me what project or tech stack you're passionate about this week."
              },
              {
                num: "02",
                title: "Interested in Rev-Share?",
                desc: "Send me a DM with your GitHub profile and areas of expertise to get started."
              },
              {
                num: "03",
                title: "Let’s Build Together",
                desc: "Great software is built by great people. Let’s create something extraordinary."
              }
            ]
          }
        ];
    }
  }
}

const threadsMedia = new ThreadsMedia();
module.exports = threadsMedia;
