/**
 * src/leads/intent-classifier.js
 * Fast deterministic intent classifier & lead qualification engine.
 *
 * Enforces lead-rules.md:
 * Genuine CodeAir lead requires:
 *   BUYING / PROJECT INTENT
 *   + CODEAIR SERVICE MATCH
 *   + NOT RECRUITMENT
 *   + NOT SERVICE PROVIDER
 *   + NOT JOB SEEKER
 *   + NOT IRRELEVANT
 */

const serviceMatcher = require("./service-matcher");

const RECRUITMENT_PATTERNS = [
  /\bwe'?re\s+hiring\b/i,
  /\bwe\s+are\s+hiring\b/i,
  /\bwere\s+hiring\b/i,
  /\bhiring\s+(now|for|a|an|developers?|engineers?)\b/i,
  /\bjob\s+(opening|vacancy|opportunity|vacancies)\b/i,
  /\bfull[- ]?time(\s+position|\s+role)?\b/i,
  /\bpart[- ]?time(\s+position|\s+role)?\b/i,
  /\b(base\s+)?salary\b/i,
  /\bcompensation\s+package\b/i,
  /\bapply\s+(here|now|via|at|to)\b/i,
  /\bdm\s+(me\s+)?your\s+(cv|resume)\b/i,
  /\bsend\s+(me\s+)?your\s+(cv|resume)\b/i,
  /\bsubmit\s+(your\s+)?(cv|resume)\b/i,
  /\b(cv|resume)\s+to\b/i,
  /\bjoin\s+(our|the)\s+team\b/i,
  /\btalent\s+acquisition\b/i,
  /\brecruiter\b/i,
  /\brecruitment\b/i,
  /\blooking\s+for\s+(a\s+)?(senior|junior|lead|intern|full[- ]?time|part[- ]?time)\s+(developer|engineer|designer)\s+to\s+join\b/i
];

const JOB_SEEKER_PATTERNS = [
  /\bopen\s+to\s+work\b/i,
  /\bopen\s+for\s+work\b/i,
  /\blooking\s+for\s+(a\s+)?(job|work|remote\s+work|internship)\b/i,
  /\bseeking\s+(opportunities|employment|job|roles?)\b/i,
  /\bavailable\s+for\s+(work|hire|employment|remote\s+opportunities)\b/i,
  /\bfreelancer\s+available\b/i,
  /\bdeveloper\s+available\b/i,
  /\bdesigner\s+available\b/i,
  /\bactively\s+looking\s+for\s+(work|a\s+role|a\s+job)\b/i,
  /\bhire\s+me\b/i,
  /\bseeking\s+(software|web|flutter|react)\s+developer\s+opportunities\b/i
];

const PROVIDER_PATTERNS = [
  /\bi'?m\s+a\s+(freelance\s+)?(web|software|graphic|ui|ux|app|flutter|react)\s+developer\b/i,
  /\bi\s+am\s+a\s+(freelance\s+)?(web|software|graphic|ui|ux|app|flutter|react)\s+developer\b/i,
  /\bi'?m\s+a\s+designer\b/i,
  /\bfor\s+hire\b/i,
  /\btaking\s+new\s+(clients|bookings|projects)\b/i,
  /\baccepting\s+new\s+clients\b/i,
  /\bopen\s+for\s+(clients|projects)\b/i,
  /\blooking\s+for\s+clients\b/i,
  /\bfor\s+my\s+(development\s+)?agency\b/i,
  /\bmy\s+services\b/i,
  /\bour\s+services\b/i,
  /\bour\s+agency\b/i,
  /\bmy\s+agency\b/i,
  /\bi\s+build\s+(websites|apps|software)\b/i,
  /\bwe\s+build\s+(websites|apps|software)\b/i,
  /\boffering\s+(web|app|software)\s+development\b/i,
  /\bbook\s+a\s+call\b/i,
  /\bdm\s+me\s+if\s+you\s+need\s+(one|a\s+website|an\s+app)\b/i
];

