/**
 * src/agent/action-verifier.js
 * Multi-signal post-condition verifier for live browser interactions.
 * Strictly verifies DOM mutations outside draft composers before marking success.
 */

const telemetry = require("../telemetry/action-telemetry");
const logger = require("../logging/logger");

class ActionVerifier {
  /**
   * Generic text presence verification across document body.
   */
  static async verifyTextPresence(page, text, options = {}) {
    const snippet = String(text || "").slice(0, options.snippetLength || 40).trim();
    if (!snippet) return { verified: false, reason: "Empty verification text" };

    const timeout = options.timeout || 12000;
    const platform = options.platform || "unknown";
    const action = options.action || "GENERIC_VERIFY";
    const targetId = options.targetId || "";

    try {
      await page.waitForFunction(
        expected => {
          const body = (document.body ? document.body.innerText : "").toLowerCase();
          return body.includes(String(expected).toLowerCase());
        },
        { timeout },
        snippet
      );

      telemetry.record({
        type: "ACTION_VERIFIED",
        state: "VERIFIED",
        verified: true,
        platform,
        action,
        targetId,
        pageUrl: page.url(),
        evidence: { snippet }
      });
      return { verified: true, evidence: { snippet } };
    } catch (e) {
      const evidence = await telemetry.captureEvidence(page, { platform, action, targetId, error: e.message });
      telemetry.record({
        type: "ACTION_UNVERIFIED",
        state: "UNVERIFIED",
        verified: false,
        platform,
        action,
        targetId,
        pageUrl: page.url(),
        failureReason: e.message,
        evidence
      });
      return { verified: false, reason: e.message, evidence };
    }
  }

