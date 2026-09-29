const http = require("http");
const CONFIG = require("../../../config");

let puppeteerModule = null;
async function puppeteer() {
  if (!puppeteerModule) {
    const mod = await import("puppeteer-core");
    puppeteerModule = mod.default || mod;
  }
  return puppeteerModule;
}

class GrowthBrowserManager {
  constructor() {
    this.browser = null;
    this.page = null;
  }

  async reachable(url, timeout = 1500) {
    return new Promise(resolve => {
      try {
        const u = new URL(url);
        const req = http.get({ hostname: u.hostname, port: u.port, path: "/json/version", timeout }, r => resolve(r.statusCode === 200));
        req.on("error", () => resolve(false));
        req.on("timeout", () => { req.destroy(); resolve(false); });
      } catch (_) { resolve(false); }
    });
  }

  async connect() {
    if (this.browser?.connected) return this.browser;
    const preferred = CONFIG.PROFESSIONAL_GROWTH_BROWSER_CDP_URL || CONFIG.CDP_URL || CONFIG.JOB_BROWSER_CDP_URL;
    let cdp = preferred;
    if (!(await this.reachable(cdp)) && CONFIG.JOB_BROWSER_CDP_URL !== cdp && await this.reachable(CONFIG.JOB_BROWSER_CDP_URL)) {
      cdp = CONFIG.JOB_BROWSER_CDP_URL;
    }
    if (!(await this.reachable(cdp))) throw new Error("Professional Growth browser CDP is not reachable at " + cdp);
    const p = await puppeteer();
    this.browser = await p.connect({ browserURL: cdp, defaultViewport: null });
    return this.browser;
  }

  async pageFor(url) {
    const browser = await this.connect();
    if (!this.page || this.page.isClosed()) {
      const pages = await browser.pages();
      this.page = pages.find(p => p.url() === "about:blank" || p.url().includes("leetcode.com")) || await browser.newPage();
    }
    if (url && this.page.url() !== url) {
      await this.page.goto(url, { waitUntil: "domcontentloaded", timeout: CONFIG.PROFESSIONAL_GROWTH_NAVIGATION_TIMEOUT_MS });
      await new Promise(r => setTimeout(r, CONFIG.PROFESSIONAL_GROWTH_SETTLE_MS));
    }
    return this.page;
  }

  disconnect() {
    try { this.browser?.disconnect(); } catch (_) {}
    this.browser = null;
    this.page = null;
  }
}

module.exports = new GrowthBrowserManager();
