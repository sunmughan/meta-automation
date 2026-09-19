/**
 * threads-agent.js
 * Primary Unified CLI Orchestrator for CodeAir Threads + Instagram AI System.
 *
 * Supported Commands:
 *   node threads-agent.js auth      - Check Threads & Instagram authentication in Brave
 *   node threads-agent.js scan      - Scan new posts from authenticated feed(s)
 *   node threads-agent.js analyze   - Qualify leads and synthesize detailed, engaging comments
 *   node threads-agent.js approve   - Review pending comments/actions and approve/reject
 *   node threads-agent.js replies   - Process incoming comment replies
 *   node threads-agent.js dms       - Process incoming Direct Messages
 *   node threads-agent.js run       - Continuous autonomous / approval orchestrator loop
 *   node threads-agent.js status    - Display comprehensive system, rate-limit & engagement report
 *   node threads-agent.js test      - Run automated diagnostic test suite
 */

const readline = require("readline");
const CONFIG = require("./config");
const browserManager = require("./src/browser/browser-manager");
const { checkThreadsAuth } = require("./src/platforms/threads/threads-auth");
const { checkInstagramAuth } = require("./src/platforms/instagram/instagram-auth");
const { scanThreadsFeed, refreshThreadsFeed, checkSidebarBadges, searchThreadsKeywords } = require("./src/platforms/threads/threads-scanner");
const { scanInstagramFeed } = require("./src/platforms/instagram/instagram-feed");
const aiDecisionEngine = require("./src/ai/ai-decision-engine");
const threadsActions = require("./src/platforms/threads/threads-actions");
const threadsPoster = require("./src/platforms/threads/threads-poster");
const threadsActivityWatcher = require("./src/platforms/threads/threads-activity");
const replyMonitor = require("./src/engagement/reply-monitor");
const dmMonitor = require("./src/engagement/dm-monitor");
const stateStore = require("./src/storage/state-store");
const rateLimiter = require("./src/safety/rate-limiter");
const commentGenerator = require("./src/engagement/comment-generator");
const logger = require("./src/logging/logger");

async function commandAuth() {
  console.log("\n==============================================");
  console.log("       SESSION AUTHENTICATION INSPECTION");
  console.log("==============================================");
  const threadsAuth = await checkThreadsAuth({ printResult: true });
  const igAuth = await checkInstagramAuth({ printResult: true });
  browserManager.disconnect();
  return (threadsAuth.isAuthenticated || igAuth.isAuthenticated) ? 0 : 1;
}

async function commandScan(options = {}) {
  const platform = (process.argv[3] || options.platform || "threads").toLowerCase();
  console.log("\n==============================================");
  console.log(`         FEED SCAN (${platform.toUpperCase()})`);
  console.log("==============================================");

  try {
    let res = null;
    if (platform === "instagram") {
      res = await scanInstagramFeed({ maxPosts: CONFIG.MAX_POSTS_PER_SCAN });
    } else {
      res = await scanThreadsFeed({ maxPosts: CONFIG.MAX_POSTS_PER_SCAN });
    }

    console.log(`\nScan Summary:`);
    console.log(`  Platform        : ${platform}`);
    console.log(`  Visible Posts   : ${res.scannedCount}`);
    console.log(`  Newly Discovered: ${res.newCount}`);
    console.log(`  Total In State  : ${Object.keys(stateStore.state.posts).length}`);
    console.log("==============================================\n");
    return 0;
  } catch (err) {
    console.error("❌ Feed scan failed:", err.message);
    return 1;
  } finally {
    browserManager.disconnect();
  }
}

