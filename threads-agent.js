/**
 * threads-agent.js
 * Primary Unified Autonomous CLI Orchestrator for Threads + Instagram AI System.
 *
 * Supported Commands:
 *   node threads-agent.js auth      - Check Threads & Instagram authentication in Brave
 *   node threads-agent.js scan      - Scan new posts from authenticated feed(s)
 *   node threads-agent.js analyze   - Qualify leads and synthesize detailed, engaging comments
 *   node threads-agent.js approve   - Review pending comments/actions and approve/reject
 *   node threads-agent.js replies   - Process incoming comment replies
 *   node threads-agent.js dms       - Process incoming Direct Messages
 *   node threads-agent.js run       - Continuous autonomous / approval orchestrator loop
 *   node threads-agent.js status    - Display comprehensive system, rate-limit & engagement report\n *   node threads-agent.js health    - Verify live browser tabs and action telemetry
 *   node threads-agent.js test      - Run automated diagnostic test suite
 */

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const CONFIG = require("./config");
const knowledge = require("./src/knowledge/knowledge-engine");
const browserManager = require("./src/browser/browser-manager");
const { checkThreadsAuth } = require("./src/platforms/threads/threads-auth");
const { checkInstagramAuth } = require("./src/platforms/instagram/instagram-auth");
const { checkLinkedInAuth } = require("./src/platforms/linkedin/linkedin-auth");
const { checkFacebookAuth } = require("./src/platforms/facebook/facebook-auth");
const { scanThreadsFeed, refreshThreadsFeed, checkSidebarBadges, searchThreadsKeywords } = require("./src/platforms/threads/threads-scanner");
const { scanInstagramFeed } = require("./src/platforms/instagram/instagram-feed");
const { scanLinkedInFeed, searchLinkedInKeywords } = require("./src/platforms/linkedin/linkedin-scanner");
const { scanFacebookProfileFeed } = require("./src/platforms/facebook/facebook-profile");
const { searchFacebookPosts, searchFacebookGroupPosts } = require("./src/platforms/facebook/facebook-search");
const aiDecisionEngine = require("./src/ai/ai-decision-engine");
const threadsActions = require("./src/platforms/threads/threads-actions");
const threadsPoster = require("./src/platforms/threads/threads-poster");
const linkedInActions = require("./src/platforms/linkedin/linkedin-actions");
const linkedInPoster = require("./src/platforms/linkedin/linkedin-poster");
const facebookActions = require("./src/platforms/facebook/facebook-actions");
const facebookPoster = require("./src/platforms/facebook/facebook-poster");
const threadsActivityWatcher = require("./src/platforms/threads/threads-activity");
const replyMonitor = require("./src/engagement/reply-monitor");
const dmMonitor = require("./src/engagement/dm-monitor");
const stateStore = require("./src/storage/state-store");
const rateLimiter = require("./src/safety/rate-limiter");
const commentGenerator = require("./src/engagement/comment-generator");
const { checkLinkedInConnectionRequests, checkLinkedInMessages, checkLinkedInNotifications } = require("./src/platforms/linkedin/linkedin-activity");
const { checkFacebookNotifications, checkFacebookMessages } = require("./src/platforms/facebook/facebook-activity");
const logger = require("./src/logging/logger");
const featureHealth = require("./src/agent/feature-health");
const telemetry = require("./src/telemetry/action-telemetry");

