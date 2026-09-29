const growthState = require("./growth-state-store");
const { analyzeProfessionalProfile } = require("./growth-ai");

function readConfiguredProfile() {
  const fs = require("fs");
  const path = require("path");
  const CONFIG = require("../../../config");
  const profilePath = path.join(CONFIG.ROOT_DIR, "private", "user-profile.json");
  if (!fs.existsSync(profilePath)) return null;
  try { return JSON.parse(fs.readFileSync(profilePath, "utf8")); } catch (_) { return null; }
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
