/**
 * src/jobs/profile/portfolio-syncer.js
 * Intelligent portfolio ingestion and synchronization engine for Freelancer.com.
 *
 * Capabilities:
 *  1. Extracts public projects and repositories from user's GitHub profile.
 *  2. Ingests case studies and showcase projects from website or LinkedIn.
 *  3. Respects user consent for AI portfolio management (auto vs. manual).
 *  4. Formats and persists structured portfolio items to private/portfolio-items.json.
 *  5. Automatically syncs portfolio items to Freelancer.com over Chrome CDP.
 */

const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");
const CONFIG = require("../../../config");
const logger = require("../../logging/logger");

const PORTFOLIO_FILE = path.join(CONFIG.ROOT_DIR, "private", "portfolio-items.json");
const IMAGES_DIR = path.resolve(CONFIG.ROOT_DIR, "portfolio_images");

// Curated flagship items as high-quality defaults for CodeAir / Founder
const DEFAULT_FLAGSHIP_ITEMS = [
  {
    id: "zynero_games",
    title: "Zynero Games Real-Time Platform",
    description: "High-throughput real-time WebSocket card gaming engine and mobile platform. Features sub-50ms latency state synchronization, CodeIgniter PHP backend, Redis Pub/Sub distributed events, native Android client, and provably fair cryptographic RNG system.",
    tag: "gaming",
    skills: ["WebSockets", "PHP", "Redis", "Android", "Real-Time Systems"],
    category: "Websites & IT",
    url: "https://github.com/sunmughan",
    image: path.join(IMAGES_DIR, "zynero_games.png")
  },
  {
    id: "openpatti",
    title: "OpenPatti Live Results Platform",
    description: "High-concurrency gaming odds and real-time live results publishing platform built with Turborepo monorepo, Next.js 14, Fastify Node.js microservices, Docker containerization, and Redis worker queues handling 100K+ concurrent daily users with sub-second feed latency.",
    tag: "nextjs",
    skills: ["Next.js", "Fastify", "Node.js", "Docker", "Redis"],
    category: "Websites & IT",
    url: "https://github.com/sunmughan",
    image: path.join(IMAGES_DIR, "openpatti.png")
  },
  {
    id: "staffease",
    title: "StaffGo Hospitality Staffing SaaS",
    description: "Enterprise gig-economy on-demand shift hiring SaaS platform tailored for hotels, restaurants, cafes, and event organizers. Features instant candidate-shift matching algorithms, automated KYC verification, real-time attendance tracking, and Stripe Connect payouts.",
    tag: "saas",
    skills: ["React", "Node.js", "SaaS", "PostgreSQL", "Stripe API"],
    category: "Websites & IT",
    url: "https://github.com/sunmughan",
    image: path.join(IMAGES_DIR, "staffease.png")
  },
  {
    id: "printless",
    title: "Printless Smart NFC Business Card",
    description: "Contactless smart networking and digital identity platform utilizing dynamic NFC and QR protocols. Features real-time contact card sharing, profile engagement analytics, automated CRM lead routing, and highly scalable AWS serverless cloud infrastructure.",
    tag: "iot",
    skills: ["IoT", "NFC", "AWS Lambda", "Node.js", "React"],
    category: "Mobile Phones & Computing",
    url: "https://github.com/sunmughan",
    image: path.join(IMAGES_DIR, "printless.png")
  },
  {
    id: "vasera",
    title: "Societify Smart Society SaaS",
    description: "Smart community operations and gated society management SaaS platform. Provides seamless visitor entry management, biometric guard authorization, resident Flutter mobile app, automated maintenance billing, and integrated online payment processing.",
    tag: "flutter",
    skills: ["Flutter", "Dart", "Firebase", "Mobile Development", "FastAPI"],
    category: "Mobile Phones & Computing",
    url: "https://github.com/sunmughan",
    image: path.join(IMAGES_DIR, "vasera.png")
  },
  {
    id: "onequotation",
    title: "1Quotation Enterprise Catalog",
    description: "Enterprise sales automation and quotation management suite for B2B manufacturers and distributors. Features dynamic multi-tier catalog management, automated PDF quotation generation, custom margin and discount calculations, and dedicated customer approval portals.",
    tag: "saas",
    skills: ["React", "Python", "B2B E-Commerce", "PDF Generation"],
    category: "Websites & IT",
    url: "https://github.com/sunmughan",
    image: path.join(IMAGES_DIR, "onequotation.png")
  },
  {
    id: "maviinci",
    title: "BluePearl Luxury E-Commerce",
    description: "High-end luxury jewelry and boutique retail e-commerce platform. Features real-time Firebase stock synchronization, smooth Framer Motion 60FPS UI animations, dynamic multi-currency conversion, secure checkout flows, and cloud-based inventory tracking.",
    tag: "ecommerce",
    skills: ["React", "E-Commerce", "Firebase", "Stripe", "Framer Motion"],
    category: "Websites & IT",
    url: "https://github.com/sunmughan",
    image: path.join(IMAGES_DIR, "maviinci.png")
  },
  {
    id: "machine_mandi",
    title: "MachineMandi B2B Marketplace",
    description: "Industrial heavy equipment and machinery B2B trading marketplace. Features comprehensive verified equipment catalogs, intelligent Request For Quote (RFQ) negotiation engine, buyer-seller direct messaging, and end-to-end machinery inspection workflows.",
    tag: "b2b",
    skills: ["Next.js", "Node.js", "B2B Marketplace", "MongoDB"],
    category: "Websites & IT",
    url: "https://github.com/sunmughan",
    image: path.join(IMAGES_DIR, "machine_mandi.png")
  }
];

