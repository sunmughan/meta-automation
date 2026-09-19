/**
 * src/platforms/instagram/instagram-feed.js
 * Instagram post scanner and lead extractor.
 * Connects to authenticated Instagram session via CDP.
 */

const CONFIG = require("../../../config");
const browserManager = require("../../browser/browser-manager");
const stateStore = require("../../storage/state-store");
const logger = require("../../logging/logger");

async function scanInstagramFeed(options = {}) {
  const maxPosts = options.maxPosts || 25;
  logger.info(`Scanning Instagram feed (up to ${maxPosts} posts)...`, { action: "INSTAGRAM_SCAN_START" });

  const page = await browserManager.getInstagramPage();

  await page.goto(CONFIG.INSTAGRAM_HOME, {
    waitUntil: "domcontentloaded",
    timeout: 60000
  });
  await new Promise(r => setTimeout(r, 2500));

  const extracted = await page.evaluate(() => {
    const results = [];
    const articles = [...document.querySelectorAll('article')];

    for (const art of articles) {
      const authorLink = art.querySelector('a[role="link"][tabindex="0"]');
      const username = authorLink ? (authorLink.innerText || "").trim().replace(/\n.*$/, "") : "";

      // Post link
      const postLink = art.querySelector('a[href*="/p/"]');
      const href = postLink ? postLink.href : "";
      const match = href.match(/\/p\/([^/?#]+)/);
      const postId = match ? match[1] : null;

      // Caption text
      const captionEl = art.querySelector('span[dir="auto"], h1, div[role="button"] ~ span');
      const text = (captionEl ? captionEl.innerText : art.innerText || "").trim();

      if (postId && username && text.length > 15) {
        results.push({
          username,
          postId,
          url: href || `https://www.instagram.com/p/${postId}/`,
          text
        });
      }
    }
    return results;
  });

  const newlyDiscovered = [];
  for (const post of extracted) {
    if (!stateStore.hasPost(post.postId, "instagram")) {
      stateStore.addDiscoveredPost(post, "instagram");
      newlyDiscovered.push(post);
    }
  }

  logger.info(`Instagram feed scan complete. Scanned: ${extracted.length}, Newly Discovered: ${newlyDiscovered.length}`, {
    action: "INSTAGRAM_SCAN_COMPLETE",
    scannedCount: extracted.length,
    newCount: newlyDiscovered.length
  });

  return {
    scannedCount: extracted.length,
    newCount: newlyDiscovered.length,
    newlyDiscovered
  };
}

module.exports = {
  scanInstagramFeed
};
