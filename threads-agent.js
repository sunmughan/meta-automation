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
  const target = (CONFIG.PLATFORM_TARGET || "threads").toLowerCase();
  console.log("\n==============================================");
  console.log(`       SESSION AUTHENTICATION INSPECTION (${target.toUpperCase()})`);
  console.log("==============================================");
  const threadsAuth = await checkThreadsAuth({ printResult: true });
  let igAuth = { isAuthenticated: false };
  if (target === "instagram" || target === "all") {
    igAuth = await checkInstagramAuth({ printResult: true });
  }
  browserManager.disconnect();
  return (threadsAuth.isAuthenticated || (target !== "threads" && igAuth.isAuthenticated)) ? 0 : 1;
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

function getLeadPriorityScore(post) {
  let score = 0;
  if (post.status === "COMMENT_PENDING") score += 5000;
  if (post.source === "SEARCH") score += 2000;
  const text = (post.text || "").toLowerCase();
  const highIntentKeywords = [
    /\b(looking for|need|hiring|hire|seeking|searching for|want to build|want an?)\b/i,
    /\b(developer|designer|engineer|programmer|coder|agency|freelancer)\b/i,
    /\b(website|web app|mobile app|flutter|react|fullstack|frontend|backend|saas|mvp|ai agent)\b/i,
    /\b(recommend a|anyone know a|can someone build)\b/i
  ];
  for (const regex of highIntentKeywords) {
    if (regex.test(text)) score += 500;
  }
  const ageHours = (Date.now() - new Date(post.discoveredAt || 0).getTime()) / (1000 * 60 * 60);
  if (ageHours < 24) {
    score += Math.max(0, Math.round(24 - ageHours) * 10);
  }
  return score;
}

