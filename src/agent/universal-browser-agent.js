/** Universal live-page browser agent. No platform selectors, XPath, coordinate tables or regex decisions. */
const telemetry = require("../telemetry/action-telemetry");
const logger = require("../logging/logger");

const ACTION_STATES = Object.freeze({
  DISCOVERED: "DISCOVERED",
  DECIDING: "DECIDING",
  ATTEMPTED: "ATTEMPTED",
  SUBMITTED: "SUBMITTED",
  VERIFIED: "VERIFIED",
  BLOCKED: "BLOCKED",
  FAILED: "FAILED",
  UNVERIFIED: "UNVERIFIED",
  QUARANTINED: "QUARANTINED"
});

const ALLOWED_ACTIONS = new Set(["NAVIGATE", "CLICK", "TYPE", "PRESS", "SCROLL", "WAIT", "OPEN", "BACK", "CLOSE", "EXTRACT", "UPLOAD", "STOP"]);

class UniversalBrowserAgent {
  constructor(page, platform = "unknown", options = {}) {
    if (!page) throw new Error("UniversalBrowserAgent requires a Puppeteer page");
    this.page = page;
    this.platform = platform;
    this.maxInteractive = options.maxInteractive || 300;
    this.maxCards = options.maxCards || 20;
    this.lastCursor = { x: 0, y: 0 };
  }

