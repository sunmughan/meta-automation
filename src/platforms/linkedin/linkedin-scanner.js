/**
 * src/platforms/linkedin/linkedin-scanner.js
 * Automated scanner for LinkedIn Home Feed & B2B Content Search Queries via CDP.
 * Extracts post text, author headline, URN identifier, and registers in stateStore.
 */

const CONFIG = require("../../../config");
const browserManager = require("../../browser/browser-manager");
const stateStore = require("../../storage/state-store");
const logger = require("../../logging/logger");

const HIGH_INTENT_LINKEDIN_QUERIES = [
  "looking for an agency to build",
  "need software developers",
  "seeking recommendations for web app",
  "looking for fullstack developer",
  "hire flutter developer",
  "need custom CRM software",
  "seeking dev shop MVP",
  "looking for AI automation engineer"
];

class LinkedInScanner {
  /**
   * Scans LinkedIn Home Feed.
   */
  async scanLinkedInFeed(options = {}) {
    const maxPosts = options.maxPosts || CONFIG.MAX_POSTS_PER_SCAN || 15;
    const scrollStep = options.scrollStep || 450;
    const waitAfterScroll = options.waitAfterScroll || 1200;

    let browser = null;
    let page = null;

    try {
      browser = await browserManager.connect();
      page = await browserManager.getLinkedInPage();

      if (!page.url().includes("/feed")) {
        await page.goto(CONFIG.LINKEDIN_HOME || "https://www.linkedin.com/feed/", {
          waitUntil: "domcontentloaded",
          timeout: 45000
        });
        await new Promise(r => setTimeout(r, 2500));
      }

      logger.info(`Starting LinkedIn Feed Scan (target: ${maxPosts} posts)...`, { action: "LINKEDIN_SCAN_START" });

      const discoveredPosts = [];
      let scannedCount = 0;
      let newCount = 0;

      // Expand visible "see more" buttons first
      await page.evaluate(() => {
        const seeMoreBtns = document.querySelectorAll(".feed-shared-inline-show-more-text button, button.see-more, [aria-label*='see more' i]");
        for (const btn of seeMoreBtns) {
          try { btn.click(); } catch (e) {}
        }
      });

      // Scroll and capture
      for (let s = 0; s < 5; s++) {
        const postsData = await page.evaluate(() => {
          let updates = Array.from(document.querySelectorAll("[role='listitem'][componentkey*='update-card'], [componentkey*='expanded'], .feed-shared-update-v2, [data-urn*='activity'], [data-view-name='feed-full-update']"));
          if (!updates.length) {
            const allDivs = Array.from(document.querySelectorAll("div"));
            updates = allDivs.filter(d => {
              const text = (d.innerText || "");
              return text.includes("Comment") && text.includes("Repost") && (d.getAttribute("role") === "listitem" || d.hasAttribute("componentkey"));
            });
          }

          // Deduplicate elements
          const seenKeys = new Set();
          return updates.map(el => {
            const urn = el.getAttribute("data-urn") || "";
            const compKey = el.getAttribute("componentkey") || el.getAttribute("id") || "";
            const permalinkEl = el.querySelector("a[href*='/feed/update/'], a[href*='/posts/']");
            const url = permalinkEl ? permalinkEl.href : (urn ? `https://www.linkedin.com/feed/update/${urn}` : "");
            
            const actorLink = el.querySelector("a[href*='/in/']");
            const actorNameEl = el.querySelector(".update-components-actor__name, .feed-shared-actor__name, [data-view-name='actor-title'] span, .update-components-actor__title");
            const username = actorNameEl ? actorNameEl.innerText.trim().replace(/[\r\n]+/g, " ") : (actorLink ? (actorLink.innerText || actorLink.href.split("/in/")[1]?.replace(/\//g, "")) : "linkedin_user");

            const headlineEl = el.querySelector(".update-components-actor__description, .feed-shared-actor__description");
            const headline = headlineEl ? headlineEl.innerText.trim().replace(/[\r\n]+/g, " ") : "";

            const textEl = el.querySelector(".feed-shared-update-v2__description, .update-components-text, .feed-shared-inline-show-more-text");
            const text = textEl ? textEl.innerText.trim() : (el.innerText || "").slice(0, 500).trim();

            const rawId = urn || compKey || (url.match(/urn:li:activity:([0-9]+)/) || [])[1] || `li_${Math.abs(text.slice(0, 40).split('').reduce((a,b)=>{a=((a<<5)-a)+b.charCodeAt(0);return a&a},0))}`;
            const postId = rawId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60);

            if (seenKeys.has(postId)) return null;
            seenKeys.add(postId);

            return {
              postId,
              url,
              username,
              headline,
              text,
              platform: "linkedin"
            };
          }).filter(p => p && p.text && p.text.length > 20);
        });

        for (const p of postsData) {
          scannedCount++;
          if (!stateStore.state.posts[p.postId] && !stateStore.state.posts[`linkedin:${p.postId}`]) {
            stateStore.addDiscoveredPost({
              postId: p.postId,
              username: p.username,
              headline: p.headline,
              url: p.url,
              text: p.text,
              source: "FEED",
              platform: "linkedin",
              discoveredAt: new Date().toISOString()
            }, "linkedin");
            newCount++;
            discoveredPosts.push(p);
          }
          if (discoveredPosts.length >= maxPosts) break;
        }

        if (discoveredPosts.length >= maxPosts) break;

        // Smooth scroll
        await page.evaluate((step) => window.scrollBy({ top: step, behavior: "smooth" }), scrollStep);
        await new Promise(r => setTimeout(r, waitAfterScroll));
      }

      stateStore.state.stats.total_scanned += scannedCount;
      stateStore.saveState();

      logger.info(`LinkedIn scan completed: ${scannedCount} visible, ${newCount} new`, {
        action: "LINKEDIN_SCAN_COMPLETE",
        scannedCount,
        newCount
      });

      return {
        scannedCount,
        newCount,
        posts: discoveredPosts
      };
    } catch (err) {
      logger.error(`LinkedIn feed scan failed: ${err.message}`, { action: "LINKEDIN_SCAN_ERROR" });
      throw err;
    }
  }

  /**
   * Searches LinkedIn Content posts by high-intent keywords.
   */
  async searchLinkedInKeywords(options = {}) {
    const query = options.query || HIGH_INTENT_LINKEDIN_QUERIES[Math.floor(Math.random() * HIGH_INTENT_LINKEDIN_QUERIES.length)];
    let browser = null;
    let page = null;

    try {
      browser = await browserManager.connect();
      page = await browserManager.getLinkedInPage();

      const searchUrl = `https://www.linkedin.com/search/results/content/?keywords=${encodeURIComponent(query)}&sortBy=%22date_posted%22`;
      logger.info(`[LINKEDIN SEARCH] Searching query: "${query}"...`);
      await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
      await new Promise(r => setTimeout(r, 3000));

      // Expand see more
      await page.evaluate(() => {
        const seeMoreBtns = document.querySelectorAll(".feed-shared-inline-show-more-text button, button.see-more");
        for (const btn of seeMoreBtns) {
          try { btn.click(); } catch (e) {}
        }
      });

      const postsData = await page.evaluate(() => {
        const updates = Array.from(document.querySelectorAll(".feed-shared-update-v2, [data-urn*='activity']"));
        return updates.map(el => {
          const urn = el.getAttribute("data-urn") || "";
          const permalinkEl = el.querySelector("a[href*='/feed/update/'], a[href*='/posts/']");
          const url = permalinkEl ? permalinkEl.href : "";
          
          const actorNameEl = el.querySelector(".update-components-actor__name, .feed-shared-actor__name");
          const username = actorNameEl ? actorNameEl.innerText.trim().replace(/[\r\n]+/g, " ") : "linkedin_user";

          const headlineEl = el.querySelector(".update-components-actor__description, .feed-shared-actor__description");
          const headline = headlineEl ? headlineEl.innerText.trim().replace(/[\r\n]+/g, " ") : "";

          const textEl = el.querySelector(".feed-shared-update-v2__description, .update-components-text, .feed-shared-inline-show-more-text");
          const text = textEl ? textEl.innerText.trim() : "";

          const postId = urn || (url.match(/urn:li:activity:([0-9]+)/) || [])[1] || `li_srch_${Math.abs(text.slice(0, 40).split('').reduce((a,b)=>{a=((a<<5)-a)+b.charCodeAt(0);return a&a},0))}`;

          return {
            postId,
            url,
            username,
            headline,
            text,
            platform: "linkedin"
          };
        }).filter(p => p.text && p.text.length > 20);
      });

      let newCount = 0;
      for (const p of postsData) {
        if (!stateStore.state.posts[p.postId] && !stateStore.state.posts[`linkedin:${p.postId}`]) {
          stateStore.addDiscoveredPost({
            postId: p.postId,
            username: p.username,
            headline: p.headline,
            url: p.url,
            text: p.text,
            source: "SEARCH",
            query,
            platform: "linkedin",
            discoveredAt: new Date().toISOString()
          }, "linkedin");
          newCount++;
        }
      }

      stateStore.saveState();
      return { query, scannedCount: postsData.length, newCount };
    } catch (err) {
      logger.error(`LinkedIn keyword search failed: ${err.message}`);
      return { query, scannedCount: 0, newCount: 0, error: err.message };
    }
  }
}

const linkedInScanner = new LinkedInScanner();
module.exports = {
  linkedInScanner,
  scanLinkedInFeed: (opts) => linkedInScanner.scanLinkedInFeed(opts),
  searchLinkedInKeywords: (opts) => linkedInScanner.searchLinkedInKeywords(opts)
};
