/**
 * src/platforms/facebook/facebook-search.js
 * High-Intent Targeted Keyword Search & Public Group Discovery Engine for Facebook via CDP.
 * Discovers real commercial client leads looking for web developers, MVP builders,
 * custom software agencies, and AI automation.
 */

const CONFIG = require("../../../config");
const browserManager = require("../../browser/browser-manager");
const stateStore = require("../../storage/state-store");
const knowledge = require("../../knowledge/knowledge-engine");
const logger = require("../../logging/logger");
const telemetry = require("../../telemetry/action-telemetry");

function getFacebookSearchQueries() {
  const queries = knowledge.getSearchQueries("facebook");
  return queries.length > 0 ? queries : ["looking for a web developer", "need someone to build a website"];
}

function getFacebookGroupTopics() {
  const topics = knowledge.getGroupTopics("facebook");
  return topics.length > 0 ? topics : ["SaaS Founders & Entrepreneurs", "Startup Founders Hub"];
}

class FacebookSearchEngine {
  get queries() {
    return getFacebookSearchQueries();
  }

  get groupTopics() {
    return getFacebookGroupTopics();
  }

  /**
   * Generates a targeted search URL for Facebook posts.
   */
  buildSearchUrl(query, recentOnly = true) {
    const encoded = encodeURIComponent(query);
    return `https://www.facebook.com/search/posts/?q=${encoded}`;
  }

