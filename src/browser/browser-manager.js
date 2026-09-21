/**
 * src/browser/browser-manager.js
 * Puppeteer CDP connection manager for the existing authenticated Brave browser session.
 * Connects to http://127.0.0.1:9222, reuses open tabs for Threads & Instagram,
 * and maintains resilient session handling.
 */

const fs = require("fs");
const path = require("path");
const http = require("http");
const CONFIG = require("../../config");
const logger = require("../logging/logger");

let _puppeteer = null;
async function getPuppeteer() {
  if (!_puppeteer) {
    const mod = await import("puppeteer-core");
    _puppeteer = mod.default || mod;
  }
  return _puppeteer;
}

class BrowserManager {
  constructor() {
    this.browser = null;
    this.cdpUrl = CONFIG.CDP_URL;
  }

  /**
   * Fast check whether CDP port is open and responding.
   */
  async isCdpReachable(timeoutMs = 1500) {
    return new Promise(resolve => {
      try {
        const u = new URL(this.cdpUrl);
        const req = http.get(
          {
            hostname: u.hostname,
            port: u.port,
            path: "/json/version",
            timeout: timeoutMs
          },
          res => {
            resolve(res.statusCode === 200);
          }
        );
        req.on("error", () => resolve(false));
        req.on("timeout", () => {
          req.destroy();
          resolve(false);
        });
      } catch (e) {
        resolve(false);
      }
    });
  }

