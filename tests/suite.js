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
    assert.strictEqual(decision.matched_capability, "Web Development", "Must match Web Development");
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

  // 39. Pure Antigravity AI Runtime Architecture
  await test("39. Pure Antigravity AI Runtime Architecture (No REST or API key leaks)", () => {
    const aiRuntimeModule = require("../src/ai/ai-runtime");
    const configModule = require("../config");

    assert.strictEqual(configModule.AI_RUNTIME, "antigravity", "AI_RUNTIME must be antigravity");
    assert.strictEqual(configModule.GEMINI_API_KEY, undefined, "GEMINI_API_KEY must not exist in config");
    assert.strictEqual(typeof aiRuntimeModule.callGeminiRest, "undefined", "callGeminiRest must not exist on ai-runtime");
    assert.strictEqual(typeof aiRuntimeModule.callAi, "function", "callAi must be exposed as primary entry point");
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
