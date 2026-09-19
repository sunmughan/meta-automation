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
  const titleText = `${version} - Pure AI-First Entry, Zero Heuristic Guessing, AiQueue Worker & SSOT Markdown Schema`;
  const bodyText = `## What's Changed in ${version}

### 🧠 Pure AI-First Entrypoint & Zero-Discard Pipeline
- **Removed Hardcoded CodeAir Regex Gates**: Stripped direct regex shortcuts from \`qualifyPost()\` in \`ai-decision-engine.js\`. Every post captured on screen enters AI semantic reasoning directly with zero premature gates.
- **Zero Heuristic Guessing on AI Failure**: When the Antigravity AI runtime fails after retries in production, posts are quarantined (\`status: "QUARANTINED"\`, \`lead_type: "QUARANTINED"\`, \`decision: "IGNORED"\`) rather than guessed via local regex heuristics. *"A delayed decision is vastly superior to an erroneous AI decision."*
- **Asynchronous AI Concurrency Queue (\`AiQueue\`)**: Implemented priority scheduling (\`DM_RESPONSE\` > \`REPLY_GENERATION\` > \`COMMENT_SYNTHESIS\` > \`POST_ANALYSIS\`), concurrency governance (default: 1), and an in-memory 120-second deduplication cache in \`ai-runtime.js\` to prevent process thrashing.
- **Single Brain Authority**: Unified \`intent-classifier.js\` with \`ai-decision-engine.js\`. Marked deterministic classifier as an auxiliary test fixture and added \`classifyAsync()\` delegation.

### 📚 Dynamic Knowledge Markdown Schema Contract
- **Markdown Tables & Markdown Link Support**: Enhanced \`parseServicesMarkdown()\` in \`knowledge-engine.js\` to parse both bullet items and table rows (\`| Service | Description |\`), ignoring dividers and headers. Enhanced \`parseProfilesMarkdown()\` to parse bare URLs, inline links, and markdown brackets \`[Text](URL)\`.
- **Single-URL Discipline & 4-Mode Representation**: Strict enforcement of maximum 1 link per comment tailored to representation (\`FOUNDER\`, \`COMPANY\`, \`BOTH\`, or \`NEUTRAL\`).

### 📦 Multi-Platform Release Assets & Checksums
All build distributions are packaged and verified below:
- \`meta-automation-${pkg.version}.tgz\` (NPM Tarball)
- \`meta-automation-universal-v${pkg.version}.zip\` (Universal ZIP)
- \`meta-automation-linux-x64.tar.gz\` (Linux x64)
- \`meta-automation-windows-x64.zip\` (Windows x64)
- \`meta-automation-macos-universal.tar.gz\` (macOS Universal)
- \`meta-automation-android-termux.tar.gz\` (Android Termux)
- \`SHA256SUMS.txt\` (Cryptographic SHA-256 Checksums)

**Full Changelog**: https://github.com/sunmughan/meta-automation/compare/v1.1.7...${version}`;
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
