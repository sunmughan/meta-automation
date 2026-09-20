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
   * Supports both bullet lists (- / *) and markdown table rows (| Service | Description |).
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
        if (!line) continue;

        // 1. Bullet list items: "- Item" or "* Item"
        if (line.startsWith("- ") || line.startsWith("* ")) {
          let item = line.slice(2).trim();
          // Strip any markdown link formatting: [Name](URL) -> Name
          item = item.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").trim();
          if (item) {
            if (isExcluded) excluded.add(item);
            else approved.add(item);
          }
        }
        // 2. Markdown Table Rows: "| Service | Description |"
        else if (line.startsWith("|") && line.endsWith("|")) {
          // Skip divider rows (e.g. |---|---| or |:---|:---|)
          if (/^\|[\s\-:|]+\|$/.test(line)) continue;

          const cells = line.split("|").map(c => c.trim()).filter(Boolean);
          if (cells.length === 0) continue;

          // Skip header row if all cells are standard column headers
          const headerPattern = /^(service|services|category|capability|capabilities|feature|features|description|scope|status|type)$/i;
          if (cells.some(c => headerPattern.test(c)) && cells.every(c => c.length < 35)) {
            continue;
          }

          // Non-header row: find substantive service name
          const serviceCell = cells.find(c => c.length > 2 && !headerPattern.test(c));
          if (serviceCell) {
            let item = serviceCell.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").trim();
            // Remove bold/italics
            item = item.replace(/[*_~`]/g, "").trim();
            if (item) {
              if (isExcluded) excluded.add(item);
              else approved.add(item);
            }
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
   * Supports bare URLs, markdown links [Label](URL), and markdown tables.
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

    const lines = content.split("\n");
    let currentScope = "FOUNDER"; // FOUNDER or COMPANY
    let currentSubHeading = "";

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      if (line.startsWith("# ") || line.startsWith("## ")) {
        const hUpper = line.toUpperCase();
        if (hUpper.includes("COMPANY")) currentScope = "COMPANY";
        else if (hUpper.includes("FOUNDER")) currentScope = "FOUNDER";
      } else if (line.startsWith("### ")) {
        currentSubHeading = line.slice(4).trim().toLowerCase();
      }

      // Check if line contains a URL (bare URL, markdown link [Text](URL), bullet item, or table cell)
      const urlMatch = line.match(/https?:\/\/[^\s)\],|]+/i);
      if (urlMatch) {
        const url = urlMatch[0].trim();
        const contextLine = `${currentSubHeading} ${line}`.toLowerCase();

        if (currentScope === "FOUNDER") {
          if (contextLine.includes("github") && !profiles.founder.github) profiles.founder.github = url;
          else if (contextLine.includes("linkedin") && !profiles.founder.linkedin) profiles.founder.linkedin = url;
          else if (contextLine.includes("instagram") && !profiles.founder.instagram) profiles.founder.instagram = url;
          else if (contextLine.includes("facebook") && !profiles.founder.facebook) profiles.founder.facebook = url;
        } else if (currentScope === "COMPANY") {
          if (contextLine.includes("pixelgo") && !profiles.company.pixelgo) profiles.company.pixelgo = url;
          else if ((contextLine.includes("website") || contextLine.includes("site") || contextLine.includes("codeair.tech")) && !profiles.company.website) {
            profiles.company.website = url.includes("codeair.tech") && !url.includes("www.")
              ? url.replace("codeair.tech", "www.codeair.tech")
              : url;
          }
          else if (contextLine.includes("linkedin") && !profiles.company.linkedin) profiles.company.linkedin = url;
          else if (contextLine.includes("instagram") && !profiles.company.instagram) profiles.company.instagram = url;
          else if (contextLine.includes("facebook") && !profiles.company.facebook) profiles.company.facebook = url;
        }
        currentSubHeading = "";
      }
    }

    // Canonical normalization if www was omitted or heading had slight naming difference
    if (!profiles.company.website || !profiles.company.website.includes("www.")) {
      const m = content.match(/https?:\/\/(www\.)codeair\.tech[^\s)\],|]*/i);
      if (m) profiles.company.website = m[0];
      else if (profiles.company.website) {
        profiles.company.website = profiles.company.website.replace("codeair.tech", "www.codeair.tech");
      }
    }
    if (!profiles.company.pixelgo) {
      const m = content.match(/https?:\/\/(www\.)?pixelgo\.live[^\s)\],|]*/i);
      if (m) profiles.company.pixelgo = m[0];
    }
    if (!profiles.founder.linkedin) {
      const m = content.match(/https?:\/\/(www\.)?linkedin\.com\/in\/sunmughan[^\s)\],|]*/i);
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

    // Check specific platform mentions with strict word boundaries
    const isCompanyExplicit = /\b(codeair|company|agency|team)\b/i.test(text);

    if (/\b(github|repo|repositories|repository|\bgit\b)\b/i.test(text)) {
      return {
        target: "FOUNDER",
        platform: "github",
        url: profiles.founder.github
      };
    }

    if (/\blinkedin\b/i.test(text)) {
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

    if (/\b(instagram|insta)\b/i.test(text)) {
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

    if (/\b(facebook|fb)\b/i.test(text)) {
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

    if (/\b(website|portfolio)\b/i.test(text) || (/\bsite\b/i.test(text) && /\b(link|url|your|web|visit)\b/i.test(text))) {
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
