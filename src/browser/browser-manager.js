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
    this._threadsPage = null;
    this._linkedInPage = null;
    this._facebookPage = null;
    this._instagramPage = null;
    this._pageMutex = Promise.resolve();
  }

  /**
   * Checks if a cached page reference is still alive and usable.
   * Detects detached frames, closed pages, and stale CDP sessions.
   */
  isPageAlive(page) {
    if (!page || page.isClosed()) return false;
    try {
      // Attempt to access the main frame — throws if detached
      const frame = page.mainFrame();
      if (!frame || frame.isDetached()) return false;
      return true;
    } catch (e) {
      return false;
    }
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

    if (this._connectingPromise) {
      return this._connectingPromise;
    }

    this._connectingPromise = (async () => {
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
    })();

    try {
      return await this._connectingPromise;
    } finally {
      this._connectingPromise = null;
    }
  }

  /**
   * Retrieves or creates a dedicated page for Threads.
   */
  async getThreadsPage(options = {}) {
    if (!this.browser || !this.browser.connected) {
      await this.connect();
    }

    if (this.isPageAlive(this._threadsPage)) {
      if (options.bringToFront !== false) {
        await this._threadsPage.bringToFront().catch(() => {});
      }
      return this._threadsPage;
    }

    let release;
    const lock = new Promise(r => release = r);
    const prevLock = this._pageMutex;
    this._pageMutex = lock;
    await prevLock;

    try {
      if (this.isPageAlive(this._threadsPage)) {
        if (options.bringToFront !== false) {
          await this._threadsPage.bringToFront().catch(() => {});
        }
        return this._threadsPage;
      }

      const pages = await this.browser.pages();
      const claimedPages = new Set([this._linkedInPage, this._facebookPage, this._instagramPage].filter(p => this.isPageAlive(p)));

      let selectedPage = pages.find(p => !claimedPages.has(p) && (p.url().includes("threads.com") || p.url().includes("threads.net")));

      if (!selectedPage) {
        selectedPage = pages.find(p => !claimedPages.has(p) && (p.url() === "about:blank" || p.url().includes("newtab")));
        if (selectedPage) {
          await selectedPage.goto(CONFIG.THREADS_HOME, { waitUntil: "domcontentloaded", timeout: 60000 });
          await new Promise(r => setTimeout(r, 2000));
        }
      }

      if (!selectedPage) {
        selectedPage = await this.browser.newPage();
        await selectedPage.goto(CONFIG.THREADS_HOME, { waitUntil: "domcontentloaded", timeout: 60000 });
        await new Promise(r => setTimeout(r, 2000));
      }

      try {
        const client = await selectedPage.target().createCDPSession();
        await client.send("Emulation.clearDeviceMetricsOverride").catch(() => {});
      } catch (e) {}

      selectedPage.removeAllListeners("dialog");
      selectedPage.on("dialog", async dialog => {
        logger.warn(`Browser dialog detected: [${dialog.type()}] "${dialog.message()}". Auto-accepting.`, { action: "DIALOG_AUTO_ACCEPT" });
        await dialog.accept().catch(() => {});
      });

      this._threadsPage = selectedPage;
      if (options.bringToFront !== false) {
        await this._threadsPage.bringToFront().catch(() => {});
      }
      return this._threadsPage;
    } finally {
      release();
    }
  }

  /**
   * Retrieves or creates a page for Instagram.
   */
  async getInstagramPage(options = {}) {
    if (!this.browser || !this.browser.connected) {
      await this.connect();
    }

    if (this.isPageAlive(this._instagramPage)) {
      if (options.bringToFront !== false) {
        await this._instagramPage.bringToFront().catch(() => {});
      }
      return this._instagramPage;
    }

    let release;
    const lock = new Promise(r => release = r);
    const prevLock = this._pageMutex;
    this._pageMutex = lock;
    await prevLock;

    try {
      if (this.isPageAlive(this._instagramPage)) {
        return this._instagramPage;
      }

      const pages = await this.browser.pages();
      const claimedPages = new Set([this._threadsPage, this._linkedInPage, this._facebookPage].filter(p => this.isPageAlive(p)));

      let selectedPage = pages.find(p => !claimedPages.has(p) && p.url().includes("instagram.com"));

      if (!selectedPage) {
        selectedPage = pages.find(p => !claimedPages.has(p) && (p.url() === "about:blank" || p.url().includes("newtab")));
        if (selectedPage) {
          await selectedPage.goto(CONFIG.INSTAGRAM_HOME, { waitUntil: "domcontentloaded", timeout: 60000 });
          await new Promise(r => setTimeout(r, 2000));
        }
      }

      if (!selectedPage) {
        selectedPage = await this.browser.newPage();
        await selectedPage.goto(CONFIG.INSTAGRAM_HOME, { waitUntil: "domcontentloaded", timeout: 60000 });
        await new Promise(r => setTimeout(r, 2000));
      }

      try {
        const client = await selectedPage.target().createCDPSession();
        await client.send("Emulation.clearDeviceMetricsOverride").catch(() => {});
      } catch (e) {}

      selectedPage.removeAllListeners("dialog");
      selectedPage.on("dialog", async dialog => {
        logger.warn(`Browser dialog detected: [${dialog.type()}] "${dialog.message()}". Auto-accepting.`, { action: "DIALOG_AUTO_ACCEPT" });
        await dialog.accept().catch(() => {});
      });

      this._instagramPage = selectedPage;
      if (options.bringToFront !== false) {
        await this._instagramPage.bringToFront().catch(() => {});
      }
      return this._instagramPage;
    } finally {
      release();
    }
  }

  /**
   * Retrieves or creates a dedicated page for LinkedIn.
   */
  async getLinkedInPage(options = {}) {
    if (!this.browser || !this.browser.connected) {
      await this.connect();
    }

    if (this.isPageAlive(this._linkedInPage)) {
      if (options.bringToFront !== false) {
        await this._linkedInPage.bringToFront().catch(() => {});
      }
      return this._linkedInPage;
    }

    let release;
    const lock = new Promise(r => release = r);
    const prevLock = this._pageMutex;
    this._pageMutex = lock;
    await prevLock;

    try {
      if (this.isPageAlive(this._linkedInPage)) {
        if (options.bringToFront !== false) {
          await this._linkedInPage.bringToFront().catch(() => {});
        }
        return this._linkedInPage;
      }

      const pages = await this.browser.pages();
      const claimedPages = new Set([this._threadsPage, this._facebookPage, this._instagramPage].filter(p => this.isPageAlive(p)));

      let selectedPage = pages.find(p => !claimedPages.has(p) && p.url().includes("linkedin.com"));

      if (!selectedPage) {
        selectedPage = pages.find(p => !claimedPages.has(p) && (p.url() === "about:blank" || p.url().includes("newtab")));
        if (selectedPage) {
          await selectedPage.goto(CONFIG.LINKEDIN_HOME, { waitUntil: "domcontentloaded", timeout: 60000 });
          await new Promise(r => setTimeout(r, 2000));
        }
      }

      if (!selectedPage) {
        selectedPage = await this.browser.newPage();
        await selectedPage.goto(CONFIG.LINKEDIN_HOME, { waitUntil: "domcontentloaded", timeout: 60000 });
        await new Promise(r => setTimeout(r, 2000));
      }

      try {
        const client = await selectedPage.target().createCDPSession();
        await client.send("Emulation.clearDeviceMetricsOverride").catch(() => {});
      } catch (e) {}

      selectedPage.removeAllListeners("dialog");
      selectedPage.on("dialog", async dialog => {
        logger.warn(`Browser dialog detected: [${dialog.type()}] "${dialog.message()}". Auto-accepting.`, { action: "DIALOG_AUTO_ACCEPT" });
        await dialog.accept().catch(() => {});
      });

      this._linkedInPage = selectedPage;
      if (options.bringToFront !== false) {
        await this._linkedInPage.bringToFront().catch(() => {});
      }
      return this._linkedInPage;
    } finally {
      release();
    }
  }

  /**
   * Retrieves or creates a dedicated page for Facebook.
   */
  async getFacebookPage(options = {}) {
    if (!this.browser || !this.browser.connected) {
      await this.connect();
    }

    if (this.isPageAlive(this._facebookPage)) {
      if (options.bringToFront !== false) {
        await this._facebookPage.bringToFront().catch(() => {});
      }
      return this._facebookPage;
    }

    let release;
    const lock = new Promise(r => release = r);
    const prevLock = this._pageMutex;
    this._pageMutex = lock;
    await prevLock;

    try {
      if (this.isPageAlive(this._facebookPage)) {
        if (options.bringToFront !== false) {
          await this._facebookPage.bringToFront().catch(() => {});
        }
        return this._facebookPage;
      }

      const pages = await this.browser.pages();
      const claimedPages = new Set([this._threadsPage, this._linkedInPage, this._instagramPage].filter(p => this.isPageAlive(p)));

      let selectedPage = pages.find(p => !claimedPages.has(p) && p.url().includes("facebook.com"));

      if (!selectedPage) {
        selectedPage = pages.find(p => !claimedPages.has(p) && (p.url() === "about:blank" || p.url().includes("newtab")));
        if (selectedPage) {
          await selectedPage.goto(CONFIG.FACEBOOK_HOME, { waitUntil: "domcontentloaded", timeout: 60000 });
          await new Promise(r => setTimeout(r, 2000));
        }
      }

      if (!selectedPage) {
        selectedPage = await this.browser.newPage();
        await selectedPage.goto(CONFIG.FACEBOOK_HOME, { waitUntil: "domcontentloaded", timeout: 60000 });
        await new Promise(r => setTimeout(r, 2000));
      }

      try {
        const client = await selectedPage.target().createCDPSession();
        await client.send("Emulation.clearDeviceMetricsOverride").catch(() => {});
      } catch (e) {}

      selectedPage.removeAllListeners("dialog");
      selectedPage.on("dialog", async dialog => {
        logger.warn(`Browser dialog detected: [${dialog.type()}] "${dialog.message()}". Auto-accepting.`, { action: "DIALOG_AUTO_ACCEPT" });
        await dialog.accept().catch(() => {});
      });

      this._facebookPage = selectedPage;
      if (options.bringToFront !== false) {
        await this._facebookPage.bringToFront().catch(() => {});
      }
      return this._facebookPage;
    } finally {
      release();
    }
  }

  /**
   * Ensures all three platforms (Threads, LinkedIn, Facebook) have open, dedicated tabs in the browser.
   */
  async ensureAllPlatformTabs() {
    if (!this.browser || !this.browser.connected) {
      await this.connect();
    }
    const tPage = await this.getThreadsPage({ bringToFront: false });
    const liPage = await this.getLinkedInPage({ bringToFront: false });
    const fbPage = await this.getFacebookPage({ bringToFront: false });
    return { threadsPage: tPage, linkedInPage: liPage, facebookPage: fbPage };
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
    this._threadsPage = null;
    this._linkedInPage = null;
    this._facebookPage = null;
    this._instagramPage = null;
  }
}

const browserManager = new BrowserManager();
module.exports = browserManager;
