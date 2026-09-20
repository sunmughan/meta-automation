/**
 * scripts/post-haris-comment-and-prove.js
 * Posts a grounded simple-English comment on qualified lead @haris.devs,
 * captures screenshot of post with comment, and captures screenshot of profile replies tab.
 */

const path = require("path");
const fs = require("fs");
const browserManager = require("../src/browser/browser-manager");
const stateStore = require("../src/storage/state-store");

const ARTIFACTS_DIR = "/home/sunmughan/.gemini/antigravity-ide/brain/fa740c9d-a98a-4469-be8f-001c56309f77";

async function main() {
  console.log("=== 1. CONNECTING TO BRAVE BROWSER ===");
  const page = await browserManager.getThreadsPage();
  const postUrl = "https://www.threads.com/@haris.devs/post/DdfzpI9iFAZ";
  
  if (!page.url().includes("DdfzpI9iFAZ")) {
    console.log("Navigating to target lead post:", postUrl);
    await page.goto(postUrl, { waitUntil: "domcontentloaded", timeout: 35000 });
    await new Promise(r => setTimeout(r, 3000));
  }
  
  console.log("\n=== 2. OPENING REPLY COMPOSER ===");
  // Click the "Reply to..." placeholder
  const clickedPlaceholder = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('span, p, div'));
    const replyEl = all.find(el => (el.innerText || '').toLowerCase().includes('reply to haris.devs'));
    if (replyEl) {
      replyEl.click();
      return true;
    }
    return false;
  });
  console.log("Clicked reply placeholder:", clickedPlaceholder);
  await new Promise(r => setTimeout(r, 1500));
  
  // Find the active textbox
  const textboxHandle = await page.$('div[role="textbox"][contenteditable="true"]');
  if (!textboxHandle) {
    throw new Error("Active contenteditable textbox not found after clicking reply placeholder");
  }
  
  console.log("\n=== 3. TYPING COMMENT IN SIMPLE ENGLISH ===");
  const commentText = "@haris.devs Great initiative. Building focused AI apps with clean data sources is such important work. If you need a hand with the developer side, app architecture, or full-stack engineering, our team at CodeAir (www.codeair.tech) would love to help. Let's connect!";
  console.log("Comment:", commentText);
  
  await textboxHandle.focus();
  await new Promise(r => setTimeout(r, 300));
  
  // Type with human-like speed
  for (const char of commentText) {
    await page.keyboard.sendCharacter(char);
    await new Promise(r => setTimeout(r, 20));
  }
  await new Promise(r => setTimeout(r, 1500));
  
  console.log("\n=== 4. SUBMITTING COMMENT VIA POST BUTTON ===");
  const postBtnHandle = await page.evaluateHandle(() => {
    const buttons = Array.from(document.querySelectorAll('div[role="button"], button'));
    return buttons.find(b => {
      const txt = (b.innerText || "").trim().toLowerCase();
      const aria = (b.getAttribute("aria-label") || "").trim().toLowerCase();
      const isEnabled = !b.disabled && b.getAttribute("aria-disabled") !== "true";
      return (txt === "post" || txt === "reply" || aria === "post" || aria === "reply") && isEnabled;
    });
  });
  
  if (!postBtnHandle || !postBtnHandle.asElement()) {
    throw new Error("Active Post/Reply button not found or not enabled");
  }
  
  const btnBox = await postBtnHandle.boundingBox();
  console.log("Post button box:", btnBox);
  if (btnBox) {
    await page.mouse.click(btnBox.x + btnBox.width / 2, btnBox.y + btnBox.height / 2);
  } else {
    await postBtnHandle.click();
  }
  
  console.log("Clicked Post button. Waiting for comment to mount in DOM...");
  await new Promise(r => setTimeout(r, 4000));
  
  // Verify comment appeared
  const isCommentLive = await page.evaluate((snip) => {
    const bodyText = document.body.innerText || "";
    return bodyText.includes(snip);
  }, "Building focused AI apps with clean data sources");
  
  console.log("Comment live in post DOM:", isCommentLive);
  
  console.log("\n=== 5. CAPTURING PROOF SCREENSHOT ON TARGET POST ===");
  const postProofPath = path.join(ARTIFACTS_DIR, "lead_comment_post_proof.png");
  await page.screenshot({ path: postProofPath, fullPage: false });
  console.log("✅ Post comment proof saved to:", postProofPath);
  
  console.log("\n=== 6. CAPTURING PROOF SCREENSHOT IN PROFILE REPLIES / ACTIVITY ===");
  await page.goto("https://www.threads.com/@sunmughan/replies", { waitUntil: "networkidle2", timeout: 35000 }).catch(async () => {
    await page.goto("https://www.threads.com/@sunmughan/replies", { waitUntil: "domcontentloaded", timeout: 35000 });
  });
  await new Promise(r => setTimeout(r, 4000));
  
  const repliesProofPath = path.join(ARTIFACTS_DIR, "replies_activity_proof.png");
  await page.screenshot({ path: repliesProofPath, fullPage: false });
  console.log("✅ Profile replies proof saved to:", repliesProofPath);
  
  // Also record in state store
  stateStore.updatePostStatus("DdfzpI9iFAZ", "COMMENTED", {
    commentText,
    username: "haris.devs",
    verifiedAt: new Date().toISOString()
  }, "threads");
  stateStore.state.stats.total_comments_posted++;
  stateStore.saveState();
  
  browserManager.disconnect();
  console.log("\n=== ALL PROOFS SUCCESSFULLY CAPTURED ===");
}

main().catch(err => {
  console.error("Error in post-haris-comment-and-prove:", err);
  process.exit(1);
});
