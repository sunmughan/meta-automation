/**
 * src/platforms/instagram/instagram-auth.js
 * Verifies that the existing Brave session is authenticated on Instagram.
 * Does NOT automate login, does NOT ask for passwords, does NOT save credentials.
 */

const CONFIG = require("../../../config");
const browserManager = require("../../browser/browser-manager");
const logger = require("../../logging/logger");

async function checkInstagramAuth(options = { printResult: true }) {
  let browser = null;
  try {
    browser = await browserManager.connect();
    const page = await browserManager.getInstagramPage();

    // Navigate to Instagram if not already there
    if (!page.url().includes("instagram.com")) {
      await page.goto(CONFIG.INSTAGRAM_HOME, {
        waitUntil: "domcontentloaded",
        timeout: 60000
      });
      await new Promise(r => setTimeout(r, 2500));
    }

    const authInfo = await page.evaluate(() => {
      const url = location.href;
      const title = document.title || "";

      // Check login indicators
      const hasLoginForm = Boolean(document.querySelector('input[name="username"], input[name="password"], form#loginForm'));
      const loginLinks = [...document.querySelectorAll('a[href*="/accounts/login/"]')];

      // Check authenticated navigation elements
      const hasDirectMessages = Boolean(document.querySelector('a[href*="/direct/inbox/"], svg[aria-label*="Messages"], svg[aria-label*="Direct"]'));
      const hasHomeIcon = Boolean(document.querySelector('svg[aria-label="Home"], svg[aria-label="Search"], svg[aria-label="Explore"]'));
      const hasProfileAvatar = Boolean(document.querySelector('img[alt*="profile picture"], a[href^="/"][role="link"] img'));

      const isLoginPage = url.includes("/accounts/login") || hasLoginForm || loginLinks.length > 0;
      const isAuthenticated = !isLoginPage && (hasDirectMessages || hasHomeIcon || hasProfileAvatar);

      return {
        url,
        title,
        isAuthenticated,
        hasDirectMessages,
        hasHomeIcon
      };
    });

    if (options.printResult) {
      if (authInfo.isAuthenticated) {
        console.log("\n==============================================");
        console.log("          INSTAGRAM AUTHENTICATED");
        console.log("==============================================");
        console.log(`✓ CDP Connected: ${CONFIG.CDP_URL}`);
        console.log(`✓ Page URL     : ${authInfo.url}`);
        console.log(`✓ Page Title   : ${authInfo.title}`);
        console.log("✓ Session      : Active authenticated account detected");
        console.log("==============================================\n");
      } else {
        console.log("\n==============================================");
        console.log("     INSTAGRAM AUTHENTICATION REQUIRED");
        console.log("==============================================");
        console.log("❌ Instagram session is not authenticated.");
        console.log("Please open Instagram in Brave and log in manually, then run:\n");
        console.log("   node threads-agent.js auth\n");
        console.log("==============================================\n");
      }
    }

    logger.info("Instagram auth check", { isAuthenticated: authInfo.isAuthenticated });
    return authInfo;
  } catch (err) {
    if (options.printResult) {
      console.error("\n==============================================");
      console.log("     INSTAGRAM AUTHENTICATION REQUIRED");
      console.log("==============================================");
      console.error(`❌ Connection failed: ${err.message}\n`);
      console.log("To connect to your existing logged-in Brave session, run:");
      console.log("   ./scripts/launch-brave-cdp.sh --restart\n");
    }
    logger.error("Instagram auth check failed", err);
    return {
      url: null,
      title: null,
      isAuthenticated: false,
      error: err.message
    };
  }
}

module.exports = {
  checkInstagramAuth
};
