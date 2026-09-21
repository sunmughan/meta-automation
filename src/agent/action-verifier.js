const telemetry = require("../telemetry/action-telemetry");

async function verifyTextPresence(page, text, options = {}) {
  const snippet = String(text || "").slice(0, options.snippetLength || 40).trim();
  if (!snippet) return { verified: false, reason: "Empty verification text" };

  const timeout = options.timeout || 12000;
  try {
    await page.waitForFunction(
      expected => {
        const body = (document.body.innerText || "").toLowerCase();
        return body.includes(String(expected).toLowerCase());
      },
      { timeout },
      snippet
    );
    telemetry.record({ type:"ACTION_VERIFIED", platform:options.platform, action:options.action, targetId:options.targetId, evidence:{snippet} });
    return { verified:true, evidence:{snippet} };
  } catch (e) {
    telemetry.record({ type:"ACTION_UNVERIFIED", platform:options.platform, action:options.action, targetId:options.targetId, error:e.message });
    return { verified:false, reason:e.message };
  }
}

module.exports = { verifyTextPresence };
