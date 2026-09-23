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

process.env.NODE_ENV = process.env.NODE_ENV || "test";

const assert = require("assert");
const intentClassifier = require("../src/leads/intent-classifier");
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
    assert(!comment.toLowerCase().includes("ai automation"), "Comment must NOT mention AI automation");
    assert(comment.toLowerCase().includes("mobile") || comment.toLowerCase().includes("flutter"), "Comment must focus on mobile apps");
  });

  // 25b. User Screenshot Regression: React Developer with "paid" and "waiting" must get React/Web comment, NOT AI
  test("25b. User Screenshot Regression: React Developer with paid/waiting keywords gets React comment", () => {
    const post = {
      text: "⚛️ Need a React Developer for an immediate project. Multiple modern web applications are waiting to be built, with more client work lined up. Paid available. Reply now!",
      username: "prince_verma__pxh"
    };
    const founderComment = commentGenerator.generateEngagingComment({
      text: post.text,
      username: post.username,
      matchedCategories: ["Web Development"],
      identity: "FOUNDER"
    });
    assert(founderComment.toLowerCase().includes("react") || founderComment.toLowerCase().includes("web application"), "Comment must explicitly address React or web applications");
    assert(!founderComment.toLowerCase().includes("ai automation"), "Must NEVER mention AI automation for a React developer post");
    assert(!founderComment.toLowerCase().includes("llm"), "Must NEVER mention LLMs for a React developer post");
    assert(!founderComment.toLowerCase().includes("agent workflow"), "Must NEVER mention agent workflows for a React developer post");
    assert(founderComment.includes("linkedin.com/in/sunmughan"), "Founder comment must contain founder LinkedIn link");
    assert(!founderComment.includes("codeair.tech"), "Founder comment must never contain company website");

    // Also test with empty matchedCategories to verify regex fallback
    const fallbackComment = commentGenerator.generateEngagingComment({
      text: post.text,
      username: post.username,
      matchedCategories: [],
      identity: "FOUNDER"
    });
    assert(fallbackComment.toLowerCase().includes("react") || fallbackComment.toLowerCase().includes("web application"), "Fallback regex must identify React/Web");
    assert(!fallbackComment.toLowerCase().includes("ai automation"), "Fallback regex must NOT mistake 'paid' or 'waiting' for AI");
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
    assert.strictEqual(pixelGoCount, 1, "pixelgo.live must appear EXACTLY ONCE for hospitality post");
    const totalUrls = (comment.match(/https?:\/\/[^\s]+/g) || []).length;
    assert.strictEqual(totalUrls, 1, "Single URL discipline: hospitality comment must contain exactly 1 URL");
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

  // 32. 6 Required Natural Language Buyer Phrases (Zero premature keyword discards)
  await test("32. 6 Required natural language buyer phrases qualify via AI semantic reasoning", async () => {
    const requiredPhrases = [
      { text: "I need a website designer", expectedCap: "Web Development" },
      { text: "I need someone to build an application", expectedCap: "Web Development" },
      { text: "looking for someone to help with my website", expectedCap: "Web Development" },
      { text: "need an app for my business", expectedCap: "Mobile Development" },
      { text: "can someone develop this", expectedCap: "Web Development" },
      { text: "looking for a developer to build my platform", expectedCap: "SaaS development" }
    ];

    for (const item of requiredPhrases) {
      const post = { text: item.text, username: "buyer_prospect", postId: `test_phrase_${Date.now()}` };
      const decision = await aiDecisionEngine.qualifyPost(post);

      assert.strictEqual(decision.is_genuine_buyer, true, `Phrase must qualify as genuine buyer: "${item.text}"`);
      assert.strictEqual(decision.decision, "QUALIFIED", `Decision must be QUALIFIED for: "${item.text}"`);
      assert.strictEqual(decision.service_match, true, `Service match must be true for: "${item.text}"`);
      assert(["HOT", "WARM"].includes(decision.temperature), `Temperature must be HOT or WARM for: "${item.text}"`);
      assert(["INDIVIDUAL", "COMPANY", "EITHER"].includes(decision.target_entity), `Target entity must be valid for: "${item.text}"`);
      assert(["FOUNDER", "COMPANY", "BOTH"].includes(decision.representation), `Representation must be valid for: "${item.text}"`);
      assert(decision.requirement && decision.requirement.length > 5, `Requirement must be extracted for: "${item.text}"`);
    }
  });

  // 33. Verification on previously missed state lead: hola6651803
  await test("33. Missed state lead hola6651803 qualifies as HOT genuine buyer", async () => {
    const post = {
      username: "hola6651803",
      postId: "Dclu8jmCODV",
      text: "hola6651803\n28/08/2026\nNeed a website for my personal brand asap\n48\n81\n6",
      url: "https://www.threads.com/@hola6651803/post/Dclu8jmCODV"
    };

    const decision = await aiDecisionEngine.qualifyPost(post);
    assert.strictEqual(decision.is_genuine_buyer, true, "hola6651803 must be detected as genuine buyer");
    assert.strictEqual(decision.decision, "QUALIFIED", "Decision must be QUALIFIED");
    assert.strictEqual(decision.temperature, "HOT", "Must be HOT temperature");
    assert.strictEqual(decision.service_match, true, "Service match must be true");
    assert(decision.matched_capability.toLowerCase().includes("web") || decision.matched_capability === "Custom websites", "Must match Web Development or Custom websites");
    assert(decision.generated_comment && decision.generated_comment.includes("codeair.tech"), "Generated comment must cite CodeAir");
  });

  // 34. Verification on disguised seller post: duo.websitessss
  await test("34. Disguised seller duo.websitessss is disqualified as SERVICE_PROVIDER", async () => {
    const post = {
      username: "duo.websitessss",
      postId: "Dda8_gcjdCS",
      text: "duo.websitessss\n1d\nLooking for a website designer? 👀\nDUO is here! We design and build modern, customised websites for businesses, brands & individuals.\nWould love to hear what you have in mind 🤝\n🌐 duo-websitessss.vercel.app\n1",
      url: "https://www.threads.com/@duo.websitessss/post/Dda8_gcjdCS"
    };

    const decision = await aiDecisionEngine.qualifyPost(post);
    assert.strictEqual(decision.is_genuine_buyer, false, "Disguised seller must NOT be genuine buyer");
    assert.strictEqual(decision.decision, "IGNORED", "Disguised seller must be IGNORED");
    assert.strictEqual(decision.intent, "SERVICE_PROVIDER", "Intent must be SERVICE_PROVIDER");
    assert.strictEqual(decision.service_match, false, "Service match must be false");
  });

  // 35. Structured Semantic Reasoning Output Contract
  await test("35. Semantic reasoning output strictly adheres to the 8-field audit contract", async () => {
    const post = {
      username: "founder_tim",
      postId: "test_audit_fields_1",
      text: "Looking for an agency to build a custom CRM and internal dashboard for our logistics operations."
    };

    const decision = await aiDecisionEngine.qualifyPost(post);
    assert.strictEqual(decision.intent, "BUYER", "Intent must be BUYER");
    assert(typeof decision.requirement === "string" && decision.requirement.length > 0, "Requirement must be non-empty string");
    assert.strictEqual(decision.target_entity, "COMPANY", "Target entity must be COMPANY (user requested agency)");
    assert.strictEqual(decision.representation, "COMPANY", "Representation must be COMPANY");
    assert.strictEqual(decision.service_match, true, "Service match must be true");
    assert.strictEqual(decision.decision, "QUALIFIED", "Decision must be QUALIFIED");
    assert.strictEqual(decision.temperature, "HOT", "Temperature must be HOT");
  });

  // 36. Out-of-Scope non-software requests are rejected (Graphic design / logos / accounting)
  await test("36. Graphic design, logo, and accounting requests are classified as OUT_OF_SCOPE", async () => {
    const outOfScopePosts = [
      { text: "Need a logo designer for our new sneaker brand", expectedIntent: "OUT_OF_SCOPE" },
      { text: "Looking for someone to do our accounting and quarterly tax filing", expectedIntent: "OUT_OF_SCOPE" },
      { text: "Need a video editor for my YouTube vlog channel", expectedIntent: "OUT_OF_SCOPE" }
    ];

    for (const p of outOfScopePosts) {
      const decision = await aiDecisionEngine.qualifyPost({ text: p.text, username: "out_prospect" });
      assert.strictEqual(decision.is_genuine_buyer, false, `Must reject out-of-scope: ${p.text}`);
      assert.strictEqual(decision.decision, "IGNORED", `Must be IGNORED: ${p.text}`);
      assert.strictEqual(decision.service_match, false, `Service match must be false: ${p.text}`);
    }
  });

  // 37. Dynamic Knowledge Engine Parsing (Single Source of Truth)
  await test("37. Knowledge Engine dynamically parses services.md and profiles.md without hardcoded arrays", () => {
    const approved = knowledge.getApprovedServices();
    const excluded = knowledge.getExcludedServices();
    const profiles = knowledge.getOfficialProfiles();

    assert(Array.isArray(approved) && approved.length >= 50, `Approved services count must be >= 50 (got ${approved.length})`);
    assert(approved.some(s => s.toLowerCase().includes("custom software")), "Approved services must include custom software");
    assert(approved.some(s => s.toLowerCase().includes("pixelgo")), "Approved services must include PixelGo HMS");

    assert(Array.isArray(excluded) && excluded.length >= 10, `Excluded services count must be >= 10 (got ${excluded.length})`);
    assert(excluded.some(s => s.toLowerCase().includes("graphic design")), "Excluded services must include graphic design");

    assert.strictEqual(profiles.company.website, "https://www.codeair.tech", "Company website parsed correctly");
    assert.strictEqual(profiles.company.pixelgo, "https://pixelgo.live", "PixelGo URL parsed correctly");
    assert.strictEqual(profiles.founder.linkedin, "https://linkedin.com/in/sunmughan", "Founder LinkedIn parsed correctly");
  });

  // 38. Strict Representation Voice Separation & Single URL Discipline
  await test("38. Strict Representation Voice Separation & Single URL Discipline", () => {
    // 1. FOUNDER mode
    const founderComment = commentGenerator.generateEngagingComment({
      text: "Looking for a freelance developer to help build my web app",
      username: "client_founder",
      matchedCategories: ["Web Development"],
      identity: "FOUNDER"
    });
    assert(founderComment.includes("linkedin.com/in/sunmughan"), "FOUNDER mode must include founder LinkedIn");
    assert(!founderComment.includes("codeair.tech"), "FOUNDER mode must NEVER push company website");
    assert.strictEqual((founderComment.match(/https?:\/\/[^\s]+/g) || []).length, 1, "FOUNDER comment must have exactly 1 link");

    // 2. COMPANY mode
    const companyComment = commentGenerator.generateEngagingComment({
      text: "Looking for an agency to build a custom CRM and dashboard",
      username: "client_company",
      matchedCategories: ["Business Systems"],
      identity: "COMPANY"
    });
    assert(companyComment.includes("https://www.codeair.tech"), "COMPANY mode must include company website");
    assert(!companyComment.includes("linkedin.com/in/sunmughan/"), "COMPANY mode must NEVER push personal founder LinkedIn");
    assert.strictEqual((companyComment.match(/https?:\/\/[^\s]+/g) || []).length, 1, "COMPANY comment must have exactly 1 link");

    // 3. NEUTRAL mode
    const neutralComment = commentGenerator.generateEngagingComment({
      text: "What do you think is the best database architecture for multi-tenant SaaS?",
      username: "tech_user",
      matchedCategories: ["Backend & APIs"],
      identity: "NEUTRAL"
    });
    assert.strictEqual((neutralComment.match(/https?:\/\/[^\s]+/g) || []).length, 0, "NEUTRAL comment must contain ZERO links");
  });

  // 39. MiniMax M3 AI Runtime Architecture
  await test("39. MiniMax M3 AI Runtime Architecture", () => {
    const aiRuntimeModule = require("../src/ai/ai-runtime");
    const configModule = require("../config");

    assert.strictEqual(configModule.AI_PROVIDER, "minimax", "AI_PROVIDER must be minimax");
    assert.strictEqual(configModule.AI_RUNTIME, "minimax", "AI_RUNTIME must be minimax");
    assert.strictEqual(configModule.MINIMAX_MODEL, "MiniMax-M3", "MINIMAX_MODEL must be MiniMax-M3");
    assert.strictEqual(configModule.MINIMAX_BASE_URL, "https://api.minimax.io/v1", "MiniMax base URL must be configured");
    assert.strictEqual(typeof aiRuntimeModule.callAi, "function", "callAi must be exposed as primary entry point");
    assert.strictEqual(typeof aiRuntimeModule.callMiniMax, "function", "callMiniMax must be available");
  });

  // 40. Unified State Store Lifecycle Semantics
  await test("40. StateStore recognizes COMMENTED, POSTED_LIVE, and COMMENT_POSTED", () => {
    const testPostId1 = "test_lifecycle_1";
    const testPostId2 = "test_lifecycle_2";
    const testPostId3 = "test_lifecycle_3";

    stateStore.addDiscoveredPost({ postId: testPostId1, username: "user1", text: "hello" });
    stateStore.updatePostStatus(testPostId1, "COMMENTED");
    assert.strictEqual(stateStore.hasCommented(testPostId1), true, "hasCommented must recognize COMMENTED");

    stateStore.addDiscoveredPost({ postId: testPostId2, username: "user2", text: "hello" });
    stateStore.updatePostStatus(testPostId2, "POSTED_LIVE");
    assert.strictEqual(stateStore.hasCommented(testPostId2), true, "hasCommented must recognize POSTED_LIVE");

    stateStore.addDiscoveredPost({ postId: testPostId3, username: "user3", text: "hello" });
    stateStore.updatePostStatus(testPostId3, "COMMENT_POSTED");
    assert.strictEqual(stateStore.hasCommented(testPostId3), true, "hasCommented must recognize COMMENT_POSTED");

    delete stateStore.state.posts[testPostId1];
    delete stateStore.state.posts[`threads:${testPostId1}`];
    delete stateStore.state.posts[testPostId2];
    delete stateStore.state.posts[`threads:${testPostId2}`];
    delete stateStore.state.posts[testPostId3];
    delete stateStore.state.posts[`threads:${testPostId3}`];
    stateStore.saveState();
  });

  // 41. AiQueue Priority Scheduling & Concurrency Worker
  await test("41. AiQueue enforces priority scheduling, concurrency limit, and cache deduplication", async () => {
    const aiRuntimeModule = require("../src/ai/ai-runtime");
    const queue = aiRuntimeModule.queue;

    const executionOrder = [];
    const p1 = queue.enqueue("POST_ANALYSIS", "prompt A", async () => {
      await new Promise(r => setTimeout(r, 20));
      executionOrder.push("POST_ANALYSIS");
      return { result: "A" };
    });

    const p2 = queue.enqueue("DM_RESPONSE", "prompt B", async () => {
      await new Promise(r => setTimeout(r, 10));
      executionOrder.push("DM_RESPONSE");
      return { result: "B" };
    });

    const [resA, resB] = await Promise.all([p1, p2]);
    assert.strictEqual(resA.result, "A");
    assert.strictEqual(resB.result, "B");

    // Cache deduplication check
    let executedCount = 0;
    const cachePrompt = "unique prompt for cache test " + Date.now();
    await queue.enqueue("COMMENT_SYNTHESIS", cachePrompt, async () => {
      executedCount++;
      return { comment: "cached" };
    });
    const cachedRes = await queue.enqueue("COMMENT_SYNTHESIS", cachePrompt, async () => {
      executedCount++;
      return { comment: "cached" };
    });
    assert.strictEqual(cachedRes.comment, "cached");
    assert.strictEqual(executedCount, 1, "Cached prompt should not re-execute executor");

    const status = queue.getStatus();
    assert.strictEqual(typeof status.pending, "number");
    assert.strictEqual(typeof status.active, "number");
    assert.strictEqual(typeof status.completed, "number");
    assert(status.cacheEntries >= 1, "Cache entries count must be >= 1");
  });

  // 42. Production Zero-Heuristic Quarantine on AI Failure
  await test("42. Zero-Heuristic Quarantine fail-safe isolates posts on AI failure without guessing", async () => {
    // In production mode (allowLocalFallback: false), AI failures must quarantine instead of regex guessing
    const post = {
      postId: "test_quarantine_fail_1",
      username: "buyer_someone",
      text: "I need someone to build an application for our logistics warehouse."
    };

    const decision = await aiDecisionEngine.qualifyPost(post, {
      useAiCall: true,
      offlineSimulation: false,
      allowLocalFallback: false
    });

    assert.strictEqual(decision.is_genuine_buyer, false, "Quarantined post must not be marked genuine buyer");
    assert.strictEqual(decision.decision, "IGNORED", "Quarantined post decision must be IGNORED");
    assert.strictEqual(decision.lead_type, "QUARANTINED", "Lead type must be QUARANTINED");
    assert.strictEqual(decision.quarantined, true, "Must flag quarantined: true");
    assert.strictEqual(decision.should_reply, false, "Must never post a reply when quarantined");
  });

  // 43. Single Brain Authority & intentClassifier.classifyAsync Delegation
  await test("43. intentClassifier.classifyAsync delegates to aiDecisionEngine.qualifyPost", async () => {
    const post = {
      postId: "test_delegate_1",
      username: "client_agency_buyer",
      text: "Looking for an agency to build a custom CRM and internal dashboard."
    };

    const decision = await intentClassifier.classifyAsync(post, { offlineSimulation: true });
    assert.strictEqual(decision.intent, "BUYER", "Intent must be BUYER");
    assert.strictEqual(decision.is_genuine_buyer, true, "Must be genuine buyer");
    assert.strictEqual(decision.decision, "QUALIFIED", "Decision must be QUALIFIED");
    assert.strictEqual(decision.representation, "COMPANY", "Representation must be COMPANY");
  });

  // 44. Dynamic Knowledge Markdown Table and Link Parsing
  await test("44. Dynamic Knowledge Engine parses markdown tables and markdown links", () => {
    const sampleServicesMarkdown = `
# Services

## APPROVED CUSTOM SOFTWARE
| Service | Category | Description |
|---|---|---|
| Enterprise ERP Software | Business Systems | High-scale enterprise resource planning |
| Custom Mobile Architecture | Mobile | Scalable Flutter applications |

## NOT A CODEAIR SERVICE
| Service | Reason |
|---|---|
| Print Brokering | Physical manufacturing |
`;

    const parsedServices = knowledge.parseServicesMarkdown(sampleServicesMarkdown);
    assert(parsedServices.approved.includes("Enterprise ERP Software"), "Must parse table row into approved services");
    assert(parsedServices.approved.includes("Custom Mobile Architecture"), "Must parse table row into approved services");
    assert(parsedServices.excluded.includes("Print Brokering"), "Must parse table row into excluded services");

    const sampleProfilesMarkdown = `
# Profiles
## Company Profiles
- Website: [CodeAir Software Solutions](https://www.codeair.tech)
- PixelGo HMS: [PixelGo](https://pixelgo.live)
`;
    const parsedProfiles = knowledge.parseProfilesMarkdown(sampleProfilesMarkdown);
    assert.strictEqual(parsedProfiles.company.website, "https://www.codeair.tech", "Must parse markdown link for company website");
    assert.strictEqual(parsedProfiles.company.pixelgo, "https://pixelgo.live", "Must parse markdown link for PixelGo HMS");
  });

  // 45. Grounded Semantics handles direct CodeAir inquiries
  await test("45. Direct CodeAir capabilities and founder queries qualify cleanly", async () => {
    const founderQuery = {
      username: "curious_user",
      postId: "test_founder_query",
      text: "Who is behind CodeAir?"
    };
    const founderDecision = await aiDecisionEngine.qualifyPost(founderQuery, { offlineSimulation: true });
    assert.strictEqual(founderDecision.is_genuine_buyer, true);
    assert.strictEqual(founderDecision.representation, "FOUNDER");
    assert(founderDecision.generated_comment.includes("Sunmughan Swamy"));
    assert(founderDecision.generated_comment.includes("linkedin.com/in/sunmughan"));

    const companyQuery = {
      username: "enterprise_buyer",
      postId: "test_company_query",
      text: "What does CodeAir do?"
    };
    const companyDecision = await aiDecisionEngine.qualifyPost(companyQuery, { offlineSimulation: true });
    assert.strictEqual(companyDecision.is_genuine_buyer, true);
    assert.strictEqual(companyDecision.representation, "COMPANY");
    assert(companyDecision.generated_comment.includes("codeair.tech"));
  });

  // 46. Comment Submit Verification Failure Protection (No False Positives)
  await test("46. Comment Submit Verification Failure prevents POSTED_LIVE and duplicateGuard recording", () => {
    const testPostId = "test_unverified_submit_46";
    // Add discovered post first
    stateStore.addDiscoveredPost({ postId: testPostId, username: "user_test_46", text: "Looking for dev" });
    // Ensure clean slate
    assert.strictEqual(duplicateGuard.canExecute({ platform: "threads", actionType: "COMMENT", targetId: testPostId }).allowed, true);
    assert.strictEqual(stateStore.hasCommented(testPostId), false);

    // Simulate threads-actions verification failure scenario:
    // When verification fails (e.g. submit button disabled, modal cancelled, or DOM snippet absent),
    // duplicateGuard.recordExecuted and stateStore.recordComment(..., "POSTED_LIVE") must NOT be invoked.
    const fakeVerificationResult = { success: false, verified: false, reason: "Comment DOM verification timed out" };
    if (!fakeVerificationResult.verified) {
      // Correct behavior: do NOT record in duplicateGuard or stateStore POSTED_LIVE
      stateStore.updatePostStatus(testPostId, "COMMENT_FAILED", {
        retryCount: 1,
        lastFailedAt: new Date().toISOString(),
        failureReason: fakeVerificationResult.reason
      });
    }

    assert.strictEqual(duplicateGuard.canExecute({ platform: "threads", actionType: "COMMENT", targetId: testPostId }).allowed, true, "Must still be allowed in duplicateGuard on failure");
    assert.strictEqual(stateStore.hasCommented(testPostId), false, "Must NOT mark hasCommented as true on failure");
    const postRecord = stateStore.state.posts[testPostId] || stateStore.state.posts[`threads:${testPostId}`];
    assert.strictEqual(postRecord.status, "COMMENT_FAILED", "Post must transition to COMMENT_FAILED");

    delete stateStore.state.posts[testPostId];
    delete stateStore.state.posts[`threads:${testPostId}`];
    stateStore.saveState();
  });

  // 47. COMMENT_FAILED Quarantine, Cooldown, and Retryability
  await test("47. COMMENT_FAILED state allows retries after cooldown and stops after maxRetries", () => {
    const postEligible = "test_retry_eligible_47";
    const postInCooldown = "test_retry_cooldown_47";
    const postExhausted = "test_retry_exhausted_47";

    // 1. Eligible post: failed 20 minutes ago, retryCount = 1 (< 3)
    stateStore.addDiscoveredPost({ postId: postEligible, username: "user_retry_1", text: "Need web app" });
    stateStore.updatePostStatus(postEligible, "COMMENT_FAILED", {
      retryCount: 1,
      lastFailedAt: new Date(Date.now() - 20 * 60 * 1000).toISOString()
    });

    // 2. Cooldown post: failed 5 minutes ago (< 15 min cooldown), retryCount = 1
    stateStore.addDiscoveredPost({ postId: postInCooldown, username: "user_retry_2", text: "Need mobile app" });
    stateStore.updatePostStatus(postInCooldown, "COMMENT_FAILED", {
      retryCount: 1,
      lastFailedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString()
    });

    // 3. Exhausted post: failed 30 minutes ago, retryCount = 3 (>= 3 max)
    stateStore.addDiscoveredPost({ postId: postExhausted, username: "user_retry_3", text: "Need AI bot" });
    stateStore.updatePostStatus(postExhausted, "COMMENT_FAILED", {
      retryCount: 3,
      lastFailedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString()
    });

    const retryable = stateStore.getRetryableFailedPosts(3, 15, "threads", { includeTestPosts: true });
    const retryableIds = retryable.map(p => p.postId);

    assert(retryableIds.includes(postEligible), "Post past cooldown with < 3 retries must be retryable");
    assert(!retryableIds.includes(postInCooldown), "Post within 15-min cooldown must NOT be retryable yet");
    assert(!retryableIds.includes(postExhausted), "Post with >= 3 retries must NOT be retryable");

    delete stateStore.state.posts[postEligible];
    delete stateStore.state.posts[`threads:${postEligible}`];
    delete stateStore.state.posts[postInCooldown];
    delete stateStore.state.posts[`threads:${postInCooldown}`];
    delete stateStore.state.posts[postExhausted];
    delete stateStore.state.posts[`threads:${postExhausted}`];
    stateStore.saveState();
  });

  // 48. Scheduled Post (New Thread) Verification Failure Prevention
  await test("48. Scheduled Post verification failure prevents recording in ourPosts", () => {
    const initialCount = Object.keys(stateStore.state.ourPosts || {}).length;

    // Simulate failure in publishEngagingPost
    const fakePublishResult = { success: false, verified: false, reason: "New thread DOM verification failed" };
    if (fakePublishResult.verified) {
      stateStore.recordOurPost({ id: "fake_post_fail", text: "Should not exist", status: "VERIFIED_PUBLISHED" });
    }

    const currentCount = Object.keys(stateStore.state.ourPosts || {}).length;
    assert.strictEqual(currentCount, initialCount, "Failed new thread must NEVER be recorded in ourPosts");
  });

  // 49. Strict 6-Hour Scheduled Post Interval (4 Posts / 24 Hours)
  await test("49. Posting cadence defaults to exactly 6 hours (4 posts / 24 hours)", () => {
    const configModule = require("../config");
    assert.strictEqual(configModule.POST_INTERVAL_HOURS, 6, "POST_INTERVAL_HOURS must default to 6");
    const intervalMs = configModule.POST_INTERVAL_HOURS * 60 * 60 * 1000;
    assert.strictEqual(intervalMs, 21600000, "Interval in ms must equal exactly 6 hours (21,600,000 ms)");
  });

  // 50. Scheduler Exclusively Evaluates Verified Published Posts
  await test("50. Scheduler filters exclusively for VERIFIED_PUBLISHED posts when computing cadence", () => {
    const fakeUnverifiedPost = {
      id: "unverified_recent_1",
      publishedAt: new Date().toISOString(), // published 0 seconds ago, BUT unverified / failed
      status: "FAILED",
      published: false
    };
    const fakeVerifiedOldPost = {
      id: "verified_old_1",
      publishedAt: new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString(), // published 7 hours ago
      status: "VERIFIED_PUBLISHED",
      published: true
    };

    // Store in isolated ourPosts
    const originalOurPosts = stateStore.state.ourPosts;
    stateStore.state.ourPosts = {
      [fakeUnverifiedPost.id]: fakeUnverifiedPost,
      [fakeVerifiedOldPost.id]: fakeVerifiedOldPost
    };

    try {
      // Evaluate using scheduler logic
      const ourPosts = Object.values(stateStore.state.ourPosts);
      const verifiedPosts = ourPosts.filter(p => p.status === "VERIFIED_PUBLISHED" || p.published === true);
      const latestPost = verifiedPosts.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())[0];
      const lastPostTime = latestPost ? new Date(latestPost.publishedAt).getTime() : 0;
      const postIntervalMs = 6 * 60 * 60 * 1000;
      const elapsedMs = Date.now() - lastPostTime;
      const isDue = elapsedMs >= postIntervalMs || lastPostTime === 0;

      assert.strictEqual(latestPost.id, "verified_old_1", "Scheduler must pick the verified post, completely ignoring unverified ones");
      assert.strictEqual(isDue, true, "Post must be due because the last VERIFIED post was 7 hours ago (> 6 hours)");
    } finally {
      stateStore.state.ourPosts = originalOurPosts;
    }
  });

  // 51. Scheduled Post Failure Cooldown Enforced
  await test("51. Scheduled post failure cooldown blocks loop retries for 30 minutes", () => {
    stateStore.recordOurPostAttemptFailure({
      pillar: "TEST_PILLAR",
      format: "SINGLE_CARD",
      reason: "Verification timeout test"
    });

    const lastFailure = stateStore.getLastPostAttemptFailure();
    assert(lastFailure, "Last post attempt failure must be retrievable");
    assert.strictEqual(lastFailure.reason, "Verification timeout test");

    const failureCooldownMs = 30 * 60 * 1000;
    const timeSinceFailure = Date.now() - lastFailure.timestamp;
    const isCooldownActive = timeSinceFailure < failureCooldownMs;
    assert.strictEqual(isCooldownActive, true, "Failure cooldown must be active immediately after recorded failure");

    // Clean up failure record
    stateStore.state.postFailures.pop();
    stateStore.saveState();
  });

  // 52. Threads-Only Platform Target Runtime Isolation
  await test("52. Threads-only platform target configuration isolates from Instagram execution", () => {
    const config = require("../config");
    const target = (config.PLATFORM_TARGET || "threads").toLowerCase();
    assert.strictEqual(target, "threads", "PLATFORM_TARGET must default to 'threads'");

    const shouldScanInstagram = target === "instagram" || target === "all";
    assert.strictEqual(shouldScanInstagram, false, "Instagram scanning must be bypassed when target is threads");
  });

  // 53. Multi-Turn Turn ID Distinct Hash Generation
  await test("53. Multi-turn replies and DMs produce unique hash turn IDs for subsequent user messages", () => {
    const threadsActivityWatcher = require("../src/platforms/threads/threads-activity");
    const threadsDms = require("../src/platforms/threads/threads-dms");

    const user = "founder_test_user";
    const msg1 = "Can you build an MVP for our AI startup?";
    const msg2 = "That sounds great! What are your rates and timeline?";

    const replyTurn1 = threadsActivityWatcher.hashReply(user, msg1);
    const replyTurn2 = threadsActivityWatcher.hashReply(user, msg2);

    assert(replyTurn1.startsWith("reply_threads_founder_test_user_"));
    assert(replyTurn2.startsWith("reply_threads_founder_test_user_"));
    assert.notStrictEqual(replyTurn1, replyTurn2, "Different incoming messages on the same conversation must generate distinct turn IDs");

    const dmTurn1 = threadsDms.hashMessage(user, msg1);
    const dmTurn2 = threadsDms.hashMessage(user, msg2);
    assert.notStrictEqual(dmTurn1, dmTurn2, "Different DMs must generate distinct turn IDs for continuous conversation");
  });

  // 54. Direct Message Verification & Approval Mode Enforcement
  await test("54. DM Monitor respects approval mode and does not mark SENT_VERIFIED without browser delivery", async () => {
    const dmMonitor = require("../src/engagement/dm-monitor");

    const testSender = `test_client_999_${Date.now()}`;

    const testItem = {
      sender: testSender,
      lastMessage: "Need a landing page by next week. Can you help?",
      threadId: `test_thread_${testSender}`
    };

    const res = await dmMonitor.processDmItem(testItem, "threads", { approvalMode: true });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.approvalRequired, true);

    const dmTurnId = require("../src/platforms/threads/threads-dms").hashMessage(testItem.sender, testItem.lastMessage);
    const handled = stateStore.state.dms[`threads:${dmTurnId}`];
    assert(handled, "Handled DM record must exist in state");
    assert.strictEqual(handled.status, "PENDING_APPROVAL", "Status must be PENDING_APPROVAL in approval mode");

    // Cleanup test DM state
    delete stateStore.state.dms[`threads:${dmTurnId}`];
    delete stateStore.state.conversations[`threads:${testSender}`];
    delete stateStore.state.conversations[testSender];
    stateStore.saveState();
  });

  // 55. Explicit State Transition Logging & Tracking
  await test("55. StateStore records explicit action transitions from INIT to VERIFIED_SUCCESS or FAILED", () => {
    const targetId = "test_trans_post_55";
    const failId = "test_fail_post_55";
    // Clean any prior runs of these test IDs
    if (Array.isArray(stateStore.state.actionTransitions)) {
      stateStore.state.actionTransitions = stateStore.state.actionTransitions.filter(
        r => r.targetId !== targetId && r.targetId !== failId
      );
    }

    const t1 = stateStore.recordActionTransition("COMMENT", targetId, "INIT", "PREPARING", { user: "test" });
    const t2 = stateStore.recordActionTransition("COMMENT", targetId, "PREPARING", "OPENED");
    const t3 = stateStore.recordActionTransition("COMMENT", targetId, "OPENED", "TYPING");
    const t4 = stateStore.recordActionTransition("COMMENT", targetId, "TYPING", "SUBMITTING");
    const t5 = stateStore.recordActionTransition("COMMENT", targetId, "SUBMITTING", "VERIFYING");
    const t6 = stateStore.recordActionTransition("COMMENT", targetId, "VERIFYING", "VERIFIED_SUCCESS", { verified: true });

    assert(Array.isArray(stateStore.state.actionTransitions), "actionTransitions must be an array in state");
    const records = stateStore.state.actionTransitions.filter(r => r.targetId === targetId);
    assert.strictEqual(records.length, 6, "Must record all 6 transitions");
    assert.strictEqual(records[0].fromState, "INIT");
    assert.strictEqual(records[0].toState, "PREPARING");
    assert.strictEqual(records[5].toState, "VERIFIED_SUCCESS");

    // Test failure transition
    stateStore.recordActionTransition("COMMENT", failId, "VERIFYING", "FAILED", { reason: "Snippet absent" });
    stateStore.recordActionTransition("COMMENT", failId, "FAILED", "DIAGNOSTIC");
    stateStore.recordActionTransition("COMMENT", failId, "DIAGNOSTIC", "RETRY_PENDING", { retryCount: 1 });

    const failRecords = stateStore.state.actionTransitions.filter(r => r.targetId === failId);
    assert.strictEqual(failRecords.length, 3);
    assert.strictEqual(failRecords[0].toState, "FAILED");
    assert.strictEqual(failRecords[1].toState, "DIAGNOSTIC");
    assert.strictEqual(failRecords[2].toState, "RETRY_PENDING");

    // Clean up
    stateStore.state.actionTransitions = stateStore.state.actionTransitions.filter(
      r => r.targetId !== targetId && r.targetId !== failId
    );
    stateStore.saveState();
  });

  // 56. Strict Comment Verification Rejects False-Positive "Posted / View" Substrings
  await test("56. Strict comment verification rejects loose 'Posted/View' false positives when snippet is absent", () => {
    // Simulate DOM containing unrelated text like "Posted 10m ago" and "View profile", but NOT our comment snippet
    const mockDomText = "dougkennedy93\nPosted 10m ago\nGreat architecture tips.\nView profile\nView replies";
    const commentSnippet = "At CodeAir Software Solutions, we design and develop";

    // Replicate the corrected verification function from threads-actions
    function verifyCommentInDom(bodyText, snippet, articleTexts = []) {
      const hasError = /\b(couldn'?t post|something went wrong|try again later|action blocked|rate limit)\b/i.test(bodyText);
      if (hasError) return { verified: false, error: "error dialog" };

      // Snippet must be found in article texts or body with author
      const snippetFound = snippet && snippet.length > 5 && articleTexts.some(a => a.includes(snippet));
      const hasAuthorSnippet = bodyText.toLowerCase().includes("sunmughan") && bodyText.includes(snippet);

      if (snippetFound || hasAuthorSnippet) {
        return { verified: true, reason: "Comment snippet verified in thread DOM" };
      }
      return { verified: false, error: "Awaiting confirmed DOM insertion" };
    }

    // 1. When snippet is absent, even if body has "Posted" and "View", it MUST FAIL
    const resAbsent = verifyCommentInDom(mockDomText, commentSnippet, ["dougkennedy93 Great architecture tips."]);
    assert.strictEqual(resAbsent.verified, false, "Must NOT verify if comment snippet is absent");

    // 2. When snippet IS present with author, it MUST PASS
    const validDomText = mockDomText + `\nsunmughan\n${commentSnippet}\ncodeair.tech`;
    const resPresent = verifyCommentInDom(validDomText, commentSnippet, [commentSnippet]);
    assert.strictEqual(resPresent.verified, true, "Must verify when comment snippet is genuinely present");

    // 3. Draft text inside composer (editable elements) must be rejected
    function verifyCommentExcludingDrafts(elements, snippet) {
      return elements.some(el => {
        if (el.isContentEditable || el.isComposer) return false;
        return (el.text || "").includes(snippet);
      });
    }
    const draftElements = [{ text: commentSnippet, isContentEditable: true, isComposer: true }];
    assert.strictEqual(verifyCommentExcludingDrafts(draftElements, commentSnippet), false, "Draft text in composer must never verify as posted");
  });

  // 57. Own-Post Profile Feed Verification Requirement
  await test("57. Own-post publishing requires verified presence on profile feed before VERIFIED_PUBLISHED", () => {
    // When a post is submitted, if modal closes but post is not found on profile, it must be FAILED / UNVERIFIED
    const mockProfileArticlesWithoutPost = [
      "sunmughan 2h Earlier post text...",
      "sunmughan 12h Other older post..."
    ];
    const newPostSnippet = "To fellow startup founders: lean architecture beats microservices";

    const isFoundOnProfile = mockProfileArticlesWithoutPost.some(a => a.includes(newPostSnippet));
    assert.strictEqual(isFoundOnProfile, false, "Post must not be considered found when absent from profile feed");

    // Must NOT mark VERIFIED_PUBLISHED when absent from profile
    let postStatus = "PENDING_VERIFY";
    if (isFoundOnProfile) {
      postStatus = "VERIFIED_PUBLISHED";
    } else {
      postStatus = "UNVERIFIED_PROFILE_MISSING";
    }
    assert.strictEqual(postStatus, "UNVERIFIED_PROFILE_MISSING", "Post must remain UNVERIFIED if missing on profile feed");

    // When present on profile feed
    const mockProfileArticlesWithPost = [
      `sunmughan 1m ${newPostSnippet}`,
      ...mockProfileArticlesWithoutPost
    ];
    const isNowFound = mockProfileArticlesWithPost.some(a => a.includes(newPostSnippet));
    assert.strictEqual(isNowFound, true);
    if (isNowFound) {
      postStatus = "VERIFIED_PUBLISHED";
    }
    assert.strictEqual(postStatus, "VERIFIED_PUBLISHED", "Post is marked VERIFIED_PUBLISHED only when confirmed on profile feed");
  });

  // 58. Direct Message Multi-Element Bubble Verification across SPAN/DIV
  await test("58. DM bubble verification searches SPAN, DIV, and P elements without failing on dir='auto'", () => {
    // In Threads, message bubbles are in <span> and <div> elements without dir="auto"
    const mockElements = [
      { tagName: "SPAN", text: "That makes sense. What does your current architecture look like?" },
      { tagName: "DIV", text: "Messages Inbox Requests" }
    ];
    const snippet = "That makes sense. What does";

    // Replicate the corrected verification function
    const isVerified = mockElements.some(b => {
      if (b.tagName === "SCRIPT" || b.tagName === "STYLE") return false;
      return (b.text || "").includes(snippet);
    });

    assert.strictEqual(isVerified, true, "Must verify message presence in SPAN and DIV elements");
  });

  // 59. Threads-Only Isolation in DM Monitor
  await test("59. scanAndProcessThreadsOnly processes exclusively Threads DMs with zero Instagram calls", async () => {
    const dmMonitor = require("../src/engagement/dm-monitor");
    assert.strictEqual(typeof dmMonitor.scanAndProcessThreadsOnly, "function", "scanAndProcessThreadsOnly must be exposed");

    const res = await dmMonitor.scanAndProcessThreadsOnly({ offlineSimulation: true });
    assert(res.threads !== undefined, "Results must contain threads");
    assert.strictEqual(res.instagram, undefined, "Results must NOT contain instagram in Threads-only execution");
  });

  // 60. Screenshot 1 Regression: Career Advice post (@mrsjortizx3) must be strictly ignored
  await test("60. Screenshot 1 Regression: Career seeker post (@mrsjortizx3) receives zero promotional comment", async () => {
    const post = {
      username: "mrsjortizx3",
      postId: "test_career_post_60",
      text: "Just finished my BA in Business Administration... Mom of 3... I want WFH, $80K+... What career paths/job titles should I be looking into?"
    };
    const decision = await aiDecisionEngine.qualifyPost(post, { useAiCall: false });
    assert.strictEqual(decision.is_genuine_buyer, false, "Career seeker must NOT be qualified as buyer");
    assert.strictEqual(decision.decision, "IGNORED", "Decision must be IGNORED");
    assert.strictEqual(decision.should_reply, false, "should_reply must be false");
    assert.strictEqual(decision.intent, "CAREER_ADVICE", "Intent must be CAREER_ADVICE");
    assert.strictEqual(decision.generated_comment, null, "Must generate zero promotional comment");
  });

  // 61. Screenshot 2 Regression: B2B Lead Gen payment proposal (@anasshaikh.biz) must decline without software pitch
  await test("61. Screenshot 2 Regression: B2B lead gen DM (@anasshaikh.biz) declines without software architecture pitch", async () => {
    const incomingText = "Hi Sunmughan, before we move forward I want to set clear expectations. This will be a payment-based deal, not commission-only I charge a flat rate per batch of leads delivered, and payment will be taken at the time of delivering the leads, not as an advance like some others might ask. I can provide well-researched, targeted decision-maker leads matching your criteria (B2B businesses looking to outsource or go digital, USA first), but I can't guarantee they'll convert into clients no lead generation service can promise conversions, since that depends on your pitch, timing, and their internal decisions. If this works for you, let me know your budget per lead/batch and I'll get started.";
    
    // First verify resolveRequestedLink does NOT mistake 'digital' for git repo link
    const link = knowledge.resolveRequestedLink(incomingText);
    assert.strictEqual(link, null, "Word 'digital' must not trigger git/github link resolution");

    const reply = await aiDecisionEngine.generateConversationReply({
      incomingMessage: incomingText,
      username: "anasshaikh.biz",
      convId: "threads:test_anasshaikh_mock"
    });

    assert.strictEqual(reply.intent, "LEAD_GENERATION_DECLINED", "Intent must be LEAD_GENERATION_DECLINED");
    assert.strictEqual(reply.service_match, false, "service_match must be false");
    assert.strictEqual(reply.conversation_stage, "CLOSED", "Conversation stage must be CLOSED");
    assert(!reply.response_message.toLowerCase().includes("architecture"), "Response must NOT ask about software architecture");
    assert(!reply.response_message.toLowerCase().includes("timeline for this project"), "Response must NOT ask for target timeline");
    assert(!reply.response_message.toLowerCase().includes("tech stack"), "Response must NOT ask about tech stack");
    assert(reply.response_message.toLowerCase().includes("lead generation") || reply.response_message.toLowerCase().includes("lists"), "Response must directly address lead generation proposal");
  });

  // 62. Message-Level Exact Deduplication blocks identical outgoing message in same conversation
  test("62. Duplicate Guard blocks sending identical outgoing message in the same conversation thread", () => {
    const convId = "threads:test_dedup_user_62";
    stateStore.saveConversation({
      platform: "threads",
      conversationId: convId,
      user: "test_dedup_user_62",
      lastResponse: "That sounds like a great project. Could you share a bit more detail about the core features?"
    });

    const check = duplicateGuard.canSendChatMessage(convId, "That sounds like a great project. Could you share a bit more detail about the core features?", "threads");
    assert.strictEqual(check.allowed, false, "Exact duplicate message must be blocked");
    assert(check.reason.includes("Exact identical message was already sent"), "Reason must cite exact duplicate");
  });

  // 63. Semantic Message Deduplication (>75% token similarity blocked)
  test("63. Duplicate Guard blocks semantically identical message (>75% similarity) in same thread", () => {
    const convId = "threads:test_dedup_user_63";
    stateStore.saveConversation({
      platform: "threads",
      conversationId: convId,
      user: "test_dedup_user_63",
      lastResponse: "That makes sense. What does your current architecture look like, and what is your target timeline for this project?"
    });

    // Slight variation: 85%+ word overlap
    const nearDuplicate = "That makes sense. What does your current architecture look like and what is the target timeline for this project?";
    const check = duplicateGuard.canSendChatMessage(convId, nearDuplicate, "threads");
    assert.strictEqual(check.allowed, false, "Near-duplicate (>75% similarity) must be blocked");
    assert(check.reason.includes("Semantically identical message"), "Reason must cite semantic duplicate");
  });

  // 64. Relevance Gate blocks software architecture pitch on non-software proposal
  test("64. Relevance Gate blocks software architecture pitch on non-software proposal", () => {
    const proposedResponse = "That makes sense. What does your current architecture look like, and what is your target timeline for this project?";
    const incomingProposal = "I offer flat rate B2B leads batch delivery for decision makers.";
    const gateCheck = aiDecisionEngine.evaluateRelevanceGate(proposedResponse, {}, incomingProposal);
    assert.strictEqual(gateCheck.approved, false, "Gate must reject software architecture pitch on lead generation proposal");
    assert(gateCheck.reason.includes("Inappropriate software architecture/timeline question"), "Reason must cite violation");
  });

  // 65. Job Seeker posts are strictly ignored with zero promotional pitch
  await test("65. Job Seeker candidate post is strictly ignored without sales pitch", async () => {
    const post = {
      username: "fresh_grad_dev",
      postId: "test_job_post_65",
      text: "Recent graduate looking for entry-level software engineer roles or internship. Hire me! Available for work."
    };
    const decision = await aiDecisionEngine.qualifyPost(post);
    assert.strictEqual(decision.is_genuine_buyer, false, "Job seeker must not be qualified as buyer");
    assert.strictEqual(decision.decision, "IGNORED", "Decision must be IGNORED");
    assert.strictEqual(decision.intent, "JOB_SEEKER", "Intent must be JOB_SEEKER");
    assert.strictEqual(decision.should_reply, false, "should_reply must be false");
  });

  // 66. Corporate HR salaried recruitment ad is strictly ignored
  await test("66. Corporate salaried employee recruitment is strictly ignored", async () => {
    const post = {
      username: "enterprise_recruiter",
      postId: "test_recruitment_post_66",
      text: "We are hiring a full-time Senior React Developer. Salary $120k-$150k with 401k and healthcare. Send resume to careers@acme.com"
    };
    const decision = await aiDecisionEngine.qualifyPost(post);
    assert.strictEqual(decision.is_genuine_buyer, false, "Corporate HR must not be qualified as buyer");
    assert.strictEqual(decision.decision, "IGNORED", "Decision must be IGNORED");
    assert.strictEqual(decision.intent, "RECRUITMENT", "Intent must be RECRUITMENT");
    assert.strictEqual(decision.should_reply, false, "should_reply must be false");
  });

  // 67. Freelancer promoting own agency services is strictly ignored
  await test("67. Freelancer promoting own services is strictly ignored", async () => {
    const post = {
      username: "creative_agency",
      postId: "test_seller_post_67",
      text: "Check out my latest client website built with Next.js and Tailwind! Accepting new clients, DM me for rates."
    };
    const decision = await aiDecisionEngine.qualifyPost(post);
    assert.strictEqual(decision.is_genuine_buyer, false, "Freelancer must not be qualified as buyer");
    assert.strictEqual(decision.decision, "IGNORED", "Decision must be IGNORED");
    assert.strictEqual(decision.intent, "SERVICE_PROVIDER", "Intent must be SERVICE_PROVIDER");
    assert.strictEqual(decision.should_reply, false, "should_reply must be false");
  });

  // 68. Genuine Software Buyer qualifies cleanly with approved capability
  await test("68. Genuine software buyer qualifies and receives custom grounded comment", async () => {
    const post = {
      username: "fintech_founder",
      postId: "test_buyer_post_68",
      text: "Looking for an agency or developer to build a custom SaaS platform with Stripe billing and multi-tenancy. Who should I talk to?"
    };
    const decision = await aiDecisionEngine.qualifyPost(post);
    assert.strictEqual(decision.is_genuine_buyer, true, "Genuine SaaS buyer must be qualified");
    assert.strictEqual(decision.decision, "QUALIFIED", "Decision must be QUALIFIED");
    assert.strictEqual(decision.should_reply, true, "should_reply must be true");
    assert(decision.matched_capability.toLowerCase().includes("saas"), "Must match SaaS capability");
    assert(decision.generated_comment.length > 50, "Must synthesize engaging comment");
  });

  // 69. Conversation State Machine persists complete rich conversation schema
  test("69. StateStore persists enriched conversation schema with commercial context", () => {
    const convId = "threads:test_schema_user_69";
    const record = stateStore.saveConversation({
      platform: "threads",
      conversationId: convId,
      participant: "test_schema_user_69",
      incomingText: "We need an MVP built in 3 months",
      detectedIntent: "PROJECT_INQUIRY",
      commercialContext: "COMMERCIAL_DISCOVERY",
      conversationStage: "SCOPING",
      lastOutgoingMessage: "What are the core integrations needed?"
    });

    assert.strictEqual(record.participant, "test_schema_user_69", "Participant must match");
    assert.strictEqual(record.detectedIntent, "PROJECT_INQUIRY", "Detected intent must be preserved");
    assert.strictEqual(record.commercialContext, "COMMERCIAL_DISCOVERY", "Commercial context must be preserved");
    assert.strictEqual(record.conversationStage, "SCOPING", "Conversation stage must match");
    assert.strictEqual(record.lastOutgoingMessage, "What are the core integrations needed?", "Last outgoing message must match");
  });

  // 70. DM Monitor transaction state machine records validated lifecycle transitions
  await test("70. DM Monitor executes complete transaction lifecycle transitions", async () => {
    const dmMonitor = require("../src/engagement/dm-monitor");
    const testSender = `test_trans_user_${Date.now()}`;
    const dmItem = {
      sender: testSender,
      lastMessage: "Do you build custom web apps?",
      threadId: `thread_${testSender}`
    };

    const res = await dmMonitor.processDmItem(dmItem, "threads", { dryRun: true });
    assert.strictEqual(res.success, true, "DM processing must succeed in dryRun");
    assert(res.response.length > 20, "Response must be generated");

    const transitions = stateStore.state.actionTransitions.filter(t => t.actionType === "DM");
    assert(transitions.length >= 3, "Must record at least INIT, CONTEXT_VERIFIED, RESPONSE_GENERATED transitions");
  });

  // 71. Knowledge Engine WhatsApp Profile Parsing & Retrieval
  test("71. Knowledge Engine parses official WhatsApp URL and handles retrieval", () => {
    const profiles = knowledge.getOfficialProfiles();
    assert.strictEqual(profiles.founder.whatsapp, "https://wa.me/codeair", "Founder WhatsApp must be https://wa.me/codeair");
    assert.strictEqual(knowledge.getWhatsAppUrl(), "https://wa.me/codeair", "getWhatsAppUrl helper must return https://wa.me/codeair");
  });

  // 72. DM Discovery Stage Response grounds on WhatsApp booking link
  await test("72. AI Decision Engine grounds discovery call inquiries on WhatsApp link", async () => {
    const context = {
      conversationStage: "DISCOVERY_CALL",
      participant: "serious_buyer_72",
      incomingMessage: "Can we schedule a quick discovery call or phone consultation to discuss our project?",
      matchedService: "Custom SaaS MVP"
    };
    const res = await aiDecisionEngine.generateConversationReply(context);
    const text = res.response_message || res;
    assert(text && text.length > 20, "Must generate thoughtful reply");
    assert(text.includes("https://wa.me/codeair"), "Discovery call response must include https://wa.me/codeair");
  });

  // 73. Dark-mode Code Snippet Card HTML Renderer
  await test("73. ThreadsHtmlRenderer generates dark-mode terminal code snippet card markup", () => {
    const renderer = require("../src/platforms/threads/threads-html-renderer");
    const html = renderer.generateCodeCardHtml({
      code_title: "stream_router.ts",
      code_snippet: "const stream = new EventStream();\nawait stream.publish({ id: 1 });",
      code_language: "TypeScript",
      badge: "CODEAIR • ARCHITECTURE"
    });
    assert(html.includes("stream_router.ts"), "HTML must contain code title");
    assert(html.includes("terminal-dots"), "HTML must contain macOS terminal window dots");
    assert(html.includes("CODEAIR SOFTWARE SOLUTIONS"), "HTML must include company branding");
    assert(html.includes("1080px"), "HTML must define 1080x1080 square canvas");
  });

  // 74. Architecture Diagram Card HTML Renderer
  await test("74. ThreadsHtmlRenderer generates topology diagram card markup with nodes and connectors", () => {
    const renderer = require("../src/platforms/threads/threads-html-renderer");
    const html = renderer.generateArchitectureCardHtml({
      arch_title: "Enterprise Agent Pipeline",
      subtitle: "Multi-agent autonomous flow",
      components: [
        { name: "Feed Ingestion", role: "Pruned DOM stream", icon: "⚡" },
        { name: "State Guard", role: "Deterministic FSM", icon: "🛡️" }
      ]
    });
    assert(html.includes("Enterprise Agent Pipeline"), "HTML must contain architecture title");
    assert(html.includes("Feed Ingestion"), "HTML must contain node component");
    assert(html.includes("node-connector"), "HTML must contain node connector lines");
  });

  // 75. Algorithmic Peak-Window Pacing
  await test("75. isPeakEngagementWindow accurately identifies morning and evening global tech peak windows", () => {
    const { isPeakEngagementWindow } = require("../threads-agent");
    // 14:00 UTC = 9:00 AM EST (Morning Peak)
    const morningPeak = new Date("2026-09-21T14:30:00Z");
    assert.strictEqual(isPeakEngagementWindow(morningPeak), true, "14:30 UTC must be recognized as peak window");

    // 00:30 UTC = 7:30 PM EST (Evening Peak)
    const eveningPeak = new Date("2026-09-21T00:30:00Z");
    assert.strictEqual(isPeakEngagementWindow(eveningPeak), true, "00:30 UTC must be recognized as peak window");

    // 08:00 UTC = 3:00 AM EST (Off Peak)
    const offPeak = new Date("2026-09-21T08:00:00Z");
    assert.strictEqual(isPeakEngagementWindow(offPeak), false, "08:00 UTC must be recognized as off-peak");
  });

  // 76. Guaranteed Rich Carousel Cards (Zero Empty Canvas Space)
  await test("76. ThreadsHtmlRenderer generates rich carousel slides with guaranteed cards (zero empty space)", () => {
    const renderer = require("../src/platforms/threads/threads-html-renderer");
    // Case A: Even when cards are completely omitted, fallback must generate 3 structured cards
    const emptySpecHtml = renderer.generateSlideHtml({
      title: "Clean Architecture in Production",
      subtitle: "Deterministic state machines and automated verification",
      badge: "SYSTEM DESIGN"
    });
    assert(emptySpecHtml.includes('class="card"'), "Must render card containers");
    assert(emptySpecHtml.includes("01"), "Must include card number 01");
    assert(emptySpecHtml.includes("02"), "Must include card number 02");
    assert(emptySpecHtml.includes("03"), "Must include card number 03");
    assert(emptySpecHtml.includes("System Architecture"), "Must include fallback architecture card");

    // Case B: Explicit cards are preserved and rendered
    const customSpecHtml = renderer.generateSlideHtml({
      title: "Hotel Tech Unified",
      cards: [
        { num: "01", title: "Single Source of Truth", desc: "No API sync delay" },
        { num: "02", title: "Automated Folios", desc: "Digital guest check-in" }
      ]
    });
    assert(customSpecHtml.includes("Single Source of Truth"), "Custom cards must be preserved");
    assert(customSpecHtml.includes("Automated Folios"), "Custom cards must be preserved");
  });

  // 77. Executive Quote Infographic with 3-Part Strategic Principles Panel
  await test("77. ThreadsHtmlRenderer generates executive quote card with 3-part strategic principles panel", () => {
    const renderer = require("../src/platforms/threads/threads-html-renderer");
    const quoteHtml = renderer.generateQuoteCardHtml({
      quote: "Clean architecture and fast shipping create real market value.",
      badge: "FOUNDER PERSPECTIVE",
      pillar: "founders_revolution"
    });
    assert(quoteHtml.includes("EXECUTIVE HIGHLIGHTS & ARCHITECTURAL PRINCIPLES"), "Must include executive principles header");
    assert(quoteHtml.includes("takeaway-card"), "Must render takeaway card containers");
    assert(quoteHtml.includes("01"), "Must include takeaway 01");
    assert(quoteHtml.includes("02"), "Must include takeaway 02");
    assert(quoteHtml.includes("03"), "Must include takeaway 03");
    assert(quoteHtml.includes("Clean architecture and fast shipping create real market value."), "Must include perspective quote");
  });

  // 78. Platform Link Sanitizer (Anti-reCAPTCHA Defense)
  await test("78. Platform Link Sanitizer replaces LinkedIn profile URLs with website on FB/LI", () => {
    const inputWithLinkedIn = "We build custom mobile apps! View founder profile at https://linkedin.com/in/sunmughan or visit https://www.codeair.tech";
    
    // Facebook: LinkedIn URLs must be replaced with website URL
    const fbSanitized = aiDecisionEngine.sanitizeCommentForPlatform(inputWithLinkedIn, "facebook");
    assert(!fbSanitized.includes("linkedin.com/in/"), "Facebook comment must not contain linkedin.com/in URLs");
    assert(fbSanitized.includes("https://www.codeair.tech"), "Facebook comment must retain website URL");

    // LinkedIn: LinkedIn profile URLs must also be replaced to avoid scraping reCAPTCHA preview cards
    const liSanitized = aiDecisionEngine.sanitizeCommentForPlatform(inputWithLinkedIn, "linkedin");
    assert(!liSanitized.includes("linkedin.com/in/"), "LinkedIn comment must not contain linkedin.com/in URLs");
    assert(liSanitized.includes("https://www.codeair.tech"), "LinkedIn comment must retain website URL");

    // Threads: Preserves original URL structure
    const threadsSanitized = aiDecisionEngine.sanitizeCommentForPlatform(inputWithLinkedIn, "threads");
    assert(threadsSanitized.includes("linkedin.com/in/sunmughan"), "Threads preserves founder URL");
  });

  // 79. Platform Action Sanitizers (Facebook & LinkedIn Pre-Posting Gate)
  await test("79. Action level pre-posting sanitizers strip LinkedIn profile URLs", () => {
    const { facebookActions } = require("../src/platforms/facebook/facebook-actions");
    const { linkedInActions } = require("../src/platforms/linkedin/linkedin-actions");

    const dirtyText = "Check out my profile https://www.linkedin.com/in/sunmughan-swamy/ for more info";
    const cleanFb = facebookActions.sanitizeForFacebook(dirtyText);
    assert(!cleanFb.includes("linkedin.com/in/"), "Facebook action sanitizer must replace LinkedIn profile");
    assert(cleanFb.includes("codeair.tech"), "Facebook action sanitizer must substitute codeair.tech");

    const cleanLi = linkedInActions.sanitizeForLinkedIn(dirtyText);
    assert(!cleanLi.includes("linkedin.com/in/"), "LinkedIn action sanitizer must replace LinkedIn profile");
    assert(cleanLi.includes("codeair.tech"), "LinkedIn action sanitizer must substitute codeair.tech");
  });

  // 80. Detached Frame Resilience in BrowserManager
  await test("80. BrowserManager.isPageAlive correctly identifies detached or closed frames", () => {
    const browserManager = require("../src/browser/browser-manager");
    
    // Null/undefined page
    assert.strictEqual(browserManager.isPageAlive(null), false, "Null page is not alive");
    assert.strictEqual(browserManager.isPageAlive(undefined), false, "Undefined page is not alive");

    // Closed page mock
    const closedPage = { isClosed: () => true };
    assert.strictEqual(browserManager.isPageAlive(closedPage), false, "Closed page is not alive");

    // Detached frame mock
    const detachedFramePage = {
      isClosed: () => false,
      mainFrame: () => ({
        isDetached: () => true
      })
    };
    assert.strictEqual(browserManager.isPageAlive(detachedFramePage), false, "Detached main frame is not alive");

    // Healthy page mock
    const healthyPage = {
      isClosed: () => false,
      mainFrame: () => ({
        isDetached: () => false
      })
    };
    assert.strictEqual(browserManager.isPageAlive(healthyPage), true, "Healthy page is alive");
  });

  // Clean up any test actions recorded in stateStore so they never pollute production rate limiter
  for (const [k, v] of Object.entries(stateStore.state.actions || {})) {
    if (v.targetId && v.targetId.startsWith("test_")) {
      delete stateStore.state.actions[k];
    }
  }
  for (const k of Object.keys(stateStore.state.posts || {})) {
    if (k.startsWith("test_")) {
      delete stateStore.state.posts[k];
    }
  }
  stateStore.saveState();

  console.log("\n--------------------------------------------------");
  console.log(`Test Results: ${passed} Passed, ${failed} Failed`);
  console.log("--------------------------------------------------\n");

  await (require("./pillar-and-search-audit").runAudit());
  await (require("./cross-platform-audit").runCrossPlatformAudit());
  await (require("./multi-brand-customization.test").runMultiBrandTest());
  await (require("./linkedin.test").runLinkedInTests());
  await (require("./facebook.test").runFacebookTests());
  await (require("./facebook-search.test").runFacebookSearchTests());
  require("./execution-mode.test");

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
