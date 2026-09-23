const fs = require("fs");
const path = require("path");
const CONFIG = require("../../../config");
const { buildActionPlan, generateCoverLetter, qualifyOpportunity } = require("../ai/job-ai");
const { generateApplicationDocuments } = require("../documents/document-engine");
const { getPlatform } = require("../platform-registry");
const jobState = require("../storage/job-state-store");

function applicationKey(opportunity) {
  return `${opportunity.platform}:${opportunity.externalId}`;
}

function readCandidateProfile() {
  if (!fs.existsSync(CONFIG.JOB_PROFILE_PATH)) {
    throw new Error("Candidate profile is not configured. Run jobs:setup first.");
  }
  return JSON.parse(fs.readFileSync(CONFIG.JOB_PROFILE_PATH, "utf8"));
}

function applicationsToday() {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  return jobState.listApplications().filter(app => {
    const stamp = Date.parse(app.submittedAt || app.createdAt || 0);
    return Number.isFinite(stamp) && stamp >= cutoff && ["SUBMITTED", "VERIFIED"].includes(app.status);
  }).length;
}

async function applyToOpportunity({ opportunity, page, browserAgent, aiRuntime }) {
  const platform = getPlatform(opportunity.platform);
  if (!platform) return { status: "BLOCKED", reason: "Platform configuration missing" };

  if (CONFIG.JOB_REMOTE_ONLY && opportunity.workMode !== "REMOTE") {
    jobState.upsertOpportunity({ ...opportunity, status: "SKIPPED_NON_REMOTE" });
    jobState.updateMetric("skipped");
    return { status: "SKIPPED", reason: "Remote-only gate rejected opportunity" };
  }
  if (CONFIG.JOB_PROJECT_ONLY && opportunity.engagementType !== "PROJECT") {
    jobState.upsertOpportunity({ ...opportunity, status: "SKIPPED_NON_PROJECT" });
    jobState.updateMetric("skipped");
    return { status: "SKIPPED", reason: "Project-only gate rejected opportunity" };
  }
  if (applicationsToday() >= CONFIG.JOB_MAX_APPLICATIONS_PER_DAY) {
    return { status: "RATE_LIMITED", reason: "Configured daily application limit reached" };
  }
  if (jobState.hasApplicationForOpportunity(opportunity.key)) {
    return { status: "SKIPPED", reason: "Application already recorded for opportunity" };
  }

  const candidateProfile = readCandidateProfile();
  const decision = await qualifyOpportunity(opportunity, aiRuntime, candidateProfile);
  jobState.upsertOpportunity({
    ...opportunity,
    qualification: decision,
    status: decision.apply ? "QUALIFIED" : "SKIPPED"
  });

  if (!decision.apply || Number(decision.matchScore || 0) < CONFIG.JOB_MIN_MATCH_SCORE) {
    jobState.updateMetric("skipped");
    return { status: "SKIPPED", decision };
  }
  jobState.updateMetric("qualified");

  const generated = await generateApplicationDocuments({
    opportunity: { ...opportunity, application: decision.applicationRequirements || opportunity.application },
    candidateProfile,
    aiRuntime
  });

  if (!generated.coverLetter && decision.applicationRequirements?.coverLetter) {
    const fallback = await generateCoverLetter(opportunity, candidateProfile, aiRuntime);
    generated.coverLetter = fallback.coverLetter || "";
  }

  const application = {
    key: applicationKey(opportunity),
    opportunityKey: opportunity.key,
    platform: opportunity.platform,
    url: opportunity.url,
    status: "APPLICATION_READY",
    candidateProfileVersion: candidateProfile.version || null,
    documents: {
      coverLetterPath: generated.coverLetterPath,
      baseResumePath: generated.baseResumePath
    },
    createdAt: new Date().toISOString()
  };
  jobState.upsertApplication(application);

  if (CONFIG.JOB_APPLICATION_MODE !== "auto") {
    jobState.updateMetric("manualAction");
    return { status: "USER_ACTION_REQUIRED", application, decision, documents: generated };
  }

  await page.goto(opportunity.url, {
    waitUntil: "domcontentloaded",
    timeout: CONFIG.JOB_NAVIGATION_TIMEOUT_MS
  });
  await new Promise(resolve => setTimeout(resolve, CONFIG.JOB_PAGE_SETTLE_MS));

  const snapshot = await browserAgent.captureLiveSnapshot("application-start");
  const plan = await buildActionPlan({
    goal: "Complete and submit the application for this exact project using only verified candidate data. Fill every required field, use the generated cover letter if requested, attach the base resume if requested, and submit only after the form is complete and the page visibly indicates the final submission action.",
    platform,
    opportunity: { ...opportunity, application: decision.applicationRequirements || opportunity.application },
    candidateProfile,
    browserSnapshot: snapshot,
    allowedOrigin: new URL(platform.url).origin,
    actionBudget: {
      maxActions: CONFIG.JOB_MAX_PLAN_ACTIONS,
      maxScrolls: CONFIG.JOB_MAX_SCROLLS
    }
  }, aiRuntime);

  if (["USER_ACTION_REQUIRED", "MANUAL_ACTION_REQUIRED", "BLOCKED"].includes(plan.status)) {
    jobState.upsertApplication({ ...application, status: plan.status, reason: plan.reason });
    jobState.updateMetric("manualAction");
    return { status: plan.status, reason: plan.reason, application, plan };
  }

  const result = await browserAgent.executeJobPlan(plan, `apply:${opportunity.key}`, new URL(platform.url).origin);
  if (!result.success) {
    jobState.upsertApplication({ ...application, status: result.state || "FAILED", reason: result.reason });
    jobState.updateMetric(result.state === "UNVERIFIED" ? "manualAction" : "failed");
    return { status: result.state || "FAILED", application, result };
  }

  const submittedAt = new Date().toISOString();
  jobState.upsertApplication({
    ...application,
    status: "VERIFIED",
    submittedAt,
    verifiedAt: submittedAt,
    correlationId: result.correlationId
  });
  jobState.upsertOpportunity({
    ...opportunity,
    status: "APPLIED_VERIFIED",
    appliedAt: submittedAt
  });
  jobState.updateMetric("submitted");
  jobState.updateMetric("verified");

  return { status: "VERIFIED", application, result };
}

module.exports = { applyToOpportunity };