async function commandAnalyze(options = {}) {
  const maxLiveComments = options.maxLiveComments !== undefined ? options.maxLiveComments : 2;
  let liveCommentsPosted = 0;

  console.log("\n==============================================");
  console.log("       AI LEAD QUALIFICATION & COMMENT SYNTHESIS");
  console.log("==============================================");
  console.log(`AI Model     : ${CONFIG.MODEL}`);
  console.log(`Approval Mode: ${CONFIG.APPROVAL_MODE ? "ENABLED" : "DISABLED"}`);
  console.log(`Dry Run      : ${CONFIG.DRY_RUN ? "ENABLED" : "DISABLED"}\n`);

  const unanalyzed = Object.values(stateStore.state.posts)
    .filter(p => (p.status === "DISCOVERED" || p.status === "COMMENT_PENDING") && !stateStore.hasCommented(p.postId, p.platform))
    .sort((a, b) => new Date(b.discoveredAt || 0) - new Date(a.discoveredAt || 0));

  console.log(`Found ${unanalyzed.length} posts pending qualification/posting...\n`);

  let hotCount = 0;
  let warmCount = 0;
  let ignoredCount = 0;

  for (let i = 0; i < unanalyzed.length; i++) {
    const post = unanalyzed[i];
    console.log(`[${i + 1}/${unanalyzed.length}] Evaluating @${post.username} (${post.postId})...`);

    let commentToPost = post.commentText;
    let isQualified = false;
    let temperature = post.temperature || "WARM";
    let relevanceScore = post.relevanceScore || 80;
    if (post.status === "COMMENT_PENDING") {
      isQualified = true;
      // Always regenerate fresh unique variation with author handle to prevent duplicate hash blocking
      commentToPost = commentGenerator.generateEngagingComment({
        text: post.text,
        username: post.username,
        matchedCategories: post.matchedServices || [],
        identity: post.identity || "COMPANY"
      });
      stateStore.updatePostStatus(post.postId, "ANALYZING", {}, post.platform || "threads");
      const decision = await aiDecisionEngine.qualifyPost(post, { useAiCall: true });
      console.log(`  🤖 [AI Screening]: ${decision.is_genuine_buyer ? "QUALIFIED BUYER" : "IGNORED"} (${decision.lead_type || "NONE"}) - ${decision.reason}`);
      if (decision.is_genuine_buyer && (decision.temperature === "HOT" || decision.temperature === "WARM")) {
        isQualified = true;
        temperature = decision.temperature;
        relevanceScore = decision.relevance_score;
        commentToPost = decision.generated_comment;
        stateStore.updatePostStatus(post.postId, "COMMENT_PENDING", {
          leadType: decision.lead_type,
          matchedServices: decision.matched_services,
          relevanceScore: decision.relevance_score,
          temperature: decision.temperature,
          identity: decision.identity,
          commentText: decision.generated_comment,
          qualificationReason: decision.reason
        }, post.platform || "threads");
        stateStore.state.stats.total_qualified++;
        stateStore.saveState();
      } else {
        ignoredCount++;
        console.log(`  ⚪ IGNORED - ${decision.reason}\n`);
        stateStore.updatePostStatus(post.postId, "IGNORED", {
          leadType: decision.lead_type,
          qualificationReason: decision.reason
        }, post.platform || "threads");
        continue;
      }
    }

    if (isQualified) {
      if (temperature === "HOT") hotCount++;
      else warmCount++;

      console.log(`  🔥 QUALIFIED (${temperature}) - Score: ${relevanceScore}`);
      console.log(`  Comment  :\n    "${commentToPost}"\n`);

      // If APPROVAL_MODE is false and LIVE is enabled, post comment live
      if (!CONFIG.APPROVAL_MODE && CONFIG.POSTING_ENABLED && !CONFIG.DRY_RUN) {
        if (liveCommentsPosted < maxLiveComments) {
          console.log(`  🚀 Posting live comment on @${post.username}'s post...`);
          const postRes = await threadsActions.postComment(post, commentToPost);
          if (postRes.success) {
            liveCommentsPosted++;
            stateStore.updatePostStatus(post.postId, "COMMENTED", { commentText: commentToPost }, post.platform || "threads");
            stateStore.state.stats.total_comments_posted++;
            stateStore.saveState();
            console.log(`  ✅ Live comment posted successfully on @${post.username}'s post!`);
          }
          await new Promise(r => setTimeout(r, 4000));
        } else {
          console.log(`  ⏳ Comment queued for next cycle (Cycle limit of ${maxLiveComments} reached)`);
        }
      }
    }
  }

  console.log("==============================================");
  console.log("            ANALYSIS COMPLETE");
  console.log("==============================================");
  console.log(`  HOT Qualified  : ${hotCount}`);
  console.log(`  WARM Qualified : ${warmCount}`);
  console.log(`  Ignored        : ${ignoredCount}`);
  console.log(`  Pending Review : ${stateStore.getPendingApprovals().length}`);
  console.log("==============================================\n");
  return 0;
}

