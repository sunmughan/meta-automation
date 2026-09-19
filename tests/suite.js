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

  // 19. Celebrity / Pop culture / Birthday post (Strict Disqualification)
  test("19. Celebrity / Birthday post", () => {
    const post = { text: "HAPPY BIRTHDAY BEY", username: "ckennie4" };
    const res = intentClassifier.classify(post);
    assert.strictEqual(res.qualified, false, "Must be disqualified");
    assert.strictEqual(res.lead_type, "IRRELEVANT", "Must be classified as IRRELEVANT");
    assert.strictEqual(res.should_reply, false, "Must never reply to celebrity posts");
  });

  // 20. Personal travel / Vacation / Beach video (Strict Disqualification)
  test("20. Vacation / Beach video post", () => {
    const post = { text: "Walking around the beach enjoying the sunset at Baga", username: "veehans5" };
    const res = intentClassifier.classify(post);
    assert.strictEqual(res.qualified, false, "Must be disqualified");
    assert.strictEqual(res.should_reply, false, "Must never reply to vacation/lifestyle posts");
  });

  // 21. Service provider promotional hook (e.g. moazali06)
  test("21. Service provider promotional hook", () => {
    const post = {
      text: "Building something for your business?\nNeed a website, custom software, mobile app or Ai integration?\nI can help turn the idea into something that actually works.\nDM me - Let's talk. 🚀",
      username: "moazali06"
    };
    const res = intentClassifier.classify(post);
    assert.strictEqual(res.qualified, false, "Must be disqualified as service provider");
    assert.strictEqual(res.lead_type, "SERVICE_PROVIDER", "Must be classified as SERVICE_PROVIDER");
    assert.strictEqual(res.should_reply, false, "Must never pitch to service providers");
  });

  // 22. Freelancer portfolio showcase
  test("22. Freelancer portfolio showcase", () => {
    const post = { text: "Built this modern dashboard for a client in Next.js and Tailwind. Check out my portfolio in bio! Taking on new clients.", username: "freelancer_dev" };
    const res = intentClassifier.classify(post);
    assert.strictEqual(res.qualified, false, "Must be disqualified");
    assert.strictEqual(res.lead_type, "SERVICE_PROVIDER", "Must be classified as SERVICE_PROVIDER");
    assert.strictEqual(res.should_reply, false, "Must never reply to portfolio showcase");
  });

  // 23. True buyer requesting developer proposals
  test("23. True buyer requesting developer proposals", () => {
    const post = { text: "Need an app developer to create a learning app. Please dm me your portfolio and approximate charges.", username: "akashualmarketer" };
    const res = intentClassifier.classify(post);
    assert.strictEqual(res.qualified, true, "Must be qualified");
    assert.strictEqual(res.is_genuine_buyer, true, "Must be genuine buyer");
    assert.strictEqual(res.lead_type, "PROJECT_BUYER", "Must be PROJECT_BUYER");
    assert.strictEqual(res.should_reply, true, "Should reply to genuine buyer");
  });

  // 24. True buyer with budget requesting website build
  test("24. True buyer with budget requesting website build", () => {
    const post = { text: "Urgently in search of a web developer. I need to build a website for my newly opened jewellery business. Budget is $1700-$2000.", username: "aditijain" };
    const res = intentClassifier.classify(post);
    assert.strictEqual(res.qualified, true, "Must be qualified");
    assert.strictEqual(res.is_genuine_buyer, true, "Must be genuine buyer");
    assert(res.matchedCategories.includes("Web Development"), "Must match Web Development");
  });

  // 25. Substring safety: Post mentioning 'paid' does not trigger AI comment
  test("25. Substring safety for Mobile vs AI", () => {
    const postText = "Need a mobile app developer for immediate client projects. Paid opportunities available.";
    const comment = commentGenerator.generateEngagingComment({
      text: postText,
      username: "client_lead",
      matchedCategories: ["Mobile Development"],
      identity: "COMPANY"
    });
    assert(!comment.toLowerCase().includes("multi-agent"), "Comment must NOT mention multi-agent systems");
    assert(!comment.toLowerCase().includes("document triage"), "Comment must NOT mention document triage");
    assert(comment.toLowerCase().includes("mobile") || comment.toLowerCase().includes("flutter") || comment.toLowerCase().includes("app"), "Comment must focus on mobile apps");
  });

  // 26. Project Hiring Request: "We're hiring a web developer to build our website"
  test("26. Project hiring request qualifies as PROJECT_BUYER", () => {
    const post = { text: "We're hiring a web developer to build our new e-commerce store. DM your portfolio!", username: "founder_sam" };
    const res = intentClassifier.classify(post);
    assert.strictEqual(res.qualified, true, "Must be qualified as buyer lead");
    assert.strictEqual(res.is_genuine_buyer, true, "Must be genuine buyer");
    assert.strictEqual(res.lead_type, "PROJECT_BUYER", "Lead type must be PROJECT_BUYER");
    assert(res.matchedCategories.includes("Web Development"), "Must match Web Development");
  });

  // 27. Corporate Recruitment vs Project Hiring Distinction
  test("27. Corporate recruitment with CV/resume is strictly disqualified", () => {
    const post = { text: "We are hiring a backend engineer. Please submit your CV to careers@megacorp.com", username: "hr_recruiter" };
    const res = intentClassifier.classify(post);
    assert.strictEqual(res.qualified, false, "Corporate job ads must be disqualified");
    assert.strictEqual(res.lead_type, "RECRUITMENT", "Lead type must be RECRUITMENT");
    assert.strictEqual(res.should_reply, false, "Should not reply to corporate recruitment");
  });

  // 28. Dedicated Hospitality & Hotel Systems (PixelGo HMS)
  test("28. Dedicated hospitality & hotel system matching", () => {
    const post = { text: "Looking for a developer to build a hotel reservation and PMS system for our resort.", username: "resort_manager" };
    const res = intentClassifier.classify(post);
    assert.strictEqual(res.qualified, true, "Hospitality lead must be qualified");
    assert(res.matchedCategories.includes("Hospitality"), "Must match Hospitality category");

    const comment = commentGenerator.generateEngagingComment({
      text: post.text,
      username: post.username,
      matchedCategories: res.matchedCategories,
      identity: "COMPANY"
    });

    const pixelGoCount = (comment.match(/pixelgo\.live/g) || []).length;
    const codeAirCount = (comment.match(/codeair\.tech/g) || []).length;
    assert.strictEqual(pixelGoCount, 1, "pixelgo.live must appear EXACTLY ONCE for hospitality post");
    assert.strictEqual(codeAirCount, 1, "codeair.tech must appear EXACTLY ONCE");
    assert(comment.toLowerCase().includes("pixelgo hms"), "Must mention PixelGo HMS");
  });

  // 29. Strict PixelGo HMS Isolation (Never leaks into non-hospitality posts)
  test("29. PixelGo HMS never leaks into non-hospitality posts", () => {
    const nonHospitalityTexts = [
      "Need someone to build a website for my business",
      "Looking for a Flutter mobile app developer",
      "Need an AI chatbot for customer support",
      "Building a multi-tenant SaaS platform",
      "Need a custom CRM and admin dashboard",
      "Need a clinic management system for patient records"
    ];

    for (const txt of nonHospitalityTexts) {
      const comment = commentGenerator.generateEngagingComment({
        text: txt,
        username: "client",
        matchedCategories: ["Web Development", "Business Systems"],
        identity: "COMPANY"
      });
      assert(!comment.includes("pixelgo.live"), `pixelgo.live leaked into non-hospitality post: ${txt}`);
      assert(!comment.toLowerCase().includes("pixelgo hms"), `PixelGo HMS leaked into non-hospitality post: ${txt}`);
    }
  });

  // 30. Single URL Mention Rule across all categories
  test("30. https://www.codeair.tech appears EXACTLY ONCE across all comment variations", () => {
    const sampleCategories = [
      ["Web Development"],
      ["Mobile Development"],
      ["AI & Automation"],
      ["SaaS development"],
      ["Business Systems"],
      ["Backend & APIs"],
      []
    ];

    for (const cats of sampleCategories) {
      for (let v = 0; v < 10; v++) {
        const comment = commentGenerator.generateEngagingComment({
          text: "Need someone to build our project",
          username: `lead_${v}`,
          matchedCategories: cats,
          identity: "COMPANY"
        });
        const count = (comment.match(/codeair\.tech/g) || []).length;
        assert.strictEqual(count, 1, `codeair.tech appeared ${count} times (expected exactly 1) in: ${comment}`);
      }
    }
  });

  // 31. Agentic AI Screening evaluates ambiguous posts semantically
  await test("31. Agentic AI Screening qualifies genuine buyer intent on ambiguous posts", async () => {
    const post = {
      text: "Can someone help build a responsive mobile app for our local startup? We have designs ready.",
      username: "tech_founder_99",
      postId: "test_ambig_1"
    };
    const decision = await aiDecisionEngine.qualifyPost(post);
    assert.strictEqual(decision.is_genuine_buyer, true, "AI screening must detect genuine buyer");
    assert.strictEqual(decision.should_reply, true, "AI screening must decide to reply");
    assert.strictEqual(decision.temperature, "HOT", "Must be HOT lead");
    assert(decision.generated_comment.length > 50, "Must synthesize engaging comment");
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
  await (require("./cross-platform-audit").runCrossPlatformAudit());

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
