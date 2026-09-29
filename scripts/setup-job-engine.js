const fs = require("fs");
const path = require("path");
const readline = require("readline");
const CONFIG = require("../config");
const { createCandidateProfile, saveCandidateProfile } = require("../src/jobs/profile/profile-engine");

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer);
    });
  });
}

async function setEnvValue(key, value) {
  const envPath = path.join(CONFIG.ROOT_DIR, ".env");
  let content = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
  const escaped = String(value ?? "").replace(/\\/g, "\\\\").replace(/\r?\n/g, "");
  const re = new RegExp(`^${key}=.*$`, "m");
  if (re.test(content)) content = content.replace(re, () => `${key}=${escaped}`);
  else content += `\n${key}=${escaped}\n`;
  fs.writeFileSync(envPath, content.replace(/^\n+/, ""), "utf8");
}

async function askSecret(question) {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== "function") {
    return (await ask(question)).trim();
  }

  return new Promise(resolve => {
    let value = "";
    process.stdout.write(question);
    process.stdin.setRawMode(true);
    process.stdin.resume();

    const onData = chunk => {
      for (const char of chunk.toString()) {
        if (char === "\u0003") {
          process.stdin.setRawMode(false);
          process.exit(130);
        }
        if (char === "\r" || char === "\n") {
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdin.off("data", onData);
          process.stdout.write("\n");
          resolve(value);
          return;
        }
        if (char === "\u007f") {
          value = value.slice(0, -1);
          continue;
        }
        value += char;
        process.stdout.write("*");
      }
    };

    process.stdin.on("data", onData);
  });
}

