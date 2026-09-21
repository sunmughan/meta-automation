/**
 * Generic verified browser operator for authenticated social web apps.
 * Uses DOM/ARIA/text discovery first, coordinates only as a last resort.
 */
const logger = require("../logging/logger");

class BrowserOperator {
  constructor(page) {
    if (!page) throw new Error("BrowserOperator requires a Puppeteer page");
    this.page = page;
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
      await this.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
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
    const delayMin = options.delayMin || 18;
    const delayMax = options.delayMax || 45;
    for (const char of String(text)) {
      await this.page.keyboard.sendCharacter(char);
      await new Promise(r => setTimeout(r, Math.floor(Math.random() * (delayMax-delayMin+1)) + delayMin));
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
