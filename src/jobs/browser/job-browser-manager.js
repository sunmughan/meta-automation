const http = require("http");
const CONFIG = require("../../../config");
const logger = require("../../logging/logger");

let puppeteerModule = null;
async function getPuppeteer() {
  if (!puppeteerModule) {
    const mod = await import("puppeteer-core");
    puppeteerModule = mod.default || mod;
  }
  return puppeteerModule;
}

class JobBrowserManager {
  constructor() {
    this.browser = null;
    this.page = null;
  }

  async isReachable(targetUrl = CONFIG.JOB_BROWSER_CDP_URL, timeoutMs = 1500) {
    return new Promise(resolve => {
      try {
        const url = new URL(targetUrl);
        const request = http.get({
          hostname: url.hostname,
          port: url.port,
          path: "/json/version",
          timeout: timeoutMs
        }, response => resolve(response.statusCode === 200));
        request.on("error", () => resolve(false));
        request.on("timeout", () => { request.destroy(); resolve(false); });
      } catch (_) {
        resolve(false);
      }
    });
  }

  async resolveCdpUrl() {
    if (await this.isReachable(CONFIG.JOB_BROWSER_CDP_URL)) {
      return CONFIG.JOB_BROWSER_CDP_URL;
    }
    const fallbackUrl = "http://127.0.0.1:9222";
    if (await this.isReachable(fallbackUrl)) {
      return fallbackUrl;
    }
    return CONFIG.JOB_BROWSER_CDP_URL;
  }

  async connect() {
    if (this.browser?.connected) return this.browser;
    const cdpUrl = await this.resolveCdpUrl();
    if (!(await this.isReachable(cdpUrl))) {
      throw new Error(`Job browser CDP is not reachable at ${cdpUrl}. Start the browser first.`);
    }
    const puppeteer = await getPuppeteer();
    this.browser = await puppeteer.connect({
      browserURL: cdpUrl,
      defaultViewport: null
    });
    logger.info(`Connected to job browser: ${await this.browser.version()}`);
    return this.browser;
  }

  async getPage() {
    await this.connect();
    if (this.page && !this.page.isClosed()) return this.page;
    const pages = await this.browser.pages();
    const flPage = pages.find(p => p.url().includes("freelancer.com"));
    if (flPage) {
      this.page = flPage;
      return this.page;
    }
    const reusable = pages.find(p => p.url() === "about:blank" || p.url().includes("newtab"));
    this.page = reusable || await this.browser.newPage();
    return this.page;
  }

  async open(url) {
    const page = await this.getPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: CONFIG.JOB_NAVIGATION_TIMEOUT_MS });
    await new Promise(resolve => setTimeout(resolve, CONFIG.JOB_PAGE_SETTLE_MS));
    return page;
  }

  async openPlatform(platform) {
    if (!platform?.url) throw new Error("Platform configuration must provide a URL");
    return this.open(platform.url);
  }

  disconnect() {
    try { this.browser?.disconnect(); } catch (_) {}
    this.browser = null;
    this.page = null;
  }
}

module.exports = new JobBrowserManager();
