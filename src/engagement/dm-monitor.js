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
    // 1. Generate unique turn ID keyed by sender and message content for true multi-turn tracking
    const dmTurnId = threadsDms.hashMessage(dmItem.sender, dmItem.lastMessage);

    // Skip if this exact message turn was already handled
    if (stateStore.hasHandledDm(dmTurnId, platform)) {
      return { success: false, reason: "Already handled this message turn" };
    }

    // Check duplicate guard
    const dupCheck = duplicateGuard.canExecute({
      platform,
      actionType: "DM",
      targetId: dmTurnId,
      text: dmItem.lastMessage
    });

    if (!dupCheck.allowed) {
      return { success: false, reason: dupCheck.reason };
    }

    // 2. Load existing conversation state
    const convId = `${platform}:${dmItem.sender}`;
    const existingConv = stateStore.getConversation(convId, platform) || {};

    // 3. Generate response via AI decision engine
    const decision = await aiDecisionEngine.generateConversationReply({
      platform,
      username: dmItem.sender,
      originalPost: existingConv.originalPost || "",
      ourPreviousMessage: existingConv.lastResponse || "",
      incomingMessage: dmItem.lastMessage,
      conversationStage: existingConv.conversationStage || "DISCOVERY",
      companyMentionedBefore: existingConv.companyIntroduced,
      founderMentionedBefore: existingConv.founderIntroduced
    });

    // 4. Save persistent conversation state
    const updatedConv = stateStore.saveConversation({
      platform,
      conversationId: convId,
      user: dmItem.sender,
      username: dmItem.sender,
      identifiedIntent: decision.intent,
      identityUsed: decision.identity,
      companyIntroduced: decision.identity === "COMPANY" || decision.identity === "BOTH" || existingConv.companyIntroduced,
      founderIntroduced: decision.identity === "FOUNDER" || decision.identity === "BOTH" || existingConv.founderIntroduced,
      lastResponse: decision.response_message,
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

    // 5. Apply Execution / Dry Run / Approval
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
        text: dmItem.lastMessage
      });

      return {
        success: true,
        dryRun: true,
        response: decision.response_message,
        identity: decision.identity
      };
    }

    // 6. Live Execution in Browser
    if (platform === "threads") {
      logger.info(`[DM MONITOR] Executing live Threads DM send to @${dmItem.sender}...`);
      const sendRes = await threadsDms.sendDirectMessage(dmItem.threadId || dmItem.sender, decision.response_message);
      if (sendRes && sendRes.verified) {
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
          text: dmItem.lastMessage
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
   * Scans and processes DMs across both Threads and Instagram.
   */
  async scanAndProcessAll(options = {}) {
    const results = { threads: [], instagram: [] };

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
