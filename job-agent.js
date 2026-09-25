#!/usr/bin/env node
const { spawnSync } = require("child_process");
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

async function ensureJobBrowser() {
  const result = spawnSync(process.execPath, ["scripts/launch-job-browser.js"], {
    cwd: CONFIG.ROOT_DIR,
    stdio: "inherit"
  });
  if (result.status !== 0) throw new Error("Dedicated job browser could not be started.");
}

async function getPlatformPage(platform) {
  return jobBrowserManager.open(platform.url);
}

async function openGoogleAccount() {
  await ensureJobBrowser();
  const page = await jobBrowserManager.open(CONFIG.GOOGLE_AUTH_ORIGIN + "/");
  await page.bringToFront().catch(() => {});
  console.log("\nDedicated job browser is open on Google.");
  console.log(`Sign in as ${CONFIG.GOOGLE_ACCOUNT_EMAIL} once if needed. This project never stores Google passwords or 2FA codes.\n`);
  await jobBrowserManager.disconnect();
}

async function authenticateAllPlatforms() {
  const profile = loadCandidateProfile();
  if (!profile) throw new Error("Candidate profile missing. Run npm run jobs:setup first.");
  await ensureJobBrowser();

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
  }
  jobBrowserManager.disconnect();
  return results;
}

async function completeAllProfiles() {
  const profile = loadCandidateProfile();
  if (!profile) throw new Error("Candidate profile missing. Run npm run jobs:setup first.");
  await ensureJobBrowser();

  const results = {};
  for (const platform of getEnabledPlatforms()) {
    const state = jobState.state.platforms[platform.id];
    if (state?.status !== "AUTHENTICATED" && state?.status !== "READY") {
      results[platform.id] = {
        status: "SKIPPED",
        reason: "Platform is not authenticated"
      };
      continue;
    }

    if (state?.profileStatus === "READY") {
      results[platform.id] = {
        status: "READY",
        reason: "Profile is already complete and verified"
      };
      continue;
    }

    const page = await getPlatformPage(platform);
    const agent = new JobBrowserAgent(page, platform.id);
    const result = await completeProfile({
      platform,
      page,
      browserAgent: agent,
      aiRuntime,
      candidateProfile: profile
    });

    results[platform.id] = result;
    if (result.status === "DONE") {
      jobState.setPlatformState(platform.id, {
        status: "READY",
        profileStatus: "READY",
        profileLastRun: new Date().toISOString()
      });
    }
  }

  jobBrowserManager.disconnect();
  return results;
}

async function setupAuthAndProfiles() {
  const auth = await authenticateAllPlatforms();
  const profiles = await completeAllProfiles();
  return { auth, profiles };
}

async function scanAndApply() {
  const profile = loadCandidateProfile();
  if (!profile) throw new Error("Candidate profile missing. Run npm run jobs:setup first.");
  await ensureJobBrowser();

  const report = {};
  for (const platform of getEnabledPlatforms()) {
    const platformState = jobState.state.platforms[platform.id];
    if (!platformState || !["AUTHENTICATED", "READY"].includes(platformState.status)) {
      report[platform.id] = {
        discoveryStatus: "SKIPPED_NOT_AUTHENTICATED",
        opportunities: 0,
        applications: [],
        reason: "Authenticate this platform first."
      };
      continue;
    }

    const page = await getPlatformPage(platform);
    const agent = new JobBrowserAgent(page, platform.id);

    try {
      const discovery = await discoverOnPlatform({
        platform,
        page,
        browserAgent: agent,
        aiRuntime,
        candidateProfile: profile
      });

      report[platform.id] = {
        discoveryStatus: discovery.status,
        opportunities: discovery.opportunities?.length || 0,
        applications: []
      };

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
    } finally {
      jobBrowserManager.disconnect();
    }
  }

  return report;
}

function printStatus() {
  console.log(JSON.stringify({
    enabled: CONFIG.JOB_AUTOMATION_ENABLED,
    googleAccountEmail: CONFIG.GOOGLE_ACCOUNT_EMAIL,
    remoteOnly: CONFIG.JOB_REMOTE_ONLY,
    projectOnly: CONFIG.JOB_PROJECT_ONLY,
    platforms: getEnabledPlatforms().map(p => p.id),
    metrics: jobState.state.metrics,
    platformState: jobState.state.platforms,
    applications: jobState.listApplications().slice(-20)
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

  if (command === "google") {
    await openGoogleAccount();
    return;
  }

  if (command === "auth") {
    console.log(JSON.stringify(await authenticateAllPlatforms(), null, 2));
    return;
  }

  if (command === "profile") {
    console.log(JSON.stringify(await completeAllProfiles(), null, 2));
    return;
  }

  if (command === "scan") {
    console.log(JSON.stringify(await scanAndApply(), null, 2));
    return;
  }

  if (command === "run") {
    await setupAuthAndProfiles();
    while (true) {
      const cycle = await scanAndApply();
      console.log(`\nJOB CYCLE REPORT ${new Date().toISOString()}\n${JSON.stringify(cycle, null, 2)}\n`);
      await new Promise(resolve => setTimeout(
        resolve,
        CONFIG.JOB_DISCOVERY_INTERVAL_SECONDS * 1000
      ));
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