  /**
   * Connects to Brave Browser via CDP with retries.
   */
  async connect(retries = 3, delayMs = 2000) {
    if (this.browser && this.browser.connected) {
      return this.browser;
    }

    const puppeteer = await getPuppeteer();

    const reachable = await this.isCdpReachable();
    if (!reachable) {
      throw new Error(
        `Browser CDP is not reachable at ${this.cdpUrl}.\n` +
        `To attach to your logged-in session, launch your browser (Chrome, Edge, Brave, Chromium) with CDP:\n` +
        `  node scripts/launch-browser-cdp.js\n` +
        `  (or ./scripts/launch-brave-cdp.sh)\n` +
        `Your logged-in accounts (Threads, Instagram) and tabs will be fully preserved.`
      );
    }

    let lastError = null;
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        this.browser = await puppeteer.connect({
          browserURL: this.cdpUrl,
          defaultViewport: null
        });

        const version = await this.browser.version();
        logger.info(`Connected to browser: ${version}`, { action: "CDP_CONNECT" });
        return this.browser;
      } catch (err) {
        lastError = err;
        logger.warn(`CDP connect attempt ${attempt}/${retries} failed: ${err.message}`, { action: "CDP_CONNECT" });
        if (attempt < retries) {
          await new Promise(r => setTimeout(r, delayMs));
        }
      }
    }

    throw new Error(
      `Could not connect to Browser CDP at ${this.cdpUrl}.\n` +
      `Ensure your browser (Chrome, Edge, Brave, Chromium) is running with --remote-debugging-port=9222.\n` +
      `Original error: ${lastError?.message}`
    );
  }

  /**
   * Retrieves or creates a page for Threads.
   */
  async getThreadsPage() {
    if (!this.browser || !this.browser.connected) {
      await this.connect();
    }

    const pages = await this.browser.pages();

    // 1. Look for existing Threads tab
    let selectedPage = pages.find(p => {
      const u = p.url();
      return u.includes("threads.com") || u.includes("threads.net");
    });

    // 2. Look for reusable blank/new tab
    if (!selectedPage) {
      selectedPage = pages.find(p => {
        const u = p.url();
        return u === "about:blank" || u.includes("brave://newtab") || u.includes("chrome://newtab") || u.includes("edge://newtab");
      });
      if (selectedPage) {
        await selectedPage.goto(CONFIG.THREADS_HOME, {
          waitUntil: "domcontentloaded",
          timeout: 60000
        });
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    // 3. Fallback: create new page
    if (!selectedPage) {
      selectedPage = await this.browser.newPage();
      await selectedPage.goto(CONFIG.THREADS_HOME, {
        waitUntil: "domcontentloaded",
        timeout: 60000
      });
      await new Promise(r => setTimeout(r, 2000));
    }

    try {
      await selectedPage.setViewport({
        width: CONFIG.VIEWPORT_WIDTH,
        height: CONFIG.VIEWPORT_HEIGHT,
        deviceScaleFactor: 1
      });
    } catch (e) {}

    // Auto-dismiss/accept any browser native dialogs (e.g. Leave site?)
    selectedPage.removeAllListeners("dialog");
    selectedPage.on("dialog", async dialog => {
      logger.warn(`Browser dialog detected: [${dialog.type()}] "${dialog.message()}". Auto-accepting.`, { action: "DIALOG_AUTO_ACCEPT" });
      await dialog.accept().catch(() => {});
    });

    // Bring tab to foreground so automation is visibly active to user
    await selectedPage.bringToFront().catch(() => {});

    return selectedPage;
  }

  /**
   * Retrieves or creates a page for Instagram.
   */
  async getInstagramPage() {
    if (!this.browser || !this.browser.connected) {
      await this.connect();
    }

    const pages = await this.browser.pages();

    // 1. Look for existing Instagram tab
    let selectedPage = pages.find(p => p.url().includes("instagram.com"));

    // 2. Look for reusable blank tab
    if (!selectedPage) {
      selectedPage = pages.find(p => {
        const u = p.url();
        return u === "about:blank" || u.includes("brave://newtab") || u.includes("chrome://newtab") || u.includes("edge://newtab");
      });
      if (selectedPage) {
        await selectedPage.goto(CONFIG.INSTAGRAM_HOME, {
          waitUntil: "domcontentloaded",
          timeout: 60000
        });
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    // 3. Fallback: create new page
    if (!selectedPage) {
      selectedPage = await this.browser.newPage();
      await selectedPage.goto(CONFIG.INSTAGRAM_HOME, {
        waitUntil: "domcontentloaded",
        timeout: 60000
      });
      await new Promise(r => setTimeout(r, 2000));
    }

    try {
      await selectedPage.setViewport({
        width: CONFIG.VIEWPORT_WIDTH,
        height: CONFIG.VIEWPORT_HEIGHT,
        deviceScaleFactor: 1
      });
    } catch (e) {}

    // Auto-dismiss/accept any browser native dialogs
    selectedPage.removeAllListeners("dialog");
    selectedPage.on("dialog", async dialog => {
      logger.warn(`Browser dialog detected: [${dialog.type()}] "${dialog.message()}". Auto-accepting.`, { action: "DIALOG_AUTO_ACCEPT" });
      await dialog.accept().catch(() => {});
    });

    return selectedPage;
  }

  /**
   * Retrieves or creates a page for LinkedIn.
   */
  async getLinkedInPage() {
    if (!this.browser || !this.browser.connected) {
      await this.connect();
    }

    const pages = await this.browser.pages();

    // 1. Look for existing LinkedIn tab
    let selectedPage = pages.find(p => p.url().includes("linkedin.com"));

    // 2. Look for reusable blank tab
    if (!selectedPage) {
      selectedPage = pages.find(p => {
        const u = p.url();
        return u === "about:blank" || u.includes("brave://newtab") || u.includes("chrome://newtab") || u.includes("edge://newtab");
      });
      if (selectedPage) {
        await selectedPage.goto(CONFIG.LINKEDIN_HOME, {
          waitUntil: "domcontentloaded",
          timeout: 60000
        });
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    // 3. Fallback: create new page
    if (!selectedPage) {
      selectedPage = await this.browser.newPage();
      await selectedPage.goto(CONFIG.LINKEDIN_HOME, {
        waitUntil: "domcontentloaded",
        timeout: 60000
      });
      await new Promise(r => setTimeout(r, 2000));
    }

    try {
      await selectedPage.setViewport({
        width: CONFIG.VIEWPORT_WIDTH,
        height: CONFIG.VIEWPORT_HEIGHT,
        deviceScaleFactor: 1
      });
    } catch (e) {}

    selectedPage.removeAllListeners("dialog");
    selectedPage.on("dialog", async dialog => {
      logger.warn(`Browser dialog detected: [${dialog.type()}] "${dialog.message()}". Auto-accepting.`, { action: "DIALOG_AUTO_ACCEPT" });
      await dialog.accept().catch(() => {});
    });

    return selectedPage;
  }

  /**
   * Retrieves or creates a page for Facebook.
   */
  async getFacebookPage() {
    if (!this.browser || !this.browser.connected) {
      await this.connect();
    }

    const pages = await this.browser.pages();

    // 1. Look for existing Facebook tab
    let selectedPage = pages.find(p => p.url().includes("facebook.com"));

    // 2. Look for reusable blank tab
    if (!selectedPage) {
      selectedPage = pages.find(p => {
        const u = p.url();
        return u === "about:blank" || u.includes("brave://newtab") || u.includes("chrome://newtab") || u.includes("edge://newtab");
      });
      if (selectedPage) {
        await selectedPage.goto(CONFIG.FACEBOOK_HOME, {
          waitUntil: "domcontentloaded",
          timeout: 60000
        });
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    // 3. Fallback: create new page
    if (!selectedPage) {
      selectedPage = await this.browser.newPage();
      await selectedPage.goto(CONFIG.FACEBOOK_HOME, {
        waitUntil: "domcontentloaded",
        timeout: 60000
      });
      await new Promise(r => setTimeout(r, 2000));
    }

    try {
      await selectedPage.setViewport({
        width: CONFIG.VIEWPORT_WIDTH,
        height: CONFIG.VIEWPORT_HEIGHT,
        deviceScaleFactor: 1
      });
    } catch (e) {}

    selectedPage.removeAllListeners("dialog");
    selectedPage.on("dialog", async dialog => {
      logger.warn(`Browser dialog detected: [${dialog.type()}] "${dialog.message()}". Auto-accepting.`, { action: "DIALOG_AUTO_ACCEPT" });
      await dialog.accept().catch(() => {});
    });

    return selectedPage;
  }

  /**
   * Captures diagnostic screenshot and stores in logs/screenshots/.
   */
  async takeScreenshot(page, label = "diagnostic") {
    try {
      const screenshotsDir = path.join(CONFIG.LOGS_DIR, "screenshots");
      if (!fs.existsSync(screenshotsDir)) {
        fs.mkdirSync(screenshotsDir, { recursive: true });
      }
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const filename = `${label}-${timestamp}.png`;
      const fullPath = path.join(screenshotsDir, filename);
      await page.screenshot({ path: fullPath, fullPage: false });
      logger.info(`Screenshot saved: ${fullPath}`, { action: "SCREENSHOT" });
      return fullPath;
    } catch (err) {
      logger.warn(`Failed capturing screenshot: ${err.message}`, { action: "SCREENSHOT" });
      return null;
    }
  }

  disconnect() {
    if (this.browser) {
      try {
        this.browser.disconnect();
      } catch (e) {}
      this.browser = null;
    }
  }
}

const browserManager = new BrowserManager();
module.exports = browserManager;
