/**
 * src/engagement/dm-monitor.js
 * Cross-platform Direct Message (DM) monitor for Threads and Instagram.
 * Maintains persistent conversation state, enforces safety checks, and escalates
 * sensitive queries to human review.
 */

const CONFIG = require("../../config");
const stateStore = require("../storage/state-store");
const aiDecisionEngine = require("../ai/ai-decision-engine");
const duplicateGuard = require("../safety/duplicate-guard");
const threadsDms = require("../platforms/threads/threads-dms");
const instagramDms = require("../platforms/instagram/instagram-dms");
const logger = require("../logging/logger");

class DmMonitor {
  /**
   * Processes a single DM conversation item.
   */
  async processDmItem(dmItem, platform = "threads", options = {}) {
    const convId = `${platform}:${dmItem.sender}`;
    const recentOutgoing = stateStore.getRecentOutgoingMessages(convId, 5, platform);
    const cleanIncoming = String(dmItem.lastMessage || "").trim().toLowerCase();

    // 0. Skip if the scanner detected an outgoing message from us or matches any recent outgoing response
    const isOutgoingPattern = /^(you\b|you sent|you shared|you replied|seen\b|sent a post|sent a photo|sent an attachment)/i.test(dmItem.lastMessage || "");
    const matchesOurRecent = recentOutgoing.some(prev => {
      const cleanPrev = String(prev).trim().toLowerCase();
      return cleanPrev === cleanIncoming || cleanPrev.startsWith(cleanIncoming) || cleanIncoming.startsWith(cleanPrev.slice(0, 30));
    });

    if (dmItem.isOutgoing || isOutgoingPattern || matchesOurRecent) {
      logger.info(`[DM MONITOR] Skipping @${dmItem.sender}: Last message was sent by us or matches recent outgoing response. Awaiting recipient reply.`);
      return { success: false, reason: "Awaiting recipient reply; last message was our response" };
    }

    // 1. Generate unique turn ID keyed by sender and message content for true multi-turn tracking
    const dmTurnId = threadsDms.hashMessage(dmItem.sender, dmItem.lastMessage);

    // Skip if this exact message turn was already handled
    if (stateStore.hasHandledDm(dmTurnId, platform)) {
      return { success: false, reason: "Already handled this message turn" };
    }

    // 2. Load existing conversation state
    const existingConv = stateStore.getConversation(convId, platform) || {};
    stateStore.recordActionTransition("DM", dmTurnId, "INIT", "CONTEXT_VERIFIED", {
      username: dmItem.sender,
      incomingMessage: dmItem.lastMessage.slice(0, 50)
    });

    // 3. Generate response via AI decision engine with full conversation context
    const decision = await aiDecisionEngine.generateConversationReply({
      platform,
      convId,
      username: dmItem.sender,
      originalPost: existingConv.originalPost || "",
      ourPreviousMessage: existingConv.lastResponse || "",
      incomingMessage: dmItem.lastMessage,
      conversationStage: existingConv.conversationStage || "DISCOVERY",
      companyMentionedBefore: existingConv.companyIntroduced,
      founderMentionedBefore: existingConv.founderIntroduced,
      recentOutgoing
    });

    stateStore.recordActionTransition("DM", dmTurnId, "CONTEXT_VERIFIED", "RESPONSE_GENERATED", {
      intent: decision.intent,
      identity: decision.identity
    });

    // 4. Enforce Duplicate Guard on proposed outgoing message
    const dupCheck = duplicateGuard.canSendChatMessage(convId, decision.response_message, platform);
    if (!dupCheck.allowed) {
      logger.warn(`[DM MONITOR] Duplicate guard blocked response to @${dmItem.sender}: ${dupCheck.reason}`);
      stateStore.recordActionTransition("DM", dmTurnId, "RESPONSE_GENERATED", "BLOCKED_DUPLICATE", {
        reason: dupCheck.reason
      });
      return { success: false, reason: dupCheck.reason };
    }

    // 5. Enforce Strict Relevance Gate on proposed response
    const relevanceCheck = aiDecisionEngine.evaluateRelevanceGate(
      decision.response_message,
      { convId, recentOutgoing },
      dmItem.lastMessage
    );
    if (!relevanceCheck.approved) {
      logger.warn(`[DM MONITOR] Relevance gate blocked response to @${dmItem.sender}: ${relevanceCheck.reason}`);
      stateStore.recordActionTransition("DM", dmTurnId, "RESPONSE_GENERATED", "BLOCKED_IRRELEVANT", {
        reason: relevanceCheck.reason
      });
      return { success: false, reason: relevanceCheck.reason };
    }

    stateStore.recordActionTransition("DM", dmTurnId, "RESPONSE_GENERATED", "RELEVANCE_VERIFIED");

    // 6. Save persistent conversation state
    const updatedConv = stateStore.saveConversation({
      platform,
      conversationId: convId,
      participant: dmItem.sender,
      user: dmItem.sender,
      username: dmItem.sender,
      incomingText: dmItem.lastMessage,
      lastIncomingMessage: dmItem.lastMessage,
      detectedIntent: decision.intent,
      identifiedIntent: decision.intent,
      identityUsed: decision.identity,
      commercialContext: decision.intent === "LEAD_GENERATION_DECLINED" ? "NON_COMMERCIAL_DECLINED" : "COMMERCIAL_DISCOVERY",
      companyIntroduced: decision.identity === "COMPANY" || decision.identity === "BOTH" || existingConv.companyIntroduced,
      founderIntroduced: decision.identity === "FOUNDER" || decision.identity === "BOTH" || existingConv.founderIntroduced,
      lastResponse: decision.response_message,
      lastOutgoingMessage: decision.response_message,
      conversationStage: decision.conversation_stage,
      lastAction: "DM_REPLY_GENERATED",
      previousMessages: [
        ...(existingConv.previousMessages || []),
        { sender: dmItem.sender, text: dmItem.lastMessage, timestamp: new Date().toISOString() },
        { sender: "CodeAir", text: decision.response_message, timestamp: new Date().toISOString() }
      ],
      newAction: "DM_PROCESSED",
      newActionDetails: { dmTurnId, identity: decision.identity, humanReview: decision.human_review_required }
    });

    // 7. Apply Execution / Dry Run / Approval
    const isDryRun = options.dryRun !== undefined ? options.dryRun : CONFIG.DRY_RUN;
    const isApprovalMode = options.approvalMode !== undefined ? options.approvalMode : CONFIG.APPROVAL_MODE;
    const isPostingEnabled = CONFIG.POSTING_ENABLED;

    if (isApprovalMode) {
      logger.info(`[DM MONITOR] DM response for @${dmItem.sender} pending approval.`);
      stateStore.recordHandledDm(dmTurnId, {
        username: dmItem.sender,
        messageText: dmItem.lastMessage,
        responseText: decision.response_message,
        status: "PENDING_APPROVAL"
      }, platform);
      return {
        success: true,
        approvalRequired: true,
        response: decision.response_message,
        identity: decision.identity
      };
    }

    if (isDryRun || !isPostingEnabled) {
      logger.audit("DM_RESPONSE_SIMULATED", `${platform}:${dmTurnId}`, {
        platform,
        sender: dmItem.sender,
        identity: decision.identity,
        response: decision.response_message,
        humanReview: decision.human_review_required
      });

      stateStore.recordHandledDm(dmTurnId, {
        username: dmItem.sender,
        messageText: dmItem.lastMessage,
        responseText: decision.response_message,
        status: "SIMULATED"
      }, platform);

      duplicateGuard.recordExecuted({
        platform,
        actionType: "DM",
        targetId: dmTurnId,
        text: decision.response_message,
        username: dmItem.sender
      });

      return {
        success: true,
        dryRun: true,
        response: decision.response_message,
        identity: decision.identity
      };
    }

    // 8. Live Execution in Browser
    if (platform === "threads") {
      logger.info(`[DM MONITOR] Executing live Threads DM send to @${dmItem.sender}...`);
      stateStore.recordActionTransition("DM", dmTurnId, "RELEVANCE_VERIFIED", "SEND_ATTEMPTED");
      const sendRes = await threadsDms.sendDirectMessage(dmItem.threadId || dmItem.sender, decision.response_message);
      if (sendRes && sendRes.verified) {
        stateStore.recordActionTransition("DM", dmTurnId, "SEND_ATTEMPTED", "SEND_VERIFIED");
        stateStore.recordHandledDm(dmTurnId, {
          username: dmItem.sender,
          messageText: dmItem.lastMessage,
          responseText: decision.response_message,
          status: "SENT_VERIFIED"
        }, platform);

        duplicateGuard.recordExecuted({
          platform,
          actionType: "DM",
          targetId: dmTurnId,
          text: decision.response_message,
          username: dmItem.sender
        });

        logger.audit("DM_RESPONSE_SENT_VERIFIED", `${platform}:${dmTurnId}`, {
          platform,
          sender: dmItem.sender,
          response: decision.response_message
        });

        return {
          success: true,
          live: true,
          verified: true,
          response: decision.response_message,
          identity: decision.identity
        };
      } else if (sendRes && sendRes.restricted) {
        stateStore.recordHandledDm(dmTurnId, {
          username: dmItem.sender,
          messageText: dmItem.lastMessage,
          responseText: decision.response_message,
          status: "RESTRICTED_PENDING_ACCEPTANCE",
          restriction: sendRes.restriction
        }, platform);
        logger.warn(`[DM MONITOR] Live DM restricted for @${dmItem.sender}: ${sendRes.reason}`);
        return {
          success: false,
          restricted: true,
          reason: sendRes.reason
        };
      } else {
        logger.warn(`[DM MONITOR] Live DM send unverified for @${dmItem.sender}: ${sendRes ? sendRes.reason : "unknown"}`);
        return {
          success: false,
          verified: false,
          reason: sendRes ? sendRes.reason : "verification failed"
        };
      }
    }

    return { success: false, reason: `Platform ${platform} not supported for live DM execution` };
  }

