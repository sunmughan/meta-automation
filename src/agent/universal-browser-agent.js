/**
 * Universal semantic browser agent.
 * No platform selectors, XPath, CSS locators, or regex-driven decisions.
 * Every action target comes from the current live semantic snapshot.
 */

const logger = require("../logging/logger");
const telemetry = require("../telemetry/action-telemetry");

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

const ALLOWED_ACTIONS = new Set([
  "NAVIGATE",
  "CLICK",
  "TYPE",
  "PRESS",
  "SCROLL",
  "WAIT",
  "OPEN",
  "BACK",
  "CLOSE",
  "EXTRACT",
  "UPLOAD",
  "STOP"
]);

function cleanText(value, max = 400) {
  return String(value || "").trim().split(" ").filter(Boolean).join(" ").slice(0, max);
}

function normalized(value) {
  return cleanText(value, 300).toLowerCase();
}

function isVisibleElement(el) {
  if (!el || !el.getBoundingClientRect) return false;
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  const style = window.getComputedStyle(el);
  return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
}

function elementRole(el) {
  return cleanText(el.getAttribute("role") || el.tagName || "").toLowerCase();
}

function accessibleName(el) {
  return cleanText(
    el.getAttribute("aria-label") ||
    el.getAttribute("aria-description") ||
    el.getAttribute("title") ||
    el.innerText ||
    el.textContent ||
    ""
  );
}

class UniversalBrowserAgent {
  constructor(page, platform = "unknown", options = {}) {
    if (!page) throw new Error("UniversalBrowserAgent requires a Puppeteer page");
    this.page = page;
    this.platform = platform;
    this.maxInteractive = options.maxInteractive || 350;
    this.maxCards = options.maxCards || 25;
  }

  async captureLiveSnapshot(label = "inspect") {
    const snapshot = await this.page.evaluate(({ maxInteractive, maxCards }) => {
      const all = [];
      const root = document.documentElement;

      const visit = (el, path) => {
        if (!el || el.nodeType !== 1) return;
        all.push({ el, path });
        const children = el.children || [];
        for (let i = 0; i < children.length; i += 1) {
          visit(children[i], path.concat(i));
        }
      };

      if (root) visit(root, []);

      const interactive = [];
      const cards = [];
      const dialogs = [];
      const links = [];

      for (const item of all) {
        const el = item.el;
        if (!isVisibleElement(el)) continue;

        const tag = el.tagName.toLowerCase();
        const role = elementRole(el);
        const name = accessibleName(el);
        const text = cleanText(el.innerText || el.textContent || "", 700);
        const type = cleanText(el.getAttribute("type") || "", 80).toLowerCase();
        const editable = Boolean(
          el.isContentEditable ||
          tag === "textarea" ||
          (tag === "input" && type !== "hidden") ||
          role === "textbox"
        );
        const disabled = Boolean(
          el.disabled ||
          el.getAttribute("aria-disabled") === "true"
        );
        const rect = el.getBoundingClientRect();

        const isInteractive =
          tag === "button" ||
          tag === "a" ||
          tag === "input" ||
          tag === "textarea" ||
          role === "button" ||
          role === "link" ||
          role === "textbox" ||
          role === "tab" ||
          role === "menuitem" ||
          role === "checkbox" ||
          role === "switch" ||
          editable ||
          el.hasAttribute("tabindex");

        if (isInteractive && interactive.length < maxInteractive) {
          interactive.push({
            id: interactive.length + 1,
            path: item.path,
            tag,
            role,
            name,
            text,
            placeholder: cleanText(el.getAttribute("placeholder") || "", 180),
            type,
            editable,
            disabled,
            href: cleanText(el.getAttribute("href") || "", 500),
            bounds: {
              x: Math.round(rect.x),
              y: Math.round(rect.y),
              width: Math.round(rect.width),
              height: Math.round(rect.height)
            }
          });
        }

        if (role === "dialog" || el.getAttribute("aria-modal") === "true") {
          dialogs.push({
            path: item.path,
            name,
            text: cleanText(text, 1200)
          });
        }

        if (tag === "article" || role === "article") {
          if (cards.length < maxCards) {
            cards.push({
              path: item.path,
              author: "",
              text: cleanText(text, 1200),
              hrefs: []
            });
          }
        }

        if (tag === "a") {
          links.push({
            path: item.path,
            text: cleanText(el.innerText || el.textContent || "", 160),
            href: cleanText(el.getAttribute("href") || "", 500)
          });
        }
      }

      for (const card of cards) {
        const owner = all.find(item =>
          item.path.length > card.path.length &&
          card.path.every((v, i) => item.path[i] === v) &&
          (
            item.el.tagName.toLowerCase() === "h2" ||
            item.el.tagName.toLowerCase() === "h3" ||
            item.el.getAttribute("role") === "link" ||
            item.el.tagName.toLowerCase() === "a"
          )
        );
        if (owner) {
          card.author = cleanText(
            owner.el.innerText ||
            owner.el.textContent ||
            owner.el.getAttribute("aria-label") ||
            "",
            120
          );
        }
      }

      const bodyText = cleanText(document.body?.innerText || "", 16000);

      return {
        url: window.location.href,
        title: document.title || "",
        bodyText,
        interactiveElements: interactive,
        visibleCards: cards,
        activeDialogs: dialogs,
        visibleLinks: links.slice(0, 250),
        capturedAt: new Date().toISOString()
      };
    }, {
      maxInteractive: this.maxInteractive,
      maxCards: this.maxCards
    });

    logger.info(
      "[UNIVERSAL AGENT SNAPSHOT] " +
      this.platform.toUpperCase() +
      " " +
      label +
      " " +
      snapshot.url +
      " interactive=" +
      snapshot.interactiveElements.length
    );

    return snapshot;
  }

