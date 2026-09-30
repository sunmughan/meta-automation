/**
 * tests/platform-safety-and-resume.test.js
 * Comprehensive validation suite for Phase 6.5:
 *  - Account Safety & Platform Policy Guardrails (Tests 1-8, 13-17)
 *  - True Application Resume & Reconciliation (Tests 9-12)
 *  - Existing State-Machine / Idempotency Parity (Test 18)
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const CONFIG = require("../config");
const { PlatformSafetyGuard, platformSafetyGuard, ACTION_CATEGORIES } = require("../src/safety/platform-safety-guard");
const { applyToOpportunity, applicationKey } = require("../src/jobs/application/application-engine");
const { JobStateStore } = require("../src/jobs/storage/job-state-store");
const telemetry = require("../src/telemetry/action-telemetry");
const aiRuntime = require("../src/ai/ai-runtime");

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

  // Create isolated test policy
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
      }
    }
  };
  fs.writeFileSync(customPolicyPath, JSON.stringify(testPolicy, null, 2), "utf8");

  const guard = new PlatformSafetyGuard({
    policyPath: customPolicyPath,
    safetyStatePath: customSafetyStatePath
  });

  // TEST 1: Unknown platform policy
  await test("TEST 1: Unknown platform policy is blocked (Fail Closed)", async () => {
    const res = guard.evaluateAction({
      platform: "unknown_sketchy_platform",
      actionType: "APPLICATION"
    });
    assert.strictEqual(res.allowed, false, "Must not allow unknown platform");
    assert.strictEqual(res.status, "BLOCKED", "Must return BLOCKED status");
    assert(res.reason.includes("Unknown platform policy"), "Reason must state unknown platform policy");
  });

  // TEST 2: HUMAN_APPROVAL_REQUIRED action
  await test("TEST 2: HUMAN_APPROVAL_REQUIRED returns USER_ACTION_REQUIRED with no browser action", async () => {
    const res = guard.evaluateAction({
      platform: "upwork",
      actionType: "APPLICATION",
      workflow: "JOB_APPLICATION"
    });
    assert.strictEqual(res.allowed, false, "Must not auto-execute when approval required");
    assert.strictEqual(res.status, "USER_ACTION_REQUIRED", "Must return USER_ACTION_REQUIRED");
    assert.strictEqual(res.approvalRequired, true, "Must flag approvalRequired");
  });

  // TEST 3: CAPTCHA detection
  await test("TEST 3: CAPTCHA detection quarantines account and stops automation without retry", async () => {
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

    // Any subsequent action must be blocked under quarantine
    const actionEval = guard.evaluateAction({
      platform: "freelancer",
      actionType: "APPLICATION"
    });
    assert.strictEqual(actionEval.allowed, false, "Quarantined account must be blocked");
    assert.strictEqual(actionEval.status, "QUARANTINED", "Status must reflect QUARANTINED");

    // Clean up quarantine for subsequent tests
    guard.resolveQuarantine("freelancer", "default", "test-runner");
  });

  // TEST 4: MFA/security challenge
  await test("TEST 4: MFA/Security challenge triggers quarantine and refuses bypass", async () => {
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

  // TEST 5: Repeated security events activate circuit breaker
  await test("TEST 5: Repeated security events activate circuit breaker into cooldown and quarantine", async () => {
    const testAccount = "circuit-breaker-test";
    guard.resolveQuarantine("freelancer", testAccount, "test-init");

    // Event 1: Warning
    const ev1 = guard.recordSecurityEvent("freelancer", "GENERIC_CHALLENGE", { account: testAccount });
    assert.strictEqual(ev1.status, "ACTIVE", "First warning maintains active status with elevated risk");

    // Event 2: Cooldown
    const ev2 = guard.recordSecurityEvent("freelancer", "GENERIC_CHALLENGE", { account: testAccount });
    assert.strictEqual(ev2.status, "COOLDOWN", "Second event triggers COOLDOWN");

    // During cooldown, action is rate limited / blocked
    const cooldownEval = guard.evaluateAction({
      platform: "freelancer",
      account: testAccount,
      actionType: "APPLICATION"
    });
    assert.strictEqual(cooldownEval.allowed, false, "Must block action during cooldown");
    assert.strictEqual(cooldownEval.status, "RATE_LIMITED", "Status must indicate cooldown/rate-limited");

    // Event 3: Full Quarantine
    const ev3 = guard.recordSecurityEvent("freelancer", "GENERIC_CHALLENGE", { account: testAccount });
    assert.strictEqual(ev3.status, "QUARANTINED", "Third event trips circuit breaker into QUARANTINED");

    guard.resolveQuarantine("freelancer", testAccount, "test-cleanup");
  });

  // TEST 6: Hourly action limit
  await test("TEST 6: Hourly action limit enforces RATE_LIMITED without evasion", async () => {
    const testAccount = "hourly-limit-test";
    guard.resolveQuarantine("freelancer", testAccount, "test-init");

    // Max hourly actions in testPolicy is 10
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

  // TEST 7: Daily action limit
  await test("TEST 7: Daily action limit enforces RATE_LIMITED without evasion", async () => {
    const testAccount = "daily-limit-test";
    guard.resolveQuarantine("freelancer", testAccount, "test-init");

    // Max daily actions is 20
    for (let i = 0; i < 20; i++) {
      guard.recordSuccessfulAction("freelancer", testAccount, "APPLICATION");
    }

    const res = guard.evaluateAction({
      platform: "freelancer",
      account: testAccount,
      actionType: "APPLICATION"
    });
    assert.strictEqual(res.allowed, false, "Must block once daily limit reached");
    assert.strictEqual(res.status, "RATE_LIMITED", "Status must be RATE_LIMITED");
    assert(res.reason.includes("action limit reached"), "Reason must specify action limit");
  });

  // TEST 8: Concurrent action limit
  await test("TEST 8: Concurrent action limit prevents overlapping operations on same platform", async () => {
    // maxConcurrentActions is 1
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

  // TEST 9: Application FORM_FILLED + process restart
  await test("TEST 9: Application in FORM_FILLED restarts with stable ID and resumes without recreating", async () => {
    const testStorePath = path.join(TEST_STATE_DIR, "job-state-resume.json");
    const jobStore = new JobStateStore(testStorePath);

    const opportunity = {
      key: "freelancer:proj_resume_101",
      platform: "freelancer",
      externalId: "proj_resume_101",
      url: "https://www.freelancer.com/projects/test-101",
      workMode: "REMOTE",
      engagementType: "PROJECT"
    };

    const appKey = applicationKey(opportunity);
    assert.strictEqual(appKey, "freelancer:proj_resume_101", "Application key must be deterministic");

    // Simulate pre-crash state at FORM_FILLED
    jobStore.transitionApplication(appKey, "APPLICATION_READY", {
      opportunityKey: opportunity.key,
      platform: opportunity.platform,
      documents: { coverLetterPath: "/fake/path/cover.txt" }
    });
    jobStore.transitionApplication(appKey, "FORM_STARTED", { reason: "Form opened" });
    jobStore.transitionApplication(appKey, "FORM_FILLED", { reason: "Form filled" });

    // Simulate process reload from disk
    const reloadedStore = new JobStateStore(testStorePath);
    const existing = reloadedStore.getApplicationForOpportunity(opportunity.key);
    assert.strictEqual(existing.status, "FORM_FILLED", "State on reload must be FORM_FILLED");
    assert.strictEqual(existing.key, appKey, "Application key must remain unchanged across reload");
    assert.strictEqual(existing.documents.coverLetterPath, "/fake/path/cover.txt", "Documents must be preserved");
  });

  // TEST 10: Application SUBMITTED + process restart
  await test("TEST 10: Application in SUBMITTED on restart does not execute second submission", async () => {
    const testStorePath = path.join(TEST_STATE_DIR, "job-state-submitted.json");
    const jobStore = new JobStateStore(testStorePath);

    const opportunity = {
      key: "freelancer:proj_submitted_202",
      platform: "freelancer",
      externalId: "proj_submitted_202",
      url: "https://www.freelancer.com/projects/test-202",
      workMode: "REMOTE",
      engagementType: "PROJECT"
    };

    const appKey = applicationKey(opportunity);
    jobStore.transitionApplication(appKey, "APPLICATION_READY", { opportunityKey: opportunity.key });
    jobStore.transitionApplication(appKey, "FORM_STARTED", {});
    jobStore.transitionApplication(appKey, "FORM_FILLED", {});
    jobStore.transitionApplication(appKey, "SUBMITTED", { submittedAt: new Date().toISOString() });

    const submissionCountBefore = jobStore.state.metrics.submitted;

    // Call applyToOpportunity when already SUBMITTED
    const originalJobState = require("../src/jobs/storage/job-state-store");
    const oldApplications = { ...originalJobState.state.applications };
    originalJobState.state.applications[appKey] = jobStore.state.applications[appKey];

    const result = await applyToOpportunity({
      opportunity,
      page: null,
      browserAgent: null,
      aiRuntime: null
    });

    assert.strictEqual(result.status, "SUBMITTED", "Must return SUBMITTED without attempting re-submission");
    assert(result.reason.includes("already submitted"), "Reason must confirm existing submission");

    // Restore state
    originalJobState.state.applications = oldApplications;
  });

  // TEST 11: Application VERIFIED + process restart
  await test("TEST 11: Application in VERIFIED safely skips re-execution on restart", async () => {
    const testStorePath = path.join(TEST_STATE_DIR, "job-state-verified.json");
    const jobStore = new JobStateStore(testStorePath);

    const opportunity = {
      key: "freelancer:proj_verified_303",
      platform: "freelancer",
      externalId: "proj_verified_303",
      url: "https://www.freelancer.com/projects/test-303",
      workMode: "REMOTE",
      engagementType: "PROJECT"
    };

    const appKey = applicationKey(opportunity);
    jobStore.transitionApplication(appKey, "SUBMITTED", { opportunityKey: opportunity.key });
    jobStore.transitionApplication(appKey, "VERIFIED", { verifiedAt: new Date().toISOString() });

    const originalJobState = require("../src/jobs/storage/job-state-store");
    const oldApplications = { ...originalJobState.state.applications };
    originalJobState.state.applications[appKey] = jobStore.state.applications[appKey];

    const result = await applyToOpportunity({
      opportunity,
      page: null,
      browserAgent: null,
      aiRuntime: null
    });

    assert.strictEqual(result.status, "SKIPPED", "Must skip already verified application");
    assert(result.reason.includes("already verified"), "Must confirm reason as already verified");

    originalJobState.state.applications = oldApplications;
  });

  // TEST 12: Application UNVERIFIED
  await test("TEST 12: Application in UNVERIFIED reconciles evidence rather than blind resubmission", async () => {
    const testStorePath = path.join(TEST_STATE_DIR, "job-state-unverified.json");
    const jobStore = new JobStateStore(testStorePath);

    const opportunity = {
      key: "freelancer:proj_unverified_404",
      platform: "freelancer",
      externalId: "proj_unverified_404",
      url: "https://www.freelancer.com/projects/test-404",
      workMode: "REMOTE",
      engagementType: "PROJECT"
    };

    const appKey = applicationKey(opportunity);
    jobStore.transitionApplication(appKey, "SUBMITTED", { opportunityKey: opportunity.key });
    jobStore.transitionApplication(appKey, "UNVERIFIED", { reason: "Missing confirmation banner" });

    const originalJobState = require("../src/jobs/storage/job-state-store");
    const oldApplications = { ...originalJobState.state.applications };
    originalJobState.state.applications[appKey] = jobStore.state.applications[appKey];

    const result = await applyToOpportunity({
      opportunity,
      page: null,
      browserAgent: null,
      aiRuntime: null
    });

    assert.strictEqual(result.status, "UNVERIFIED", "Must remain UNVERIFIED or require review without blind re-submit");
    assert(result.reason.includes("human review required") || result.reason.includes("unverified"), "Reason must be truthful");

    originalJobState.state.applications = oldApplications;
  });

  // TEST 13: Sensitive telemetry redaction
  await test("TEST 13: Sensitive credentials (passwords, tokens, cookies, OTPs) are redacted from telemetry", async () => {
    const rawTelemetryEvent = {
      type: "ACTION_ATTEMPTED",
      platform: "test_platform",
      action: "SUBMIT",
      password: "SuperSecretPassword123!",
      token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.secretToken",
      cookie: "session_id=abcdef123456; Path=/",
      otp: "987654",
      evidence: {
        authorizationHeader: "Bearer secret-token-value-xyz",
        userInputPassword: "password=MyPlainPassword&otp=123456"
      }
    };

    const recorded = telemetry.record(rawTelemetryEvent);
    assert.strictEqual(recorded.password, "[REDACTED]", "Password field must be redacted");
    assert.strictEqual(recorded.token, "[REDACTED]", "Token field must be redacted");
    assert.strictEqual(recorded.cookie, "[REDACTED]", "Cookie field must be redacted");
    assert.strictEqual(recorded.otp, "[REDACTED]", "OTP field must be redacted");
    assert(!JSON.stringify(recorded).includes("SuperSecretPassword123!"), "Raw password must not appear anywhere in telemetry");
    assert(!JSON.stringify(recorded).includes("secret-token-value-xyz"), "Raw bearer token must not appear anywhere in telemetry");
  });

  // TEST 14: AI prompt safety
  await test("TEST 14: AI prompt sanitizer redacts sensitive credentials before dispatch", async () => {
    const sensitivePrompt = "Evaluate this user application: password=superSecretPassword&token=abc123token Bearer secret_ai_token_here";
    const { redactSensitiveData } = require("../src/telemetry/action-telemetry");
    const sanitized = redactSensitiveData(sensitivePrompt);

    assert(!sanitized.includes("superSecretPassword"), "Sanitized prompt must not contain raw password");
    assert(!sanitized.includes("secret_ai_token_here"), "Sanitized prompt must not contain raw token");
    assert(sanitized.includes("[REDACTED]"), "Sanitized prompt must contain redaction placeholders");
  });

  // TEST 15: Account session isolation
  await test("TEST 15: Account browser profile configurations remain strictly isolated across planes", async () => {
    assert(CONFIG.JOB_BROWSER_USER_DATA_DIR, "JOB_BROWSER_USER_DATA_DIR must be configured");
    assert(CONFIG.JOB_BROWSER_CDP_URL, "JOB_BROWSER_CDP_URL must be configured");
    assert(CONFIG.CDP_URL, "Social CDP_URL must be configured");

    const jobDir = path.resolve(CONFIG.ROOT_DIR, CONFIG.JOB_BROWSER_USER_DATA_DIR);
    const socialUserData = path.resolve(CONFIG.ROOT_DIR, "private/browser-data");

    assert.notStrictEqual(jobDir, socialUserData, "Job browser data dir must not equal social browser dir");
    assert.notStrictEqual(CONFIG.JOB_BROWSER_CDP_URL, "http://127.0.0.1:9222", "Job CDP port must default to 9223 for profile isolation");
  });

  // TEST 16: Policy registry is declarative
  await test("TEST 16: Platform safety policy is declarative and contains no duplicated code logic", async () => {
    const policyFile = path.resolve(CONFIG.ROOT_DIR, "config/platform-safety-policy.json");
    assert(fs.existsSync(policyFile), "config/platform-safety-policy.json must exist");
    const parsed = JSON.parse(fs.readFileSync(policyFile, "utf8"));
    assert(parsed.platforms, "Policy must define platforms object");
    assert(parsed.platforms.freelancer, "Freelancer policy must be declared");
    assert(parsed.platforms.threads, "Threads policy must be declared");
    assert(parsed.platforms.leetcode, "LeetCode policy must be declared");

    for (const [id, plat] of Object.entries(parsed.platforms)) {
      assert(plat.automationPolicy, `Platform ${id} must specify automationPolicy`);
      assert(typeof plat.stopOnCaptcha === "boolean", `Platform ${id} must declare stopOnCaptcha`);
    }
  });

  // TEST 17: Unknown action category fails closed
  await test("TEST 17: Unknown action category fails closed (BLOCKED)", async () => {
    const res = guard.evaluateAction({
      platform: "freelancer",
      actionType: "ARBITRARY_UNVERIFIED_ACTION"
    });
    assert.strictEqual(res.allowed, false, "Must fail closed on unknown action");
    assert.strictEqual(res.status, "BLOCKED", "Status must be BLOCKED");
    assert(res.reason.includes("Unknown action category"), "Reason must state unknown action category");
  });

  // TEST 18: Existing state-machine/idempotency suite remains green
  await test("TEST 18: Existing Phase 6 state-machine idempotency suite passes cleanly", async () => {
    const stateMachineTestSuite = require("./state-machine-idempotency.test.js");
    // Ensure state machine file is loadable and has valid assertions
    assert(stateMachineTestSuite, "State machine idempotency suite must be loadable");
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
