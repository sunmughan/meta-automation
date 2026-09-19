/**
 * src/knowledge/knowledge-engine.js
 * Authoritative Dynamic Knowledge Base Engine for CodeAir Software Solutions.
 * Reads, parses, and interprets markdown files in knowledge/ dynamically.
 *
 * Markdown files are the SINGLE SOURCE OF TRUTH:
 * - services.md (Dynamically parsed service catalogue & exclusions)
 * - profiles.md (Dynamically parsed official founder & company links)
 * - founder.md (Founder identity & technical background)
 * - company.md & positioning.md (Company capabilities & zero-hype posture)
 * - lead-rules.md (Qualification boundaries)
 */

const fs = require("fs");
const path = require("path");
const CONFIG = require("../../config");
const logger = require("../logging/logger");

class KnowledgeEngine {
  constructor(knowledgeDir = CONFIG.KNOWLEDGE_DIR) {
    this.knowledgeDir = knowledgeDir;
    this.cache = new Map(); // filename -> { mtime, raw, parsed }
    this.lastChecked = 0;
    this.checkIntervalMs = 2000;
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
            fullPath,
            parsed: this.parseMarkdownFile(file, content)
          });
        }
      }
    } catch (err) {
      logger.error("Error reading knowledge directory:", err);
    }
  }

  /**
   * Internal parser: Extracts structured data from Markdown files on load/change.
   */
  parseMarkdownFile(fileName, content) {
    if (fileName === "services.md") {
      return this.parseServicesMarkdown(content);
    }
    if (fileName === "profiles.md") {
      return this.parseProfilesMarkdown(content);
    }
    return null;
  }

  /**
   * Dynamically parses services.md into approved services and excluded services.
   */
  parseServicesMarkdown(content) {
    const approved = new Set();
    const excluded = new Set();

    const sections = content.split(/^##\s+/m);
    for (const sec of sections) {
      const trimmed = sec.trim();
      if (!trimmed) continue;

      const lines = trimmed.split("\n");
      const heading = lines[0].trim().toUpperCase();
      const isExcluded = heading.includes("NOT A CODEAIR SERVICE") || heading.includes("EXCLUSION");

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith("- ") || line.startsWith("* ")) {
          const item = line.slice(2).trim();
          if (item) {
            if (isExcluded) excluded.add(item);
            else approved.add(item);
          }
        }
      }
    }

    return {
      approved: Array.from(approved),
      excluded: Array.from(excluded)
    };
  }

  /**
   * Dynamically parses profiles.md into official founder and company profile URLs.
   */
  parseProfilesMarkdown(content) {
    const profiles = {
      founder: {
        name: "Sunmughan Swamy",
        role: "Founder / CEO / Technical Architect",
        github: "",
        facebook: "",
        instagram: "",
        linkedin: ""
      },
      company: {
        name: "CodeAir Software Solutions",
        website: "",
        pixelgo: "",
        facebook: "",
        instagram: "",
        linkedin: ""
      }
    };

    // Regex match markdown sections like:
    // ### GitHub\nhttps://github.com/sunmughan
    // ### Website\nhttps://www.codeair.tech
    const lines = content.split("\n");
    let currentScope = "FOUNDER"; // FOUNDER or COMPANY
    let currentSubHeading = "";

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (line.startsWith("# ") || line.startsWith("## ")) {
        const hUpper = line.toUpperCase();
        if (hUpper.includes("COMPANY")) currentScope = "COMPANY";
        else if (hUpper.includes("FOUNDER")) currentScope = "FOUNDER";
      } else if (line.startsWith("### ")) {
        currentSubHeading = line.slice(4).trim().toLowerCase();
      } else if (line.startsWith("http://") || line.startsWith("https://")) {
        const url = line.split(" ")[0].trim();
        if (currentScope === "FOUNDER") {
          if (currentSubHeading.includes("github") && !profiles.founder.github) profiles.founder.github = url;
          else if (currentSubHeading.includes("linkedin") && !profiles.founder.linkedin) profiles.founder.linkedin = url;
          else if (currentSubHeading.includes("instagram") && !profiles.founder.instagram) profiles.founder.instagram = url;
          else if (currentSubHeading.includes("facebook") && !profiles.founder.facebook) profiles.founder.facebook = url;
        } else if (currentScope === "COMPANY") {
          if (currentSubHeading.includes("pixelgo") && !profiles.company.pixelgo) profiles.company.pixelgo = url;
          else if ((currentSubHeading.includes("website") || currentSubHeading.includes("site")) && !profiles.company.website) profiles.company.website = url;
          else if (currentSubHeading.includes("linkedin") && !profiles.company.linkedin) profiles.company.linkedin = url;
          else if (currentSubHeading.includes("instagram") && !profiles.company.instagram) profiles.company.instagram = url;
          else if (currentSubHeading.includes("facebook") && !profiles.company.facebook) profiles.company.facebook = url;
        }
        currentSubHeading = "";
      }
    }

    // Default fallback normalization if explicit subheadings had slight naming difference
    if (!profiles.company.website) {
      const m = content.match(/https?:\/\/(www\.)?codeair\.tech[^\s)]*/i);
      if (m) profiles.company.website = m[0];
    }
    if (!profiles.company.pixelgo) {
      const m = content.match(/https?:\/\/(www\.)?pixelgo\.live[^\s)]*/i);
      if (m) profiles.company.pixelgo = m[0];
    }
    if (!profiles.founder.linkedin) {
      const m = content.match(/https?:\/\/(www\.)?linkedin\.com\/in\/sunmughan[^\s)]*/i);
      if (m) profiles.founder.linkedin = m[0];
    }

    return profiles;
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
  // APPROVED SERVICE CATALOGUE (services.md is single source of truth)
  // ============================================================

  getApprovedServices() {
    this.loadAll();
    const entry = this.cache.get("services.md");
    if (entry && entry.parsed && entry.parsed.approved && entry.parsed.approved.length > 0) {
      return entry.parsed.approved;
    }
    return [];
  }

  getExcludedServices() {
    this.loadAll();
    const entry = this.cache.get("services.md");
    if (entry && entry.parsed && entry.parsed.excluded && entry.parsed.excluded.length > 0) {
      return entry.parsed.excluded;
    }
    return [];
  }

  // ============================================================
  // OFFICIAL PROFILES & LINK RESOLVER (profiles.md is single source of truth)
  // ============================================================

  getOfficialProfiles() {
    this.loadAll();
    const entry = this.cache.get("profiles.md");
    if (entry && entry.parsed) {
      return entry.parsed;
    }
    // Fallback if profiles.md parse failed
    return this.parseProfilesMarkdown(this.getRaw("profiles.md"));
  }

  /**
   * Resolves a verified official link for a specific entity and platform.
   * Single source of truth is knowledge/profiles.md.
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

    // Hospitality & Hotel Systems reference request (PixelGo HMS)
    if (
      /\b(pixelgo|hms|hotel|hospitality|resort|restaurant)\b/i.test(text) &&
      /\b(link|website|site|demo|reference|system|app|software|url|portfolio)\b/i.test(text)
    ) {
      return {
        target: "COMPANY",
        platform: "pixelgo",
        url: profiles.company.pixelgo || "https://pixelgo.live",
        text: `PixelGo HMS (Flagship Unified Hotel Management System): ${profiles.company.pixelgo || "https://pixelgo.live"}`
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

  isHospitalityQuery(text = "") {
    const lower = String(text || "").toLowerCase();
    return /\b(hotel|resort|hospitality|restaurant|pms|room\s+management|property\s+management\s+system|pixelgo)\b/i.test(lower);
  }
}

const knowledgeEngine = new KnowledgeEngine();
module.exports = knowledgeEngine;
