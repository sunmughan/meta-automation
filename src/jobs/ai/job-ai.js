const knowledge = require("../../knowledge/knowledge-engine");
const { getFounderInfo, getCompanyInfo } = knowledge;

function buildCandidateContext(candidateProfile) {
  return {
    candidateProfile,
    founder: getFounderInfo?.() || {},
    company: getCompanyInfo?.() || {}
  };
}

async function qualifyOpportunity(opportunity, aiRuntime, candidateProfile) {
  const prompt = `
Return JSON only.

TASK: Determine whether this opportunity should be considered for application.

SOURCE OF TRUTH:
${JSON.stringify(buildCandidateContext(candidateProfile))}

OPPORTUNITY:
${JSON.stringify(opportunity)}

NON-NEGOTIABLE RULES:
- Only remote opportunities pass.
- If remote status is unknown, do not pass.
- Reject hybrid and on-site.
- Do not invent facts.
- Do not infer eligibility the source does not support.
- Evaluate skills, project type, seniority, budget, location requirements, application requirements.
- A high-fit result requires enough evidence from the opportunity itself.
- Never use hidden assumptions.

OUTPUT:
{
  "remoteStatus":"REMOTE|HYBRID|ONSITE|UNKNOWN",
  "fit":true|false,
  "matchScore":0-100,
  "matchedSkills":[],
  "missingSkills":[],
  "projectType":"",
  "budgetFit":"GOOD|LOW|UNKNOWN",
  "reason":"",
  "apply":true|false
}
`;
  return aiRuntime.callAi(prompt, { taskType: "JOB_QUALIFICATION", priority: 1 });
}

async function generateCoverLetter(opportunity, candidateProfile, aiRuntime) {
  const prompt = `
Return JSON only.
Generate one tailored cover letter for this exact opportunity.

CANDIDATE:
${JSON.stringify(buildCandidateContext(candidateProfile))}

OPPORTUNITY:
${JSON.stringify(opportunity)}

RULES:
- Use only verifiable facts from the candidate and knowledge base.
- No fabricated experience, clients, metrics, certifications or timelines.
- Address the actual project and requested deliverables.
- Keep it concise, human and professional.
OUTPUT: {"coverLetter":""}
`;
  return aiRuntime.callAi(prompt, { taskType: "JOB_COVER_LETTER", priority: 2 });
}

async function buildActionPlan({ goal, platform, opportunity, candidateProfile, browserSnapshot, allowedOrigin, actionBudget }, aiRuntime) {
  const prompt = `
Return JSON only.

You are the browser planning agent. You act ONLY through the live browser UI represented by the snapshot.
Do not invent selectors, DOM nodes, element ids, URLs, API calls, hidden endpoints, JavaScript execution or network requests.
Use only the interactive elements and page evidence present in the supplied live snapshot.

GOAL:
${goal}

PLATFORM CONFIG:
${JSON.stringify(platform)}

ALLOWED ORIGIN:
${allowedOrigin}

OPPORTUNITY:
${JSON.stringify(opportunity || {})}

CANDIDATE:
${JSON.stringify(candidateProfile || {})}

ACTION BUDGET:
${JSON.stringify(actionBudget || {})}

LIVE SNAPSHOT:
${JSON.stringify(browserSnapshot || {})}

Allowed actions:
NAVIGATE, CLICK, TYPE, PRESS, SCROLL, WAIT, EXTRACT, BACK, CLOSE, STOP

Rules:
- Never navigate outside the allowed platform origin.
- Never reveal or request passwords, 2FA codes, security answers or session cookies.
- For Google OAuth, click the platform's Google/Continue-with-Google control when present. After Google opens, select the configured Google account only when the account is already available in the browser chooser. Otherwise stop with USER_ACTION_REQUIRED.
- Never bypass CAPTCHA, bot challenges, identity checks or payment/verification gates. Stop with MANUAL_ACTION_REQUIRED.
- For application submissions, do not submit until every required field is mapped and validated from known data.
- Never fabricate an application answer. If a required answer is unknown, stop with USER_ACTION_REQUIRED.
- For remote-only discovery, do not mark unknown work mode as remote.
- Prefer semantic locators from live accessibility/text evidence; do not create CSS/XPath selectors.
- Return:
{
  "status":"READY|USER_ACTION_REQUIRED|MANUAL_ACTION_REQUIRED|BLOCKED|DONE",
  "reason":"",
  "goal":"",
  "actions":[
    {"type":"CLICK|TYPE|PRESS|SCROLL|WAIT|NAVIGATE|EXTRACT|BACK|CLOSE|STOP","target":{},"value":"","clear":false}
  ],
  "verification":{"type":"TEXT|URL|FORM|APPLICATION|NONE","expected":"","text":""}
}
`;
  return aiRuntime.callAi(prompt, { taskType: "JOB_BROWSER_PLAN", priority: 3 });
}

module.exports = { qualifyOpportunity, generateCoverLetter, buildActionPlan };
