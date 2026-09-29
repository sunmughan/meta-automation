async function buildPortfolioPublishPlan({ project, brand, platform, snapshot, aiRuntime, assetPath }) {
  const prompt = `Return JSON only.
TASK: Publish one portfolio project through the currently visible authenticated website UI.
PROJECT:
${JSON.stringify(project)}
BRAND:
${JSON.stringify(brand)}
PLATFORM:
${JSON.stringify(platform)}
LIVE SNAPSHOT:
${JSON.stringify(snapshot)}
ASSET_PATH_TOKEN:
{{ASSET_PATH}}

OPERATING RULES:
- Reason from the current visible UI; do not assume a field exists.
- Use semantic targets only: role, visible text, aria-label, title, placeholder, input type/name/autocomplete, or dialog/container context.
- Never output CSS selectors, XPath, coordinates, JavaScript, hidden APIs, cookies or tokens.
- If the current page shows the project is already published, return DONE without duplicating it.
- If a field requires a project value, use only PROJECT/BRAND evidence supplied above.
- Use UPLOAD with value "{{ASSET_PATH}}" only when a visible file input is available.
- Do not invent project metrics, technologies, clients, prices, results or credentials.
- Never purchase anything.
- CAPTCHA, MFA, identity/security challenge, payment, or ambiguous security state => USER_ACTION_REQUIRED.
- Never claim publication without visible post-condition evidence.
- Re-observe after every action group.
OUTPUT:
{
  "status":"READY|DONE|USER_ACTION_REQUIRED|BLOCKED",
  "reason":"",
  "actions":[
    {"type":"CLICK|TYPE|PRESS|SCROLL|WAIT|NAVIGATE|UPLOAD|EXTRACT|STOP","target":{},"value":"","clear":false}
  ],
  "verification":{"type":"TEXT|URL|NONE","expected":""}
}`;
  const plan = await aiRuntime.callAi(prompt, {
    taskType: "PORTFOLIO_PUBLISH_PLAN",
    priority: 1
  });
  if (plan?.actions) {
    for (const action of plan.actions) {
      if (action.value === "{{ASSET_PATH}}") action.value = assetPath;
    }
  }
  return plan;
}

module.exports = { buildPortfolioPublishPlan };
