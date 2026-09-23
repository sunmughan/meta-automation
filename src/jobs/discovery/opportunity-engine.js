const CONFIG = require("../../../config");
const { extractOpportunities, inspectOpportunityDetails } = require("../ai/job-ai");
const JobAgentRunner = require("../browser/job-runner");
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
  const runner = new JobAgentRunner({ aiRuntime, browserAgent });
  const result = await runner.run({
    goal: "Discover current remote PROJECT opportunities using only this platform's live UI. Navigate to its project/work discovery area, use its visible search/filter controls, inspect result cards and continue iterating until the current page visibly contains useful project opportunities. Do not apply.",
    platform,
    candidateProfile,
    allowedOrigin: new URL(platform.url).origin,
    targetId: `discover:${platform.id}`,
    context: { remoteOnly: CONFIG.JOB_REMOTE_ONLY, projectOnly: CONFIG.JOB_PROJECT_ONLY }
  });

  if (result.status !== "DONE") {
    return { ...result, opportunities: [] };
  }

  const extracted = await extractOpportunities({
    platform,
    snapshot: result.snapshot,
    aiRuntime,
    candidateProfile,
    maxItems: CONFIG.JOB_MAX_OPPORTUNITIES_PER_SCAN
  });

  const rawItems = Array.isArray(extracted.opportunities) ? extracted.opportunities : [];
  let normalized = mergeUnique(rawItems.map(item => normalizeOpportunity(item, platform)).filter(Boolean));

  // Agentically inspect detail pages when list-level evidence is incomplete.
  let inspected = 0;
  for (const opportunity of normalized) {
    if (inspected >= CONFIG.JOB_MAX_DETAIL_INSPECTIONS) break;
    const needsDetail = opportunity.workMode === "UNKNOWN" ||
      opportunity.engagementType === "UNKNOWN" ||
      !opportunity.description ||
      !opportunity.application;

    if (!needsDetail || !opportunity.url) continue;

    inspected++;
    const detailRunner = new JobAgentRunner({ aiRuntime, browserAgent });
    const detailResult = await detailRunner.run({
      goal: "Open and inspect the exact opportunity detail page from the supplied opportunity URL. Capture the project's explicit work mode, engagement type, requirements, application fields and any visible project facts. Do not apply.",
      platform,
      opportunity,
      candidateProfile,
      allowedOrigin: new URL(platform.url).origin,
      targetId: `detail:${opportunity.key}`,
      context: { workflow: "OPPORTUNITY_DETAIL_VERIFICATION" }
    });

    if (detailResult.status === "DONE") {
      const verified = await inspectOpportunityDetails({
        platform,
        opportunity,
        snapshot: detailResult.snapshot,
        aiRuntime,
        candidateProfile
      });
      const merged = normalizeOpportunity({ ...opportunity, ...verified }, platform);
      Object.assign(opportunity, merged, {
        status: opportunity.status,
        discoveredAt: opportunity.discoveredAt
      });
    }
  }

  normalized = mergeUnique(normalized);
  for (const opportunity of normalized) jobState.upsertOpportunity(opportunity);
  if (normalized.length) jobState.updateMetric("discovered", normalized.length);

  const remote = normalized.filter(item => item.workMode === "REMOTE");
  if (remote.length) jobState.updateMetric("remoteVerified", remote.length);

  return { ...result, status: "DONE", opportunities: normalized, detailInspections: inspected };
}

module.exports = { normalizeOpportunity, discoverOnPlatform };
