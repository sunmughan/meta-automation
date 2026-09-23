#!/usr/bin/env node
const CONFIG = require("./config");
const aiRuntime = require("./src/ai/ai-runtime");
const jobBrowserManager = require("./src/jobs/browser/job-browser-manager");
const JobBrowserAgent = require("./src/jobs/browser/job-browser-agent");
const { getEnabledPlatforms } = require("./src/jobs/platform-registry");
const { loadCandidateProfile } = require("./src/jobs/profile/profile-engine");
const { bootstrapPlatformSession, completeProfile } = require("./src/jobs/platform-session");
const { discoverOnPlatform } = require("./src/jobs/discovery/opportunity-engine");
const { applyToOpportunity } = require("./src/jobs/application/application-engine");
const jobState = require("./src/jobs/storage/job-state-store");
const logger = require("./src/logging/logger");

async function getPlatformPage(platform) {
  return jobBrowserManager.open(platform.url);
}

async function setupAuthAndProfiles() {
  const profile = loadCandidateProfile();
  if (!profile) throw new Error("Candidate profile missing. Run npm run jobs:setup first.");
  const results = {};
  for (const platform of getEnabledPlatforms()) {
    const page = await getPlatformPage(platform);
    const agent = new JobBrowserAgent(page, platform.id);
    results[platform.id] = await bootstrapPlatformSession({
      platform,
      page,
      browserAgent: agent,
      aiRuntime,
      candidateProfile: profile
    });
    if (results[platform.id].status === "AUTHENTICATED") {
      results[platform.id].profile = await completeProfile({
        platform,
        page,
        browserAgent: agent,
        aiRuntime,
        candidateProfile: profile
      });
    }
    jobBrowserManager.disconnect();
  }
  return results;
}

async function scanAndApply() {
  const profile = loadCandidateProfile();
  if (!profile) throw new Error("Candidate profile missing. Run npm run jobs:setup first.");
  const report = {};
  for (const platform of getEnabledPlatforms()) {
    const page = await getPlatformPage(platform);
    const agent = new JobBrowserAgent(page, platform.id);
    const discovery = await discoverOnPlatform({
      platform,
      page,
      browserAgent: agent,
      aiRuntime,
      candidateProfile: profile
    });
    report[platform.id] = { discoveryStatus: discovery.status, opportunities: discovery.opportunities?.length || 0, applications: [] };

    for (const opportunity of discovery.opportunities || []) {
      const result = await applyToOpportunity({
        opportunity,
        page,
        browserAgent: agent,
        aiRuntime
      });
      report[platform.id].applications.push({
        opportunity: opportunity.key,
        status: result.status,
        reason: result.reason || ""
      });
      if (result.status === "RATE_LIMITED") break;
    }
    jobBrowserManager.disconnect();
  }
  return report;
}

function printStatus() {
  console.log(JSON.stringify({
    enabled: CONFIG.JOB_AUTOMATION_ENABLED,
    platforms: getEnabledPlatforms().map(p => p.id),
    metrics: jobState.state.metrics,
    platformState: jobState.state.platforms,
    applications: jobState.listApplications().slice(-10)
  }, null, 2));
}

async function main() {
  const command = process.argv[2] || "run";
  if (command !== "status" && !CONFIG.JOB_AUTOMATION_ENABLED) {
    throw new Error("JOB_AUTOMATION_ENABLED is false");
  }

  if (command === "setup") {
    require("./scripts/setup-job-engine");
    return;
  }
  if (command === "auth") {
    console.log(JSON.stringify(await setupAuthAndProfiles(), null, 2));
    return;
  }
  if (command === "scan") {
    console.log(JSON.stringify(await scanAndApply(), null, 2));
    return;
  }
  if (command === "run") {
    await setupAuthAndProfiles();
    while (true) {
      await scanAndApply();
      await new Promise(resolve => setTimeout(resolve, CONFIG.JOB_DISCOVERY_INTERVAL_SECONDS * 1000));
    }
  }
  if (command === "status") {
    printStatus();
    return;
  }
  throw new Error(`Unknown job command: ${command}`);
}

main().catch(err => {
  logger.error(`Job engine stopped: ${err.message}`);
  process.exitCode = 1;
});
