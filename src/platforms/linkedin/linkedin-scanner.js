/**
 * src/platforms/linkedin/linkedin-scanner.js
 * Automated scanner for LinkedIn Home Feed & B2B Content Search Queries via CDP.
 * Extracts post text, author headline, URN identifier, and registers in stateStore.
 */

const CONFIG = require("../../../config");
const browserManager = require("../../browser/browser-manager");
const stateStore = require("../../storage/state-store");
const knowledge = require("../../knowledge/knowledge-engine");
const logger = require("../../logging/logger");
const BrowserOperator = require("../../browser/browser-operator");
const telemetry = require("../../telemetry/action-telemetry");

function getLinkedInSearchQueries() {
  const queries = knowledge.getSearchQueries("linkedin");
  return queries.length > 0 ? queries : ["looking for web developer", "hire software developer"];
}

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
      page = await browserManager.getLinkedInPage({ bringToFront: true });
      await page.bringToFront().catch(() => {});

      if (!page.url().includes("/feed")) {
        await page.goto(CONFIG.LINKEDIN_HOME || "https://www.linkedin.com/feed/", {
          waitUntil: "domcontentloaded",
          timeout: 45000
        });
        await new Promise(r => setTimeout(r, 2500));
      }
      if (!page.url().includes("/feed")) {
        throw new Error(`LinkedIn feed navigation verification failed: ${page.url()}`);
      }
      telemetry.record({type:"NAVIGATION_VERIFIED",platform:"linkedin",action:"FEED_SCAN",targetId:"home",evidence:{url:page.url()}});

      logger.info(`Starting LinkedIn Feed Scan (target: ${maxPosts} posts)...`, { action: "LINKEDIN_SCAN_START" });

      const discoveredPosts = [];
      let scannedCount = 0;
      let newCount = 0;

      // Expand visible "see more" text truncation buttons only (never click options/action menus!)
      await page.evaluate(() => {
        const seeMoreBtns = Array.from(document.querySelectorAll(".feed-shared-inline-show-more-text button, button.see-more")).filter(b => {
          const text = (b.innerText || "").trim().toLowerCase();
          const label = (b.getAttribute("aria-label") || "").toLowerCase();
          if (label.includes("option") || label.includes("action") || label.includes("menu") || b.classList.contains("artdeco-dropdown__trigger")) {
            return false;
          }
          return text.includes("see more") || text.includes("more");
        });
        for (const btn of seeMoreBtns) {
          try { btn.click(); } catch (e) {}
        }
        // Dismiss any open dropdown context menus
        const openMenus = document.querySelectorAll(".artdeco-dropdown__content--is-open");
        if (openMenus.length) {
          document.body.click();
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
    const queries = getLinkedInSearchQueries();
    const query = options.query || queries[Math.floor(Math.random() * queries.length)];
    let browser = null;
    let page = null;

    try {
      browser = await browserManager.connect();
      page = await browserManager.getLinkedInPage({ bringToFront: true });
      await page.bringToFront().catch(() => {});

      const searchUrl = `https://www.linkedin.com/search/results/content/?keywords=${encodeURIComponent(query)}&sortBy=%22date_posted%22`;
      logger.info(`[LINKEDIN SEARCH] Searching query: "${query}"...`);
      await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
      await new Promise(r => setTimeout(r, 2500));
      if (!page.url().includes("/search/results/content/")) {
        throw new Error(`LinkedIn search navigation verification failed: ${page.url()}`);
      }
      telemetry.record({type:"NAVIGATION_VERIFIED",platform:"linkedin",action:"SEARCH",targetId:query,evidence:{url:page.url()}});

      // Scroll smoothly and expand see more so user sees live visual operation
      for (let s = 0; s < 3; s++) {
        await page.evaluate(() => {
          const seeMoreBtns = Array.from(document.querySelectorAll(".feed-shared-inline-show-more-text button, button.see-more")).filter(b => {
            const text = (b.innerText || "").trim().toLowerCase();
            const label = (b.getAttribute("aria-label") || "").toLowerCase();
            if (label.includes("option") || label.includes("action") || label.includes("menu") || b.classList.contains("artdeco-dropdown__trigger")) {
              return false;
            }
            return text.includes("see more") || text.includes("more");
          });
          for (const btn of seeMoreBtns) {
            try { btn.click(); } catch (e) {}
          }
          window.scrollBy({ top: 400, behavior: "smooth" });
        });
        await new Promise(r => setTimeout(r, 1000));
      }

      const postsData = await page.evaluate((currentSearchUrl, currentQuery) => {
        let updates = Array.from(document.querySelectorAll("div[role='listitem'][componentkey*='update-card'], .feed-shared-update-v2, [data-view-name='feed-full-update']"));
        if (!updates.length) {
          const commentButtons = Array.from(document.querySelectorAll("button")).filter(b => (b.innerText || "").trim().toLowerCase() === "comment");
          const cardSet = new Set();
          for (const btn of commentButtons) {
            let card = btn;
            for (let i = 0; i < 8 && card.parentElement; i++) {
              card = card.parentElement;
              if ((card.innerText || "").includes("Comment") && (card.innerText || "").length > 60) {
                break;
              }
            }
            if (card && !cardSet.has(card)) {
              cardSet.add(card);
              updates.push(card);
            }
          }
        }

        return updates.map(el => {
          const urn = el.getAttribute("data-urn") || "";
          const permalinkEl = el.querySelector("a[href*='/feed/update/'], a[href*='/posts/'], a[href*='activity']");
          const url = permalinkEl ? permalinkEl.href : currentSearchUrl;
          
          const actorLink = el.querySelector("a[href*='/in/'], a[href*='/company/']");
          const actorNameEl = el.querySelector(".update-components-actor__name, .feed-shared-actor__name, [data-view-name='actor-title'] span, .update-components-actor__title");
          const actorText = actorNameEl ? (actorNameEl.innerText || actorNameEl.textContent || "") : (actorLink ? (actorLink.innerText || actorLink.textContent || actorLink.href.split("/in/")[1]?.replace(/\//g, "") || "") : "");
          const username = String(actorText || "linkedin_user").trim().replace(/[\r\n]+/g, " ").replace(/Feed post/g, "").replace(/Follow/g, "").trim() || "linkedin_user";

          const headlineEl = el.querySelector(".update-components-actor__description, .feed-shared-actor__description");
          const headline = headlineEl ? (headlineEl.innerText || headlineEl.textContent || "").trim().replace(/[\r\n]+/g, " ") : "";

          const textEl = el.querySelector(".feed-shared-update-v2__description, .update-components-text, .feed-shared-inline-show-more-text");
          let text = textEl ? (textEl.innerText || textEl.textContent || "") : ((el.innerText || el.textContent || "").slice(0, 800));
          text = String(text || "").replace(/Feed post/g, "").replace(/Like\s*Comment\s*Repost\s*Send/gi, "").trim();

          const compKey = el.getAttribute("componentkey") || "";
          const postId = urn || (url.match(/urn:li:activity:([0-9]+)/) || [])[1] || (compKey ? `li_ck_${Math.abs(compKey.split('').reduce((a,b)=>{a=((a<<5)-a)+b.charCodeAt(0);return a&a},0))}` : `li_srch_${Math.abs(text.slice(0, 40).split('').reduce((a,b)=>{a=((a<<5)-a)+b.charCodeAt(0);return a&a},0))}`);

          return {
            postId,
            url,
            query: currentQuery,
            username,
            headline,
            text,
            platform: "linkedin"
          };
        }).filter(p => p.text && p.text.length > 20);
      }, searchUrl, query);

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
            query: p.query || query,
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
  getLinkedInSearchQueries,
  get HIGH_INTENT_LINKEDIN_QUERIES() {
    return getLinkedInSearchQueries();
  },
  scanLinkedInFeed: (opts) => linkedInScanner.scanLinkedInFeed(opts),
  searchLinkedInKeywords: (opts) => linkedInScanner.searchLinkedInKeywords(opts)
};