async function commandApprove() {
  console.log("\n==============================================");
  console.log("          HUMAN APPROVAL INTERFACE");
  console.log("==============================================");

  const pending = stateStore.getPendingApprovals();
  if (pending.length === 0) {
    console.log("✓ No pending comments awaiting review.\n");
    return 0;
  }

  console.log(`Found ${pending.length} pending comments for review.\n`);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const question = (prompt) => new Promise(res => rl.question(prompt, res));

  for (let i = 0; i < pending.length; i++) {
    const post = pending[i];
    console.log("----------------------------------------------");
    console.log(`[${i + 1}/${pending.length}] TARGET: @${post.username} (${post.platform || "threads"})`);
    console.log(`POST URL: ${post.url}`);
    console.log(`POST TEXT:\n"${post.text}"\n`);
    console.log(`SERVICE MATCH : ${post.matchedServices ? post.matchedServices.join(", ") : "N/A"}`);
    console.log(`IDENTITY      : ${post.identity || "COMPANY"}`);
    console.log(`REASON        : ${post.qualificationReason || "Qualified project lead"}`);
    console.log(`PROPOSED COMMENT:\n\x1b[32m"${post.commentText}"\x1b[0m\n`);

    const ans = (await question("Action: [A]pprove | [R]eject | [S]kip | [Q]uit > ")).trim().toUpperCase();

    if (ans === "A") {
      console.log("✓ Approved!");
      if (CONFIG.POSTING_ENABLED && !CONFIG.DRY_RUN) {
        console.log("Posting comment live...");
        await threadsActions.postComment(post, post.commentText, { dryRun: false, approvalMode: false });
      } else {
        console.log(`[DRY RUN] Marked approved in state.`);
        stateStore.recordComment(post.postId, {
          username: post.username,
          url: post.url,
          comment: post.commentText,
          status: "APPROVED_SIMULATED"
        }, post.platform || "threads");
      }
    } else if (ans === "R") {
      console.log("❌ Rejected. Post marked as IGNORED.");
      stateStore.updatePostStatus(post.postId, "IGNORED", { rejectedByUser: true }, post.platform || "threads");
    } else if (ans === "Q") {
      break;
    } else {
      console.log("⏭ Skipped for now.");
    }
    console.log("");
  }

  rl.close();
  return 0;
}

async function commandStatus() {
  console.log("\n==============================================");
  console.log("    CODEAIR THREADS + INSTAGRAM AGENT STATUS");
  console.log("==============================================");
  console.log(`Configuration:`);
  console.log(`  Operational Mode : DRY_RUN=${CONFIG.DRY_RUN}, APPROVAL_MODE=${CONFIG.APPROVAL_MODE}`);
  console.log(`  Live Posting     : ${CONFIG.POSTING_ENABLED ? "ENABLED" : "DISABLED (Safety Locked)"}`);
  console.log(`  AI Runtime       : ${CONFIG.AI_RUNTIME} (Model: ${CONFIG.MODEL})`);
  console.log(`  CDP Endpoint     : ${CONFIG.CDP_URL}`);
  console.log(`  Display          : ${CONFIG.DISPLAY}`);
  console.log(`\nRate Limits:`);
  console.log(`  Max New Post Comments/hr : ${CONFIG.MAX_NEW_POST_REPLIES_PER_HOUR}`);
  console.log(`  Max Total Replies/hr     : ${CONFIG.MAX_TOTAL_REPLIES_PER_HOUR}`);
  console.log(`  Max DMs/hr               : ${CONFIG.MAX_DM_REPLIES_PER_HOUR}`);
  console.log(`\nEngagement State:`);
  console.log(`  Total Scanned Posts      : ${stateStore.state.stats.total_scanned}`);
  console.log(`  Total Qualified Leads    : ${stateStore.state.stats.total_qualified}`);
  console.log(`  Pending Approvals        : ${stateStore.getPendingApprovals().length}`);
  console.log(`  Comments Posted/Simulated: ${stateStore.state.stats.total_comments_posted}`);
  console.log(`  Replies Handled          : ${stateStore.state.stats.total_replies_handled}`);
  console.log(`  DMs Handled              : ${stateStore.state.stats.total_dms_handled}`);
  console.log(`  Active Conversations     : ${Object.keys(stateStore.state.conversations).length}`);
  console.log("==============================================\n");
  return 0;
}

