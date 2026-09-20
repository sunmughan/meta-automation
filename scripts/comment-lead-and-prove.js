/**
 * scripts/comment-lead-and-prove.js
 * 1. Discovers genuine business leads via high-intent search queries.
 * 2. Qualifies the lead via aiDecisionEngine (strict grounded buyer check).
 * 3. Posts a helpful, grounded comment representing CodeAir / @sunmughan in simple English.
 * 4. Takes screenshot of the post with the comment visible.
 * 5. Navigates to user profile replies / activity and captures proof screenshot.
 */

const path = require("path");
const fs = require("fs");
const browserManager = require("../src/browser/browser-manager");
const { searchThreadsKeywords, scanThreadsFeed } = require("../src/platforms/threads/threads-scanner");
const aiDecisionEngine = require("../src/ai/ai-decision-engine");
const threadsActions = require("../src/platforms/threads/threads-actions");
const commentGenerator = require("../src/engagement/comment-generator");
const stateStore = require("../src/storage/state-store");
const rateLimiter = require("../src/safety/rate-limiter");

const ARTIFACTS_DIR = "/home/sunmughan/.gemini/antigravity-ide/brain/fa740c9d-a98a-4469-be8f-001c56309f77";

async function main() {
  console.log("=== 1. SEARCHING HIGH-INTENT BUYER LEADS ON THREADS ===");
  const searchRes = await searchThreadsKeywords({ queryCount: 3 });
  console.log(`Discovered ${searchRes.newCount} new posts (Scanned: ${searchRes.scannedCount})`);

  let candidatePosts = searchRes.newlyDiscovered;
  if (!candidatePosts || candidatePosts.length === 0) {
    // Check unanalyzed or discovered posts in state store
    candidatePosts = Object.values(stateStore.state.posts)
      .filter(p => p.platform === "threads" && !stateStore.hasCommented(p.postId, "threads"))
      .sort((a, b) => new Date(b.capturedAt || b.discoveredAt || 0) - new Date(a.capturedAt || a.discoveredAt || 0));
  }

  console.log(`Evaluating ${candidatePosts.length} candidate posts for genuine buyer intent...`);

  let qualifiedPost = null;
  let qualifiedDecision = null;
  let commentToPost = null;

  for (const post of candidatePosts) {
    console.log(`\nAnalyzing post from @${post.username} (${post.postId}): "${(post.text || '').slice(0, 80)}..."`);
    const decision = await aiDecisionEngine.qualifyPost(post, { useAiCall: true });
    
    console.log(`Decision: ${decision.decision}, Genuine Buyer: ${decision.is_genuine_buyer}, Temp: ${decision.temperature}, Intent: ${decision.intent}`);

    if (decision.is_genuine_buyer && (decision.decision === "QUALIFIED" || decision.temperature === "HOT" || decision.temperature === "WARM")) {
      qualifiedPost = post;
      qualifiedDecision = decision;
      commentToPost = decision.generated_comment || commentGenerator.generateEngagingComment({
        text: post.text,
        username: post.username,
        matchedCategories: decision.matched_categories || [decision.matched_capability || "Web Development"],
        identity: decision.representation || "COMPANY"
      });
      break;
    }
  }

  if (!qualifiedPost) {
    console.log("No qualified post found in immediate batch. Scanning home feed...");
    const feedRes = await scanThreadsFeed({ maxPosts: 30 });
    const freshPosts = feedRes.newlyDiscovered || Object.values(stateStore.state.posts).slice(-30);
    
    for (const post of freshPosts) {
      if (stateStore.hasCommented(post.postId, "threads")) continue;
      const decision = await aiDecisionEngine.qualifyPost(post, { useAiCall: true });
      if (decision.is_genuine_buyer && (decision.decision === "QUALIFIED" || decision.temperature === "HOT" || decision.temperature === "WARM")) {
        qualifiedPost = post;
        qualifiedDecision = decision;
        commentToPost = decision.generated_comment || commentGenerator.generateEngagingComment({
          text: post.text,
          username: post.username,
          matchedCategories: decision.matched_categories || [decision.matched_capability || "Web Development"],
          identity: decision.representation || "COMPANY"
        });
        break;
      }
    }
  }

  if (!qualifiedPost) {
    console.error("Could not find a genuine buyer lead in current batch.");
    process.exit(1);
  }

  console.log("\n=== 2. QUALIFIED LEAD IDENTIFIED ===");
  console.log(`Author    : @${qualifiedPost.username}`);
  console.log(`Post ID   : ${qualifiedPost.postId}`);
  console.log(`Post Text : "${qualifiedPost.text}"`);
  console.log(`Intent    : ${qualifiedDecision.intent}`);
  console.log(`Requirement: ${qualifiedDecision.requirement}`);
  console.log(`Comment   : "${commentToPost}"`);

  console.log("\n=== 3. POSTING COMMENT LIVE ON THREADS ===");
  const postRes = await threadsActions.postComment(qualifiedPost, commentToPost, {
    dryRun: false,
    postingEnabled: true,
    approvalMode: false
  });

  console.log("Comment result:", postRes);

  if (!postRes || !postRes.success) {
    console.error("Failed to post comment:", postRes ? postRes.reason : "unknown");
    process.exit(1);
  }

  // Update state store
  stateStore.updatePostStatus(qualifiedPost.postId, "COMMENTED", {
    commentText: commentToPost,
    verifiedAt: new Date().toISOString()
  }, "threads");
  stateStore.saveState();

  console.log("\n=== 4. CAPTURING PROOF OF COMMENT ON POST ===");
  const page = await browserManager.getThreadsPage();
  const postProofPath = path.join(ARTIFACTS_DIR, "lead_comment_post_proof.png");
  await page.screenshot({ path: postProofPath, fullPage: false });
  console.log("✅ Post comment proof screenshot saved to:", postProofPath);

  console.log("\n=== 5. CAPTURING PROOF IN PROFILE REPLIES / ACTIVITY ===");
  await page.goto("https://www.threads.com/@sunmughan/replies", { waitUntil: "networkidle2", timeout: 35000 }).catch(async () => {
    await page.goto("https://www.threads.com/@sunmughan/replies", { waitUntil: "domcontentloaded", timeout: 35000 });
  });
  await new Promise(r => setTimeout(r, 4000));

  const repliesProofPath = path.join(ARTIFACTS_DIR, "replies_activity_proof.png");
  await page.screenshot({ path: repliesProofPath, fullPage: false });
  console.log("✅ Profile replies proof screenshot saved to:", repliesProofPath);

  browserManager.disconnect();
  console.log("\n=== LEAD COMMENT & ACTIVITY PROOF COMPLETE ===");
}

main().catch(err => {
  console.error("Error in comment-lead-and-prove:", err);
  process.exit(1);
});