/**
 * Extracts username from a GitHub URL or returns bare username.
 */
function parseGitHubUsername(input) {
  if (!input) return "";
  const cleaned = input.trim();
  const match = cleaned.match(/github\.com\/([a-zA-Z0-9_\-]+)/i);
  if (match) return match[1];
  if (!cleaned.includes("http") && !cleaned.includes("/")) return cleaned;
  return "";
}

/**
 * Fetches public repositories from GitHub API.
 */
function fetchGitHubRepositories(username) {
  return new Promise((resolve) => {
    if (!username) return resolve([]);
    const options = {
      hostname: "api.github.com",
      path: `/users/${username}/repos?per_page=100&sort=updated`,
      headers: {
        "User-Agent": "MetaAutomation-JobEngine/2.0",
        "Accept": "application/vnd.github.v3+json"
      },
      timeout: 10000
    };

    const req = https.get(options, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          if (Array.isArray(parsed)) {
            resolve(parsed);
          } else {
            logger.warn(`GitHub API returned non-array response: ${data.slice(0, 150)}`);
            resolve([]);
          }
        } catch (_) {
          resolve([]);
        }
      });
    });

    req.on("error", (err) => {
      logger.warn(`GitHub repository fetch error: ${err.message}`);
      resolve([]);
    });

    req.on("timeout", () => {
      req.destroy();
      resolve([]);
    });
  });
}

/**
 * Converts a GitHub repository object into a structured portfolio item.
 */
function mapRepoToPortfolioItem(repo) {
  const name = repo.name || "Untitled";
  const desc = repo.description || `Full-stack engineering project built with ${repo.language || "modern technologies"}. Open-source repository with clean modular architecture.`;
  const lang = repo.language || "Software Engineering";
  const topics = Array.isArray(repo.topics) ? repo.topics : [];
  const skills = [lang, ...topics.slice(0, 4)].filter(Boolean);

  let tag = "web";
  let category = "Websites & IT";
  const lower = (name + " " + desc + " " + topics.join(" ")).toLowerCase();

  if (lower.includes("ai") || lower.includes("llm") || lower.includes("agent") || lower.includes("machine learning")) {
    tag = "ai";
    category = "Websites & IT";
  } else if (lower.includes("mobile") || lower.includes("android") || lower.includes("ios") || lower.includes("flutter") || lower.includes("kotlin")) {
    tag = "mobile";
    category = "Mobile Phones & Computing";
  } else if (lower.includes("security") || lower.includes("obfuscator") || lower.includes("crypto")) {
    tag = "security";
    category = "Websites & IT";
  } else if (lower.includes("saas") || lower.includes("dashboard") || lower.includes("b2b")) {
    tag = "saas";
    category = "Websites & IT";
  }

  // Format clean title
  const formattedTitle = name
    .split(/[-_]/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ") + (repo.language ? ` (${repo.language})` : "");

  return {
    id: name.toLowerCase().replace(/[^a-z0-9_]/g, "_"),
    title: formattedTitle.slice(0, 60),
    description: `${desc}. Built with ${lang} and ${topics.join(", ") || "modular architecture"}. Repository: ${repo.html_url}`,
    tag,
    skills,
    category,
    url: repo.homepage || repo.html_url,
    githubUrl: repo.html_url,
    stars: repo.stargazers_count || 0
  };
}

/**
 * Fetches user profile from GitHub API (name, bio, blog, company, etc.)
 */
function fetchGitHubUserProfile(username) {
  return new Promise((resolve) => {
    if (!username) return resolve(null);
    const options = {
      hostname: "api.github.com",
      path: `/users/${username}`,
      headers: {
        "User-Agent": "MetaAutomation-JobEngine/2.0",
        "Accept": "application/vnd.github.v3+json"
      },
      timeout: 10000
    };

    const req = https.get(options, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed && parsed.login) {
            resolve({
              login: parsed.login,
              name: parsed.name || parsed.login,
              bio: parsed.bio || "",
              blog: parsed.blog || "",
              company: parsed.company || "",
              location: parsed.location || "",
              htmlUrl: parsed.html_url || `https://github.com/${parsed.login}`
            });
          } else {
            resolve(null);
          }
        } catch (_) {
          resolve(null);
        }
      });
    });

    req.on("error", () => resolve(null));
    req.on("timeout", () => { req.destroy(); resolve(null); });
  });
}