async function checkAndPublishScheduledPost() {
  const ourPosts = stateStore.state.ourPosts ? Object.values(stateStore.state.ourPosts) : [];
  const latestPost = ourPosts.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())[0];
  const lastPostTime = latestPost ? new Date(latestPost.publishedAt).getTime() : 0;
  const postIntervalMs = (CONFIG.POST_INTERVAL_HOURS || 3) * 60 * 60 * 1000;
  const elapsedMs = Date.now() - lastPostTime;
  const isDue = elapsedMs >= postIntervalMs || lastPostTime === 0;

  if (isDue && CONFIG.POSTING_ENABLED && !CONFIG.DRY_RUN) {
    console.log("\n==============================================");
    console.log(`  📝 PUBLISHING SCHEDULED ${CONFIG.POST_INTERVAL_HOURS}-HOUR POST ON THREADS`);
    console.log("==============================================");
    try {
      const res = await threadsPoster.publishEngagingPost();
      console.log(`✅ Post published successfully [${res.pillar} - ${res.format}]: "${res.text.slice(0, 70)}..."\n`);
    } catch (err) {
      console.error("❌ Failed to publish post:", err.message);
    }
  } else if (!isDue) {
    const minutesRemaining = Math.max(1, Math.round((postIntervalMs - elapsedMs) / 60000));
    console.log(`[SCHEDULED POST] Next post due in ~${minutesRemaining} min (Cadence: every ${CONFIG.POST_INTERVAL_HOURS}h).`);
  }
}

async function commandReplies() {
  console.log("\n==============================================");
  console.log("       THREADS ACTIVITY & REPLY MONITOR");
  console.log("==============================================");
  try {
    const replies = await threadsActivityWatcher.checkReplies();
    console.log(`Threads activity items processed: ${replies ? replies.length : 0}\n`);
  } catch (err) {
    console.error("Failed processing replies:", err.message);
  }
  return 0;
}

async function commandDms() {
  console.log("\n==============================================");
  console.log("         DIRECT MESSAGES MONITOR");
  console.log("==============================================");
  try {
    const results = await dmMonitor.scanAndProcessAll();
    console.log(`Threads DMs processed: ${results.threads.length}`);
    console.log(`Instagram DMs processed: ${results.instagram.length}\n`);
  } catch (err) {
    console.error("Failed processing DMs:", err.message);
  }
  return 0;
}

