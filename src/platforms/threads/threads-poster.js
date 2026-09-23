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
const aiRuntime = require("../../ai/ai-runtime");
const knowledge = require("../../knowledge/knowledge-engine");

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

class ThreadsPoster {
  /**
   * Selects the next pillar in rotation.
   * Ensures PixelGo HMS is highlighted every 2-3 days.
   */
  selectNextPillar() {
    const pillars = knowledge.getContentPillars();
    if (!Array.isArray(pillars) || pillars.length === 0) {
      throw new Error("No content pillars configured in the knowledge base.");
    }
    const pillarIds = pillars.map(p => p.id).filter(Boolean);
    if (!pillarIds.length) throw new Error("Knowledge base contains no usable content pillar ids.");

    const ourPosts = stateStore.state.ourPosts ? Object.values(stateStore.state.ourPosts) : [];
    const lastUsedAt = new Map();
    for (const post of ourPosts) {
      if (!post?.pillar || !post?.publishedAt) continue;
      const ts = Date.parse(post.publishedAt);
      if (Number.isFinite(ts)) lastUsedAt.set(post.pillar, ts);
    }

    return pillarIds.slice().sort((a, b) => {
      const at = lastUsedAt.get(a) || 0;
      const bt = lastUsedAt.get(b) || 0;
      if (at !== bt) return at - bt;
      return a.localeCompare(b);
    })[0];
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

    // High-substance technical pillars favor rich code snippets & architecture diagram cards
    const ourPosts = stateStore.state.ourPosts ? Object.values(stateStore.state.ourPosts) : [];
    const lastFormat = ourPosts[ourPosts.length - 1]?.format;

    if (lastFormat === "SINGLE_CARD") {
      return "TEXT_ONLY";
    }
    return "SINGLE_CARD";
  }