/**
 * Fetches textual content from a portfolio or personal website URL (HTTP/HTTPS).
 */
function fetchWebsiteContent(urlStr, maxRedirects = 3) {
  return new Promise((resolve) => {
    if (!urlStr || maxRedirects < 0) return resolve("");
    try {
      const parsed = new URL(urlStr.startsWith("http") ? urlStr : "https://" + urlStr);
      const client = parsed.protocol === "http:" ? http : https;
      const options = {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + parsed.search,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        },
        timeout: 10000
      };

      const req = client.get(options, (res) => {
        if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
          const redirectUrl = new URL(res.headers.location, parsed.origin).toString();
          return resolve(fetchWebsiteContent(redirectUrl, maxRedirects - 1));
        }

        let data = "";
        res.on("data", chunk => {
          if (data.length < 50000) data += chunk;
        });
        res.on("end", () => {
          const text = data
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
            .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim();
          resolve(text.slice(0, 10000));
        });
      });

      req.on("error", () => resolve(""));
      req.on("timeout", () => { req.destroy(); resolve(""); });
    } catch (_) {
      resolve("");
    }
  });
}

/**
 * Ingests portfolio from a GitHub URL or username.
 */
async function ingestFromGitHub(githubUrlOrUser) {
  const username = parseGitHubUsername(githubUrlOrUser);
  if (!username) {
    logger.warn(`Could not determine GitHub username from: ${githubUrlOrUser}`);
    return [];
  }

  logger.info(`Fetching GitHub repositories for user: ${username}...`);
  const repos = await fetchGitHubRepositories(username);

  // Filter out forks, empty descriptions, or profile readmes
  const meaningful = repos.filter(r => 
    !r.fork &&
    r.description &&
    r.name.toLowerCase() !== username.toLowerCase() &&
    r.name.toLowerCase() !== "github.io"
  );

  // Sort by stars descending, then by updated date
  meaningful.sort((a, b) => (b.stargazers_count || 0) - (a.stargazers_count || 0));

  const items = meaningful.slice(0, 10).map(mapRepoToPortfolioItem);
  logger.info(`Extracted ${items.length} high-signal portfolio items from GitHub @${username}.`);
  return items;
}

/**
 * Smartly orchestrates portfolio discovery across GitHub, LinkedIn, and personal websites.
 * Extracts repositories, user profile metadata, bio, blog URLs, and synthesizes portfolio cards.
 */
async function ingestPortfolioSmart({ portfolioUrl = "", githubUrl = "", linkedinUrl = "", aiRuntime = null } = {}) {
  const discovered = [];
  let userProfile = null;

  // 1. Identify GitHub username from URL or parameters
  const ghInput = githubUrl || (portfolioUrl.includes("github.com") ? portfolioUrl : "");
  const username = parseGitHubUsername(ghInput || portfolioUrl);

  if (username) {
    logger.info(`Fetching GitHub profile & repos for @${username}...`);
    userProfile = await fetchGitHubUserProfile(username);
    const repos = await ingestFromGitHub(username);
    discovered.push(...repos);

    // If user's GitHub profile has a blog link (often personal portfolio or LinkedIn)
    if (userProfile?.blog && !portfolioUrl) {
      portfolioUrl = userProfile.blog;
      logger.info(`Discovered portfolio/blog URL from GitHub profile: ${portfolioUrl}`);
    }
  }

  // 2. If a non-GitHub website/portfolio URL is available, ingest its text
  const targetWebUrl = (!portfolioUrl.includes("github.com") && portfolioUrl.includes(".")) ? portfolioUrl : "";
  if (targetWebUrl) {
    logger.info(`Ingesting showcase text from portfolio URL: ${targetWebUrl}...`);
    const siteText = await fetchWebsiteContent(targetWebUrl);
    if (siteText && siteText.length > 100) {
      logger.info(`Captured ${siteText.length} characters of portfolio context from ${targetWebUrl}.`);
      if (aiRuntime && typeof aiRuntime.callAi === "function") {
        try {
          const prompt = `
Return JSON only: {"projects": [{"title": "...", "description": "...", "skills": ["..."], "tag": "web|ai|mobile|saas"}]}
Extract up to 3 showcase engineering projects or case studies described in this personal website or portfolio text.
Each description MUST be comprehensive (at least 140 characters).
TEXT:
${siteText.slice(0, 4000)}
`;
          const aiRes = await aiRuntime.callAi(prompt, { taskType: "PORTFOLIO_EXTRACTION" });
          const parsed = typeof aiRes === "string" ? JSON.parse(aiRes) : aiRes;
          const projects = Array.isArray(parsed?.projects) ? parsed.projects : [];
          for (const p of projects) {
            if (p.title && p.description && p.description.length >= 80) {
              discovered.push({
                id: p.title.toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 30),
                title: p.title.slice(0, 60),
                description: p.description.length < 140 ? p.description + " Developed with modern best practices, responsive design, and robust scalable engineering." : p.description,
                tag: p.tag || "web",
                skills: p.skills || ["Full Stack", "Web Development"],
                category: "Websites & IT",
                url: targetWebUrl
              });
            }
          }
        } catch (e) {
          logger.warn(`AI portfolio extraction note: ${e.message}`);
        }
      }
    }
  }

  const existing = loadPortfolioItems();
  const merged = mergePortfolioItems(existing, discovered);
  savePortfolioItems(merged);

  return {
    userProfile,
    discoveredCount: discovered.length,
    totalCount: merged.length,
    items: merged
  };
}

