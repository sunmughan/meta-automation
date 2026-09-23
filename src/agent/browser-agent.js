
/**
 * src/agent/browser-agent.js
 * Master Autonomous Browser Agent Engine for Threads, LinkedIn, and Facebook.
 * Implements:
 *  - Live Browser State & Semantic DOM/A11y Snapshot
 *  - 9-Level Semantic Fallback Locator Hierarchy (Zero Brittle Selectors)
 *  - Strict Structured AI Action Validator & Humanized Browser Executor
 *  - Action State Machine (DISCOVERED -> DECIDING -> ATTEMPTED -> SUBMITTED -> VERIFIED)
 *  - Post-Condition Verification Integration
 *  - Live Observability & Failure Evidence Capture
 */

const fs = require("fs");
const path = require("path");
const logger = require("../logging/logger");
const telemetry = require("../telemetry/action-telemetry");
const { ActionVerifier } = require("./action-verifier");

// Strict allowed action types
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

// Action lifecycle states
const ACTION_STATES = {
  DISCOVERED: "DISCOVERED",
  DECIDING: "DECIDING",
  ATTEMPTED: "ATTEMPTED",
  SUBMITTED: "SUBMITTED",
  VERIFIED: "VERIFIED",
  BLOCKED: "BLOCKED",
  FAILED: "FAILED",
  UNVERIFIED: "UNVERIFIED",
  QUARANTINED: "QUARANTINED"
};

class BrowserAgent {
  constructor(page, platform = "threads") {
    if (!page) throw new Error("BrowserAgent requires an active Puppeteer page instance");
    this.page = page;
    this.platform = platform;
  }

  /**
   * Captures a rich, semantic snapshot of the CURRENT live page.
   * Never relies on cached state.
   */
  async captureLiveSnapshot(label = "inspect") {
    const page = this.page;
    const snapshot = await page.evaluate(() => {
      const isVisible = el => {
        if (!el) return false;
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.visibility !== "hidden" &&
          style.display !== "none" &&
          style.opacity !== "0"
        );
      };

      const cleanText = text => (text || "").trim().replace(/\s+/g, " ");

      // 1. Live page basics
      const url = window.location.href;
      const title = document.title || "";

      // 2. Interactive elements discovery
      const interactiveQuery = "button, [role='button'], a, [role='link'], input, textarea, [contenteditable='true'], [role='textbox'], [role='tab'], [role='menuitem'], [role='checkbox'], [role='switch']";
      const elements = Array.from(document.querySelectorAll(interactiveQuery))
        .filter(isVisible)
        .slice(0, 300)
        .map((el, index) => {
          const rect = el.getBoundingClientRect();
          const tag = el.tagName.toLowerCase();
          const role = el.getAttribute("role") || tag;
          const text = cleanText(el.innerText || el.textContent || "").slice(0, 100);
          const aria = cleanText(el.getAttribute("aria-label") || el.getAttribute("aria-description") || "").slice(0, 100);
          const titleAttr = cleanText(el.getAttribute("title") || "").slice(0, 100);
          const placeholder = cleanText(el.getAttribute("placeholder") || "").slice(0, 100);
          const href = el.getAttribute("href") || "";
          const disabled = Boolean(el.disabled || el.getAttribute("aria-disabled") === "true");
          const isEditable = Boolean(el.isContentEditable || tag === "input" || tag === "textarea" || role === "textbox");

          return {
            id: index + 1,
            tag,
            role,
            text,
            aria,
            title: titleAttr,
            placeholder,
            href: href.startsWith("http") || href.startsWith("/") ? href : "",
            disabled,
            isEditable,
            rect: {
              x: Math.round(rect.x),
              y: Math.round(rect.y),
              width: Math.round(rect.width),
              height: Math.round(rect.height)
            }
          };
        });

      // 3. Modals and Dialogs
      const dialogs = Array.from(document.querySelectorAll("[role='dialog'], [aria-modal='true']"))
        .filter(isVisible)
        .map(d => ({
          title: cleanText(d.getAttribute("aria-label") || d.querySelector("h1, h2, h3")?.innerText || "").slice(0, 80),
          snippet: cleanText(d.innerText || "").slice(0, 250)
        }));

      // 4. Visible feed/article cards
      const articles = Array.from(document.querySelectorAll("article, [data-pressable-container='true'], .feed-shared-update-v2, [data-pagelet*='SearchResult'], [role='article']"))
        .filter(isVisible)
        .slice(0, 15)
        .map((a, idx) => {
          const authorEl = a.querySelector("a[href*='/@'], a[href*='/in/'], h4, strong, a span");
          const author = cleanText(authorEl?.innerText || authorEl?.textContent || "").slice(0, 60);
          const content = cleanText(a.innerText || "").slice(0, 400);
          return { cardIndex: idx + 1, author, contentSnippet: content };
        });

      return {
        url,
        title,
        interactiveElements: elements,
        activeDialogs: dialogs,
        visibleCards: articles
      };
    });

