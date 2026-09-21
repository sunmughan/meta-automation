/**
 * src/platforms/facebook/facebook-auth.js
 * Inspects active browser CDP session on Facebook.
 * Detects whether the user is authenticated on Facebook without automating login or collecting credentials.
 */

const CONFIG = require("../../../config");
const browserManager = require("../../browser/browser-manager");
const logger = require("../../logging/logger");

async function checkFacebookAuth(options = { printResult: true }) {
  let browser = null;
  try {
    browser = await browserManager.connect();
    const page = await browserManager.getFacebookPage();

    if (!page.url().includes("facebook.com")) {
      await page.goto(CONFIG.FACEBOOK_HOME || "https://www.facebook.com/", {
        waitUntil: "domcontentloaded",
        timeout: 60000
      });
      await new Promise(r => setTimeout(r, 2500));
    }

    const authInfo = await page.evaluate(() => {
      const url = location.href;
      const title = document.title || "";

      const isLoginPage = url.includes("/login") || url.includes("/recover") || title.toLowerCase().includes("log into facebook") || title.toLowerCase().includes("log in to facebook");

      // Key Facebook authenticated indicators
      const hasNav = Boolean(document.querySelector("[role='navigation'], div[aria-label*='Facebook' i]"));
      const hasFeed = Boolean(document.querySelector("[role='feed'], [role='main']"));
      const hasProfileTrigger = Boolean(document.querySelector("[aria-label*='Your profile' i], [aria-label*='Account Controls' i], svg[aria-label*='Your profile' i]"));
      const hasCreatePost = Boolean(document.querySelector("[aria-label*='Create a post' i], div[role='button'][tabindex='0'][aria-label*='mind' i]"));

      // Profile name extraction if visible in top bar or profile button
      const profileBtn = document.querySelector("[aria-label*='Your profile' i], a[href*='/me/'], a[href*='facebook.com/me']");
      const name = profileBtn ? (profileBtn.getAttribute("aria-label") || profileBtn.innerText || "").replace(/your profile/i, "").trim() : "";

      const isAuthenticated = !isLoginPage && (hasProfileTrigger || (hasNav && (hasFeed || hasCreatePost)));

      return {
        url,
        title,
        name,
        isAuthenticated,
        hasNav,
        hasFeed,
        hasProfileTrigger,
        hasCreatePost,
        isLoginPage
      };
    });

    if (options.printResult) {
      if (authInfo.isAuthenticated) {
        console.log("\n==============================================");
        console.log("           FACEBOOK AUTHENTICATED");
        console.log("==============================================");
        console.log(`✓ CDP Connected: ${CONFIG.CDP_URL}`);
        console.log(`✓ Page URL     : ${authInfo.url}`);
        console.log(`✓ Page Title   : ${authInfo.title}`);
        if (authInfo.name) {
          console.log(`✓ Profile Name : ${authInfo.name}`);
        }
        console.log("✓ Session      : Active authenticated Facebook session detected");
        console.log("==============================================\n");
      } else {
        console.log("\n==============================================");
        console.log("      FACEBOOK AUTHENTICATION REQUIRED");
        console.log("==============================================");
        console.log("❌ Facebook session is not authenticated.");
        console.log("Please open Facebook in your browser and log in manually, then run:\n");
        console.log("   node threads-agent.js auth facebook\n");
        console.log("==============================================\n");
      }
    }

    logger.info("Facebook auth check", { isAuthenticated: authInfo.isAuthenticated, url: authInfo.url });
    return authInfo;
  } catch (err) {
    if (options.printResult) {
      console.log("\n==============================================");
      console.log("        FACEBOOK AUTH CHECK FAILED");
      console.log("==============================================");
      console.log(`❌ Error: ${err.message}`);
      console.log("==============================================\n");
    }
    logger.error("Facebook auth check error", { error: err.message });
    return { isAuthenticated: false, error: err.message };
  }
}

module.exports = {
  checkFacebookAuth
};
