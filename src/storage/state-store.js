/**
 * src/storage/state-store.js
 * Persistent State Store for Threads + Instagram Lead Discovery & Engagement.
 * Enforces atomic writes to avoid state file corruption.
 * Implements comprehensive multi-platform conversation tracking.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const CONFIG = require("../../config");
const logger = require("../logging/logger");

const INITIAL_STATE = {
  version: "2.0.0",
  lastUpdated: new Date().toISOString(),
  posts: {},
  conversations: {},
  comments: {},
  replies: {},
  dms: {},
  actions: {},
  stats: {
    total_scanned: 0,
    total_qualified: 0,
    total_comments_pending: 0,
    total_comments_posted: 0,
    total_replies_handled: 0,
    total_dms_handled: 0
  }
};

class StateStore {
  constructor(filePath = CONFIG.STATE_FILE) {
    this.filePath = filePath;
    this.state = this.loadState();
  }

  loadState() {
    if (fs.existsSync(this.filePath)) {
      try {
        const raw = fs.readFileSync(this.filePath, "utf8");
        const parsed = JSON.parse(raw);
        return {
          ...INITIAL_STATE,
          ...parsed,
          posts: parsed.posts || {},
          conversations: parsed.conversations || {},
          comments: parsed.comments || {},
          replies: parsed.replies || {},
          dms: parsed.dms || {},
          actions: parsed.actions || {},
          stats: { ...INITIAL_STATE.stats, ...(parsed.stats || {}) }
        };
      } catch (err) {
        logger.error(`Error loading state from ${this.filePath}, initializing fresh state`, err);
        return JSON.parse(JSON.stringify(INITIAL_STATE));
      }
    }
    return JSON.parse(JSON.stringify(INITIAL_STATE));
  }

  saveState() {
    try {
      this.state.lastUpdated = new Date().toISOString();
      const tempPath = `${this.filePath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
      fs.writeFileSync(tempPath, JSON.stringify(this.state, null, 2), "utf8");
      fs.renameSync(tempPath, this.filePath);
    } catch (err) {
      logger.error(`Failed saving state to ${this.filePath}`, err);
    }
  }

  // --- POSTS ---
  getPostKey(platform, postId) {
    return `${platform || "threads"}:${postId}`;
  }

  hasPost(postId, platform = "threads") {
    const key = this.getPostKey(platform, postId);
    return Boolean(this.state.posts[key] || this.state.posts[postId]);
  }

  getPost(postId, platform = "threads") {
    const key = this.getPostKey(platform, postId);
    return this.state.posts[key] || this.state.posts[postId] || null;
  }

  addDiscoveredPost(post, platform = "threads") {
    if (!post.postId) return;
    const key = this.getPostKey(platform, post.postId);
    if (!this.state.posts[key] && !this.state.posts[post.postId]) {
      this.state.posts[key] = {
        key,
        platform,
        postId: post.postId,
        username: post.username,
        url: post.url,
        text: post.text,
        status: "DISCOVERED",
        discoveredAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      this.state.stats.total_scanned++;
      this.saveState();
    }
  }

  updatePostStatus(postId, status, extra = {}, platform = "threads") {
    const key = this.getPostKey(platform, postId);
    const post = this.state.posts[key] || this.state.posts[postId];
    if (post) {
      post.status = status;
      post.updatedAt = new Date().toISOString();
      if (status === "COMMENT_POSTED" || status === "COMMENTED" || status === "POSTED_LIVE") {
        post.commentPosted = true;
      }
      Object.assign(post, extra);
      this.saveState();
    }
  }

  getRetryableFailedPosts(maxRetries = 3, cooldownMinutes = 15, platform = "threads", options = {}) {
    const cutoffMs = Date.now() - cooldownMinutes * 60 * 1000;
    return Object.values(this.state.posts).filter(p => {
      if (!p || !p.postId) return false;
      if (!options.includeTestPosts) {
        if (p.postId.includes("test_") || (p.username && (p.username.includes("user_retry") || p.username.includes("user_test")))) {
          return false;
        }
      }
      if ((p.platform || "threads") !== platform) return false;
      if (p.status !== "COMMENT_FAILED") return false;
      const retryCount = p.retryCount || 0;
      if (retryCount >= maxRetries) return false;
      const failedTimestamp = p.failedAt || p.lastFailedAt;
      const failedTime = failedTimestamp ? new Date(failedTimestamp).getTime() : Date.now();
      return failedTime <= cutoffMs;
    });
  }

  // --- COMMENTS ---
  hasCommented(postId, platform = "threads") {
    const key = this.getPostKey(platform, postId);
    if (this.state.comments[key] || this.state.comments[postId]) return true;
    const post = this.state.posts[key] || this.state.posts[postId];
    return Boolean(
      post && (
        post.status === "COMMENT_POSTED" ||
        post.status === "COMMENTED" ||
        post.status === "POSTED_LIVE" ||
        post.commentPosted === true
      )
    );
  }

  recordComment(postId, commentData, platform = "threads") {
    const key = this.getPostKey(platform, postId);
    const now = new Date().toISOString();
    const isLive = commentData.status === "POSTED" || commentData.status === "POSTED_LIVE" || commentData.status === "COMMENTED";
    this.state.comments[key] = {
      key,
      platform,
      postId,
      username: commentData.username,
      url: commentData.url,
      comment: commentData.comment,
      status: commentData.status || (isLive ? "POSTED" : "PENDING"),
      postedAt: now,
      approvalRequired: Boolean(commentData.approvalRequired)
    };

    const post = this.state.posts[key] || this.state.posts[postId];
    if (post) {
      post.status = isLive ? "COMMENT_POSTED" : "COMMENT_PENDING";
      post.commentText = commentData.comment;
      post.commentPosted = isLive;
      post.updatedAt = now;
    }

    if (isLive) {
      this.state.stats.total_comments_posted++;
      this.recordAction("COMMENT_POSTED", postId, { platform, username: commentData.username });
    } else {
      this.state.stats.total_comments_pending++;
    }

    this.saveState();
  }

  // --- CONVERSATIONS ---
  getConversationKey(platform, convId) {
    return `${platform || "threads"}:${convId}`;
  }

  getConversation(convId, platform = "threads") {
    const key = this.getConversationKey(platform, convId);
    return this.state.conversations[key] || this.state.conversations[convId] || null;
  }

  /**
   * Retrieves recent outgoing messages sent by CodeAir for a given conversation.
   * Used by Duplicate Guard and Relevance Gate to prevent repeating responses.
   *
   * @param {string} convId
   * @param {number} [limit=5]
   * @param {string} [platform="threads"]
   * @returns {string[]}
   */
  getRecentOutgoingMessages(convId, limit = 5, platform = "threads") {
    const key = this.getConversationKey(platform, convId);
    const conv = this.state.conversations[key] || this.state.conversations[convId];
    const outgoing = [];
    if (!conv) return outgoing;

    if (conv.lastResponse && typeof conv.lastResponse === "string" && !outgoing.includes(conv.lastResponse)) {
      outgoing.push(conv.lastResponse);
    }
    if (conv.lastOutgoingMessage && typeof conv.lastOutgoingMessage === "string" && !outgoing.includes(conv.lastOutgoingMessage)) {
      outgoing.push(conv.lastOutgoingMessage);
    }

    if (Array.isArray(conv.previousMessages)) {
      for (let i = conv.previousMessages.length - 1; i >= 0; i--) {
        const msg = conv.previousMessages[i];
        if (msg && (msg.isOutgoing || msg.sender === "SELF" || msg.sender === "CodeAir" || msg.sender === "US")) {
          if (msg.text && !outgoing.includes(msg.text)) {
            outgoing.push(msg.text);
          }
        }
      }
    }

    // Also check recorded DMs for this user
    const username = conv.user || conv.username;
    if (username && this.state.dms) {
      for (const dm of Object.values(this.state.dms)) {
        if (dm && (dm.username === username || (dm.key && dm.key.includes(username))) && dm.responseText) {
          if (!outgoing.includes(dm.responseText)) {
            outgoing.push(dm.responseText);
          }
        }
      }
    }

    return outgoing.slice(0, limit);
  }

  /**
   * Cleans up and deduplicates historical messages in a corrupted or loop-affected conversation.
   */
  sanitizeConversation(convId, platform = "threads") {
    const key = this.getConversationKey(platform, convId);
    const conv = this.state.conversations[key] || this.state.conversations[convId];
    if (!conv || !Array.isArray(conv.previousMessages)) return;

    const seen = new Set();
    const sanitizedMessages = [];

    for (const msg of conv.previousMessages) {
      const hash = `${msg.sender}:${String(msg.text || "").trim().toLowerCase()}`;
      if (!seen.has(hash)) {
        seen.add(hash);
        sanitizedMessages.push(msg);
      }
    }

    conv.previousMessages = sanitizedMessages;
    this.saveState();
  }

  saveConversation(convData) {
    const platform = convData.platform || "threads";
    const convId = convData.conversationId || convData.id;
    const key = this.getConversationKey(platform, convId);
    const now = new Date().toISOString();

    const existing = this.state.conversations[key] || this.state.conversations[convId] || {};

    const updated = {
      platform,
      conversationId: convId,
      participant: convData.participant || convData.user || convData.username || existing.participant || "unknown",
      user: convData.user || convData.username || existing.user || "unknown",
      postId: convData.postId || existing.postId || null,
      username: convData.username || existing.username || "unknown",
      displayName: convData.displayName || existing.displayName || "",
      originalPost: convData.originalPost || existing.originalPost || "",
      messageId: convData.messageId || existing.messageId || null,
      incomingText: convData.incomingText || convData.lastIncomingMessage || existing.incomingText || "",
      identifiedIntent: convData.identifiedIntent || convData.detectedIntent || existing.identifiedIntent || "GENERAL",
      detectedIntent: convData.detectedIntent || convData.identifiedIntent || existing.detectedIntent || "GENERAL",
      commercialContext: convData.commercialContext || existing.commercialContext || "COMMERCIAL_DISCOVERY",
      identifiedRequirement: convData.identifiedRequirement || existing.identifiedRequirement || "",
      matchedService: convData.matchedService || existing.matchedService || "",
      leadScore: convData.leadScore !== undefined ? convData.leadScore : (existing.leadScore || 0),
      identityUsed: convData.identityUsed || existing.identityUsed || "NEUTRAL",
      companyIntroduced: Boolean(convData.companyIntroduced || existing.companyIntroduced),
      founderIntroduced: Boolean(convData.founderIntroduced || existing.founderIntroduced),
      previousMessages: Array.isArray(convData.previousMessages)
        ? convData.previousMessages
        : (existing.previousMessages || []),
      lastResponse: convData.lastResponse || convData.lastOutgoingMessage || existing.lastResponse || "",
      lastOutgoingMessage: convData.lastOutgoingMessage || convData.lastResponse || existing.lastOutgoingMessage || "",
      lastIncomingMessage: convData.lastIncomingMessage || convData.incomingText || existing.lastIncomingMessage || "",
      pendingQuestion: convData.pendingQuestion !== undefined ? convData.pendingQuestion : (existing.pendingQuestion || null),
      nextExpectedResponse: convData.nextExpectedResponse || existing.nextExpectedResponse || null,
      conversationStage: convData.conversationStage || existing.conversationStage || "INITIAL",
      lastAction: convData.lastAction || existing.lastAction || "INIT",
      timestamp: now,
      followUpState: convData.followUpState || existing.followUpState || "ACTIVE",
      approvalState: convData.approvalState || existing.approvalState || "PENDING",
      actionHistory: Array.isArray(convData.actionHistory)
        ? convData.actionHistory
        : (existing.actionHistory || [])
    };

    if (convData.newAction) {
      updated.actionHistory.push({
        action: convData.newAction,
        timestamp: now,
        details: convData.newActionDetails || {}
      });
    }

    this.state.conversations[key] = updated;
    this.saveState();
    return updated;
  }

  // --- REPLIES ---
  hasHandledReply(replyId, platform = "threads") {
    const key = `${platform}:${replyId}`;
    return Boolean(this.state.replies[key] || this.state.replies[replyId]);
  }

  recordHandledReply(replyId, data, platform = "threads") {
    const key = `${platform}:${replyId}`;
    this.state.replies[key] = {
      key,
      platform,
      replyId,
      username: data.username,
      incomingText: data.incomingText,
      responseText: data.responseText,
      handledAt: new Date().toISOString(),
      status: data.status || "REPLIED"
    };
    this.state.stats.total_replies_handled++;
    this.recordAction("REPLY_POSTED", replyId, { platform, username: data.username });
    this.saveState();
  }

  // --- DIRECT MESSAGES (DMs) ---
  hasHandledDm(dmId, platform = "threads") {
    const key = `${platform}:${dmId}`;
    return Boolean(this.state.dms[key] || this.state.dms[dmId]);
  }

  recordHandledDm(dmId, data, platform = "threads") {
    const key = `${platform}:${dmId}`;
    this.state.dms[key] = {
      key,
      platform,
      dmId,
      username: data.username,
      messageText: data.messageText,
      responseText: data.responseText,
      handledAt: new Date().toISOString(),
      status: data.status || "REPLIED"
    };
    this.state.stats.total_dms_handled++;
    this.recordAction("DM_REPLIED", dmId, { platform, username: data.username });
    this.saveState();
  }

  // --- OWN SCHEDULED POSTS ---
  recordOurPost(postData) {
    if (!this.state.ourPosts) {
      this.state.ourPosts = {};
    }
    const id = postData.id || `our_post_${Date.now()}`;
    this.state.ourPosts[id] = {
      id,
      ...postData,
      recordedAt: new Date().toISOString()
    };
    this.saveState();
    return this.state.ourPosts[id];
  }

  recordOurPostAttemptFailure(data) {
    if (!this.state.postFailures) {
      this.state.postFailures = [];
    }
    this.state.postFailures.push({
      ...data,
      timestamp: Date.now(),
      iso: new Date().toISOString()
    });
    if (this.state.postFailures.length > 20) {
      this.state.postFailures = this.state.postFailures.slice(-20);
    }
    this.saveState();
  }

  getLastPostAttemptFailure() {
    const list = this.state.postFailures || [];
    return list[list.length - 1] || null;
  }

  // --- STATE TRANSITION TRACKING ---
  recordActionTransition(actionType, targetId, fromState, toState, metadata = {}, platform = "threads") {
    const transitionId = `${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
    if (!this.state.actionTransitions) {
      this.state.actionTransitions = [];
    }
    const record = {
      id: transitionId,
      actionType,
      platform,
      targetId,
      fromState,
      toState,
      timestamp: Date.now(),
      iso: new Date().toISOString(),
      ...metadata
    };
    this.state.actionTransitions.push(record);
    if (this.state.actionTransitions.length > 200) {
      this.state.actionTransitions = this.state.actionTransitions.slice(-200);
    }
    logger.info(`[STATE_TRANSITION] [${actionType}] ${fromState} → ${toState} (${targetId})`, {
      action: "STATE_TRANSITION",
      actionType,
      fromState,
      toState,
      targetId
    });
    this.saveState();
    return record;
  }

  // --- ACTION AUDIT & LOGGING ---
  recordAction(type, targetId, details = {}) {
    const actionId = `${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
    this.state.actions[actionId] = {
      id: actionId,
      type,
      targetId,
      timestamp: Date.now(),
      iso: new Date().toISOString(),
      ...details
    };
    this.saveState();
    return actionId;
  }

  getActionsInWindow(typeFilter = null, windowMs = 3600 * 1000) {
    const cutoff = Date.now() - windowMs;
    const actions = Object.values(this.state.actions).filter(a => a.timestamp >= cutoff);
    if (!typeFilter) return actions;
    return actions.filter(a => a.type === typeFilter);
  }

  getRecentQuotePosts(windowHours = 24) {
    const cutoff = Date.now() - (windowHours * 3600 * 1000);
    return Object.values(this.state.actions).filter(a => a.type === "QUOTE_POST" && a.timestamp >= cutoff);
  }

  getPendingApprovals() {
    const pending = [];
    for (const post of Object.values(this.state.posts)) {
      if (post.status === "COMMENT_PENDING" && !this.hasCommented(post.postId, post.platform)) {
        pending.push(post);
      }
    }
    return pending.sort((a, b) => new Date(b.discoveredAt || 0) - new Date(a.discoveredAt || 0));
  }
}

const stateStore = new StateStore();
module.exports = stateStore;
