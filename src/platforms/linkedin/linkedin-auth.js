/**
 * src/platforms/linkedin/linkedin-auth.js
 * Verifies that the existing browser CDP session is authenticated on LinkedIn.
 * Does NOT automate login, does NOT ask for passwords, does NOT save credentials.
 */

const CONFIG = require("../../../config");
const browserManager = require("../../browser/browser-manager");
const logger = require("../../logging/logger");

async function checkLinkedInAuth(options = { printResult: true }) {
  let browser = null;
  try {
    browser = await browserManager.connect();
    const page = await browserManager.getLinkedInPage();

    if (!page.url().includes("linkedin.com")) {
      await page.goto(CONFIG.LINKEDIN_HOME || "https://www.linkedin.com/feed/", {
        waitUntil: "domcontentloaded",
        timeout: 60000
      });
      await new Promise(r => setTimeout(r, 2500));
    }

    const authInfo = await page.evaluate(() => {
      const url = location.href;
      const title = document.title || "";

      const isLoginPage = url.includes("/login") || url.includes("/signup") || url.includes("/checkpoint") || title.toLowerCase().includes("log in") || title.toLowerCase().includes("sign in");
      
      const hasNav = Boolean(document.querySelector(".global-nav, nav.global-nav, #global-nav"));
      const hasMeNav = Boolean(document.querySelector(".global-nav__me, button[aria-label*='me' i], [data-control-name='nav.settings_dropdown']"));
      const hasFeed = url.includes("/feed") || Boolean(document.querySelector(".feed-shared-update-v2, [data-view-name='feed-full-update']"));
      const hasPostTrigger = Boolean(document.querySelector("button.share-box-feed-entry__trigger, [aria-label*='Start a post' i], .share-box"));

      // Extract user name if available in sidebar card
      const profileCardName = document.querySelector(".feed-identity-module__actor-meta a, .identity-headline, [data-view-name='identity-card'] .t-16");
      const name = profileCardName ? profileCardName.innerText.trim() : "";

      const isAuthenticated = !isLoginPage && (hasNav || hasMeNav || hasFeed || hasPostTrigger);

      return {
        url,
        title,
        name,
        isAuthenticated,
        hasNav,
        hasFeed,
        hasPostTrigger,
        isLoginPage
      };
    });

    if (options.printResult) {
      if (authInfo.isAuthenticated) {
        console.log("\n==============================================");
        console.log("           LINKEDIN AUTHENTICATED");
        console.log("==============================================");
        console.log(`✓ CDP Connected: ${CONFIG.CDP_URL}`);
        console.log(`✓ Page URL     : ${authInfo.url}`);
        console.log(`✓ Page Title   : ${authInfo.title}`);
        if (authInfo.name) {
          console.log(`✓ Account      : ${authInfo.name}`);
        }
        console.log("✓ Session      : Active authenticated LinkedIn account detected");
        console.log("==============================================\n");
      } else {
        console.log("\n==============================================");
        console.log("      LINKEDIN AUTHENTICATION REQUIRED");
        console.log("==============================================");
        console.log("❌ LinkedIn session is not authenticated.");
        console.log("Please open LinkedIn in your browser and log in manually, then run:\n");
        console.log("   node threads-agent.js auth linkedin\n");
        console.log("==============================================\n");
      }
    }

    logger.info("LinkedIn auth check", { isAuthenticated: authInfo.isAuthenticated, url: authInfo.url });
    return authInfo;
  } catch (err) {
    if (options.printResult) {
      console.log("\n==============================================");
      console.log("        LINKEDIN AUTH CHECK FAILED");
      console.log("==============================================");
      console.log(`❌ Error: ${err.message}`);
      console.log("==============================================\n");
    }
    logger.error("LinkedIn auth check error", { error: err.message });
    return { isAuthenticated: false, error: err.message };
  }
}

module.exports = {
  checkLinkedInAuth
};
