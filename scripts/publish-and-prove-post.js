/**
 * scripts/publish-and-prove-post.js
 * Publishes a simple-English 6-hour scheduled post targeting SaaS founders, developers, designers, and consultants,
 * verifies it on the profile, and captures a high-res screenshot artifact.
 */

const path = require("path");
const fs = require("fs");
const browserManager = require("../src/browser/browser-manager");
const threadsPoster = require("../src/platforms/threads/threads-poster");
const stateStore = require("../src/storage/state-store");

const ARTIFACTS_DIR = "/home/sunmughan/.gemini/antigravity-ide/brain/fa740c9d-a98a-4469-be8f-001c56309f77";

async function main() {
  const postText = "To all SaaS founders, developers, UI/UX designers, and startup builders:\n\nBuilding a great product comes down to 3 simple things:\n1. Clean design that users get in 5 seconds.\n2. Fast, reliable code that never crashes.\n3. Talking to real users every day.\n\nYou don't need 50 features to launch. Start small, launch fast, and iterate.\n\nWhat are you building this week? Let's connect below!";
  
  console.log("Post Text:\n" + postText);
  console.log("\n=== 2. PUBLISHING POST VIA THREADS POSTER ===");
  
  const res = await threadsPoster.publishEngagingPost({
    pillar: "founders_revolution",
    format: "TEXT_ONLY",
    text: postText
  });
  
  console.log("Post result:", res);
  
  if (!res || !res.verified) {
    console.error("Post verification failed:", res ? res.reason : "unknown");
    process.exit(1);
  }
  
  console.log("\n=== 3. CAPTURING PROFILE SCREENSHOT EVIDENCE ===");
  const page = await browserManager.getThreadsPage();
  await page.goto("https://www.threads.com/@sunmughan", { waitUntil: "networkidle2", timeout: 35000 }).catch(async () => {
    await page.goto("https://www.threads.com/@sunmughan", { waitUntil: "domcontentloaded", timeout: 35000 });
  });
  
  await new Promise(r => setTimeout(r, 4000));
  
  const proofScreenshotPath = path.join(ARTIFACTS_DIR, "profile_scheduled_post_proof.png");
  await page.screenshot({ path: proofScreenshotPath, fullPage: false });
  console.log("✅ Proof screenshot saved to:", proofScreenshotPath);
  
  browserManager.disconnect();
  console.log("\n=== POST PUBLISHING & PROFILE PROOF COMPLETE ===");
}

main().catch(err => {
  console.error("Error in publish-and-prove-post:", err);
  process.exit(1);
});
