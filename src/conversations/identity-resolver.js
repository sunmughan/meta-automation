/**
 * src/conversations/identity-resolver.js
 * Dedicated Identity Decision Layer for CodeAir Threads + Instagram System.
 * Authoritatively determines WHO SHOULD SPEAK:
 * - NEUTRAL
 * - COMPANY
 * - FOUNDER
 * - BOTH
 *
 * Grounded strictly in founder.md, company.md, and lead-rules.md.
 */

const knowledge = require("../knowledge/knowledge-engine");

class IdentityResolver {
  /**
   * Resolves the appropriate communication identity based on incoming context.
   *
   * @param {Object} context
   * @param {string} context.message - Current incoming post or user message
   * @param {string} [context.originalPost] - Root thread or post text
   * @param {string} [context.conversationStage] - Current stage (INITIAL, DISCOVERY, etc.)
   * @param {boolean} [context.companyMentionedBefore] - True if company was already introduced
   * @param {boolean} [context.founderMentionedBefore] - True if founder was already introduced
   * @param {string} [context.intent] - Identified intent (BUYER, FOUNDER_QUERY, etc.)
   * @returns {{ identity: "NEUTRAL"|"COMPANY"|"FOUNDER"|"BOTH", reason: string }}
   */
  resolveIdentity(context = {}) {
    const text = String(context.message || "").toLowerCase();
    const orig = String(context.originalPost || "").toLowerCase();
    const combined = `${orig} ${text}`;

    const company = knowledge.getCompanyInfo();
    const founder = knowledge.getFounderInfo();
    const companyClean = (company.name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const companyWords = (company.name || "").trim().split(/\s+/).map(w => w.replace(/[^a-z0-9]/gi, "")).filter(Boolean);
    const companyPattern = Array.from(new Set([companyClean, companyWords.join("\\s+"), companyWords[0], (company.shortName || "").toLowerCase()])).filter(Boolean).join("|") || "company";

    const founderClean = (founder.name || "founder").toLowerCase().replace(/[^a-z0-9]/g, "");
    const founderWords = (founder.name || "founder").trim().split(/\s+/).map(w => w.replace(/[^a-z0-9]/gi, "")).filter(Boolean);
    const founderPattern = Array.from(new Set([founderClean, founderWords.join("\\s+"), founderWords[0]])).filter(Boolean).join("|");

    const isAskingWhoBehind =
      new RegExp(`\\bwho\\s+(is\\s+)?(behind|founded|started|runs|owns|built)\\s+(${companyPattern}|this|it)\\b`, "i").test(text) ||
      /\bwho\s+are\s+you\b/i.test(text) ||
      /\bwho\s+is\s+the\s+founder\b/i.test(text);

    const isAskingForFounderDirectly =
      /\b(speak|talk|connect|chat|discuss)\s+(directly\s+)?with\s+(the\s+)?founder\b/i.test(text) ||
      new RegExp(`\\bwho\\s+(is\\s+)?(${founderPattern})\\b`, "i").test(text) ||
      /\bare\s+you\s+the\s+founder\b/i.test(text) ||
      new RegExp(`\\bwho\\s+founded\\s+(${companyPattern})\\b`, "i").test(text) ||
      /\btechnical\s+lead\b/i.test(text) && /\b(speak|talk|meet)\b/i.test(text);

    const isAskingWhatCompanyDoes =
      new RegExp(`\\bwhat\\s+(does\\s+)?(${companyPattern})\\s+do\\b`, "i").test(text) ||
      /\bwhat\s+do\s+you\s+(guys\s+)?do\b/i.test(text) ||
      /\bwhat\s+services\s+do\s+you\s+offer\b/i.test(text) ||
      new RegExp(`\\btell\\s+me\\s+about\\s+(${companyPattern})\\b`, "i").test(text);

    const isAskingBoth =
      (isAskingWhoBehind || isAskingForFounderDirectly) &&
      (isAskingWhatCompanyDoes || /\bwho\s+are\s+you\s+guys\s+and\s+who\s+founded\b/i.test(text));

    // Rule 1: BOTH explicitly asked
    if (isAskingBoth) {
      return {
        identity: "BOTH",
        reason: "User explicitly requested both company background and founder identity."
      };
    }

    // Rule 2: Explicit founder query or direct founder communication request
    if (isAskingWhoBehind || isAskingForFounderDirectly) {
      return {
        identity: "FOUNDER",
        reason: "User explicitly inquired about the founder or requested direct founder communication."
      };
    }

    // Rule 3: Explicit company query or direct service inquiries
    if (isAskingWhatCompanyDoes) {
      return {
        identity: "COMPANY",
        reason: `User explicitly asked about ${company.name} or its service capabilities.`
      };
    }

    // Rule 4: Founder profile requested (e.g. personal LinkedIn, GitHub)
    if (/\b(your\s+linkedin|founder('s)?\s+linkedin|your\s+github|your\s+portfolio)\b/i.test(text)) {
      return {
        identity: "FOUNDER",
        reason: "User requested personal founder profile or technical repository."
      };
    }

    // Rule 5: Company profile requested
    const isCompanyProfileReq =
      new RegExp(`\\b((codeair|${companyClean})('s)?\\s+linkedin|company\\s+linkedin|(codeair|${companyClean})\\s+website|company\\s+website)\\b`, "i").test(text);
    if (isCompanyProfileReq) {
      return {
        identity: "COMPANY",
        reason: `User requested official ${company.name} company profile.`
      };
    }

    // Rule 6: General technical discussion (e.g. "What's the best architecture for a multi-tenant SaaS?")
    const isGeneralTech =
      /\b(best\s+architecture|how\s+to\s+architect|what\s+do\s+you\s+think\s+of|pros\s+and\s+cons|recommend\s+a\s+stack)\b/i.test(text) &&
      !/\b(hire|build\s+for\s+us|build\s+our|need\s+someone\s+to|looking\s+for\s+a\s+developer)\b/i.test(text);

    if (isGeneralTech) {
      return {
        identity: "NEUTRAL",
        reason: "General technical discussion. No company or founder promotion required."
      };
    }

    // Rule 7: Direct buyer project requirement
    const isBuyerIntent =
      /\b(need\s+someone\s+to\s+build|looking\s+for\s+a\s+developer\s+to\s+build|we\s+need\s+an\s+app|automate\s+customer\s+support|build\s+a\s+website|build\s+our\s+crm|build\s+our\s+saas)\b/i.test(combined);

    if (isBuyerIntent) {
      // If company was already introduced or project scope is established, speak as COMPANY
      // If initial discovery on a public post, can be COMPANY or NEUTRAL discovery question
      return {
        identity: "COMPANY",
        reason: `Direct software/IT buyer requirement matching ${company.name} service scope.`
      };
    }

    // Default to NEUTRAL for safety
    return {
      identity: "NEUTRAL",
      reason: "Default neutral identity to avoid forced promotional language."
    };
  }
}

const identityResolver = new IdentityResolver();
module.exports = identityResolver;
