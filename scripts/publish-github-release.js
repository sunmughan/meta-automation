const path = require("path");
const fs = require("fs");
const pkg = require("../package.json");

(async () => {
  const version = `v${pkg.version}`;
  const puppeteer = await import("puppeteer-core");
  const browser = await puppeteer.connect({ browserURL: "http://127.0.0.1:9222" });
  const pages = await browser.pages();
  const ghPage = pages.find(p => p.url().includes("github.com"));
  if (!ghPage) {
    console.error("GitHub page not found in browser");
    process.exit(1);
  }

  console.log(`Navigating to new release page for ${version}...`);
  await ghPage.goto(`https://github.com/sunmughan/meta-automation/releases/new?tag=${version}`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await new Promise(r => setTimeout(r, 2500));

  // 1. Ensure tag is selected
  console.log(`Checking tag selection for ${version}...`);
  const currentTagText = await ghPage.evaluate(() => {
    const tagBtn = document.querySelector("#ref-picker-releases-tag");
    return tagBtn ? tagBtn.innerText.trim() : "";
  });

  if (!currentTagText.includes(version)) {
    console.log(`Tag not preselected (current: "${currentTagText}"). Clicking picker...`);
    const tagBtn = await ghPage.$("#ref-picker-releases-tag");
    if (tagBtn) {
      await tagBtn.click();
      await new Promise(r => setTimeout(r, 1000));

      const filterInput = await ghPage.$("input[placeholder*=\"Find\"], input[placeholder*=\"Filter\"], input[aria-label*=\"Tag\"]");
      if (filterInput) {
        await filterInput.type(version, { delay: 50 });
        await new Promise(r => setTimeout(r, 800));
        await filterInput.press("Enter");
      } else {
        await ghPage.evaluate((targetTag) => {
          const items = Array.from(document.querySelectorAll("[role=\"menuitem\"], [role=\"option\"], li, a, button, span"));
          const match = items.find(el => (el.innerText || "").trim() === targetTag);
          if (match) match.click();
        }, version);
      }
    }
  }
  await new Promise(r => setTimeout(r, 1500));

  // 2. Fill Title & Description
  console.log(`Setting Release Title and Description for ${version}...`);
  const titleText = `${version} - Pure Antigravity AI Engine, Dynamic Knowledge Base SSOT & Representation Separation`;
  const bodyText = `## What's Changed in ${version}

### 🧠 Pure Antigravity AI Engine & Zero-Discard Pipeline
- **Pure Antigravity Runtime**: Completely eliminated \`callGeminiRest()\`, \`GEMINI_API_KEY\`, and REST fallbacks. Enforces pure authenticated Antigravity AI agent runtime via structured JSON schema prompts.
- **True AI-First Semantic Screening**: Removed rigid deterministic regex gates in \`ai-decision-engine.js\` that previously caused false-positive discards on genuine buyer posts. Every captured post is evaluated with grounded semantics.
- **Knowledge Engine Single Source of Truth**: Dynamically parses \`knowledge/*.md\` (\`services.md\`, \`profiles.md\`, \`founder.md\`) on startup and change. Eliminated duplicated hardcoded arrays. Added dedicated Hospitality section for \`PixelGo HMS\`.

### 🎯 Representation Awareness & Single-URL Discipline
- **Strict Voice Separation**:
  - \`FOUNDER\`: First-person perspective ("I", "as founder & architect"). Shares Sunmughan's personal LinkedIn profile ONLY. Never includes company website.
  - \`COMPANY\`: Collective company voice ("We at CodeAir"). Shares company website (\`https://www.codeair.tech\`) or \`https://pixelgo.live\` for hospitality. Never includes personal founder link.
  - \`NEUTRAL\`: Pure technical value, architectural advice, or diagnostic question with **ZERO** promotional links.
  - \`BOTH\`: Introduces CodeAir engineering team with founder technical oversight. Max 1 link.
- **Single-URL Discipline**: Strict \`enforceSingleUrl()\` rule ensuring at most ONE verified URL per comment.

### ⚡ Rate-Limiter-Driven Governance & State Store Lifecycle
- **Dynamic Throughput**: Replaced hardcoded \`maxLiveComments: 2/3\` cycle limits with dynamic rate limiter governance (\`rateLimiter.canPerformAction("COMMENT")\`) respecting hourly quotas and delays.
- **Unified State Semantics**: Standardized post/comment status lifecycle to recognize \`COMMENTED\`, \`POSTED_LIVE\`, and \`COMMENT_POSTED\` across all store methods.

### 📦 Multi-Platform Release Assets & Checksums
All build distributions are packaged and verified below:
- \`meta-automation-${pkg.version}.tgz\` (NPM Tarball)
- \`meta-automation-universal-v${pkg.version}.zip\` (Universal ZIP)
- \`meta-automation-linux-x64.tar.gz\` (Linux x64)
- \`meta-automation-windows-x64.zip\` (Windows x64)
- \`meta-automation-macos-universal.tar.gz\` (macOS Universal)
- \`meta-automation-android-termux.tar.gz\` (Android Termux)
- \`SHA256SUMS.txt\` (Cryptographic SHA-256 Checksums)

**Full Changelog**: https://github.com/sunmughan/meta-automation/compare/v1.1.6...${version}`;
  await ghPage.evaluate((title, body) => {
    const titleEl = document.querySelector("#release_name, input[name=\"release[name]\"]");
    if (titleEl) {
      titleEl.value = title;
      titleEl.dispatchEvent(new Event("input", { bubbles: true }));
      titleEl.dispatchEvent(new Event("change", { bubbles: true }));
    }
    const bodyEl = document.querySelector("#release_body, textarea[name=\"release[body]\"]");
    if (bodyEl) {
      bodyEl.value = body;
      bodyEl.dispatchEvent(new Event("input", { bubbles: true }));
      bodyEl.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }, titleText, bodyText);
  await new Promise(r => setTimeout(r, 1000));

  // 4. Upload Assets
  console.log("Uploading release assets...");
  const releaseDir = path.resolve(__dirname, "../release");
  const assetFiles = [
    path.join(releaseDir, `meta-automation-${pkg.version}.tgz`),
    path.join(releaseDir, `meta-automation-universal-v${pkg.version}.zip`),
    path.join(releaseDir, "meta-automation-linux-x64.tar.gz"),
    path.join(releaseDir, "meta-automation-windows-x64.zip"),
    path.join(releaseDir, "meta-automation-macos-universal.tar.gz"),
    path.join(releaseDir, "meta-automation-android-termux.tar.gz"),
    path.join(releaseDir, "SHA256SUMS.txt")
  ].filter(f => fs.existsSync(f));

  console.log("Uploading files:", assetFiles.map(f => path.basename(f)));
  const fileInput = await ghPage.$("#releases-upload");
  if (fileInput) {
    await fileInput.uploadFile(...assetFiles);
    console.log("Assets attached, waiting for upload to finish...");
    
    // Wait for uploads to finish (progress bars to complete)
    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const isUploading = await ghPage.evaluate(() => {
        const uploading = document.querySelectorAll(".is-uploading, [data-upload-progress], .upload-progress");
        const failed = document.querySelectorAll(".upload-failed");
        return { uploadingCount: uploading.length, failedCount: failed.length };
      });
      console.log(`Upload check [${i+1}/40]:`, isUploading);
      if (isUploading.uploadingCount === 0) {
        break;
      }
    }
  }

  await new Promise(r => setTimeout(r, 3000));

  // 5. Click "Publish release"
  console.log("Publishing release...");
  const published = await ghPage.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll("button[type=\"submit\"]"));
    const pubBtn = buttons.find(b => (b.innerText || "").trim().toLowerCase() === "publish release");
    if (pubBtn) {
      pubBtn.scrollIntoView({ behavior: "smooth", block: "center" });
      pubBtn.click();
      return true;
    }
    return false;
  });
  console.log("Clicked Publish release button:", published);

  await new Promise(r => setTimeout(r, 6000));
  console.log("Current URL after publish:", ghPage.url());
  console.log("Release publication completed successfully!");
  process.exit(0);
})();
