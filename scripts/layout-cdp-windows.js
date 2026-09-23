#!/usr/bin/env node
/**
 * scripts/layout-cdp-windows.js
 *
 * Cross-platform browser window layout using the Chrome DevTools Protocol.
 * Social browser -> left 50%; job browser -> right 50%.
 *
 * No IDE, xdotool, wmctrl, AppleScript, or PowerShell UI automation required.
 */

const CONFIG = require("../config");

let _puppeteer = null;
async function getPuppeteer() {
  if (!_puppeteer) {
    const mod = await import("puppeteer-core");
    _puppeteer = mod.default || mod;
  }
  return _puppeteer;
}

async function livePages(browser) {
  return (await browser.pages()).filter(page => !page.isClosed());
}

async function pickPage(browser, role) {
  const pages = await livePages(browser);
  if (!pages.length) return null;

  const socialHosts = ["threads.com", "threads.net", "linkedin.com", "facebook.com", "instagram.com"];
  const jobHosts = [
    "upwork.com", "freelancer.com", "contra.com", "peopleperhour.com",
    "guru.com", "workana.com", "malt.com", "arc.dev", "toptal.com",
    "fiverr.com", "accounts.google.com"
  ];

  const hints = role === "social" ? socialHosts : jobHosts;
  return pages.find(page => hints.some(host => page.url().includes(host))) || pages[0];
}

async function getWorkArea(page) {
  return page.evaluate(() => ({
    left: Number.isFinite(window.screen.availLeft) ? window.screen.availLeft : 0,
    top: Number.isFinite(window.screen.availTop) ? window.screen.availTop : 0,
    width: Math.max(1, Number(window.screen.availWidth || window.innerWidth || 1)),
    height: Math.max(1, Number(window.screen.availHeight || window.innerHeight || 1))
  }));
}

async function setWindowBounds(page, bounds) {
  const session = await page.target().createCDPSession();
  try {
    const targetInfo = await session.send("Target.getTargetInfo");
    const targetId = targetInfo?.targetInfo?.targetId;
    const windowInfo = await session.send(
      "Browser.getWindowForTarget",
      targetId ? { targetId } : {}
    );
    const windowId = windowInfo?.windowId;
    if (windowId === undefined || windowId === null) {
      throw new Error("Browser.getWindowForTarget did not return a windowId");
    }

    await session.send("Browser.setWindowBounds", {
      windowId,
      bounds: {
        left: Math.max(0, Math.round(bounds.left)),
        top: Math.max(0, Math.round(bounds.top)),
        width: Math.max(320, Math.round(bounds.width)),
        height: Math.max(480, Math.round(bounds.height)),
        windowState: "normal"
      }
    });

    return { success: true, windowId };
  } finally {
    await session.detach().catch(() => {});
  }
}

async function layoutCdpBrowser(cdpUrl, role, bounds = null) {
  const puppeteer = await getPuppeteer();
  const browser = await puppeteer.connect({ browserURL: cdpUrl, defaultViewport: null });

  try {
    const page = await pickPage(browser, role);
    if (!page) {
      return { success: false, role, reason: "No live browser page found" };
    }

    const workArea = await getWorkArea(page);
    const half = Math.floor(workArea.width / 2);
    const targetBounds = bounds || (
      role === "social"
        ? { left: 0, top: 0, width: half, height: workArea.height }
        : { left: half, top: 0, width: workArea.width - half, height: workArea.height }
    );

    const result = await setWindowBounds(page, targetBounds);
    return { success: true, role, cdpUrl, workArea, bounds: targetBounds, ...result };
  } finally {
    browser.disconnect();
  }
}

async function layoutBoth(options = {}) {
  const puppeteer = await getPuppeteer();
  const socialCdpUrl = options.socialCdpUrl || CONFIG.CDP_URL;
  const jobCdpUrl = options.jobCdpUrl || CONFIG.JOB_BROWSER_CDP_URL;

  const socialBrowser = await puppeteer.connect({
    browserURL: socialCdpUrl,
    defaultViewport: null
  });

  let screen;
  try {
    const socialPage = await pickPage(socialBrowser, "social");
    if (!socialPage) throw new Error("Social browser has no live page.");
    screen = await getWorkArea(socialPage);
  } finally {
    socialBrowser.disconnect();
  }

  const half = Math.floor(screen.width / 2);
  const socialBounds = {
    left: screen.left,
    top: screen.top,
    width: half,
    height: screen.height
  };
  const jobBounds = {
    left: screen.left + half,
    top: screen.top,
    width: screen.width - half,
    height: screen.height
  };

  const [social, job] = await Promise.all([
    layoutCdpBrowser(socialCdpUrl, "social", socialBounds),
    layoutCdpBrowser(jobCdpUrl, "job", jobBounds)
  ]);

  return { screen, social, job };
}

async function main() {
  const args = new Set(process.argv.slice(2));

  if (args.has("--social-only")) {
    const result = await layoutCdpBrowser(CONFIG.CDP_URL, "social");
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.success ? 0 : 1);
  }

  if (args.has("--job-only")) {
    const result = await layoutCdpBrowser(CONFIG.JOB_BROWSER_CDP_URL, "job");
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.success ? 0 : 1);
  }

  const result = await layoutBoth();
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.social.success && result.job.success ? 0 : 1);
}

if (require.main === module) {
  main().catch(err => {
    console.error(`Desktop browser layout failed: ${err.message}`);
    process.exit(1);
  });
}

module.exports = {
  getWorkArea,
  layoutCdpBrowser,
  layoutBoth,
  setWindowBounds
};
