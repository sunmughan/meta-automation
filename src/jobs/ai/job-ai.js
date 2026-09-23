const knowledge = require("../../knowledge/knowledge-engine");

function buildCandidateContext(candidateProfile) {
  return {
    candidateProfile,
    founder: knowledge.getFounderInfo?.() || {},
    company: knowledge.getCompanyInfo?.() || {},
    approvedProfiles: knowledge.getOfficialProfiles?.() || {}
  };
}

async function qualifyOpportunity(opportunity, aiRuntime, candidateProfile) {
  const prompt = `
Return JSON only.

TASK: Evaluate one discovered work opportunity for the configured candidate.

CANDIDATE SOURCE OF TRUTH:
${JSON.stringify(buildCandidateContext(candidateProfile))}

OPPORTUNITY EVIDENCE:
${JSON.stringify(opportunity)}

NON-NEGOTIABLE CONSTRAINTS:
- Target is remote PROJECT work only.
- REMOTE must be explicitly supported by the captured opportunity evidence.
- HYBRID, ON-SITE, EMPLOYMENT, RECRUITMENT or UNKNOWN work modes do not qualify.
- Never infer missing facts.
- Never invent skills, eligibility, location/work authorization, budget fit or client facts.
- Compare the actual requirements with verified candidate facts.
- MatchScore is a decision aid, not a probability.
- Do not apply unless apply=true and every required input is known or derivable from verified source data.

OUTPUT:
{
  "remoteStatus":"REMOTE|HYBRID|ONSITE|UNKNOWN",
  "engagementType":"PROJECT|EMPLOYMENT|RECRUITMENT|UNKNOWN",
  "fit":true|false,
  "matchScore":0,
  "matchedSkills":[],
  "missingSkills":[],
  "projectType":"",
  "budgetFit":"GOOD|LOW|UNKNOWN",
  "applicationRequirements":{"coverLetter":false,"resume":false,"questions":[],"attachments":[]},
  "reason":"",
  "apply":true|false
}
`;
  return aiRuntime.callAi(prompt, { taskType: "JOB_QUALIFICATION", priority: 1 });
}

async function extractOpportunities({ platform, snapshot, aiRuntime, candidateProfile, maxItems }) {
  const prompt = `
Return JSON only.

TASK: Extract current opportunities visible in this live browser snapshot.
The snapshot is the ONLY evidence source. Do not fabricate or complete missing fields.

PLATFORM:
${JSON.stringify(platform)}

CANDIDATE:
${JSON.stringify(buildCandidateContext(candidateProfile))}

MAX ITEMS:
${maxItems}

LIVE SNAPSHOT:
${JSON.stringify(snapshot)}

RULES:
- Extract only opportunities actually evidenced by the snapshot.
- Capture explicit remote wording/evidence.
- workMode MUST be UNKNOWN when the snapshot does not establish it.
- Do not treat an author's generic profile or site-level claim as job-specific remote evidence.
- Prefer stable visible URLs and visible identifiers.
- Do not invent budgets, skills, client facts, application fields or dates.

OUTPUT:
{
  "opportunities":[
    {
      "externalId":"",
      "url":"",
      "title":"",
      "description":"",
      "workMode":"REMOTE|HYBRID|ONSITE|UNKNOWN",
      "remoteEvidence":"",
      "engagementType":"PROJECT|EMPLOYMENT|RECRUITMENT|UNKNOWN",
      "skills":[],
      "budget":null,
      "experience":"",
      "locationRequirement":"",
      "application":{"requiresCoverLetter":false,"requiresResume":false,"questions":[],"attachments":[]},
      "client":{}
    }
  ]
}
`;
  return aiRuntime.callAi(prompt, { taskType: "JOB_OPPORTUNITY_EXTRACTION", priority: 2 });
}

async function inspectOpportunityDetails({ platform, opportunity, snapshot, aiRuntime, candidateProfile }) {
  const prompt = `
Return JSON only.

TASK: Reconcile this opportunity using only the live detail-page snapshot.
This is a verification pass, not a discovery pass.

PLATFORM:
${JSON.stringify(platform)}

OPPORTUNITY CANDIDATE:
${JSON.stringify(opportunity)}

LIVE DETAIL SNAPSHOT:
${JSON.stringify(snapshot)}

RULES:
- The snapshot is the only source for detail verification.
- Confirm explicit remote/project evidence from the opportunity detail page.
- If work mode is not explicit, return UNKNOWN.
- If the detail page shows employment/recruitment rather than a project, return the corresponding engagement type.
- Never infer missing facts.
- Preserve stable visible URL and identifier when available.

OUTPUT:
{
  "externalId":"",
  "url":"",
  "title":"",
  "description":"",
  "workMode":"REMOTE|HYBRID|ONSITE|UNKNOWN",
  "remoteEvidence":"",
  "engagementType":"PROJECT|EMPLOYMENT|RECRUITMENT|UNKNOWN",
  "skills":[],
  "budget":null,
  "experience":"",
  "locationRequirement":"",
  "application":{"requiresCoverLetter":false,"requiresResume":false,"questions":[],"attachments":[]},
  "client":{}
}
`;
  return aiRuntime.callAi(prompt, { taskType: "JOB_DETAIL_VERIFICATION", priority: 2 });
}

