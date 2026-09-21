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

  loadKnowledge(force = true) {
    return this.loadAll(force);
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
    if (fileName === "founder.md") {
      return this.parseFounderMarkdown(content);
    }
    if (fileName === "company.md") {
      return this.parseCompanyMarkdown(content);
    }
    if (fileName === "pillars.md") {
      return this.parsePillarsMarkdown(content);
    }
    if (fileName === "search-queries.md") {
      return this.parseSearchQueriesMarkdown(content);
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
      const isExcluded = heading.includes("EXCLUSION") || heading.includes("EXCLUDED") || heading.includes("NOT A ") || heading.includes("OUT OF SCOPE") || heading.includes("DO NOT PROVIDE") || heading.includes("EXCLUDE");

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
        name: "",
        role: "",
        github: "",
        facebook: "",
        instagram: "",
        linkedin: "",
        whatsapp: "",
        threadsUsername: ""
      },
      company: {
        name: "",
        website: "",
        pixelgo: "",
        whatsapp: "",
        facebook: "",
        instagram: "",
        linkedin: ""
      }
    };

    const lines = content.split("\n");
    let currentScope = "FOUNDER";
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

      // Dynamic Founder Name / Role parsing (supports bullet points, bolding, and key-values)
      const itemLine = line.replace(/^[*-]\s*/, "").replace(/\*\*/g, "");
      if (currentScope === "FOUNDER") {
        if (/^name:\s*/i.test(itemLine)) {
          const val = itemLine.replace(/^name:\s*/i, "").trim();
          if (val) profiles.founder.name = val;
          else if (i + 1 < lines.length && lines[i + 1].trim() && !lines[i + 1].startsWith("#")) {
            profiles.founder.name = lines[++i].trim();
          }
        } else if (/^role:\s*/i.test(itemLine)) {
          const val = itemLine.replace(/^role:\s*/i, "").trim();
          if (val) profiles.founder.role = val;
          else if (i + 1 < lines.length && lines[i + 1].trim() && !lines[i + 1].startsWith("#")) {
            profiles.founder.role = lines[++i].trim();
          }
        }
      } else if (currentScope === "COMPANY") {
        if (/^(?:company\s+)?name:\s*/i.test(itemLine)) {
          const val = itemLine.replace(/^(?:company\s+)?name:\s*/i, "").trim();
          if (val) profiles.company.name = val;
        } else if (/^(?:company\s+)?website:\s*/i.test(itemLine)) {
          const urlInLine = itemLine.match(/https?:\/\/[^\s)\],|]+/i);
          if (urlInLine && !profiles.company.website) {
            profiles.company.website = urlInLine[0].trim();
          }
        }
      }

      // Check if line contains a URL (bare URL, markdown link [Text](URL), bullet item, or table cell)
      const urlMatch = line.match(/https?:\/\/[^\s)\],|]+/i);
      if (urlMatch) {
        const url = urlMatch[0].trim();
        const contextLine = `${currentSubHeading} ${line}`.toLowerCase();

        if (currentScope === "FOUNDER") {
          if (contextLine.includes("github") && !profiles.founder.github) profiles.founder.github = url;
          else if (contextLine.includes("linkedin") && !profiles.founder.linkedin) profiles.founder.linkedin = url;
          else if ((contextLine.includes("whatsapp") || url.includes("wa.me") || url.includes("whatsapp.com")) && !profiles.founder.whatsapp) profiles.founder.whatsapp = url;
          else if (contextLine.includes("instagram") && !profiles.founder.instagram) profiles.founder.instagram = url;
          else if (contextLine.includes("facebook") && !profiles.founder.facebook) profiles.founder.facebook = url;
          else if ((contextLine.includes("threads") || url.includes("threads.com") || url.includes("threads.net")) && !profiles.founder.threadsUsername) {
            const m = url.match(/@([a-zA-Z0-9._-]+)/);
            if (m) profiles.founder.threadsUsername = m[1];
          }
        } else if (currentScope === "COMPANY") {
          if ((contextLine.includes("pixelgo") || contextLine.includes("product") || contextLine.includes("flagship") || contextLine.includes("demo")) && !profiles.company.pixelgo) {
            profiles.company.pixelgo = url;
          }
          else if ((contextLine.includes("whatsapp") || url.includes("wa.me") || url.includes("whatsapp.com")) && !profiles.company.whatsapp) {
            profiles.company.whatsapp = url;
          }
          else if ((contextLine.includes("website") || contextLine.includes("site") || contextLine.includes("home") || contextLine.includes("domain")) && !profiles.company.website) {
            profiles.company.website = url;
          }
          else if (contextLine.includes("linkedin") && !profiles.company.linkedin) profiles.company.linkedin = url;
          else if (contextLine.includes("instagram") && !profiles.company.instagram) profiles.company.instagram = url;
          else if (contextLine.includes("facebook") && !profiles.company.facebook) profiles.company.facebook = url;
        }
        currentSubHeading = "";
      }
    }

    // Dynamic website fallback: find any valid domain URL in company section if not explicitly labeled
    if (!profiles.company.website) {
      const allUrls = content.match(/https?:\/\/[^\s)\],|]+/gi) || [];
      const nonSocial = allUrls.find(u => !u.includes("linkedin.com") && !u.includes("github.com") && !u.includes("instagram.com") && !u.includes("facebook.com"));
      if (nonSocial) profiles.company.website = nonSocial;
    }

    // Dynamic founder linkedin fallback
    if (!profiles.founder.linkedin) {
      const allUrls = content.match(/https?:\/\/(?:www\.)?linkedin\.com\/in\/[^\s)\],|]+/gi) || [];
      if (allUrls[0]) profiles.founder.linkedin = allUrls[0];
    }

    return profiles;
  }

  /**
   * Dynamically parses founder.md into structured founder profile information.
   */
  parseFounderMarkdown(content) {
    if (!content) return {};
    const info = { name: "", role: "", location: "", bio: "", threadsUsername: "" };
    const nameM = content.match(/^(?:##\s*Name|\*?\*?Name\*?\*?):\s*([^\n]+)/im) ||
                  content.match(/^(?:##\s*Name|\*?\*?Name\*?\*?)\s*\n+([^\n#]+)/im);
    if (nameM && nameM[1].trim() && !/^(role:|location:|linkedin:|threads:|##)/i.test(nameM[1].trim())) {
      info.name = nameM[1].trim();
    }

    const roleM = content.match(/^(?:##\s*Role|\*?\*?Role\*?\*?):\s*([^\n]+)/im) ||
                  content.match(/^(?:##\s*Role|\*?\*?Role\*?\*?)\s*\n+([^\n#]+)/im);
    if (roleM && roleM[1].trim() && !/^(##|location:|linkedin:|threads:)/i.test(roleM[1].trim())) {
      info.role = roleM[1].trim();
    }

    const locM = content.match(/^Location:\s*([^\n]+)/im);
    if (locM && locM[1].trim()) info.location = locM[1].trim();

    const threadsM = content.match(/threads\.(?:net|com)\/@([a-zA-Z0-9._-]+)/i) || content.match(/@([a-zA-Z0-9._-]+)/);
    if (threadsM) info.threadsUsername = threadsM[1].trim();

    return info;
  }

  /**
   * Dynamically parses company.md into structured company profile information.
   */
  parseCompanyMarkdown(content) {
    if (!content) return {};
    const info = { name: "", website: "", type: "", flagship: "", description: "" };
    const nameM = content.match(/^(?:##\s*Name|\*?\*?Company\s+Name\*?\*?|\*?\*?Name\*?\*?):\s*([^\n]+)/im) ||
                  content.match(/^(?:##\s*Name|\*?\*?Company\s+Name\*?\*?|\*?\*?Name\*?\*?)\s*\n+([^\n#]+)/im) ||
                  content.match(/^#\s+([^\n]+)/m);
    if (nameM && nameM[1].trim() && !/^(##|website:|product:)/i.test(nameM[1].trim())) {
      info.name = nameM[1].trim();
    }

    const webM = content.match(/^(?:##\s*Website|\*?\*?Company\s+Website\*?\*?|\*?\*?Website\*?\*?):\s*([^\n]+)/im) ||
                 content.match(/^(?:##\s*Website|\*?\*?Company\s+Website\*?\*?|\*?\*?Website\*?\*?)\s*\n+([^\n#]+)/im);
    if (webM && webM[1].trim() && !/^(##|product:)/i.test(webM[1].trim())) {
      info.website = webM[1].trim();
    }

    const typeM = content.match(/^Company Type:\s*([^\n]+)/im);
    if (typeM && typeM[1].trim()) info.type = typeM[1].trim();

    const prodM = content.match(/^(?:Flagship Products?|##\s*Product|\*?\*?Product\*?\*?):\s*([^\n]+)/im);
    if (prodM && prodM[1].trim()) info.flagship = prodM[1].trim();

    return info;
  }

  /**
   * Dynamically parses pillars.md into 5 content pillars for automated social posting.
   */
  parsePillarsMarkdown(content) {
    if (!content) return [];
    const pillars = [];
    const regex = /##\s+Pillar\s+\d+:\s*([^\n]+)([\s\S]*?)(?=(?:##\s+Pillar\s+\d+:|$))/gi;
    let match;
    while ((match = regex.exec(content)) !== null) {
      const id = match[1].trim();
      const body = match[2];
      const titleM = body.match(/- \*\*Title\*\*:\s*([^\n]+)/i);
      const badgeM = body.match(/- \*\*Badge\*\*:\s*([^\n]+)/i);
      const focusM = body.match(/- \*\*Focus\*\*:\s*([^\n]+)/i);
      const audM = body.match(/- \*\*Audience\*\*:\s*([^\n]+)/i);
      const refM = body.match(/- \*\*Reference URL\*\*:\s*(https?:\/\/[^\s]+)/i);

      pillars.push({
        id,
        title: titleM ? titleM[1].trim() : id,
        badge: badgeM ? badgeM[1].trim() : id.toUpperCase(),
        focus: focusM ? focusM[1].trim() : "",
        audience: audM ? audM[1].trim() : "",
        referenceUrl: refM ? refM[1].trim() : ""
      });
    }
    return pillars;
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
    return this.parseProfilesMarkdown(this.getRaw("profiles.md"));
  }

  getFounderInfo() {
    this.loadAll();
    const profiles = this.getOfficialProfiles();
    const founderEntry = this.cache.get("founder.md");
    const founderParsed = (founderEntry && founderEntry.parsed) || {};

    const name = founderParsed.name || profiles.founder.name || "Founder & Lead Architect";
    const role = founderParsed.role || profiles.founder.role || "Technical Architect & Builder";
    const threadsUsername = founderParsed.threadsUsername || profiles.founder.threadsUsername || CONFIG.THREADS_USERNAME || "user";

    return {
      name,
      role,
      location: founderParsed.location || "Global",
      linkedin: profiles.founder.linkedin || "",
      github: profiles.founder.github || "",
      instagram: profiles.founder.instagram || "",
      facebook: profiles.founder.facebook || "",
      whatsapp: profiles.founder.whatsapp || "",
      threadsUsername,
      primaryProfileUrl: profiles.founder.linkedin || profiles.founder.github || profiles.founder.instagram || ""
    };
  }

  getCompanyInfo() {
    this.loadAll();
    const profiles = this.getOfficialProfiles();
    const companyEntry = this.cache.get("company.md");
    const companyParsed = (companyEntry && companyEntry.parsed) || {};

    const name = companyParsed.name || profiles.company.name || "Software Solutions";
    const shortName = name.split(/\s+/)[0] || "Company";
    const badgeName = shortName.toUpperCase();
    const website = profiles.company.website || (companyParsed.website ? (companyParsed.website.startsWith("http") ? companyParsed.website : `https://${companyParsed.website}`) : "");
    const productUrl = profiles.company.pixelgo || "";
    const whatsapp = profiles.company.whatsapp || profiles.founder.whatsapp || "";
    const description = companyParsed.type || "Custom software development, web platforms, and automated cloud systems.";

    return {
      name,
      shortName,
      badgeName,
      website,
      productUrl,
      whatsapp,
      summary: description,
      description,
      flagship: companyParsed.flagship || "",
      flagshipProduct: companyParsed.flagship ? companyParsed.flagship.split("(")[0].trim() : "PixelGo HMS",
      linkedin: profiles.company.linkedin || "",
      instagram: profiles.company.instagram || "",
      facebook: profiles.company.facebook || ""
    };
  }

  getWhatsAppUrl() {
    this.loadAll();
    const profiles = this.getOfficialProfiles();
    return profiles.company?.whatsapp || profiles.founder?.whatsapp || "";
  }

  /**
   * Dynamically resolves the open-source meta-automation GitHub repository URL.
   * Reads from pillars.md referenceUrl for the meta_automation pillar.
   * Falls back to the founder's GitHub profile if not found in pillars.
   */
  getMetaAutomationUrl() {
    this.loadAll();
    const pillars = this.getContentPillars();
    const metaPillar = pillars.find(p => p.id === "meta_automation" || p.id === "meta-automation");
    if (metaPillar && metaPillar.referenceUrl) return metaPillar.referenceUrl;
    const profiles = this.getOfficialProfiles();
    // Try to find the meta-automation specific URL from profiles
    const raw = this.getRaw("profiles.md");
    const repoMatch = raw.match(/https?:\/\/github\.com\/[^\s]+\/meta-automation/i);
    if (repoMatch) return repoMatch[0];
    return profiles.founder?.github || "";
  }

  getContentPillars() {
    this.loadAll();
    const entry = this.cache.get("pillars.md");
    if (entry && entry.parsed && Array.isArray(entry.parsed) && entry.parsed.length > 0) {
      return entry.parsed;
    }
    return [
      { id: "pixelgo_hms", title: "Hospitality Tech & PMS Operations", badge: "HOSPITALITY TECH", focus: "Hotel & PMS tech operations, guest experience" },
      { id: "builder_network", title: "Engineering Collaboration", badge: "BUILDER NETWORK", focus: "Full-stack software engineering, real client deliverables" },
      { id: "founders_revolution", title: "Startup Lessons & SaaS Architecture", badge: "FOUNDER MINDSET", focus: "Hard lessons for SaaS founders, building simple before scaling" },
      { id: "tech_mentorship", title: "Systems Architecture", badge: "ARCHITECTURE", focus: "Clean database design, resilient state management" },
      { id: "agentic_ai", title: "Practical Agentic AI", badge: "AGENTIC AI", focus: "Practical AI workflows and enterprise automation" }
    ];
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
    const company = this.getCompanyInfo();

    // Check if user requested ALL profiles
    if (
      (text.includes("all") || text.includes("every")) &&
      (text.includes("profile") || text.includes("social") || text.includes("link"))
    ) {
      const compWord = (company.shortName || "company").toLowerCase();
      if (text.includes(compWord) || text.includes("company") || text.includes("agency")) {
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

    // Check specific platform mentions with dynamic company name matching
    const compWord = (company.shortName || "company").toLowerCase();
    const isCompanyExplicit = new RegExp(`\\b(${compWord}|company|agency|team)\\b`, "i").test(text);

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

    // Hospitality & Hotel Systems reference request (PixelGo HMS / Flagship product)
    if (
      /\b(pixelgo|hms|hotel|hospitality|resort|restaurant)\b/i.test(text) &&
      /\b(link|website|site|demo|reference|system|app|software|url|portfolio)\b/i.test(text)
    ) {
      const pUrl = profiles.company.pixelgo || company.productUrl || "";
      if (!pUrl) return null;
      return {
        target: "COMPANY",
        platform: "pixelgo",
        url: pUrl,
        text: `Product Reference: ${pUrl}`
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

  parseSearchQueriesMarkdown(content) {
    const result = {
      threads: [],
      linkedin: [],
      facebook: [],
      facebook_groups: []
    };

    let currentSection = "";
    const lines = content.split("\n");

    for (const line of lines) {
      const trimmed = line.trim();
      if (/^##\s+Threads/i.test(trimmed)) {
        currentSection = "threads";
        continue;
      } else if (/^##\s+LinkedIn/i.test(trimmed)) {
        currentSection = "linkedin";
        continue;
      } else if (/^##\s+Facebook Search/i.test(trimmed)) {
        currentSection = "facebook";
        continue;
      } else if (/^##\s+Facebook Group/i.test(trimmed)) {
        currentSection = "facebook_groups";
        continue;
      } else if (/^##/i.test(trimmed)) {
        currentSection = "";
        continue;
      }

      if (currentSection && /^[-*]\s+(.+)/.test(trimmed)) {
        const query = trimmed.replace(/^[-*]\s+/, "").trim();
        if (query) {
          result[currentSection].push(query);
        }
      }
    }

    return result;
  }

  getSearchQueries(platform = "threads") {
    this.loadAll();
    const data = this.cache.get("search-queries.md")?.parsed;
    const plat = String(platform).toLowerCase();
    if (data && Array.isArray(data[plat]) && data[plat].length > 0) {
      return data[plat];
    }
    return [];
  }

  getGroupTopics(platform = "facebook") {
    this.loadAll();
    const data = this.cache.get("search-queries.md")?.parsed;
    if (data && Array.isArray(data.facebook_groups) && data.facebook_groups.length > 0) {
      return data.facebook_groups;
    }
    return [];
  }

  isHospitalityQuery(text = "") {
    const lower = String(text || "").toLowerCase();
    return /\b(hotel|resort|hospitality|restaurant|pms|room\s+management|property\s+management\s+system|pixelgo)\b/i.test(lower);
  }
}

const knowledgeEngine = new KnowledgeEngine();
module.exports = knowledgeEngine;
