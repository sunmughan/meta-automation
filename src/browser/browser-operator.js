/**
 * Generic verified browser operator for authenticated social web apps.
 * Uses DOM/ARIA/text discovery first, coordinates only as a last resort.
 */
const logger = require("../logging/logger");

class BrowserOperator {
  constructor(page) {
    if (!page) throw new Error("BrowserOperator requires a Puppeteer page");
    this.page = page;
    this.currentMouse = { x: 150 + Math.floor(Math.random() * 200), y: 150 + Math.floor(Math.random() * 200) };
  }

  /**
   * Moves mouse smoothly along a randomized cubic Bezier curve to simulate natural human arm movement.
   */
  async humanMouseMove(targetX, targetY, options = {}) {
    const startX = this.currentMouse.x;
    const startY = this.currentMouse.y;
    const distance = Math.hypot(targetX - startX, targetY - startY);
    const steps = Math.min(25, Math.max(8, Math.floor(distance / 25)));

    // Generate random control points for Bezier trajectory
    const cp1X = startX + (targetX - startX) * 0.25 + (Math.random() - 0.5) * 50;
    const cp1Y = startY + (targetY - startY) * 0.1 + (Math.random() - 0.5) * 50;
    const cp2X = startX + (targetX - startX) * 0.75 + (Math.random() - 0.5) * 30;
    const cp2Y = startY + (targetY - startY) * 0.9 + (Math.random() - 0.5) * 30;

    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      // Ease in-out timing curve
      const easedT = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      const u = 1 - easedT;
      const x = Math.round(u * u * u * startX + 3 * u * u * easedT * cp1X + 3 * u * easedT * easedT * cp2X + easedT * easedT * easedT * targetX);
      const y = Math.round(u * u * u * startY + 3 * u * u * easedT * cp1Y + 3 * u * easedT * easedT * cp2Y + easedT * easedT * easedT * targetY);

      await this.page.mouse.move(x, y).catch(() => {});
      this.currentMouse = { x, y };
      await new Promise(r => setTimeout(r, Math.floor(Math.random() * 8) + 4));
    }

    this.currentMouse = { x: targetX, y: targetY };
    await new Promise(r => setTimeout(r, Math.floor(Math.random() * 40) + 20));
  }

  /**
   * Executes a humanized mouse click with Bezier trajectory, natural down/up hold, and jitter.
   */
  async humanClick(targetX, targetY) {
    await this.humanMouseMove(targetX, targetY);
    await new Promise(r => setTimeout(r, Math.floor(Math.random() * 45) + 35));
    await this.page.mouse.down().catch(() => {});
    await new Promise(r => setTimeout(r, Math.floor(Math.random() * 55) + 40));
    await this.page.mouse.up().catch(() => {});
    await new Promise(r => setTimeout(r, Math.floor(Math.random() * 60) + 30));
  }

  async snapshot(label = "snapshot") {
    const page = this.page;
    const data = await page.evaluate(() => {
      const visible = el => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
      };
      const items = [...document.querySelectorAll("button,[role='button'],a,[role='link'],input,textarea,[contenteditable='true']")]
        .filter(visible)
        .slice(0, 250)
        .map(el => ({
          tag: el.tagName,
          text: (el.innerText || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 120),
          aria: (el.getAttribute("aria-label") || "").trim().slice(0, 120),
          role: el.getAttribute("role") || "",
          href: el.href || ""
        }));
      return { url: location.href, title: document.title, items };
    });
    logger.info(`[BROWSER SNAPSHOT] ${label}: ${data.url}`);
    return data;
  }

  async visibleClick(locator, options = {}) {
    const timeout = options.timeout || 10000;
    const descriptions = [];
    if (locator.text) descriptions.push(`text=${locator.text}`);
    if (locator.aria) descriptions.push(`aria=${locator.aria}`);
    if (locator.selector) descriptions.push(`selector=${locator.selector}`);

    const handle = await this.findVisible(locator, timeout);
    if (!handle) throw new Error(`Visible element not found: ${descriptions.join(" | ")}`);

    await handle.evaluate(el => el.scrollIntoView({behavior:"instant", block:"center", inline:"center"}));
    const box = await handle.boundingBox();
    if (box) {
      // Natural micro-jitter within the element's interactive center area
      const jitterX = box.x + box.width * (0.35 + 0.3 * Math.random());
      const jitterY = box.y + box.height * (0.35 + 0.3 * Math.random());
      await this.humanClick(jitterX, jitterY);
    } else {
      await handle.click();
    }
    return true;
  }

  async findVisible(locator, timeout = 10000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      const handle = await this.page.evaluateHandle((loc) => {
        const visible = el => {
          const r = el.getBoundingClientRect();
          const s = getComputedStyle(el);
          return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
        };
        const textNorm = (el) => (el.innerText || el.textContent || "").trim().replace(/\s+/g, " ").toLowerCase();
        const ariaNorm = (el) => (el.getAttribute("aria-label") || "").trim().toLowerCase();

        if (loc.selector) {
          const el = document.querySelector(loc.selector);
          if (el && visible(el)) return el;
        }

        const candidates = [...document.querySelectorAll("button,[role='button'],a,[role='link'],input,textarea,[contenteditable='true'],[role='textbox']")];
        return candidates.find(el => {
          if (!visible(el)) return false;
          if (loc.aria && ariaNorm(el).includes(String(loc.aria).toLowerCase())) return true;
          if (loc.text && textNorm(el).includes(String(loc.text).toLowerCase())) return true;
          return false;
        }) || null;
      }, locator);

      const element = handle.asElement();
      if (element) return element;
      await new Promise(r => setTimeout(r, 250));
    }
    return null;
  }

  async typeInto(locator, text, options = {}) {
    const editor = await this.findVisible(locator, options.timeout || 10000);
    if (!editor) throw new Error(`Editable element not found: ${JSON.stringify(locator)}`);
    await editor.evaluate(el => el.scrollIntoView({behavior:"instant", block:"center"}));
    await editor.click();
    await this.page.keyboard.press("Control+A").catch(() => {});
    if (options.clear !== false) {
      await this.page.keyboard.press("Meta+A").catch(() => {});
    }
    const delayMin = options.delayMin || 22;
    const delayMax = options.delayMax || 55;
    for (const char of String(text)) {
      await this.page.keyboard.sendCharacter(char);
      let pause = Math.floor(Math.random() * (delayMax - delayMin + 1)) + delayMin;
      if (char === " " && Math.random() < 0.25) {
        pause += Math.floor(Math.random() * 80) + 40; // Thought pause between words
      } else if (char === "." || char === "?" || char === "," || char === "!") {
        pause += Math.floor(Math.random() * 140) + 70; // Sentence boundary pause
      }
      await new Promise(r => setTimeout(r, pause));
    }
    return true;
  }

  async waitForText(text, timeout = 12000) {
    await this.page.waitForFunction(
      expected => (document.body.innerText || "").toLowerCase().includes(String(expected).toLowerCase()),
      { timeout },
      text
    );
    return true;
  }

  async urlContains(part, timeout = 10000) {
    await this.page.waitForFunction(
      expected => location.href.includes(expected),
      { timeout },
      part
    );
    return true;
  }
}

module.exports = BrowserOperator;
