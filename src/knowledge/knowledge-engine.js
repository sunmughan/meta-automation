/**
 * src/knowledge/knowledge-engine.js
 * Authoritative Dynamic Knowledge Base Engine for CodeAir Software Solutions.
 * Reads and interprets all markdown files in knowledge/ dynamically.
 *
 * Source of truth for:
 * - Founder identity & principles (founder.md)
 * - Company capabilities & positioning (company.md, positioning.md)
 * - Service catalog & exclusion rules (services.md)
 * - Communication guidelines & tone (communication-style.md)
 * - Lead qualification rules & stage definitions (lead-rules.md)
 * - Official profile links & resolver (profiles.md)
 * - Conversational behavioral patterns (examples.md)
 */

const fs = require("fs");
const path = require("path");
const CONFIG = require("../../config");
const logger = require("../logging/logger");

class KnowledgeEngine {
  constructor(knowledgeDir = CONFIG.KNOWLEDGE_DIR) {
    this.knowledgeDir = knowledgeDir;
    this.cache = new Map(); // filename -> { mtime, raw }
    this.lastChecked = 0;
    this.checkIntervalMs = 3000;
    this.loadAll();
  }

  loadAll(force = false) {
    const now = Date.now();
    if (!force && now - this.lastChecked < this.checkIntervalMs && this.cache.size > 0) {
      return;
    }
    this.lastChecked = now;

    if (!fs.existsSync(this.knowledgeDir)) {
      logger.warn(`Knowledge directory not found at: ${this.knowledgeDir}`);
      return;
    }

    try {
      const files = fs.readdirSync(this.knowledgeDir).filter(f => f.endsWith(".md"));
      for (const file of files) {
        const fullPath = path.join(this.knowledgeDir, file);
        const stats = fs.statSync(fullPath);
        const cached = this.cache.get(file);
        if (!cached || cached.mtime !== stats.mtimeMs || force) {
          const content = fs.readFileSync(fullPath, "utf8");
          this.cache.set(file, {
            mtime: stats.mtimeMs,
            raw: content,
            fullPath
          });
        }
      }
    } catch (err) {
      logger.error("Error reading knowledge directory:", err);
    }
  }

  getRaw(fileName) {
    this.loadAll();
    const normalized = fileName.endsWith(".md") ? fileName : `${fileName}.md`;
    const entry = this.cache.get(normalized);
    return entry ? entry.raw : "";
  }

  getAllRaw() {
    this.loadAll();
    const result = {};
    for (const [key, val] of this.cache.entries()) {
      result[key] = val.raw;
    }
    return result;
  }

  // ============================================================
  // APPROVED SERVICE CATALOGUE (services.md & company.md)
  // ============================================================

  getApprovedServices() {
    return [
      "Custom web application development",
      "Business websites",
      "E-commerce development",
      "SaaS development",
      "Custom software",
      "Business software",
      "CRM systems",
      "ERP systems",
      "POS systems",
      "Billing systems",
      "Admin dashboards",
      "Business portals",
      "Custom platforms",
      "Mobile applications",
      "Android applications",
      "iOS applications",
      "Flutter applications",
      "React Native applications",
      "Backend development",
      "Node.js",
      "PHP / Laravel",
      "APIs",
      "REST APIs",
      "API integrations",
      "Database systems",
      "AI integration",
      "LLM integration",
      "RAG systems",
      "AI agents",
      "AI automation",
      "AI chatbots",
      "Voice AI",
      "AI calling systems",
      "Business automation",
      "Workflow automation",
      "Cloud deployment",
      "DevOps",
      "Servers",
      "Infrastructure",
      "Scaling",
      "Technical consulting"
    ];
  }

  getExcludedServices() {
    return [
      "Graphic design",
      "Logo design",
      "Brand identity design",
      "Photography",
      "Video editing",
      "Video production",
      "Social media management",
      "Marketing-only services",
      "SEO-only services",
      "HR services",
      "Recruitment services",
      "Accounting services",
      "Legal services"
    ];
  }

