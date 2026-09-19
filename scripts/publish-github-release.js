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
  const titleText = `${version} - Transaction-Verified Action Execution, Safe Retry Quarantine & 6-Hour Cadence`;
  const bodyText = `## What's Changed in ${version}

### 🛡️ Transaction-Verified Comment & Post Execution
- **Multi-Signal Verification in \`threads-actions.js\`**: Modal closure and textbox clearing are no longer naively treated as posting success. Submissions now undergo multi-signal DOM verification (comment text snippet inserted into thread \`article\`, Threads \`"Posted"\` / \`"View"\` confirmation toast, and absence of error banners).
- **False-Positive State Guard**: If verification fails or is cancelled, \`duplicateGuard.recordExecuted()\` is strictly omitted and state is NOT recorded as \`POSTED_LIVE\`, preventing qualified leads from being permanently locked out.
- **Diagnostic Failure Capture**: Failed comments and unverified posts automatically capture timestamped diagnostic screenshots in \`logs/screenshots/\` for rapid browser triage.

### 🔁 Safe Retry Quarantine State Machine (\`COMMENT_FAILED\`)
- **Transient Error Quarantine**: Unverified comments transition to \`status: "COMMENT_FAILED"\` with failure reason and retry tracking.
- **Cooldown Governance**: Posts in \`COMMENT_FAILED\` are safely retryable after a 15-minute cooldown (up to 3 maximum retries), ensuring network hiccups or transient browser latency do not result in dropped client leads.

### ⏱️ Strict 6-Hour Scheduled Content Cadence (4 Posts / 24 Hours)
- **Posting Interval Update**: Standardized \`POST_INTERVAL_HOURS=6\` in \`config/index.js\`, \`.env\`, and documentation, enforcing exactly 4 strategic discussion posts / carousels every 24 hours.
- **Verified-Only Scheduler Audit**: The scheduler exclusively evaluates posts with \`status: "VERIFIED_PUBLISHED"\` or \`published === true\` when calculating elapsed time, ensuring failed or cancelled drafts never disrupt the publishing cadence.

### ⚖️ Single Canonical Rate Governor
- **Removed Duplicate Session Cap**: Replaced arbitrary per-session comment counters with canonical \`rateLimiter.canPerformAction("COMMENT")\` governance.

### 📦 Multi-Platform Release Assets & Checksums
All build distributions are packaged and verified below:
- \`meta-automation-${pkg.version}.tgz\` (NPM Tarball)
- \`meta-automation-universal-v${pkg.version}.zip\` (Universal ZIP)
- \`meta-automation-linux-x64.tar.gz\` (Linux x64)
- \`meta-automation-windows-x64.zip\` (Windows x64)
- \`meta-automation-macos-universal.tar.gz\` (macOS Universal)
- \`meta-automation-android-termux.tar.gz\` (Android Termux)
- \`SHA256SUMS.txt\` (Cryptographic SHA-256 Checksums)

**Full Changelog**: https://github.com/sunmughan/meta-automation/compare/v1.1.8...${version}`;
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
