const { buildActionPlan } = require("../ai/job-ai");
const { getEnabledPlatforms } = require("../platform-registry");
const jobState = require("../storage/job-state-store");

function normalizeOpportunity(raw, platform) {
  if (!raw || typeof raw !== "object") return null;
  const externalId = String(raw.externalId || raw.id || raw.url || "").trim();
  if (!externalId) return null;
  return {
    key: `${platform.id}:${externalId}`,
    platform: platform.id,
    platformName: platform.name,
    externalId,
    url: raw.url || null,
    title: raw.title || "",
    description: raw.description || "",
    workMode: raw.workMode || "UNKNOWN",
    remoteEvidence: raw.remoteEvidence || "",
    skills: Array.isArray(raw.skills) ? raw.skills : [],
    budget: raw.budget || null,
    experience: raw.experience || "",
    locationRequirement: raw.locationRequirement || "",
    application: raw.application || {},
    client: raw.client || {},
    discoveredAt: new Date().toISOString(),
    status: "DISCOVERED",
    raw
  };
}

async function discoverOnPlatform({ platform, page, browserAgent, aiRuntime, candidateProfile }) {
  const { getAllPlatforms } = require("../platform-registry");
  const goal = `Discover current remote project opportunities on this platform that are suitable for the configured candidate. Use the platform's own live UI search/discovery features. Do not rely on hardcoded search queries or selectors. Discover the best available project results, inspect enough detail to capture explicit remote evidence, and return structured opportunities. Ignore jobs whose remote status is unknown.`;
  const max = CONFIG_PLACEHOLDER_MAX;
}
module.exports = { normalizeOpportunity, discoverOnPlatform };