  /**
   * Searches Facebook public posts for commercial buyer keywords.
   */
  async searchFacebookPosts(options = {}) {
    const query = options.query || this.queries[Math.floor(Math.random() * this.queries.length)];
    const maxPosts = options.maxPosts || 12;

    let browser = null;
    let page = null;

    try {
      browser = await browserManager.connect();
      page = await browserManager.getFacebookPage({ bringToFront: true });
      await page.bringToFront().catch(() => {});

      const searchUrl = this.buildSearchUrl(query);
      logger.info(`[FACEBOOK SEARCH] Searching high-intent query: "${query}"...`, { action: "FACEBOOK_SEARCH_START", query });
      await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
      await new Promise(r => setTimeout(r, 3500));

      const currentUrl = page.url();
      const title = await page.title().catch(() => "");
      if (!currentUrl.includes("facebook.com")) {
        throw new Error(`Facebook navigation verification failed: ${currentUrl}`);
      }
      telemetry.record({type:"NAVIGATION_VERIFIED", platform:"facebook", action:"SEARCH", targetId:query, evidence:{url:currentUrl,title}});

      // 1. Try to apply "Recent Posts" filter on left sidebar if present
      await page.evaluate(() => {
        const filterElements = Array.from(document.querySelectorAll("span, div[role='button'], a[role='tab']"));
        for (const el of filterElements) {
          const txt = (el.innerText || "").toLowerCase().trim();
          if (txt === "recent posts" || txt === "date posted" || txt === "most recent") {
            try {
              el.click();
              break;
            } catch (e) {}
          }
        }
      });
      await new Promise(r => setTimeout(r, 1500));

      // 2. Expand visible "See more" triggers
      await page.evaluate(() => {
        const seeMoreBtns = document.querySelectorAll("div[role='button']");
        for (const btn of seeMoreBtns) {
          if ((btn.innerText || "").toLowerCase().includes("see more")) {
            try { btn.click(); } catch (e) {}
          }
        }
      });

      const discoveredPosts = [];
      let scannedCount = 0;
      let newCount = 0;

      // 3. Scroll down and parse post feed cards
      for (let scroll = 0; scroll < 4; scroll++) {
        const postsData = await page.evaluate((searchQuery) => {
          // Select Facebook search feed item cards across Comet DOM variations
          let articles = Array.from(document.querySelectorAll("div[role='feed'] > div, div[role='article'], div[data-pagelet*='FeedUnit'], div[data-pagelet*='SearchResult'], div[role='main'] div[role='article']"));
          if (!articles.length) {
            articles = Array.from(document.querySelectorAll("div[role='main'] > div > div > div > div > div")).filter(d => {
              const t = d.innerText || "";
              return (t.includes("Like") || t.includes("Comment") || t.includes("Share")) && t.length > 50;
            });
          }

          const results = [];
          const seen = new Set();

          for (const el of articles) {
            // Find true individual post permalink (exclude generic search and home links)
            let url = "";
            const postLinks = Array.from(el.querySelectorAll("a[href*='/posts/'], a[href*='/permalink/'], a[href*='story_fbid='], a[href*='multi_permalinks='], a[href*='/photo/'], a[href*='/photo.php'], a[href*='/groups/']"));
            const validPostLink = postLinks.find(a => {
              const h = (a.getAttribute("href") || a.href || "").trim();
              return (h.includes("/posts/") || h.includes("/permalink/") || h.includes("story_fbid=") || h.includes("multi_permalinks=") || h.includes("/photo/") || (h.includes("/groups/") && (h.includes("/user/") || h.includes("/posts/") || h.includes("/permalink/")))) && !h.includes("/search/");
            });

            if (validPostLink) {
              url = validPostLink.href || validPostLink.getAttribute("href") || "";
            } else {
              // Try finding timestamp link
              const tsLinks = Array.from(el.querySelectorAll("span a[role='link'], h2 a[role='link'], h3 a[role='link'], a[role='link']"));
              const tsMatch = tsLinks.find(a => {
                const h = (a.getAttribute("href") || a.href || "").trim();
                return h && !h.includes("/search/") && (h.includes("/posts/") || h.includes("/permalink/") || h.includes("story_fbid=") || h.includes("multi_permalinks=") || h.includes("/photo/"));
              });
              if (tsMatch) url = tsMatch.href || tsMatch.getAttribute("href") || "";
            }

            if (url && url.startsWith("/")) {
              url = "https://www.facebook.com" + url;
            }

            // Find author
            let authorName = "";
            let authorProfileUrl = "";
            const authorCandidates = Array.from(el.querySelectorAll("h2 a, h3 a, h4 a, a[href*='profile.php'], a[href*='/user/'], strong a, a strong, span[dir='auto'] strong, [role='link'] strong, a[role='link']"));
            for (const cand of authorCandidates) {
              const rawT = (cand.innerText || "").trim().replace(/[\r\n]+/g, " ");
              const h = (cand.getAttribute("href") || cand.href || "").trim();
              if (rawT.length >= 2 && !/^(like|comment|share|follow|join|sponsored|public|group|see more|view|reactions?|\d+\s*[hmdws]|yesterday|just now)$/i.test(rawT)) {
                authorName = rawT;
                if (h && !h.includes("/search/") && !h.includes("/posts/")) {
                  authorProfileUrl = h.startsWith("/") ? "https://www.facebook.com" + h : h;
                }
                break;
              }
            }
            const username = authorName || "";

            // Find post text
            const textEl = el.querySelector("div[dir='auto'][style*='text-align'], div[data-ad-preview='message'], div[data-ad-comet-preview='message'], div[dir='auto']");
            let text = textEl ? textEl.innerText.trim() : (el.innerText || "").slice(0, 500).trim();
            text = text.replace(/Like\s*Comment\s*Share/gi, "").trim();

            // Extract group context if this is a group post
            const groupLink = el.querySelector("a[href*='/groups/']");
            const groupName = groupLink ? groupLink.innerText.trim().replace(/[\r\n]+/g, " ") : "";

            // ID extraction
            const fbidMatch = url.match(/story_fbid=([^&]+)/) || url.match(/\/posts\/([a-zA-Z0-9_-]+)/) || url.match(/\/permalink\/([a-zA-Z0-9_-]+)/) || url.match(/multi_permalinks=([0-9]+)/) || url.match(/fbid=([0-9]+)/);
            const postId = fbidMatch ? fbidMatch[1] : (url ? `fb_${Math.abs(url.split('').reduce((a,b)=>{a=((a<<5)-a)+b.charCodeAt(0);return a&a},0))}` : `fb_${Math.abs(text.slice(0, 30).split('').reduce((a,b)=>{a=((a<<5)-a)+b.charCodeAt(0);return a&a},0))}`);

            // A post can be commented on if it has a genuine individual URL or on-card trigger
            const hasValidIndividualUrl = Boolean(url && url.startsWith("http") && !url.includes("/search/"));
            const commentTrigger = el.querySelector("div[aria-label*='comment' i], div[aria-label*='reply' i], div[role='textbox']");
            const canComment = Boolean(commentTrigger || hasValidIndividualUrl);

            if (postId && !seen.has(postId) && text && text.length > 20) {
              seen.add(postId);
              results.push({
                postId,
                url: url || `https://www.facebook.com/search/posts/?q=${encodeURIComponent(searchQuery || "buyer")}&#${postId}`,
                username,
                authorName: authorName || username,
                authorProfileUrl,
                groupName,
                text,
                canComment,
                platform: "facebook"
              });
            }
          }

          return results;
        }, query);

        for (const p of postsData) {
          scannedCount++;
          if (!stateStore.state.posts[p.postId] && !stateStore.state.posts[`facebook:${p.postId}`]) {
            stateStore.addDiscoveredPost({
              postId: p.postId,
              username: p.username,
              authorProfileUrl: p.authorProfileUrl,
              groupName: p.groupName,
              url: p.url,
              text: p.text,
              source: p.groupName ? "FACEBOOK_GROUP_SEARCH" : "FACEBOOK_KEYWORD_SEARCH",
              query,
              canComment: p.canComment,
              platform: "facebook",
              discoveredAt: new Date().toISOString()
            }, "facebook");
            newCount++;
            discoveredPosts.push(p);
          }
          if (discoveredPosts.length >= maxPosts) break;
        }

        if (discoveredPosts.length >= maxPosts) break;

        // Smooth scroll
        await page.evaluate(() => window.scrollBy({ top: 500, behavior: "smooth" }));
        await new Promise(r => setTimeout(r, 1500));
      }

      stateStore.state.stats.total_scanned += scannedCount;
      stateStore.saveState();

      logger.info(`[FACEBOOK SEARCH] Query "${query}" finished: ${scannedCount} visible, ${newCount} newly registered.`, {
        action: "FACEBOOK_SEARCH_COMPLETE",
        query,
        scannedCount,
        newCount
      });

      return {
        query,
        scannedCount,
        newCount,
        posts: discoveredPosts
      };
    } catch (err) {
      logger.error(`[FACEBOOK SEARCH] Error searching query "${query}": ${err.message}`, { action: "FACEBOOK_SEARCH_ERROR" });
      return { query, scannedCount: 0, newCount: 0, error: err.message };
    }
  }

