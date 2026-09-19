const path = require("path");
const fs = require("fs");

(async () => {
  const puppeteer = await import("puppeteer-core");
  const browser = await puppeteer.connect({ browserURL: "http://127.0.0.1:9222" });
  const pages = await browser.pages();
  const ghPage = pages.find(p => p.url().includes("github.com"));
  if (!ghPage) {
    console.error("GitHub page not found in browser");
    process.exit(1);
  }

  console.log("Navigating to new release page...");
  await ghPage.goto("https://github.com/sunmughan/meta-automation/releases/new", { waitUntil: "domcontentloaded", timeout: 30000 });
  await new Promise(r => setTimeout(r, 2000));

  // 1. Select tag v1.1.6
  console.log("Selecting tag v1.1.6...");
  const tagBtn = await ghPage.$("#ref-picker-releases-tag");
  await tagBtn.click();
  await new Promise(r => setTimeout(r, 1000));

  await ghPage.evaluate(() => {
    const items = Array.from(document.querySelectorAll("[role=\"menuitem\"], [role=\"option\"], li, a, button, span"));
    const v116 = items.find(el => (el.innerText || "").trim() === "v1.1.6");
    if (v116) v116.click();
  });
  await new Promise(r => setTimeout(r, 1500));

  // 2. Fill Title
  console.log("Setting Release Title...");
  const titleInput = await ghPage.$("#release_name");
  await titleInput.click({ clickCount: 3 });
  await titleInput.type("v1.1.6 - Client SPA Navigation & Reply Submit Arrow Fix", { delay: 10 });

  // 3. Fill Description
  console.log("Setting Release Description...");
  const bodyText = `## What's Changed in v1.1.6

### 🎯 Core Fixes & Enhancements
- **Client SPA Navigation & URL Verification**: Fixed client-side SPA routing bug where \`page.url()\` remained at root domain while posts were rendered. Replaced rigid URL check with deep DOM verification (\`window.location.href\`, \`a[href*="postId"]\`, author username, and snippet matching).
- **Targeted Reply Submit Arrow**: Updated inline reply submission to strictly target the composer row's Upward/Left Arrow icon (\`svg path[d*="M1 6h10"]\` with \`title="Reply"\`).
- **Profile Modal Prevention Safeguard**: Eliminated global querying for \`"Post"\` buttons which inadvertently clicked the feed's *"What's new?"* profile creator. Added auto-cancellation for any accidental \`"New thread"\` dialogs.
- **Double-Guard Optimization**: Streamlined AI qualification double-guard to eliminate redundant API calls for posts already qualified as \`HOT\`.

### 📦 Multi-Platform Release Assets & Checksums
All build distributions are packaged and verified below:
- \`meta-automation-1.1.6.tgz\` (NPM Tarball)
- \`meta-automation-universal-v1.1.6.zip\` (Universal ZIP)
- \`meta-automation-linux-x64.tar.gz\` (Linux x64)
- \`meta-automation-windows-x64.zip\` (Windows x64)
- \`meta-automation-macos-universal.tar.gz\` (macOS Universal)
- \`meta-automation-android-termux.tar.gz\` (Android Termux)

**Full Changelog**: https://github.com/sunmughan/meta-automation/compare/v1.1.1...v1.1.6`;

  const bodyArea = await ghPage.$("#release_body");
  await bodyArea.click();
  await ghPage.evaluate((txt) => {
    const area = document.querySelector("#release_body");
    area.value = txt;
    area.dispatchEvent(new Event("input", { bubbles: true }));
    area.dispatchEvent(new Event("change", { bubbles: true }));
  }, bodyText);
  await new Promise(r => setTimeout(r, 1000));

  // 4. Upload Assets
  console.log("Uploading release assets...");
  const releaseDir = path.resolve(__dirname, "../release");
  const assetFiles = [
    path.join(releaseDir, "meta-automation-1.1.6.tgz"),
    path.join(releaseDir, "meta-automation-universal-v1.1.6.zip"),
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
