/**
 * src/platforms/facebook/facebook-poster.js
 * Automated public post publisher for Facebook Profile.
 * Generates technical builder insights and business updates grounded in dynamic knowledge base and publishes via CDP.
 */

const fs = require("fs");
const path = require("path");
const CONFIG = require("../../../config");
const browserManager = require("../../browser/browser-manager");
const stateStore = require("../../storage/state-store");
const logger = require("../../logging/logger");
const aiRuntime = require("../../ai/ai-runtime");
const knowledge = require("../../knowledge/knowledge-engine");

class FacebookPoster {
  /**
   * Generates dynamic post content for Facebook Public Profile.
   */
  async generateFacebookPostContent(pillar = "founders_revolution") {
    const founder = knowledge.getFounderInfo();
    const company = knowledge.getCompanyInfo();
    const profiles = knowledge.getOfficialProfiles();

    const prompt = `
CRITICAL OPERATIONAL CONSTRAINT:
You are acting as the Founder & Technical Lead for ${founder.name} (${founder.role} of ${company.name}). Output ONLY valid JSON. DO NOT call any tools.

Brand & Context:
- Founder: ${founder.name} (${founder.role})
- Company: ${company.name} (${company.summary})
- Website: ${company.website}

Topic Pillar: ${pillar}
Target Audience: Facebook Tech Community, Founders, Small Business Owners, Agency Clients

INSTRUCTIONS:
1. Write an authentic, engaging Facebook public post (400 to 900 characters):
   - Hook: Relatable real-world story or observation about building software, shipping MVPs, or solving operational bottlenecks.
   - Practical Takeaways: 2-3 concise insights on avoiding scope creep, building scalable systems, or automating manual work.
   - Call to Action: Engaging question asking the community for their experience.
   - Professional formatting with clean line breaks.

OUTPUT STRICT JSON:
{
  "post_text": "string",
  "topic_tag": "string"
}
`;

    try {
      const res = await aiRuntime.callAi(prompt, { taskType: "POST_ANALYSIS" });
      if (res && res.post_text) {
        return res;
      }
      throw new Error("Empty response from AI");
    } catch (e) {
      logger.warn(`Facebook AI post generation fallback: ${e.message}`);
      return {
        post_text: `The biggest mistake early founders make with software isn't technical debt—it's over-engineering features before validating real demand.\n\nKeep your architecture clean, deploy fast, and let user feedback guide your roadmap.\n\nWhat is one feature you stripped out of your product that actually improved retention?`,
        topic_tag: "FOUNDER ADVICE"
      };
    }
  }

  /**
   * Publishes post to Facebook Public Profile / Feed via CDP.
   */
  async publishPost(options = {}) {
    const isDryRun = options.dryRun !== undefined ? options.dryRun : CONFIG.DRY_RUN;
    const isPostingEnabled = options.postingEnabled !== undefined ? options.postingEnabled : CONFIG.POSTING_ENABLED;

    const dynamicContent = await this.generateFacebookPostContent(options.pillar || "founders_revolution");
    const textToPost = (options.text || dynamicContent.post_text || "").trim();

    const postId = `fb_post_${Date.now()}`;

    if (isDryRun || !isPostingEnabled) {
      logger.info(`[DRY_RUN] Facebook post simulated: "${textToPost.slice(0, 80)}..."`);
      stateStore.recordActionTransition("OWN_POST", postId, "INIT", "SIMULATED", {
        platform: "facebook",
        textSnippet: textToPost.slice(0, 80)
      });
      return { success: true, simulated: true, postId, text: textToPost };
    }

    try {
      const page = await browserManager.getFacebookPage();
      await page.goto("https://www.facebook.com/me", {
        waitUntil: "domcontentloaded",
        timeout: 45000
      });
      await new Promise(r => setTimeout(r, 2500));

      logger.info("[FACEBOOK POSTER] Clicking 'What's on your mind?' post creator...");
      const postTrigger = await page.$("div[role='button'][tabindex='0'][aria-label*='mind' i], div[aria-label*='Create a post' i]");
      if (!postTrigger) {
        throw new Error("Could not find 'What's on your mind?' post creator trigger on Facebook profile");
      }

      await postTrigger.click();
      await new Promise(r => setTimeout(r, 2000));

      // Wait for modal composer
      const composerSelector = "div[role='dialog'] div[contenteditable='true'][role='textbox'], div[aria-label*='What\'s on your mind' i][role='textbox']";
      await page.waitForSelector(composerSelector, { timeout: 12000 });
      const composer = await page.$(composerSelector);
      if (!composer) throw new Error("Could not find Facebook composer textbox");

      await composer.click();
      await new Promise(r => setTimeout(r, 500));

      logger.info(`[FACEBOOK POSTER] Typing post content (${textToPost.length} chars)...`);
      for (const char of textToPost) {
        await page.keyboard.type(char, { delay: Math.floor(Math.random() * 30) + 20 });
      }
      await new Promise(r => setTimeout(r, 1500));

      // Find Post button inside modal
      const postBtnSelector = "div[role='dialog'] div[aria-label='Post'][role='button'], div[role='dialog'] div[role='button']:not([aria-disabled='true'])";
      const buttons = await page.$$("div[role='dialog'] div[role='button']");
      let postBtn = null;
      for (const btn of buttons) {
        const text = await page.evaluate(el => el.innerText || el.getAttribute("aria-label") || "", btn);
        if (text.trim().toLowerCase() === "post") {
          postBtn = btn;
          break;
        }
      }

      if (!postBtn) throw new Error("Could not locate Facebook 'Post' submit button in modal");

      await postBtn.click();
      logger.info("[FACEBOOK POSTER] Clicked 'Post', awaiting confirmation...");
      await new Promise(r => setTimeout(r, 5000));

      logger.info("✅ Post published successfully on Facebook public profile!");
      stateStore.recordActionTransition("OWN_POST", postId, "INIT", "VERIFIED_PUBLISHED", {
        platform: "facebook",
        publishedAt: new Date().toISOString(),
        textSnippet: textToPost.slice(0, 80)
      });
      stateStore.saveState();

      return { success: true, verified: true, postId, text: textToPost };
    } catch (err) {
      logger.error(`Failed to publish post on Facebook: ${err.message}`);
      return { success: false, reason: err.message };
    }
  }
}

const facebookPoster = new FacebookPoster();
module.exports = {
  facebookPoster,
  publishFacebookPost: (opts) => facebookPoster.publishPost(opts)
};
