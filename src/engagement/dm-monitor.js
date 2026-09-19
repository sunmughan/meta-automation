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
    const dmId = dmItem.threadId || `${platform}_${dmItem.sender}_${Date.now()}`;

    // 1. Check duplicate
    const dupCheck = duplicateGuard.canExecute({
      platform,
      actionType: "DM",
      targetId: dmId,
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
      newActionDetails: { dmId, identity: decision.identity, humanReview: decision.human_review_required }
    });

    // 5. Apply Approval Mode / Dry Run
    const isDryRun = options.dryRun !== undefined ? options.dryRun : CONFIG.DRY_RUN;
    const isApprovalMode = options.approvalMode !== undefined ? options.approvalMode : CONFIG.APPROVAL_MODE;

    logger.audit("DM_RESPONSE_SIMULATED", `${platform}:${dmId}`, {
      platform,
      sender: dmItem.sender,
      identity: decision.identity,
      response: decision.response_message,
      humanReview: decision.human_review_required
    });

    stateStore.recordHandledDm(dmId, {
      username: dmItem.sender,
      messageText: dmItem.lastMessage,
      responseText: decision.response_message,
      status: isApprovalMode ? "PENDING_APPROVAL" : "SIMULATED"
    }, platform);

    return {
      success: true,
      dryRun: true,
      approvalRequired: isApprovalMode,
      humanReview: decision.human_review_required,
      response: decision.response_message,
      identity: decision.identity
    };
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

    // Instagram DMs
    try {
      const igItems = await instagramDms.scanDms();
      for (const item of igItems) {
        const res = await this.processDmItem(item, "instagram", options);
        results.instagram.push({ item, res });
      }
    } catch (err) {
      logger.warn("Instagram DM scan skipped or failed", { error: err.message });
    }

    return results;
  }
}

const dmMonitor = new DmMonitor();
module.exports = dmMonitor;
