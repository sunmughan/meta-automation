const CONFIG = require("../../config");
const { getEnabledPlatforms } = require("./platform-registry");
const jobState = require("./storage/job-state-store");
const { buildActionPlan } = require("./ai/job-ai");
const JobAgentRunner = require("./browser/job-runner");

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

  const runner = new JobAgentRunner({ aiRuntime, browserAgent });
  const result = await runner.run({
    goal: `Authenticate on this platform through its live UI. If already authenticated, verify it. Otherwise discover the visible sign-in/register flow and choose Google/Continue-with-Google using the configured account ${CONFIG.GOOGLE_ACCOUNT_EMAIL}. Never type a Google password. If the account is not already available in the browser chooser, stop with USER_ACTION_REQUIRED. Do not bypass CAPTCHA, identity checks, phone verification or security challenges.`,
    platform,
    candidateProfile,
    allowedOrigin,
    targetId: `auth:${platform.id}`,
    context: { workflow: "AUTH_BOOTSTRAP", googleAccountEmail: CONFIG.GOOGLE_ACCOUNT_EMAIL },
    authFlow: true
  });

  if (result.status !== "DONE") {
    jobState.setPlatformState(platform.id, { status: result.status, reason: result.reason });
    return result;
  }

  // ALWAYS capture fresh snapshot — result.snapshot may be pre-action (stale)
  const snapshot = await browserAgent.captureLiveSnapshot("auth-verification-fresh");
  const authCheck = await confirmAuthenticated(snapshot, aiRuntime, platform, candidateProfile);
  const authenticated = Boolean(authCheck.authenticated);
  const status = authenticated ? "AUTHENTICATED" : "USER_ACTION_REQUIRED";
  jobState.setPlatformState(platform.id, {
    status,
    authenticated,
    lastUrl: snapshot.url,
    evidence: authCheck.evidence || result.reason || ""
  });

  return { ...result, status, authenticated, snapshot };
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
  const runner = new JobAgentRunner({ aiRuntime, browserAgent });
  return runner.run({
    goal: "Find the profile/account editing area and complete every profile field that can be populated from verified candidate data or approved knowledge. Re-inspect after actions. Never guess; stop with USER_ACTION_REQUIRED when a required value is missing.",
    platform,
    candidateProfile,
    allowedOrigin: new URL(platform.url).origin,
    targetId: `profile:${platform.id}`,
    context: { workflow: "PROFILE_COMPLETION" }
  });
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