async function commandAnalyze(options = {}) {
  const opts = typeof options === "number" ? { maxPosts: options } : (options || {});
  const maxLiveComments = opts.maxLiveComments !== undefined
    ? opts.maxLiveComments
    : (CONFIG.MAX_NEW_POST_REPLIES_PER_HOUR || 5);
  let liveCommentsPosted = 0;

  let maxPosts = opts.maxPosts;
  if (!maxPosts) {
    const maxPostsArgIdx = process.argv.findIndex(a => a.startsWith("--max-posts"));
    if (maxPostsArgIdx !== -1) {
      const arg = process.argv[maxPostsArgIdx];
      if (arg.includes("=")) {
        maxPosts = parseInt(arg.split("=")[1], 10);
      } else if (process.argv[maxPostsArgIdx + 1]) {
        maxPosts = parseInt(process.argv[maxPostsArgIdx + 1], 10);
      }
    }
  }

  console.log("\n==============================================");
  console.log("       AI LEAD QUALIFICATION & COMMENT SYNTHESIS");
  console.log("==============================================");
  console.log(`AI Model     : ${CONFIG.MODEL}`);
  console.log(`Approval Mode: ${CONFIG.APPROVAL_MODE ? "ENABLED" : "DISABLED"}`);
  console.log(`Dry Run      : ${CONFIG.DRY_RUN ? "ENABLED" : "DISABLED"}\n`);

  const retryableFailed = stateStore.getRetryableFailedPosts ? stateStore.getRetryableFailedPosts(3, 15) : [];
  const retryablePostIds = new Set(retryableFailed.map(p => p.postId));

  const unanalyzed = Object.values(stateStore.state.posts)
    .filter(p => (p.status === "DISCOVERED" || p.status === "COMMENT_PENDING" || retryablePostIds.has(p.postId)) && !stateStore.hasCommented(p.postId, p.platform))
    .sort((a, b) => getLeadPriorityScore(b) - getLeadPriorityScore(a));

  const targetPosts = maxPosts ? unanalyzed.slice(0, maxPosts) : unanalyzed.slice(0, 15);

  console.log(`Found ${unanalyzed.length} posts pending qualification/posting (processing ${targetPosts.length} prioritized)...\n`);

  let hotCount = 0;
  let warmCount = 0;
  let ignoredCount = 0;

  for (let i = 0; i < targetPosts.length; i++) {
    const post = targetPosts[i];

    // 1. Primary Grounded Semantic AI Reasoning (Zero Premature Discards)
    stateStore.updatePostStatus(post.postId, "ANALYZING", {}, post.platform || "threads");
    const decision = await aiDecisionEngine.qualifyPost(post, { useAiCall: true });

    const isQualified = decision.is_genuine_buyer && (decision.decision === "QUALIFIED" || decision.temperature === "HOT" || decision.temperature === "WARM");
    const temperature = decision.temperature || "WARM";
    const commentToPost = decision.generated_comment || (isQualified ? commentGenerator.generateEngagingComment({
      text: post.text,
      username: post.username,
      matchedCategories: decision.matched_categories || [decision.matched_capability || "Web Development"],
      identity: decision.representation || "COMPANY"
    }) : null);

    // 2. Determine Action (Governed dynamically by safety limits and rate limiter)
    let action = "SKIPPED";
    const canCommentCheck = rateLimiter.canPerformAction("COMMENT", post.platform || "threads");

    if (isQualified) {
      if (temperature === "HOT") hotCount++;
      else warmCount++;

      if (CONFIG.DRY_RUN) {
        action = "BLOCKED_BY_DRY_RUN (Simulated)";
      } else if (CONFIG.APPROVAL_MODE) {
        action = "QUEUED_FOR_APPROVAL";
      } else if (!CONFIG.POSTING_ENABLED) {
        action = "BLOCKED_BY_SAFETY_LOCK (Posting disabled)";
      } else if (!canCommentCheck.allowed) {
        action = `RATE_LIMITED (${canCommentCheck.reason})`;
      } else {
        action = "COMMENT_POSTED";
      }
    } else if (decision.quarantined || decision.lead_type === "QUARANTINED") {
      ignoredCount++;
      action = `QUARANTINED (${decision.reason || "AI runtime failure - zero guessing"})`;
    } else {
      ignoredCount++;
      action = `SKIPPED (${decision.reason || "Not qualified"})`;
    }

    // 3. Structured Audit Log for EVERY Post (Mandatory Format)
    console.log(`┌──────────────────────────────────────────────────────────`);
    console.log(`│ [POST_CAPTURED]  @${post.username} (${post.postId})`);
    console.log(`│ [AI_ANALYSIS]    Analyzing semantic intent & requirements...`);
    console.log(`│ [INTENT]         ${decision.intent || "IRRELEVANT"}`);
    console.log(`│ [REQUIREMENT]    ${decision.requirement ? `"${decision.requirement}"` : "None"}`);
    console.log(`│ [TARGET_ENTITY]  ${decision.target_entity || "EITHER"}`);
    console.log(`│ [REPRESENTATION] ${decision.representation || "IGNORE"}`);
    console.log(`│ [SERVICE_MATCH]  ${decision.service_match ? `MATCHED (${decision.matched_capability || "Custom Software"})` : "NO_MATCH"}`);
    console.log(`│ [DECISION]       ${isQualified ? `QUALIFIED (${temperature})` : "IGNORED"}`);
    console.log(`│ [ACTION]         ${action}`);
    if (isQualified && commentToPost) {
      console.log(`│ [COMMENT]        "${commentToPost}"`);
    }
    console.log(`└──────────────────────────────────────────────────────────\n`);

    // 4. Update State Store according to Qualification & Action
    if (isQualified) {
      stateStore.updatePostStatus(post.postId, "COMMENT_PENDING", {
        leadType: decision.lead_type || "PROJECT_BUYER",
        intent: decision.intent,
        requirement: decision.requirement,
        targetEntity: decision.target_entity,
        representation: decision.representation,
        matchedServices: decision.matched_services,
        matchedCategories: decision.matched_categories,
        relevanceScore: decision.relevance_score,
        temperature: decision.temperature,
        identity: decision.representation,
        commentText: commentToPost,
        qualificationReason: decision.reason
      }, post.platform || "threads");
      stateStore.state.stats.total_qualified++;
      stateStore.saveState();

      // Post live if conditions permit (rateLimiter is the canonical governor)
      const canCommentNow = rateLimiter.canPerformAction("COMMENT", post.platform || "threads");
      if (!CONFIG.APPROVAL_MODE && CONFIG.POSTING_ENABLED && !CONFIG.DRY_RUN && canCommentNow.allowed) {
        console.log(`  🚀 Posting live comment on @${post.username}'s post...`);
        const postRes = await threadsActions.postComment(post, commentToPost);
        if (postRes && postRes.success) {
          liveCommentsPosted++;
          stateStore.updatePostStatus(post.postId, "COMMENTED", {
            commentText: commentToPost,
            verifiedAt: new Date().toISOString()
          }, post.platform || "threads");
          stateStore.saveState();
          console.log(`  ✅ Live comment verified & posted successfully on @${post.username}'s post!`);
        } else {
          const currentRetries = (post.retryCount || 0) + 1;
          stateStore.updatePostStatus(post.postId, "COMMENT_FAILED", {
            retryCount: currentRetries,
            lastFailedAt: new Date().toISOString(),
            failureReason: (postRes && postRes.reason) || "Submission verification failed",
            commentText: commentToPost
          }, post.platform || "threads");
          stateStore.saveState();
          console.warn(`  ⚠️ Live comment failed verification for @${post.username} (${(postRes && postRes.reason) || "unknown"}). Marked COMMENT_FAILED (retry ${currentRetries}/3 after cooldown).`);
        }
        await new Promise(r => setTimeout(r, 4000));
      }
    } else {
      const nonQualifiedStatus = (decision.quarantined || decision.lead_type === "QUARANTINED") ? "QUARANTINED" : "IGNORED";
      stateStore.updatePostStatus(post.postId, nonQualifiedStatus, {
        intent: decision.intent,
        leadType: decision.lead_type,
        quarantined: Boolean(decision.quarantined),
        qualificationReason: decision.reason
      }, post.platform || "threads");
      stateStore.saveState();
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

async function checkAndPublishScheduledPost(force = false) {
  const lastFailure = stateStore.getLastPostAttemptFailure();
  const failureCooldownMs = 30 * 60 * 1000; // 30 minutes failure cooldown
  const timeSinceFailure = lastFailure ? (Date.now() - (lastFailure.timestamp || 0)) : Infinity;

  if (!force && timeSinceFailure < failureCooldownMs) {
    const minWait = Math.ceil((failureCooldownMs - timeSinceFailure) / 60000);
    console.log(`[SCHEDULED POST] Recent post attempt failure recorded (${lastFailure.reason || "unverified"}). Cooldown active for ~${minWait} min.`);
    return null;
  }

  const ourPosts = stateStore.state.ourPosts ? Object.values(stateStore.state.ourPosts) : [];
  const verifiedPosts = ourPosts.filter(p => p.status === "VERIFIED_PUBLISHED" || p.published === true);
  const latestPost = verifiedPosts.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())[0];
  const lastPostTime = latestPost ? new Date(latestPost.publishedAt).getTime() : 0;
  const postIntervalHours = CONFIG.POST_INTERVAL_HOURS || 6;
  const postIntervalMs = postIntervalHours * 60 * 60 * 1000;
  const elapsedMs = Date.now() - lastPostTime;
  const isDue = force || elapsedMs >= postIntervalMs || lastPostTime === 0;

  if (isDue && CONFIG.POSTING_ENABLED && !CONFIG.DRY_RUN) {
    console.log("\n==============================================");
    console.log(`  📝 PUBLISHING SCHEDULED ${postIntervalHours}-HOUR POST ON THREADS (4 POSTS / 24H)`);
    console.log("==============================================");
    try {
      const res = await threadsPoster.publishEngagingPost();
      if (res && res.verified) {
        console.log(`✅ Post published & verified [${res.pillar} - ${res.format}]: "${res.text.slice(0, 70)}..."\n`);
        return res;
      } else {
        console.warn(`⚠️ Scheduled post attempt did not verify cleanly: ${res ? res.reason : "unknown"}\n`);
        return res;
      }
    } catch (err) {
      console.error("❌ Failed to publish post:", err.message);
      return null;
    }
  } else if (!isDue) {
    const minutesRemaining = Math.max(1, Math.round((postIntervalMs - elapsedMs) / 60000));
    console.log(`[SCHEDULED POST] Next post due in ~${minutesRemaining} min (Cadence: exactly 4 posts / 24h, every ${postIntervalHours}h).`);
    return null;
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
  console.log("         THREADS DIRECT MESSAGES MONITOR");
  console.log("==============================================");
  try {
    const results = await dmMonitor.scanAndProcessThreadsOnly();
    console.log(`Threads DMs processed: ${results.threads.length}\n`);
  } catch (err) {
    console.error("Failed processing Threads DMs:", err.message);
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

      // 1. Check DMs periodically (every 10 cycles = ~5-8 min, or cycle 1) so browser doesn't flick pages constantly
      if (cycle === 1 || cycle % 10 === 0) {
        await commandDms();
      }

      // 2. Check Activity & multi-turn replies periodically (cycle 1, and every 10 cycles on cycle 5, 15, 25...)
      if (cycle === 1 || cycle % 10 === 5) {
        await commandReplies();
      }

      // 3. Check & publish engaging discussion post (every 6 hours / 4 posts per 24h)
      await checkAndPublishScheduledPost();

      // 4. High-intent keyword search discovery (websites, web dev, AI engineering, MVPs)
      if (cycle % 3 === 1) {
        console.log("\n[SEARCH DISCOVERY] Searching Threads for high-intent client queries (websites, AI dev)...");
        const searchRes = await searchThreadsKeywords({ queryCount: 1 });
        console.log(`Search queries visible posts: ${searchRes.scannedCount}, Newly discovered: ${searchRes.newCount}`);
      }

      // 5. Natural feed browsing (8-10 posts per cycle)
      console.log("\n[FEED DISCOVERY] Scanning and browsing Threads feed naturally...");
      const scanRes = await scanThreadsFeed({ maxPosts: 10, scrollStep: 450, waitAfterScroll: 1000 });
      console.log(`Feed visible posts: ${scanRes.scannedCount}, Newly discovered: ${scanRes.newCount}`);

      // 6. Lead qualification & live commenting on prioritized leads (search/buyers first)
      console.log("\n[LEAD ENGAGEMENT] Evaluating posts for CodeAir / Founder pitch & live commenting...");
      await commandAnalyze({ maxPosts: 15, maxLiveComments: 2 });

      // 7. Refresh feed periodically (every 8 cycles) so feed doesn't constantly jump to top
      if (cycle % 8 === 0) {
        const page = await browserManager.getThreadsPage();
        await refreshThreadsFeed(page);
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
    case "post":
      await checkAndPublishScheduledPost(true);
      browserManager.disconnect();
      process.exit(0);
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
      console.log("Available: auth, scan, analyze, approve, replies, dms, post, status, test, run");
      process.exit(1);
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
