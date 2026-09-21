/**
 * src/platforms/facebook/facebook-profile.js
 * Manages the user's Public Facebook Profile feed and post monitoring.
 * Discovers incoming comments, visitor posts, and recent public updates via CDP.
 */

const CONFIG = require("../../../config");
const browserManager = require("../../browser/browser-manager");
const stateStore = require("../../storage/state-store");
const logger = require("../../logging/logger");

class FacebookProfileManager {
  /**
   * Navigates to the user's personal/public Facebook profile.
   */
  async navigateToProfile() {
    const page = await browserManager.getFacebookPage();
    if (!page.url().includes("/me") && !page.url().includes("profile.php")) {
      logger.info("[FACEBOOK PROFILE] Navigating to user profile (https://www.facebook.com/me)...");
      await page.goto("https://www.facebook.com/me", {
        waitUntil: "domcontentloaded",
        timeout: 45000
      });
      await new Promise(r => setTimeout(r, 3000));
    }
    return page;
  }

  /**
   * Scans the user's public profile timeline for posts, interactions, and questions.
   */
  async scanProfileFeed(options = {}) {
    const maxPosts = options.maxPosts || 10;
    const scrollStep = options.scrollStep || 450;
    const waitAfterScroll = options.waitAfterScroll || 1500;

    let browser = null;
    let page = null;

    try {
      browser = await browserManager.connect();
      page = await this.navigateToProfile();

      logger.info(`[FACEBOOK PROFILE] Scanning public timeline for updates (limit: ${maxPosts})...`);

      const discovered = [];
      let scannedCount = 0;
      let newCount = 0;

      // Expand visible "See more" triggers
      await page.evaluate(() => {
        const seeMoreBtns = document.querySelectorAll("div[role='button']");
        for (const btn of seeMoreBtns) {
          if ((btn.innerText || "").toLowerCase().includes("see more")) {
            try { btn.click(); } catch (e) {}
          }
        }
      });

      for (let s = 0; s < 4; s++) {
        const postsData = await page.evaluate(() => {
          // Select feed post containers
          const postCards = Array.from(document.querySelectorAll("div[role='article'], div[data-ad-preview='message'], div[data-pagelet*='FeedUnit']"));

          return postCards.map(el => {
            // Find permalink
            const linkEl = el.querySelector("a[href*='/posts/'], a[href*='/permalink/'], a[href*='story_fbid=']");
            const url = linkEl ? linkEl.href : "";

            // Author name
            const authorEl = el.querySelector("h2 a, h3 a, strong a, span[dir='auto'] strong, [role='link'] strong");
            const username = authorEl ? authorEl.innerText.trim().replace(/[\r\n]+/g, " ") : "facebook_user";

            // Post content
            const messageEl = el.querySelector("div[dir='auto'][style*='text-align'], div[data-ad-comet-preview='message'], div[dir='auto']");
            const text = messageEl ? messageEl.innerText.trim() : "";

            // ID extraction
            const fbidMatch = url.match(/story_fbid=([^&]+)/) || url.match(/\/posts\/([a-zA-Z0-9_-]+)/) || url.match(/\/permalink\/([a-zA-Z0-9_-]+)/);
            const postId = fbidMatch ? fbidMatch[1] : (url || `fb_${Math.abs(text.slice(0, 40).split('').reduce((a,b)=>{a=((a<<5)-a)+b.charCodeAt(0);return a&a},0))}`);

            return {
              postId,
              url,
              username,
              text,
              platform: "facebook"
            };
          }).filter(p => p.text && p.text.length > 15);
        });

        for (const p of postsData) {
          scannedCount++;
          if (!stateStore.state.posts[p.postId] && !stateStore.state.posts[`facebook:${p.postId}`]) {
            stateStore.addDiscoveredPost({
              postId: p.postId,
              username: p.username,
              url: p.url,
              text: p.text,
              source: "FACEBOOK_PROFILE",
              platform: "facebook",
              discoveredAt: new Date().toISOString()
            }, "facebook");
            newCount++;
            discovered.push(p);
          }
          if (discovered.length >= maxPosts) break;
        }

        if (discovered.length >= maxPosts) break;

        await page.evaluate((step) => window.scrollBy({ top: step, behavior: "smooth" }), scrollStep);
        await new Promise(r => setTimeout(r, waitAfterScroll));
      }

      stateStore.state.stats.total_scanned += scannedCount;
      stateStore.saveState();

      logger.info(`[FACEBOOK PROFILE] Scan complete: ${scannedCount} visible, ${newCount} newly registered`, {
        scannedCount,
        newCount
      });

      return {
        scannedCount,
        newCount,
        posts: discovered
      };
    } catch (err) {
      logger.error(`[FACEBOOK PROFILE] Feed scan failed: ${err.message}`);
      throw err;
    }
  }
}

const facebookProfileManager = new FacebookProfileManager();
module.exports = {
  facebookProfileManager,
  scanFacebookProfileFeed: (opts) => facebookProfileManager.scanProfileFeed(opts),
  navigateToFacebookProfile: () => facebookProfileManager.navigateToProfile()
};