  /**
   * Threads-only Direct Message scanner and processor.
   * Completely bypasses any Instagram runtime path for strict Threads automation.
   */
  async scanAndProcessThreadsOnly(options = {}) {
    const results = { threads: [] };
    if (options.offlineSimulation) {
      const mockItems = options.mockItems || [
        { sender: "test_user_sim", lastMessage: "Can you help build my MVP?", threadId: "test_thread_sim" }
      ];
      for (const item of mockItems) {
        const res = await this.processDmItem(item, "threads", { dryRun: true, ...options });
        results.threads.push({ item, res });
      }
      return results;
    }

    try {
      const threadsItems = await threadsDms.scanDms();
      for (const item of threadsItems) {
        const res = await this.processDmItem(item, "threads", options);
        results.threads.push({ item, res });
      }
    } catch (err) {
      logger.warn("Threads DM scan skipped or failed", { error: err.message });
    }
    return results;
  }

  /**
   * Scans and processes DMs across both Threads and Instagram.
   */
  async scanAndProcessAll(options = {}) {
    const results = { threads: [], instagram: [] };

    if (options.offlineSimulation) {
      const mockItems = options.mockItems || [
        { sender: "test_user_sim", lastMessage: "Can you help build my MVP?", threadId: "test_thread_sim" }
      ];
      for (const item of mockItems) {
        const res = await this.processDmItem(item, "threads", { dryRun: true, ...options });
        results.threads.push({ item, res });
      }
      return results;
    }

    // Threads DMs
    try {
      const threadsItems = await threadsDms.scanDms();
      for (const item of threadsItems) {
        const res = await this.processDmItem(item, "threads", options);
        results.threads.push({ item, res });
      }
    } catch (err) {
      logger.warn("Threads DM scan skipped or failed", { error: err.message });
    }

    // Instagram DMs (Only if platform target explicitly enables Instagram)
    const target = (CONFIG.PLATFORM_TARGET || "threads").toLowerCase();
    if (target === "instagram" || target === "all") {
      try {
        const igItems = await instagramDms.scanDms();
        for (const item of igItems) {
          const res = await this.processDmItem(item, "instagram", options);
          results.instagram.push({ item, res });
        }
      } catch (err) {
        logger.warn("Instagram DM scan skipped or failed", { error: err.message });
      }
    }

    return results;
  }
}

const dmMonitor = new DmMonitor();
module.exports = dmMonitor;
