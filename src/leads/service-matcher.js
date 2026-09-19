/**
 * src/leads/service-matcher.js
 * Authoritative CodeAir Service Matcher.
 * Uses services.md & company.md to match user requirements against approved services
 * and detect excluded non-software requests.
 */

const knowledge = require("../knowledge/knowledge-engine");

// Map of canonical service categories and their detection patterns
const SERVICE_CATEGORIES = [
  {
    category: "Web Development",
    services: [
      "Custom web application development",
      "Business websites",
      "Website design & development",
      "Landing page design & development",
      "E-commerce development",
      "SaaS development",
      "Admin dashboards",
      "Business portals"
    ],
    patterns: [
      /\bweb(\s+app(lication)?|\s+development|\s+portal|\s+platform)\b/i,
      /\b(build|develop|create|design|redesign)\s+(a\s+)?(website|web\s+app|web\s+portal|store\s+website|business\s+website|ecommerce\s+site|landing\s+page)\b/i,
      /\b(need|looking\s+for)\s+(a\s+)?(website|web\s+application|ecommerce\s+platform|admin\s+dashboard|customer\s+portal|landing\s+page)\b/i,
      /\b(web\s+developer|website\s+developer|web\s+designer|website\s+designer|frontend\s+developer|full[- ]?stack\s+developer)\b/i,
      /\bwebsite\s+(design|development|building|redesign|creation)\b/i,
      /\b(need|looking\s+for)\s+(someone\s+to\s+)?(build|make|design)\s+(a\s+|our\s+|my\s+)?(website|web\s+app|landing\s+page|site)\b/i,
      /\b(who|anyone)\s+(can|knows?\s+how\s+to)\s+(build|make|design)\s+(a\s+|our\s+|my\s+)?(website|web\s+app|site)\b/i,
      /\b(shopify|wordpress|webflow|next\.?js|react)\s+(website|store|site|developer|dev)\b/i,
      /\badmin\s+dashboard\b/i,
      /\be[- ]?commerce\s+(platform|website|store|system)\b/i,
      /\bsaas\s+(platform|app(lication)?|product|mvp)\b/i
    ]
  },
  {
    category: "Mobile Development",
    services: [
      "Mobile applications",
      "Android applications",
      "iOS applications",
      "Flutter applications",
      "React Native applications"
    ],
    patterns: [
      /\bmobile\s+app(lication)?\b/i,
      /\b(build|develop|create|design)\s+(an?\s+)?(ios|android|mobile|flutter|react\s+native)\s+app\b/i,
      /\b(need|looking\s+for)\s+(an?\s+)?(app\s+developer|mobile\s+app|ios\s+developer|android\s+developer|flutter\s+developer)\b/i,
      /\b(who|anyone)\s+(can|knows?\s+how\s+to)\s+(build|make|develop)\s+(an?\s+)?(app|mobile\s+app)\b/i,
      /\bflutter\s+(application|app|developer|dev)\b/i,
      /\breact\s+native\s+(application|app|developer|dev)\b/i
    ]
  },
  {
    category: "AI & Automation",
    services: [
      "AI applications",
      "AI development & engineering",
      "LLM integration",
      "RAG systems",
      "AI agents",
      "AI automation",
      "AI chatbots",
      "Voice AI",
      "AI calling systems",
      "Business automation",
      "Workflow automation"
    ],
    patterns: [
      /\bai\s+(development|developer|engineer|team|agency|automation|agent|agents|chatbot|bot|calling|system|integration|solution)\b/i,
      /\b(build|develop|integrate|need)\s+(an?\s+)?(ai|ai\s+chatbot|ai\s+agent|rag\s+system|llm\s+integration|voice\s+ai|calling\s+agent|ai\s+workflow)\b/i,
      /\b(looking\s+for|need)\s+(an?\s+)?(ai\s+developer|ai\s+engineer|ai\s+specialist|ai\s+team)\b/i,
      /\b(integrate|integrating)\s+(llms?|gpt|claude|gemini|openai|ai)\b/i,
      /\b(ai\s+chatbot|ai\s+agent|autonomous\s+agent|voice\s+ai|calling\s+agent)\b/i,
      /\bautomate\s+(customer\s+support|workflow|business\s+processes|data\s+entry|operations)\b/i,
      /\bworkflow\s+automation\b/i,
      /\bbusiness\s+automation\b/i
    ]
  },
  {
    category: "Hospitality",
    services: [
      "Hotel management software (PixelGo HMS)",
      "Hospitality booking platforms",
      "Hotel & resort operations software",
      "Restaurant & POS systems"
    ],
    patterns: [
      /\b(hotel|resort|restaurant|hospitality|motel|vacation\s+rental|guest\s+house)\b.*\b(management|software|system|app|application|website|site|booking|reservation|pms|platform)\b/i,
      /\b(hotel\s+management\s+system|pms\s+software|property\s+management\s+system|pms)\b/i,
      /\b(need|looking\s+for|build)\s+(a\s+)?(hotel|resort|restaurant)\s+(website|app|system|booking|reservation)\b/i
    ]
  },
  {
    category: "Business Systems",
    services: [
      "CRM systems",
      "ERP systems",
      "POS systems",
      "Hotel management software (PixelGo HMS)",
      "Billing systems",
      "Inventory systems",
      "Custom business software"
    ],
    patterns: [
      /\b(custom\s+)?(crm|erp|pos|billing|inventory)\s+(system|software|tool|platform)\b/i,
      /\b(build|develop|need)\s+(a\s+)?(crm|erp|pos|billing\s+system|inventory\s+system)\b/i,
      /\b(hotel\s+management|hospitality\s+operations|pms)\s+(system|software|app|platform)\b/i,
      /\bbusiness\s+management\s+software\b/i,
      /\bcustom\s+software\b/i,
      /\binternal\s+tools\b/i
    ]
  },
  {
    category: "Backend & APIs",
    services: [
      "Backend development",
      "Node.js",
      "PHP / Laravel",
      "APIs",
      "REST APIs",
      "API integrations",
      "Database systems"
    ],
    patterns: [
      /\bbackend\s+(development|developer|architecture|system|api)\b/i,
      /\bapi\s+(integration|development|endpoint)\b/i,
      /\b(integrate|connect)\s+(multiple\s+)?apis\b/i,
      /\bdatabase\s+(architecture|optimization|design)\b/i,
      /\bnode\.?js\s+(backend|developer|dev)\b/i,
      /\blaravel\s+(backend|developer|dev)\b/i
    ]
  },
  {
    category: "Cloud & Infrastructure",
    services: [
      "Cloud deployment",
      "DevOps",
      "Infrastructure",
      "Scaling",
      "Technical consulting"
    ],
    patterns: [
      /\bcloud\s+deployment\b/i,
      /\bdevops\b/i,
      /\bserver\s+setup\b/i,
      /\bscaling\s+infrastructure\b/i,
      /\bsoftware\s+architecture\b/i,
      /\bsystem\s+design\b/i,
      /\btechnical\s+consulting\b/i
    ]
  }
];

