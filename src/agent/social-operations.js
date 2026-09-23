/**
 * src/agent/social-operations.js
 * Universal Agentic Social Operations Layer.
 *
 * Replaces ALL platform-specific hardcoded action files (threads-actions.js,
 * linkedin-actions.js, facebook-actions.js, instagram-actions.js) with
 * goal-driven AI operations that work on ANY platform.
 *
 * Every operation is a goal described in natural language → AgenticRunner
 * observes the live screen and figures out how to achieve it.
 *
 * ZERO hardcoded selectors. ZERO platform-specific UI knowledge.
 */

const CONFIG = require("../../config");
const AgenticRunner = require("./agentic-runner");
const rateLimiter = require("../safety/rate-limiter");
const duplicateGuard = require("../safety/duplicate-guard");
const stateStore = require("../storage/state-store");
const logger = require("../logging/logger");

class AgenticSocialOps {
  /**
   * @param {Object} options
   * @param {Object} options.aiRuntime — MiniMax M3 AI runtime
   * @param {Object} options.browserAgent — BrowserAgent with live page
   * @param {string} [options.platform="threads"] — Platform name
   */
  constructor({ aiRuntime, browserAgent, platform = "threads" }) {
    this.aiRuntime = aiRuntime;
    this.browserAgent = browserAgent;
    this.platform = platform;
    this.runner = new AgenticRunner({
      aiRuntime,
      browserAgent,
      maxIterations: CONFIG.JOB_MAX_PLAN_ITERATIONS || 10
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // COMMENTING — works on ANY platform by observing the live screen
  // ═══════════════════════════════════════════════════════════════

  /**
   * Posts a comment on a specific post. The AI navigates to the post,
   * finds the comment composer, types the comment, and verifies it appears.
   *
   * @param {Object} post — Post object with at least { postId, url, username }
   * @param {string} commentText — The comment to post
   * @param {Object} [options={}] — { dryRun, approvalMode }
   */
  async postComment(post, commentText, options = {}) {
    const isDryRun = options.dryRun !== undefined ? options.dryRun : CONFIG.DRY_RUN;
    const isApprovalMode = options.approvalMode !== undefined ? options.approvalMode : CONFIG.APPROVAL_MODE;
    const isPostingEnabled = CONFIG.POSTING_ENABLED;

    // Safety checks
    const dupCheck = duplicateGuard.canExecute({
      platform: this.platform,
      actionType: "COMMENT",
      targetId: post.postId,
      text: commentText
    });

    if (!dupCheck.allowed) {
      logger.warn(`[AGENTIC SOCIAL] Skipping comment: ${dupCheck.reason}`);
      return { success: false, reason: dupCheck.reason };
    }

    const rateCheck = rateLimiter.canPerform("NEW_POST_COMMENT", this.platform);
    if (!rateCheck.allowed && !isDryRun && isPostingEnabled) {
      logger.warn(`[AGENTIC SOCIAL] Rate limit reached: ${rateCheck.reason}`);
      return { success: false, reason: rateCheck.reason };
    }

    // Dry-run / Approval mode path
    if (isDryRun || !isPostingEnabled || isApprovalMode) {
      const mode = isApprovalMode ? "APPROVAL_PENDING" : isDryRun ? "DRY_RUN" : "POSTING_DISABLED";
      logger.audit("COMMENT_SIMULATED", `${this.platform}:${post.postId}`, {
        platform: this.platform,
        mode,
        username: post.username,
        commentText
      });

      stateStore.recordComment(post.postId, {
        username: post.username,
        url: post.url,
        comment: commentText,
        status: isApprovalMode ? "PENDING" : "SIMULATED",
        approvalRequired: isApprovalMode
      }, this.platform);

      return {
        success: true,
        dryRun: true,
        approvalRequired: isApprovalMode,
        postId: post.postId,
        comment: commentText
      };
    }

    // ═══════════════════════════════════════════════════
    // LIVE AGENTIC EXECUTION — AI observes and acts
    // ═══════════════════════════════════════════════════
    logger.info(`[AGENTIC SOCIAL] Executing live comment on ${this.platform} for @${post.username}...`);

    const postUrl = post.url || "";
    const result = await this.runner.run({
      goal: `Post a comment on the ${this.platform} post by @${post.username}.
${postUrl ? `Navigate to the post URL: ${postUrl}.` : "The post should be visible on the current page."}
Find and activate the reply/comment input area (look for reply box, comment field, or similar).
Type this exact comment: "${commentText}"
Submit the comment by clicking the post/reply/send button.
Verify the comment appears as a published comment on the page (not still in the draft/composer area).
The comment should be visible in the thread as posted by the current logged-in account.`,
      context: {
        targetId: `comment:${this.platform}:${post.postId}`,
        operation: "COMMENT",
        platform: this.platform,
        postAuthor: post.username
      },
      securityPolicy: { noCaptchaBypass: true, noCredentials: true }
    });

    if (result.status === "DONE") {
      stateStore.recordComment(post.postId, {
        username: post.username,
        url: post.url,
        comment: commentText,
        status: "VERIFIED",
        agenticVerified: true
      }, this.platform);

      duplicateGuard.recordExecuted({
        platform: this.platform,
        actionType: "COMMENT",
        targetId: post.postId,
        text: commentText,
        username: post.username
      });

      return { success: true, verified: true, postId: post.postId, comment: commentText, result };
    }

    logger.warn(`[AGENTIC SOCIAL] Comment failed: ${result.reason || result.status}`);
    return { success: false, reason: result.reason || result.status, result };
  }

  // ═══════════════════════════════════════════════════════════════
  // FEED SCANNING — AI discovers posts on any platform
  // ═══════════════════════════════════════════════════════════════

  /**
   * Scans the current platform feed and extracts visible posts.
   * The AI scrolls naturally and reads post content, author info, and engagement.
   *
   * @param {Object} [options={}] — { maxPosts, scrollCount }
   */
  async scanFeed(options = {}) {
    const maxPosts = options.maxPosts || 15;
    const scrollCount = options.scrollCount || 5;

    const result = await this.runner.run({
      goal: `I'm on ${this.platform}. Observe the current feed/timeline page.
Scroll naturally to discover posts. For each visible post, extract:
- Author username or display name
- Full post text content
- Post URL or any unique identifier visible in the DOM
- Engagement signals if visible (likes, comments count, shares count)
- Approximate post age/timestamp if visible

Return DONE with a "data" field containing an array of extracted posts when you've captured
${maxPosts} posts or scrolled ${scrollCount} times, whichever comes first.

Output data format: { "posts": [{ "username": "", "text": "", "url": "", "postId": "", "engagement": {} }] }`,
      context: {
        operation: "FEED_SCAN",
        platform: this.platform,
        maxPosts,
        scrollCount
      }
    });

    if (result.status === "DONE" && result.data) {
      const posts = result.data.posts || [];
      let newCount = 0;

      for (const p of posts) {
        if (p.postId && !stateStore.state.posts[`${this.platform}:${p.postId}`]) {
          stateStore.state.posts[`${this.platform}:${p.postId}`] = {
            ...p,
            platform: this.platform,
            discoveredAt: new Date().toISOString(),
            source: "agentic_feed_scan"
          };
          newCount++;
        }
      }

      stateStore.save();
      return { scannedCount: posts.length, newCount, posts };
    }

    return { scannedCount: 0, newCount: 0, posts: [], reason: result.reason || result.status };
  }

  // ═══════════════════════════════════════════════════════════════
  // SEARCH DISCOVERY — AI dynamically searches, no hardcoded queries
  // ═══════════════════════════════════════════════════════════════

  /**
   * AI-driven search discovery. Instead of hardcoded queries like "need a website",
   * the AI observes the platform's search UI and generates contextual search queries.
   *
   * @param {Object} [options={}] — { searchIntent, maxResults }
   */
  async searchDiscovery(options = {}) {
    const searchIntent = options.searchIntent || "people who need software development, web applications, or AI solutions built";
    const maxResults = options.maxResults || 12;

    const result = await this.runner.run({
      goal: `On ${this.platform}, find the search functionality (search bar, search icon, explore page).
Based on the platform's UI and the search intent "${searchIntent}",
construct and execute a search query that finds people who genuinely need software/web development services.
Think about what real buyers on this platform would post when looking for development help.

After executing the search:
- Observe the results page
- Extract posts that show genuine buyer intent (asking for help building something, looking for developers, etc.)
- For each relevant result, extract: author, text, url/id, engagement
- Return DONE with extracted results (up to ${maxResults} posts)

Output data format: { "query": "the search query used", "posts": [...] }`,
      context: {
        operation: "SEARCH_DISCOVERY",
        platform: this.platform,
        searchIntent,
        maxResults
      }
    });

    if (result.status === "DONE" && result.data) {
      const posts = result.data.posts || [];
      let newCount = 0;

      for (const p of posts) {
        const key = `${this.platform}:${p.postId || p.url || ""}`;
        if (key !== `${this.platform}:` && !stateStore.state.posts[key]) {
          stateStore.state.posts[key] = {
            ...p,
            platform: this.platform,
            discoveredAt: new Date().toISOString(),
            source: "agentic_search"
          };
          newCount++;
        }
      }

      stateStore.save();
      return {
        query: result.data.query || "AI-generated",
        scannedCount: posts.length,
        newCount,
        posts
      };
    }

    return { query: "", scannedCount: 0, newCount: 0, posts: [], reason: result.reason || result.status };
  }

  // ═══════════════════════════════════════════════════════════════
  // PUBLISHING — create and publish posts on any platform
  // ═══════════════════════════════════════════════════════════════

  /**
   * Publishes a new post on the current platform.
   * AI finds the create/compose button, types content, optionally uploads media, and submits.
   *
   * @param {string} content — Post text content
   * @param {Object} [options={}] — { mediaPath, dryRun }
   */
  async publishPost(content, options = {}) {
    const isDryRun = options.dryRun !== undefined ? options.dryRun : CONFIG.DRY_RUN;

    if (isDryRun || !CONFIG.POSTING_ENABLED) {
      logger.audit("POST_PUBLISH_SIMULATED", `${this.platform}:publish`, {
        platform: this.platform,
        content: content.slice(0, 100),
        hasMedia: !!options.mediaPath
      });
      return { success: true, dryRun: true, content };
    }

    const mediaInstruction = options.mediaPath
      ? `Upload the image/media from path: ${options.mediaPath}.`
      : "";

    const result = await this.runner.run({
      goal: `Create and publish a new post on ${this.platform}.
Find the "new post", "create", "write", "start a thread", or compose button/icon.
Open the post composer.
Type this content: "${content}"
${mediaInstruction}
Submit/publish the post using the post/publish/share button.
Verify the post appears on the timeline/feed as a published post.`,
      context: {
        operation: "PUBLISH",
        platform: this.platform,
        hasMedia: !!options.mediaPath
      },
      securityPolicy: { noCaptchaBypass: true }
    });

    return {
      success: result.status === "DONE",
      verified: result.status === "DONE",
      result
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // DIRECT MESSAGES — send DMs on any platform
  // ═══════════════════════════════════════════════════════════════

  /**
   * Sends a direct message to a user on the current platform.
   * AI navigates to messaging, finds/opens the conversation, types and sends.
   *
   * @param {string} recipient — Username or conversation identifier
   * @param {string} message — Message text
   * @param {Object} [options={}] — { threadId, dryRun }
   */
  async sendDirectMessage(recipient, message, options = {}) {
    const isDryRun = options.dryRun !== undefined ? options.dryRun : CONFIG.DRY_RUN;

    // Rate limiting
    const rateCheck = rateLimiter.canPerform("DM_REPLY", this.platform);
    if (!rateCheck.allowed && !isDryRun) {
      return { success: false, reason: rateCheck.reason, rateLimited: true };
    }

    if (isDryRun || !CONFIG.POSTING_ENABLED) {
      logger.audit("DM_SIMULATED", `${this.platform}:${recipient}`, {
        platform: this.platform,
        recipient,
        message: message.slice(0, 50)
      });
      return { success: true, dryRun: true, recipient, message };
    }

    const result = await this.runner.run({
      goal: `Navigate to the messaging/DM section of ${this.platform}.
Find or open the conversation with "${recipient}".
${options.threadId ? `The conversation thread ID is: ${options.threadId}.` : ""}
Type this message: "${message}"
Send it using the send button.
Verify the message appears as sent in the conversation thread.`,
      context: {
        operation: "DM_SEND",
        platform: this.platform,
        recipient
      },
      securityPolicy: { noCaptchaBypass: true, noCredentials: true }
    });

    return {
      success: result.status === "DONE",
      verified: result.status === "DONE",
      recipient,
      result
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // NOTIFICATIONS/ACTIVITY — check and process notifications
  // ═══════════════════════════════════════════════════════════════

  /**
   * Checks notifications/activity on the current platform.
   * AI navigates to the activity/notifications section and extracts items.
   *
   * @param {Object} [options={}] — { maxItems }
   */
  async checkNotifications(options = {}) {
    const maxItems = options.maxItems || 20;

    const result = await this.runner.run({
      goal: `Navigate to the notifications/activity section of ${this.platform}.
Observe the notification items. For each notification, extract:
- Type (comment reply, mention, like, follow, message, connection request)
- Sender/actor username
- Preview text or content
- Whether it requires a response
- Link to the original post/conversation if visible

Return DONE with a "data" field containing the extracted notifications (up to ${maxItems}).
Output: { "notifications": [{ "type": "", "sender": "", "preview": "", "needsResponse": true/false, "url": "" }] }`,
      context: {
        operation: "CHECK_NOTIFICATIONS",
        platform: this.platform,
        maxItems
      }
    });

    if (result.status === "DONE" && result.data) {
      return {
        success: true,
        notifications: result.data.notifications || [],
        count: (result.data.notifications || []).length
      };
    }

    return { success: false, notifications: [], count: 0, reason: result.reason };
  }

  // ═══════════════════════════════════════════════════════════════
  // QUOTE POST — quote/repost with commentary
  // ═══════════════════════════════════════════════════════════════

  /**
   * Creates a quote-post (repost with commentary) on the current platform.
   *
   * @param {Object} originalPost — { url, username, text }
   * @param {string} commentary — Commentary to add
   */
  async quotePost(originalPost, commentary) {
    if (CONFIG.DRY_RUN || !CONFIG.POSTING_ENABLED) {
      logger.audit("QUOTE_POST_SIMULATED", `${this.platform}:quote`, {
        originalAuthor: originalPost.username,
        commentary: commentary.slice(0, 50)
      });
      return { success: true, dryRun: true };
    }

    const result = await this.runner.run({
      goal: `On ${this.platform}, find the repost/quote/share functionality for the post by @${originalPost.username}.
${originalPost.url ? `The post URL is: ${originalPost.url}.` : `The post content starts with: "${(originalPost.text || "").slice(0, 100)}"`}
Select "Quote" or "Repost with comment" or "Quote post" (the exact label depends on the platform).
Add this commentary: "${commentary}"
Submit the quote-post.
Verify the quote-post appears as published.`,
      context: {
        operation: "QUOTE_POST",
        platform: this.platform,
        originalAuthor: originalPost.username
      },
      securityPolicy: { noCaptchaBypass: true }
    });

    return {
      success: result.status === "DONE",
      verified: result.status === "DONE",
      result
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // CONNECTION REQUESTS — accept/reject on professional networks
  // ═══════════════════════════════════════════════════════════════

  /**
   * Checks and processes connection/follow requests.
   * AI navigates to the requests section and handles them based on criteria.
   */
  async processConnectionRequests() {
    const result = await this.runner.run({
      goal: `Navigate to the connection requests / follow requests section of ${this.platform}.
For each pending request:
- Read the person's name, headline/bio, and mutual connections if visible
- Accept individual/personal profile requests
- Skip or reject page/company/group invitations
- Extract details of each processed request

Return DONE with processed requests data.
Output: { "processed": [{ "name": "", "action": "ACCEPTED|REJECTED|SKIPPED", "reason": "" }] }`,
      context: {
        operation: "CONNECTION_REQUESTS",
        platform: this.platform
      }
    });

    return {
      success: result.status === "DONE",
      processed: result.data?.processed || [],
      result
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // MESSAGES/INBOX — check and process inbound messages
  // ═══════════════════════════════════════════════════════════════

  /**
   * Checks the messaging inbox and extracts unread conversations.
   */
  async checkMessages() {
    const result = await this.runner.run({
      goal: `Navigate to the messaging/inbox section of ${this.platform}.
Observe the conversation list. Identify unread or recent conversations.
For each conversation:
- Sender name/username
- Last message preview
- Whether it's unread
- Timestamp if visible
- Whether it appears to need a response from us

Return DONE with extracted message data.
Output: { "conversations": [{ "sender": "", "lastMessage": "", "isUnread": true/false, "needsResponse": true/false }] }`,
      context: {
        operation: "CHECK_MESSAGES",
        platform: this.platform
      }
    });

    return {
      success: result.status === "DONE",
      conversations: result.data?.conversations || [],
      result
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // AUTH CHECK — verify authentication status on any platform
  // ═══════════════════════════════════════════════════════════════

  /**
   * Checks if the current browser session is authenticated on this platform.
   * AI observes the page and looks for authentication indicators.
   */
  async checkAuthentication() {
    const result = await this.runner.run({
      goal: `Observe the current page on ${this.platform}.
Determine if I am logged in / authenticated by looking for:
- Profile avatar or username in navigation
- Dashboard or feed content (not a login page)
- Sign-out / settings / account options
- Any personalized content

Return DONE with authentication status.
Output: { "authenticated": true/false, "evidence": "what I see that confirms auth status", "username": "detected username if visible" }`,
      context: {
        operation: "AUTH_CHECK",
        platform: this.platform
      }
    });

    return {
      authenticated: result.data?.authenticated || false,
      evidence: result.data?.evidence || result.reason,
      username: result.data?.username || null
    };
  }
}

module.exports = AgenticSocialOps;
