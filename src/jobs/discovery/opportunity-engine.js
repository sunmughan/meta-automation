const CONFIG = require("../../../config");
const { buildActionPlan, extractOpportunities } = require("../ai/job-ai");
const jobState = require("../storage/job-state-store");

function normalizeOpportunity(raw, platform) {
  if (!raw || typeof raw !== "object") return null;
  const externalId = String(raw.externalId || raw.id || raw.url || "").trim();
  if (!externalId) return null;

  const opportunity = {
    key: `${platform.id}:${externalId}`,
    platform: platform.id,
    platformName: platform.name,
    externalId,
    url: raw.url || null,
    title: raw.title || "",
    description: raw.description || "",
    workMode: raw.workMode || "UNKNOWN",
    remoteEvidence: raw.remoteEvidence || "",
    engagementType: raw.engagementType || "UNKNOWN",
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
  return opportunity;
}

function mergeUnique(items) {
  const seen = new Set();
  const output = [];
  for (const item of items || []) {
    const key = item?.url || item?.externalId || JSON.stringify(item);
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }
  return output;
}

async function discoverOnPlatform({ platform, page, browserAgent, aiRuntime, candidateProfile }) {
  let snapshot = await browserAgent.captureLiveSnapshot("job-discovery-start");
  const firstPlan = await buildActionPlan({
    goal: "Use this platform's own live UI to find the current set of remote project opportunities. Start from the current page, discover the appropriate project/work area using the visible navigation, and use the platform's search/filter controls without hardcoded queries or selectors. Continue until the page visibly contains current project opportunities. Do not apply.",
    platform,
    candidateProfile,
    browserSnapshot: snapshot,
    allowedOrigin: new URL(platform.url).origin,
    actionBudget: { maxActions: CONFIG.JOB_MAX_PLAN_ACTIONS, maxScrolls: CONFIG.JOB_MAX_SCROLLS }
  }, aiRuntime);

  if (["USER_ACTION_REQUIRED", "MANUAL_ACTION_REQUIRED", "BLOCKED"].includes(firstPlan.status)) {
    return { status: firstPlan.status, reason: firstPlan.reason, opportunities: [] };
  }

  const initialResult = await browserAgent.executeJobPlan(firstPlan, `discover:${platform.id}`);
  if (!initialResult.success) {
    return { status: "FAILED", reason: initialResult.reason || "Discovery plan failed", opportunities: [] };
  }

  snapshot = await browserAgent.captureLiveSnapshot("job-discovery-results");
  const extracted = await extractOpportunities({
    platform,
    snapshot,
    aiRuntime,
    candidateProfile,
    maxItems: CONFIG.JOB_MAX_OPPORTUNITIES_PER_SCAN
  });

  const rawItems = Array.isArray(extracted.opportunities) ? extracted.opportunities : [];
  const normalized = mergeUnique(rawItems.map(item => normalizeOpportunity(item, platform)).filter(Boolean));

  for (const opportunity of normalized) {
    jobState.upsertOpportunity(opportunity);
  }
  if (normalized.length) jobState.updateMetric("discovered", normalized.length);

  const remote = normalized.filter(item => item.workMode === "REMOTE");
  if (remote.length) jobState.updateMetric("remoteVerified", remote.length);

  return {
    status: "DONE",
    opportunities: normalized,
    snapshot
  };
}

module.exports = { normalizeOpportunity, discoverOnPlatform };
