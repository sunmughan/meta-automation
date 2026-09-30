/**
 * tests/state-machine-idempotency.test.js
 * Executable behavior test suite for Phase 6 True State Machine + Idempotency.
 * Validates deterministic lifecycles, crash-restart resilience, audit trails, and metric idempotency.
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const { GrowthStateStore } = require("../src/jobs/growth/growth-state-store");
const { JobStateStore } = require("../src/jobs/storage/job-state-store");
const { CertificationStateStore } = require("../src/jobs/certification/certification-state-store");

function createTempFile(prefix) {
  return path.join(os.tmpdir(), `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`);
}

function cleanup(file) {
  try { if (fs.existsSync(file)) fs.unlinkSync(file); } catch (_) {}
}

let passed = 0;
let failed = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ✓ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

console.log("\n==================================================");
console.log("  PHASE 6: TRUE STATE MACHINE & IDEMPOTENCY SUITE");
console.log("==================================================\n");

// TEST 1: Full lifecycle and idempotency on re-run
runTest("TEST 1: Growth Goal PLANNED -> STARTED -> IN_PROGRESS -> DONE and metric idempotency on re-run", () => {
  const file = createTempFile("test1-growth");
  try {
    const store = new GrowthStateStore(file);
    const goalId = "skill:python-concurrency";

    // 1. Initial Planned
    const g1 = store.transitionGoal(goalId, "PLANNED", { skill: "Python Concurrency" });
    assert.strictEqual(g1.status, "PLANNED");
    assert.strictEqual(store.state.metrics.goalsStarted, 0);
    assert.strictEqual(store.state.metrics.goalsCompleted, 0);

    // 2. Started
    const g2 = store.transitionGoal(goalId, "STARTED");
    assert.strictEqual(g2.status, "STARTED");
    assert.strictEqual(store.state.metrics.goalsStarted, 1);
    assert.strictEqual(store.state.metrics.goalsCompleted, 0);

    // 3. In Progress
    const g3 = store.transitionGoal(goalId, "IN_PROGRESS", { lastDecision: "Selecting practice task" });
    assert.strictEqual(g3.status, "IN_PROGRESS");
    assert.strictEqual(store.state.metrics.goalsStarted, 1);
    assert.strictEqual(store.state.metrics.goalsCompleted, 0);

    // 4. Done
    const g4 = store.transitionGoal(goalId, "DONE", { reason: "Visibly passed all concurrency test cases" });
    assert.strictEqual(g4.status, "DONE");
    assert.strictEqual(store.state.metrics.goalsStarted, 1);
    assert.strictEqual(store.state.metrics.goalsCompleted, 1);

    // Re-run execution (idempotent no-op)
    const g5 = store.transitionGoal(goalId, "DONE", { reason: "Re-run attempt" });
    assert.strictEqual(g5.status, "DONE");
    assert.strictEqual(store.state.metrics.goalsStarted, 1, "goalsStarted must not increment on re-run");
    assert.strictEqual(store.state.metrics.goalsCompleted, 1, "goalsCompleted must not increment on re-run");
  } finally {
    cleanup(file);
  }
});

// TEST 2: Goal failure at IN_PROGRESS and safe retry
runTest("TEST 2: Goal failure at IN_PROGRESS followed by retry achieves DONE with stable ID and exact metrics", () => {
  const file = createTempFile("test2-growth");
  try {
    const store = new GrowthStateStore(file);
    const goalId = "skill:distributed-locks";

    // Initial run fails
    store.transitionGoal(goalId, "STARTED", { skill: "Distributed Locks" });
    store.transitionGoal(goalId, "IN_PROGRESS");
    store.transitionGoal(goalId, "FAILED", { error: "Network timeout on test runner" });

    const failedGoal = store.getGoal(goalId);
    assert.strictEqual(failedGoal.status, "FAILED");
    assert.strictEqual(store.state.metrics.goalsStarted, 1);
    assert.strictEqual(store.state.metrics.goalsCompleted, 0);

    // Retry run on the exact same goal ID
    store.transitionGoal(goalId, "STARTED", { retryAttempt: 2 });
    assert.strictEqual(store.state.metrics.goalsStarted, 1, "goalsStarted must remain 1 on retry");

    store.transitionGoal(goalId, "IN_PROGRESS", { retryAttempt: 2 });
    store.transitionGoal(goalId, "DONE", { reason: "Lock implementation verified" });

    const doneGoal = store.getGoal(goalId);
    assert.strictEqual(doneGoal.id, goalId, "Goal ID must remain stable across retries");
    assert.strictEqual(doneGoal.status, "DONE");
    assert.strictEqual(store.state.metrics.goalsStarted, 1, "goalsStarted must remain 1");
    assert.strictEqual(store.state.metrics.goalsCompleted, 1, "goalsCompleted must become 1");
  } finally {
    cleanup(file);
  }
});

// TEST 3: Process restart on IN_PROGRESS goal resumes existing goal without duplicate creation
runTest("TEST 3: Interrupted IN_PROGRESS goal reloads from disk and resumes without duplicate ID", () => {
  const file = createTempFile("test3-growth");
  try {
    const goalId = "skill:grpc-microservices";

    // Phase A: Process 1 starts goal
    {
      const store1 = new GrowthStateStore(file);
      store1.transitionGoal(goalId, "STARTED", { skill: "gRPC Microservices" });
      store1.transitionGoal(goalId, "IN_PROGRESS", { checkpoint: "step-3", itemsProcessed: 12 });
      assert.strictEqual(store1.listGoals().length, 1);
    }

    // Phase B: Process dies. Process 2 starts and reloads from disk
    {
      const store2 = new GrowthStateStore(file);
      const reloaded = store2.getGoal(goalId);
      assert(reloaded, "Goal must survive process restart");
      assert.strictEqual(reloaded.id, goalId);
      assert.strictEqual(reloaded.status, "IN_PROGRESS");
      assert.strictEqual(reloaded.checkpoint, "step-3");
      assert.strictEqual(reloaded.itemsProcessed, 12);
      assert.strictEqual(store2.listGoals().length, 1, "Must not create a duplicate goal");

      // Resumes seamlessly to completion
      store2.transitionGoal(goalId, "DONE", { reason: "Finished remaining steps" });
      assert.strictEqual(store2.getGoal(goalId).status, "DONE");
      assert.strictEqual(store2.state.metrics.goalsCompleted, 1);
    }
  } finally {
    cleanup(file);
  }
});

// TEST 4: Crash at FORM_FILLED is NOT treated as submitted on restart
runTest("TEST 4: Application interrupted at FORM_FILLED is NOT treated as submitted and is not skipped", () => {
  const file = createTempFile("test4-job");
  try {
    const oppKey = "upwork:job_123456";
    const appKey = `apply:${oppKey}`;

    // Process 1: generates documents and fills form, then crashes before submit
    {
      const store1 = new JobStateStore(file);
      store1.transitionApplication(appKey, "APPLICATION_READY", { opportunityKey: oppKey });
      store1.transitionApplication(appKey, "FORM_STARTED", { reason: "Form located" });
      store1.transitionApplication(appKey, "FORM_FILLED", { reason: "All fields populated" });
      assert.strictEqual(store1.state.metrics.submitted, 0);
      assert.strictEqual(store1.hasApplicationForOpportunity(oppKey), false, "FORM_FILLED must NOT satisfy duplicate skip gate");
    }

    // Process 2: restarts after crash
    {
      const store2 = new JobStateStore(file);
      assert.strictEqual(store2.hasApplicationForOpportunity(oppKey), false, "Reloaded FORM_FILLED must NOT be skipped");
      const app = store2.getApplicationForOpportunity(oppKey);
      assert(app, "Application must exist for reconciliation");
      assert.strictEqual(app.status, "FORM_FILLED");

      // Engine reconciles and submits
      store2.transitionApplication(appKey, "SUBMITTING");
      store2.transitionApplication(appKey, "SUBMITTED", { submittedAt: new Date().toISOString() });
      assert.strictEqual(store2.state.metrics.submitted, 1);
      assert.strictEqual(store2.hasApplicationForOpportunity(oppKey), true, "SUBMITTED satisfies duplicate gate");
    }
  } finally {
    cleanup(file);
  }
});

// TEST 5: Application at SUBMITTED on restart is not submitted twice
runTest("TEST 5: Application at SUBMITTED is recognized and moves to VERIFIED without duplicate submission", () => {
  const file = createTempFile("test5-job");
  try {
    const oppKey = "freelancer:proj_998877";
    const appKey = `apply:${oppKey}`;

    // Process 1 submits
    {
      const store1 = new JobStateStore(file);
      store1.transitionApplication(appKey, "SUBMITTED", { opportunityKey: oppKey });
      assert.strictEqual(store1.hasApplicationForOpportunity(oppKey), true);
      assert.strictEqual(store1.state.metrics.submitted, 1);
    }

    // Process 2 restarts
    {
      const store2 = new JobStateStore(file);
      assert.strictEqual(store2.hasApplicationForOpportunity(oppKey), true, "Must recognize opportunity as already submitted");

      // Verifies submission
      store2.transitionApplication(appKey, "VERIFIED", { verificationEvidence: "Application ID #5544 visibly present" });
      assert.strictEqual(store2.state.metrics.submitted, 1, "submitted count must remain 1");
      assert.strictEqual(store2.state.metrics.verified, 1, "verified count must become 1");
      assert.strictEqual(store2.hasApplicationForOpportunity(oppKey), true);
    }
  } finally {
    cleanup(file);
  }
});

// TEST 6: Illegal transition DONE -> PLANNED is rejected
runTest("TEST 6: Illegal transition DONE -> PLANNED is rejected; DONE remains DONE", () => {
  const file = createTempFile("test6-growth");
  try {
    const store = new GrowthStateStore(file);
    const goalId = "skill:system-design";

    store.transitionGoal(goalId, "STARTED", { skill: "System Design" });
    store.transitionGoal(goalId, "DONE");
    assert.strictEqual(store.getGoal(goalId).status, "DONE");

    assert.throws(() => {
      store.transitionGoal(goalId, "PLANNED");
    }, /cannot transition completed goal/i);

    // Ensure state remained DONE and was not corrupted
    assert.strictEqual(store.getGoal(goalId).status, "DONE");
  } finally {
    cleanup(file);
  }
});

// TEST 7: Duplicate identical transition produces exactly 1 completion event/metric
runTest("TEST 7: Duplicate transition (IN_PROGRESS -> DONE twice) fires completion metric exactly once", () => {
  const file = createTempFile("test7-growth");
  try {
    const store = new GrowthStateStore(file);
    const goalId = "skill:react-internals";

    store.transitionGoal(goalId, "STARTED", { skill: "React Internals" });
    store.transitionGoal(goalId, "IN_PROGRESS");

    // First completion
    store.transitionGoal(goalId, "DONE");
    assert.strictEqual(store.state.metrics.goalsCompleted, 1);

    // Duplicate completion
    store.transitionGoal(goalId, "DONE");
    assert.strictEqual(store.state.metrics.goalsCompleted, 1, "Duplicate DONE must not increment metric");
  } finally {
    cleanup(file);
  }
});

// TEST 8: Two start attempts for the same goal increment goalsStarted exactly once
runTest("TEST 8: Two start attempts for the same goal increment goalsStarted exactly once", () => {
  const file = createTempFile("test8-growth");
  try {
    const store = new GrowthStateStore(file);
    const goalId = "skill:database-indexing";

    store.transitionGoal(goalId, "STARTED", { skill: "Database Indexing" });
    assert.strictEqual(store.state.metrics.goalsStarted, 1);

    // Second start attempt (e.g. concurrent or repeated trigger)
    store.transitionGoal(goalId, "STARTED");
    assert.strictEqual(store.state.metrics.goalsStarted, 1, "goalsStarted must strictly remain 1");
  } finally {
    cleanup(file);
  }
});

// TEST 9: Invalid state transition fails safely without corrupting persistent state
runTest("TEST 9: Invalid state transition throws error and preserves persistent state integrity", () => {
  const file = createTempFile("test9-growth");
  try {
    const store = new GrowthStateStore(file);
    const goalId = "skill:k8s-operators";

    store.transitionGoal(goalId, "PLANNED", { skill: "Kubernetes Operators" });

    // Illegal jump: PLANNED cannot jump directly to DONE without execution
    assert.throws(() => {
      store.transitionGoal(goalId, "DONE");
    }, /illegal goal transition/i);

    // Verify disk state
    const diskContent = JSON.parse(fs.readFileSync(file, "utf8"));
    assert.strictEqual(diskContent.goals[goalId].status, "PLANNED", "Persistent state must remain PLANNED");
  } finally {
    cleanup(file);
  }
});

// TEST 10: History audit trail records all transitions without secrets
runTest("TEST 10: Transition history audit trail records transitions and excludes sensitive credentials", () => {
  const file = createTempFile("test10-growth");
  try {
    const store = new GrowthStateStore(file);
    const goalId = "skill:crypto-rng";

    store.transitionGoal(goalId, "PLANNED", { reason: "Initial curriculum registration" });
    store.transitionGoal(goalId, "STARTED", { reason: "Platform session opened" });
    store.transitionGoal(goalId, "IN_PROGRESS", { reason: "Solved 3/5 challenge problems" });
    store.transitionGoal(goalId, "DONE", { reason: "100% test coverage verified" });

    const goal = store.getGoal(goalId);
    assert(Array.isArray(goal.history), "history must be an array");
    assert.strictEqual(goal.history.length, 4);
    assert.strictEqual(goal.history[0].to, "PLANNED");
    assert.strictEqual(goal.history[1].to, "STARTED");
    assert.strictEqual(goal.history[2].to, "IN_PROGRESS");
    assert.strictEqual(goal.history[3].to, "DONE");

    // Verify no secret leak in history serialization
    const serialized = JSON.stringify(goal.history);
    assert(!serialized.includes("password") && !serialized.includes("secret") && !serialized.includes("token"));
  } finally {
    cleanup(file);
  }
});

console.log("\n--------------------------------------------------");
console.log(`Results: ${passed} Passed, ${failed} Failed`);
console.log("--------------------------------------------------\n");

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
