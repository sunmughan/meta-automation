const fs = require("fs");
const path = require("path");
const CONFIG = require("../../../config");
const { generateCoverLetter, qualifyOpportunity, verifyApplicationSubmission } = require("../ai/job-ai");
const JobAgentRunner = require("../browser/job-runner");
const { generateApplicationDocuments } = require("../documents/document-engine");
const { getPlatform } = require("../platform-registry");
const jobState = require("../storage/job-state-store");
const { platformSafetyGuard } = require("../../safety/platform-safety-guard");
const telemetry = require("../../telemetry/action-telemetry");

function applicationKey(opportunity) {
  const externalId = opportunity.externalId || opportunity.id || opportunity.key?.split(":").slice(1).join(":") || "unknown";
  return `${opportunity.platform}:${externalId}`;
}

function readCandidateProfile() {
  if (!fs.existsSync(CONFIG.JOB_PROFILE_PATH)) {
    return { name: "Default Candidate", version: 1 };
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

/**
 * Reconciles an existing application with live page evidence.
 */
async function reconcileApplicationOnPage({ application, opportunity, platform, page, browserAgent, aiRuntime }) {
  if (!page || !browserAgent) {
    return { reconciled: false, status: application.status, reason: "Browser page unavailable for reconciliation" };
  }

  const appKey = application.key;
  let snapshot;
  try {
    snapshot = await browserAgent.captureLiveSnapshot("reconcile-application");
  } catch (_) {
    return { reconciled: false, status: application.status, reason: "Could not capture snapshot" };
  }

  // 1. Detect any live security challenge
  const challenge = platformSafetyGuard.detectSecurityChallenge(snapshot);
  if (challenge.detected) {
    platformSafetyGuard.recordSecurityEvent(opportunity.platform, challenge.type, {
      url: snapshot.url,
      reason: challenge.evidence
    });
    jobState.transitionApplication(appKey, "USER_ACTION_REQUIRED", {
      reason: `Security challenge encountered during reconciliation: ${challenge.type}`
    });
    return { reconciled: true, status: "USER_ACTION_REQUIRED", reason: challenge.evidence };
  }

  // 2. Check if page visibly confirms submission
  const verification = await verifyApplicationSubmission({
    platform,
    opportunity,
    snapshot
  }, aiRuntime);

  if (verification.verified) {
    const verifiedAt = new Date().toISOString();
    if (["SUBMITTING", "FORM_FILLED", "FORM_STARTED"].includes(application.status)) {
      jobState.transitionApplication(appKey, "SUBMITTED", {
        submittedAt: verifiedAt,
        verificationEvidence: verification.evidence,
        reason: "Submission evidence discovered during reconciliation"
      });
      platformSafetyGuard.recordSuccessfulAction(opportunity.platform, "default", "APPLICATION");
    }
    jobState.transitionApplication(appKey, "VERIFIED", {
      verifiedAt,
      verificationEvidence: verification.evidence
    });
    jobState.upsertOpportunity({
      ...opportunity,
      status: "APPLIED_VERIFIED",
      appliedAt: verifiedAt
    });
    return { reconciled: true, status: "VERIFIED", verification };
  }

  return { reconciled: false, status: application.status, verification };
}

/**
 * Master application execution and resume engine.
 * Fully implements Phase 6.5 True Application Resume & Reconciliation.
 */
async function applyToOpportunity({ opportunity, page, browserAgent, aiRuntime }) {
  // 1. Platform configuration gate
  const platform = getPlatform(opportunity.platform);
  if (!platform) return { status: "BLOCKED", reason: "Platform configuration missing" };

  // 2. Fail-Closed Platform Policy Guard
  const safetyEval = platformSafetyGuard.evaluateAction({
    platform: opportunity.platform,
    actionType: "APPLICATION",
    workflow: "JOB_APPLICATION",
    details: { opportunityKey: opportunity.key }
  });

  if (!safetyEval.allowed) {
    if (safetyEval.status === "USER_ACTION_REQUIRED") {
      const appKey = applicationKey(opportunity);
      const existing = jobState.state.applications[appKey] || jobState.getApplicationForOpportunity(opportunity.key);
      const appRecord = existing || jobState.transitionApplication(appKey, "USER_ACTION_REQUIRED", {
        opportunityKey: opportunity.key,
        platform: opportunity.platform,
        url: opportunity.url,
        reason: safetyEval.reason
      });
      return { status: "USER_ACTION_REQUIRED", reason: safetyEval.reason, application: appRecord };
    }
    return { status: safetyEval.status, reason: safetyEval.reason };
  }

  // 3. Remote-only and Project-only hard filters
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

  // 4. Daily budget check
  if (applicationsToday() >= CONFIG.JOB_MAX_APPLICATIONS_PER_DAY) {
    return { status: "RATE_LIMITED", reason: "Configured daily application limit reached" };
  }

  const appKey = applicationKey(opportunity);
  let existingApplication = jobState.state.applications[appKey] || jobState.getApplicationForOpportunity(opportunity.key);
  let documents = existingApplication?.documents || null;

  // =========================================================================
  // TRUE APPLICATION RESUME & RECONCILIATION DISPATCH
  // =========================================================================

  // CASE 7: Already VERIFIED -> Safe idempotent skip
  if (existingApplication && existingApplication.status === "VERIFIED") {
    return {
      status: "SKIPPED",
      reason: "Application already verified",
      application: existingApplication
    };
  }

  // CASE 6: Already SUBMITTED -> Do NOT submit again! Reconcile / verify.
  if (existingApplication && existingApplication.status === "SUBMITTED") {
    if (page && browserAgent) {
      const recon = await reconcileApplicationOnPage({
        application: existingApplication,
        opportunity,
        platform,
        page,
        browserAgent,
        aiRuntime
      });
      if (recon.reconciled && recon.status === "VERIFIED") {
        return { status: "VERIFIED", application: jobState.state.applications[appKey] };
      }
    }
    // Cannot submit again; return submitted record awaiting verification
    return {
      status: "SUBMITTED",
      reason: "Application already submitted; awaiting live verification evidence",
      application: existingApplication
    };
  }

  // CASE 8: UNVERIFIED -> Reconcile live page evidence
  if (existingApplication && existingApplication.status === "UNVERIFIED") {
    if (page && browserAgent) {
      const recon = await reconcileApplicationOnPage({
        application: existingApplication,
        opportunity,
        platform,
        page,
        browserAgent,
        aiRuntime
      });
      if (recon.reconciled && recon.status === "VERIFIED") {
        return { status: "VERIFIED", application: jobState.state.applications[appKey] };
      }
    }
    return {
      status: "UNVERIFIED",
      reason: "Submission evidence unverified; human review required",
      application: existingApplication
    };
  }

  // CASE 5: SUBMITTING -> Interrupted during submission; reconcile rather than blindly resubmitting
  if (existingApplication && existingApplication.status === "SUBMITTING") {
    if (page && browserAgent) {
      let snap;
      try {
        snap = await browserAgent.captureLiveSnapshot("resume-submitting");
      } catch (_) {}

      if (snap) {
        const challenge = platformSafetyGuard.detectSecurityChallenge(snap);
        if (challenge.detected) {
          platformSafetyGuard.recordSecurityEvent(opportunity.platform, challenge.type, {
            url: snap.url,
            reason: challenge.evidence
          });
          jobState.transitionApplication(appKey, "USER_ACTION_REQUIRED", {
            reason: `Security challenge encountered during SUBMITTING resume: ${challenge.type}`
          });
          return {
            status: "USER_ACTION_REQUIRED",
            reason: challenge.evidence,
            application: jobState.state.applications[appKey]
          };
        }

        const recon = await verifyApplicationSubmission({
          platform,
          opportunity,
          snapshot: snap
        }, aiRuntime);

        if (recon.verified) {
          const submittedAt = new Date().toISOString();
          jobState.transitionApplication(appKey, "SUBMITTED", {
            submittedAt,
            verificationEvidence: recon.evidence,
            reason: "Live evidence confirms submission after restart from SUBMITTING"
          });
          platformSafetyGuard.recordSuccessfulAction(opportunity.platform, "default", "APPLICATION");
          const verifiedAt = new Date().toISOString();
          jobState.transitionApplication(appKey, "VERIFIED", {
            verifiedAt,
            verificationEvidence: recon.evidence
          });
          jobState.upsertOpportunity({
            ...opportunity,
            status: "APPLIED_VERIFIED",
            appliedAt: verifiedAt
          });
          return {
            status: "VERIFIED",
            application: jobState.state.applications[appKey],
            verification: recon
          };
        }
      }
    }
    // Ambiguous state on restart: NEVER blindly submit again!
    jobState.transitionApplication(appKey, "USER_ACTION_REQUIRED", {
      reason: "Process restarted while SUBMITTING; manual inspection required to prevent duplicate bid"
    });
    return {
      status: "USER_ACTION_REQUIRED",
      reason: "Submission state ambiguous on restart; human inspection required to prevent duplicate bid",
      application: jobState.state.applications[appKey]
    };
  }

  // CASE 4: FORM_FILLED -> True Resume & Reconciliation
  if (existingApplication && existingApplication.status === "FORM_FILLED") {
    documents = existingApplication.documents || documents;

    if (!page || !browserAgent) {
      return {
        status: "FORM_FILLED",
        reason: "Browser unavailable for live observation; preserving FORM_FILLED state",
        application: existingApplication
      };
    }

    if (page && opportunity.url) {
      try {
        const curUrl = page.url ? page.url() : "";
        if (!curUrl || curUrl === "about:blank") {
          await page.goto(opportunity.url, {
            waitUntil: "domcontentloaded",
            timeout: CONFIG.JOB_NAVIGATION_TIMEOUT_MS
          });
          await new Promise(resolve => setTimeout(resolve, CONFIG.JOB_PAGE_SETTLE_MS));
        }
      } catch (_) {}
    }

    let snap;
    try {
      snap = await browserAgent.captureLiveSnapshot("resume-form-filled");
    } catch (err) {
      jobState.transitionApplication(appKey, "USER_ACTION_REQUIRED", {
        reason: `Could not capture fresh live snapshot: ${err.message}`
      });
      return {
        status: "USER_ACTION_REQUIRED",
        reason: `Could not capture fresh live snapshot: ${err.message}`,
        application: jobState.state.applications[appKey]
      };
    }

    const challenge = platformSafetyGuard.detectSecurityChallenge(snap);
    if (challenge.detected) {
      platformSafetyGuard.recordSecurityEvent(opportunity.platform, challenge.type, {
        url: snap.url,
        reason: challenge.evidence
      });
      jobState.transitionApplication(appKey, "USER_ACTION_REQUIRED", {
        reason: `Security challenge encountered during FORM_FILLED resume: ${challenge.type}`
      });
      return {
        status: "USER_ACTION_REQUIRED",
        reason: challenge.evidence,
        application: jobState.state.applications[appKey]
      };
    }

    // Determine whether submission already happened
    const submissionCheck = await verifyApplicationSubmission({
      platform,
      opportunity,
      snapshot: snap
    }, aiRuntime);

    if (submissionCheck.verified) {
      const submittedAt = new Date().toISOString();
      jobState.transitionApplication(appKey, "SUBMITTED", {
        submittedAt,
        verificationEvidence: submissionCheck.evidence,
        reason: "Discovered existing submission evidence on live page"
      });
      platformSafetyGuard.recordSuccessfulAction(opportunity.platform, "default", "APPLICATION");
      const verifiedAt = new Date().toISOString();
      jobState.transitionApplication(appKey, "VERIFIED", {
        verifiedAt,
        verificationEvidence: submissionCheck.evidence
      });
      jobState.upsertOpportunity({
        ...opportunity,
        status: "APPLIED_VERIFIED",
        appliedAt: verifiedAt
      });
      return {
        status: "VERIFIED",
        application: jobState.state.applications[appKey],
        verification: submissionCheck
      };
    }

    // Determine if page no longer represents expected application or is ambiguous
    const interactive = snap.interactiveElements || [];
    const hasFormElements = interactive.some(el =>
      el.editable || el.tag === "textarea" || el.tag === "input" || /submit|apply|bid|proposal/i.test(el.text || el.name || "")
    );
    const bodyText = (snap.bodyText || "").toLowerCase();
    const isAmbiguous = !hasFormElements && !bodyText.includes("proposal") && !bodyText.includes("bid") && !bodyText.includes("apply");

    if (isAmbiguous) {
      jobState.transitionApplication(appKey, "USER_ACTION_REQUIRED", {
        reason: "Live page state is ambiguous or does not represent expected application form"
      });
      return {
        status: "USER_ACTION_REQUIRED",
        reason: "Live page state is ambiguous or does not represent expected application form",
        application: jobState.state.applications[appKey]
      };
    }

    // Form is present and filled (or partially filled)
    // Preserve FORM_FILLED, then transition to SUBMITTING
    jobState.transitionApplication(appKey, "SUBMITTING", {
      reason: "Executing single submission action for filled application form"
    });

    const submitBtn = interactive.find(el =>
      (el.role === "button" || el.tag === "button" || el.type === "submit") &&
      /submit|place bid|send proposal|apply now|confirm bid/i.test(el.text || el.name || "")
    );

    let submitSuccess = false;
    if (submitBtn) {
      const clickRes = await browserAgent.executeAtomicAction({
        type: "CLICK",
        target: submitBtn,
        semanticCategory: "SUBMIT"
      }, appKey);
      submitSuccess = clickRes.success;
    } else {
      const candidateProfile = readCandidateProfile();
      const runner = new JobAgentRunner({ aiRuntime, browserAgent });
      const runRes = await runner.run({
        goal: "Submit the verified filled application form. Do not modify valid fields. Click submit once.",
        platform,
        opportunity: { ...opportunity, application: opportunity.application },
        candidateProfile,
        allowedOrigin: new URL(platform.url).origin,
        targetId: `submit:${opportunity.key}`,
        context: { documents }
      });
      submitSuccess = runRes.status === "DONE";
    }

    // Capture fresh live snapshot after submission
    const postSubmitSnap = await browserAgent.captureLiveSnapshot("post-resume-submit-verification");
    const postVerify = await verifyApplicationSubmission({
      platform,
      opportunity,
      snapshot: postSubmitSnap
    }, aiRuntime);

    if (postVerify.verified) {
      const submittedAt = new Date().toISOString();
      jobState.transitionApplication(appKey, "SUBMITTED", {
        submittedAt,
        verificationEvidence: postVerify.evidence
      });
      platformSafetyGuard.recordSuccessfulAction(opportunity.platform, "default", "APPLICATION");
      const verifiedAt = new Date().toISOString();
      jobState.transitionApplication(appKey, "VERIFIED", {
        verifiedAt,
        verificationEvidence: postVerify.evidence
      });
      jobState.upsertOpportunity({
        ...opportunity,
        status: "APPLIED_VERIFIED",
        appliedAt: verifiedAt
      });
      return {
        status: "VERIFIED",
        application: jobState.state.applications[appKey],
        verification: postVerify
      };
    } else {
      jobState.transitionApplication(appKey, "SUBMITTED", {
        submittedAt: new Date().toISOString()
      });
      jobState.transitionApplication(appKey, "UNVERIFIED", {
        reason: postVerify.evidence || "Submission could not be visibly verified"
      });
      return {
        status: "UNVERIFIED",
        application: jobState.state.applications[appKey],
        verification: postVerify
      };
    }
  }

  // CASE 9: FAILED -> Safe retry of existing application record without changing ID
  if (existingApplication && existingApplication.status === "FAILED") {
    jobState.transitionApplication(appKey, "APPLICATION_READY", {
      reason: "Retrying previously failed application"
    });
    existingApplication = jobState.state.applications[appKey];
  }

  // CASE 2 & 3: APPLICATION_READY or FORM_STARTED -> Reuse existing documents if present
  documents = existingApplication?.documents || documents;
  const candidateProfile = readCandidateProfile();

  if (!documents || !documents.coverLetterPath) {
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

    documents = {
      coverLetterPath: generated.coverLetterPath,
      baseResumePath: generated.baseResumePath,
      coverLetter: generated.coverLetter
    };
  }

  // Ensure application is in APPLICATION_READY state with documents
  if (!existingApplication || existingApplication.status === "PLANNED" || existingApplication.status === "QUALIFIED") {
    existingApplication = jobState.transitionApplication(appKey, "APPLICATION_READY", {
      opportunityKey: opportunity.key,
      platform: opportunity.platform,
      url: opportunity.url,
      candidateProfileVersion: candidateProfile.version || null,
      documents
    });
  }

  // Manual review mode check
  if (CONFIG.JOB_APPLICATION_MODE !== "auto") {
    jobState.transitionApplication(appKey, "USER_ACTION_REQUIRED", {
      reason: "Application generated in manual review mode"
    });
    return {
      status: "USER_ACTION_REQUIRED",
      application: jobState.state.applications[appKey],
      documents
    };
  }

  // Navigate to live application form
  if (!existingApplication || existingApplication.status !== "FORM_STARTED") {
    jobState.transitionApplication(appKey, "FORM_STARTED", {
      reason: "Navigating to live application form"
    });
  }

  if (page) {
    await page.goto(opportunity.url, {
      waitUntil: "domcontentloaded",
      timeout: CONFIG.JOB_NAVIGATION_TIMEOUT_MS
    });
    await new Promise(resolve => setTimeout(resolve, CONFIG.JOB_PAGE_SETTLE_MS));
  }

  // Check for security checkpoint on landing
  if (browserAgent) {
    const landingSnap = await browserAgent.captureLiveSnapshot("application-landing");
    const challenge = platformSafetyGuard.detectSecurityChallenge(landingSnap);
    if (challenge.detected) {
      platformSafetyGuard.recordSecurityEvent(opportunity.platform, challenge.type, {
        url: landingSnap.url,
        reason: challenge.evidence
      });
      jobState.transitionApplication(appKey, "USER_ACTION_REQUIRED", {
        reason: `Security challenge encountered on platform: ${challenge.type}`
      });
      return {
        status: "USER_ACTION_REQUIRED",
        reason: challenge.evidence,
        application: jobState.state.applications[appKey]
      };
    }
  }

  const runner = new JobAgentRunner({ aiRuntime, browserAgent });
  const result = await runner.run({
    goal: "Complete and submit the application for this exact remote project using only verified candidate data. Discover the live form, map every required field to a known value, use the generated cover letter when requested, upload the base resume when requested, and do not submit until all required fields are valid. After submission, continue inspecting the live page until a trustworthy visible submission confirmation or equivalent post-condition is established.",
    platform,
    opportunity: { ...opportunity, application: opportunity.application },
    candidateProfile,
    allowedOrigin: new URL(platform.url).origin,
    targetId: `apply:${opportunity.key}`,
    context: {
      documents,
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

  // =========================================================================
  // SUBMISSION SAFETY & TRUTHFUL POST-VERIFICATION (Phase 6.5M)
  // =========================================================================
  jobState.transitionApplication(appKey, "SUBMITTED", {
    submittedAt: new Date().toISOString(),
    correlationId: result.correlationId
  });

  platformSafetyGuard.recordSuccessfulAction(opportunity.platform, "default", "APPLICATION", {
    correlationId: result.correlationId
  });

  let verification = { verified: false, evidence: "Verification snapshot unavailable" };
  if (browserAgent) {
    const verificationSnapshot = await browserAgent.captureLiveSnapshot("application-post-submit-verification");
    verification = await verifyApplicationSubmission({
      platform,
      opportunity,
      snapshot: verificationSnapshot
    }, aiRuntime);
  }

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

module.exports = {
  applyToOpportunity,
  applicationKey,
  reconcileApplicationOnPage
};
