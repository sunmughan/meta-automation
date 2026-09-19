/**
 * src/platforms/threads/threads-auth.js
 * Verifies that the existing Brave session is authenticated on Threads.
 * Does NOT automate login, does NOT ask for passwords, does NOT save credentials.
 */

const CONFIG = require("../../../config");
const browserManager = require("../../browser/browser-manager");
const logger = require("../../logging/logger");

async function checkThreadsAuth(options = { printResult: true }) {
  let browser = null;
  try {
    browser = await browserManager.connect();
    const page = await browserManager.getThreadsPage();

    // Verify current URL is on Threads
    if (!page.url().includes("threads.com") && !page.url().includes("threads.net")) {
      await page.goto(CONFIG.THREADS_HOME, {
        waitUntil: "domcontentloaded",
        timeout: 60000
      });
      await new Promise(r => setTimeout(r, 2500));
    }

    const authInfo = await page.evaluate(() => {
      const url = location.href;
      const title = document.title || "";
      const bodyText = document.body ? document.body.innerText : "";

      const loginLinks = [...document.querySelectorAll('a[href*="/login"], a[href*="login"]')].map(a => ({
        text: a.innerText.trim(),
        href: a.href
      }));

      const hasForYou = bodyText.includes("For you") || bodyText.includes("Following");
      const hasWhatsNew = bodyText.includes("What's new?") || Boolean(document.querySelector('[aria-label*="Create"], [aria-label*="Post"]'));
      const hasNavProfile = Boolean(document.querySelector('a[href*="/@"], a[href^="/@"]'));

      const isLoginPage = url.includes("/login") || title.toLowerCase().includes("log in");
      const isAuthenticated = !isLoginPage && loginLinks.length === 0 && (hasForYou || hasWhatsNew || hasNavProfile || title.includes("Home • Threads"));

      return {
        url,
        title,
        isAuthenticated,
        loginLinksCount: loginLinks.length,
        hasForYou,
        hasWhatsNew,
        hasNavProfile
      };
    });

    if (options.printResult) {
      if (authInfo.isAuthenticated) {
        console.log("\n==============================================");
        console.log("           THREADS AUTHENTICATED");
        console.log("==============================================");
        console.log(`✓ CDP Connected: ${CONFIG.CDP_URL}`);
        console.log(`✓ Page URL     : ${authInfo.url}`);
        console.log(`✓ Page Title   : ${authInfo.title}`);
        console.log("✓ Session      : Active authenticated account detected");
        console.log("==============================================\n");
      } else {
        console.log("\n==============================================");
        console.log("      THREADS AUTHENTICATION REQUIRED");
        console.log("==============================================");
        console.log("❌ Threads session is not authenticated.");
        console.log("Please open Threads in Brave and log in manually, then run:\n");
        console.log("   node threads-agent.js auth\n");
        console.log("==============================================\n");
      }
    }

    logger.info("Threads auth check", { isAuthenticated: authInfo.isAuthenticated });
    return authInfo;
  } catch (err) {
    if (options.printResult) {
      console.error("\n==============================================");
      console.log("      THREADS AUTHENTICATION REQUIRED");
      console.log("==============================================");
      console.error(`❌ Connection failed: ${err.message}\n`);
      console.log("To connect to your existing logged-in Brave session, run:");
      console.log("   ./scripts/launch-brave-cdp.sh --restart\n");
    }
    logger.error("Threads auth check failed", err);
    return {
      url: null,
      title: null,
      isAuthenticated: false,
      error: err.message
    };
  }
}

module.exports = {
  checkThreadsAuth
};