  async captureLiveSnapshot(label = "inspect") {
    const maxInteractive = this.maxInteractive;
    const maxCards = this.maxCards;
    const snapshot = await this.page.evaluate(({ maxInteractive: interactiveLimit, maxCards: cardLimit }) => {
      const cleanText = (value, max = 400) => String(value || "").trim().split(" ").filter(Boolean).join(" ").slice(0, max);
      const visible = el => {
        if (!el || !el.getBoundingClientRect) return false;
        const r = el.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) return false;
        const s = window.getComputedStyle(el);
        return s.display !== "none" && s.visibility !== "hidden" && s.opacity !== "0";
      };
      const roleOf = el => String(el.getAttribute("role") || el.tagName || "").toLowerCase();
      const nameOf = el => cleanText(el.getAttribute("aria-label") || el.getAttribute("aria-description") || el.getAttribute("title") || el.innerText || el.textContent || "", 300);
      const all = [];
      const visit = (el, path) => {
        if (!el || el.nodeType !== 1) return;
        all.push({ el, path });
        const children = el.children || [];
        for (let i = 0; i < children.length; i += 1) visit(children[i], path.concat(i));
      };
      if (document.documentElement) visit(document.documentElement, []);
      const interactive = [];
      const cards = [];
      const dialogs = [];
      const links = [];
      for (const item of all) {
        const el = item.el;
        if (!visible(el)) continue;
        const tag = el.tagName.toLowerCase();
        const role = roleOf(el);
        const type = cleanText(el.getAttribute("type") || "", 60).toLowerCase();
        const text = cleanText(el.innerText || el.textContent || "", 700);
        const editable = Boolean(el.isContentEditable || tag === "textarea" || (tag === "input" && type !== "hidden") || role === "textbox");
        const disabled = Boolean(el.disabled || el.getAttribute("aria-disabled") === "true");
        const isInteractive = tag === "button" || tag === "a" || tag === "input" || tag === "textarea" || role === "button" || role === "link" || role === "textbox" || role === "tab" || role === "menuitem" || role === "checkbox" || role === "switch" || editable || el.hasAttribute("tabindex");
        if (isInteractive && interactive.length < interactiveLimit) {
          const r = el.getBoundingClientRect();
          interactive.push({
            id: interactive.length + 1,
            path: item.path,
            tag, role,
            name: nameOf(el),
            text,
            placeholder: cleanText(el.getAttribute("placeholder") || "", 160),
            type, editable, disabled,
            href: cleanText(el.getAttribute("href") || "", 500),
            bounds: { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) }
          });
        }
        if (role === "dialog" || el.getAttribute("aria-modal") === "true") dialogs.push({ path: item.path, name: nameOf(el), text: cleanText(text, 1000) });
        if ((tag === "article" || role === "article") && cards.length < cardLimit) {
          const descendantLinks = [];
          for (const linked of all) {
            if (linked.path.length <= item.path.length) continue;
            if (!item.path.every((v, i) => linked.path[i] === v)) continue;
            if (linked.el.tagName.toLowerCase() === "a" && descendantLinks.length < 8) {
              descendantLinks.push({
                text: cleanText(linked.el.innerText || linked.el.textContent || linked.el.getAttribute("aria-label") || "", 120),
                href: cleanText(linked.el.getAttribute("href") || "", 500)
              });
            }
          }
          const authorLink = descendantLinks.find(link => link.text);
          cards.push({ path: item.path, text: cleanText(text, 1200), author: authorLink?.text || "", hrefs: descendantLinks });
        }
        if (tag === "a") links.push({ path: item.path, text: cleanText(el.innerText || el.textContent || "", 160), href: cleanText(el.getAttribute("href") || "", 500) });
      }
      return { url: window.location.href, title: document.title || "", bodyText: cleanText(document.body?.innerText || "", 16000), interactiveElements: interactive, visibleCards: cards, activeDialogs: dialogs, visibleLinks: links.slice(0, 200), capturedAt: new Date().toISOString() };
    }, { maxInteractive, maxCards });
    logger.info("[UNIVERSAL AGENT SNAPSHOT] " + this.platform.toUpperCase() + " " + label + " interactive=" + snapshot.interactiveElements.length);
    return snapshot;
  }

  async resolveTarget(target) {
    const id = Number(target?.elementId);
    if (!Number.isInteger(id) || id < 1) return null;
    const handle = await this.page.evaluateHandle(targetId => {
      const visible = el => {
        if (!el || !el.getBoundingClientRect) return false;
        const r = el.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) return false;
        const s = window.getComputedStyle(el);
        return s.display !== "none" && s.visibility !== "hidden" && s.opacity !== "0";
      };
      const roleOf = el => String(el.getAttribute("role") || el.tagName || "").toLowerCase();
      const all = [];
      const walk = el => {
        if (!el || el.nodeType !== 1) return;
        all.push(el);
        const children = el.children || [];
        for (let i = 0; i < children.length; i += 1) walk(children[i]);
      };
      walk(document.documentElement);
      let index = 0;
      for (const el of all) {
        if (!visible(el)) continue;
        const tag = el.tagName.toLowerCase();
        const role = roleOf(el);
        const type = String(el.getAttribute("type") || "").toLowerCase();
        const editable = Boolean(el.isContentEditable || tag === "textarea" || (tag === "input" && type !== "hidden") || role === "textbox");
        const interactive = tag === "button" || tag === "a" || tag === "input" || tag === "textarea" || role === "button" || role === "link" || role === "textbox" || role === "tab" || role === "menuitem" || role === "checkbox" || role === "switch" || editable || el.hasAttribute("tabindex");
        if (!interactive) continue;
        index += 1;
        if (index === targetId) return el;
      }
      return null;
    }, id);
    return handle.asElement();
  }

  validatePlan(plan) {
    if (!plan || !Array.isArray(plan.actions)) throw new Error("Invalid agent plan");
    for (const action of plan.actions) {
      const type = String(action?.type || "").toUpperCase();
      if (!ALLOWED_ACTIONS.has(type)) throw new Error("Unsupported action: " + type);
      if (["CLICK", "TYPE", "UPLOAD"].includes(type) && !action.target) throw new Error(type + " requires current semantic target");
      if (["TYPE", "UPLOAD"].includes(type) && typeof action.value !== "string") throw new Error(type + " requires string value");
    }
    return true;
  }

  async smoothPointerMove(to) {
    const from = this.lastCursor;
    const c1 = { x: from.x + (to.x - from.x) * 0.25, y: from.y + (to.y - from.y) * 0.1 };
    const c2 = { x: from.x + (to.x - from.x) * 0.75, y: from.y + (to.y - from.y) * 0.9 };
    for (let step = 1; step <= 10; step += 1) {
      const t = step / 10;
      const u = 1 - t;
      const x = u*u*u*from.x + 3*u*u*t*c1.x + 3*u*t*t*c2.x + t*t*t*to.x;
      const y = u*u*u*from.y + 3*u*u*t*c1.y + 3*u*t*t*c2.y + t*t*t*to.y;
      await this.page.mouse.move(x, y);
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    this.lastCursor = to;
  }

  async executeAction(action, correlationId) {
    const type = String(action.type || "").toUpperCase();
    telemetry.record({ correlationId, platform: this.platform, action: type, state: ACTION_STATES.ATTEMPTED, pageUrl: this.page.url() });
    if (type === "STOP") return { success: true, terminal: true };
    if (type === "WAIT") { await new Promise(resolve => setTimeout(resolve, Math.max(250, Math.min(60000, Number(action.value) || 1500)))); return { success: true }; }
    if (type === "BACK" || type === "CLOSE") { await this.page.goBack({ waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {}); return { success: true }; }
    if (type === "NAVIGATE" || type === "OPEN") {
      const url = String(action.url || action.value || "");
      if (!url.startsWith("http://") && !url.startsWith("https://")) throw new Error("NAVIGATE requires HTTP(S) URL");
      await this.page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
      return { success: true, url: this.page.url() };
    }
    if (type === "PRESS") { await this.page.keyboard.press(String(action.key || action.value || "Enter")); await new Promise(resolve => setTimeout(resolve, 500)); return { success: true }; }
    if (type === "SCROLL") {
      const amount = Number(action.value) || 600;
      await this.page.evaluate(delta => {
        const visible = el => {
          if (!el || !el.getBoundingClientRect) return false;
          const r = el.getBoundingClientRect();
          if (r.width <= 0 || r.height <= 0) return false;
          const s = window.getComputedStyle(el);
          return s.display !== "none" && s.visibility !== "hidden" && s.opacity !== "0";
        };
        const candidates = [];
        const walk = el => {
          if (!el || el.nodeType !== 1) return;
          if (visible(el) && el.scrollHeight > el.clientHeight + 50) candidates.push({ el, area: el.clientWidth * el.clientHeight });
          const children = el.children || [];
          for (let i = 0; i < children.length; i += 1) walk(children[i]);
        };
        walk(document.documentElement);
        candidates.sort((a, b) => b.area - a.area);
        if (candidates[0]) candidates[0].el.scrollTop += delta; else window.scrollBy(0, delta);
      }, amount);
      await new Promise(resolve => setTimeout(resolve, 800));
      return { success: true, amount };
    }
    if (type === "EXTRACT") return { success: true, snapshot: await this.captureLiveSnapshot(action.label || "extract") };
    const target = await this.resolveTarget(action.target);
    if (!target) throw new Error("Current semantic target is unavailable; re-observe before retrying");
    const box = await target.boundingBox();
    if (!box) throw new Error("Target is not visibly actionable");
    if (type === "CLICK") {
      const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      await target.evaluate(el => el.scrollIntoView({ block: "center", inline: "center" }));
      await this.smoothPointerMove(point);
      await this.page.mouse.click(point.x, point.y);
      await new Promise(resolve => setTimeout(resolve, 600));
      return { success: true };
    }
    if (type === "TYPE") {
      await target.evaluate(el => el.scrollIntoView({ block: "center", inline: "center" }));
      await target.click();
      await new Promise(resolve => setTimeout(resolve, 200));
      if (action.clear) { await this.page.keyboard.down("Control"); await this.page.keyboard.press("KeyA"); await this.page.keyboard.up("Control"); await this.page.keyboard.press("Backspace"); }
      for (const char of String(action.value || "")) { await this.page.keyboard.sendCharacter(char); await new Promise(resolve => setTimeout(resolve, 35 + Math.floor(Math.random() * 50))); }
      return { success: true };
    }
    if (type === "UPLOAD") {
      const tag = await target.evaluate(el => el.tagName.toLowerCase());
      if (tag !== "input") throw new Error("UPLOAD requires an observed file input");
      await target.uploadFile(String(action.value));
      return { success: true };
    }
    throw new Error("Unhandled action type: " + type);
  }

  async executePlan(plan, correlationId) { this.validatePlan(plan); return this.executeAction(plan.actions[0], correlationId); }
}

module.exports = { UniversalBrowserAgent, ACTION_STATES };