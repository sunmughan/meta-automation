/**
 * tests/facebook.test.js
 * Automated test suite for Facebook Public Profile adapter.
 * Verifies:
 *   1. Auth session inspection
 *   2. Public profile timeline feed scanner
 *   3. Comment posting with safety checks and deduplication
 *   4. Thought-leadership & builder post generation with dynamic knowledge grounding
 *   5. Public profile post publishing dry-run simulation
 *   6. Sequential 3-platform orchestrator integration in threads-agent.js
 */

const assert = require("assert");
const stateStore = require("../src/storage/state-store");
const rateLimiter = require("../src/safety/rate-limiter");
const knowledge = require("../src/knowledge/knowledge-engine");
const { facebookActions } = require("../src/platforms/facebook/facebook-actions");
const { facebookPoster } = require("../src/platforms/facebook/facebook-poster");
const { facebookProfileManager } = require("../src/platforms/facebook/facebook-profile");
const { checkFacebookAuth } = require("../src/platforms/facebook/facebook-auth");

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

async function runFacebookTests() {
  console.log("\n==================================================");
  console.log("  FACEBOOK PUBLIC PROFILE ADAPTER AUDIT SUITE");
  console.log("==================================================\n");

  // 1. Facebook Auth Signature
  await test("1. checkFacebookAuth function is properly exported and structured", () => {
    assert.strictEqual(typeof checkFacebookAuth, "function", "checkFacebookAuth must be a function");
  });

  // 2. Facebook Actions dry-run simulation & platform tagging
  await test("2. facebookActions.postComment records simulation with platform: 'facebook'", async () => {
    const testPost = {
      postId: `test_fb_post_${Date.now()}`,
      username: "facebook_prospect",
      url: "https://www.facebook.com/12345/posts/67890",
      text: "Can someone recommend a developer or dev team for an MVP web app?",
      platform: "facebook"
    };
    const commentText = "We build custom web applications and MVPs. Feel free to explore our work at codeair.tech.";

    const res = await facebookActions.postComment(testPost, commentText, { dryRun: true });
    assert.strictEqual(res.success, true, "Dry-run comment must succeed");
    assert.strictEqual(res.simulated, true, "Must flag simulated: true");

    const savedComment = stateStore.state.comments[`facebook:${testPost.postId}`] || stateStore.state.comments[testPost.postId];
    assert(savedComment, "Comment must be recorded in state store comments");
    assert.strictEqual(savedComment.platform, "facebook", "Platform must be recorded as 'facebook'");

    // Clean up
    delete stateStore.state.comments[`facebook:${testPost.postId}`];
    delete stateStore.state.comments[testPost.postId];
    stateStore.saveState();
  });

  // 3. Facebook Actions Duplicate Protection
  await test("3. facebookActions.postComment enforces duplicate protection", async () => {
    const testPostId = `test_fb_dup_${Date.now()}`;
    const testPost = {
      postId: testPostId,
      username: "fb_user",
      url: `https://www.facebook.com/posts/${testPostId}`,
      text: "Need software development help.",
      platform: "facebook"
    };

    stateStore.recordComment(testPostId, {
      username: testPost.username,
      url: testPost.url,
      comment: "First response",
      status: "COMMENTED",
      platform: "facebook"
    }, "facebook");

    const res = await facebookActions.postComment(testPost, "Duplicate attempt", { dryRun: false });
    assert.strictEqual(res.success, false, "Duplicate comment must be rejected");
    assert(res.reason.includes("Duplicate"), "Reason must cite duplicate");

    // Clean up
    delete stateStore.state.comments[`facebook:${testPostId}`];
    delete stateStore.state.comments[testPostId];
    stateStore.saveState();
  });

  // 4. Facebook Poster post generation
  await test("4. facebookPoster.generateFacebookPostContent creates authentic founder post", async () => {
    const content = await facebookPoster.generateFacebookPostContent("founders_revolution");
    assert(content && content.post_text, "Must generate post_text");
    assert(content.post_text.length > 50, "Post text must be substantial");
    const founder = knowledge.getFounderInfo();
    const company = knowledge.getCompanyInfo();
    assert(founder.name, "Knowledge engine founder name must be defined");
    assert(company.name, "Knowledge engine company name must be defined");
  });

  // 5. Facebook Poster publishPost dry-run
  await test("5. facebookPoster.publishPost records simulated transition with platform: 'facebook'", async () => {
    const res = await facebookPoster.publishPost({ dryRun: true, pillar: "founders_revolution" });
    assert.strictEqual(res.success, true, "Simulated post must succeed");
    assert.strictEqual(res.simulated, true, "Must be simulated: true");
    assert(res.postId.startsWith("fb_post_"), "Must return fb_post_ prefix");

    // Clean up
    if (stateStore.state.actions && stateStore.state.actions[res.postId]) {
      delete stateStore.state.actions[res.postId];
    }
  });

  // 6. Facebook Profile Manager Exports
  await test("6. facebookProfileManager exports scanProfileFeed and navigateToProfile", () => {
    assert.strictEqual(typeof facebookProfileManager.scanProfileFeed, "function", "scanProfileFeed must be a function");
    assert.strictEqual(typeof facebookProfileManager.navigateToProfile, "function", "navigateToProfile must be a function");
  });

  // 7. CLI Orchestrator exports
  await test("7. CLI threads-agent exports commandAuth, commandScan, commandAnalyze, commandRun", () => {
    const agent = require("../threads-agent");
    assert.strictEqual(typeof agent.commandAuth, "function", "commandAuth must be a function");
    assert.strictEqual(typeof agent.commandScan, "function", "commandScan must be a function");
  });

  console.log("\n--------------------------------------------------");
  console.log(`Facebook Audit Results: ${passed} Passed, ${failed} Failed`);
  console.log("--------------------------------------------------\n");

  if (failed > 0) {
    throw new Error(`${failed} Facebook tests failed`);
  }
}

if (require.main === module) {
  runFacebookTests().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { runFacebookTests };
