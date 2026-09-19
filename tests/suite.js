/**
 * tests/suite.js
 * Comprehensive automated test suite for CodeAir Threads + Instagram System.
 * Tests all 18 required scenarios:
 *  1. Genuine website buyer
 *  2. Genuine SaaS buyer
 *  3. Genuine AI automation buyer
 *  4. Genuine CRM buyer
 *  5. Recruitment post
 *  6. Job seeker
 *  7. Service provider
 *  8. Graphic design request
 *  9. Unrelated post
 * 10. Founder question
 * 11. Company question
 * 12. Founder LinkedIn request
 * 13. Company LinkedIn request
 * 14. Duplicate comment attempt
 * 15. Duplicate DM attempt
 * 16. Existing conversation continuation
 * 17. CodeAir service mismatch
 * 18. Neutral technical discussion
 */

const assert = require("assert");
const intentClassifier = require("../src/leads/intent-classifier");
const serviceMatcher = require("../src/leads/service-matcher");
const identityResolver = require("../src/conversations/identity-resolver");
const commentGenerator = require("../src/engagement/comment-generator");
const aiDecisionEngine = require("../src/ai/ai-decision-engine");
const knowledge = require("../src/knowledge/knowledge-engine");
const duplicateGuard = require("../src/safety/duplicate-guard");
const stateStore = require("../src/storage/state-store");

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  \x1b[32m✓ PASS\x1b[0m: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  \x1b[31m✗ FAIL\x1b[0m: ${name}`);
    console.error(`    Error: ${err.message}`);
    failed++;
  }
}

async function runAllTests() {
  console.log("\n==================================================");
  console.log("  CODEAIR AUTOMATION SUITE: 18 SCENARIO AUDIT");
  console.log("==================================================\n");

  // 1. Genuine website buyer
  test("1. Genuine website buyer", () => {
    const post = { text: "I need someone to build a website for my store.", username: "alice" };
    const res = intentClassifier.classify(post);
    assert.strictEqual(res.qualified, true, "Must be qualified");
    assert.strictEqual(res.is_genuine_buyer, true, "Must be genuine buyer");
    assert.strictEqual(res.temperature, "HOT", "Must be HOT");
    assert(res.matchedCategories.includes("Web Development"), "Must match Web Development");

    const comment = commentGenerator.generateEngagingComment({
      text: post.text,
      matchedCategories: res.matchedCategories,
      identity: "COMPANY"
    });
    assert(comment.length > 50, "Comment must be detailed and engaging");
  });

  // 2. Genuine SaaS buyer
  test("2. Genuine SaaS buyer", () => {
    const post = { text: "We're looking for a developer to build our SaaS platform.", username: "bob" };
    const res = intentClassifier.classify(post);
    assert.strictEqual(res.qualified, true, "Must be qualified");
    assert.strictEqual(res.is_genuine_buyer, true, "Must be genuine buyer");
    assert(res.matchedCategories.includes("Web Development"), "Must match SaaS/Web");

    const identity = identityResolver.resolveIdentity({ message: post.text, originalPost: post.text });
    assert.strictEqual(identity.identity, "COMPANY", "Identity must be COMPANY");
  });

  // 3. Genuine AI automation buyer
  test("3. Genuine AI automation buyer", () => {
    const post = { text: "We need to automate customer support using AI.", username: "charlie" };
    const res = intentClassifier.classify(post);
    assert.strictEqual(res.qualified, true, "Must be qualified");
    assert(res.matchedCategories.includes("AI & Automation"), "Must match AI & Automation");

    const identity = identityResolver.resolveIdentity({ message: post.text, originalPost: post.text });
    assert.strictEqual(identity.identity, "COMPANY", "Identity must be COMPANY");

    const comment = commentGenerator.generateEngagingComment({
      text: post.text,
      matchedCategories: res.matchedCategories,
      identity: "COMPANY"
    });
    assert(comment.toLowerCase().includes("support") || comment.toLowerCase().includes("workflow"), "Comment must address AI support");
  });

  // 4. Genuine CRM buyer
  test("4. Genuine CRM buyer", () => {
    const post = { text: "Looking for someone to build a custom CRM system for our sales team.", username: "david" };
    const res = intentClassifier.classify(post);
    assert.strictEqual(res.qualified, true, "Must be qualified");
    assert(res.matchedCategories.includes("Business Systems"), "Must match Business Systems");
  });

  // 5. Recruitment post
  test("5. Recruitment post", () => {
    const post = { text: "We're hiring a senior Node.js developer. Apply here or send your CV to careers@example.com", username: "recruiter1" };
    const res = intentClassifier.classify(post);
    assert.strictEqual(res.qualified, false, "Must be disqualified");
    assert.strictEqual(res.lead_type, "RECRUITMENT", "Lead type must be RECRUITMENT");
    assert.strictEqual(res.should_reply, false, "Should not reply");
  });

  // 6. Job seeker
  test("6. Job seeker", () => {
    const post = { text: "Open to work as a React developer. Available for remote opportunities.", username: "jobseeker1" };
    const res = intentClassifier.classify(post);
    assert.strictEqual(res.qualified, false, "Must be disqualified");
    assert.strictEqual(res.lead_type, "JOB_SEEKER", "Lead type must be JOB_SEEKER");
    assert.strictEqual(res.should_reply, false, "Should not reply");
  });

  // 7. Service provider
  test("7. Service provider", () => {
    const post = { text: "I'm a freelance AI developer and I'm taking new clients for projects. DM me if you need an app.", username: "dev_seller" };
    const res = intentClassifier.classify(post);
    assert.strictEqual(res.qualified, false, "Must be disqualified");
    assert.strictEqual(res.lead_type, "SERVICE_PROVIDER", "Lead type must be SERVICE_PROVIDER");
    assert.strictEqual(res.should_reply, false, "Should not reply");
  });

  // 8. Graphic design request
  test("8. Graphic design request", () => {
    const post = { text: "I need a logo designer for my new brand. Anyone available?", username: "design_buyer" };
    const res = intentClassifier.classify(post);
    assert.strictEqual(res.qualified, false, "Must be disqualified");
    assert.strictEqual(res.lead_type, "OUT_OF_SCOPE", "Must be OUT_OF_SCOPE");
    assert.strictEqual(res.should_reply, false, "Should not reply to graphic/logo design");
  });

  // 9. Unrelated post
  test("9. Unrelated post", () => {
    const post = { text: "Beautiful sunset today at the beach with friends!", username: "casual_user" };
    const res = intentClassifier.classify(post);
    assert.strictEqual(res.qualified, false, "Must be disqualified");
    assert.strictEqual(res.should_reply, false, "Should not reply");
  });

  // 10. Founder question
  test("10. Founder question", () => {
    const text = "Who is behind CodeAir?";
    const identity = identityResolver.resolveIdentity({ message: text });
    assert.strictEqual(identity.identity, "FOUNDER", "Identity must be FOUNDER");
  });

  // 11. Company question
  test("11. Company question", () => {
    const text = "What does CodeAir do?";
    const identity = identityResolver.resolveIdentity({ message: text });
    assert.strictEqual(identity.identity, "COMPANY", "Identity must be COMPANY");
  });

  // 12. Founder LinkedIn request
  test("12. Founder LinkedIn request", () => {
    const text = "What is your LinkedIn profile?";
    const link = knowledge.resolveRequestedLink(text);
    assert(link !== null, "Link must be resolved");
    assert.strictEqual(link.target, "FOUNDER", "Target must be FOUNDER");
    assert.strictEqual(link.url, "https://linkedin.com/in/sunmughan", "Must return exact approved founder LinkedIn");
  });

  // 13. Company LinkedIn request
  test("13. Company LinkedIn request", () => {
    const text = "What is CodeAir's LinkedIn page?";
    const link = knowledge.resolveRequestedLink(text);
    assert(link !== null, "Link must be resolved");
    assert.strictEqual(link.target, "COMPANY", "Target must be COMPANY");
    assert.strictEqual(link.url, "https://linkedin.com/company/codeairofficial", "Must return exact approved company LinkedIn");
  });

  // 14. Duplicate comment attempt
  test("14. Duplicate comment attempt", () => {
    const postId = `test_post_dedup_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const commentText = `Detailed technical question for dedup test ${postId}`;
    const check1 = duplicateGuard.canExecute({ platform: "threads", actionType: "COMMENT", targetId: postId, text: commentText });
    assert.strictEqual(check1.allowed, true, "First comment must be allowed");

    duplicateGuard.recordExecuted({ platform: "threads", actionType: "COMMENT", targetId: postId, text: commentText, username: "user1" });

    const check2 = duplicateGuard.canExecute({ platform: "threads", actionType: "COMMENT", targetId: postId, text: "Second comment attempt" });
    assert.strictEqual(check2.allowed, false, "Second comment on same post must be blocked");
    assert(check2.reason.includes("Already commented"), "Reason must mention duplicate");
  });

  // 15. Duplicate DM attempt
  test("15. Duplicate DM attempt", () => {
    const dmId = `test_dm_dedup_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const dmText = `Contextual answer for DM dedup test ${dmId}`;
    const check1 = duplicateGuard.canExecute({ platform: "threads", actionType: "DM", targetId: dmId, text: dmText });
    assert.strictEqual(check1.allowed, true, "First DM must be allowed");

    duplicateGuard.recordExecuted({ platform: "threads", actionType: "DM", targetId: dmId, text: dmText, username: "prospect1" });

    const check2 = duplicateGuard.canExecute({ platform: "threads", actionType: "DM", targetId: dmId, text: "DM answer retry" });
    assert.strictEqual(check2.allowed, false, "Second DM reply to same message must be blocked");
  });

  // 16. Existing conversation continuation
  test("16. Existing conversation continuation", () => {
    const convId = `test_conv_${Date.now()}`;
    stateStore.saveConversation({
      platform: "threads",
      conversationId: convId,
      user: "prospect99",
      username: "prospect99",
      conversationStage: "DISCOVERY",
      originalPost: "Need an iOS and Android app for fitness tracking."
    });

    const conv = stateStore.getConversation(convId, "threads");
    assert.strictEqual(conv.conversationStage, "DISCOVERY", "Stage must be preserved");

    // Advance stage
    stateStore.saveConversation({
      platform: "threads",
      conversationId: convId,
      conversationStage: "SOLUTION",
      lastResponse: "We build custom Flutter cross-platform applications."
    });

    const updated = stateStore.getConversation(convId, "threads");
    assert.strictEqual(updated.conversationStage, "SOLUTION", "Stage must advance to SOLUTION");
    assert.strictEqual(updated.lastResponse, "We build custom Flutter cross-platform applications.");
  });

  // 17. CodeAir service mismatch
  test("17. CodeAir service mismatch", () => {
    const post = { text: "Need someone to do accounting and tax filing for our business.", username: "biz_owner" };
    const res = intentClassifier.classify(post);
    assert.strictEqual(res.qualified, false, "Must be disqualified");
    assert.strictEqual(res.should_reply, false, "Should not reply to accounting service");
  });

  // 18. Neutral technical discussion
  test("18. Neutral technical discussion", () => {
    const post = { text: "What's the best architecture for a multi-tenant SaaS? Pros and cons of shared vs separate databases?", username: "architect1" };
    const identity = identityResolver.resolveIdentity({ message: post.text, originalPost: post.text });
    assert.strictEqual(identity.identity, "NEUTRAL", "Must select NEUTRAL identity for general technical discussion");
  });

  // Clean up any test actions recorded in stateStore so they never pollute production rate limiter
  for (const [k, v] of Object.entries(stateStore.state.actions || {})) {
    if (v.targetId && v.targetId.startsWith("test_")) {
      delete stateStore.state.actions[k];
    }
  }
  stateStore.saveState();

  console.log("\n--------------------------------------------------");
  console.log(`Test Results: ${passed} Passed, ${failed} Failed`);
  console.log("--------------------------------------------------\n");

  await (require("./pillar-and-search-audit").runAudit());

  if (failed > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  runAllTests().catch(err => {
    console.error("Test runner crashed:", err);
    process.exit(1);
  });
}

module.exports = { runAllTests };