  /**
   * Strict comment presence verification:
   * Confirms comment snippet exists in permanent DOM and is NOT inside draft/composer.
   */
  static async verifyCommentPresence(page, text, options = {}) {
    const snippet = String(text || "")
      .replace(/https?:\/\/[^\s]+/g, "")
      .trim()
      .slice(0, options.snippetLength || 35)
      .toLowerCase();

    if (!snippet || snippet.length < 4) {
      return { verified: false, reason: "Snippet too short for reliable DOM verification" };
    }

    const timeout = options.timeout || 15000;
    const platform = options.platform || "threads";
    const targetId = options.targetId || "";
    const started = Date.now();

    while (Date.now() - started < timeout) {
      const result = await page.evaluate((snip) => {
        // 1. Scan for platform error alerts or rate limit dialogs
        const bodyText = (document.body ? document.body.innerText : "").toLowerCase();
        const hasError = /\b(couldn'?t post|something went wrong|try again later|action blocked|rate limit)\b/i.test(bodyText);
        if (hasError) return { verified: false, error: "Platform error dialog or rate limit alert detected" };

        // 2. Search only committed article/comment containers outside any editable fields
        const candidates = Array.from(document.querySelectorAll(
          "article, [data-pressable-container='true'], .comments-comment-item, [data-scope='messages_table'], div[dir='auto'], [role='article']"
        ));

        for (const el of candidates) {
          if (el.tagName === "SCRIPT" || el.tagName === "STYLE") continue;
          if (el.isContentEditable || el.closest("[contenteditable='true'], div[role='textbox'], form, textarea, input")) continue;

          const textContent = (el.innerText || el.textContent || "").toLowerCase();
          if (textContent.includes(snip)) {
            return { verified: true, tag: el.tagName, className: el.className ? String(el.className).slice(0, 50) : "" };
          }
        }
        return { verified: false, awaiting: true };
      }, snippet);

      if (result.verified) {
        telemetry.record({
          type: "ACTION_VERIFIED",
          state: "VERIFIED",
          verified: true,
          platform,
          action: "COMMENT_POST",
          targetId,
          pageUrl: page.url(),
          evidence: { snippet, containerTag: result.tag }
        });
        return { verified: true, evidence: result };
      }

      if (result.error) {
        const evidence = await telemetry.captureEvidence(page, { platform, action: "COMMENT_POST", targetId, error: result.error });
        telemetry.record({
          type: "ACTION_FAILED",
          state: "FAILED",
          verified: false,
          platform,
          action: "COMMENT_POST",
          targetId,
          pageUrl: page.url(),
          failureReason: result.error,
          evidence
        });
        return { verified: false, reason: result.error, evidence };
      }

      await new Promise(r => setTimeout(r, 1000));
    }

    const evidence = await telemetry.captureEvidence(page, { platform, action: "COMMENT_POST", targetId, error: "Snippet not detected in permanent DOM after timeout" });
    telemetry.record({
      type: "ACTION_UNVERIFIED",
      state: "UNVERIFIED",
      verified: false,
      platform,
      action: "COMMENT_POST",
      targetId,
      pageUrl: page.url(),
      failureReason: "Snippet not detected in permanent DOM after timeout",
      evidence
    });
    return { verified: false, reason: "Comment unverified in DOM", evidence };
  }

  /**
   * Direct Message outgoing bubble verification:
   * Confirms outgoing chat bubble contains text and is rendered in chat history.
   */
  static async verifyOutgoingMessage(page, text, options = {}) {
    const snippet = String(text || "").trim().slice(0, 30).toLowerCase();
    const platform = options.platform || "threads";
    const targetId = options.targetId || "";
    const timeout = options.timeout || 12000;
    const started = Date.now();

    while (Date.now() - started < timeout) {
      const verified = await page.evaluate((snip) => {
        const bubbles = Array.from(document.querySelectorAll(
          "[data-testid*='message'], [data-testid*='outgoing'], [class*='outgoing'], div[dir='auto'][role='none'], div[role='row']"
        ));
        return bubbles.some(b => {
          if (b.isContentEditable || b.closest("[contenteditable='true'], div[role='textbox']")) return false;
          return (b.innerText || "").toLowerCase().includes(snip);
        });
      }, snippet);

      if (verified) {
        telemetry.record({
          type: "ACTION_VERIFIED",
          state: "VERIFIED",
          verified: true,
          platform,
          action: "DM_SEND",
          targetId,
          pageUrl: page.url(),
          evidence: { snippet }
        });
        return { verified: true };
      }
      await new Promise(r => setTimeout(r, 1000));
    }

    const evidence = await telemetry.captureEvidence(page, { platform, action: "DM_SEND", targetId, error: "Outgoing message bubble not confirmed" });
    telemetry.record({
      type: "ACTION_UNVERIFIED",
      state: "UNVERIFIED",
      verified: false,
      platform,
      action: "DM_SEND",
      targetId,
      pageUrl: page.url(),
      failureReason: "Outgoing message bubble not confirmed in chat thread",
      evidence
    });
    return { verified: false, reason: "Message unverified", evidence };
  }

  /**
   * Connection Request state change verification:
   * Confirms button transitioned to "Pending" / "Invitation sent" / "Withdraw".
   */
  static async verifyConnectionRequested(page, profileId, options = {}) {
    const platform = options.platform || "linkedin";
    const timeout = options.timeout || 10000;
    const started = Date.now();

    while (Date.now() - started < timeout) {
      const state = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll("button, [role='button']"));
        const pendingBtn = btns.find(b => {
          const t = (b.innerText || b.getAttribute("aria-label") || "").toLowerCase();
          return t.includes("pending") || t.includes("invitation sent") || t.includes("withdraw");
        });
        return Boolean(pendingBtn);
      });

      if (state) {
        telemetry.record({
          type: "ACTION_VERIFIED",
          state: "VERIFIED",
          verified: true,
          platform,
          action: "CONNECT_REQUEST",
          targetId: profileId,
          pageUrl: page.url()
        });
        return { verified: true };
      }
      await new Promise(r => setTimeout(r, 800));
    }

    const evidence = await telemetry.captureEvidence(page, { platform, action: "CONNECT_REQUEST", targetId: profileId, error: "Connection state change unverified" });
    telemetry.record({
      type: "ACTION_UNVERIFIED",
      state: "UNVERIFIED",
      verified: false,
      platform,
      action: "CONNECT_REQUEST",
      targetId: profileId,
      pageUrl: page.url(),
      evidence
    });
    return { verified: false, reason: "Connection state change unverified", evidence };
  }
}

module.exports = {
  ActionVerifier,
  verifyTextPresence: ActionVerifier.verifyTextPresence,
  verifyCommentPresence: ActionVerifier.verifyCommentPresence,
  verifyOutgoingMessage: ActionVerifier.verifyOutgoingMessage,
  verifyConnectionRequested: ActionVerifier.verifyConnectionRequested
};