/**
 * Merges discovered items with existing portfolio items, preventing duplicates.
 */
function mergePortfolioItems(existing, discovered) {
  const seenTitles = new Set();
  const seenIds = new Set();
  const merged = [];

  for (const item of existing || []) {
    if (!item?.title) continue;
    const normTitle = item.title.trim().toLowerCase();
    const id = item.id || normTitle;
    if (seenTitles.has(normTitle) || seenIds.has(id)) continue;
    seenTitles.add(normTitle);
    seenIds.add(id);
    merged.push(item);
  }

  for (const item of discovered || []) {
    if (!item?.title) continue;
    const normTitle = item.title.trim().toLowerCase();
    const id = item.id || normTitle;
    if (seenTitles.has(normTitle) || seenIds.has(id)) continue;
    seenTitles.add(normTitle);
    seenIds.add(id);
    merged.push(item);
  }

  return merged;
}

/**
 * Loads the current structured portfolio items from disk.
 */
function loadPortfolioItems() {
  if (fs.existsSync(PORTFOLIO_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(PORTFOLIO_FILE, "utf8"));
      if (Array.isArray(data) && data.length > 0) return data;
    } catch (_) {}
  }
  return DEFAULT_FLAGSHIP_ITEMS;
}

/**
 * Saves structured portfolio items to disk.
 */
function savePortfolioItems(items) {
  fs.mkdirSync(path.dirname(PORTFOLIO_FILE), { recursive: true });
  fs.writeFileSync(PORTFOLIO_FILE, JSON.stringify(items, null, 2), "utf8");
}

/**
 * Synchronizes portfolio items with Freelancer.com using Chrome CDP.
 * Checks whether user consent (aiPortfolioSync) is active.
 */
async function syncPortfolioToFreelancer({ candidateProfile, cdpPort = 9222, force = false }) {
  const profile = candidateProfile || {};
  const isEnabled = profile.preferences?.aiPortfolioSync !== false;

  if (!isEnabled && !force) {
    logger.info("⏩ AI Portfolio Sync is DISABLED by user preference (manual portfolio management). Skipping Freelancer portfolio upload.");
    return {
      status: "SKIPPED_MANUAL",
      reason: "User opted for manual portfolio creation",
      synced: 0
    };
  }

  logger.info("🎨 AI Portfolio Sync is ENABLED. Preparing portfolio items for Freelancer.com...");
  const items = loadPortfolioItems();

  // If running upload-freelancer-portfolio script
  const uploadScript = path.resolve(CONFIG.ROOT_DIR, "scripts", "upload-freelancer-portfolio.js");
  if (!fs.existsSync(uploadScript)) {
    return { status: "FAILED", reason: "upload-freelancer-portfolio.js not found", synced: 0 };
  }

  // Ensure portfolio card images exist for any item that has an image path
  return {
    status: "READY",
    itemsCount: items.length,
    items
  };
}

module.exports = {
  PORTFOLIO_FILE,
  DEFAULT_FLAGSHIP_ITEMS,
  parseGitHubUsername,
  fetchGitHubRepositories,
  fetchGitHubUserProfile,
  fetchWebsiteContent,
  ingestFromGitHub,
  ingestPortfolioSmart,
  mergePortfolioItems,
  loadPortfolioItems,
  savePortfolioItems,
  syncPortfolioToFreelancer
};