const NETWORKING_PATTERNS = [
  /\bexpand\s+my\s+network\b/i,
  /\bchat\s+and\s+connect\b/i,
  /\bhappy\s+(monday|friday|weekend)\b/i,
  /\bgood\s+morning\s+(threads|everyone|all)\b/i
];

const FOUNDER_BUILDER_PATTERNS = [
  /\b(saas|early[- ]?stage|startup|tech)\s+founders?\b/i,
  /\bhey\s+founders?\b/i,
  /\bto\s+all\s+founders?\b/i,
  /\bco[- ]?founders?\b/i,
  /\bwhat\s+(are\s+you|are\s+u)\s+building\b/i,
  /\bwhat\s+you('?re|\s+are)\s+working\s+on\b/i,
  /\bdrop\s+what\s+you('?re|\s+are)\s+working\s+on\b/i,
  /\bpitch\s+your\s+(product|startup|saas|project|app)\b/i,
  /\bshow\s+your\s+(product|startup|saas|project|app)\b/i,
  /\blooking\s+to\s+connect\s+with\s+(new\s+(&|and)\s+early[- ]?stage\s+)?founders?\b/i,
  /\bconnect\s+with\s+(other|fellow)?\s*(saas\s+)?founders?\b/i,
  /\bpassionate\s+engineers?\b/i,
  /\bbuilders?\s+who\s+are\s+building\b/i,
  /\bif\s+you('?re|\s+are)\s+building\s+too\b/i,
  /\bfiguring\s+out\s+distribution\b/i,
  /\btech\s+stack\s+are\s+you\b/i,
  /\bsaas\s+builders?\b/i
];

const BUYING_INTENT_PATTERNS = [
  /\bi\s+need(\s+someone|\s+somebody)?\s+(to\s+build|to\s+develop|to\s+create|to\s+make|to\s+design)?\b/i,
  /\bi'?m\s+looking\s+for(\s+someone|\s+somebody|\s+a\s+company|\s+a\s+developer|\s+a\s+designer|\s+a\s+team|\s+an\s+agency)?\s+(to\s+build|to\s+develop|to\s+design|for\s+our)?\b/i,
  /\bneed\s+someone\s+to\s+(build|design|develop|make)\b/i,
  /\bneed\s+a\s+(website|web\s+app|mobile\s+app|developer|designer|platform|system|dashboard|crm|erp|landing\s+page|mvp)\b/i,
  /\blooking\s+for\s+someone\s+to\s+(build|design|develop|make)\b/i,
  /\blooking\s+for\s+a\s+(developer|designer|team|agency|freelancer)\s+(to\s+build|to\s+design|to\s+develop|to\s+help)?\b/i,
  /\b(looking\s+for|need|seeking)\s+(a\s+|an?\s+)?(web\s+designer|website\s+designer|web\s+developer|website\s+developer|frontend\s+developer|backend\s+developer|full[- ]?stack\s+developer|ai\s+developer|ai\s+engineer|flutter\s+developer|freelance\s+developer|app\s+developer)\b/i,
  /\b(looking\s+for|need|seeking)\s+(someone\s+for\s+)?website\s+(design|development|building|redesign)\b/i,
  /\b(looking\s+for|need|seeking)\s+(an?\s+)?ai\s+(development|team|agency|engineer|developer|integration)\b/i,
  /\b(who|anyone)\s+(can|knows?\s+how\s+to|here\s+who\s+can)\s+(build|make|design|develop|create)\b/i,
  /\b(anyone(\s+here)?\s+knows?|recommend|looking\s+for\s+recommendations?\s+for)\s+(a\s+)?(good\s+)?(developer|designer|web\s+dev|agency)\b/i,
  /\bneed\s+(a\s+|our\s+|my\s+)?(site|website|app|web\s+app)\s+built\b/i,
  /\bhelp\s+me\s+(build|create|develop|design)\b/i,
  /\bneed\s+help\s+(building|creating|developing|designing)\b/i,
  /\bcan\s+someone\s+(build|create|develop|design)\b/i,
  /\bcan\s+somebody\s+(build|create|develop|design)\b/i,
  /\b(want|planning|trying)\s+to\s+(build|launch|create|make)\s+(a\s+|an?\s+)?(website|web\s+app|app|platform|saas|mvp|ai\s+bot|chatbot)\b/i,
  /\bwe\s+need\s+(an?\s+)?(app|website|crm|erp|dashboard|saas|ai\s+system|automation|landing\s+page)\b/i,
  /\bwe\s+want\s+to\s+automate\b/i,
  /\bneed\s+to\s+automate\b/i,
  /\bseeking\s+someone\s+to\s+(build|develop|implement|design)\b/i,
  /\bhire\s+(a\s+)?(web\s+developer|app\s+developer|flutter\s+developer|full[- ]?stack\s+developer|freelancer\s+to\s+build)\b/i
];

class IntentClassifier {
  /**
   * Classifies post intent and qualifies lead.
   *
   * @param {Object} post - { text, username, url }
   * @returns {Object} Lead decision object
   */
  classify(post) {
    const text = String(post?.text || "").trim();

    if (!text || text.length < 8) {
      return {
        qualified: false,
        score: 0,
        temperature: "IGNORE",
        is_genuine_buyer: false,
        lead_type: "INVALID",
        intent: "IRRELEVANT",
        reason: "Text too short or empty.",
        matchedServices: [],
        should_reply: false
      };
    }

    // Check founder or company queries first
    if (/\bwho\s+(is\s+)?(behind|founded|started|runs)\s+codeair\b/i.test(text)) {
      return {
        qualified: true,
        score: 90,
        temperature: "HOT",
        is_genuine_buyer: false,
        lead_type: "FOUNDER_QUERY",
        intent: "FOUNDER_QUERY",
        reason: "User inquiring about the founder of CodeAir.",
        matchedServices: [],
        should_reply: true
      };
    }

    if (/\bwhat\s+(does\s+)?codeair\s+do\b/i.test(text)) {
      return {
        qualified: true,
        score: 90,
        temperature: "HOT",
        is_genuine_buyer: false,
        lead_type: "COMPANY_QUERY",
        intent: "COMPANY_QUERY",
        reason: "User inquiring about CodeAir services and capabilities.",
        matchedServices: ["Custom software", "AI automation", "SaaS development"],
        should_reply: true
      };
    }

    // Rule 1: Recruitment / Hiring posts are strictly ignored
    for (const pat of RECRUITMENT_PATTERNS) {
      if (pat.test(text)) {
        return {
          qualified: false,
          score: 0,
          temperature: "IGNORE",
          is_genuine_buyer: false,
          lead_type: "RECRUITMENT",
          intent: "RECRUITER",
          reason: "Recruitment / hiring opportunity, not a software buyer.",
          matchedServices: [],
          should_reply: false
        };
      }
    }

    // Rule 2: Job seekers are strictly ignored
    for (const pat of JOB_SEEKER_PATTERNS) {
      if (pat.test(text)) {
        return {
          qualified: false,
          score: 0,
          temperature: "IGNORE",
          is_genuine_buyer: false,
          lead_type: "JOB_SEEKER",
          intent: "JOB_SEEKER",
          reason: "User is seeking employment / freelance opportunities.",
          matchedServices: [],
          should_reply: false
        };
      }
    }

    // Rule 3: Service providers / freelancers selling services are strictly ignored
    for (const pat of PROVIDER_PATTERNS) {
      if (pat.test(text)) {
        return {
          qualified: false,
          score: 0,
          temperature: "IGNORE",
          is_genuine_buyer: false,
          lead_type: "SERVICE_PROVIDER",
          intent: "PROVIDER",
          reason: "Author is advertising their own freelance/agency services.",
          matchedServices: [],
          should_reply: false
        };
      }
    }

    // Rule 4: General non-tech networking posts are ignored
    for (const pat of NETWORKING_PATTERNS) {
      if (pat.test(text)) {
        return {
          qualified: false,
          score: 0,
          temperature: "IGNORE",
          is_genuine_buyer: false,
          lead_type: "NETWORKING",
          intent: "GENERAL",
          reason: "General networking / socializing post, not a project requirement.",
          matchedServices: [],
          should_reply: false
        };
      }
    }

    // Rule 4b: Founder / SaaS Builder / Engineer discussions (Core Engagement Target)
    for (const pat of FOUNDER_BUILDER_PATTERNS) {
      if (pat.test(text)) {
        return {
          qualified: true,
          score: 80,
          temperature: "WARM",
          is_genuine_buyer: true,
          lead_type: "FOUNDER_BUILDER",
          intent: "FOUNDER_BUILDER",
          reason: "Founder / SaaS builder / passionate engineer discussion matching CodeAir engagement scope.",
          matchedCategories: ["Web Development", "AI & Automation"],
          matchedServices: ["SaaS development", "Custom software", "AI automation"],
          should_reply: true
        };
      }
    }

    // Rule 5: Service matching & exclusion check
    const match = serviceMatcher.matchServices(text);

    if (match.isExcluded) {
      return {
        qualified: false,
        score: 0,
        temperature: "IGNORE",
        is_genuine_buyer: false,
        lead_type: "OUT_OF_SCOPE",
        intent: "IRRELEVANT",
        reason: match.excludedReason,
        matchedServices: [],
        should_reply: false
      };
    }

    if (!match.matched) {
      return {
        qualified: false,
        score: 0,
        temperature: "IGNORE",
        is_genuine_buyer: false,
        lead_type: "NO_SERVICE_MATCH",
        intent: "IRRELEVANT",
        reason: "No matching CodeAir software/IT service requirement found in post.",
        matchedServices: [],
        should_reply: false
      };
    }

    // Rule 6: Check buying/project intent
    let hasBuyingIntent = false;
    for (const pat of BUYING_INTENT_PATTERNS) {
      if (pat.test(text)) {
        hasBuyingIntent = true;
        break;
      }
    }

    // Ambiguous developer mention check: "looking for a developer" by itself without project is not enough
    if (/^\s*looking\s+for\s+a\s+developer\s*\.?\s*$/i.test(text)) {
      return {
        qualified: false,
        score: 20,
        temperature: "IGNORE",
        is_genuine_buyer: false,
        lead_type: "AMBIGUOUS",
        intent: "GENERAL",
        reason: "Ambiguous developer mention without project context or buying intent.",
        matchedServices: match.matchedServices,
        should_reply: false
      };
    }

    if (hasBuyingIntent) {
      return {
        qualified: true,
        score: 90,
        temperature: "HOT",
        is_genuine_buyer: true,
        lead_type: "PROJECT_BUYER",
        intent: "BUYER",
        reason: `Direct project requirement for ${match.matchedCategories.join(", ")}.`,
        matchedCategories: match.matchedCategories,
        matchedServices: match.matchedServices,
        should_reply: true
      };
    }

    // If it mentions our tech categories without explicit "I need", it's a general technical discussion
    return {
      qualified: false,
      score: 45,
      temperature: "IGNORE",
      is_genuine_buyer: false,
      lead_type: "GENERAL_TECH",
      intent: "GENERAL",
      reason: "Relevant technology discussion but no direct project buying intent detected.",
      matchedCategories: match.matchedCategories,
      matchedServices: match.matchedServices,
      should_reply: false
    };
  }
}

const intentClassifier = new IntentClassifier();
module.exports = intentClassifier;
