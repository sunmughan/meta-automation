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
  founders_revolution: [
    "To SaaS founders and startup builders:\nWhat is the single biggest bottleneck slowing down your product launch right now?\nDrop it below, let's troubleshoot together!",
    "Build your MVP in 3 weeks, not 6 months.\nA clean UI that solves one core problem beats 20 features nobody asked for.\nAgree or disagree?",
    "Question for startup founders, builders, and consultants:\nWhat was the hardest lesson you learned from your very first product launch?\nShare your experience below!"
  ],
  builder_network: [
    "Looking to connect with 2-3 passionate full-stack or Flutter developers for upcoming client builds (rev-share).\nWhat are you currently building this week? Say hi below!",
    "Software engineers and UI/UX designers: What tech stack are you enjoying the most right now?\nNext.js, Flutter, Node, or something else? Let's talk tech stacks below!",
    "Great software is built by people who obsess over clean code and smooth user experience.\nWhat is one project you are proud of building recently? Drop a comment below!"
  ],
  agentic_ai: [
    "The best AI automations don't replace people—they eliminate the repetitive 2-hour boring tasks so you can focus on building.\nWhat task in your workflow do you wish was automated today?",
    "To engineers, marketers, and lead generation pros:\nHow are you using AI in your day-to-day work right now?\nDrop your favorite use case below!",
    "Clean code, fast APIs, and reliable error handling beat flashy AI demos every single time.\nWhat is your biggest pet peeve with modern software tools?"
  ],
  tech_mentorship: [
    "Developers, designers, and tech enthusiasts:\nWhat is one tool or library you started using recently that you cannot live without?\nLet's share recommendations below.",
    "The best advice for new software engineers:\nBuild real projects, keep your code simple, and ask for user feedback early.\nWhat advice would you give to someone starting today?",
    "Need a quick second pair of eyes on your software architecture or MVP roadmap?\nDrop your tech question below, happy to help and brainstorm together!"
  ],
  pixelgo_hms: [
    "Hospitality founders: Juggling bookings, rooms, and payments across separate tools is a headache. That's why we built PixelGo HMS (pixelgo.live).\nWhat is the clunkiest piece of software your business uses daily?",
    "When building business software, speed and a clean UI matter more than 50 complex buttons.\nWhat's one business tool you use that you wish was way simpler?",
    "Building reliable software for real-world businesses is our passion at CodeAir (www.codeair.tech).\nWhat is your favorite product to build or work on?"
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
    await new Promise(r => setTimeout(r, 400));
    // Clear any residual draft text completely
    await page.keyboard.down("Control");
    await page.keyboard.press("KeyA");
    await page.keyboard.up("Control");
    await page.keyboard.press("Backspace");
    await new Promise(r => setTimeout(r, 400));

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

    // Locate the Post button element handle in Puppeteer
    const postHandle = await page.evaluateHandle(() => {
      const dialog = document.querySelector('div[role="dialog"], [aria-modal="true"]') || document.body;
      const buttons = [...dialog.querySelectorAll('div[role="button"], button')];
      return buttons.find(b => {
        const txt = (b.innerText || "").trim().toLowerCase();
        const aria = (b.getAttribute("aria-label") || "").trim().toLowerCase();
        const isEnabled = !b.disabled && b.getAttribute("aria-disabled") !== "true";
        return (txt === "post" || aria === "post") && isEnabled;
      });
    });

    if (postHandle && postHandle.asElement()) {
      logger.info("[THREADS POSTER] Found active Post button handle. Clicking via native mouse event...");
      const box = await postHandle.boundingBox();
      if (box && box.width > 0 && box.height > 0) {
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      } else {
        await postHandle.click();
      }
      postSubmitted = true;
    } else {
      // Fallback strategies
      for (let attempt = 0; attempt < 3; attempt++) {
        postSubmitted = await page.evaluate(() => {
          const dialog = document.querySelector('div[role="dialog"], [aria-modal="true"]') || document.body;
          const buttons = [...dialog.querySelectorAll('div[role="button"], button')];
          const postBtn = buttons.find(b => {
            const txt = (b.innerText || "").trim().toLowerCase();
            const isEnabled = !b.disabled && b.getAttribute("aria-disabled") !== "true";
            return txt === "post" && isEnabled;
          });
          if (postBtn) {
            postBtn.focus();
            postBtn.click();
            return true;
          }
          return false;
        });
        if (postSubmitted) break;
        await new Promise(r => setTimeout(r, 1000));
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
