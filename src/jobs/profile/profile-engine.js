const fs = require("fs");
const path = require("path");
const CONFIG = require("../../../config");
const { buildActionPlan } = require("../ai/job-ai");

function loadCandidateProfile() {
  if (!fs.existsSync(CONFIG.JOB_PROFILE_PATH)) return null;
  return JSON.parse(fs.readFileSync(CONFIG.JOB_PROFILE_PATH, "utf8"));
}

function saveCandidateProfile(profile) {
  fs.mkdirSync(path.dirname(CONFIG.JOB_PROFILE_PATH), { recursive: true });
  fs.writeFileSync(CONFIG.JOB_PROFILE_PATH, JSON.stringify(profile, null, 2), "utf8");
}

async function inspectAndCompleteProfile({ platform, page, browserAgent, aiRuntime, candidateProfile }) {
  const snapshot = await browserAgent.captureLiveSnapshot("profile");
  const plan = await buildActionPlan({
    goal: `Open or inspect the platform's profile/account area and complete all profile fields that can be filled from the candidate profile or approved knowledge. Do not invent unknown values. If a field requires user input, return USER_ACTION_REQUIRED with the exact field needed.`,
    platform,
    opportunity: null,
    candidateProfile,
    browserSnapshot: snapshot,
    allowedOrigin: new URL(platform.url).origin,
    actionBudget: { maxActions: CONFIG.JOB_MAX_PLAN_ACTIONS }
  }, aiRuntime);

  if (plan.status === "USER_ACTION_REQUIRED" || plan.status === "MANUAL_ACTION_REQUIRED") {
    return { status: plan.status, reason: plan.reason, snapshot, plan };
  }

  const result = await browserAgent.executePlan(plan, `profile:${platform.id}`);
  return { ...result, plan };
}

module.exports = { loadCandidateProfile, saveCandidateProfile, inspectAndCompleteProfile };
