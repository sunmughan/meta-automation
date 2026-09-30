const CONFIG = require("../../../config");
const aiRuntime = require("../../ai/ai-runtime");
const browserManager = require("./growth-browser-manager");
const growthState = require("./growth-state-store");
const { syncProfileEvidence, readConfiguredProfile } = require("./profile-intelligence");
const { buildSkillPlan, selectSkillPlatform } = require("./growth-ai");
const { discoverForSkill } = require("./credential-discovery");
const { runSkillDevelopment } = require("./skill-development-engine");
const { getSkillPlatforms } = require("./professional-growth-platform-registry");

async function runProfileSync() {
  return syncProfileEvidence({ browserManager, aiRuntime });
}

async function runSkill(skill, platformId = null) {
  const profile = readConfiguredProfile();
  if (!profile) throw new Error("Onboarding profile missing. Run npm run onboard first.");

  const synced = await runProfileSync();
  const plan = await buildSkillPlan({
    profile,
    skill,
    evidence: synced.analysis || growthState.state.profileEvidence.combined,
    aiRuntime
  });

  const platforms = getSkillPlatforms();
  if (!platforms.length) throw new Error("No enabled professional growth learning platforms are configured.");

  let selection = platformId
    ? { platformId, reason: "Explicit platform supplied by caller", evidence: [], confidence: 1 }
    : await selectSkillPlatform({ skill, profile, plan, platforms, aiRuntime });

  const platform = platforms.find(item => item.id === selection.platformId);
  if (!platform) throw new Error("AI selected an unavailable growth platform: " + selection.platformId);

  const goalId = "skill:" + skill.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const existingGoal = growthState.getGoal(goalId);
  if (existingGoal && existingGoal.status === "DONE") {
    return {
      status: "DONE",
      skipped: true,
      reason: `Goal '${goalId}' is already completed.`,
      goal: existingGoal
    };
  }

  if (!existingGoal) {
    growthState.transitionGoal(goalId, "PLANNED", {
      type: "SKILL_DEVELOPMENT",
      skill,
      plan,
      selectedPlatform: platform.id,
      platformSelection: selection,
      sourceEvidence: ["github", "linkedin"].filter(source => Boolean(growthState.state.profileEvidence[source]))
    });
  } else {
    growthState.setGoal({
      id: goalId,
      plan,
      selectedPlatform: platform.id,
      platformSelection: selection,
      sourceEvidence: ["github", "linkedin"].filter(source => Boolean(growthState.state.profileEvidence[source]))
    });
  }

  return runSkillDevelopment({
    browserManager,
    aiRuntime,
    profile,
    skill,
    plan,
    platformId: platform.id
  });
}

async function discoverCredentials(skill) {
  return discoverForSkill({ browserManager, aiRuntime, skill });
}

async function runCertificationCredential(credential) {
  const profile = readConfiguredProfile();
  if (!profile) throw new Error("Onboarding profile missing. Run npm run onboard first.");
  const credentialId = credential.id || ("cert:" + (credential.issuer || "unknown") + ":" + (credential.name || credential.title || "item").toLowerCase().replace(/[^a-z0-9]+/g, "-"));
  const existing = growthState.state.credentials[credentialId];
  if (existing && existing.status === "DONE") {
    return { status: "DONE", skipped: true, reason: `Credential '${credentialId}' is already completed.`, credential: existing };
  }

  const platform = {
    id: credential.issuer || "discovered-credential",
    name: credential.issuer || "Discovered credential platform",
    url: credential.url
  };
  const { GrowthRunner } = require("./growth-runner");
  const page = await browserManager.pageFor(credential.url);
  const runner = new GrowthRunner({ aiRuntime, page, platformId: platform.id });
  const goal = `Complete the selected credential shown on this website.

CREDENTIAL:
${JSON.stringify(credential)}

OPERATING RULES:
- Use the logged-in browser session.
- Reason from visible current state and credential evidence.
- Enroll/start the credential and continue through visible learning activities.
- Continue until the credential is visibly issued.
- Do not purchase anything; payment always requires the user.
- Never claim completion without visible credential evidence.
- Stop for CAPTCHA, MFA, identity verification, proctoring, payment or other user-only action.`;
  const result = await runner.run({
    goal,
    platform,
    profile,
    context: { credential, mode: "CERTIFICATION", resumeFromState: true },
    allowedOrigin: new URL(credential.url).origin
  });
  growthState.transitionCredential(credentialId, result.status, {
    ...credential,
    completionEvidence: result.status === "DONE" ? result.snapshot?.bodyText?.slice(0, 2000) : "",
    lastRunAt: new Date().toISOString()
  });
  return result;
}

async function runSelectedGoals({ skills = [], certificationSkills = [] }) {
  const report = { profile: null, skills: [], credentials: [] };
  report.profile = await runProfileSync();

  for (const skill of skills) {
    report.skills.push({ skill, result: await runSkill(skill) });
  }

  for (const skill of certificationSkills) {
    const credentials = await discoverCredentials(skill);
    for (const credential of credentials.slice(0, CONFIG.PROFESSIONAL_GROWTH_MAX_CREDENTIALS_PER_RUN)) {
      report.credentials.push({ skill, credential, result: await runCertificationCredential(credential) });
    }
  }

  browserManager.disconnect();
  return report;
}

module.exports = {
  runProfileSync,
  runSkill,
  discoverCredentials,
  runCertificationCredential,
  runSelectedGoals,
  readConfiguredProfile
};
