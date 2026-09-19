/**
 * src/platforms/threads/threads-scanner.js
 * Infinite-scroll post scanner for Threads home feed.
 * Connects to existing authenticated Brave session via CDP.
 */

const CONFIG = require("../../../config");
const browserManager = require("../../browser/browser-manager");
const stateStore = require("../../storage/state-store");
const logger = require("../../logging/logger");

async function extractPostsFromDom(page) {
  return await page.evaluate(() => {
    const posts = new Map();
    const links = [...document.querySelectorAll('a[href*="/post/"]')];

    for (const link of links) {
      const match = link.href.match(/https:\/\/www\.threads\.com\/@([^/]+)\/post\/([^/?#]+)/);
      if (!match) continue;

      const username = match[1];
      const postId = match[2];
      const key = `${username}/${postId}`;

      if (posts.has(key)) continue;

      // Locate container article to isolate post text and prevent bleed from neighbors
      const container = link.closest('article, [data-pressable-container="true"], div[style*="border-bottom"]') || link.parentElement;
      let bestText = (container ? container.innerText : "").trim();

      if (!bestText || bestText.length < 20) {
        let node = link;
        for (let level = 0; level < 6 && node; level++) {
          const text = (node.innerText || "").trim();
          if (text.length > bestText.length && text.length < 3000) {
            bestText = text;
          }
          if (text.length >= 40 && text.length <= 2000) {
            break;
          }
          node = node.parentElement;
        }
      }

      if (!bestText || bestText.length < 20) continue;

      // Filter out stale posts older than 14 days or from prior years
      if (/\b\d{1,2}\/\d{1,2}\/(\d{4})\b/.test(bestText)) {
        const yearMatch = bestText.match(/\b\d{1,2}\/\d{1,2}\/(\d{4})\b/);
        const year = parseInt(yearMatch[1], 10);
        if (year < 2026) continue; // Skip posts from 2024, 2025
      }

      if (/\b(\d+)\s*w\b/i.test(bestText)) {
        const weekMatch = bestText.match(/\b(\d+)\s*w\b/i);
        const weeks = parseInt(weekMatch[1], 10);
        if (weeks > 2) continue; // Skip posts older than 2 weeks
      }

      posts.set(key, {
        username,
        postId,
        url: `https://www.threads.com/@${username}/post/${postId}`,
        text: bestText
      });
    }

    return [...posts.values()];
  });
}

async function scanThreadsFeed(options = {}) {
  const maxPosts = options.maxPosts || CONFIG.MAX_POSTS_PER_SCAN || 50;
  const maxNoGrowth = options.maxNoGrowth || 8;
  const scrollStep = options.scrollStep || 550;
  const waitAfterScroll = options.waitAfterScroll || 1300;

  logger.info(`Scanning Threads feed (aiming for up to ${maxPosts} posts)...`, { action: "THREADS_SCAN_START" });

  const page = await browserManager.getThreadsPage();
  await page.bringToFront();

  // Navigate to home feed if on messages, activity, or another page
  const currentUrl = page.url();
  if (!currentUrl.includes("threads.com") || currentUrl.includes("/messages") || currentUrl.includes("/activity")) {
    logger.info("Navigating back to Threads Home feed from subpage...", { currentUrl });
    const clickedHome = await page.evaluate(() => {
      const homeLink = document.querySelector('a[href="/"], svg[aria-label="Threads"]');
      if (homeLink) {
        const clickable = homeLink.closest('a, button, div[role="button"]') || homeLink;
        clickable.click();
        return true;
      }
      return false;
    });

    if (!clickedHome || page.url().includes("/messages")) {
      await page.goto(CONFIG.THREADS_HOME, {
        waitUntil: "domcontentloaded",
        timeout: 45000
      });
    }
    await new Promise(r => setTimeout(r, 2500));
  }

  const collectedMap = new Map();
  let noGrowth = 0;
  let lastCount = 0;

  for (let scrollCount = 0; scrollCount < 50; scrollCount++) {
    const batch = await extractPostsFromDom(page);
    for (const post of batch) {
      if (!collectedMap.has(post.postId)) {
        collectedMap.set(post.postId, post);
      }
    }

    if (collectedMap.size >= maxPosts) {
      logger.info(`Reached target post count (${collectedMap.size}/${maxPosts}). Finishing scroll.`);
      break;
    }

    if (collectedMap.size === lastCount) {
      noGrowth++;
      if (noGrowth >= maxNoGrowth) {
        logger.info(`End of feed or steady depth reached (${collectedMap.size} posts).`);
        break;
      }
    } else {
      noGrowth = 0;
      lastCount = collectedMap.size;
    }

    // Visible scroll on user's screen
    try {
      await page.mouse.move(650, 450);
      await page.evaluate((step) => {
        window.scrollBy({ top: step, left: 0, behavior: "smooth" });
      }, scrollStep);
      await page.mouse.wheel({ deltaY: scrollStep });
      await page.keyboard.press("PageDown");
    } catch (e) {
      await page.evaluate((step) => {
        window.scrollBy({ top: step, left: 0, behavior: "smooth" });
      }, scrollStep);
    }

    await new Promise(r => setTimeout(r, waitAfterScroll));
  }

  const allFoundPosts = [...collectedMap.values()];
  const newlyDiscovered = [];

  for (const post of allFoundPosts) {
    if (!stateStore.hasPost(post.postId, "threads")) {
      stateStore.addDiscoveredPost(post, "threads");
      newlyDiscovered.push(post);
    }
  }

  logger.info(`Threads feed scan complete. Scanned: ${allFoundPosts.length}, Newly Discovered: ${newlyDiscovered.length}`, {
    action: "THREADS_SCAN_COMPLETE",
    scannedCount: allFoundPosts.length,
    newCount: newlyDiscovered.length
  });

  return {
    scannedCount: allFoundPosts.length,
    newCount: newlyDiscovered.length,
    newlyDiscovered
  };
}

/**
 * Smoothly scrolls back to top and reloads the Threads feed to load fresh posts.
 */
async function refreshThreadsFeed(page) {
  logger.info("Refreshing Threads feed to load fresh posts...");
  try {
    await page.evaluate(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    await new Promise(r => setTimeout(r, 1000));
    await page.reload({ waitUntil: "domcontentloaded", timeout: 35000 });
    await new Promise(r => setTimeout(r, 2500));
  } catch (e) {
    await page.goto(CONFIG.THREADS_HOME, { waitUntil: "domcontentloaded", timeout: 35000 }).catch(() => {});
  }
}

/**
 * Checks sidebar for unread badges on Messages and Notifications.
 */
async function checkSidebarBadges(page) {
  try {
    return await page.evaluate(() => {
      const items = [...document.querySelectorAll("a, button, div[role=\"button\"]")];
      let unreadDms = false;
      let unreadActivity = false;

      for (const el of items) {
        const text = (el.innerText || "").trim();
        const href = el.href || "";
        const aria = (el.getAttribute("aria-label") || "").toLowerCase();

        if (href.includes("/messages") || aria.includes("message")) {
          if (/\d+/.test(text) || /\d+/.test(aria)) {
            unreadDms = true;
          }
        }

        if (href.includes("/activity") || aria.includes("activity") || aria.includes("notification")) {
          if (/\d+/.test(text) || el.querySelector('[role="status"], [aria-label*="unread" i]')) {
            unreadActivity = true;
          }
        }
      }
      return { unreadDms, unreadActivity };
    });
  } catch (err) {
    return { unreadDms: false, unreadActivity: false };
  }
}

const HIGH_INTENT_SEARCH_QUERIES = [
  "need a website",
  "looking for web developer",
  "who can build a website",
  "looking for website designer",
  "need an app developed",
  "looking for ai developer",
  "need someone to build MVP",
  "looking for freelance developer",
  "who can make a website",
  "need custom software",
  "looking for flutter developer",
  "ai chatbot for business",
  "need full stack developer",
  "looking for web development agency",
  "need someone to build a website",
  "recommend a web developer",
  "need an app developer",
  "looking to hire a developer",
  "who can build an app",
  "need software built"
];

/**
 * Searches high-intent buyer keywords directly on Threads to discover active leads.
 */
async function searchThreadsKeywords(options = {}) {
  const queryCount = options.queryCount || 2;
  const page = await browserManager.getThreadsPage();
  await page.bringToFront();

  if (typeof stateStore.state.searchIndex !== "number") {
    stateStore.state.searchIndex = 0;
  }

  const newlyDiscovered = [];
  const scannedPosts = [];

  for (let q = 0; q < queryCount; q++) {
    const idx = stateStore.state.searchIndex % HIGH_INTENT_SEARCH_QUERIES.length;
    stateStore.state.searchIndex = (stateStore.state.searchIndex + 1) % HIGH_INTENT_SEARCH_QUERIES.length;
    const query = HIGH_INTENT_SEARCH_QUERIES[idx];

    logger.info(`[SEARCH DISCOVERY] Searching Threads for high-intent query: "${query}" (Recent Filter)...`);
    // Crucial: filter=recent ensures we search current real-time requests, not ancient posts from past years
    const searchUrl = `https://www.threads.com/search?q=${encodeURIComponent(query)}&filter=recent`;

    try {
      await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 35000 });
      await new Promise(r => setTimeout(r, 2500));

      for (let s = 0; s < 3; s++) {
        await page.evaluate(() => window.scrollBy({ top: 600, left: 0, behavior: "smooth" }));
        await new Promise(r => setTimeout(r, 1200));
      }

      const batch = await extractPostsFromDom(page);
      for (const post of batch) {
        scannedPosts.push(post);
        if (!stateStore.hasPost(post.postId, "threads")) {
          stateStore.addDiscoveredPost(post, "threads");
          newlyDiscovered.push(post);
        }
      }
      logger.info(`[SEARCH DISCOVERY] Query "${query}" yielded ${batch.length} visible posts (${newlyDiscovered.length} new).`);
    } catch (err) {
      logger.warn(`Search query "${query}" issue: ${err.message}`);
    }
  }

  // Navigate back to home feed smoothly
  await page.goto(CONFIG.THREADS_HOME, { waitUntil: "domcontentloaded", timeout: 35000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 2000));

  stateStore.saveState();
  return {
    scannedCount: scannedPosts.length,
    newCount: newlyDiscovered.length,
    newlyDiscovered
  };
}

module.exports = {
  scanThreadsFeed,
  refreshThreadsFeed,
  checkSidebarBadges,
  searchThreadsKeywords,
  HIGH_INTENT_SEARCH_QUERIES
};