  async resolveTarget(target) {
    if (!target || !Number.isInteger(Number(target.elementId))) return null;
    const id = Number(target.elementId);

    const handle = await this.page.evaluateHandle(targetId => {
      const all = [];
      const walk = el => {
        if (!el || el.nodeType !== 1) return;
        all.push(el);
        const children = el.children || [];
        for (let i = 0; i < children.length; i += 1) walk(children[i]);
      };
      walk(document.documentElement);

      let interactiveIndex = 0;
      for (const el of all) {
        if (!isVisibleElement(el)) continue;
        const tag = el.tagName.toLowerCase();
        const role = elementRole(el);
        const type = cleanText(el.getAttribute("type") || "", 40).toLowerCase();
        const editable = Boolean(
          el.isContentEditable ||
          tag === "textarea" ||
          (tag === "input" && type !== "hidden") ||
          role === "textbox"
        );
        const interactive =
          tag === "button" ||
          tag === "a" ||
          tag === "input" ||
          tag === "textarea" ||
          role === "button" ||
          role === "link" ||
          role === "textbox" ||
          role === "tab" ||
          role === "menuitem" ||
          role === "checkbox" ||
          role === "switch" ||
          editable ||
          el.hasAttribute("tabindex");
        if (!interactive) continue;
        interactiveIndex += 1;
        if (interactiveIndex === targetId) return el;
      }
      return null;
    }, id);

    return handle.asElement();
  }

  validatePlan(plan) {
    if (!plan || typeof plan !== "object") {
      throw new Error("Agent plan must be an object");
    }
    if (!Array.isArray(plan.actions)) {
      throw new Error("Agent plan actions must be an array");
    }
    for (const action of plan.actions) {
      const type = String(action?.type || "").toUpperCase();
      if (!ALLOWED_ACTIONS.has(type)) {
        throw new Error("Unsupported agent action: " + type);
      }
      if (["CLICK", "TYPE", "UPLOAD"].includes(type) && !action.target) {
        throw new Error(type + " requires a semantic target from the current snapshot");
      }
      if (["TYPE", "UPLOAD"].includes(type) && typeof action.value !== "string") {
        throw new Error(type + " requires a string value");
      }
    }
    return true;
  }

  async smoothPointerMove(from, to) {
    const startX = Number(from?.x ?? to.x);
    const startY = Number(from?.y ?? to.y);
    const endX = Number(to.x);
    const endY = Number(to.y);

    const control1 = {
      x: startX + (endX - startX) * 0.25,
      y: startY + (endY - startY) * 0.10
    };
    const control2 = {
      x: startX + (endX - startX) * 0.75,
      y: startY + (endY - startY) * 0.90
    };

    const steps = 12;
    for (let i = 1; i <= steps; i += 1) {
      const t = i / steps;
      const one = 1 - t;
      const x =
        one * one * one * startX +
        3 * one * one * t * control1.x +
        3 * one * t * t * control2.x +
        t * t * t * endX;
      const y =
        one * one * one * startY +
        3 * one * one * t * control1.y +
        3 * one * t * t * control2.y +
        t * t * t * endY;
      await this.page.mouse.move(x, y);
      await new Promise(resolve => setTimeout(resolve, 25));
    }
  }

