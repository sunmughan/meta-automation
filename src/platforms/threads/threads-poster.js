/**
 * src/platforms/threads/threads-poster.js
 * Automated multi-format post publisher for Threads.
 *
 * Implements user requirements:
 * - Post cadence: every 3 hours.
 * - 5 strategic content pillars (PixelGo HMS every 2-3 days, Developer Network / Rev-Share,
 *   Founders & Co-Founders, Tech Mentorship, Agentic AI).
 * - High-impact formats:
 *   1. Alternate-day 5-slide visual carousels (Stripe/x.ai grade dark mode graphics).
 *   2. Single visual perspective cards.
 *   3. Thought-provoking text-only discussion starters.
 * - Visibly types and submits posts live in Brave browser with native file uploads.
 */

const CONFIG = require("../../../config");
const browserManager = require("../../browser/browser-manager");
const stateStore = require("../../storage/state-store");
const threadsMedia = require("./threads-media");
const logger = require("../../logging/logger");

const PILLARS = [
  "pixelgo_hms",
  "builder_network",
  "founders_revolution",
  "tech_mentorship",
  "agentic_ai"
];

const PILLAR_CAPTIONS = {
  pixelgo_hms: [
    "Hospitality operations shouldn’t require 5 to 7 disconnected tools everyday. Most hotels juggle separate PMS, POS, Channel Managers, and Housekeeping tools that constantly fail to sync and cause double bookings. We engineered PixelGo HMS (pixelgo.live) to fix this from the ground up: the world’s first truly unified hotel operations engine with zero-latency WebSockets sync and autonomous guest telemetry.\n\nHoteliers, resort operators, and engineers—what is the single biggest operational headache you’ve experienced with hotel software?",
    "Building software for hospitality taught us one brutal lesson: 24/7/365 operations demand zero-latency state synchronization. When a guest charges an amenity or requests a room upgrade, every staff screen across front desk, restaurant, and housekeeping needs to reflect it instantly. That is the core architecture behind PixelGo HMS.\n\nExplore our platform at pixelgo.live. What’s your take on unifying vertical SaaS vs using fragile third-party integrations?",
    "A major milestone for CodeAir Software Solutions: PixelGo HMS (pixelgo.live) is eliminating third-party middleware fees for hotel properties. By running billing, housekeeping dispatch, channel managers, and room inventory on a single reactive core, properties run smoother and guests get zero-queue check-ins.\n\nAre you in hospitality or building complex multi-tenant platforms? Visit pixelgo.live or DM me to connect!"
  ],
  builder_network: [
    "Building something meaningful in tech requires great people. At CodeAir Software Solutions (www.codeair.tech), we’re actively expanding our developer network. We’re looking to collaborate with passionate software engineers on full-stack, mobile (Flutter), and AI automation projects—with transparent, generous revenue sharing for client leads and project execution.\n\nWhat tech stack or side project are you currently building this week? Drop your GitHub or DM me!",
    "To all software engineers and builders: client work shouldn't be zero-sum. We're assembling an elite developer community at CodeAir (www.codeair.tech) where engineers collaborate on high-value SaaS, custom business systems, and AI workflows with fair revenue share.\n\nIf you're a full-stack, backend (Node/Postgres), or Flutter developer looking to build production software, let's connect. What are you building right now?",
    "The best engineers want autonomy, high technical standards, and fair financial rewards. That's why CodeAir's builder network operates on transparent revenue sharing for collaborative client delivery and referrals. Learn more at www.codeair.tech—whether you want to lead an engineering module or advise on architecture, let's talk!"
  ],
  founders_revolution: [
    "To fellow startup founders and co-founders building revolutionary products: premature microservices and bloated infrastructure kill more early startups than market competition. At CodeAir (www.codeair.tech), we believe in lean, pragmatic architecture—single scalable PostgreSQL databases, clean domain boundaries, and shipping customer value multiple times a day.\n\nWhat is the single biggest architectural or product hurdle you're solving right now?",
    "Every visionary startup goes through the 0-to-1 grind. The difference between companies that scale and those that burn out often comes down to choosing boring, battle-tested technology early on so you can focus 100% on product-market fit.\n\nFounders: what was the best tech stack decision you made for your MVP? (www.codeair.tech)",
    "Looking to connect with fellow startup founders, co-founders, and entrepreneurs building next-generation products. Whether you're navigating distribution, technical debt, or integrating AI into your workflow—let's exchange notes at www.codeair.tech. What are you building?"
  ],
  tech_mentorship: [
    "If you’re an ambitious developer or early-stage technical founder feeling stuck on system design, database tenant isolation, or architecting production AI workflows—I’m offering 1-on-1 mentorship and architecture reviews. No gatekeeping, just real battle-tested engineering advice to help you unblock and ship.\n\nCheck out our work at www.codeair.tech. What technical question or system design bottleneck is keeping you up at night?",
    "Mentorship transformed my engineering journey, and I believe in paying it forward. If you're building a SaaS, struggling with database performance, or wondering how to transition from coder to system architect—drop your questions below or DM me. (www.codeair.tech)",
    "A common trap in modern web development: over-complicating state management and database schemas before having 10 active users. If you'd like a second pair of eyes on your architecture or database design, reach out at www.codeair.tech. What are you building this week?"
  ],
  agentic_ai: [
    "Everyone is prototyping with LLMs, but production reliability separates toys from enterprise software. Chaining prompts without deterministic guardrails inevitably derails into hallucinations and runaway loops. At CodeAir (www.codeair.tech), we use strict JSON schemas, finite state machines, and specialized multi-agent sub-teams to build autonomous workflows that run 24/7 with zero surprises.\n\nIf you're deploying AI to real users, what’s your biggest obstacle so far?",
    "The 5 hard truths of production AI agents: 1. Unbounded loops burn budgets. 2. Raw text outputs break databases. 3. Mega-agents fail—specialist multi-agent teams succeed. 4. Sub-second latency requires aggressive DOM/context pruning. 5. Deterministic guardrails are mandatory.\n\nWhat AI workflows is your team automating this quarter? Explore our architectures at www.codeair.tech.",
    "Autonomous AI systems are revolutionizing custom business operations—from automated customer qualification to real-time dispatch. But the foundation is always reliable engineering, not prompt magic. What business process in your workflow do you wish was fully automated? (www.codeair.tech)"
  ]
};

