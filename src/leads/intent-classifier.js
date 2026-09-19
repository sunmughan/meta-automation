/**
 * src/leads/intent-classifier.js
 * Strict deterministic intent classifier & lead qualification engine.
 *
 * Enforces lead-rules.md:
 * Genuine CodeAir lead strictly requires:
 *   1. AUTHENTIC BUYER / PROJECT INTENT (Author is requesting/hiring/needing software development)
 *   2. CODEAIR SERVICE MATCH (Web, Mobile, AI/Automation, SaaS, Business Systems, Hospitality, Backend/APIs)
 *   3. NOT RECRUITMENT (9-5 HR hiring, salaried job ads with resume/cv/careers application)
 *   4. NOT SERVICE PROVIDER (Freelancer, agency, or developer advertising or showcasing their own services)
 *   5. NOT JOB SEEKER (Candidate looking for employment/gigs)
 *   6. NOT IRRELEVANT (Celebrity, memes, personal lifestyle, birthdays, travel, entertainment)
 */

const serviceMatcher = require("./service-matcher");

// 1. Traditional corporate 9-5 employee recruitment (HR, salaried employee roles, resume submissions)
const CORPORATE_RECRUITMENT_PATTERNS = [
  /\bapply\s+(here|now|via|at|to)\s*[:\s]*(https?:\/\/|careers?|greenhouse|lever|workday|job\s+board)/i,
  /\b(submit|send)\s+(your\s+)?(cv|resume)\b/i,
  /\b(cv|resume)\s+(to|at)\s+([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i,
  /\bcareers?@[a-z0-9.-]+\.[a-z]{2,}/i,
  /\b(base\s+)?salary\s*[:\s]*[\$€£₹]\s*\d+/i,
  /\bannual\s+salary\b/i,
  /\bcompensation\s+package\b/i,
  /\bbenefits\s*(package|\(401k|health\s+insurance)\b/i,
  /\b(full[- ]?time|part[- ]?time)\s+(employee|salaried\s+role|permanent\s+position|w2)\b/i,
  /\b(job\s+opening|job\s+vacancy|vacancies)\s+(at|in)\b/i,
  /\btalent\s+acquisition\b/i,
  /\brecruitment\s+(agency|team)\b/i
];

// 2. Job seekers looking for work / employment
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

// 3. Service Providers / Agencies / Freelancers selling their own services
const PROVIDER_PATTERNS = [
  // Direct self-identification
  /\bi'?m\s+a\s+(freelance\s+)?(web|software|graphic|ui|ux|app|flutter|react|frontend|backend|full[- ]?stack)\s+developer\b/i,
  /\bi\s+am\s+a\s+(freelance\s+)?(web|software|graphic|ui|ux|app|flutter|react|frontend|backend|full[- ]?stack)\s+developer\b/i,
  /\bi'?m\s+a\s+(designer|freelancer|consultant)\b/i,
  /\bfor\s+hire\b/i,
  /\btaking\s+(on\s+)?new\s+(clients|bookings|projects)\b/i,
  /\baccepting\s+new\s+clients\b/i,
  /\bopen\s+for\s+(clients|projects|freelance\s+work)\b/i,
  /\blooking\s+for\s+(new\s+)?clients\b/i,
  /\b(my|our)\s+(agency|services|development\s+agency|web\s+agency|software\s+firm)\b/i,
  /\bi\s+build\s+(websites|apps|software|dashboards|mvps)\b/i,
  /\bwe\s+build\s+(websites|apps|software|dashboards|mvps)\b/i,
  /\bi\s+help\s+(businesses|founders|startups|clients|brands|companies)\b/i,
  /\bwe\s+help\s+(businesses|founders|startups|clients|brands|companies)\b/i,
  /\boffering\s+(web|app|software|mobile)\s+development\b/i,
  /\b(book|schedule)\s+(a\s+)?(call|discovery\s+call|strategy\s+call|meeting)\b/i,
  /\bcalendly\.com\b/i,
  
  // Promotional hooks & calls to action by sellers
  /\b(need|want)\s+(a\s+)?(website|web\s+app|mobile\s+app|software|custom\s+software|developer|dev)\??\s+[-—]?\s*(dm\s+me|message\s+me|let'?s\s+talk|let'?s\s+connect|contact\s+us|contact\s+me|reach\s+out)\b/i,
  /\b(building|launching)\s+something\s+for\s+your\s+business\??\s+.*(i\s+can\s+help|dm\s+me|let'?s\s+talk)\b/is,
  /\bi\s+can\s+help\s+(you\s+)?(turn\s+the\s+idea|build|create|launch)\b/i,
  /\b(dm\s+me|message\s+me|contact\s+us)\s*[-—:]?\s*(let'?s\s+talk|let'?s\s+connect|if\s+you\s+need|to\s+get\s+started|to\s+discuss\s+pricing)\b/i,
  /\b(dm|message)\s+(for|to)\s+(order|book|collab|rates|pricing|inquiries|quotes?)\b/i,
  /\b(link|portfolio)\s+in\s+bio\b/i,
  /\bcheck\s+(out\s+)?(my|our)\s+(portfolio|recent\s+work|latest\s+project|latest\s+build|latest\s+design|agency)\b/i,
  /\b(built|designed|created|launched)\s+this\s+(for\s+a\s+client|website|app|dashboard|platform|landing\s+page)\b/i,
  /\bhere('?s|\s+is)\s+(a|the)\s+(website|app|dashboard|project)\s+(i|we)\s+(built|designed|created)\b/i,
  /\b(my|our)\s+latest\s+(project|design|website|build|client\s+work)\b/i,
  /\bstarting\s+at\s+[\$₹€£]\d+/i,
  /\b[\$₹€£]\d+\s+per\s+(website|page|project|hour)\b/i,
  /\b(web\s+design|web\s+development|app\s+development|software)\s+agency\b/i,
  /\b(offering|provide|providing)\s+(web|website|app|software|development|design)\s+services\b/i,
  /\b(5|10|top|best)\s+(tips|tools|reasons|mistakes|rules)\s+(for|to|every)\b/i,
  /\bhow\s+to\s+(build|code|design|create)\s+(a\s+)?(website|web\s+app|saas|app)\b/i,
  /\bcomment\s+["'].*?["']\s+(and\s+i'?ll|to\s+get)\b/i
];

// 4. Purely irrelevant, lifestyle, celebrity, entertainment content
const IRRELEVANT_PATTERNS = [
  /\bhappy\s+birthday\b/i,
  /\b(rip|rest\s+in\s+peace)\b/i,
  /\b(beach|vacation|holiday|sunset|sunrise|traveling|ootd|outfit\s+of\s+the\s+day)\b/i,
  /\b(workout|fitness|gym|recipe|cooking|dinner|lunch|breakfast)\b/i,
  /\b(concert|album|song|music\s+video|beyonce|taylor\s+swift|drake|movie|cinema)\b/i,
  /\b(dating|relationship|crush|horoscope|zodiac)\b/i,
  /\b(meme|memes|lol|lmao|funny\s+video)\b/i,
  /\b(weather|raining|sunny|snowing)\b/i
];

// 5. General non-tech networking chatter
const NETWORKING_PATTERNS = [
  /\bexpand\s+my\s+network\b/i,
  /\bchat\s+and\s+connect\b/i,
  /\bhappy\s+(monday|friday|weekend)\b/i,
  /\bgood\s+morning\s+(threads|everyone|all)\b/i
];

// 6. Explicit buyer / client demand signals (Author is seeking/hiring someone to build for them)
const BUYING_INTENT_PATTERNS = [
  // First-person requests for developers, agencies, or software creation
  /\b(i|we)\s+need(\s+someone|\s+somebody)?\s+(to\s+build|to\s+develop|to\s+create|to\s+make|to\s+design|to\s+code)\b/i,
  /\b(i'?m|we'?re|we\s+are)?\s*looking\s+(for|to\s+hire)\s+(someone|somebody|a\s+company|a\s+developer|a\s+designer|a\s+team|an\s+agency|a\s+freelancer)\s*(to\s+build|to\s+develop|to\s+design|for\s+our)?\b/i,
  /\blooking\s+for\s+someone\s+to\s+(build|design|develop|make|code)\b/i,
  /\bneed\s+someone\s+to\s+(build|design|develop|make|code)\b/i,
  /\bneed\s+(a\s+|our\s+|my\s+)?(site|website|app|web\s+app|platform|crm|erp|dashboard|mvp|system)\s+(built|developed|created|designed|redesigned)\b/i,
  /\blooking\s+to\s+hire\s+(a\s+|an?\s+)?(web\s+developer|app\s+developer|software\s+developer|agency|freelancer|team)\b/i,
  /\bhire\s+(a\s+)?(web\s+developer|app\s+developer|flutter\s+developer|full[- ]?stack\s+developer|freelancer\s+to\s+build)\b/i,

  // Project Hiring Requests (Author is hiring developers/agencies for a project or build)
  /\b(we'?re\s+hiring|hiring|looking\s+to\s+hire|need\s+to\s+hire)\s+(a\s+|an?\s+)?(developer|engineer|designer|freelancer|agency|team|someone)\s+(to\s+build|to\s+develop|to\s+create|to\s+design|for\s+(our|a|my)\s+(website|app|mvp|project|saas|platform|system|store))\b/i,
  /\bhiring\s+(a\s+|an?\s+)?(web\s+dev(eloper)?|app\s+dev(eloper)?|software\s+dev(eloper)?|flutter\s+dev(eloper)?|frontend\s+dev(eloper)?|full[- ]?stack\s+dev(eloper)?|ui\s+designer)\b/i,
  /\bhiring\s+(for\s+)?(website|web\s+app|mobile\s+app|software|mvp|project|saas|platform|system|hotel\s+software)\b/i,
  /\b(hiring|looking\s+for)\s+(a\s+|an?\s+)?(freelance|contract)\s+(developer|designer|engineer|agency)\b/i,

  // Specific role or service requests
  /\b(looking\s+for|need|seeking)\s+(a\s+|an?\s+)?(web\s+designer|website\s+designer|web\s+developer|website\s+developer|frontend\s+developer|backend\s+developer|full[- ]?stack\s+developer|ai\s+developer|ai\s+engineer|flutter\s+developer|freelance\s+developer|app\s+developer|software\s+engineer)\s*(for|to|with)?\b/i,
  /\b(looking\s+for|need|seeking)\s+(someone\s+for\s+)?website\s+(design|development|building|redesign)\b/i,
  /\b(looking\s+for|need|seeking)\s+(an?\s+)?ai\s+(development(\s+team)?|team|agency|engineer|developer|integration)\b/i,
  /\bneed\s+(an?\s+)?(app|mobile\s+app)\s+developer\s+to\s+(create|build|develop)\b/i,
  /\bneed\s+(a\s+|an?\s+)?(website|web\s+app|mobile\s+app|software|ai|ecommerce)\s*(building|development|design)?\s*(service|services|solution|solutions)\b/i,
  
  // Community questions seeking recommendations / providers
  /\b(who|anyone)\s+(can|knows?\s+how\s+to|here\s+who\s+can)\s+(build|make|design|develop|create)\s+(a\s+|our\s+|my\s+)?(website|web\s+app|app|platform|saas|mvp|system)\b/i,
  /\b(can\s+anyone|anyone(\s+here)?\s+can|does\s+anyone)\s+(recommend|suggest)\s+(a\s+)?(good\s+)?(developer|web\s+dev|software\s+agency|web\s+agency)\b/i,
  /\b(anyone(\s+here)?\s+knows?|recommend|looking\s+for\s+recommendations?\s+for)\s+(a\s+)?(good\s+)?(developer|designer|web\s+dev|agency)\b/i,
  /\bwhere\s+(can\s+i|to)\s+(find|hire)\s+(a\s+good\s+)?(developer|agency|team)\s+to\s+build\b/i,
  
  // Calls requesting portfolios / proposals from developers
  /\b(please\s+)?dm\s+(me\s+)?(your\s+)?(portfolio|rates|quotes?|pricing|charges|approximate\s+charges|past\s+work|samples?)\b/i,
  /\b(send|share)\s+(me\s+)?(your\s+)?(portfolio|rates|quotes?|pricing|work)\b/i,
  
  // Assistance requests for building products
  /\bhelp\s+me\s+(build|create|develop|design)\s+(a\s+|an?\s+)?(website|app|saas|platform|mvp)\b/i,
  /\bneed\s+help\s+(building|creating|developing|designing)\s+(a\s+|an?\s+)?(website|app|saas|platform|mvp)\b/i,
  /\bcan\s+someone\s+(build|create|develop|design)\s+(a\s+|an?\s+)?(website|app|platform|tool)\b/i,
  /\bwe\s+need\s+(an?\s+)?(app|website|crm|erp|dashboard|saas|ai\s+system|automation|landing\s+page)\b/i,
  /\b(we\s+need|need|want)\s+to\s+automate\b/i,
  /\bseeking\s+someone\s+to\s+(build|develop|implement|design)\b/i
];

class IntentClassifier {
  /**
   * Classifies post intent and qualifies lead with strict buyer-only standard.
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

    // Rule 1: Corporate HR Recruitment posts (salaried, benefits, resume/CV submission) are strictly ignored
    for (const pat of CORPORATE_RECRUITMENT_PATTERNS) {
      if (pat.test(text)) {
        return {
          qualified: false,
          score: 0,
          temperature: "IGNORE",
          is_genuine_buyer: false,
          lead_type: "RECRUITMENT",
          intent: "RECRUITER",
          reason: "Corporate recruitment / salaried job opening, not a software buyer.",
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

    // Rule 3: Service providers / freelancers selling or showcasing services are strictly ignored
    for (const pat of PROVIDER_PATTERNS) {
      if (pat.test(text)) {
        return {
          qualified: false,
          score: 0,
          temperature: "IGNORE",
          is_genuine_buyer: false,
          lead_type: "SERVICE_PROVIDER",
          intent: "PROVIDER",
          reason: "Author is advertising or showcasing their own freelance/agency services.",
          matchedServices: [],
          should_reply: false
        };
      }
    }

    // Rule 4: Irrelevant lifestyle, celebrity, travel, meme, birthday posts
    for (const pat of IRRELEVANT_PATTERNS) {
      if (pat.test(text)) {
        return {
          qualified: false,
          score: 0,
          temperature: "IGNORE",
          is_genuine_buyer: false,
          lead_type: "IRRELEVANT",
          intent: "IRRELEVANT",
          reason: "Post is personal lifestyle, celebrity, entertainment, or irrelevant content.",
          matchedServices: [],
          should_reply: false
        };
      }
    }

    // Rule 5: General non-tech networking posts
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

    // Rule 6: Service matching & exclusion check
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

    // Rule 7: Check strict buying/project intent
    let hasBuyingIntent = false;
    for (const pat of BUYING_INTENT_PATTERNS) {
      if (pat.test(text)) {
        hasBuyingIntent = true;
        break;
      }
    }

    // Ambiguous developer mention check: "looking for a developer" by itself without project context
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

    // Only qualify if there is clear, unambiguous buyer intent
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

    // If it mentions tech categories without explicit buyer demand, it's general technical chatter
    return {
      qualified: false,
      score: 40,
      temperature: "IGNORE",
      is_genuine_buyer: false,
      lead_type: "GENERAL_TECH",
      intent: "GENERAL",
      reason: "Relevant technology discussion but author is not actively requesting or hiring for a project.",
      matchedCategories: match.matchedCategories,
      matchedServices: match.matchedServices,
      should_reply: false
    };
  }
}

const intentClassifier = new IntentClassifier();
module.exports = intentClassifier;
