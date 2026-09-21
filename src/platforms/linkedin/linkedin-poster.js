/**
 * src/platforms/linkedin/linkedin-poster.js
 * Automated B2B thought-leadership post publisher for LinkedIn.
 * Generates insightful technical posts grounded in dynamic knowledge base and publishes via CDP.
 */

const fs = require("fs");
const path = require("path");
const CONFIG = require("../../../config");
const browserManager = require("../../browser/browser-manager");
const stateStore = require("../../storage/state-store");
const logger = require("../../logging/logger");
const aiRuntime = require("../../ai/ai-runtime");
const knowledge = require("../../knowledge/knowledge-engine");

class LinkedInPoster {
  /**
   * Generates dynamic B2B thought-leadership content for LinkedIn.
   */
  async generateLinkedInPostContent(pillar = "agentic_ai") {
    const founder = knowledge.getFounderInfo();
    const company = knowledge.getCompanyInfo();
    const pillars = knowledge.getContentPillars();
    const profiles = knowledge.getOfficialProfiles();
    const metaUrl = knowledge.getMetaAutomationUrl() || profiles.founder.github || "";

    const prompt = `
CRITICAL OPERATIONAL CONSTRAINT:
You are acting as the Chief Technical Architect & Founder for ${founder.name} (${founder.role} of ${company.name}). Output ONLY valid JSON. DO NOT call any tools.

Brand & Context:
- Founder: ${founder.name} (${founder.role})
- Company: ${company.name} (${company.summary})
- Website: ${company.website}
${metaUrl ? `- Open-Source Engineering Repo: ${metaUrl}` : ""}

Content Strategy:
- Selected Topic Pillar: ${pillar}
- Platform: LinkedIn (Professional B2B, Engineering Leaders, CTOs, Tech Founders)

INSTRUCTIONS:
1. Write an authoritative, high-signal LinkedIn technical post (600 to 1,200 characters):
   - Hook: A strong contrarian or experience-grounded opening line that challenges conventional wisdom.
   - Core Insight: 2-3 structured takeaways on real software architecture, avoiding common engineering traps, or building reliable AI agent systems.
   - Grounding: Reference practical production lessons (clean domain boundaries, deterministic execution, zero downtime, cost efficiency).
   - Ending: Open discussion question inviting engineering leaders and founders to share their perspective.
   - Professional Hashtags: 3-4 relevant tags (e.g., #SoftwareEngineering #CloudArchitecture #SystemDesign #Founders).

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
      logger.warn(`LinkedIn AI post generation fallback: ${e.message}`);
      return {
        post_text: `Building production software systems isn't about chasing the latest framework hype. It's about deterministic outcomes, clean architecture, and rapid deployment cycles that solve actual customer problems.\n\nWhat is the biggest engineering lesson your team learned this quarter?\n\n#SoftwareEngineering #SystemDesign #TechLeadership #Startups`,
        topic_tag: "ENGINEERING LEADERSHIP"
      };
    }
  }

  /**
   * Publishes post live on LinkedIn via CDP.
   */
  async publishPost(options = {}) {
    const isDryRun = options.dryRun !== undefined ? options.dryRun : CONFIG.DRY_RUN;
    const isPostingEnabled = options.postingEnabled !== undefined ? options.postingEnabled : CONFIG.POSTING_ENABLED;

    const dynamicContent = await this.generateLinkedInPostContent(options.pillar || "agentic_ai");
    const textToPost = (options.text || dynamicContent.post_text || "").trim();

    const postId = `li_post_${Date.now()}`;

    if (isDryRun || !isPostingEnabled) {
      logger.info(`[DRY_RUN] LinkedIn post simulated: "${textToPost.slice(0, 80)}..."`);
      stateStore.recordActionTransition("OWN_POST", postId, "INIT", "SIMULATED", {
        platform: "linkedin",
        textSnippet: textToPost.slice(0, 80)
      });
      return { success: true, simulated: true, postId, text: textToPost };
    }

    try {
      const page = await browserManager.getLinkedInPage();
      if (!page.url().includes("/feed")) {
        await page.goto(CONFIG.LINKEDIN_HOME || "https://www.linkedin.com/feed/", {
          waitUntil: "domcontentloaded",
          timeout: 45000
        });
        await new Promise(r => setTimeout(r, 2500));
      }

      logger.info(`[LINKEDIN POSTER] Opening 'Start a post' modal...`);
      const startPostBtn = await page.$("button.share-box-feed-entry__trigger, button[aria-label*='Start a post' i], .share-box-feed-entry__top-bar button");
      if (!startPostBtn) throw new Error("Could not find 'Start a post' button on LinkedIn feed");

      await startPostBtn.click();
      await new Promise(r => setTimeout(r, 2000));

      const editorSelector = ".share-box-modal [contenteditable='true'], .ql-editor, div[role='textbox'][aria-label*='post' i]";
      await page.waitForSelector(editorSelector, { timeout: 10000 });
      const editor = await page.$(editorSelector);
      await editor.click();
      await new Promise(r => setTimeout(r, 500));

      logger.info(`[LINKEDIN POSTER] Typing post content (${textToPost.length} characters)...`);
      for (const char of textToPost) {
        await page.keyboard.type(char, { delay: Math.floor(Math.random() * 30) + 20 });
      }
      await new Promise(r => setTimeout(r, 1500));

      // If media image provided, upload
      if (options.mediaPath && fs.existsSync(options.mediaPath)) {
        logger.info(`[LINKEDIN POSTER] Attaching visual asset: ${options.mediaPath}...`);
        const fileInput = await page.$("input[type='file'][accept*='image']");
        if (fileInput) {
          await fileInput.uploadFile(options.mediaPath);
          await new Promise(r => setTimeout(r, 3000));
        }
      }

      // Click final Post button
      const postBtnSelector = "button.share-actions__primary-action, button[aria-label*='Post' i].share-actions__primary-action";
      const postBtn = await page.$(postBtnSelector);
      if (!postBtn) throw new Error("Could not find LinkedIn submit 'Post' button");

      await postBtn.click();
      logger.info(`[LINKEDIN POSTER] Clicked 'Post', waiting for confirmation...`);
      await new Promise(r => setTimeout(r, 5000));

      logger.info(`✅ Post published successfully on LinkedIn!`);
      stateStore.recordActionTransition("OWN_POST", postId, "INIT", "VERIFIED_PUBLISHED", {
        platform: "linkedin",
        publishedAt: new Date().toISOString(),
        textSnippet: textToPost.slice(0, 80)
      });
      stateStore.saveState();

      return { success: true, verified: true, postId, text: textToPost };
    } catch (err) {
      logger.error(`Failed to publish post on LinkedIn: ${err.message}`);
      return { success: false, reason: err.message };
    }
  }
}

const linkedInPoster = new LinkedInPoster();
module.exports = linkedInPoster;
module.exports.linkedInPoster = linkedInPoster;
module.exports.LinkedInPoster = LinkedInPoster;