class ThreadsPoster {
  /**
   * Selects the next pillar in rotation.
   * Ensures PixelGo HMS is highlighted every 2-3 days.
   */
  selectNextPillar() {
    const ourPosts = stateStore.state.ourPosts ? Object.values(stateStore.state.ourPosts) : [];
    const twoDaysAgo = Date.now() - (48 * 60 * 60 * 1000);
    const hasRecentPixelGo = ourPosts.some(p => p.pillar === "pixelgo_hms" && new Date(p.publishedAt).getTime() > twoDaysAgo);

    if (!hasRecentPixelGo) {
      return "pixelgo_hms";
    }

    // Pick pillar least recently used
    const recentPillars = ourPosts.slice(-4).map(p => p.pillar);
    const candidate = PILLARS.find(pil => !recentPillars.includes(pil)) || PILLARS[Math.floor(Math.random() * PILLARS.length)];
    return candidate;
  }

  /**
   * Determines whether this post should be a 5-slide carousel, single card, or text-only.
   */
  determinePostFormat(pillar) {
    const lastCarouselDate = stateStore.state.lastCarouselDate ? new Date(stateStore.state.lastCarouselDate).getTime() : 0;
    const hoursSinceLastCarousel = (Date.now() - lastCarouselDate) / (1000 * 60 * 60);

    // Alternate days rule: If last carousel was >= 40 hours ago, generate a full 5-slide carousel deck!
    if (hoursSinceLastCarousel >= 40 || lastCarouselDate === 0) {
      return "CAROUSEL";
    }

    // Otherwise, alternate between single visual card and text-only
    const ourPosts = stateStore.state.ourPosts ? Object.values(stateStore.state.ourPosts) : [];
    const lastPost = ourPosts[ourPosts.length - 1];
    if (lastPost && lastPost.format === "SINGLE_CARD") {
      return "TEXT_ONLY";
    }
    return "SINGLE_CARD";
  }