async function generateCoverLetter(opportunity, candidateProfile, aiRuntime) {
  const prompt = `
Return JSON only.
Generate a tailored cover letter for the exact opportunity.

CANDIDATE:
${JSON.stringify(buildCandidateContext(candidateProfile))}

OPPORTUNITY:
${JSON.stringify(opportunity)}

RULES:
- Use only verified candidate/knowledge facts.
- Do not fabricate employers, clients, metrics, dates, credentials, tools or outcomes.
- Address the actual project requirements.
- Concise, natural, professional and project-specific.
- Do not mention that AI was used.
OUTPUT: {"coverLetter":""}
`;
  return aiRuntime.callAi(prompt, { taskType: "JOB_COVER_LETTER", priority: 2 });
}

async function buildActionPlan({ goal, platform, opportunity, candidateProfile, browserSnapshot, allowedOrigin, actionBudget, context = {} }, aiRuntime) {
  const prompt = `
Return JSON only.

You are the browser planning agent.
You operate ONLY from the live browser snapshot.
The browser is the only execution surface.

DO NOT:
- invent CSS/XPath selectors;
- invent DOM node ids;
- use page.evaluate or JavaScript execution;
- call APIs;
- call hidden endpoints;
- inspect cookies/session tokens;
- invent URLs not present in evidence or platform configuration.

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

WORKFLOW CONTEXT:
${JSON.stringify(context || {})}

LIVE SNAPSHOT:
${JSON.stringify(browserSnapshot || {})}

Allowed actions:
NAVIGATE, CLICK, TYPE, PRESS, SCROLL, WAIT, EXTRACT, BACK, CLOSE, STOP

Rules:
- Use semantic locator evidence only: visible text, aria, role, placeholder, title, or dialog context from the snapshot.
- Never return selector/selectors fields.
- Never use coordinates.
- NAVIGATE must stay inside the allowed platform origin except an OAuth handoff requested by the platform. For OAuth, the runner may allow the observed Google authorization origin only for the authentication step.
- For Google OAuth, use the platform's live Google/Continue-with-Google control when present. Never type a Google password, recovery code or 2FA code.
- If the configured Google account is already visible in the chooser, select it.
- If the chooser offers "Use another account", select it and type only the configured Google account email. Stop with USER_ACTION_REQUIRED when Google asks for a password, 2FA, recovery or another user-only security step.
- If Google OAuth is not available on this platform, do not invent an OAuth path; use the platform's visible normal login/register flow only when it does not require credentials stored by this project, otherwise return USER_ACTION_REQUIRED.
- CAPTCHA, bot challenge, identity verification, payment/credit purchase, phone verification or legal attestation requiring user confirmation => MANUAL_ACTION_REQUIRED.
- Never submit an application when a required field is unknown.
- Never mark unknown work mode as REMOTE.
- For profile editing, only fill known candidate facts.
- For job application, use the supplied cover letter/resume paths only when the form requests them.
- Keep the plan within the action budget.
- Return:
{
  "status":"READY|USER_ACTION_REQUIRED|MANUAL_ACTION_REQUIRED|BLOCKED|DONE",
  "reason":"",
  "goal":"",
  "actions":[
    {"type":"CLICK|TYPE|PRESS|SCROLL|WAIT|NAVIGATE|EXTRACT|UPLOAD|BACK|CLOSE|STOP","target":{},"value":"","clear":false}
  ],
  "verification":{"type":"TEXT|URL|FORM|APPLICATION|NONE","expected":"","text":""}
}
`;
  return aiRuntime.callAi(prompt, { taskType: "JOB_BROWSER_PLAN", priority: 3 });
}

module.exports = {
  qualifyOpportunity,
  extractOpportunities,
  inspectOpportunityDetails,
  generateCoverLetter,
  buildActionPlan
};