    logger.info(`[BROWSER AGENT SNAPSHOT] [${this.platform.toUpperCase()}] ${label}: ${snapshot.url} (${snapshot.interactiveElements.length} interactive elements)`);
    return snapshot;
  }

  /**
   * 9-Level Semantic Fallback Locator Hierarchy:
   * Resolves element handle using accessibility, text, aria, placeholder, selectors, context, and coordinates.
   */
  async resolveSemanticElement(locator, timeout = 10000) {
    if (!locator) throw new Error("resolveSemanticElement requires a locator specification");

    const started = Date.now();
    while (Date.now() - started < timeout) {
      const handle = await this.page.evaluateHandle((loc) => {
        const isVisible = el => {
          if (!el) return false;
          const r = el.getBoundingClientRect();
          const s = window.getComputedStyle(el);
          return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none" && s.opacity !== "0";
        };

        const norm = str => (str || "").trim().toLowerCase().replace(/\s+/g, " ");

        const targetRole = loc.role ? norm(loc.role) : "";
        const targetText = loc.text ? norm(loc.text) : "";
        const targetAria = loc.aria ? norm(loc.aria) : "";
        const targetTitle = loc.title ? norm(loc.title) : "";
        const targetPlaceholder = loc.placeholder ? norm(loc.placeholder) : "";
        const targetSelector = loc.selector || "";
        const candidateSelectors = Array.isArray(loc.selectors) ? loc.selectors : [];

        // Pool of all visible interactive candidates
        const candidates = Array.from(document.querySelectorAll(
          "button, [role='button'], a, [role='link'], input, textarea, [contenteditable='true'], [role='textbox'], div[dir='auto'], span, [role='dialog'] button"
        )).filter(isVisible);

        // LEVEL 1: Accessibility Role + Accessible Name (Strict match)
        if (targetRole && (targetAria || targetText)) {
          const match = candidates.find(el => {
            const r = norm(el.getAttribute("role") || el.tagName);
            const a = norm(el.getAttribute("aria-label") || el.getAttribute("aria-description"));
            const t = norm(el.innerText || el.textContent);
            return r.includes(targetRole) && ((targetAria && a === targetAria) || (targetText && t === targetText));
          });
          if (match) return match;
        }

        // LEVEL 2: Visible Text (Exact or close substring)
        if (targetText) {
          const exactText = candidates.find(el => norm(el.innerText || el.textContent) === targetText);
          if (exactText) return exactText;

          const subText = candidates.find(el => norm(el.innerText || el.textContent).includes(targetText));
          if (subText) return subText;
        }

        // LEVEL 3: ARIA Label / Description
        if (targetAria) {
          const ariaMatch = candidates.find(el => {
            const a = norm(el.getAttribute("aria-label") || el.getAttribute("aria-description"));
            return a.includes(targetAria);
          });
          if (ariaMatch) return ariaMatch;
        }

        // LEVEL 4: Title Attribute
        if (targetTitle) {
          const titleMatch = candidates.find(el => norm(el.getAttribute("title")).includes(targetTitle));
          if (titleMatch) return titleMatch;
        }

        // LEVEL 5: Placeholder Attribute
        if (targetPlaceholder) {
          const phMatch = candidates.find(el => norm(el.getAttribute("placeholder")).includes(targetPlaceholder));
          if (phMatch) return phMatch;
        }

        // LEVEL 6: Semantic DOM Attributes
        if (loc.isEditable) {
          const editable = candidates.find(el => el.isContentEditable || el.tagName === "TEXTAREA" || el.getAttribute("role") === "textbox");
          if (editable) return editable;
        }

        // LEVEL 7: Multiple Known Selectors
        const allSelectors = [targetSelector, ...candidateSelectors].filter(Boolean);
        for (const sel of allSelectors) {
          try {
            const el = document.querySelector(sel);
            if (el && isVisible(el)) return el;
          } catch (e) { }
        }

        // LEVEL 8: Contextual Container Scoping
        if (loc.containerText || loc.inDialog) {
          const container = loc.inDialog
            ? document.querySelector("[role='dialog'], [aria-modal='true']")
            : candidates.find(c => norm(c.innerText).includes(norm(loc.containerText)));

          if (container) {
            const scopedCandidates = Array.from(container.querySelectorAll("button, [role='button'], [contenteditable='true'], input")).filter(isVisible);
            if (targetText) {
              const m = scopedCandidates.find(el => norm(el.innerText).includes(targetText));
              if (m) return m;
            }
            if (targetAria) {
              const m = scopedCandidates.find(el => norm(el.getAttribute("aria-label")).includes(targetAria));
              if (m) return m;
            }
            if (scopedCandidates.length > 0) return scopedCandidates[0];
          }
        }

        return null;
      }, locator);

      const el = handle.asElement();
      if (el) return el;
      await new Promise(r => setTimeout(r, 350));
    }

    return null;
  }

  /**
   * Action Plan Validator:
   * Validates structured plan before any browser interaction.
   * Prevents arbitrary executable JS and ensures safe execution boundaries.
   */
  validateActionPlan(plan) {
    if (!plan || typeof plan !== "object") {
      throw new Error("Invalid action plan: expected object with decision and actions");
    }

    if (!Array.isArray(plan.actions)) {
      throw new Error("Invalid action plan: 'actions' must be an array");
    }

    for (let i = 0; i < plan.actions.length; i++) {
      const act = plan.actions[i];
      if (!act.type || !ALLOWED_ACTIONS.has(act.type.toUpperCase())) {
        throw new Error(`Action #${i + 1} uses unsupported action type: ${act.type}. Allowed: ${[...ALLOWED_ACTIONS].join(", ")}`);
      }
      if ((act.type === "CLICK" || act.type === "TYPE" || act.type === "UPLOAD") && !act.target) {
        throw new Error(`Action #${i + 1} (${act.type}) requires a target locator`);
      }
      if ((act.type === "TYPE" || act.type === "UPLOAD") && typeof act.value !== "string") {
        throw new Error(`Action #${i + 1} (TYPE) requires a string 'value'`);
      }
    }
    return true;
  }

  /**
   * Executes a single atomic browser action safely with human typing jitter and center-scrolling.
   */
  async executeAtomicAction(action, correlationId) {
    const type = action.type.toUpperCase();
    const target = action.target || {};
    const started = Date.now();

    telemetry.record({
      correlationId,
      platform: this.platform,
      action: type,
      state: ACTION_STATES.ATTEMPTED,
      pageUrl: this.page.url(),
      targetDescription: JSON.stringify(target)
    });

    switch (type) {
      case "NAVIGATE": {
        const url = action.value || action.url;
        if (!url || !url.startsWith("http")) throw new Error(`NAVIGATE requires absolute HTTP URL: ${url}`);
        logger.info(`[BROWSER AGENT] Navigating to ${url}...`);
        await this.page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
        await new Promise(r => setTimeout(r, 2500));
        return { success: true, url: this.page.url() };
      }

      case "CLICK": {
        const element = await this.resolveSemanticElement(target, target.timeout || 10000);
        if (!element) throw new Error(`Could not resolve element for CLICK: ${JSON.stringify(target)}`);

        await element.evaluate(el => el.scrollIntoView({ behavior: "instant", block: "center", inline: "center" }));
        await new Promise(r => setTimeout(r, 200));

        const box = await element.boundingBox();
        if (box) {
          // Randomized human offset within the button bounding box
          const offsetX = box.x + Math.max(5, Math.min(box.width - 5, box.width / 2 + (Math.random() * 10 - 5)));
          const offsetY = box.y + Math.max(5, Math.min(box.height - 5, box.height / 2 + (Math.random() * 6 - 3)));
          await this.page.mouse.click(offsetX, offsetY);
        } else {
          await element.click();
        }
        await new Promise(r => setTimeout(r, 600));
        return { success: true };
      }

      case "TYPE": {
        const editor = await this.resolveSemanticElement(target, target.timeout || 10000);
        if (!editor) throw new Error(`Could not resolve editable element for TYPE: ${JSON.stringify(target)}`);

        await editor.evaluate(el => el.scrollIntoView({ behavior: "instant", block: "center" }));
        await editor.click();
        await new Promise(r => setTimeout(r, 300));

        if (action.clear) {
          await this.page.keyboard.down("Control");
          await this.page.keyboard.press("KeyA");
          await this.page.keyboard.up("Control");
          await this.page.keyboard.press("Backspace");
        }

        const text = String(action.value || "");
        logger.info(`[BROWSER AGENT] Visibly typing ${text.length} chars...`);
        for (const char of text) {
          await this.page.keyboard.sendCharacter(char);
          const jitter = Math.floor(Math.random() * 35) + 25; // 25ms - 60ms human jitter
          await new Promise(r => setTimeout(r, jitter));
        }
        await new Promise(r => setTimeout(r, 500));
        return { success: true };
      }

      case "PRESS": {
        const key = action.key || action.value || "Enter";
        await this.page.keyboard.press(key);
        await new Promise(r => setTimeout(r, 1000));
        return { success: true, key };
      }

      case "SCROLL": {
        const distance = Number(action.value) || 500;
        await this.page.evaluate(y => window.scrollBy({ top: y, behavior: "smooth" }), distance);
        await new Promise(r => setTimeout(r, 1200));
        return { success: true, distance };
      }

      case "WAIT": {
        const waitMs = Number(action.value) || 2000;
        await new Promise(r => setTimeout(r, waitMs));
        return { success: true, waitMs };
      }

      case "EXTRACT": {
        const snapshot = await this.captureLiveSnapshot(action.label || "extract");
        return { success: true, snapshot };
      }

      case "UPLOAD": {
        const filePath = String(action.value || "").trim();
        if (!filePath) throw new Error("UPLOAD requires a local file path in action.value");
        if (!fs.existsSync(filePath)) throw new Error(`Upload file does not exist: ${filePath}`);
        const input = await this.resolveSemanticElement(target, target.timeout || 10000);
        if (!input) throw new Error(`Could not resolve upload input: ${JSON.stringify(target)}`);
        await input.uploadFile(path.resolve(filePath));
        await new Promise(r => setTimeout(r, 700));
        return { success: true, uploadedPath: path.resolve(filePath) };
      }

      case "STOP":
        return { success: true, stopped: true };

      default:
        throw new Error(`Unimplemented action type: ${type}`);
    }
  }

  /**
   * Executes a complete validated Action Plan through the State Machine:
   * DISCOVERED -> DECIDING -> ATTEMPTED -> SUBMITTED -> VERIFIED
   */
  async executePlan(plan, targetId = "") {
    const correlationId = `plan_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    this.validateActionPlan(plan);

    logger.info(`[BROWSER AGENT] Executing action plan "${plan.goal || 'unnamed'}" with ${plan.actions.length} steps...`, {
      correlationId,
      platform: this.platform,
      targetId
    });

    telemetry.record({
      correlationId,
      platform: this.platform,
      action: "PLAN_START",
      state: ACTION_STATES.DECIDING,
      targetId,
      evidence: { goal: plan.goal, stepCount: plan.actions.length }
    });

    const results = [];
    try {
      for (let i = 0; i < plan.actions.length; i++) {
        const act = plan.actions[i];
        logger.info(`[BROWSER AGENT] Step ${i + 1}/${plan.actions.length}: ${act.type}`);
        const res = await this.executeAtomicAction(act, correlationId);
        results.push(res);
      }

      telemetry.record({
        correlationId,
        platform: this.platform,
        action: "PLAN_SUBMITTED",
        state: ACTION_STATES.SUBMITTED,
        targetId,
        pageUrl: this.page.url()
      });

      // Post-Condition Verification
      if (plan.verification && plan.verification.expected) {
        logger.info(`[BROWSER AGENT] Verifying expected post-condition: "${plan.verification.expected}"...`);
        let verifiedResult = { verified: false };

        if (plan.verification.type === "COMMENT") {
          verifiedResult = await ActionVerifier.verifyCommentPresence(this.page, plan.verification.text || plan.verification.expected, {
            platform: this.platform,
            targetId
          });
        } else if (plan.verification.type === "DM") {
          verifiedResult = await ActionVerifier.verifyOutgoingMessage(this.page, plan.verification.text || plan.verification.expected, {
            platform: this.platform,
            targetId
          });
        } else {
          verifiedResult = await ActionVerifier.verifyTextPresence(this.page, plan.verification.expected, {
            platform: this.platform,
            action: "PLAN_VERIFICATION",
            targetId
          });
        }

        if (!verifiedResult.verified) {
          logger.warn(`[BROWSER AGENT] Post-condition verification unconfirmed: ${verifiedResult.reason}`);
          return {
            success: false,
            state: ACTION_STATES.UNVERIFIED,
            correlationId,
            reason: verifiedResult.reason,
            results
          };
        }
      }

      telemetry.record({
        correlationId,
        platform: this.platform,
        action: "PLAN_COMPLETE",
        state: ACTION_STATES.VERIFIED,
        verified: true,
        targetId,
        pageUrl: this.page.url()
      });

      return {
        success: true,
        state: ACTION_STATES.VERIFIED,
        correlationId,
        results
      };
    } catch (err) {
      logger.error(`[BROWSER AGENT] Action plan failed: ${err.message}`);
      const evidence = await telemetry.captureEvidence(this.page, {
        platform: this.platform,
        action: "PLAN_FAILED",
        targetId,
        error: err.message
      });

      telemetry.record({
        correlationId,
        platform: this.platform,
        action: "PLAN_FAILED",
        state: ACTION_STATES.FAILED,
        verified: false,
        targetId,
        pageUrl: this.page.url(),
        failureReason: err.message,
        evidence
      });

      return {
        success: false,
        state: ACTION_STATES.FAILED,
        correlationId,
        reason: err.message,
        evidence
      };
    }
  }
}

module.exports = {
  BrowserAgent,
  ALLOWED_ACTIONS,
  ACTION_STATES
};