async function commandRun() {
  console.log("\n==============================================");
  console.log("  🚀 STARTING CODEAIR ORCHESTRATOR LOOP");
  console.log("==============================================");
  console.log(`Mode: DRY_RUN=${CONFIG.DRY_RUN}, APPROVAL_MODE=${CONFIG.APPROVAL_MODE}, POSTING_ENABLED=${CONFIG.POSTING_ENABLED}`);
  console.log(`Interval: ${CONFIG.SCAN_INTERVAL_SECONDS}s, Post Cadence: Every ${CONFIG.POST_INTERVAL_HOURS}h\n`);

  let cycle = 0;
  while (true) {
    cycle++;
    try {
      console.log(`\n==============================================`);
      console.log(`[${new Date().toISOString()}] CYCLE #${cycle} STARTING`);
      console.log(`==============================================`);

      // 1. Check & publish engaging discussion post (every 3 hours)
      await checkAndPublishScheduledPost();

      // 2. High-intent keyword search discovery (websites, web dev, AI engineering, MVPs)
      if (cycle % 2 === 1) {
        console.log("\n[SEARCH DISCOVERY] Searching Threads for high-intent client queries (websites, AI dev)...");
        const searchRes = await searchThreadsKeywords({ queryCount: 2 });
        console.log(`Search queries visible posts: ${searchRes.scannedCount}, Newly discovered: ${searchRes.newCount}`);
      }

      // 3. Deep visible feed scan & scrolling (aiming for up to 50 posts) on user's screen
      console.log("\n[FEED DISCOVERY] Scanning and visibly scrolling Threads feed deeply (up to 50 posts)...");
      const scanRes = await scanThreadsFeed({ maxPosts: 50, scrollStep: 550, waitAfterScroll: 1300 });
      console.log(`Feed visible posts: ${scanRes.scannedCount}, Newly discovered: ${scanRes.newCount}`);

      // 4. Lead qualification & live commenting on qualified founder / buyer / tech posts
      console.log("\n[LEAD ENGAGEMENT] Evaluating posts for CodeAir / Founder pitch & live commenting...");
      await commandAnalyze({ maxLiveComments: 3 });

      // 5. Smoothly refresh the feed to bring in fresh new posts for next scan
      const page = await browserManager.getThreadsPage();
      await refreshThreadsFeed(page);

      // 5. Smart sidebar notification check (Stay on feed! Only open Activity/Messages when a badge is detected)
      const badges = await checkSidebarBadges(page);
      if (badges.unreadActivity || cycle % 12 === 0) {
        console.log(`[NOTIFICATIONS] Activity notification detected (or periodic check). Inspecting replies...`);
        await commandReplies();
        await refreshThreadsFeed(page);
      } else {
        console.log(`[NOTIFICATIONS] No unread activity badges. Staying on Home feed.`);
      }

      if (badges.unreadDms || cycle % 15 === 0) {
        console.log(`[DIRECT MESSAGES] Unread DM badge detected on sidebar (or periodic check). Inspecting messages...`);
        await commandDms();
        await refreshThreadsFeed(page);
      } else {
        console.log(`[DIRECT MESSAGES] No unread DM badges on sidebar. Staying on Home feed.`);
      }

      console.log(`\n==============================================`);
      console.log(`[${new Date().toISOString()}] CYCLE #${cycle} COMPLETED`);
      console.log(`Active pause for ${CONFIG.SCAN_INTERVAL_SECONDS}s before next deep scroll cycle...`);
      console.log(`==============================================\n`);
      await new Promise(r => setTimeout(r, CONFIG.SCAN_INTERVAL_SECONDS * 1000));
    } catch (err) {
      console.error(`Error in cycle #${cycle}:`, err.message);
      await new Promise(r => setTimeout(r, 15000));
    }
  }
}

async function main() {
  const cmd = (process.argv[2] || "status").toLowerCase();

  switch (cmd) {
    case "auth":
      process.exit(await commandAuth());
      break;
    case "scan":
      process.exit(await commandScan());
      break;
    case "analyze":
      process.exit(await commandAnalyze());
      break;
    case "approve":
      process.exit(await commandApprove());
      break;
    case "replies":
      process.exit(await commandReplies());
      break;
    case "dms":
      process.exit(await commandDms());
      break;
    case "status":
      process.exit(await commandStatus());
      break;
    case "test":
      await (require("./tests/suite").runAllTests());
      process.exit(0);
      break;
    case "run":
      await commandRun();
      break;
    default:
      console.log(`Unknown command: ${cmd}`);
      console.log("Available: auth, scan, analyze, approve, replies, dms, status, test, run");
      process.exit(1);
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
