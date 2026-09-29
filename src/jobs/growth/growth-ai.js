function context(profile, evidence) {
  return JSON.stringify({ profile: profile || {}, evidence: evidence || {} });
}

async function analyzeProfessionalProfile({ profile, snapshots, aiRuntime }) {
  const prompt = `Return JSON only.
TASK: Build a factual professional skill map from the user's configured profile and live GitHub/LinkedIn browser evidence.
SOURCE:
${context(profile, snapshots)}
RULES:
- Use only supplied evidence.
- Do not invent skills, experience, projects, employers or credentials.
- Separate explicit skills from inferred skill signals.
OUTPUT:
{
  "skills":[{"name":"","level":"BEGINNER|INTERMEDIATE|ADVANCED|EXPERT|UNKNOWN","evidence":[],"confidence":0}],
  "experienceSummary":"",
  "credentialGaps":[],
  "recommendedSkillGoals":[]
}`;
  return aiRuntime.callAi(prompt, { taskType: "PROFESSIONAL_PROFILE_ANALYSIS", priority: 1 });
}

async function buildSkillPlan({ profile, skill, evidence, aiRuntime }) {
  const prompt = `Return JSON only.
TASK: Create a practical skill-development plan for the user's selected skill.
USER:
${JSON.stringify(profile || {})}
SELECTED SKILL:
${skill}
PROFILE EVIDENCE:
${JSON.stringify(evidence || {})}
OUTPUT:
{
  "skill":"",
  "currentLevel":"BEGINNER|INTERMEDIATE|ADVANCED|EXPERT|UNKNOWN",
  "targetLevel":"",
  "topics":[],
  "practiceStrategy":"",
  "nextAction":""
}
RULES:
- Ground recommendations in the supplied evidence.
- Do not invent experience.
- Prefer the shortest useful path for the user's current level.`;
  return aiRuntime.callAi(prompt, { taskType: "SKILL_PLAN", priority: 2 });
}

async function buildBrowserPlan({ goal, platform, snapshot, profile, contextData, aiRuntime }) {
  const prompt = `Return JSON only.
You are a live browser reasoning agent.
GOAL:
${goal}
PLATFORM:
${JSON.stringify(platform || {})}
USER PROFILE:
${JSON.stringify(profile || {})}
CONTEXT:
${JSON.stringify(contextData || {})}
LIVE SNAPSHOT:
${JSON.stringify(snapshot || {})}
RULES:
- Decide only from the visible current page.
- Use semantic targets only: visible text, aria-label, role, placeholder, title or dialog context.
- Do not invent selectors, XPath, CSS, coordinates, hidden APIs, cookies or session tokens.
- NAVIGATE may only use URLs visible in the snapshot or the configured platform URL.
- Re-observe after actions.
- CAPTCHA, password, MFA/OTP, identity/security challenge, payment or other user-only action => USER_ACTION_REQUIRED.
- Never claim completion without visible evidence.
- Keep one logical action group per iteration.
OUTPUT:
{
  "status":"READY|DONE|USER_ACTION_REQUIRED|BLOCKED",
  "reason":"",
  "actions":[
    {"type":"CLICK|TYPE|PRESS|SCROLL|NAVIGATE|WAIT|EXTRACT|UPLOAD|STOP","target":{},"value":"","clear":false}
  ],
  "verification":{"type":"TEXT|URL|NONE","expected":""}
}`;
  return aiRuntime.callAi(prompt, { taskType: "PROFESSIONAL_BROWSER_PLAN", priority: 2 });
}

async function discoverCredentials({ skill, searchSnapshot, aiRuntime }) {
  const prompt = `Return JSON only.
TASK: Extract legitimate credential/course candidates from the visible search results.
SKILL:
${skill}
SEARCH SNAPSHOT:
${JSON.stringify(searchSnapshot || {})}
RULES:
- Return only URLs actually visible in the snapshot.
- Prefer issuer-owned pages.
- A candidate must describe a certificate, certification, badge or digital credential.
- Do not claim that something is free unless the evidence says so.
OUTPUT:
{"candidates":[{"url":"","title":"","issuer":"","credentialType":"","freeEvidence":"","skillMatch":[]}]}`;
  return aiRuntime.callAi(prompt, { taskType: "CREDENTIAL_DISCOVERY", priority: 2 });
}

async function verifyCredentialPage({ skill, snapshot, aiRuntime }) {
  const prompt = `Return JSON only.
TASK: Verify a credential opportunity from the current visible page.
SKILL: ${skill}
PAGE:
${JSON.stringify(snapshot || {})}
OUTPUT:
{
  "isCredential":true,
  "title":"",
  "issuer":"",
  "url":"",
  "credentialType":"CERTIFICATE|CERTIFICATION|BADGE|DIGITAL_CREDENTIAL|UNKNOWN",
  "free":true,
  "freeEvidence":"",
  "issueEvidence":"",
  "skillMatch":[],
  "enrollmentAction":""
}
RULES:
- Use only visible evidence.
- free=false/UNKNOWN when price or required paid access is visible or unclear.
- issueEvidence must explicitly indicate that a credential is issued.
`;
  return aiRuntime.callAi(prompt, { taskType: "CREDENTIAL_VERIFY", priority: 2 });
}

module.exports = {
  analyzeProfessionalProfile,
  buildSkillPlan,
  buildBrowserPlan,
  discoverCredentials,
  verifyCredentialPage
};
