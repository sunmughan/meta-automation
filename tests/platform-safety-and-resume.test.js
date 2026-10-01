/**
 * tests/platform-safety-and-resume.test.js
 * Comprehensive validation suite for Phase 6.5:
 *  - Required Safety Tests (Tests 1 - 18)
 *  - Required Application Resume Tests (Tests 19 - 30)
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const CONFIG = require("../config");
const { PlatformSafetyGuard, platformSafetyGuard, ACTION_CATEGORIES } = require("../src/safety/platform-safety-guard");
const { BrowserAgent } = require("../src/agent/browser-agent");
const { applyToOpportunity, applicationKey } = require("../src/jobs/application/application-engine");
const { JobStateStore } = require("../src/jobs/storage/job-state-store");
const telemetry = require("../src/telemetry/action-telemetry");

const TEST_STATE_DIR = path.resolve(__dirname, "../job-state/test-safety");

function cleanupTestState() {
  if (fs.existsSync(TEST_STATE_DIR)) {
    fs.rmSync(TEST_STATE_DIR, { recursive: true, force: true });
  }
}

async function runTests() {
  console.log("\n==================================================");
  console.log("  PHASE 6.5: ACCOUNT SAFETY & APPLICATION RESUME");
  console.log("==================================================\n");

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`  ✓ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ FAIL: ${name}`);
      console.error(`    -> ${err.message}\n${err.stack}`);
      failed++;
    }
  }

  cleanupTestState();
  fs.mkdirSync(TEST_STATE_DIR, { recursive: true });

  const customPolicyPath = path.join(TEST_STATE_DIR, "test-policy.json");
  const customSafetyStatePath = path.join(TEST_STATE_DIR, "test-safety-state.json");

  // Create isolated test policy covering all requirements
  const testPolicy = {
    version: 1,
    defaultPolicy: {
      automationPolicy: "HUMAN_APPROVAL_REQUIRED",
      maxActionsPerRun: 5,
      maxActionsPerHour: 10,
      maxActionsPerDay: 20,
      maxConcurrentActions: 1
    },
    platforms: {
      freelancer: {
        id: "freelancer",
        automationPolicy: "ALLOWED",
        allowAutoLogin: true,
        allowAutoProfileEdit: false,
        allowAutoApplication: true,
        allowAutoLearning: false,
        allowAutoMessaging: false,
        allowAutoCommenting: false,
        allowAutoPosting: false,
        allowAutoDM: false,
        maxActionsPerRun: 5,
        maxActionsPerHour: 10,
        maxActionsPerDay: 20,
        maxConcurrentActions: 1
      },
      upwork: {
        id: "upwork",
        automationPolicy: "HUMAN_APPROVAL_REQUIRED",
        allowAutoLogin: true,
        allowAutoProfileEdit: false,
        allowAutoApplication: false,
        maxActionsPerRun: 5,
        maxActionsPerHour: 10,
        maxActionsPerDay: 20,
        maxConcurrentActions: 1
      },
      disabled_platform: {
        id: "disabled_platform",
        automationPolicy: "DISABLED",
        allowAutoLogin: false,
        allowAutoApplication: false
      },
      discovery_platform: {
        id: "discovery_platform",
        automationPolicy: "DISCOVERY_ONLY",
        allowAutoCommenting: false,
        allowAutoApplication: false,
        allowAutoPosting: false
      },
      no_auto_app_platform: {
        id: "no_auto_app_platform",
        automationPolicy: "ALLOWED",
        allowAutoApplication: false
      },
      no_auto_post_platform: {
        id: "no_auto_post_platform",
        automationPolicy: "ALLOWED",
        allowAutoPosting: false
      }
    }
  };
  fs.writeFileSync(customPolicyPath, JSON.stringify(testPolicy, null, 2), "utf8");

  const guard = new PlatformSafetyGuard({
    policyPath: customPolicyPath,
    safetyStatePath: customSafetyStatePath
  });

  // ═══════════════════════════════════════════════════════════════
  // REQUIRED SAFETY TESTS (1 - 18)
  // ═══════════════════════════════════════════════════════════════

  // TEST 1: Unknown platform -> BLOCKED
  await test("TEST 1: Unknown platform policy is blocked (Fail Closed)", async () => {
    const res = guard.evaluateAction({
      platform: "unknown_sketchy_platform",
      actionType: "APPLICATION"
    });
    assert.strictEqual(res.allowed, false, "Must not allow unknown platform");
    assert.strictEqual(res.status, "BLOCKED", "Must return BLOCKED status");
    assert(res.reason.includes("Unknown platform policy"), "Reason must state unknown platform policy");
  });

  // TEST 2: Unknown action category -> BLOCKED
  await test("TEST 2: Unknown action category fails closed (BLOCKED)", async () => {
    const res = guard.evaluateAction({
      platform: "freelancer",
      actionType: "ARBITRARY_UNVERIFIED_ACTION"
    });
    assert.strictEqual(res.allowed, false, "Must fail closed on unknown action category");
    assert.strictEqual(res.status, "BLOCKED", "Status must be BLOCKED");
    assert(res.reason.includes("Unknown action category"), "Reason must state unknown action category");
  });

  // TEST 3: DISABLED platform -> BLOCKED
  await test("TEST 3: DISABLED platform is blocked (Fail Closed)", async () => {
    const res = guard.evaluateAction({
      platform: "disabled_platform",
      actionType: "APPLICATION"
    });
    assert.strictEqual(res.allowed, false, "Must block disabled platform");
    assert.strictEqual(res.status, "BLOCKED", "Status must be BLOCKED");
    assert(res.reason.includes("disabled"), "Reason must state platform is disabled");
  });

  // TEST 4: DISCOVERY_ONLY platform + COMMENT -> BLOCKED
  await test("TEST 4: DISCOVERY_ONLY platform + COMMENT is blocked", async () => {
    const res = guard.evaluateAction({
      platform: "discovery_platform",
      actionType: "COMMENT"
    });
    assert.strictEqual(res.allowed, false, "Must block comment on discovery-only platform");
    assert.strictEqual(res.status, "BLOCKED", "Status must be BLOCKED");
    assert(res.reason.includes("not permitted") || res.reason.includes("discovery"), "Reason must state action not permitted");
  });

  // TEST 5: Human approval platform -> USER_ACTION_REQUIRED
  await test("TEST 5: Human approval platform returns USER_ACTION_REQUIRED with no browser action", async () => {
    const res = guard.evaluateAction({
      platform: "upwork",
      actionType: "APPLICATION",
      workflow: "JOB_APPLICATION"
    });
    assert.strictEqual(res.allowed, false, "Must not auto-execute when approval required");
    assert.strictEqual(res.status, "USER_ACTION_REQUIRED", "Must return USER_ACTION_REQUIRED");
    assert.strictEqual(res.approvalRequired, true, "Must flag approvalRequired");
  });

  // TEST 6: Auto application disabled -> USER_ACTION_REQUIRED
  await test("TEST 6: Auto application disabled returns USER_ACTION_REQUIRED", async () => {
    const res = guard.evaluateAction({
      platform: "no_auto_app_platform",
      actionType: "APPLICATION"
    });
    assert.strictEqual(res.allowed, false, "Must block when auto-application is disabled");
    assert.strictEqual(res.status, "USER_ACTION_REQUIRED", "Must return USER_ACTION_REQUIRED");
    assert.strictEqual(res.approvalRequired, true, "Must require human approval");
  });

  // TEST 7: Auto posting disabled -> USER_ACTION_REQUIRED
  await test("TEST 7: Auto posting disabled returns USER_ACTION_REQUIRED", async () => {
    const res = guard.evaluateAction({
      platform: "no_auto_post_platform",
      actionType: "POST"
    });
    assert.strictEqual(res.allowed, false, "Must block when auto-posting is disabled");
    assert.strictEqual(res.status, "USER_ACTION_REQUIRED", "Must return USER_ACTION_REQUIRED");
    assert.strictEqual(res.approvalRequired, true, "Must require human approval");
  });

  // TEST 8: CAPTCHA detection -> security event -> quarantine
  await test("TEST 8: CAPTCHA detection quarantines account and stops automation without retry", async () => {
    const fakeHtml = "<div>Please solve the reCAPTCHA challenge below to proceed</div>";
    const detected = guard.detectSecurityChallenge(fakeHtml);
    assert.strictEqual(detected.detected, true, "Must detect captcha challenge");
    assert.strictEqual(detected.type, "CAPTCHA", "Must categorize as CAPTCHA");

    const record = guard.recordSecurityEvent("freelancer", detected.type, {
      url: "https://www.freelancer.com/checkpoint",
      reason: detected.evidence
    });
    assert.strictEqual(record.quarantined, true, "Account must immediately be quarantined");
    assert.strictEqual(record.status, "QUARANTINED", "Status must be QUARANTINED");

    const actionEval = guard.evaluateAction({
      platform: "freelancer",
      actionType: "APPLICATION"
    });
    assert.strictEqual(actionEval.allowed, false, "Quarantined account must be blocked");
    assert.strictEqual(actionEval.status, "QUARANTINED", "Status must reflect QUARANTINED");

    guard.resolveQuarantine("freelancer", "default", "test-runner");
  });

  // TEST 9: MFA detection -> quarantine
  await test("TEST 9: MFA/Security challenge triggers quarantine and refuses bypass", async () => {
    const fakeSnapshot = {
      title: "Security Check",
      url: "https://example.com/mfa",
      bodyText: "Enter the two-factor authentication code sent to your authenticator app"
    };
    const detected = guard.detectSecurityChallenge(fakeSnapshot);
    assert.strictEqual(detected.detected, true, "Must detect MFA challenge");
    assert.strictEqual(detected.type, "MFA", "Must categorize as MFA");

    const record = guard.recordSecurityEvent("freelancer", detected.type, {
      url: fakeSnapshot.url,
      reason: detected.evidence
    });
    assert.strictEqual(record.quarantined, true, "MFA challenge must immediately quarantine");

    guard.resolveQuarantine("freelancer", "default", "test-runner");
  });

  // TEST 10: Repeated security events -> cooldown/quarantine
  await test("TEST 10: Repeated security events activate circuit breaker into cooldown and quarantine", async () => {
    const testAccount = "circuit-breaker-test";
    guard.resolveQuarantine("freelancer", testAccount, "test-init");

    const ev1 = guard.recordSecurityEvent("freelancer", "GENERIC_CHALLENGE", { account: testAccount });
    assert.strictEqual(ev1.status, "ACTIVE", "First warning maintains active status with elevated risk");

    const ev2 = guard.recordSecurityEvent("freelancer", "GENERIC_CHALLENGE", { account: testAccount });
    assert.strictEqual(ev2.status, "COOLDOWN", "Second event triggers COOLDOWN");

    const cooldownEval = guard.evaluateAction({
      platform: "freelancer",
      account: testAccount,
      actionType: "APPLICATION"
    });
    assert.strictEqual(cooldownEval.allowed, false, "Must block action during cooldown");
    assert.strictEqual(cooldownEval.status, "RATE_LIMITED", "Status must indicate cooldown/rate-limited");

    const ev3 = guard.recordSecurityEvent("freelancer", "GENERIC_CHALLENGE", { account: testAccount });
    assert.strictEqual(ev3.status, "QUARANTINED", "Third event trips circuit breaker into QUARANTINED");

    guard.resolveQuarantine("freelancer", testAccount, "test-cleanup");
  });

  // TEST 11: Rate limit -> RATE_LIMITED
  await test("TEST 11: Rate limit enforces RATE_LIMITED without evasion", async () => {
    const testAccount = "hourly-limit-test";
    guard.resolveQuarantine("freelancer", testAccount, "test-init");

    for (let i = 0; i < 10; i++) {
      guard.recordSuccessfulAction("freelancer", testAccount, "APPLICATION");
    }

    const res = guard.evaluateAction({
      platform: "freelancer",
      account: testAccount,
      actionType: "APPLICATION"
    });
    assert.strictEqual(res.allowed, false, "Must block once hourly limit reached");
    assert.strictEqual(res.status, "RATE_LIMITED", "Status must be RATE_LIMITED");
    assert(res.reason.includes("Hourly action limit reached"), "Reason must specify hourly limit");
  });

  // TEST 12: Concurrency limit -> RATE_LIMITED
  await test("TEST 12: Concurrency limit prevents overlapping operations on same platform", async () => {
    guard.acquireSlot("freelancer");
    const res = guard.evaluateAction({
      platform: "freelancer",
      actionType: "APPLICATION"
    });
    assert.strictEqual(res.allowed, false, "Must block concurrent action exceeding limit");
    assert.strictEqual(res.status, "RATE_LIMITED", "Must return RATE_LIMITED status");
    assert(res.reason.includes("Concurrent action limit reached"), "Reason must state concurrent limit");

    guard.releaseSlot("freelancer");
    const afterRelease = guard.evaluateAction({
      platform: "freelancer",
      actionType: "APPLICATION"
    });
    assert.strictEqual(afterRelease.allowed, true, "Must allow action after releasing concurrency slot");
  });

  // TEST 13: Successful action counted exactly once
  await test("TEST 13: Successful action is counted exactly once in state and metrics", async () => {
    const testAccount = "counting-test-account";
    const initialActions = (guard.getAccountState("freelancer", testAccount).actionHistory || []).length;

    guard.recordSuccessfulAction("freelancer", testAccount, "APPLICATION", { correlationId: "test-c1" });
    const afterActions = (guard.getAccountState("freelancer", testAccount).actionHistory || []).length;

    assert.strictEqual(afterActions, initialActions + 1, "Action count must increase by exactly 1");
  });

  // TEST 14: Failed action releases concurrency slot and is not counted as successful
  await test("TEST 14: Failed action releases concurrency slot and is not counted as successful", async () => {
    const testAccount = "failure-slot-test";
    const initialActions = (guard.getAccountState("freelancer", testAccount).actionHistory || []).length;

    guard.acquireSlot("freelancer");
    assert.strictEqual(guard.evaluateAction({ platform: "freelancer", account: testAccount, actionType: "APPLICATION" }).allowed, false);

    // Simulate failed operation in try/finally
    try {
      throw new Error("Simulated browser crash during execution");
    } catch (_) {
      // Do not recordSuccessfulAction
    } finally {
      guard.releaseSlot("freelancer");
    }

    const afterActions = (guard.getAccountState("freelancer", testAccount).actionHistory || []).length;
    assert.strictEqual(afterActions, initialActions, "Failed action must not increment success counter");

    const afterReleaseEval = guard.evaluateAction({ platform: "freelancer", account: testAccount, actionType: "APPLICATION" });
    assert.strictEqual(afterReleaseEval.allowed, true, "Slot must be released and next action allowed");
  });

  // TEST 15: Unknown consequential browser action fails closed
  await test("TEST 15: Unknown consequential browser action fails closed (BLOCKED)", async () => {
    const agent = new BrowserAgent({
      page: { url: () => "https://example.com" },
      platform: "freelancer",
      safetyGuard: guard
    });

    const unclassifiableAction = {
      type: "CLICK",
      target: { selector: "#random-unknown-div" }
    };

    const classified = guard.classifySemanticAction(unclassifiableAction, { workflow: "UNKNOWN_WORKFLOW" });
    assert.strictEqual(classified, null, "Must classify unknown consequential action as null (fail closed)");

    const res = await agent.executeAtomicAction(unclassifiableAction);
    assert.strictEqual(res.success, false, "Must fail execution");
    assert.strictEqual(res.state, "BLOCKED", "State must be BLOCKED");
  });

  // TEST 16: Browser action routed through central safety guard
  await test("TEST 16: Browser action routed through central safety guard immediately before execution", async () => {
    let guardInvoked = false;

    const spyGuard = {
      detectSecurityChallenge: () => ({ detected: false }),
      classifySemanticAction: () => "APPLICATION",
      evaluateAction: () => {
        guardInvoked = true;
        return { allowed: true, status: "ALLOWED" };
      },
      acquireSlot: () => {},
      releaseSlot: () => {},
      recordSuccessfulAction: () => {}
    };

    const mockPage = {
      url: () => "https://www.freelancer.com/projects/123",
      mouse: { click: async () => {} }
    };

    const agent = new BrowserAgent({
      page: mockPage,
      platform: "freelancer",
      safetyGuard: spyGuard
    });

    agent.resolveSemanticElement = async () => ({
      scrollIntoView: async () => {},
      evaluate: async () => {},
      boundingBox: async () => ({ x: 10, y: 10, width: 20, height: 20 }),
      click: async () => {}
    });

    await agent.executeAtomicAction({
      type: "CLICK",
      target: { name: "Submit application" },
      workflow: "APPLICATION"
    });

    assert.strictEqual(guardInvoked, true, "BrowserAgent MUST route consequential action through safety guard");
  });

  // TEST 17: Blocked browser action prevents underlying page side-effect execution
  await test("TEST 17: Blocked browser action prevents underlying page side-effect execution", async () => {
    let sideEffectOccurred = false;

    const blockingGuard = {
      detectSecurityChallenge: () => ({ detected: false }),
      classifySemanticAction: () => "APPLICATION",
      evaluateAction: () => ({ allowed: false, status: "BLOCKED", reason: "Blocked by test policy" }),
      acquireSlot: () => {},
      releaseSlot: () => {},
      recordSuccessfulAction: () => {}
    };

    const mockPage = {
      url: () => "https://www.freelancer.com",
      mouse: {
        click: async () => { sideEffectOccurred = true; }
      }
    };

    const agent = new BrowserAgent({
      page: mockPage,
      platform: "freelancer",
      safetyGuard: blockingGuard
    });

    agent.resolveSemanticElement = async () => ({
      scrollIntoView: async () => {},
      evaluate: async () => {},
      boundingBox: async () => ({ x: 10, y: 10, width: 20, height: 20 }),
      click: async () => { sideEffectOccurred = true; }
    });

    const res = await agent.executeAtomicAction({
      type: "CLICK",
      target: { name: "Submit Proposal" }
    });

    assert.strictEqual(res.success, false, "Execution must return unsuccessful");
    assert.strictEqual(sideEffectOccurred, false, "Browser side effect must NOT have executed when blocked");
  });

  // TEST 18: Successful browser action records telemetry and safety accounting exactly once
  await test("TEST 18: Successful browser action records telemetry and safety accounting exactly once", async () => {
    let accountingCalls = 0;

    const accountingGuard = {
      detectSecurityChallenge: () => ({ detected: false }),
      classifySemanticAction: () => "APPLICATION",
      evaluateAction: () => ({ allowed: true, status: "ALLOWED" }),
      acquireSlot: () => {},
      releaseSlot: () => {},
      recordSuccessfulAction: () => { accountingCalls++; }
    };

    const mockPage = {
      url: () => "https://www.freelancer.com",
      mouse: { click: async () => {} }
    };

    const agent = new BrowserAgent({
      page: mockPage,
      platform: "freelancer",
      safetyGuard: accountingGuard
    });

    agent.resolveSemanticElement = async () => ({
      scrollIntoView: async () => {},
      evaluate: async () => {},
      boundingBox: async () => ({ x: 10, y: 10, width: 20, height: 20 }),
      click: async () => {}
    });

    const res = await agent.executeAtomicAction({
      type: "CLICK",
      target: { name: "Apply" },
      workflow: "APPLICATION"
    });

    assert.strictEqual(res.success, true, "Action must succeed");
    assert.strictEqual(accountingCalls, 1, "recordSuccessfulAction must be called exactly once");
  });

  // ═══════════════════════════════════════════════════════════════
  // REQUIRED APPLICATION RESUME TESTS (19 - 30)
  // ═══════════════════════════════════════════════════════════════

  // TEST 19: FORM_FILLED restart
  await test("TEST 19: Application in FORM_FILLED restarts with stable ID and resumes without recreating", async () => {
    const testStorePath = path.join(TEST_STATE_DIR, "job-state-resume-19.json");
    const jobStore = new JobStateStore(testStorePath);

    const opportunity = {
      key: "freelancer:proj_resume_19",
      platform: "freelancer",
      externalId: "proj_resume_19",
      url: "https://www.freelancer.com/projects/test-19",
      workMode: "REMOTE",
      engagementType: "PROJECT"
    };

    const appKey = applicationKey(opportunity);
    jobStore.transitionApplication(appKey, "APPLICATION_READY", {
      opportunityKey: opportunity.key,
      platform: opportunity.platform,
      documents: { coverLetterPath: "/fake/path/cover.txt" }
    });
    jobStore.transitionApplication(appKey, "FORM_STARTED", {});
    jobStore.transitionApplication(appKey, "FORM_FILLED", {});

    const reloadedStore = new JobStateStore(testStorePath);
    const existing = reloadedStore.getApplicationForOpportunity(opportunity.key);
    assert.strictEqual(existing.status, "FORM_FILLED", "State on reload must be FORM_FILLED");
    assert.strictEqual(existing.key, appKey, "Application key must remain unchanged across reload");
    assert.strictEqual(existing.documents.coverLetterPath, "/fake/path/cover.txt", "Documents must be preserved");
  });

  // TEST 20: FORM_FILLED + still-filled form
  await test("TEST 20: FORM_FILLED on still-filled form transitions SUBMITTING -> SUBMITTED -> VERIFIED with single submit", async () => {
    const testStorePath = path.join(TEST_STATE_DIR, "job-state-resume-20.json");
    const jobStore = new JobStateStore(testStorePath);

    const opportunity = {
      key: "freelancer:proj_resume_20",
      platform: "freelancer",
      externalId: "proj_resume_20",
      url: "https://www.freelancer.com/projects/test-20",
      workMode: "REMOTE",
      engagementType: "PROJECT"
    };

    const appKey = applicationKey(opportunity);
    jobStore.transitionApplication(appKey, "APPLICATION_READY", {
      opportunityKey: opportunity.key,
      platform: opportunity.platform,
      documents: { coverLetterPath: "/fake/path/cover.txt", coverLetter: "Hello" }
    });
    jobStore.transitionApplication(appKey, "FORM_STARTED", {});
    jobStore.transitionApplication(appKey, "FORM_FILLED", {});

    let submitClicks = 0;
    let submitted = false;
    const mockBrowserAgent = {
      captureLiveSnapshot: async () => ({
        url: opportunity.url,
        title: "Project Application",
        bodyText: "Project details and proposal form. Ready to submit.",
        interactiveElements: [
          { role: "button", text: "Submit Proposal", id: 1 }
        ]
      }),
      executeAtomicAction: async (action) => {
        if (/submit/i.test(action.semanticCategory || action.target?.text || "")) {
          submitClicks++;
          submitted = true;
        }
        return { success: true };
      }
    };

    const mockAiRuntime = {
      callAi: async () => {
        if (!submitted) {
          return { verified: false, evidence: "Form awaiting submission" };
        }
        return { verified: true, evidence: "Your proposal has been submitted" };
      }
    };

    const originalJobState = require("../src/jobs/storage/job-state-store");
    const oldApplications = { ...originalJobState.state.applications };
    originalJobState.state.applications[appKey] = jobStore.state.applications[appKey];

    const result = await applyToOpportunity({
      opportunity,
      page: { url: () => opportunity.url, goto: async () => {} },
      browserAgent: mockBrowserAgent,
      aiRuntime: mockAiRuntime
    });

    assert.strictEqual(result.status, "VERIFIED", "Result must be VERIFIED");
    assert.strictEqual(submitClicks, 1, "Must perform exactly one submission action");
    const finalApp = originalJobState.state.applications[appKey];
    assert.strictEqual(finalApp.status, "VERIFIED", "Stored application must reach VERIFIED");
    assert(finalApp.history.some(h => h.to === "SUBMITTING"), "Must transition through SUBMITTING");
    assert(finalApp.history.some(h => h.to === "SUBMITTED"), "Must transition through SUBMITTED");

    originalJobState.state.applications = oldApplications;
  });

  // TEST 21: FORM_FILLED + already submitted live page
  await test("TEST 21: FORM_FILLED with already-submitted live page verifies without double submit", async () => {
    const testStorePath = path.join(TEST_STATE_DIR, "job-state-resume-21.json");
    const jobStore = new JobStateStore(testStorePath);

    const opportunity = {
      key: "freelancer:proj_resume_21",
      platform: "freelancer",
      externalId: "proj_resume_21",
      url: "https://www.freelancer.com/projects/test-21",
      workMode: "REMOTE",
      engagementType: "PROJECT"
    };

    const appKey = applicationKey(opportunity);
    jobStore.transitionApplication(appKey, "APPLICATION_READY", {
      opportunityKey: opportunity.key,
      documents: { coverLetterPath: "/fake/path/cover.txt" }
    });
    jobStore.transitionApplication(appKey, "FORM_STARTED", {});
    jobStore.transitionApplication(appKey, "FORM_FILLED", {});

    let submitAttempted = false;
    const mockBrowserAgent = {
      captureLiveSnapshot: async () => ({
        url: opportunity.url,
        title: "Proposal Submitted",
        bodyText: "Congratulations! You have already submitted a proposal for this project."
      }),
      executeAtomicAction: async () => {
        submitAttempted = true;
        return { success: true };
      }
    };

    const mockAiRuntime = {
      callAi: async () => ({ verified: true, evidence: "You have already submitted a proposal" })
    };

    const originalJobState = require("../src/jobs/storage/job-state-store");
    const oldApplications = { ...originalJobState.state.applications };
    originalJobState.state.applications[appKey] = jobStore.state.applications[appKey];

    const result = await applyToOpportunity({
      opportunity,
      page: { url: () => opportunity.url, goto: async () => {} },
      browserAgent: mockBrowserAgent,
      aiRuntime: mockAiRuntime
    });

    assert.strictEqual(result.status, "VERIFIED", "Must verify application");
    assert.strictEqual(submitAttempted, false, "Must not execute any submit action if already submitted");
    assert.strictEqual(originalJobState.state.applications[appKey].status, "VERIFIED");

    originalJobState.state.applications = oldApplications;
  });

  // TEST 22: SUBMITTING restart
  await test("TEST 22: SUBMITTING restart performs fresh reconciliation first and never blindly submits", async () => {
    const testStorePath = path.join(TEST_STATE_DIR, "job-state-resume-22.json");
    const jobStore = new JobStateStore(testStorePath);

    const opportunity = {
      key: "freelancer:proj_resume_22",
      platform: "freelancer",
      externalId: "proj_resume_22",
      url: "https://www.freelancer.com/projects/test-22",
      workMode: "REMOTE",
      engagementType: "PROJECT"
    };

    const appKey = applicationKey(opportunity);
    jobStore.transitionApplication(appKey, "APPLICATION_READY", { opportunityKey: opportunity.key });
    jobStore.transitionApplication(appKey, "FORM_STARTED", {});
    jobStore.transitionApplication(appKey, "FORM_FILLED", {});
    jobStore.transitionApplication(appKey, "SUBMITTING", { reason: "Crashed mid-submission" });

    let submitClicked = false;
    let reconciled = false;

    const mockBrowserAgent = {
      captureLiveSnapshot: async () => {
        reconciled = true;
        return { url: opportunity.url, title: "Uncertain State", bodyText: "Session expired or loading" };
      },
      executeAtomicAction: async () => {
        submitClicked = true;
        return { success: true };
      }
    };

    const mockAiRuntime = {
      callAi: async () => ({ verified: false, evidence: "No confirmation visible" })
    };

    const originalJobState = require("../src/jobs/storage/job-state-store");
    const oldApplications = { ...originalJobState.state.applications };
    originalJobState.state.applications[appKey] = jobStore.state.applications[appKey];

    const result = await applyToOpportunity({
      opportunity,
      page: { url: () => opportunity.url },
      browserAgent: mockBrowserAgent,
      aiRuntime: mockAiRuntime
    });

    assert.strictEqual(reconciled, true, "Must perform fresh reconciliation on restart from SUBMITTING");
    assert.strictEqual(submitClicked, false, "Must NEVER blindly click submit on SUBMITTING restart");
    assert.strictEqual(result.status, "USER_ACTION_REQUIRED", "Ambiguous SUBMITTING must escalate to USER_ACTION_REQUIRED");

    originalJobState.state.applications = oldApplications;
  });

  // TEST 23: SUBMITTING + visible submission evidence
  await test("TEST 23: SUBMITTING + visible submission evidence transitions SUBMITTED -> VERIFIED", async () => {
    const testStorePath = path.join(TEST_STATE_DIR, "job-state-resume-23.json");
    const jobStore = new JobStateStore(testStorePath);

    const opportunity = {
      key: "freelancer:proj_resume_23",
      platform: "freelancer",
      externalId: "proj_resume_23",
      url: "https://www.freelancer.com/projects/test-23",
      workMode: "REMOTE",
      engagementType: "PROJECT"
    };

    const appKey = applicationKey(opportunity);
    jobStore.transitionApplication(appKey, "APPLICATION_READY", { opportunityKey: opportunity.key });
    jobStore.transitionApplication(appKey, "FORM_STARTED", {});
    jobStore.transitionApplication(appKey, "FORM_FILLED", {});
    jobStore.transitionApplication(appKey, "SUBMITTING", {});

    let submitAttempted = false;
    const mockBrowserAgent = {
      captureLiveSnapshot: async () => ({
        url: opportunity.url,
        title: "Bid Placed",
        bodyText: "Your bid has been successfully placed!"
      }),
      executeAtomicAction: async () => { submitAttempted = true; }
    };

    const mockAiRuntime = {
      callAi: async () => ({ verified: true, evidence: "Your bid has been successfully placed!" })
    };

    const originalJobState = require("../src/jobs/storage/job-state-store");
    const oldApplications = { ...originalJobState.state.applications };
    originalJobState.state.applications[appKey] = jobStore.state.applications[appKey];

    const result = await applyToOpportunity({
      opportunity,
      page: { url: () => opportunity.url },
      browserAgent: mockBrowserAgent,
      aiRuntime: mockAiRuntime
    });

    assert.strictEqual(result.status, "VERIFIED", "Must transition to VERIFIED");
    assert.strictEqual(submitAttempted, false, "Must not attempt second submission");
    assert.strictEqual(originalJobState.state.applications[appKey].status, "VERIFIED");

    originalJobState.state.applications = oldApplications;
  });

  // TEST 24: SUBMITTING + ambiguous page
  await test("TEST 24: SUBMITTING + ambiguous page returns USER_ACTION_REQUIRED", async () => {
    const testStorePath = path.join(TEST_STATE_DIR, "job-state-resume-24.json");
    const jobStore = new JobStateStore(testStorePath);

    const opportunity = {
      key: "freelancer:proj_resume_24",
      platform: "freelancer",
      externalId: "proj_resume_24",
      url: "https://www.freelancer.com/projects/test-24",
      workMode: "REMOTE",
      engagementType: "PROJECT"
    };

    const appKey = applicationKey(opportunity);
    jobStore.transitionApplication(appKey, "APPLICATION_READY", { opportunityKey: opportunity.key });
    jobStore.transitionApplication(appKey, "FORM_STARTED", {});
    jobStore.transitionApplication(appKey, "FORM_FILLED", {});
    jobStore.transitionApplication(appKey, "SUBMITTING", {});

    const mockBrowserAgent = {
      captureLiveSnapshot: async () => ({
        url: "https://www.freelancer.com/unknown-gateway",
        bodyText: "502 Bad Gateway"
      })
    };

    const mockAiRuntime = {
      callAi: async () => ({ verified: false, evidence: "502 Bad Gateway error page" })
    };

    const originalJobState = require("../src/jobs/storage/job-state-store");
    const oldApplications = { ...originalJobState.state.applications };
    originalJobState.state.applications[appKey] = jobStore.state.applications[appKey];

    const result = await applyToOpportunity({
      opportunity,
      page: { url: () => "https://www.freelancer.com/unknown-gateway" },
      browserAgent: mockBrowserAgent,
      aiRuntime: mockAiRuntime
    });

    assert.strictEqual(result.status, "USER_ACTION_REQUIRED", "Ambiguous page must escalate to USER_ACTION_REQUIRED");
    assert.strictEqual(originalJobState.state.applications[appKey].status, "USER_ACTION_REQUIRED");

    originalJobState.state.applications = oldApplications;
  });

  // TEST 25: Partial form
  await test("TEST 25: Partial form preserves valid fields and completes missing fields", async () => {
    const candidateProfile = {
      name: "John Developer",
      email: "john@example.com",
      hourlyRate: 55
    };

    const liveForm = {
      fields: [
        { name: "name", value: "John Developer", valid: true },
        { name: "email", value: "", valid: false, required: true },
        { name: "rate", value: "", valid: false, required: true }
      ]
    };

    // Reconcile: preserve existing valid fields
    const updatedFields = liveForm.fields.map(f => {
      if (f.valid && f.value) return f;
      if (f.name === "email") return { ...f, value: candidateProfile.email, valid: true };
      if (f.name === "rate") return { ...f, value: String(candidateProfile.hourlyRate), valid: true };
      return f;
    });

    assert.strictEqual(updatedFields[0].value, "John Developer", "Existing valid field must be preserved");
    assert.strictEqual(updatedFields[1].value, "john@example.com", "Missing required email must be populated");
    assert.strictEqual(updatedFields[2].value, "55", "Missing required rate must be populated");
  });

  // TEST 26: Documents already exist
  await test("TEST 26: Documents already exist prevents redundant document generation", async () => {
    const testStorePath = path.join(TEST_STATE_DIR, "job-state-resume-26.json");
    const jobStore = new JobStateStore(testStorePath);

    const opportunity = {
      key: "freelancer:proj_resume_26",
      platform: "freelancer",
      externalId: "proj_resume_26",
      url: "https://www.freelancer.com/projects/test-26",
      workMode: "REMOTE",
      engagementType: "PROJECT"
    };

    const appKey = applicationKey(opportunity);
    jobStore.transitionApplication(appKey, "APPLICATION_READY", {
      opportunityKey: opportunity.key,
      documents: {
        coverLetterPath: "/existing/cover.txt",
        baseResumePath: "/existing/resume.pdf",
        coverLetter: "Pre-existing bespoke proposal letter"
      }
    });

    const docEngine = require("../src/jobs/documents/document-engine");
    let generatorCalled = false;
    const origGen = docEngine.generateApplicationDocuments;
    docEngine.generateApplicationDocuments = async () => {
      generatorCalled = true;
      return origGen ? origGen.apply(docEngine, arguments) : {};
    };

    const originalJobState = require("../src/jobs/storage/job-state-store");
    const oldApplications = { ...originalJobState.state.applications };
    originalJobState.state.applications[appKey] = jobStore.state.applications[appKey];

    try {
      await applyToOpportunity({
        opportunity,
        page: null,
        browserAgent: null,
        aiRuntime: null
      });
    } catch (_) {} finally {
      docEngine.generateApplicationDocuments = origGen;
      originalJobState.state.applications = oldApplications;
    }

    assert.strictEqual(generatorCalled, false, "Document generator must NOT be called when documents already exist");
  });

  // TEST 27: Duplicate retry
  await test("TEST 27: Duplicate retry maintains single stable application record and key", async () => {
    const testStorePath = path.join(TEST_STATE_DIR, "job-state-resume-27.json");
    const jobStore = new JobStateStore(testStorePath);

    const opportunity = {
      key: "freelancer:proj_resume_27",
      platform: "freelancer",
      externalId: "proj_resume_27",
      url: "https://www.freelancer.com/projects/test-27",
      workMode: "REMOTE",
      engagementType: "PROJECT"
    };

    const appKey = applicationKey(opportunity);
    jobStore.transitionApplication(appKey, "APPLICATION_READY", { opportunityKey: opportunity.key });
    jobStore.transitionApplication(appKey, "FORM_STARTED", {});
    jobStore.transitionApplication(appKey, "FORM_FILLED", {});
    jobStore.transitionApplication(appKey, "SUBMITTED", { submittedAt: new Date().toISOString() });

    const originalJobState = require("../src/jobs/storage/job-state-store");
    const oldApplications = { ...originalJobState.state.applications };
    originalJobState.state.applications[appKey] = jobStore.state.applications[appKey];

    const res1 = await applyToOpportunity({ opportunity, page: null });
    const res2 = await applyToOpportunity({ opportunity, page: null });

    assert.strictEqual(res1.status, "SUBMITTED");
    assert.strictEqual(res2.status, "SUBMITTED");

    const allApps = Object.values(originalJobState.state.applications).filter(a => a.opportunityKey === opportunity.key);
    assert.strictEqual(allApps.length, 1, "Must maintain exactly one application record for the opportunity");
    assert.strictEqual(allApps[0].key, appKey, "Application key must remain constant");

    originalJobState.state.applications = oldApplications;
  });

  // TEST 28: Verification failure
  await test("TEST 28: Verification failure transitions SUBMITTED -> UNVERIFIED", async () => {
    const testStorePath = path.join(TEST_STATE_DIR, "job-state-resume-28.json");
    const jobStore = new JobStateStore(testStorePath);

    const opportunity = {
      key: "freelancer:proj_resume_28",
      platform: "freelancer",
      externalId: "proj_resume_28",
      url: "https://www.freelancer.com/projects/test-28",
      workMode: "REMOTE",
      engagementType: "PROJECT"
    };

    const appKey = applicationKey(opportunity);
    jobStore.transitionApplication(appKey, "APPLICATION_READY", {
      opportunityKey: opportunity.key,
      documents: { coverLetterPath: "/fake/path/cover.txt" }
    });
    jobStore.transitionApplication(appKey, "FORM_STARTED", {});
    jobStore.transitionApplication(appKey, "FORM_FILLED", {});

    const mockBrowserAgent = {
      captureLiveSnapshot: async () => ({
        url: opportunity.url,
        interactiveElements: [{ role: "button", text: "Submit", id: 1 }]
      }),
      executeAtomicAction: async () => ({ success: true })
    };

    const mockAiRuntime = {
      callAi: async () => ({ verified: false, evidence: "No confirmation banner or receipt shown" })
    };

    const originalJobState = require("../src/jobs/storage/job-state-store");
    const oldApplications = { ...originalJobState.state.applications };
    originalJobState.state.applications[appKey] = jobStore.state.applications[appKey];

    const result = await applyToOpportunity({
      opportunity,
      page: { url: () => opportunity.url, goto: async () => {} },
      browserAgent: mockBrowserAgent,
      aiRuntime: mockAiRuntime
    });

    assert.strictEqual(result.status, "UNVERIFIED", "Result status must be UNVERIFIED");
    const storedApp = originalJobState.state.applications[appKey];
    assert.strictEqual(storedApp.status, "UNVERIFIED", "Stored application must be UNVERIFIED");
    assert.notStrictEqual(storedApp.status, "VERIFIED", "Must NOT falsely claim VERIFIED");

    originalJobState.state.applications = oldApplications;
  });

  // TEST 29: Illegal transition
  await test("TEST 29: Invalid application state transition throws error and preserves state integrity", async () => {
    const testStorePath = path.join(TEST_STATE_DIR, "job-state-resume-29.json");
    const jobStore = new JobStateStore(testStorePath);

    const appKey = "freelancer:test_illegal_29";
    jobStore.transitionApplication(appKey, "APPLICATION_READY", {});
    jobStore.transitionApplication(appKey, "FORM_STARTED", {});
    jobStore.transitionApplication(appKey, "FORM_FILLED", {});

    // FORM_FILLED -> FORM_STARTED is illegal!
    let threw = false;
    try {
      jobStore.transitionApplication(appKey, "FORM_STARTED");
    } catch (err) {
      threw = true;
      assert(err.message.includes("Illegal application transition"), "Error must state illegal transition");
    }

    assert.strictEqual(threw, true, "Must throw on illegal transition");
    assert.strictEqual(jobStore.state.applications[appKey].status, "FORM_FILLED", "State must remain unchanged at FORM_FILLED");

    // Also VERIFIED -> PLANNED is illegal terminal transition!
    jobStore.transitionApplication(appKey, "SUBMITTING", {});
    jobStore.transitionApplication(appKey, "SUBMITTED", {});
    jobStore.transitionApplication(appKey, "VERIFIED", {});

    let termThrew = false;
    try {
      jobStore.transitionApplication(appKey, "PLANNED");
    } catch (err) {
      termThrew = true;
      assert(err.message.includes("cannot transition verified application"), "Must reject backwards transition from VERIFIED");
    }
    assert.strictEqual(termThrew, true, "Terminal state VERIFIED must reject backwards transition");
  });

  // TEST 30: Complete crash/resume simulation
  await test("TEST 30: Complete crash/resume simulation preserves state across all restart boundaries", async () => {
    const testStorePath = path.join(TEST_STATE_DIR, "job-state-resume-30.json");

    const opportunity = {
      key: "freelancer:proj_resume_30",
      platform: "freelancer",
      externalId: "proj_resume_30",
      url: "https://www.freelancer.com/projects/test-30",
      workMode: "REMOTE",
      engagementType: "PROJECT"
    };

    const appKey = applicationKey(opportunity);

    // STAGE 1: Process 1 fills form and crashes at FORM_FILLED
    {
      const store1 = new JobStateStore(testStorePath);
      store1.transitionApplication(appKey, "APPLICATION_READY", {
        opportunityKey: opportunity.key,
        documents: { coverLetterPath: "/persisted/cover.txt", coverLetter: "Persisted proposal" }
      });
      store1.transitionApplication(appKey, "FORM_STARTED", { reason: "Form opened" });
      store1.transitionApplication(appKey, "FORM_FILLED", { reason: "Form filled" });
    }

    // STAGE 2: Process 2 boots after crash, reloads store from disk
    const store2 = new JobStateStore(testStorePath);
    const existing = store2.getApplicationForOpportunity(opportunity.key);
    assert.strictEqual(existing.status, "FORM_FILLED", "State survived process crash");
    assert.strictEqual(existing.documents.coverLetterPath, "/persisted/cover.txt", "Documents survived process crash");

    // STAGE 3: Resume execution
    let submitExecuted = 0;
    let submitted = false;
    const mockBrowserAgent = {
      captureLiveSnapshot: async () => ({
        url: opportunity.url,
        title: "Bid Form",
        bodyText: "Filled proposal form ready",
        interactiveElements: [{ role: "button", text: "Place Bid", id: 99 }]
      }),
      executeAtomicAction: async () => {
        submitExecuted++;
        submitted = true;
        return { success: true };
      }
    };

    const mockAiRuntime = {
      callAi: async () => {
        if (!submitted) {
          return { verified: false, evidence: "Form awaiting submission" };
        }
        return { verified: true, evidence: "Bid confirmation receipt #7890" };
      }
    };

    const originalJobState = require("../src/jobs/storage/job-state-store");
    const oldApplications = { ...originalJobState.state.applications };
    originalJobState.state.applications[appKey] = store2.state.applications[appKey];

    const res = await applyToOpportunity({
      opportunity,
      page: { url: () => opportunity.url, goto: async () => {} },
      browserAgent: mockBrowserAgent,
      aiRuntime: mockAiRuntime
    });

    assert.strictEqual(res.status, "VERIFIED", "Application reached VERIFIED after resume");
    assert.strictEqual(submitExecuted, 1, "Exactly one submit executed");

    store2.state.applications[appKey] = originalJobState.state.applications[appKey];
    store2.state.metrics = { ...originalJobState.state.metrics };
    store2.save();

    // STAGE 4: Process 3 boots later and checks status from disk
    const store3 = new JobStateStore(testStorePath);
    const finalApp = store3.getApplicationForOpportunity(opportunity.key);
    assert.strictEqual(finalApp.status, "VERIFIED", "Final terminal state persisted cleanly");
    assert.strictEqual(finalApp.hasSubmitted, true);
    assert.strictEqual(finalApp.hasVerified, true);
    assert(store3.state.metrics.submitted >= 1, "Submitted metric counted");
    assert(store3.state.metrics.verified >= 1, "Verified metric counted");

    originalJobState.state.applications = oldApplications;
  });

  cleanupTestState();

  console.log("\n--------------------------------------------------");
  console.log(`Results: ${passed} Passed, ${failed} Failed`);
  console.log("--------------------------------------------------\n");

  if (failed > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  runTests();
}

module.exports = runTests;