async function main() {
  const envPath = path.join(CONFIG.ROOT_DIR, ".env");
  const examplePath = path.join(CONFIG.ROOT_DIR, ".env.example");

  if (!fs.existsSync(envPath) && fs.existsSync(examplePath)) {
    fs.copyFileSync(examplePath, envPath);
  }

  console.log("\n=== Meta Automation • Agentic Job Revenue Engine Setup ===\n");

  console.log("AI runtime: " + (CONFIG.AI_PROVIDER || "antigravity") + " (primary)");
  const email = (await ask(`Google account email [${CONFIG.GOOGLE_ACCOUNT_EMAIL}]: `)).trim() || CONFIG.GOOGLE_ACCOUNT_EMAIL;
  const resume = (await ask(`Base resume path [${CONFIG.JOB_BASE_RESUME_PATH || "not set"}]: `)).trim() || CONFIG.JOB_BASE_RESUME_PATH;
  const mode = (await ask(`Application mode (auto/manual) [${CONFIG.JOB_APPLICATION_MODE}]: `)).trim().toLowerCase() || CONFIG.JOB_APPLICATION_MODE;
  const minScore = (await ask(`Minimum AI match score [${CONFIG.JOB_MIN_MATCH_SCORE}]: `)).trim() || String(CONFIG.JOB_MIN_MATCH_SCORE);
  const dailyLimit = (await ask(`Maximum verified applications per 24h [${CONFIG.JOB_MAX_APPLICATIONS_PER_DAY}]: `)).trim() || String(CONFIG.JOB_MAX_APPLICATIONS_PER_DAY);

  await setEnvValue("GOOGLE_ACCOUNT_EMAIL", email);
  await setEnvValue("GOOGLE_AUTH_ORIGIN", CONFIG.GOOGLE_AUTH_ORIGIN);
  // Preserve the configured primary runtime. Antigravity is the default.
  await setEnvValue("AI_PROVIDER", "antigravity");
  await setEnvValue("AI_RUNTIME", "antigravity");
  await setEnvValue("AI_MODEL", "Gemini 3.8 Flash");
  await setEnvValue("ANTIGRAVITY_CLI_BIN", "agy");
  await setEnvValue("ANTIGRAVITY_CLI_PATH", "/data/data/com.termux/files/usr/bin/agy");
  await setEnvValue("ANTIGRAVITY_MODEL", "Gemini 3.8 Flash");
  await setEnvValue("JOB_REMOTE_ONLY", "true");
  await setEnvValue("JOB_PROJECT_ONLY", "true");
  if (resume) await setEnvValue("JOB_BASE_RESUME_PATH", resume);
  await setEnvValue("JOB_APPLICATION_MODE", mode);
  await setEnvValue("JOB_MIN_MATCH_SCORE", minScore);
  await setEnvValue("JOB_MAX_APPLICATIONS_PER_DAY", dailyLimit);
  await setEnvValue("JOB_AUTOMATION_ENABLED", "true");

  console.log("\n--- Freelancer.com Portfolio Preferences ---");
  const hasExistingPortfolio = (await ask("Have you already created an existing portfolio, GitHub profile, or personal showcase? (y/n) [y]: ")).trim().toLowerCase();
  const userHasPortfolio = !hasExistingPortfolio.startsWith("n");

  let portfolioUrl = "";
  let portfolioConsent = "auto";
  let isAiPortfolio = true;

  if (userHasPortfolio) {
    portfolioUrl = (await ask("Enter your Portfolio URL, GitHub profile, or LinkedIn URL [https://github.com/sunmughan]: ")).trim() || "https://github.com/sunmughan";
    portfolioConsent = (await ask("For Freelancer.com, do you want AI to automatically generate and sync your portfolio projects from your profile, or will you create them manually yourself? (auto/manual) [auto]: ")).trim().toLowerCase() || "auto";
    isAiPortfolio = portfolioConsent === "auto" || portfolioConsent === "yes" || portfolioConsent === "y" || portfolioConsent === "true";
  } else {
    portfolioConsent = (await ask("Do you want AI to generate and sync standard flagship portfolio projects for you on Freelancer.com? (auto/manual) [auto]: ")).trim().toLowerCase() || "auto";
    isAiPortfolio = portfolioConsent === "auto" || portfolioConsent === "yes" || portfolioConsent === "y" || portfolioConsent === "true";
  }

  let portfolioItems = [];
  if (isAiPortfolio) {
    console.log(`\n🔍 Smartly ingesting & synthesizing portfolio details from ${portfolioUrl || "flagship catalog"}...`);
    try {
      const { ingestPortfolioSmart, loadPortfolioItems } = require("../src/jobs/profile/portfolio-syncer");
      const aiRuntime = require("../src/ai/ai-runtime");
      const result = await ingestPortfolioSmart({ portfolioUrl, aiRuntime });
      portfolioItems = result.items || loadPortfolioItems();
      console.log(`✅ Successfully synthesized ${portfolioItems.length} portfolio items for Freelancer.com!`);
      if (result.userProfile) {
        console.log(`   • Author: ${result.userProfile.name} (${result.userProfile.company || "Independent"})`);
        if (result.userProfile.bio) console.log(`   • Bio: ${result.userProfile.bio}`);
      }
      for (const item of portfolioItems.slice(0, 6)) {
        console.log(`   • [${item.tag.toUpperCase()}] ${item.title}`);
      }
      if (portfolioItems.length > 6) console.log(`   • ...and ${portfolioItems.length - 6} more items.`);
    } catch (e) {
      console.warn(`Notice: Portfolio discovery encountered notice: ${e.message}`);
    }
  } else {
    console.log("✅ Understood. You chose manual portfolio creation on Freelancer.com. AI portfolio upload will be skipped.");
  }

  const profile = createCandidateProfile({
    googleAccountEmail: email,
    baseResumePath: resume,
    preferences: {
      remoteOnly: true,
      projectOnly: true,
      minMatchScore: Number(minScore),
      aiPortfolioSync: isAiPortfolio
    },
    portfolioUrl,
    portfolioItemsCount: portfolioItems.length
  });
  saveCandidateProfile(profile);

  const privateDir = path.join(CONFIG.ROOT_DIR, "private");
  fs.mkdirSync(path.join(privateDir, "job-browser-profile"), { recursive: true });
  fs.mkdirSync(path.join(CONFIG.ROOT_DIR, "job-state"), { recursive: true });
  fs.mkdirSync(CONFIG.JOB_GENERATED_DIR, { recursive: true });

  try {
    if (process.platform !== "win32") fs.chmodSync(envPath, 0o600);
  } catch (_) {}

  console.log("\nSetup saved locally.");
  console.log(`Candidate profile: ${CONFIG.JOB_PROFILE_PATH}`);
  console.log(`Base resume: ${resume || "NOT SET"}`);
  console.log("Next: npm run jobs:google");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
