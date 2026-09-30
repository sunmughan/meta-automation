const fs = require("fs");
const path = require("path");
const CONFIG = require("../../../config");
const { generateCoverLetter, qualifyOpportunity, verifyApplicationSubmission } = require("../ai/job-ai");
const JobAgentRunner = require("../browser/job-runner");
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

  const appKey = applicationKey(opportunity);
  const application = jobState.transitionApplication(appKey, "APPLICATION_READY", {
    opportunityKey: opportunity.key,
    platform: opportunity.platform,
    url: opportunity.url,
    candidateProfileVersion: candidateProfile.version || null,
    documents: {
      coverLetterPath: generated.coverLetterPath,
      baseResumePath: generated.baseResumePath
    }
  });

  if (CONFIG.JOB_APPLICATION_MODE !== "auto") {
    jobState.transitionApplication(appKey, "USER_ACTION_REQUIRED", {
      reason: "Application generated in manual review mode"
    });
    return { status: "USER_ACTION_REQUIRED", application: jobState.state.applications[appKey], decision, documents: generated };
  }

  jobState.transitionApplication(appKey, "FORM_STARTED", {
    reason: "Navigating to live application form"
  });

  await page.goto(opportunity.url, {
    waitUntil: "domcontentloaded",
    timeout: CONFIG.JOB_NAVIGATION_TIMEOUT_MS
  });
  await new Promise(resolve => setTimeout(resolve, CONFIG.JOB_PAGE_SETTLE_MS));

  const runner = new JobAgentRunner({ aiRuntime, browserAgent });
  const result = await runner.run({
    goal: "Complete and submit the application for this exact remote project using only verified candidate data. Discover the live form, map every required field to a known value, use the generated cover letter when requested, upload the base resume when requested, and do not submit until all required fields are valid. After submission, continue inspecting the live page until a trustworthy visible submission confirmation or equivalent post-condition is established.",
    platform,
    opportunity: { ...opportunity, application: decision.applicationRequirements || opportunity.application },
    candidateProfile,
    allowedOrigin: new URL(platform.url).origin,
    targetId: `apply:${opportunity.key}`,
    context: {
      documents: generated,
      remoteOnly: CONFIG.JOB_REMOTE_ONLY,
      projectOnly: CONFIG.JOB_PROJECT_ONLY,
      googleAccountEmail: CONFIG.GOOGLE_ACCOUNT_EMAIL
    }
  });

  if (["USER_ACTION_REQUIRED", "MANUAL_ACTION_REQUIRED", "BLOCKED"].includes(result.status)) {
    jobState.transitionApplication(appKey, result.status, { reason: result.reason });
    return { status: result.status, reason: result.reason, application: jobState.state.applications[appKey], plan: result.plan };
  }
  if (result.status !== "DONE") {
    const failState = result.status || "FAILED";
    jobState.transitionApplication(appKey, failState, { reason: result.reason });
    return { status: failState, application: jobState.state.applications[appKey], result };
  }

  jobState.transitionApplication(appKey, "SUBMITTED", {
    submittedAt: new Date().toISOString(),
    correlationId: result.correlationId
  });

  const verificationSnapshot = await browserAgent.captureLiveSnapshot("application-post-submit-verification");
  const verification = await verifyApplicationSubmission({
    platform,
    opportunity,
    snapshot: verificationSnapshot
  }, aiRuntime);

  if (!verification.verified) {
    jobState.transitionApplication(appKey, "UNVERIFIED", {
      reason: verification.evidence || "Submission was not visibly confirmed"
    });
    return {
      status: "UNVERIFIED",
      application: jobState.state.applications[appKey],
      verification,
      result
    };
  }

  const verifiedAt = new Date().toISOString();
  jobState.transitionApplication(appKey, "VERIFIED", {
    verifiedAt,
    verificationEvidence: verification.evidence,
    correlationId: result.correlationId
  });
  jobState.upsertOpportunity({
    ...opportunity,
    status: "APPLIED_VERIFIED",
    appliedAt: verifiedAt
  });

  return { status: "VERIFIED", application: jobState.state.applications[appKey], result };
}

module.exports = { applyToOpportunity };
