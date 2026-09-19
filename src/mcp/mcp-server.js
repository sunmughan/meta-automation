/**
 * src/mcp/mcp-server.js
 * Model Context Protocol (MCP) Tool Layer for CodeAir Threads + Instagram Agent.
 * Decouples high-level AI reasoning from low-level browser & persistence tools.
 */

const knowledge = require("../knowledge/knowledge-engine");
const intentClassifier = require("../leads/intent-classifier");
const serviceMatcher = require("../leads/service-matcher");
const identityResolver = require("../conversations/identity-resolver");
const commentGenerator = require("../engagement/comment-generator");
const aiDecisionEngine = require("../ai/ai-decision-engine");
const stateStore = require("../storage/state-store");
const duplicateGuard = require("../safety/duplicate-guard");
const rateLimiter = require("../safety/rate-limiter");
const { scanThreadsFeed } = require("../platforms/threads/threads-scanner");
const { scanInstagramFeed } = require("../platforms/instagram/instagram-feed");
const threadsActions = require("../platforms/threads/threads-actions");
const instagramActions = require("../platforms/instagram/instagram-actions");
const threadsDms = require("../platforms/threads/threads-dms");
const instagramDms = require("../platforms/instagram/instagram-dms");
const logger = require("../logging/logger");

const TOOLS = {
  // 1. scan_feed
  async scan_feed(args = {}) {
    const platform = (args.platform || "threads").toLowerCase();
    const maxPosts = args.maxPosts || 25;
    if (platform === "instagram") {
      return await scanInstagramFeed({ maxPosts });
    }
    return await scanThreadsFeed({ maxPosts });
  },

  // 2. classify_lead
  async classify_lead(args = {}) {
    const { text = "", username = "unknown" } = args;
    return intentClassifier.classify({ text, username });
  },

  // 3. get_knowledge
  async get_knowledge(args = {}) {
    const { filename = "services.md" } = args;
    return {
      filename,
      content: knowledge.getRaw(filename)
    };
  },

  // 4. get_conversation
  async get_conversation(args = {}) {
    const { platform = "threads", conversationId } = args;
    return stateStore.getConversation(conversationId, platform);
  },

  // 5. save_conversation
  async save_conversation(args = {}) {
    return stateStore.saveConversation(args);
  },

  // 6. generate_response
  async generate_response(args = {}) {
    return await aiDecisionEngine.qualifyPost(args.post || args);
  },

  // 7. post_comment
  async post_comment(args = {}) {
    const { platform = "threads", post, commentText } = args;
    if (platform === "instagram") {
      return await instagramActions.postComment(post, commentText);
    }
    return await threadsActions.postComment(post, commentText);
  },

  // 8. inspect_dm
  async inspect_dm(args = {}) {
    const platform = (args.platform || "threads").toLowerCase();
    if (platform === "instagram") {
      return await instagramDms.scanDms();
    }
    return await threadsDms.scanDms();
  },

  // 9. get_profile
  async get_profile(args = {}) {
    const { target = "COMPANY", platform = "website" } = args;
    const url = knowledge.getProfileLink(target, platform);
    return { target, platform, url };
  },

  // 10. check_duplicate
  async check_duplicate(args = {}) {
    return duplicateGuard.canExecute(args);
  },

  // 11. log_action
  async log_action(args = {}) {
    const { action, target, details = {} } = args;
    logger.audit(action, target, details);
    return { success: true };
  }
};

class McpServer {
  getAvailableTools() {
    return Object.keys(TOOLS).map(name => ({
      name,
      description: `CodeAir automation tool: ${name}`
    }));
  }

  async executeTool(toolName, args = {}) {
    if (!TOOLS[toolName]) {
      throw new Error(`Unknown MCP tool: ${toolName}`);
    }
    return await TOOLS[toolName](args);
  }
}

const mcpServer = new McpServer();
module.exports = {
  mcpServer,
  TOOLS
};
