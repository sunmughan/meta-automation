const fs = require("fs");
const path = require("path");
const CONFIG = require("../../../config");
const JobAgentRunner = require("../browser/job-runner");

function loadCandidateProfile() {
  if (!fs.existsSync(CONFIG.JOB_PROFILE_PATH)) return null;
  return JSON.parse(fs.readFileSync(CONFIG.JOB_PROFILE_PATH, "utf8"));
}

function saveCandidateProfile(profile) {
  fs.mkdirSync(path.dirname(CONFIG.JOB_PROFILE_PATH), { recursive: true });
  fs.writeFileSync(CONFIG.JOB_PROFILE_PATH, JSON.stringify(profile, null, 2), "utf8");
}

async function inspectAndCompleteProfile({ platform, page, browserAgent, aiRuntime, candidateProfile }) {
  const runner = new JobAgentRunner({ aiRuntime, browserAgent });
  return runner.run({
    goal: "Open the platform profile/account settings and complete every field that can be populated from verified candidate data or approved knowledge. Re-inspect the page after each action batch. Never guess. Stop with USER_ACTION_REQUIRED for required data not present in the candidate source.",
    platform,
    candidateProfile,
    allowedOrigin: new URL(platform.url).origin,
    targetId: `profile:${platform.id}`,
    context: { workflow: "PROFILE_COMPLETION" }
  });
}

module.exports = { loadCandidateProfile, saveCandidateProfile, inspectAndCompleteProfile };