  /**
   * Generates dynamic post content, discussion captions, and visual specs
   * using the configured MiniMax M3 AI runtime.
   * Eliminates all hardcoded static caption dictionaries.
   */
  async generateDynamicPostContent(pillar, format = "TEXT_ONLY") {
    const founder = knowledge.getFounderInfo();
    const company = knowledge.getCompanyInfo();
    const pillars = knowledge.getContentPillars();
    const profiles = knowledge.getOfficialProfiles();
    const approved = knowledge.getApprovedServices();
    const metaUrl = knowledge.getMetaAutomationUrl() || profiles.founder.github || "";
    const metaHandle = metaUrl.replace(/^https?:\/\//, "").replace(/^www\./, "");
    const founderHandle = founder.threadsUsername || CONFIG.THREADS_USERNAME || "";
    const followHandle = founderHandle ? `@${founderHandle}` : "our profile";
    const slide5Subtitle = `Follow ${followHandle}${metaHandle ? ` • ${metaHandle}` : ""}`;
    const slide5Desc = `Follow ${followHandle} for real engineering workflows`;

    const prompt = `
CRITICAL OPERATIONAL CONSTRAINT:
You are acting as the Chief Content Strategist & Technical Architect for ${founder.name} (${founder.role} of ${company.name}). DO NOT invoke ANY tools. Output ONLY valid JSON matching the schema below.

Brand & Context:
- Founder: ${founder.name} (${founder.role})
- Company: ${company.name} (${company.summary})
${metaUrl ? `- Open-Source Repo: ${metaUrl} (Open-Source 24/7 Meta & Threads Agent with Termux:X11, Linux, Windows, macOS support)` : ""}
- Target Pillars:
${pillars.map(p => `  * ${p.id}: ${p.title} - ${p.description || p.focus || ""}`).join("\n")}

Current Post Directive:
- Selected Pillar: ${pillar}
- Post Format: ${format} (options: TEXT_ONLY, SINGLE_CARD, CAROUSEL, CODE_SNIPPET, ARCHITECTURE_DIAGRAM)

INSTRUCTIONS:
1. Generate an engaging, authentic, thought-provoking post for Threads:
   - Voice: ${founder.name} (${founder.role}, conversational, sharp, honest, no corporate fluff).
   - Hook: Catchy first 1-2 lines that stop the scroll.
   - Body: 1-2 insightful technical or operational sentences based on current industry/market trends.
   ${metaUrl ? `- GitHub Open-Source Highlight & Follower CTA: If pillar is "meta_automation" or relates to agentic AI, showcase the open-source GitHub repo (${metaUrl}). Invite developers, founders, and engineers to star/fork the repo, ask questions, and follow ${followHandle} for daily agentic AI and architecture breakdowns.` : ""}
   - Discussion Question & Soft Follower CTA: End with an open question inviting founders, developers, or operators to comment, plus a natural soft follow hook (e.g. "Follow ${followHandle} for daily breakdowns on agentic AI & software architecture").
   - CRITICAL LENGTH CONSTRAINT: Threads enforces a strict 500-character maximum per post. The "caption" MUST be between 180 and 420 characters. Keep it punchy and concise!
2. If format is SINGLE_CARD:
   - Provide "quote": A punchy, memorable 1-2 sentence quote or perspective for a dark-mode visual card.
   - Provide "badge": A short 2-3 word topic tag (e.g. "OPEN SOURCE AI", "FOUNDER MINDSET", "SYSTEMS ARCHITECTURE").
3. If format is CAROUSEL:
   - Provide exactly 5 slides for a mini-deck:
     * Slides 1-4: Core architecture, lessons, or operational breakdowns (title, subtitle, and 2-3 structured cards with num, title, desc).
     * Slide 5: Strategic takeaway with soft follower conversion CTA (e.g. title: "Star Open Source Repo", subtitle: "${slide5Subtitle}", cards: [{ num: "01", title: "Star on GitHub", desc: "Access the full production-ready multi-agent codebase" }, { num: "02", title: "Daily Architecture", desc: "${slide5Desc}" }]).
4. If format is CODE_SNIPPET:
   - Provide "code_title": Short title (e.g. "Agentic Concurrency Queue").
   - Provide "code_snippet": 6-10 clean, realistic lines of TypeScript/Node.js architecture code.
   - Provide "code_language": "javascript" or "typescript".
5. If format is ARCHITECTURE_DIAGRAM:
   - Provide "arch_title": System topology title (e.g. "Distributed Agent Pipeline").
   - Provide "arch_components": Array of 3-4 components with name and role.

OUTPUT STRICT JSON:
{
  "caption": "string",
  "quote": "string",
  "badge": "string",
  "carousel_slides": [
    {
      "title": "string",
      "subtitle": "string",
      "cards": [
        { "num": "01", "title": "string", "desc": "string" }
      ]
    }
  ],
  "code_title": "string or null",
  "code_snippet": "string or null",
  "code_language": "string or null",
  "arch_title": "string or null",
  "arch_components": [
    { "name": "string", "role": "string" }
  ]
}
`;

    try {
      const res = await aiRuntime.callAi(prompt, { taskType: "COMMENT_SYNTHESIS" });
      if (res && res.caption) {
        return res;
      }
      throw new Error("Empty post content returned from AI");
    } catch (e) {
      logger.error(`[THREADS POSTER] MiniMax M3 content generation failed: ${e.message}`);
      throw e;
    }
  }

  /**
   * Strictly verifies that the newly published post appears on the authenticated profile feed.
   */
  async verifyPostOnProfile(page, postText, username = null) {
    const founder = knowledge.getFounderInfo();
    const activeUsername = username || founder.threadsUsername || CONFIG.THREADS_USERNAME || "";
    const profileUrl = activeUsername ? `https://www.threads.com/@${activeUsername}` : "https://www.threads.com";
    logger.info(`[THREADS POSTER] Navigating to profile feed (${profileUrl}) for multi-signal live post verification...`);
    try {
      await page.goto(profileUrl, { waitUntil: "domcontentloaded", timeout: 35000 });
      await new Promise(r => setTimeout(r, 2500));

      const snippet = postText.replace(/https?:\/\/[^\s]+/g, "").slice(0, 35).trim();
      for (let attempt = 1; attempt <= 6; attempt++) {
        if (attempt === 3) {
          logger.info(`[THREADS POSTER] Attempt 3: Performing cache-busting reload on ${profileUrl} for newly indexed post...`);
          await page.reload({ waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
          await new Promise(r => setTimeout(r, 2500));
        }

        const found = await page.evaluate((snip) => {
          const cleanSnip = snip.toLowerCase().replace(/[^a-z0-9]/g, "");
          const articles = Array.from(document.querySelectorAll('article, [data-pressable-container="true"]'));
          return articles.some(a => {
            if (a.tagName === 'SCRIPT' || a.tagName === 'STYLE') return false;
            const content = (a.innerText || a.textContent || "").trim();
            const cleanContent = content.toLowerCase().replace(/[^a-z0-9]/g, "");
            return cleanContent.includes(cleanSnip) || content.includes(snip);
          });
        }, snippet);

        if (found) {
          logger.info(`[THREADS POSTER] ✅ Post verified present on @${activeUsername} profile feed DOM (attempt ${attempt}/6)!`);
          return { verified: true, reason: `Verified live on @${activeUsername} profile feed DOM` };
        }

        await page.evaluate(() => window.scrollBy({ top: 300, left: 0, behavior: "smooth" }));
        await new Promise(r => setTimeout(r, 2000));
      }

      return { verified: false, reason: `Post not found on @${activeUsername} profile feed DOM after submission` };
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

    // Dynamically generate fresh post content & visual specs via MiniMax M3 AI
    const dynamicContent = await this.generateDynamicPostContent(pillar, format);

    let postText = (options.text || dynamicContent.caption || "").trim();
    if (postText.length > 450) {
      const truncated = postText.slice(0, 440);
      const lastSentence = truncated.lastIndexOf(".");
      const lastQuestion = truncated.lastIndexOf("?");
      const cutoff = Math.max(lastSentence, lastQuestion);
      postText = cutoff > 200 ? truncated.slice(0, cutoff + 1) : truncated.trim();
    }
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
      mediaPaths = await threadsMedia.generateCarouselDeck(pillar, dynamicContent.carousel_slides);
    } else if (format === "SINGLE_CARD") {
      logger.info(`[THREADS POSTER] Generating single visual card for ${pillar}...`);
      const cardPath = await threadsMedia.generatePillarQuoteCard(pillar, dynamicContent);
      if (cardPath) mediaPaths.push(cardPath);
    } else if (format === "CODE_SNIPPET") {
      logger.info(`[THREADS POSTER] Generating dark-mode terminal code snippet card for ${pillar}...`);
      const cardPath = await threadsMedia.generateCodeSnippetCard({
        code_title: dynamicContent.code_title,
        code_snippet: dynamicContent.code_snippet,
        code_language: dynamicContent.code_language,
        badge: dynamicContent.badge,
        accentColor: "#00F0FF"
      });
      if (cardPath) mediaPaths.push(cardPath);
    } else if (format === "ARCHITECTURE_DIAGRAM") {
      logger.info(`[THREADS POSTER] Generating system architecture diagram card for ${pillar}...`);
      const cardPath = await threadsMedia.generateArchitectureCard({
        arch_title: dynamicContent.arch_title,
        arch_components: dynamicContent.arch_components,
        badge: dynamicContent.badge,
        accentColor: "#00F0FF"
      });
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

    // Locate the Post button element handle in Puppeteer (must be in the composer modal with y > 200)
    const postHandle = await page.evaluateHandle(() => {
      const buttons = [...document.querySelectorAll('div[role="button"], button')];
      const matching = buttons.filter(b => {
        const txt = (b.innerText || "").trim().toLowerCase();
        const aria = (b.getAttribute("aria-label") || "").trim().toLowerCase();
        const isEnabled = !b.disabled && b.getAttribute("aria-disabled") !== "true";
        const r = b.getBoundingClientRect();
        return (txt === "post" || aria === "post") && isEnabled && r.y > 200 && r.width > 0;
      });
      return matching[matching.length - 1] || null;
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
          const buttons = [...document.querySelectorAll('div[role="button"], button')];
          const postBtns = buttons.filter(b => {
            const txt = (b.innerText || "").trim().toLowerCase();
            const isEnabled = !b.disabled && b.getAttribute("aria-disabled") !== "true";
            return txt === "post" && isEnabled;
          });
          const targetBtn = postBtns[postBtns.length - 1] || postBtns[0];
          if (targetBtn) {
            targetBtn.focus();
            targetBtn.click();
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
    for (let check = 0; check < 20; check++) {
      await new Promise(r => setTimeout(r, 1000));
      const status = await page.evaluate(() => {
        const bodyText = document.body.innerText || "";
        const hasError = /\b(couldn'?t post|something went wrong|try again later|action blocked|rate limit)\b/i.test(bodyText);
        // Check if composer textbox or cancel button is still present
        const textbox = document.querySelector('div[contenteditable="true"]');
        const buttons = [...document.querySelectorAll('div[role="button"], button')];
        const hasCancel = buttons.some(b => (b.innerText || "").trim().toLowerCase() === "cancel");
        return { hasError, isStillOpen: !!(textbox && hasCancel) };
      });

      if (status.hasError) {
        break;
      }
      if (!status.isStillOpen) {
        isModalDismissed = true;
        break;
      }
    }

    // Give Threads backend a moment to process the newly submitted post
    if (isModalDismissed) {
      if (mediaPaths && mediaPaths.length > 0) {
        logger.info(`[THREADS POSTER] Monitoring in-flight media upload (${mediaPaths.length} attachments)...`);
        for (let upWait = 0; upWait < 15; upWait++) {
          const isStillUploading = await page.evaluate(() => {
            const text = (document.body.innerText || "").toLowerCase();
            const hasPostingToast = text.includes("posting...") || 
                                    text.includes("posting your thread") || 
                                    text.includes("finishing up") || 
                                    text.includes("uploading");
            const hasProgress = !!document.querySelector('[role="progressbar"], [data-upload-state="uploading"]');
            return hasPostingToast || hasProgress;
          });

          if (!isStillUploading) {
            logger.info(`[THREADS POSTER] In-flight media upload toast/progress cleared after ${upWait + 1}s.`);
            break;
          }
          await new Promise(r => setTimeout(r, 1000));
        }
        // Buffer for Threads server-side media transcoding and ingestion
        await new Promise(r => setTimeout(r, 4500));
      } else {
        await new Promise(r => setTimeout(r, 3500));
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
      await page.evaluate(() => {
        const buttons = [...document.querySelectorAll('div[role="button"], button')];
        const cancelBtn = buttons.find(b => ["cancel", "discard"].includes((b.innerText || "").trim().toLowerCase()));
        if (cancelBtn) cancelBtn.click();
      }).catch(() => {});
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
    const profileVerify = await this.verifyPostOnProfile(page, postText);

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
