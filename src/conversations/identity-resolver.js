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

    const isAskingWhoBehind =
      /\bwho\s+(is\s+)?(behind|founded|started|runs|owns|built)\s+(codeair|this|it)\b/i.test(text) ||
      /\bwho\s+are\s+you\b/i.test(text) ||
      /\bwho\s+is\s+the\s+founder\b/i.test(text);

    const isAskingForFounderDirectly =
      /\b(speak|talk|connect|chat|discuss)\s+(directly\s+)?with\s+(the\s+)?founder\b/i.test(text) ||
      /\bare\s+you\s+the\s+founder\b/i.test(text) ||
      /\bwho\s+founded\s+codeair\b/i.test(text) ||
      /\btechnical\s+lead\b/i.test(text) && /\b(speak|talk|meet)\b/i.test(text);

    const isAskingWhatCompanyDoes =
      /\bwhat\s+(does\s+)?codeair\s+do\b/i.test(text) ||
      /\bwhat\s+do\s+you\s+(guys\s+)?do\b/i.test(text) ||
      /\bwhat\s+services\s+do\s+you\s+offer\b/i.test(text) ||
      /\btell\s+me\s+about\s+codeair\b/i.test(text);

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
        reason: "User explicitly asked about CodeAir or its service capabilities."
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
    if (/\b(codeair('s)?\s+linkedin|company\s+linkedin|codeair\s+website|company\s+website)\b/i.test(text)) {
      return {
        identity: "COMPANY",
        reason: "User requested official CodeAir company profile."
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
        reason: "Direct software/IT buyer requirement matching CodeAir service scope."
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