  async executeAction(action, correlationId) {
    const type = String(action.type || "").toUpperCase();

    telemetry.record({
      correlationId,
      platform: this.platform,
      action: type,
      state: ACTION_STATES.ATTEMPTED,
      pageUrl: this.page.url(),
      targetDescription: action.target ? JSON.stringify(action.target) : ""
    });

    if (type === "STOP") {
      return { success: true, terminal: true };
    }

    if (type === "WAIT") {
      const waitMs = Math.max(250, Math.min(60000, Number(action.value) || 1500));
      await new Promise(resolve => setTimeout(resolve, waitMs));
      return { success: true, waitMs };
    }

    if (type === "NAVIGATE" || type === "OPEN") {
      const targetUrl = String(action.url || action.value || "");
      if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
        throw new Error("Navigation requires an explicit HTTP(S) URL");
      }
      await this.page.goto(targetUrl, {
        waitUntil: "domcontentloaded",
        timeout: 60000
      });
      return { success: true, url: this.page.url() };
    }

    if (type === "BACK" || type === "CLOSE") {
      await this.page.goBack({ waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
      return { success: true };
    }

    if (type === "PRESS") {
      await this.page.keyboard.press(String(action.key || action.value || "Enter"));
      await new Promise(resolve => setTimeout(resolve, 600));
      return { success: true };
    }

    if (type === "SCROLL") {
      const delta = Number(action.value) || 600;
      await this.page.evaluate(amount => {
        const visible = [];
        const walk = el => {
          if (!el || el.nodeType !== 1) return;
          if (isVisibleElement(el) && el.scrollHeight > el.clientHeight + 50) {
            visible.push({
              el,
              area: el.clientWidth * el.clientHeight
            });
          }
          const children = el.children || [];
          for (let i = 0; i < children.length; i += 1) walk(children[i]);
        };
        walk(document.documentElement);
        visible.sort((a, b) => b.area - a.area);
        const container = visible[0]?.el;
        if (container) {
          container.scrollTop += amount;
        } else {
          window.scrollBy(0, amount);
        }
      }, delta);
      await new Promise(resolve => setTimeout(resolve, 900));
      return { success: true, delta };
    }

    const target = await this.resolveTarget(action.target);
    if (!target) {
      throw new Error(
        "Target element " +
        String(action.target?.elementId || "") +
        " is no longer present in the current DOM"
      );
    }

    const bounds = await target.boundingBox();
    if (!bounds) throw new Error("Target element has no visible bounding box");

    if (type === "CLICK") {
      const previous = await this.page.evaluate(() => ({
        x: window.__metaAutomationCursorX || 0,
        y: window.__metaAutomationCursorY || 0
      }));
      const point = {
        x: bounds.x + bounds.width * 0.5,
        y: bounds.y + bounds.height * 0.5
      };
      await this.smoothPointerMove(previous, point);
      window.__metaAutomationCursorX = point.x;
      window.__metaAutomationCursorY = point.y;
      await this.page.mouse.click(point.x, point.y);
      await new Promise(resolve => setTimeout(resolve, 700));
      return { success: true };
    }

    if (type === "TYPE") {
      await target.click();
      await new Promise(resolve => setTimeout(resolve, 250));
      if (action.clear) {
        await this.page.keyboard.down("Control");
        await this.page.keyboard.press("KeyA");
        await this.page.keyboard.up("Control");
        await this.page.keyboard.press("Backspace");
      }
      const value = String(action.value || "");
      for (const char of value) {
        await this.page.keyboard.sendCharacter(char);
        const pause = 35 + Math.floor(Math.random() * 65);
        await new Promise(resolve => setTimeout(resolve, pause));
      }
      return { success: true, typedCharacters: value.length };
    }

    if (type === "UPLOAD") {
      const tagName = await target.evaluate(el => el.tagName.toLowerCase());
      if (tagName !== "input") {
        throw new Error("UPLOAD target must be the observed file input");
      }
      await target.uploadFile(String(action.value));
      return { success: true };
    }

    if (type === "EXTRACT") {
      return {
        success: true,
        snapshot: await this.captureLiveSnapshot(action.label || "extract")
      };
    }

    throw new Error("Unhandled action type: " + type);
  }

  async executePlan(plan, correlationId) {
    this.validatePlan(plan);
    const results = [];
    for (const action of plan.actions.slice(0, 1)) {
      results.push(await this.executeAction(action, correlationId));
    }
    return { success: true, results };
  }
}

module.exports = {
  UniversalBrowserAgent,
  ACTION_STATES
};
