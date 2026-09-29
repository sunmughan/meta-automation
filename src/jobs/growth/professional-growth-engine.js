const CONFIG = require("../../../config");
const aiRuntime = require("../../ai/ai-runtime");
const browserManager = require("./growth-browser-manager");
const growthState = require("./growth-state-store");
const { syncProfileEvidence, readConfiguredProfile } = require("./profile-intelligence");
const { buildSkillPlan } = require("./growth-ai");
const { discoverForSkill } = require("./credential-discovery");
const { runLeetCode } = require("./leetcode-engine");

async function runProfileSync() {
  return syncProfileEvidence({ browserManager, aiRuntime });
}

async function runSkill(skill, platform = "leetcode") {
  const profile = readConfiguredProfile();
  if (!profile) throw new Error("Onboarding profile missing. Run npm run onboard first.");

  // Always refresh GitHub + LinkedIn evidence before selecting the learning path.
  const synced = await runProfileSync();
  const plan = await buildSkillPlan({
    profile,
    skill,
    evidence: synced.analysis || growthState.state.profileEvidence.combined,
    aiRuntime
  });

  growthState.setGoal({
    id: "skill:" + skill.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    type: "SKILL_DEVELOPMENT",
    skill,
    status: "PLANNED",
    plan,
    sourceEvidence: ["github", "linkedin"].filter(source => Boolean(growthState.state.profileEvidence[source]))
  });

  if (platform === "leetcode") {
    return runLeetCode({ browserManager, aiRuntime, profile, skill, plan });
  }
  throw new Error("Unsupported skill platform: " + platform);
}

async function discoverCredentials(skill) {
  return discoverForSkill({ browserManager, aiRuntime, skill });
}

async function runCertificationCredential(credential) {
  const profile = readConfiguredProfile();
  if (!profile) throw new Error("Onboarding profile missing. Run npm run onboard first.");
  const platform = {
    id: credential.issuer || "discovered-credential",
    name: credential.issuer || "Discovered credential platform",
    url: credential.url
  };
  const { GrowthRunner } = require("./growth-runner");
  const page = await browserManager.pageFor(credential.url);
  const runner = new GrowthRunner({ aiRuntime, page, platformId: platform.id });
  const goal = `Complete the selected credential shown on this website.
Credential:
${JSON.stringify(credential)}
Use the logged-in browser session.
Enroll/start the credential, complete the visible course activities and continue until the credential is visibly issued.
Do not purchase anything. Payment requires the user.
Never claim completion without visible credential evidence.`;
  const result = await runner.run({
    goal,
    platform,
    profile,
    context: { credential, mode: "CERTIFICATION" },
    allowedOrigin: new URL(credential.url).origin
  });
  growthState.setCredential({
    ...credential,
    status: result.status,
    completionEvidence: result.status === "DONE" ? result.snapshot?.bodyText?.slice(0, 2000) : "",
    lastRunAt: new Date().toISOString()
  });
  if (result.status === "DONE") growthState.metric("credentialsCompleted");
  return result;
}

async function runSelectedGoals({ skills = [], certificationSkills = [] }) {
  const report = { profile: null, skills: [], credentials: [] };
  report.profile = await runProfileSync();

  for (const skill of skills) {
    report.skills.push({ skill, result: await runSkill(skill, "leetcode") });
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
  runSelectedGoals
};
