const CONFIG = require("../../config");
const { getEnabledPlatforms } = require("./platform-registry");
const jobState = require("./storage/job-state-store");
const { buildActionPlan, extractOpportunities } = require("./ai/job-ai");

async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function bootstrapPlatformSession({ platform, page, browserAgent, aiRuntime, candidateProfile }) {
  const allowedOrigin = new URL(platform.url).origin;
  await page.goto(platform.url, {
    waitUntil: "domcontentloaded",
    timeout: CONFIG.JOB_NAVIGATION_TIMEOUT_MS
  });
  await wait(CONFIG.JOB_PAGE_SETTLE_MS);

  let snapshot = await browserAgent.captureLiveSnapshot("auth-bootstrap");
  const plan = await buildActionPlan({
    goal: `Authenticate on this platform using the browser UI. If already authenticated, verify it. Otherwise discover the platform's visible sign-in/register flow and use Google/Continue-with-Google with the configured account ${CONFIG.GOOGLE_ACCOUNT_EMAIL}. Never type a Google password. If the account is not already available in the Google chooser, stop with USER_ACTION_REQUIRED. After authentication, stop.`,
    platform,
    candidateProfile,
    browserSnapshot: snapshot,
    allowedOrigin,
    actionBudget: { maxActions: CONFIG.JOB_MAX_PLAN_ACTIONS }
  }, aiRuntime);

  if (["USER_ACTION_REQUIRED", "MANUAL_ACTION_REQUIRED", "BLOCKED"].includes(plan.status)) {
    jobState.setPlatformState(platform.id, { status: plan.status, reason: plan.reason });
    return { status: plan.status, reason: plan.reason };
  }

  const result = await browserAgent.executeAuthPlan(plan, `auth:${platform.id}`, allowedOrigin);
  snapshot = await browserAgent.captureLiveSnapshot("auth-result");
  const authCheck = await confirmAuthenticated(snapshot, aiRuntime, platform, candidateProfile);

  const authenticated = Boolean(authCheck.authenticated);
  const status = authenticated ? "AUTHENTICATED" : "USER_ACTION_REQUIRED";
  jobState.setPlatformState(platform.id, {
    status,
    authenticated,
    lastUrl: snapshot.url,
    evidence: authCheck.evidence || result.reason || plan.reason || ""
  });

  return { status, authenticated, snapshot, result };
}

async function confirmAuthenticated(snapshot, aiRuntime, platform, candidateProfile) {
  const prompt = `
Return JSON only.
Determine whether the current live page visibly proves authentication on the platform.
Use only visible evidence such as account/profile/dashboard controls, authenticated navigation or sign-out controls.

PLATFORM:
${JSON.stringify(platform)}

CANDIDATE:
${JSON.stringify(candidateProfile)}

SNAPSHOT:
${JSON.stringify(snapshot)}

OUTPUT:
{"authenticated":true|false,"evidence":""}
`;
  return aiRuntime.callAi(prompt, { taskType: "JOB_AUTH_CHECK", priority: 1 });
}

async function completeProfile({ platform, page, browserAgent, aiRuntime, candidateProfile }) {
  const snapshot = await browserAgent.captureLiveSnapshot("profile-bootstrap");
  const plan = await buildActionPlan({
    goal: "Find the platform profile/account editing area through live UI and complete all profile fields that can be populated from verified candidate data. Never guess. Stop for user input when required data is missing.",
    platform,
    candidateProfile,
    browserSnapshot: snapshot,
    allowedOrigin: new URL(platform.url).origin,
    actionBudget: { maxActions: CONFIG.JOB_MAX_PLAN_ACTIONS }
  }, aiRuntime);
  if (["USER_ACTION_REQUIRED", "MANUAL_ACTION_REQUIRED", "BLOCKED"].includes(plan.status)) {
    return { status: plan.status, reason: plan.reason };
  }
  const result = await browserAgent.executeJobPlan(plan, `profile:${platform.id}`, new URL(platform.url).origin);
  return { status: result.success ? "PROFILE_PLAN_COMPLETE" : result.state, result, plan };
}

async function bootstrapAllPlatforms({ browserManager, browserAgentFactory, aiRuntime, candidateProfile }) {
  const pagesByPlatform = {};
  for (const platform of getEnabledPlatforms()) {
    pagesByPlatform[platform.id] = await browserManager.openPlatform(platform);
    const agent = browserAgentFactory(pagesByPlatform[platform.id], platform.id);
    await bootstrapPlatformSession({
      platform,
      page: pagesByPlatform[platform.id],
      browserAgent: agent,
      aiRuntime,
      candidateProfile
    });
    await completeProfile({
      platform,
      page: pagesByPlatform[platform.id],
      browserAgent: agent,
      aiRuntime,
      candidateProfile
    });
  }
  return pagesByPlatform;
}

module.exports = {
  bootstrapPlatformSession,
  completeProfile,
  bootstrapAllPlatforms
};