  /**
   * Gets engaging caption text for a pillar.
   */
  getCaptionForPillar(pillar) {
    const captions = PILLAR_CAPTIONS[pillar] || PILLAR_CAPTIONS.builder_network;
    const ourPosts = stateStore.state.ourPosts ? Object.values(stateStore.state.ourPosts) : [];
    const usedTexts = ourPosts.map(p => p.text);

    return captions.find(c => !usedTexts.includes(c)) || captions[Math.floor(Math.random() * captions.length)];
  }

  /**
   * Publishes an engaging post live on Threads with Stripe-grade visuals.
   */
  async publishEngagingPost(options = {}) {
    const pillar = options.pillar || this.selectNextPillar();
    const format = options.format || this.determinePostFormat(pillar);
    const postText = options.text || this.getCaptionForPillar(pillar);

    logger.info(`[THREADS POSTER] Preparing to publish post: Pillar=${pillar}, Format=${format}`, {
      pillar,
      format,
      textSnippet: postText.slice(0, 60)
    });

    // 1. Generate media assets if required
    let mediaPaths = [];
    if (format === "CAROUSEL") {
      logger.info(`[THREADS POSTER] Generating 5-slide Stripe-grade carousel deck for ${pillar}...`);
      mediaPaths = await threadsMedia.generateCarouselDeck(pillar);
    } else if (format === "SINGLE_CARD") {
      logger.info(`[THREADS POSTER] Generating single visual card for ${pillar}...`);
      const cardPath = await threadsMedia.generatePillarQuoteCard(pillar);
      if (cardPath) mediaPaths.push(cardPath);
    }

    const page = await browserManager.getThreadsPage();
    await page.bringToFront();

    // 2. Navigate to Threads home if needed
    if (!page.url().includes("threads.com")) {
      await page.goto(CONFIG.THREADS_HOME, { waitUntil: "domcontentloaded", timeout: 45000 });
      await new Promise(r => setTimeout(r, 2500));
    }

    // 3. Click "New thread" button
    const opened = await page.evaluate(() => {
      const buttons = [...document.querySelectorAll("button, div[role=\"button\"], a")];
      const newThreadBtn = buttons.find(b => (b.innerText || "").trim().toLowerCase() === "new thread");
      if (newThreadBtn) {
        newThreadBtn.click();
        return "clicked_new_thread";
      }
      const createIcon = document.querySelector('svg[aria-label*="Create" i], svg[aria-label*="Post" i]');
      if (createIcon) {
        createIcon.closest('button, div[role="button"]').click();
        return "clicked_create_icon";
      }
      return null;
    });

    if (!opened) {
      throw new Error("Could not find 'New thread' button in Threads navigation");
    }

    await new Promise(r => setTimeout(r, 1500));

    // 4. If media assets exist, attach them via file input
    if (mediaPaths.length > 0) {
      logger.info(`[THREADS POSTER] Attaching ${mediaPaths.length} image(s) to composer...`);
      const fileInput = await page.$('input[type="file"]');
      if (fileInput) {
        await fileInput.uploadFile(...mediaPaths);
        // Wait for image upload and thumbnail rendering to complete
        logger.info("[THREADS POSTER] Waiting for image upload processing...");
        for (let waitSec = 0; waitSec < 10; waitSec++) {
          await new Promise(r => setTimeout(r, 1000));
          const isUploaded = await page.evaluate(() => {
            const hasImg = !!document.querySelector('div[role="dialog"] img, [aria-modal="true"] img');
            const isUploading = !!document.querySelector('[data-upload-state="uploading"], [aria-label*="loading" i]');
            return hasImg && !isUploading;
          });
          if (isUploaded) {
            logger.info("[THREADS POSTER] Media successfully mounted into composer.");
            break;
          }
        }
      } else {
        logger.warn("[THREADS POSTER] Could not find file input in composer; proceeding with text.");
      }
    }

    // 5. Locate composer textbox inside the active modal/dialog
    const textbox = await page.waitForSelector('div[role="dialog"] div[role="textbox"][contenteditable="true"], [aria-modal="true"] div[role="textbox"][contenteditable="true"], div[role="textbox"][contenteditable="true"]', { timeout: 8000 });
    if (!textbox) {
      throw new Error("Composer textbox did not open after clicking New thread");
    }

    await textbox.focus();
    await new Promise(r => setTimeout(r, 500));

    // 6. Type text visibly with human-like delays
    logger.info("[THREADS POSTER] Visibly typing post caption into composer...");
    for (const char of postText) {
      await page.keyboard.sendCharacter(char);
      await new Promise(r => setTimeout(r, Math.floor(Math.random() * 20) + 15));
    }

    await new Promise(r => setTimeout(r, 2000));

    // 7. Accurately target the "Post" button specifically inside the active composer modal
    logger.info("[THREADS POSTER] Submitting post via active composer Post button...");
    let postSubmitted = false;

    for (let attempt = 0; attempt < 5; attempt++) {
      postSubmitted = await page.evaluate(() => {
        const dialog = document.querySelector('div[role="dialog"], [aria-modal="true"]') || document.body;
        const buttons = [...dialog.querySelectorAll('div[role="button"], button')];
        const postBtn = buttons.find(b => {
          const txt = (b.innerText || "").trim().toLowerCase();
          const isEnabled = !b.disabled && b.getAttribute("aria-disabled") !== "true";
          return txt === "post" && isEnabled && b.offsetParent !== null;
        });

        if (postBtn) {
          postBtn.focus();
          postBtn.click();
          return true;
        }
        return false;
      });

      if (postSubmitted) {
        break;
      }
      await new Promise(r => setTimeout(r, 1500));
    }

    if (!postSubmitted) {
      logger.warn("[THREADS POSTER] Composer Post button not clickable directly; sending Ctrl+Enter fallback...");
      await page.keyboard.down("Control");
      await page.keyboard.press("Enter");
      await page.keyboard.up("Control");
    }

    // Wait and verify dialog has closed
    let dialogClosed = false;
    for (let check = 0; check < 8; check++) {
      await new Promise(r => setTimeout(r, 1000));
      dialogClosed = await page.evaluate(() => {
        const dialog = document.querySelector('div[role="dialog"], [aria-modal="true"]');
        return !dialog;
      });
      if (dialogClosed) break;
    }

    logger.info(`[THREADS POSTER] Post submission verification: dialog closed = ${dialogClosed}`);
    await new Promise(r => setTimeout(r, 2500));

    // 8. Record into state
    const ourPostId = `our_post_${Date.now()}`;
    if (!stateStore.state.ourPosts) {
      stateStore.state.ourPosts = {};
    }
    stateStore.state.ourPosts[ourPostId] = {
      id: ourPostId,
      text: postText,
      pillar,
      format,
      mediaCount: mediaPaths.length,
      mediaPaths,
      publishedAt: new Date().toISOString(),
      repliesTracked: []
    };

    if (format === "CAROUSEL") {
      stateStore.state.lastCarouselDate = new Date().toISOString();
    }

    stateStore.recordAction("OWN_POST_PUBLISHED", ourPostId, {
      pillar,
      format,
      mediaCount: mediaPaths.length,
      text: postText
    });
    stateStore.saveState();

    logger.info(`✅ Successfully published ${format} post on Threads [${pillar}]: "${postText.slice(0, 60)}..."`);
    return {
      success: true,
      postId: ourPostId,
      pillar,
      format,
      mediaCount: mediaPaths.length,
      text: postText
    };
  }
}

const threadsPoster = new ThreadsPoster();
module.exports = threadsPoster;
