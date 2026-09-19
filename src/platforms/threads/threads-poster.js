/**
 * src/platforms/threads/threads-poster.js
 * Automated multi-format post publisher for Threads.
 *
 * Implements user requirements:
 * - Post cadence: every 6 hours (exactly 4 strategic posts per 24 hours).
 * - 5 strategic content pillars (PixelGo HMS every 2-3 days, Developer Network / Rev-Share,
 *   Founders & Co-Founders, Tech Mentorship, Agentic AI).
 * - High-impact formats:
 *   1. Alternate-day 5-slide visual carousels (Stripe/x.ai grade dark mode graphics).
 *   2. Single visual perspective cards.
 *   3. Thought-provoking text-only discussion starters.
 * - Visibly types and submits posts live in Brave browser with native file uploads.
 */

const fs = require("fs");
const path = require("path");
const CONFIG = require("../../../config");
const browserManager = require("../../browser/browser-manager");
const stateStore = require("../../storage/state-store");
const threadsMedia = require("./threads-media");
const logger = require("../../logging/logger");

async function captureDiagnosticScreenshot(page, prefix) {
  try {
    const dir = path.join(CONFIG.LOGS_DIR || path.resolve(__dirname, "../../../logs"), "screenshots");
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const file = path.join(dir, `${prefix}_${Date.now()}.png`);
    await page.screenshot({ path: file });
    logger.info(`Saved diagnostic screenshot to: ${file}`);
    return file;
  } catch (e) {
    logger.warn(`Failed capturing diagnostic screenshot: ${e.message}`);
    return null;
  }
}

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
   * Strictly verifies that the newly published post appears on the authenticated profile feed.
   */
  async verifyPostOnProfile(page, postText, username = "sunmughan") {
    const profileUrl = `https://www.threads.com/@${username}`;
    logger.info(`[THREADS POSTER] Navigating to profile feed (${profileUrl}) for multi-signal live post verification...`);
    try {
      await page.goto(profileUrl, { waitUntil: "domcontentloaded", timeout: 35000 });
      await new Promise(r => setTimeout(r, 2500));

      const snippet = postText.replace(/https?:\/\/[^\s]+/g, "").slice(0, 35).trim();
      for (let attempt = 1; attempt <= 6; attempt++) {
        const found = await page.evaluate((snip) => {
          const articles = Array.from(document.querySelectorAll('article, [data-pressable-container="true"]'));
          return articles.some(a => {
            if (a.tagName === 'SCRIPT' || a.tagName === 'STYLE') return false;
            const content = (a.innerText || a.textContent || "").trim();
            return content.includes(snip);
          });
        }, snippet);

        if (found) {
          logger.info(`[THREADS POSTER] ✅ Post verified present on @${username} profile feed DOM (attempt ${attempt}/6)!`);
          return { verified: true, reason: `Verified live on @${username} profile feed DOM` };
        }

        await page.evaluate(() => window.scrollBy({ top: 300, left: 0, behavior: "smooth" }));
        await new Promise(r => setTimeout(r, 2000));
      }

      return { verified: false, reason: `Post not found on @${username} profile feed DOM after submission` };
    } catch (err) {
      return { verified: false, reason: `Profile verification navigation failed: ${err.message}` };
    }
  }

  /**
   * Publishes an engaging post live on Threads with Stripe-grade visuals.
   */
  async publishEngagingPost(options = {}) {
    const pillar = options.pillar || this.selectNextPillar();
    const format = options.format || this.determinePostFormat(pillar);
    const postText = options.text || this.getCaptionForPillar(pillar);
    const ourPostId = `our_post_${Date.now()}`;

    stateStore.recordActionTransition("OWN_POST", ourPostId, "INIT", "PREPARING", {
      pillar,
      format,
      textSnippet: postText.slice(0, 60)
    });

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
      stateStore.recordActionTransition("OWN_POST", ourPostId, "PREPARING", "FAILED", {
        reason: "Could not find New thread button in navigation"
      });
      throw new Error("Could not find 'New thread' button in Threads navigation");
    }

    stateStore.recordActionTransition("OWN_POST", ourPostId, "PREPARING", "OPENED", { pillar, format });
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
      stateStore.recordActionTransition("OWN_POST", ourPostId, "OPENED", "FAILED", {
        reason: "Composer textbox did not open after clicking New thread"
      });
      throw new Error("Composer textbox did not open after clicking New thread");
    }

    // State Transition: TYPING
    stateStore.recordActionTransition("OWN_POST", ourPostId, "OPENED", "TYPING", { pillar, format });
    await textbox.focus();
    await new Promise(r => setTimeout(r, 500));

    // 6. Type text visibly with human-like delays
    logger.info("[THREADS POSTER] Visibly typing post caption into composer...");
    for (const char of postText) {
      await page.keyboard.sendCharacter(char);
      await new Promise(r => setTimeout(r, Math.floor(Math.random() * 20) + 15));
    }

    await new Promise(r => setTimeout(r, 2000));

    // State Transition: SUBMITTING
    stateStore.recordActionTransition("OWN_POST", ourPostId, "TYPING", "SUBMITTING", { pillar, format });
    logger.info("[THREADS POSTER] Submitting post via active composer Post button...");
    let postSubmitted = false;

    for (let attempt = 0; attempt < 5; attempt++) {
      postSubmitted = await page.evaluate(() => {
        const dialog = document.querySelector('div[role="dialog"], [aria-modal="true"]') || document.body;
        const buttons = [...dialog.querySelectorAll('div[role="button"], button')];

        // Strategy 1: Visible button with exact text "post"
        let postBtn = buttons.find(b => {
          const txt = (b.innerText || "").trim().toLowerCase();
          const isEnabled = !b.disabled && b.getAttribute("aria-disabled") !== "true";
          const rect = b.getBoundingClientRect();
          return txt === "post" && isEnabled && (rect.width > 0 || b.offsetWidth > 0 || b.getClientRects().length > 0);
        });

        // Strategy 2: aria-label matching post
        if (!postBtn) {
          postBtn = buttons.find(b => {
            const label = (b.getAttribute("aria-label") || "").trim().toLowerCase();
            const isEnabled = !b.disabled && b.getAttribute("aria-disabled") !== "true";
            const rect = b.getBoundingClientRect();
            return label === "post" && isEnabled && (rect.width > 0 || b.offsetWidth > 0 || b.getClientRects().length > 0);
          });
        }

        // Strategy 3: Child SVG with aria-label containing post
        if (!postBtn) {
          postBtn = buttons.find(b => {
            const svg = b.querySelector('svg[aria-label*="post" i], svg[aria-label*="Post" i]');
            const isEnabled = !b.disabled && b.getAttribute("aria-disabled") !== "true";
            const rect = b.getBoundingClientRect();
            return !!svg && isEnabled && (rect.width > 0 || b.offsetWidth > 0 || b.getClientRects().length > 0);
          });
        }

        // Strategy 4: Rightmost primary action in composer footer
        if (!postBtn) {
          const candidateButtons = buttons.filter(b => {
            const txt = (b.innerText || "").trim().toLowerCase();
            const isEnabled = !b.disabled && b.getAttribute("aria-disabled") !== "true";
            const isSecondary = txt.includes("anyone") || txt.includes("cancel") || txt.includes("discard") || txt.includes("draft");
            const rect = b.getBoundingClientRect();
            return isEnabled && !isSecondary && (rect.width > 0 || b.offsetWidth > 0 || b.getClientRects().length > 0);
          });
          if (candidateButtons.length > 0) {
            candidateButtons.sort((a, b) => b.getBoundingClientRect().right - a.getBoundingClientRect().right);
            postBtn = candidateButtons[0];
          }
        }

        if (postBtn) {
          postBtn.focus();
          postBtn.click();
          postBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
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
      logger.warn("[THREADS POSTER] Composer Post button not clickable via DOM evaluation; retrying direct selector click...");
      try {
        const postButtonHandle = await page.$('div[role="dialog"] div[role="button"]:has(span), div[role="dialog"] button');
        if (postButtonHandle) {
          await postButtonHandle.click();
          postSubmitted = true;
        }
      } catch (err) {
        logger.warn(`[THREADS POSTER] Direct selector click failed: ${err.message}`);
      }
    }

    // State Transition: VERIFYING
    stateStore.recordActionTransition("OWN_POST", ourPostId, "SUBMITTING", "VERIFYING", { pillar, format });

    // 8. Strict Verification of Submission & Profile Presence
    let isModalDismissed = false;
    for (let check = 0; check < 10; check++) {
      await new Promise(r => setTimeout(r, 1000));
      const status = await page.evaluate(() => {
        const bodyText = document.body.innerText || "";
        const hasError = /\b(couldn'?t post|something went wrong|try again later|action blocked|rate limit)\b/i.test(bodyText);
        const dialog = document.querySelector('div[role="dialog"], [aria-modal="true"]');
        return { hasError, noDialog: !dialog };
      });

      if (status.hasError) {
        break;
      }
      if (status.noDialog) {
        isModalDismissed = true;
        break;
      }
    }

    if (!isModalDismissed) {
      stateStore.recordActionTransition("OWN_POST", ourPostId, "VERIFYING", "FAILED", {
        reason: "Composer modal failed to dismiss after Post click"
      });
      stateStore.recordActionTransition("OWN_POST", ourPostId, "FAILED", "DIAGNOSTIC", {
        reason: "Capturing diagnostic screenshot"
      });
      await captureDiagnosticScreenshot(page, "own_post_modal_stuck");
      await page.keyboard.press("Escape").catch(() => {});

      stateStore.recordOurPostAttemptFailure({
        pillar,
        format,
        reason: "Composer modal failed to dismiss after Post click",
        textSnippet: postText.slice(0, 50)
      });

      return {
        success: false,
        verified: false,
        reason: "Composer modal failed to dismiss after Post click",
        pillar,
        format
      };
    }

    // Secondary Strict Profile Feed Verification (Mandatory User Requirement)
    // Confirm the post actually rendered live on the authenticated profile feed DOM
    const profileVerify = await this.verifyPostOnProfile(page, postText, "sunmughan");

    if (!profileVerify.verified) {
      stateStore.recordActionTransition("OWN_POST", ourPostId, "VERIFYING", "FAILED", {
        reason: profileVerify.reason
      });
      stateStore.recordActionTransition("OWN_POST", ourPostId, "FAILED", "DIAGNOSTIC", {
        reason: "Capturing diagnostic screenshot"
      });

      logger.error(`[THREADS POSTER] Profile verification failed: ${profileVerify.reason}. Aborting state record.`);
      await captureDiagnosticScreenshot(page, "own_post_profile_missing");

      stateStore.recordOurPostAttemptFailure({
        pillar,
        format,
        reason: profileVerify.reason,
        textSnippet: postText.slice(0, 50)
      });

      // Smooth return to home feed
      await page.goto(CONFIG.THREADS_HOME, { waitUntil: "domcontentloaded", timeout: 35000 }).catch(() => {});

      return {
        success: false,
        verified: false,
        reason: profileVerify.reason,
        pillar,
        format
      };
    }

    // State Transition: VERIFIED_SUCCESS
    stateStore.recordActionTransition("OWN_POST", ourPostId, "VERIFYING", "VERIFIED_SUCCESS", {
      pillar,
      format,
      verificationReason: profileVerify.reason
    });

    logger.info(`[THREADS POSTER] Post submission verified on profile: ${profileVerify.reason}`);

    // 9. Record verified post into state
    stateStore.recordOurPost({
      id: ourPostId,
      text: postText,
      pillar,
      format,
      mediaCount: mediaPaths.length,
      mediaPaths,
      status: "VERIFIED_PUBLISHED",
      published: true,
      verifiedReason: profileVerify.reason,
      publishedAt: new Date().toISOString(),
      repliesTracked: []
    });

    if (format === "CAROUSEL") {
      stateStore.state.lastCarouselDate = new Date().toISOString();
    }

    stateStore.recordAction("OWN_POST_PUBLISHED", ourPostId, {
      pillar,
      format,
      mediaCount: mediaPaths.length,
      text: postText,
      verifiedReason: profileVerify.reason
    });
    stateStore.saveState();

    // Smooth return to home feed
    await page.goto(CONFIG.THREADS_HOME, { waitUntil: "domcontentloaded", timeout: 35000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 2000));

    logger.info(`✅ Successfully published & verified ${format} post on Threads [${pillar}]: "${postText.slice(0, 60)}..."`);
    return {
      success: true,
      live: true,
      verified: true,
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
