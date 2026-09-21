/**
 * tests/facebook-search.test.js
 * Unit test suite for Facebook Search & Public Group Discovery Engine.
 * Tests query builders, group topic catalogs, recency filters, and lead capture.
 */

const assert = require("assert");
const {
  facebookSearchEngine,
  HIGH_INTENT_FACEBOOK_QUERIES,
  HIGH_INTENT_GROUP_TOPICS,
  searchFacebookPosts,
  searchFacebookGroupPosts
} = require("../src/platforms/facebook/facebook-search");
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

async function runFacebookSearchTests() {
  console.log("\n==================================================");
  console.log("  FACEBOOK SEARCH & GROUP ENGINE AUDIT SUITE");
  console.log("==================================================\n");

  // 1. High-intent queries catalog
  test("1. High-intent Facebook queries contain required buyer patterns", () => {
    assert(Array.isArray(HIGH_INTENT_FACEBOOK_QUERIES), "Must be an array");
    assert(HIGH_INTENT_FACEBOOK_QUERIES.length >= 10, "Must have at least 10 high-intent queries");
    const sample = HIGH_INTENT_FACEBOOK_QUERIES.join(" ").toLowerCase();
    assert(sample.includes("web developer"), "Must include web developer query");
    assert(sample.includes("software"), "Must include software query");
    assert(sample.includes("mvp"), "Must include MVP query");
    assert(sample.includes("flutter") || sample.includes("app"), "Must include mobile app query");
  });

  // 2. High-intent group topics catalog
  test("2. High-intent group topics catalog includes founder and freelance niches", () => {
    assert(Array.isArray(HIGH_INTENT_GROUP_TOPICS), "Must be an array");
    assert(HIGH_INTENT_GROUP_TOPICS.length >= 5, "Must have at least 5 group topics");
    const sample = HIGH_INTENT_GROUP_TOPICS.join(" ").toLowerCase();
    assert(sample.includes("saas") || sample.includes("startup"), "Must include SaaS/Startup founders");
    assert(sample.includes("freelance") || sample.includes("business"), "Must include Freelance/Business owners");
  });

  // 3. Search URL builder
  test("3. Search URL builder correctly encodes queries and targets post search", () => {
    const url = facebookSearchEngine.buildSearchUrl("looking for a web developer");
    assert.strictEqual(url, "https://www.facebook.com/search/posts/?q=looking%20for%20a%20web%20developer");
  });

  // 4. StateStore integration with Facebook Search source
  test("4. Discovered Facebook search leads are registered with correct metadata", () => {
    const testPostId = `fb_test_srch_${Date.now()}`;
    stateStore.addDiscoveredPost({
      postId: testPostId,
      username: "alex_startup_ceo",
      url: `https://www.facebook.com/groups/saas/posts/${testPostId}`,
      text: "Need a full-stack developer to build our SaaS dashboard and Stripe billing.",
      source: "FACEBOOK_KEYWORD_SEARCH",
      groupName: "SaaS Founders & Entrepreneurs",
      query: "looking for software development agency",
      platform: "facebook"
    }, "facebook");

    const post = stateStore.getPost(testPostId, "facebook");
    assert(post !== null, "Post must exist in state store");
    assert.strictEqual(post.source, "FACEBOOK_KEYWORD_SEARCH", "Source must match");
    assert.strictEqual(post.groupName, "SaaS Founders & Entrepreneurs", "Group name must match");
    assert.strictEqual(post.platform, "facebook", "Platform must be facebook");

    // Clean up
    delete stateStore.state.posts[testPostId];
    delete stateStore.state.posts[`facebook:${testPostId}`];
    stateStore.saveState();
  });

  // 5. Function exports
  test("5. Facebook search module exports all expected methods", () => {
    assert.strictEqual(typeof searchFacebookPosts, "function");
    assert.strictEqual(typeof searchFacebookGroupPosts, "function");
    assert.strictEqual(typeof facebookSearchEngine.searchFacebookPosts, "function");
    assert.strictEqual(typeof facebookSearchEngine.searchFacebookGroupPosts, "function");
  });

  console.log("\n--------------------------------------------------");
  console.log(`Facebook Search Results: ${passed} Passed, ${failed} Failed`);
  console.log("--------------------------------------------------\n");

  if (failed > 0) process.exit(1);
}

if (require.main === module) {
  runFacebookSearchTests().catch(err => {
    console.error("Facebook search test crashed:", err);
    process.exit(1);
  });
}

module.exports = { runFacebookSearchTests };
