/**
 * src/engagement/reply-monitor.js
 * Monitors and processes replies to CodeAir's public comments.
 * Tracks conversation progression, advances stages, and respects approval mode.
 */

const CONFIG = require("../../config");
const stateStore = require("../storage/state-store");
const aiDecisionEngine = require("../ai/ai-decision-engine");
const duplicateGuard = require("../safety/duplicate-guard");
const rateLimiter = require("../safety/rate-limiter");
const logger = require("../logging/logger");

class ReplyMonitor {
  /**
   * Processes an incoming reply.
   *
   * @param {Object} replyData - { platform, replyId, postId, username, incomingText, ourPreviousComment }
   * @param {Object} [options]
   */
  async processReply(replyData, options = {}) {
    const platform = replyData.platform || "threads";
    const replyId = replyData.replyId;

    logger.info(`Evaluating incoming reply from @${replyData.username} on ${platform}`, {
      action: "REPLY_EVALUATE",
      replyId,
      username: replyData.username
    });

    // 1. Duplicate check
    const dupCheck = duplicateGuard.canExecute({
      platform,
      actionType: "REPLY",
      targetId: replyId
    });

    if (!dupCheck.allowed) {
      logger.warn(`Skipping reply: ${dupCheck.reason}`);
      return { success: false, reason: dupCheck.reason };
    }

    // 2. Load existing conversation state if any
    const convId = `${platform}:${replyData.postId || replyData.username}`;
    const existingConv = stateStore.getConversation(convId, platform) || {};
    const recentOutgoing = stateStore.getRecentOutgoingMessages(convId, 5, platform);

    // 3. Generate contextual AI response
    const decision = await aiDecisionEngine.generateConversationReply({
      platform,
      convId,
      username: replyData.username,
      originalPost: existingConv.originalPost || "",
      ourPreviousMessage: replyData.ourPreviousComment || existingConv.lastResponse || "",
      incomingMessage: replyData.incomingText,
      conversationStage: existingConv.conversationStage || "DISCOVERY",
      companyMentionedBefore: existingConv.companyIntroduced,
      founderMentionedBefore: existingConv.founderIntroduced,
      recentOutgoing
    });

    // 3.1 Check conversation duplicate guard
    const msgDupCheck = duplicateGuard.canSendChatMessage(convId, decision.response_message, platform);
    if (!msgDupCheck.allowed) {
      logger.warn(`[REPLY MONITOR] Duplicate guard blocked reply to @${replyData.username}: ${msgDupCheck.reason}`);
      return { success: false, reason: msgDupCheck.reason };
    }

    // 3.2 Check relevance gate
    const relevanceCheck = aiDecisionEngine.evaluateRelevanceGate(decision.response_message, { convId, recentOutgoing }, replyData.incomingText);
    if (!relevanceCheck.approved) {
      logger.warn(`[REPLY MONITOR] Relevance gate blocked reply to @${replyData.username}: ${relevanceCheck.reason}`);
      return { success: false, reason: relevanceCheck.reason };
    }

    // 4. Update Conversation State
    const updatedConv = stateStore.saveConversation({
      platform,
      conversationId: convId,
      user: replyData.username,
      username: replyData.username,
      postId: replyData.postId,
      originalPost: existingConv.originalPost,
      identifiedIntent: decision.intent,
      identityUsed: decision.identity,
      companyIntroduced: decision.identity === "COMPANY" || decision.identity === "BOTH" || existingConv.companyIntroduced,
      founderIntroduced: decision.identity === "FOUNDER" || decision.identity === "BOTH" || existingConv.founderIntroduced,
      lastResponse: decision.response_message,
      conversationStage: decision.conversation_stage,
      lastAction: "REPLY_GENERATED",
      previousMessages: [
        ...(existingConv.previousMessages || []),
        { sender: replyData.username, text: replyData.incomingText, timestamp: new Date().toISOString() },
        { sender: "CodeAir", text: decision.response_message, timestamp: new Date().toISOString() }
      ],
      newAction: "REPLY_PROCESSED",
      newActionDetails: { replyId, identity: decision.identity }
    });

    // 5. Apply Approval Mode / Dry Run
    const isDryRun = options.dryRun !== undefined ? options.dryRun : CONFIG.DRY_RUN;
    const isApprovalMode = options.approvalMode !== undefined ? options.approvalMode : CONFIG.APPROVAL_MODE;

    if (isDryRun || isApprovalMode) {
      logger.audit("REPLY_SIMULATED", `${platform}:${replyId}`, {
        platform,
        username: replyData.username,
        identity: decision.identity,
        response: decision.response_message,
        stage: decision.conversation_stage
      });

      stateStore.recordHandledReply(replyId, {
        username: replyData.username,
        incomingText: replyData.incomingText,
        responseText: decision.response_message,
        status: isApprovalMode ? "PENDING_APPROVAL" : "SIMULATED"
      }, platform);

      return {
        success: true,
        dryRun: true,
        approvalRequired: isApprovalMode,
        response: decision.response_message,
        identity: decision.identity
      };
    }

    return {
      success: true,
      response: decision.response_message,
      identity: decision.identity
    };
  }
}

const replyMonitor = new ReplyMonitor();
module.exports = replyMonitor;