async function commandAuth() {
  const argTarget = (process.argv[3] || "").toLowerCase();
  const target = (argTarget || CONFIG.PLATFORM_TARGET || "threads").toLowerCase();
  console.log("\n==============================================");
  console.log(`       SESSION AUTHENTICATION INSPECTION (${target.toUpperCase()})`);
  console.log("==============================================");

  let threadsAuth = { isAuthenticated: false };
  let igAuth = { isAuthenticated: false };
  let linkedInAuth = { isAuthenticated: false };
  let facebookAuth = { isAuthenticated: false };

  if (target === "threads" || target === "all") {
    threadsAuth = await checkThreadsAuth({ printResult: true });
  }
  if (target === "instagram" || target === "all") {
    igAuth = await checkInstagramAuth({ printResult: true });
  }
  if (target === "linkedin" || target === "all") {
    linkedInAuth = await checkLinkedInAuth({ printResult: true });
  }
  if (target === "facebook" || target === "all") {
    facebookAuth = await checkFacebookAuth({ printResult: true });
  }

  browserManager.disconnect();

  if (target === "threads") return threadsAuth.isAuthenticated ? 0 : 1;
  if (target === "instagram") return igAuth.isAuthenticated ? 0 : 1;
  if (target === "linkedin") return linkedInAuth.isAuthenticated ? 0 : 1;
  if (target === "facebook") return facebookAuth.isAuthenticated ? 0 : 1;
  return (threadsAuth.isAuthenticated || igAuth.isAuthenticated || linkedInAuth.isAuthenticated || facebookAuth.isAuthenticated) ? 0 : 1;
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
    } else if (platform === "linkedin") {
      res = await scanLinkedInFeed({ maxPosts: CONFIG.MAX_POSTS_PER_SCAN });
    } else if (platform === "facebook") {
      const searchArg = process.argv.find(a => a.startsWith("--search"));
      if (searchArg) {
        const query = searchArg.includes("=") ? searchArg.split("=")[1] : process.argv[process.argv.indexOf(searchArg) + 1];
        res = await searchFacebookPosts({ query, maxPosts: CONFIG.MAX_POSTS_PER_SCAN });
      } else if (process.argv.includes("--group") || process.argv.includes("--groups")) {
        res = await searchFacebookGroupPosts({ maxPosts: CONFIG.MAX_POSTS_PER_SCAN });
      } else if (process.argv.includes("--feed") || process.argv.includes("--profile")) {
        res = await scanFacebookProfileFeed({ maxPosts: CONFIG.MAX_POSTS_PER_SCAN });
      } else {
        // By default, execute high-intent targeted search on Facebook
        res = await searchFacebookPosts({ maxPosts: CONFIG.MAX_POSTS_PER_SCAN });
      }
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

function isPostFresh(post, maxAgeHours = 36) {
  if (!post) return false;

  // 1. Check discovery timestamp
  if (post.discoveredAt) {
    const ageHours = (Date.now() - new Date(post.discoveredAt).getTime()) / (1000 * 3600);
    if (ageHours > maxAgeHours) return false;
  }

  // 2. Check post text for explicit old dates or stale relative units
  const text = (post.text || "").slice(0, 200);
  if (/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/.test(text)) return false; // Date formats like 05/08/2026
  if (/\b(202[0-5]|2026-0[1-8])\b/.test(text)) return false;
  if (/\b([2-9]|\d{2,})d\b/i.test(text)) return false; // 2d, 3d, 4d, 5d...
  if (/\b\d+w\b/i.test(text)) return false; // 1w, 2w...
  if (/\b\d+mo\b/i.test(text)) return false; // 1mo, 2mo...
  if (/\b\d+y\b/i.test(text)) return false; // 1y...

  return true;
}

function getLeadPriorityScore(post) {
  let score = 0;
  if (!isPostFresh(post)) return -5000; // Deprioritize stale posts
  
  if (post.status === "COMMENT_PENDING") score += 5000;
  if (post.status === "COMMENT_FAILED") score += 1000;
  if (post.source === "SEARCH" || post.source === "FACEBOOK_KEYWORD_SEARCH" || post.source === "FACEBOOK_GROUP_SEARCH") score += 500;
  
  // Prioritize genuine buyer signal candidates for immediate AI evaluation
  const text = (post.text || "").toLowerCase();
  if (text.includes("looking for") || text.includes("need a") || text.includes("hire") || text.includes("app developer") || text.includes("mvp") || text.includes("build an app") || text.includes("website developer") || text.includes("build a website")) {
    score += 800;
  }
  if (post.score && post.score >= 80) score += post.score * 2;

  // Freshness boost (within last 12 hours)
  if (post.discoveredAt) {
    const ageHours = (Date.now() - new Date(post.discoveredAt).getTime()) / (1000 * 3600);
    if (ageHours < 12) score += Math.max(0, 300 - Math.floor(ageHours * 20));
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

  const targetPlatform = opts.platform || null;
  const unanalyzed = Object.values(stateStore.state.posts)
    .filter(p => {
      if (!p || !p.postId) return false;
      if (targetPlatform && (p.platform || "threads") !== targetPlatform) return false;
      // Permanent shield against mock or test posts
      if (p.postId.includes("test_") || (p.username && (p.username.includes("user_retry") || p.username.includes("user_test")))) {
        return false;
      }
      return (p.status === "DISCOVERED" || p.status === "COMMENT_PENDING" || retryablePostIds.has(p.postId)) && !stateStore.hasCommented(p.postId, p.platform) && isPostFresh(p);
    })
    .sort((a, b) => getLeadPriorityScore(b) - getLeadPriorityScore(a));

  const targetPosts = maxPosts ? unanalyzed.slice(0, maxPosts) : unanalyzed.slice(0, 15);

  const platformLabel = targetPlatform ? ` [PLATFORM: ${targetPlatform.toUpperCase()}]` : "";
  console.log(`Found ${unanalyzed.length} fresh posts pending qualification/posting${platformLabel} (processing ${targetPosts.length} prioritized)...\n`);

  let hotCount = 0;
  let warmCount = 0;
  let ignoredCount = 0;

  for (let i = 0; i < targetPosts.length; i++) {
    const post = targetPosts[i];

    // Enforce freshness guard
    if (!isPostFresh(post)) {
      ignoredCount++;
      stateStore.updatePostStatus(post.postId, "IGNORED", {
        reason: "Post is too old (>36h). Only fresh leads are engaged."
      }, post.platform || "threads");
      continue;
    }

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
      const postPlatform = post.platform || "threads";
      const canCommentNow = rateLimiter.canPerformAction("COMMENT", postPlatform);
      if (!CONFIG.APPROVAL_MODE && CONFIG.POSTING_ENABLED && !CONFIG.DRY_RUN && canCommentNow.allowed && liveCommentsPosted < maxLiveComments) {
        console.log(`  🚀 Posting live comment on @${post.username}'s ${postPlatform} post...`);
        let postRes = null;
        if (postPlatform === "linkedin") {
          const fn = linkedInActions.postComment || (linkedInActions.linkedInActions && linkedInActions.linkedInActions.postComment);
          postRes = await fn.call(linkedInActions.linkedInActions || linkedInActions, post, commentToPost);
        } else if (postPlatform === "facebook") {
          const fn = facebookActions.postComment || facebookActions.postFacebookComment || (facebookActions.facebookActions && facebookActions.facebookActions.postComment);
          postRes = await fn.call(facebookActions.facebookActions || facebookActions, post, commentToPost);
        } else {
          postRes = await threadsActions.postComment(post, commentToPost);
        }
        if (postRes && postRes.success) {
          liveCommentsPosted++;
          stateStore.updatePostStatus(post.postId, "COMMENTED", {
            commentText: commentToPost,
            verifiedAt: new Date().toISOString()
          }, postPlatform);
          stateStore.saveState();
          console.log(`  ✅ Live comment verified & posted successfully on @${post.username}'s ${postPlatform} post!`);
        } else {
          const currentRetries = (post.retryCount || 0) + 1;
          stateStore.updatePostStatus(post.postId, "COMMENT_FAILED", {
            retryCount: currentRetries,
            lastFailedAt: new Date().toISOString(),
            failureReason: (postRes && postRes.reason) || "Submission verification failed",
            commentText: commentToPost
          }, postPlatform);
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
      const postPlatform = post.platform || "threads";
      if (CONFIG.POSTING_ENABLED && !CONFIG.DRY_RUN) {
        console.log(`Posting comment live on ${postPlatform}...`);
        if (postPlatform === "linkedin") {
          await linkedInActions.postComment(post, post.commentText, { dryRun: false, approvalMode: false });
        } else if (postPlatform === "facebook") {
          await facebookActions.postComment(post, post.commentText, { dryRun: false, approvalMode: false });
        } else {
          await threadsActions.postComment(post, post.commentText, { dryRun: false, approvalMode: false });
        }
      } else {
        console.log(`[DRY RUN] Marked approved in state.`);
        stateStore.recordComment(post.postId, {
          username: post.username,
          url: post.url,
          comment: post.commentText,
          status: "APPROVED_SIMULATED",
          platform: postPlatform
        }, postPlatform);
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

async function commandHealth() {
  console.log("\n==============================================");
  console.log("     VERIFIED AGENTIC BROWSER HEALTH");
  console.log("==============================================");
  console.log(`Browser CDP : ${CONFIG.CDP_URL}`);
  try {
    const tabs = await browserManager.ensureAllPlatformTabs();
    for (const [platform, page] of Object.entries({
      threads: tabs.threadsPage,
      linkedin: tabs.linkedInPage,
      facebook: tabs.facebookPage
    })) {
      telemetry.record({type:"TAB_HEALTH",platform,action:"TAB",targetId:page.url(),evidence:{url:page.url(),title:await page.title().catch(()=>""),alive:browserManager.isPageAlive(page)}});
      console.log(`${platform.toUpperCase().padEnd(10)} ${browserManager.isPageAlive(page) ? "PASS" : "FAIL"}  ${page.url()}`);
    }
  } catch (e) {
    console.log(`Browser health FAILED: ${e.message}`);
  }
  featureHealth.print();
  browserManager.disconnect();
  return 0;
}

async function commandAccept() {
  console.log("\n==============================================");
  console.log("  🎯 LIVE AGENTIC BROWSER ACCEPTANCE SUITE");
  console.log("  Sequential Multi-Tab Execution: Threads ➔ Facebook ➔ LinkedIn");
  console.log("==============================================");
  console.log(`Browser CDP : ${CONFIG.CDP_URL}`);
  console.log(`Mode        : AGENT_ACCEPTANCE_MODE=true, DRY_RUN=${CONFIG.DRY_RUN}, APPROVAL_MODE=${CONFIG.APPROVAL_MODE}`);
  console.log(`Order       : 1. Threads ➔ 2. Facebook ➔ 3. LinkedIn\n`);

  process.env.AGENT_ACCEPTANCE_MODE = "true";

  try {
    console.log(`\n[ACCEPTANCE 1/3] 🧵 THREADS TAB: Live feed scan & AI qualification...`);
    await runThreadsCycle(1);

    console.log(`\n[ACCEPTANCE 2/3] 📘 FACEBOOK TAB: Inbound notifications, Messenger check & commercial search...`);
    await runFacebookCycle(1);

    console.log(`\n[ACCEPTANCE 3/3] 💼 LINKEDIN TAB: Connection requests, messages & B2B search...`);
    await runLinkedInCycle(1);

    console.log(`\n==============================================`);
    console.log("  ✅ LIVE BROWSER ACCEPTANCE CYCLE COMPLETED");
    console.log("==============================================\n");
  } catch (err) {
    console.error("❌ Acceptance cycle failed:", err.message);
  }

  featureHealth.print();
  browserManager.disconnect();
  return 0;
}

async function commandStatus() {
  console.log("\n==============================================");
  console.log("    THREADS + INSTAGRAM AGENT STATUS");
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

/**
 * Algorithmic Peak-Window Pacing Helper.
 * Peak windows for global tech / founder traffic:
 * - Morning Window: 8:00 AM - 11:00 AM EST (13:00 - 16:00 UTC)
 * - Evening Window: 6:00 PM - 9:00 PM EST (23:00 - 02:00 UTC)
 */
function isPeakEngagementWindow(date = new Date()) {
  const utcHours = date.getUTCHours();
  const isMorningPeak = utcHours >= 13 && utcHours < 16;
  const isEveningPeak = utcHours >= 23 || utcHours < 2;
  return isMorningPeak || isEveningPeak;
}

async function checkAndPublishScheduledPost(force = false) {
  const ourPosts = stateStore.state.ourPosts ? Object.values(stateStore.state.ourPosts) : [];
  const verifiedPosts = ourPosts.filter(p => p.status === "VERIFIED_PUBLISHED" || p.published === true);
  const latestPost = verifiedPosts.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())[0];
  const lastPostTime = latestPost ? new Date(latestPost.publishedAt).getTime() : 0;

  const lastFailure = stateStore.getLastPostAttemptFailure();
  const failureCooldownMs = 30 * 60 * 1000; // 30 minutes failure cooldown
  const timeSinceFailure = lastFailure ? (Date.now() - (lastFailure.timestamp || 0)) : Infinity;
  const isFailureObsolete = lastFailure && lastPostTime > (lastFailure.timestamp || 0);

  if (!force && !isFailureObsolete && timeSinceFailure < failureCooldownMs) {
    const minWait = Math.ceil((failureCooldownMs - timeSinceFailure) / 60000);
    console.log(`[SCHEDULED POST] Recent post attempt failure recorded (${lastFailure.reason || "unverified"}). Cooldown active for ~${minWait} min.`);
    return null;
  }

  const postIntervalHours = CONFIG.POST_INTERVAL_HOURS || 6;
  const minIntervalMs = 5 * 60 * 60 * 1000; // 5 hours minimum gap for peak windows
  const maxIntervalMs = 7 * 60 * 60 * 1000; // 7 hours maximum gap (guarantees ~4 posts/24h)
  const elapsedMs = Date.now() - lastPostTime;
  const inPeakWindow = isPeakEngagementWindow();

  // Due if forced, first post ever, exceeded max gap, or inside peak window after min gap
  const isDue = force || lastPostTime === 0 || elapsedMs >= maxIntervalMs || (elapsedMs >= minIntervalMs && inPeakWindow);

  if (isDue && CONFIG.POSTING_ENABLED && !CONFIG.DRY_RUN) {
    console.log("\n==============================================");
    console.log(`  📝 PUBLISHING SCHEDULED POST ON THREADS (4 POSTS / 24H)`);
    console.log(`  Peak Window Status: ${inPeakWindow ? "ACTIVE (Peak Traffic Boost)" : "STANDARD INTERVAL"}`);
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
    const minutesToMin = Math.max(1, Math.round((minIntervalMs - elapsedMs) / 60000));
    const minutesToMax = Math.max(1, Math.round((maxIntervalMs - elapsedMs) / 60000));
    const peakInfo = inPeakWindow ? "Peak Window Active" : "Waiting for Next Peak Window";
    console.log(`[SCHEDULED POST] Next post due in ~${minutesToMin}-${minutesToMax} min (${peakInfo}, ~4 posts / 24h).`);
    return null;
  }
}

async function checkAndPublishLinkedInDailyPost(force = false) {
  const ourPosts = stateStore.state.ourPosts ? Object.values(stateStore.state.ourPosts) : [];
  const liPosts = ourPosts.filter(p => p.platform === "linkedin" && (p.status === "VERIFIED_PUBLISHED" || p.published === true));
  const latestLiPost = liPosts.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())[0];
  const lastPostTime = latestLiPost ? new Date(latestLiPost.publishedAt).getTime() : 0;
  const elapsedHours = (Date.now() - lastPostTime) / (1000 * 60 * 60);

  if (force || lastPostTime === 0 || elapsedHours >= 20) {
    if (CONFIG.POSTING_ENABLED && !CONFIG.DRY_RUN) {
      console.log("\n==============================================");
      console.log(`  💼 PUBLISHING DAILY B2B THOUGHT-LEADERSHIP ON LINKEDIN`);
      console.log("==============================================");
      try {
        // Reuse latest Threads media if available (same visual asset)
        const threadsPosts = ourPosts.filter(p => (!p.platform || p.platform === "threads") && (p.status === "VERIFIED_PUBLISHED" || p.published === true));
        const latestThreadsPost = threadsPosts.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())[0];
        const mediaPath = (latestThreadsPost && latestThreadsPost.mediaPaths && latestThreadsPost.mediaPaths[0]) || null;
        const pillar = (latestThreadsPost && latestThreadsPost.pillar) || "agentic_ai";

        const res = await linkedInPoster.publishPost({
          pillar,
          mediaPath
        });
        if (res && res.verified) {
          console.log(`✅ Daily LinkedIn post published: "${res.text.slice(0, 70)}..."\n`);
        }
        return res;
      } catch (err) {
        console.warn(`[LINKEDIN POSTER] Failed to publish daily post: ${err.message}`);
      }
    }
  } else {
    console.log(`[LINKEDIN POSTER] Daily post already published (${Math.round(elapsedHours)}h ago). Next post in ~${Math.round(24 - elapsedHours)}h.`);
  }
}

async function checkAndTriggerQuotePost() {
  const recentQuotes = stateStore.getRecentQuotePosts ? stateStore.getRecentQuotePosts(24) : [];
  if (recentQuotes.length >= 2) {
    return; // Daily cap: max 2 quote-posts per 24h
  }

  // Look for high-substance posts in discovered pool (engineering, system design, AI agents)
  const candidates = Object.values(stateStore.state.posts)
    .filter(p => {
      if (!p || !p.text || !p.postId) return false;
      if (p.postId.includes("test_")) return false;
      const text = p.text.toLowerCase();
      const hasTechIntent = /\b(architecture|distributed systems|agentic ai|microservices|postgresql|database|concurrency|fullstack|saas|system design|latency)\b/i.test(text);
      const myUsername = CONFIG.THREADS_USERNAME || knowledge.getFounderInfo().threadsUsername || "";
      const isNotSelf = !myUsername || p.username.toLowerCase() !== myUsername.toLowerCase();
      return hasTechIntent && isNotSelf && !stateStore.hasCommented(p.postId, p.platform);
    })
    .sort((a, b) => (b.text.length || 0) - (a.text.length || 0));

  const targetPost = candidates[0];
  if (!targetPost) return;

  try {
    console.log(`\n[QUOTE POSTING ENGINE] Evaluating trending builder thread from @${targetPost.username}...`);
    const commentary = await aiDecisionEngine.generateQuoteCommentary(targetPost);
    if (commentary && commentary.length > 30) {
      console.log(`[QUOTE POSTING ENGINE] Synthesized expert insight for @${targetPost.username}: "${commentary}"`);
      await threadsActions.quotePost(targetPost, commentary);
    }
  } catch (err) {
    logger.warn(`Quote post evaluation failed: ${err.message}`);
  }
}

async function commandReplies() {
  console.log("\n==============================================");
  console.log("       THREADS ACTIVITY & REPLY MONITOR");
  console.log("==============================================");
  try {
    const replies = await threadsActivityWatcher.checkReplies();
    const count = replies ? replies.length : 0;
    console.log(`Threads activity items processed: ${count}\n`);
    return { status: "SUCCESS", count };
  } catch (err) {
    logger.error(`[REPLIES] Failed processing replies: ${err.message}`);
    return { status: "FAILED", reason: err.message };
  }
}

async function commandDms() {
  console.log("\n==============================================");
  console.log("         THREADS DIRECT MESSAGES MONITOR");
  console.log("==============================================");
  try {
    const results = await dmMonitor.scanAndProcessThreadsOnly();
    const count = results.threads.length;
    console.log(`Threads DMs processed: ${count}\n`);
    return { status: "SUCCESS", count };
  } catch (err) {
    logger.error(`[DMS] Failed processing Threads DMs: ${err.message}`);
    return { status: "FAILED", reason: err.message };
  }
}

function getExecutionMode() {
  const modeArg = process.argv.find(a => a.startsWith("--mode="));
  if (modeArg) return modeArg.split("=")[1].trim().toLowerCase();
  if (process.argv.includes("--once")) return "pipeline";
  return (CONFIG.EXECUTION_MODE || "pipeline").toLowerCase();
}

async function runThreadsCycle(cycle) {
  console.log(`\n[THREADS WORKER] Starting active operations on Threads tab (Cycle #${cycle})...`);
  try {
    await browserManager.getThreadsPage({ bringToFront: true });
    // 1. Check & publish engaging discussion post (every 6 hours / 4 posts per 24h)
    await checkAndPublishScheduledPost();

    // 2. High-intent keyword search discovery (run every 4 cycles on Threads)
    if (cycle % 4 === 1) {
      console.log("\n[THREADS SEARCH] Searching Threads for high-intent client queries (websites, AI dev)...");
      const searchRes = await searchThreadsKeywords({ queryCount: 1 });
      console.log(`Threads search visible posts: ${searchRes.scannedCount}, Newly discovered: ${searchRes.newCount}`);
    }

    // 3. Natural feed browsing on Threads
    console.log("\n[THREADS FEED] Scanning Threads home feed...");
    const scanRes = await scanThreadsFeed({ maxPosts: 10, scrollStep: 450, waitAfterScroll: 1000 });
    console.log(`Threads feed visible posts: ${scanRes.scannedCount}, Newly discovered: ${scanRes.newCount}`);

    // 4. Lead qualification & live commenting on Threads posts
    console.log("\n[THREADS ENGAGEMENT] Evaluating posts for brand / Founder pitch & live commenting...");
    await commandAnalyze({ platform: "threads", maxPosts: 15, maxLiveComments: 2 });

    // 5. Viral Quote-Posting Engine (Threads non-follower recommendation)
    if (cycle === 1 || cycle % 12 === 1) {
      await checkAndTriggerQuotePost();
    }

    // 6. Check Activity / Replies & DMs
    if (cycle === 1 || cycle % 3 === 1) {
      await commandReplies();
    }
    if (cycle === 1 || cycle % 5 === 1) {
      await commandDms();
    }

    // 7. Periodic feed refresh
    if (cycle % 30 === 1) {
      const page = await browserManager.getThreadsPage();
      await refreshThreadsFeed(page);
    }
    console.log(`[THREADS WORKER] Completed cycle #${cycle} operations.`);
  } catch (err) {
    console.error(`[THREADS WORKER] Error in cycle #${cycle}:`, err.message);
  }
}

async function runLinkedInCycle(cycle) {
  console.log(`\n[LINKEDIN WORKER] Starting active operations on LinkedIn tab (Cycle #${cycle})...`);
  try {
    await browserManager.getLinkedInPage({ bringToFront: true });

    // 1. Connection Requests: Auto-accept individual profile invites, reject page/group invites
    console.log("\n[LINKEDIN NETWORK] Managing incoming connection requests (profiles only)...");
    await checkLinkedInConnectionRequests();

    // 2. Inbound Direct Messages: Respond to new prospect messages
    console.log("\n[LINKEDIN INBOX] Checking direct messages from prospects...");
    await checkLinkedInMessages();

    // 3. Inbound Notifications: Respond to replies on our posts & comments
    console.log("\n[LINKEDIN NOTIFICATIONS] Checking comments & replies to our posts...");
    await checkLinkedInNotifications();

    // 4. Daily Thought-Leadership Post: Cross-post with visual assets
    await checkAndPublishLinkedInDailyPost();

    // 5. High-intent B2B search
    console.log("\n[LINKEDIN DISCOVERY] Searching high-intent B2B client queries on LinkedIn...");
    const liSearchRes = await searchLinkedInKeywords();
    console.log(`LinkedIn search query "${liSearchRes.query}": ${liSearchRes.scannedCount} visible, ${liSearchRes.newCount} new`);

    // 6. Immediate qualification & comment on discovered search posts (while on search page)
    console.log("\n[LINKEDIN SEARCH ENGAGEMENT] Evaluating and commenting on active B2B search results...");
    await commandAnalyze({ platform: "linkedin", maxPosts: 5, maxLiveComments: 1 });

    // 7. Executive feed scan
    console.log("\n[LINKEDIN FEED] Scanning LinkedIn home feed for executive & founder updates...");
    const liFeedRes = await scanLinkedInFeed({ maxPosts: 8 });
    console.log(`LinkedIn feed: ${liFeedRes.scannedCount} visible, ${liFeedRes.newCount} new`);

    // 8. Lead qualification & comments on feed posts (while on feed page)
    console.log("\n[LINKEDIN FEED ENGAGEMENT] Evaluating LinkedIn feed leads for executive & agency pitches...");
    await commandAnalyze({ platform: "linkedin", maxPosts: 5, maxLiveComments: 1 });

    console.log(`[LINKEDIN WORKER] Completed cycle #${cycle} operations.`);
  } catch (err) {
    console.error(`[LINKEDIN WORKER] Error in cycle #${cycle}:`, err.message);
  }
}

async function runFacebookCycle(cycle) {
  console.log(`\n[FACEBOOK WORKER] Starting active operations on Facebook tab (Cycle #${cycle})...`);
  try {
    await browserManager.getFacebookPage({ bringToFront: true });

    // 1. Inbound Notifications: Monitor comments & replies to our posts and respond
    console.log("\n[FACEBOOK NOTIFICATIONS] Checking incoming comments & replies...");
    await checkFacebookNotifications();

    // 2. Inbound Messenger: Check unread messages from prospective clients
    console.log("\n[FACEBOOK MESSENGER] Checking direct messages from prospective clients...");
    await checkFacebookMessages();

    // 3. Hybrid Search Discovery: Alternates between Targeted Keyword Search and High-Intent Group Posts
    if (cycle % 2 === 1) {
      console.log("\n[FACEBOOK SEARCH] Searching Facebook for targeted commercial buyer queries...");
      const searchRes = await searchFacebookPosts({ maxPosts: 12 });
      console.log(`Facebook search query "${searchRes.query}": ${searchRes.scannedCount} visible, ${searchRes.newCount} new`);
    } else {
      console.log("\n[FACEBOOK GROUP DISCOVERY] Scanning Facebook public group discussions for project leads...");
      const groupRes = await searchFacebookGroupPosts({ maxPosts: 10 });
      console.log(`Facebook group search query "${groupRes.query}": ${groupRes.scannedCount} visible, ${groupRes.newCount} new`);
    }

    // 4. Periodic Profile Timeline Check (every 6 cycles) for visitor comments on own posts
    if (cycle % 6 === 3) {
      console.log("\n[FACEBOOK PROFILE] Checking public profile timeline for incoming interactions...");
      const fbFeedRes = await scanFacebookProfileFeed({ maxPosts: 5 });
      console.log(`Facebook profile timeline: ${fbFeedRes.scannedCount} visible, ${fbFeedRes.newCount} new`);
    }

    // 5. Lead qualification & comments on discovered Facebook posts
    console.log("\n[FACEBOOK ENGAGEMENT] Evaluating Facebook buyer leads & commercial opportunities...");
    await commandAnalyze({ platform: "facebook", maxPosts: 10, maxLiveComments: 2 });

    // 6. Public profile post cadence
    if (cycle % 6 === 5 && CONFIG.POSTING_ENABLED && !CONFIG.DRY_RUN) {
      console.log("\n[FACEBOOK POSTER] Publishing scheduled public profile update...");
      await facebookPoster.publishPost();
    }
    console.log(`[FACEBOOK WORKER] Completed cycle #${cycle} operations.`);
  } catch (err) {
    console.error(`[FACEBOOK WORKER] Error in cycle #${cycle}:`, err.message);
  }
}

async function commandRun() {
  const executionMode = getExecutionMode();
  const isConcurrent = executionMode === "concurrent" || executionMode === "parallel";

  console.log("\n==============================================");
  console.log(`  🚀 STARTING AUTONOMOUS ORCHESTRATOR [${isConcurrent ? "CONCURRENT MULTI-TAB" : "SEQUENTIAL ROUND-ROBIN"}]`);
  console.log("==============================================");
  console.log(`Execution Mode : ${isConcurrent ? "CONCURRENT (Simultaneous Multi-Tab Processing)" : "ROUND-ROBIN (Sequential Single-Tab Rotation)"}`);
  console.log(`Mode           : DRY_RUN=${CONFIG.DRY_RUN}, APPROVAL_MODE=${CONFIG.APPROVAL_MODE}, POSTING_ENABLED=${CONFIG.POSTING_ENABLED}`);
  console.log(`Interval       : ${CONFIG.SCAN_INTERVAL_SECONDS}s, Post Cadence: Every ${CONFIG.POST_INTERVAL_HOURS}h\n`);

  let cycle = 0;
  while (true) {
    cycle++;
    try {
      if (isConcurrent) {
        console.log(`\n==============================================`);
        console.log(`[${new Date().toISOString()}] CYCLE #${cycle} STARTING [PARALLEL MULTI-TAB MODE]`);
        console.log(`Simultaneous tabs: Threads ⚡ LinkedIn ⚡ Facebook`);
        console.log(`==============================================`);

        console.log(`[ORCHESTRATOR] Initializing dedicated tabs for Threads, LinkedIn, and Facebook...`);
        await browserManager.ensureAllPlatformTabs();

        // Run all 3 platform workers concurrently in their dedicated tabs
        const results = await Promise.allSettled([
          runThreadsCycle(cycle),
          runLinkedInCycle(cycle),
          runFacebookCycle(cycle)
        ]);

        results.forEach((res, idx) => {
          const names = ["Threads", "LinkedIn", "Facebook"];
          if (res.status === "rejected") {
            console.error(`[${names[idx]}] Cycle error:`, res.reason?.message || res.reason);
          }
        });

        console.log(`\n==============================================`);
        console.log(`[${new Date().toISOString()}] CYCLE #${cycle} COMPLETED [ALL TABS PROCESSED]`);
        console.log(`Active pause for ${CONFIG.SCAN_INTERVAL_SECONDS}s before next parallel cycle...`);
        console.log(`==============================================\n`);
      } else if (executionMode === "round-robin" || executionMode === "rotation") {
        const platforms = ["threads", "facebook", "linkedin"];
        const activePlatform = platforms[(cycle - 1) % platforms.length];

        console.log(`\n==============================================`);
        console.log(`[${new Date().toISOString()}] CYCLE #${cycle} STARTING [ROUND-ROBIN: ${activePlatform.toUpperCase()}]`);
        console.log(`Rotation sequence: Threads ➔ Facebook ➔ LinkedIn`);
        console.log(`==============================================`);

        if (activePlatform === "threads") {
          await runThreadsCycle(cycle);
        } else if (activePlatform === "facebook") {
          await runFacebookCycle(cycle);
        } else {
          await runLinkedInCycle(cycle);
        }

        console.log(`\n==============================================`);
        console.log(`[${new Date().toISOString()}] CYCLE #${cycle} COMPLETED [${activePlatform.toUpperCase()}]`);
        console.log(`Active pause for ${CONFIG.SCAN_INTERVAL_SECONDS}s before next platform in rotation...`);
        console.log(`==============================================\n`);
      } else {
        // Sequential Multi-Tab Pipeline: Threads -> Facebook -> LinkedIn
        console.log(`\n==============================================`);
        console.log(`[${new Date().toISOString()}] CYCLE #${cycle} STARTING [MULTI-TAB PIPELINE: THREADS ➔ FACEBOOK ➔ LINKEDIN]`);
        console.log(`==============================================`);

        console.log(`\n[STEP 1/3] 🧵 THREADS TAB: Scanning feed, processing replies, and evaluating leads...`);
        await runThreadsCycle(cycle);

        console.log(`\n[STEP 2/3] 📘 FACEBOOK TAB: Searching commercial buyer queries, scanning groups, and pitching...`);
        await runFacebookCycle(cycle);

        console.log(`\n[STEP 3/3] 💼 LINKEDIN TAB: Searching high-intent B2B queries, scanning feed, and pitching...`);
        await runLinkedInCycle(cycle);

        console.log(`\n==============================================`);
        console.log(`[${new Date().toISOString()}] CYCLE #${cycle} COMPLETED [ALL 3 PLATFORMS VISIBLY EXECUTED]`);
        console.log(`Active pause for ${CONFIG.SCAN_INTERVAL_SECONDS}s before next cycle...`);
        console.log(`==============================================\n`);
      }

      if (process.argv.includes("--once")) {
        console.log(`\n[ORCHESTRATOR] Single cycle completed with --once flag. Exiting cleanly.`);
        break;
      }

      await new Promise(r => setTimeout(r, CONFIG.SCAN_INTERVAL_SECONDS * 1000));
    } catch (err) {
      console.error(`Error in cycle #${cycle}:`, err.message);
      if (process.argv.includes("--once")) break;
      await new Promise(r => setTimeout(r, 15000));
    }
  }
}

async function commandOnboard(options = {}) {
  console.log("\n============================================================");
  console.log("        🤖 AGENTIC AUTOMATION — FIRST-TIME SETUP");
  console.log("============================================================");
  console.log("This setup teaches the agent WHO it represents, WHAT it can");
  console.log("offer, WHERE it may operate, HOW it should communicate, and");
  console.log("WHICH safety controls are enabled. Passwords and 2FA codes");
  console.log("are never requested.\n");

  const currentFounder = knowledge.getFounderInfo();
  const currentCompany = knowledge.getCompanyInfo();
  const currentProfiles = knowledge.getOfficialProfiles();
  const privateDir = path.resolve(CONFIG.ROOT_DIR, "private");
  const profilePath = path.join(privateDir, "user-profile.json");
  let saved = {};
  if (fs.existsSync(profilePath)) {
    try { saved = JSON.parse(fs.readFileSync(profilePath, "utf8")); } catch (_) {}
  }

  let identity = {
    name: options.founderName || saved.identity?.name || currentFounder.name || "",
    role: options.founderRole || saved.identity?.role || currentFounder.role || "",
    bio: options.bio || saved.identity?.bio || "",
    expertise: options.expertise || saved.identity?.expertise || "",
    location: options.location || saved.identity?.location || "",
    timezone: options.timezone || saved.identity?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "",
    languages: options.languages || saved.identity?.languages || ""
  };
  let profiles = {
    linkedin: options.founderProfile || saved.profiles?.linkedin || currentProfiles.founder?.linkedin || "",
    threads: options.threadsUsername || saved.profiles?.threads || currentFounder.threadsUsername || "",
    github: options.github || saved.profiles?.github || "",
    website: options.personalWebsite || saved.profiles?.website || "",
    whatsapp: options.founderWhatsApp || saved.profiles?.whatsapp || currentProfiles.founder?.whatsapp || ""
  };
  let company = {
    name: options.companyName || saved.company?.name || currentCompany.name || "",
    website: options.companyWebsite || saved.company?.website || currentCompany.website || "",
    summary: options.companySummary || saved.company?.summary || currentCompany.summary || "",
    product: options.companyProduct || saved.company?.product || currentCompany.productUrl || "",
    audience: options.audience || saved.company?.audience || "",
    approved: options.approvedServices || saved.company?.approved || "Custom Software, SaaS, Web Apps, Mobile Apps, AI Workflows",
    excluded: options.excludedServices || saved.company?.excluded || "Graphic Design, SEO, Accounting, Recruitment"
  };
  let behavior = {
    voice: saved.behavior?.voice || "Professional, human, concise, helpful",
    objective: saved.behavior?.objective || "Build genuine business relationships and discover relevant opportunities",
    cta: saved.behavior?.cta || "",
    forbidden: saved.behavior?.forbidden || "",
    autoDm: saved.behavior?.autoDm ?? false,
    autoFollow: saved.behavior?.autoFollow ?? false,
    autoConnect: saved.behavior?.autoConnect ?? false,
    autoPublish: saved.behavior?.autoPublish ?? false
  };
  let browser = {
    type: saved.browser?.type || CONFIG.BROWSER_TYPE || "auto",
    cdpUrl: saved.browser?.cdpUrl || CONFIG.CDP_URL || "http://127.0.0.1:9222",
    platforms: saved.browser?.platforms || ["threads", "facebook", "linkedin"],
    mode: saved.browser?.mode || CONFIG.EXECUTION_MODE || "round-robin"
  };
  let safety = {
    dryRun: saved.safety?.dryRun ?? true,
    approval: saved.safety?.approval ?? true,
    comments: Number(saved.safety?.comments || 5),
    replies: Number(saved.safety?.replies || 5),
    dms: Number(saved.safety?.dms || 5),
    follows: Number(saved.safety?.follows || 10),
    connects: Number(saved.safety?.connects || 10),
    publishes: Number(saved.safety?.publishes || 2),
    scanSeconds: Number(saved.safety?.scanSeconds || 300)
  };

  const parseList = value => Array.isArray(value) ? value.map(item => String(item).trim()).filter(Boolean) : String(value || "").split(",").map(item => item.trim()).filter(Boolean);
  const askChoice = (value, allowed, fallback) => allowed.includes(String(value || "").toLowerCase()) ? String(value).toLowerCase() : fallback;
  const validUrl = (value, label) => {
    const text = String(value || "").trim();
    if (!text) return "";
    try {
      const url = new URL(text);
      if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error();
      return url.toString();
    } catch (_) {
      throw new Error(label + " must be a valid http(s) URL");
    }
  };

  if (!options.nonInteractive) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const ask = (query, fallback = "") => new Promise(resolve => {
      const prompt = fallback ? query + " [" + fallback + "]: " : query + ": ";
      rl.question(prompt, answer => resolve(answer.trim() || fallback));
    });
    const yesNo = async (query, fallback) => (await ask(query + " (y/n)", fallback ? "y" : "n")).toLowerCase().startsWith("y");
    try {
      console.log("--- 1/6 · YOUR IDENTITY ---");
      identity.name = await ask("Full name", identity.name);
      identity.role = await ask("Role / title", identity.role);
      identity.bio = await ask("Professional bio", identity.bio);
      identity.expertise = await ask("Skills / expertise (comma-separated)", identity.expertise);
      identity.location = await ask("Location (optional)", identity.location);
      identity.timezone = await ask("Timezone", identity.timezone);
      identity.languages = await ask("Languages (optional)", identity.languages);

      console.log("\n--- 2/6 · VERIFIED PROFILES ---");
      profiles.linkedin = await ask("LinkedIn URL", profiles.linkedin);
      profiles.threads = await ask("Threads username (without @)", profiles.threads);
      profiles.github = await ask("GitHub URL (optional)", profiles.github);
      profiles.website = await ask("Personal website / portfolio (optional)", profiles.website);
      profiles.whatsapp = await ask("WhatsApp booking URL (optional)", profiles.whatsapp);

      console.log("\n--- 3/6 · COMPANY / BRAND ---");
      company.name = await ask("Company / brand name", company.name);
      company.website = await ask("Company website", company.website);
      company.summary = await ask("What does the company do?", company.summary);
      company.product = await ask("Main product / demo URL (optional)", company.product);
      company.audience = await ask("Ideal customers / audience", company.audience);
      company.approved = await ask("Approved services (comma-separated)", company.approved);
      company.excluded = await ask("Excluded / do-not-sell services (comma-separated)", company.excluded);

      console.log("\n--- 4/6 · AGENT BEHAVIOUR ---");
      behavior.voice = await ask("Communication style", behavior.voice);
      behavior.objective = await ask("Primary objective", behavior.objective);
      behavior.cta = await ask("Preferred CTA (optional)", behavior.cta);
      behavior.forbidden = await ask("Topics / claims to avoid (optional)", behavior.forbidden);
      behavior.autoDm = await yesNo("Allow autonomous DM replies?", behavior.autoDm);
      behavior.autoFollow = await yesNo("Allow autonomous follows?", behavior.autoFollow);
      behavior.autoConnect = await yesNo("Allow autonomous connection requests?", behavior.autoConnect);
      behavior.autoPublish = await yesNo("Allow autonomous publishing?", behavior.autoPublish);

      console.log("\n--- 5/6 · BROWSER & PLATFORMS ---");
      browser.type = askChoice(await ask("Browser (auto/chrome/edge/brave/chromium)", browser.type), ["auto","chrome","edge","brave","chromium"], "auto");
      browser.cdpUrl = await ask("Browser CDP URL", browser.cdpUrl);
      browser.platforms = parseList(await ask("Enabled platforms (threads, facebook, linkedin)", browser.platforms.join(", ")));
      browser.mode = askChoice(await ask("Execution mode (round-robin/concurrent)", browser.mode), ["round-robin","concurrent"], "round-robin");

      console.log("\n--- 6/6 · SAFETY & AI ---");
      safety.dryRun = await yesNo("Start in DRY RUN mode?", safety.dryRun);
      safety.approval = await yesNo("Require approval before side effects?", safety.approval);
      safety.comments = Number(await ask("Max comments/hour", String(safety.comments)));
      safety.replies = Number(await ask("Max replies/hour", String(safety.replies)));
      safety.dms = Number(await ask("Max DMs/hour", String(safety.dms)));
      safety.follows = Number(await ask("Max follows/hour", String(safety.follows)));
      safety.connects = Number(await ask("Max connections/hour", String(safety.connects)));
      safety.publishes = Number(await ask("Max publishes/hour", String(safety.publishes)));
      safety.scanSeconds = Number(await ask("Scan interval seconds", String(safety.scanSeconds)));
      options.aiProvider = askChoice(await ask("AI provider (minimax/openai)", CONFIG.AI_PROVIDER), ["minimax","openai"], "minimax");
      options.minimaxModel = await ask("AI model", CONFIG.MODEL);
      if (options.aiProvider === "minimax") options.minimaxApiKey = await ask("MiniMax API key (blank keeps existing)", "");
      if (options.aiProvider === "openai") {
        options.openaiApiKey = await ask("OpenAI-compatible API key (blank keeps existing)", "");
        options.openaiBaseUrl = await ask("OpenAI-compatible base URL", CONFIG.OPENAI_BASE_URL);
      }
    } finally {
      rl.close();
    }
  } else {
    company.approved = parseList(company.approved);
    company.excluded = parseList(company.excluded);
    browser.platforms = parseList(browser.platforms);
  }

  profiles.linkedin = validUrl(profiles.linkedin, "LinkedIn URL");
  profiles.github = validUrl(profiles.github, "GitHub URL");
  profiles.website = validUrl(profiles.website, "Personal website");
  profiles.whatsapp = validUrl(profiles.whatsapp, "WhatsApp URL");
  company.website = validUrl(company.website, "Company website");
  company.product = validUrl(company.product, "Product URL");
  profiles.threads = String(profiles.threads || "").trim();\n  while (profiles.threads.startsWith("@")) profiles.threads = profiles.threads.slice(1);
  company.approved = parseList(company.approved);
  company.excluded = parseList(company.excluded);
  browser.platforms = parseList(browser.platforms).filter(item => ["threads","facebook","linkedin"].includes(item.toLowerCase())).map(item => item.toLowerCase());
  if (!browser.platforms.length) browser.platforms = ["threads"];
  if (!Number.isFinite(safety.comments) || safety.comments < 0) safety.comments = 5;
  if (!Number.isFinite(safety.replies) || safety.replies < 0) safety.replies = 5;
  if (!Number.isFinite(safety.dms) || safety.dms < 0) safety.dms = 5;
  if (!Number.isFinite(safety.follows) || safety.follows < 0) safety.follows = 10;
  if (!Number.isFinite(safety.connects) || safety.connects < 0) safety.connects = 10;
  if (!Number.isFinite(safety.publishes) || safety.publishes < 0) safety.publishes = 2;
  if (!Number.isFinite(safety.scanSeconds) || safety.scanSeconds < 60) safety.scanSeconds = 300;

  const profile = { identity, profiles, company, behavior, browser, safety, ai: { provider: options.aiProvider || CONFIG.AI_PROVIDER, model: options.minimaxModel || CONFIG.MODEL } };
  fs.mkdirSync(privateDir, { recursive: true });
  fs.writeFileSync(profilePath, JSON.stringify(profile, null, 2) + "\n", "utf8");

  const knowledgeDir = path.resolve(CONFIG.ROOT_DIR, "knowledge");
  fs.mkdirSync(knowledgeDir, { recursive: true });
  fs.writeFileSync(path.join(knowledgeDir, "founder.md"), "# Founder Profile\n\nName: " + identity.name + "\nRole: " + identity.role + "\nBio: " + identity.bio + "\nExpertise: " + parseList(identity.expertise).join(", ") + "\nLocation: " + identity.location + "\nTimezone: " + identity.timezone + "\nLanguages: " + identity.languages + "\n\n## Verified Profiles\nThreads: @" + profiles.threads + "\nLinkedIn: " + profiles.linkedin + "\nGitHub: " + profiles.github + "\nWebsite: " + profiles.website + "\nWhatsApp: " + profiles.whatsapp + "\n", "utf8");
  fs.writeFileSync(path.join(knowledgeDir, "company.md"), "# Company Profile\n\nName: " + company.name + "\nWebsite: " + company.website + "\nProduct: " + (company.product || "None") + "\nWhatsApp: " + profiles.whatsapp + "\n\n## Summary\n" + company.summary + "\n\n## Audience\n" + company.audience + "\n", "utf8");
  fs.writeFileSync(path.join(knowledgeDir, "profiles.md"), "# Official Profiles & URLs\n\n## Founder\nName: " + identity.name + "\nLinkedIn: " + profiles.linkedin + "\nThreads: @" + profiles.threads + "\nGitHub: " + profiles.github + "\nWebsite: " + profiles.website + "\nWhatsApp: " + profiles.whatsapp + "\n\n## Company\nName: " + company.name + "\nWebsite: " + company.website + "\nProduct: " + (company.product || "None") + "\nWhatsApp: " + profiles.whatsapp + "\n", "utf8");
  fs.writeFileSync(path.join(knowledgeDir, "services.md"), "# Services & Capabilities\n\n## Approved Capabilities\n" + company.approved.map(item => "- " + item).join("\n") + "\n\n## Excluded Capabilities\n" + company.excluded.map(item => "- " + item).join("\n") + "\n", "utf8");

  const envPath = path.resolve(CONFIG.ROOT_DIR, ".env");
  let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
  const upsertEnv = (content, key, value) => {
    const prefix = key + "=";
    const lines = String(content || "").split(String.fromCharCode(10));
    let found = false;
    const next = lines.map(line => {
      if (line.trimStart().startsWith(prefix)) { found = true; return prefix + String(value ?? ""); }
      return line;
    });
    if (!found) next.push(prefix + String(value ?? ""));
    return next.join(String.fromCharCode(10));
  };
  envContent = upsertEnv(envContent, "BROWSER_TYPE", browser.type);
  envContent = upsertEnv(envContent, "THREADS_CDP_URL", browser.cdpUrl);
  envContent = upsertEnv(envContent, "CDP_URL", browser.cdpUrl);
  envContent = upsertEnv(envContent, "EXECUTION_MODE", browser.mode);
  envContent = upsertEnv(envContent, "PLATFORM_TARGET", browser.platforms[0]);
  envContent = upsertEnv(envContent, "DRY_RUN", String(safety.dryRun));
  envContent = upsertEnv(envContent, "APPROVAL_MODE", String(safety.approval));
  envContent = upsertEnv(envContent, "POSTING_ENABLED", String(behavior.autoPublish));
  envContent = upsertEnv(envContent, "MAX_NEW_POST_REPLIES_PER_HOUR", String(safety.comments));
  envContent = upsertEnv(envContent, "MAX_TOTAL_REPLIES_PER_HOUR", String(safety.replies));
  envContent = upsertEnv(envContent, "MAX_DM_REPLIES_PER_HOUR", String(safety.dms));
  envContent = upsertEnv(envContent, "SCAN_INTERVAL_SECONDS", String(safety.scanSeconds));
  envContent = upsertEnv(envContent, "SOCIAL_MAX_COMMENTS_PER_HOUR", String(safety.comments));
  envContent = upsertEnv(envContent, "SOCIAL_MAX_REPLIES_PER_HOUR", String(safety.replies));
  envContent = upsertEnv(envContent, "SOCIAL_MAX_DMS_PER_HOUR", String(safety.dms));
  envContent = upsertEnv(envContent, "SOCIAL_MAX_FOLLOWS_PER_HOUR", String(safety.follows));
  envContent = upsertEnv(envContent, "SOCIAL_MAX_CONNECTS_PER_HOUR", String(safety.connects));
  envContent = upsertEnv(envContent, "SOCIAL_MAX_PUBLISHES_PER_HOUR", String(safety.publishes));
  envContent = upsertEnv(envContent, "AI_PROVIDER", profile.ai.provider);
  envContent = upsertEnv(envContent, "AI_RUNTIME", profile.ai.provider);
  envContent = upsertEnv(envContent, "AI_MODEL", profile.ai.model);
  if (options.minimaxApiKey) envContent = upsertEnv(envContent, "MINIMAX_API_KEY", options.minimaxApiKey);
  if (options.openaiApiKey) envContent = upsertEnv(envContent, "OPENAI_API_KEY", options.openaiApiKey);
  if (options.openaiBaseUrl) envContent = upsertEnv(envContent, "OPENAI_BASE_URL", options.openaiBaseUrl);
  fs.writeFileSync(envPath, envContent, { encoding: "utf8", mode: 0o600 });

  knowledge.loadKnowledge();
  console.log("\n============================================================");
  console.log("              ✅ ONBOARDING COMPLETE");
  console.log("============================================================");
  console.log("Identity   : " + identity.name + " · " + identity.role);
  console.log("Company    : " + company.name);
  console.log("Platforms  : " + browser.platforms.join(", "));
  console.log("Browser    : " + browser.type + " · " + browser.cdpUrl);
  console.log("Execution  : " + browser.mode);
  console.log("Dry Run    : " + (safety.dryRun ? "ON" : "OFF"));
  console.log("Approval   : " + (safety.approval ? "ON" : "OFF"));
  console.log("Auto DMs   : " + (behavior.autoDm ? "ON" : "OFF"));
  console.log("Auto Follow: " + (behavior.autoFollow ? "ON" : "OFF"));
  console.log("Auto Connect: " + (behavior.autoConnect ? "ON" : "OFF"));
  console.log("Auto Publish: " + (behavior.autoPublish ? "ON" : "OFF"));
  console.log("AI         : " + profile.ai.provider + " · " + profile.ai.model);
  console.log("Profile    : ./private/user-profile.json");
  console.log("Knowledge  : ./knowledge/");
  console.log("Security   : CAPTCHA, login and identity challenges require manual action.");
  console.log("============================================================\n");
  return 0;
}

async function main() {
  const cmd = (process.argv[2] || "status").toLowerCase();

  switch (cmd) {
    case "onboard":
    case "configure":
      process.exit(await commandOnboard());
      break;
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
    case "post": {
      const platform = (process.argv[3] || "threads").toLowerCase();
      if (platform === "linkedin") {
        console.log("\n[LINKEDIN POSTER] Publishing B2B thought-leadership post...");
        await linkedInPoster.publishPost();
      } else if (platform === "facebook") {
        console.log("\n[FACEBOOK POSTER] Publishing Facebook public profile post...");
        await facebookPoster.publishPost();
      } else {
        await checkAndPublishScheduledPost(true);
      }
      browserManager.disconnect();
      process.exit(0);
      break;
    }
    case "status":
      process.exit(await commandStatus());
      break;
    case "health":
      process.exit(await commandHealth());
      break;
    case "accept":
      process.exit(await commandAccept());
      break;
    case "test":
      await (require("./tests/suite").runAllTests());
      process.exit(0);
      break;
    case "master":
    case "orchestrator": {
      const aiRuntime = require("./src/ai/ai-runtime");
      const MasterOrchestrator = require("./src/orchestrator/master-orchestrator");
      const orchestrator = new MasterOrchestrator({ aiRuntime });
      await orchestrator.runContinuous();
      break;
    }
    case "run":
      if (process.argv.includes("--master") || process.argv.includes("--all")) {
        const aiRuntime = require("./src/ai/ai-runtime");
        const MasterOrchestrator = require("./src/orchestrator/master-orchestrator");
        const orchestrator = new MasterOrchestrator({ aiRuntime });
        await orchestrator.runContinuous();
      } else {
        await commandRun();
      }
      break;
    default:
      console.log(`Unknown command: ${cmd}`);
      console.log("Available: onboard, configure, auth, scan, analyze, approve, replies, dms, post, status, health, accept, test, run, master");
      process.exit(1);
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}

module.exports = {
  commandAuth,
  commandScan,
  commandAnalyze,
  commandApprove,
  commandReplies,
  commandDms,
  commandStatus,
  commandHealth,
  commandAccept,
  commandOnboard,
  isPeakEngagementWindow,
  checkAndPublishScheduledPost,
  checkAndTriggerQuotePost
};