// Patterns strictly indicating excluded non-software services (never exclude website/landing page design)
const EXCLUDED_PATTERNS = [
  /\b(pure\s+logo\s+design|logo\s+designer|graphic\s+artist|flyer\s+design|banner\s+design)\b/i,
  /\b(photograph(y|er)|videograph(y|er)|video\s+edit(or|ing)|video\s+production)\b/i,
  /\b(social\s+media\s+manager|smm|seo\s+(specialist|expert|agency))\b/i,
  /\b(accounting\s+services|accountant|bookkeep(er|ing)|tax\s+filing|legal\s+services|lawyer|attorney)\b/i
];

class ServiceMatcher {
  /**
   * Matches a text against CodeAir's service catalogue.
   *
   * @param {string} text
   * @returns {{
   *   matched: boolean,
   *   matchedCategories: string[],
   *   matchedServices: string[],
   *   isExcluded: boolean,
   *   excludedReason: string|null
   * }}
   */
  matchServices(text = "") {
    const rawText = String(text || "").trim();

    // Check for explicit non-software exclusions
    for (const pat of EXCLUDED_PATTERNS) {
      if (pat.test(rawText)) {
        // If it's UI/UX attached to a software/app project, it might be allowed,
        // but pure graphic/branding/marketing/accounting/legal is excluded.
        const isPureExcluded =
          !/\b(app|application|software|saas|platform|dashboard|crm|erp|api|backend|codeair)\b/i.test(rawText);
        if (isPureExcluded || /\b(logo|flyer|banner|video\s+edit|accounting|legal)\b/i.test(rawText)) {
          return {
            matched: false,
            matchedCategories: [],
            matchedServices: [],
            isExcluded: true,
            excludedReason: "Request is for non-software / excluded service (graphic design, branding, marketing, etc.)"
          };
        }
      }
    }

    const matchedCategories = [];
    const matchedServices = [];

    for (const cat of SERVICE_CATEGORIES) {
      const isMatched = cat.patterns.some(pat => pat.test(rawText));
      if (isMatched) {
        matchedCategories.push(cat.category);
        matchedServices.push(...cat.services.slice(0, 2));
      }
    }

    return {
      matched: matchedCategories.length > 0,
      matchedCategories,
      matchedServices,
      isExcluded: false,
      excludedReason: null
    };
  }
}

const serviceMatcher = new ServiceMatcher();
module.exports = serviceMatcher;
