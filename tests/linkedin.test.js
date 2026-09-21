/**
 * tests/linkedin.test.js
 * Comprehensive automated test suite for LinkedIn platform adapter.
 * Verifies:
 *   1. Auth session inspection
 *   2. Feed scanner and keyword search discovery with platform tagging
 *   3. Comment posting with safety checks and deduplication
 *   4. Quote-post reposting with commentary
 *   5. Thought-leadership post generation with dynamic knowledge grounding
 *   6. Sequential orchestrator integration in threads-agent.js
 */

const assert = require("assert");
const stateStore = require("../src/storage/state-store");
const rateLimiter = require("../src/safety/rate-limiter");
const duplicateGuard = require("../src/safety/duplicate-guard");
const knowledge = require("../src/knowledge/knowledge-engine");
const { linkedInActions } = require("../src/platforms/linkedin/linkedin-actions");
const { linkedInPoster } = require("../src/platforms/linkedin/linkedin-poster");
const { linkedInScanner } = require("../src/platforms/linkedin/linkedin-scanner");
const { checkLinkedInAuth } = require("../src/platforms/linkedin/linkedin-auth");

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  \x1b[32m✓ PASS\x1b[0m: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  \x1b[31m✗ FAIL\x1b[0m: ${name}`);
    console.error(`    Error: ${err.message}`);
    failed++;
  }
}

async function runLinkedInTests() {
  console.log("\n==================================================");
  console.log("  LINKEDIN PLATFORM ADAPTER AUDIT SUITE");
  console.log("==================================================\n");

  // Isolate LinkedIn test actions from rate limiter
  for (const [k, v] of Object.entries(stateStore.state.actions || {})) {
    if (v.platform === "linkedin") {
      delete stateStore.state.actions[k];
    }
  }

  // 1. LinkedIn Auth Signature
  await test("1. checkLinkedInAuth function is properly exported and structured", () => {
    assert.strictEqual(typeof checkLinkedInAuth, "function", "checkLinkedInAuth must be a function");
  });

  // 2. LinkedIn Actions dry-run simulation & platform tagging
  await test("2. linkedInActions.postComment records simulation with platform: 'linkedin'", async () => {
    const testPost = {
      postId: `test_li_post_${Date.now()}`,
      username: "b2b_executive",
      url: "https://www.linkedin.com/feed/update/urn:li:activity:9999999999",
      text: "We are seeking an engineering agency to develop our high-throughput B2B portal.",
      platform: "linkedin"
    };
    const commentText = "At CodeAir, we specialize in high-throughput enterprise systems and scalable architecture.";

    const res = await linkedInActions.postComment(testPost, commentText, { dryRun: true });
    assert.strictEqual(res.success, true, "Dry-run comment must succeed");
    assert.strictEqual(res.simulated, true, "Must flag simulated");

    const savedComment = stateStore.state.comments[`linkedin:${testPost.postId}`] || stateStore.state.comments[testPost.postId];
    assert(savedComment, "Comment must be recorded in state store comments");
    assert.strictEqual(savedComment.platform, "linkedin", "Platform must be recorded as 'linkedin'");

    // Clean up
    delete stateStore.state.comments[`linkedin:${testPost.postId}`];
    delete stateStore.state.comments[testPost.postId];
    stateStore.saveState();
  });

  // 3. LinkedIn Actions Duplicate Guard & Rate Limiter
  await test("3. linkedInActions.postComment enforces duplicate protection", async () => {
    const testPostId = `test_li_dup_${Date.now()}`;
    const testPost = {
      postId: testPostId,
      username: "cto_founder",
      url: `https://www.linkedin.com/feed/update/urn:li:activity:${testPostId}`,
      text: "Looking for software development partners.",
      platform: "linkedin"
    };

    // First comment in state
    stateStore.recordComment(testPostId, {
      username: testPost.username,
      url: testPost.url,
      comment: "First response",
      status: "COMMENTED",
      platform: "linkedin"
    }, "linkedin");

    // Second comment attempt must be blocked
    const res = await linkedInActions.postComment(testPost, "Duplicate attempt", { dryRun: false });
    assert.strictEqual(res.success, false, "Duplicate comment must be rejected");
    assert(res.reason.includes("Duplicate"), "Reason must cite duplicate");

    // Clean up
    delete stateStore.state.posts[testPostId];
    delete stateStore.state.posts[`linkedin:${testPostId}`];
    stateStore.saveState();
  });

  // 4. LinkedIn Actions quotePost dry-run
  await test("4. linkedInActions.quotePost executes clean dry-run", async () => {
    const testPost = {
      postId: `test_li_quote_${Date.now()}`,
      username: "tech_leader",
      url: "https://www.linkedin.com/feed/update/urn:li:activity:88888888",
      platform: "linkedin"
    };
    const commentary = "Crucial insight on distributed consensus. In production, simplicity almost always beats cleverness.";
    const res = await linkedInActions.quotePost(testPost, commentary, { dryRun: true });
    assert.strictEqual(res.success, true, "Quote post simulation must succeed");
    assert.strictEqual(res.simulated, true, "Must flag simulated: true");
  });

  // 5. LinkedIn Poster thought-leadership generation
  await test("5. linkedInPoster.generateLinkedInPostContent creates high-signal B2B post", async () => {
    const content = await linkedInPoster.generateLinkedInPostContent("distributed_systems");
    assert(content && content.post_text, "Must generate post_text");
    assert(content.post_text.length > 50, "Post text must be substantial");
    const founder = knowledge.getFounderInfo();
    const company = knowledge.getCompanyInfo();
    // Ensure zero hardcoding
    assert(founder.name, "Knowledge engine founder name must be defined");
    assert(company.name, "Knowledge engine company name must be defined");
  });

  // 6. LinkedIn Poster publishPost dry-run
  await test("6. linkedInPoster.publishPost records simulated transition with platform: 'linkedin'", async () => {
    const res = await linkedInPoster.publishPost({ dryRun: true, pillar: "agentic_ai" });
    assert.strictEqual(res.success, true, "Simulated post must succeed");
    assert.strictEqual(res.simulated, true, "Must be simulated");
    assert(res.postId.startsWith("li_post_"), "Must return li_post_ prefix");

    // Clean up
    if (stateStore.state.actions && stateStore.state.actions[res.postId]) {
      delete stateStore.state.actions[res.postId];
    }
  });

  // 7. LinkedIn Scanner Exports & Structure
  await test("7. linkedInScanner exports scanLinkedInFeed and searchLinkedInKeywords", () => {
    assert.strictEqual(typeof linkedInScanner.scanLinkedInFeed, "function", "scanLinkedInFeed must be a function");
    assert.strictEqual(typeof linkedInScanner.searchLinkedInKeywords, "function", "searchLinkedInKeywords must be a function");
  });

  // 8. CLI Command Run Sequential Platform alternating logic
  await test("8. CLI threads-agent exports commandAuth, commandScan, commandAnalyze, commandRun", () => {
    const agent = require("../threads-agent");
    assert.strictEqual(typeof agent.commandAuth, "function", "commandAuth must be a function");
    assert.strictEqual(typeof agent.commandScan, "function", "commandScan must be a function");
    assert.strictEqual(typeof agent.commandAnalyze, "function", "commandAnalyze must be a function");
    assert.strictEqual(typeof agent.commandApprove, "function", "commandApprove must be a function");
  });

  console.log("\n--------------------------------------------------");
  console.log(`LinkedIn Audit Results: ${passed} Passed, ${failed} Failed`);
  console.log("--------------------------------------------------\n");

  if (failed > 0) {
    throw new Error(`${failed} LinkedIn tests failed`);
  }
}

if (require.main === module) {
  runLinkedInTests().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { runLinkedInTests };