  /**
   * Searches and scans public groups for project posts & founder discussions.
   */
  async searchFacebookGroupPosts(options = {}) {
    const topic = options.topic || this.groupTopics[Math.floor(Math.random() * this.groupTopics.length)];
    const buyerQueries = getFacebookSearchQueries().slice(0, 6);
    const subQuery = buyerQueries[Math.floor(Math.random() * buyerQueries.length)] || "looking for developer";
    const combinedQuery = `${topic} ${subQuery}`;

    logger.info(`[FACEBOOK GROUP DISCOVERY] Scanning public group buyer inquiries for: "${combinedQuery}"...`);
    return this.searchFacebookPosts({
      query: combinedQuery,
      maxPosts: options.maxPosts || 10
    });
  }
}

const facebookSearchEngine = new FacebookSearchEngine();

module.exports = {
  facebookSearchEngine,
  getFacebookSearchQueries,
  getFacebookGroupTopics,
  get HIGH_INTENT_FACEBOOK_QUERIES() {
    return getFacebookSearchQueries();
  },
  get HIGH_INTENT_GROUP_TOPICS() {
    return getFacebookGroupTopics();
  },
  searchFacebookPosts: (opts) => facebookSearchEngine.searchFacebookPosts(opts),
  searchFacebookGroupPosts: (opts) => facebookSearchEngine.searchFacebookGroupPosts(opts)
};
