/**
 * scripts/sanitize-state.js
 * Sanitizes threads-engagement-state.json and purges invalid/corrupted leads
 * against the new strict buyer-intent classifier.
 */

const fs = require("fs");
const path = require("path");
const intentClassifier = require("../src/leads/intent-classifier");

const STATE_PATH = path.resolve(__dirname, "../threads-engagement-state.json");

if (!fs.existsSync(STATE_PATH)) {
  console.log("No state file found at", STATE_PATH);
  process.exit(0);
}

const state = JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
const posts = state.posts || {};
let purgedCount = 0;
let reclassifiedCount = 0;

console.log(`Auditing ${Object.keys(posts).length} posts in state.posts...`);

const taintedPostIds = new Set(["DLSMWpJsfS4", "DJBzuiktSb2", "DdcU5U7DsoJ", "DdQxVp0Dy9Q"]);

for (const [key, post] of Object.entries(posts)) {
  const isTainted = taintedPostIds.has(post.postId) || taintedPostIds.has(key.replace(/^threads:/, ""));
  const evaluation = intentClassifier.classify(post);

  if (isTainted || !evaluation.qualified || !evaluation.is_genuine_buyer) {
    if (post.status === "COMMENTED" || post.status === "COMMENT_PENDING" || post.status === "ANALYZING") {
      post.status = "IGNORED";
      post.leadType = evaluation.lead_type || "DISQUALIFIED";
      post.qualificationReason = evaluation.reason;
      delete post.commentText;
      delete post.comment;
      reclassifiedCount++;
    }
  }

  if (isTainted) {
    post.status = "DISQUALIFIED";
    purgedCount++;
  }
}

// Clean comments list in state.comments
if (state.comments) {
  for (const id of taintedPostIds) {
    if (state.comments[id]) {
      delete state.comments[id];
      console.log(`Purged tainted comment record for ${id}`);
    }
    const key = `threads:${id}`;
    if (state.comments[key]) {
      delete state.comments[key];
      console.log(`Purged tainted comment record for ${key}`);
    }
  }
}

// Recalculate stats
let totalDiscovered = 0;
let totalQualified = 0;
let totalIgnored = 0;

for (const p of Object.values(posts)) {
  totalDiscovered++;
  if (p.status === "COMMENT_PENDING" || (p.leadType === "PROJECT_BUYER" && p.relevanceScore >= 80)) {
    totalQualified++;
  } else {
    totalIgnored++;
  }
}

state.stats = state.stats || {};
state.stats.total_discovered = totalDiscovered;
state.stats.total_qualified = totalQualified;
state.stats.total_ignored = totalIgnored;
state.stats.total_comments_posted = 0; // reset live comment count

fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), "utf8");
console.log(`Sanitization complete:
  - Tainted posts purged: ${purgedCount}
  - Inappropriate leads reclassified to IGNORED: ${reclassifiedCount}
  - Total tracked: ${totalDiscovered}
  - Strictly qualified remaining: ${totalQualified}
  - Correctly ignored: ${totalIgnored}`);