  // ============================================================
  // OFFICIAL PROFILES & LINK RESOLVER (profiles.md)
  // ============================================================

  getOfficialProfiles() {
    return {
      founder: {
        name: "Sunmughan Swamy",
        role: "Founder / CEO / Technical Architect",
        github: "https://github.com/sunmughan",
        facebook: "https://facebook.com/sunmughan",
        instagram: "https://instagram.com/sunmughan",
        linkedin: "https://linkedin.com/in/sunmughan"
      },
      company: {
        name: "CodeAir Software Solutions",
        website: "https://codeair.tech",
        facebook: "https://facebook.com/codeairofficial",
        instagram: "https://instagram.com/codeairofficial",
        linkedin: "https://linkedin.com/company/codeairofficial"
      }
    };
  }

  /**
   * Resolves a verified official link for a specific entity and platform.
   * Never invents or modifies URLs.
   */
  getProfileLink(target = "COMPANY", platform = "website") {
    const profiles = this.getOfficialProfiles();
    const t = (target || "").toUpperCase();
    const p = (platform || "").toLowerCase();

    if (t === "FOUNDER") {
      return profiles.founder[p] || null;
    }
    if (t === "COMPANY") {
      return profiles.company[p] || null;
    }
    return null;
  }

  /**
   * Examines user text to determine if an official link or profile is explicitly requested.
   * Returns { target: "FOUNDER"|"COMPANY", platform: string, url: string, text: string } or null.
   */
  resolveRequestedLink(userText = "") {
    const text = String(userText || "").toLowerCase();
    const profiles = this.getOfficialProfiles();

    // Check if user requested ALL profiles
    if (
      (text.includes("all") || text.includes("every")) &&
      (text.includes("profile") || text.includes("social") || text.includes("link"))
    ) {
      if (text.includes("codeair") || text.includes("company")) {
        return {
          target: "COMPANY",
          platform: "all",
          text: `Website: ${profiles.company.website}\nLinkedIn: ${profiles.company.linkedin}\nInstagram: ${profiles.company.instagram}\nFacebook: ${profiles.company.facebook}`
        };
      }
      return {
        target: "FOUNDER",
        platform: "all",
        text: `GitHub: ${profiles.founder.github}\nLinkedIn: ${profiles.founder.linkedin}\nInstagram: ${profiles.founder.instagram}\nFacebook: ${profiles.founder.facebook}`
      };
    }

    // Check specific platform mentions
    const isCompanyExplicit = text.includes("codeair") || text.includes("company");

    if (text.includes("github") || text.includes("repo") || text.includes("git")) {
      return {
        target: "FOUNDER",
        platform: "github",
        url: profiles.founder.github
      };
    }

    if (text.includes("linkedin")) {
      if (isCompanyExplicit) {
        return {
          target: "COMPANY",
          platform: "linkedin",
          url: profiles.company.linkedin
        };
      }
      return {
        target: "FOUNDER",
        platform: "linkedin",
        url: profiles.founder.linkedin
      };
    }

    if (text.includes("instagram") || text.includes("insta")) {
      if (isCompanyExplicit) {
        return {
          target: "COMPANY",
          platform: "instagram",
          url: profiles.company.instagram
        };
      }
      return {
        target: "FOUNDER",
        platform: "instagram",
        url: profiles.founder.instagram
      };
    }

    if (text.includes("facebook") || text.includes("fb")) {
      if (isCompanyExplicit) {
        return {
          target: "COMPANY",
          platform: "facebook",
          url: profiles.company.facebook
        };
      }
      return {
        target: "FOUNDER",
        platform: "facebook",
        url: profiles.founder.facebook
      };
    }

    if (text.includes("website") || text.includes("site") || text.includes("portfolio")) {
      return {
        target: "COMPANY",
        platform: "website",
        url: profiles.company.website
      };
    }

    return null;
  }
}

const knowledge = new KnowledgeEngine();
module.exports = knowledge;
