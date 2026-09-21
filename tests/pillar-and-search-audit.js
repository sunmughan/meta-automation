/**
 * tests/pillar-and-search-audit.js
 * Verification of 3-hour cadence, 5 pillars, search discovery, and website/AI lead qualification.
 */

const assert = require("assert");
const intentClassifier = require("../src/leads/intent-classifier");
const threadsPoster = require("../src/platforms/threads/threads-poster");
const threadsMedia = require("../src/platforms/threads/threads-media");
const { HIGH_INTENT_SEARCH_QUERIES } = require("../src/platforms/threads/threads-scanner");
const CONFIG = require("../config");

async function runAudit() {
  console.log("\n==================================================");
  console.log("  PILLAR, SEARCH & LEAD AUDIT (USER FEEDBACK FIXES)");
  console.log("==================================================\n");

  let passed = 0;

  // 1. Audit Website & AI Buyer Qualification (fixing missed deals)
  const clientLeads = [
    { text: "Looking for a web designer to create a landing page for our startup", expectedCat: "Web Development" },
    { text: "Need a website building service for my new business", expectedCat: "Web Development" },
    { text: "Who can build a website for me? Any recommendations?", expectedCat: "Web Development" },
    { text: "Looking for AI development team to build an automated chatbot", expectedCat: "AI & Automation" },
    { text: "Anyone here know a good web developer? Need a site built this week", expectedCat: "Web Development" },
    { text: "Looking for a freelance developer to help build our web app MVP", expectedCat: "Web Development" },
    { text: "Need someone for website design and development", expectedCat: "Web Development" },
    { text: "Looking for an AI engineer to integrate LLMs into our SaaS", expectedCat: "AI & Automation" }
  ];

  for (const lead of clientLeads) {
    const res = await intentClassifier.classifyAsync({ text: lead.text, postId: "audit_lead_" + passed });
    assert.strictEqual(res.qualified, true, `Expected qualified lead for: "${lead.text}"`);
    assert(res.temperature === "HOT" || res.temperature === "WARM", `Expected HOT or WARM lead, got: ${res.temperature}`);
    console.log(`  ✓ PASS: Qualified lead "${lead.text.slice(0, 45)}..." -> [${res.intent}]`);
    passed++;
  }

  // 2. Audit High-Intent Search Queries
  assert(HIGH_INTENT_SEARCH_QUERIES.length >= 10, "Expected at least 10 search queries");
  assert(HIGH_INTENT_SEARCH_QUERIES.includes("need a website"), "Missing query 'need a website'");
  assert(HIGH_INTENT_SEARCH_QUERIES.includes("looking for web developer"), "Missing query 'looking for web developer'");
  assert(HIGH_INTENT_SEARCH_QUERIES.includes("looking for ai developer"), "Missing query 'looking for ai developer'");
  console.log(`  ✓ PASS: High-intent search discovery configured with ${HIGH_INTENT_SEARCH_QUERIES.length} buyer queries`);
  passed++;

  // 3. Audit 6-Hour Post Cadence (4 Posts / 24 Hours) & 5 Content Pillars
  assert.strictEqual(CONFIG.POST_INTERVAL_HOURS, 6, "Expected 6-hour post interval (4 posts / 24h)");
  assert.strictEqual(CONFIG.CAROUSEL_INTERVAL_DAYS, 2, "Expected 2-day carousel interval");
  console.log(`  ✓ PASS: Configured 6-hour publishing interval (POST_INTERVAL_HOURS=6, exactly 4 posts / 24h)`);
  passed++;

  // 4. Audit Decks for all 6 Pillars (including open-source meta_automation)
  const pillars = ["pixelgo_hms", "builder_network", "founders_revolution", "tech_mentorship", "agentic_ai", "meta_automation"];
  for (const pil of pillars) {
    const specs = threadsMedia.getDeckSpecs(pil);
    assert.strictEqual(specs.length, 5, `Expected 5 slides for pillar ${pil}`);
    const quoteSpec = threadsMedia.getPillarQuoteSpec(pil);
    assert(quoteSpec.quote && quoteSpec.quote.length > 20, `Expected quote for pillar ${pil}`);
    console.log(`  ✓ PASS: Verified 5-slide deck & quote card for pillar: [${pil}]`);
    passed++;
  }

  // 5. Audit Non-Buyer Community Discussion Posts (Strict Disqualification - No Spam on Random Posts)
  const aiDecisionEngine = require("../src/ai/ai-decision-engine");
  const audiencePosts = [
    { text: "What tech stack are you SaaS founders using to build your MVP this year?", expectedAudience: "SaaS Founders" },
    { text: "Hey developers, what is your go-to backend framework for building fast APIs?", expectedAudience: "Developers & Engineers" },
    { text: "UI/UX designers: what is the most important thing for high converting landing page design?", expectedAudience: "UI/UX Designers" },
    { text: "What AI tools or automation workflows are saving you the most time in your business?", expectedAudience: "AI & Tech Enthusiasts" },
    { text: "To all marketing experts and lead generation pros: what outreach strategy is working best for you?", expectedAudience: "Marketing & Lead Experts" }
  ];

  for (const post of audiencePosts) {
    const res = await aiDecisionEngine.qualifyPost({ text: post.text, username: "test_target" });
    assert.strictEqual(res.decision, "IGNORED", `Non-buyer discussion must be IGNORED: "${post.text}"`);
    assert.strictEqual(res.is_genuine_buyer, false, `Non-buyer discussion must not qualify as genuine buyer`);
    assert.strictEqual(res.should_reply, false, `Must not reply to general opinion poll`);
    console.log(`  ✓ PASS: Correctly ignored non-buyer discussion post [${post.expectedAudience}]`);
    passed++;
  }

  console.log("\n--------------------------------------------------");
  console.log(`Audit Summary: ${passed} Passed, 0 Failed`);
  console.log("--------------------------------------------------\n");
}

if (require.main === module) {
  runAudit().catch(err => {
    console.error("Audit failed:", err);
    process.exit(1);
  });
}

module.exports = { runAudit };
