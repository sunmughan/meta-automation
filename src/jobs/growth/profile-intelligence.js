const growthState = require("./growth-state-store");
const { analyzeProfessionalProfile } = require("./growth-ai");

function readConfiguredProfile() {
  const fs = require("fs");
  const path = require("path");
  const CONFIG = require("../../../config");
  const candidatePath = CONFIG.JOB_PROFILE_PATH || path.join(CONFIG.ROOT_DIR, "private", "candidate-profile.json");
  const userPath = path.join(CONFIG.ROOT_DIR, "private", "user-profile.json");

  let candidate = null;
  let user = null;
  if (fs.existsSync(candidatePath)) {
    try { candidate = JSON.parse(fs.readFileSync(candidatePath, "utf8")); } catch (_) {}
  }
  if (fs.existsSync(userPath)) {
    try { user = JSON.parse(fs.readFileSync(userPath, "utf8")); } catch (_) {}
  }

  if (!candidate && !user) return null;

  const candidateGithub = candidate?.portfolioUrl?.includes("github.com")
    ? candidate.portfolioUrl
    : (candidate?.github || user?.profiles?.github || "");

  const candidateLinkedin = candidate?.linkedin || user?.profiles?.linkedin || "";

  return {
    ...(user || {}),
    ...(candidate || {}),
    name: candidate?.name || user?.identity?.name || "",
    title: candidate?.title || user?.identity?.role || "",
    company: candidate?.company || user?.company?.name || "",
    skills: Array.isArray(candidate?.skills) && candidate.skills.length > 0
      ? candidate.skills
      : (user?.company?.approved || []),
    profiles: {
      ...(user?.profiles || {}),
      github: candidateGithub,
      linkedin: candidateLinkedin,
      website: candidate?.website || user?.profiles?.website || ""
    }
  };
}

async function captureSource({ browserManager, source, url }) {
  const page = await browserManager.pageFor(url);
  const { BrowserAgent } = require("../../agent/browser-agent");
  const agent = new BrowserAgent(page, "profile:" + source);
  return agent.captureLiveSnapshot("profile-" + source);
}

async function syncProfileEvidence({ browserManager, aiRuntime }) {
  const profile = readConfiguredProfile();
  if (!profile) throw new Error("Onboarding profile missing. Run npm run onboard first.");

  const snapshots = {};
  for (const source of ["github", "linkedin"]) {
    const url = profile.profiles?.[source];
    if (!url) continue;
    snapshots[source] = await captureSource({ browserManager, source, url });
    growthState.setProfileEvidence(source, { url, snapshot: snapshots[source] });
  }

  const analysis = await analyzeProfessionalProfile({ profile, snapshots, aiRuntime });
  growthState.setProfileEvidence("combined", { analysis });
  return { profile, snapshots, analysis };
}

module.exports = { readConfiguredProfile, syncProfileEvidence };
