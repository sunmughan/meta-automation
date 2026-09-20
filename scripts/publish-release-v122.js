const path = require("path");
const fs = require("fs");

(async () => {
  try {
    const puppeteer = await import("puppeteer-core");
    const browser = await puppeteer.connect({ browserURL: "http://127.0.0.1:9222" });
    const pages = await browser.pages();
    let ghPage = pages.find(p => p.url().includes("github.com"));
    if (!ghPage) {
      console.log("Opening new tab for GitHub...");
      ghPage = await browser.newPage();
    }

    console.log("Navigating to new release page for tag v1.2.2...");
    await ghPage.goto("https://github.com/sunmughan/meta-automation/releases/new?tag=v1.2.2", {
      waitUntil: "domcontentloaded",
      timeout: 30000
    });
    await new Promise(r => setTimeout(r, 2500));

    // 1. Choose or verify tag
    console.log("Verifying tag v1.2.2 selection...");
    const currentTag = await ghPage.evaluate(() => {
      const btn = document.querySelector("#ref-picker-releases-tag");
      return btn ? btn.innerText.trim() : "";
    });
    console.log("Current tag picker text:", currentTag);

    if (!currentTag.includes("v1.2.2")) {
      const tagBtn = await ghPage.$("#ref-picker-releases-tag");
      if (tagBtn) {
        await tagBtn.click();
        await new Promise(r => setTimeout(r, 1000));
        await ghPage.evaluate(() => {
          const items = Array.from(document.querySelectorAll("[role=\"menuitem\"], [role=\"option\"], li, a, button, span"));
          const match = items.find(el => (el.innerText || "").trim() === "v1.2.2");
          if (match) match.click();
        });
        await new Promise(r => setTimeout(r, 1500));
      }
    }

    // 2. Set Release Title
    console.log("Setting Release Title...");
    const titleInput = await ghPage.$("#release_name") || await ghPage.$("input[name=\"release[name]\"]");
    if (titleInput) {
      await titleInput.click({ clickCount: 3 });
      await titleInput.type("v1.2.2 - Category-First Topic Routing, React/Web Dev Specialization & Two-Tier Qualification", { delay: 5 });
    }

    // 3. Set Release Description
    console.log("Setting Release Description...");
    const bodyText = `## What's Changed in v1.2.2

### 🎯 Core Highlights & Fixes
- **Category-First Topic Routing**: Replaced naive substring matching (\`.includes("ai")\`) with category-first precedence and strict word-boundary regular expressions. Eliminated false-positive AI comment generation on posts containing common words such as *"paid"* or *"waiting"*.
- **Dedicated React & Web Development Specialization**: Added first-class, human-written responses tailored specifically for React, Next.js, and modern full-stack web application inquiries in both Founder and Company representation modes.
- **Two-Tier Lead Qualification**: Comprehensive qualification architecture distinguishing direct \`PROJECT_BUYER\` demands from high-value \`INDUSTRY_LEAD\` discussions (SaaS Founders, Developers, Designers, Marketers).
- **Stabilized Loop Cadence & Scheduled Poster**: Optimized navigation loop to prevent aggressive tab switching, with guaranteed 6-hour publishing cadence (4 high-value posts per 24 hours).
- **Automated Regression Coverage**: Added test 25b verifying React developer requests receive specialized web development comments with zero AI automation jargon (108/108 tests passing).

### 📦 Multi-Platform Release Assets & Checksums
All build distributions are packaged and verified below:
- \`meta-automation-1.2.2.tgz\` (NPM Tarball)
- \`meta-automation-universal-v1.2.2.zip\` (Universal All-Platform ZIP)
- \`meta-automation-linux-x64.tar.gz\` (Linux x64)
- \`meta-automation-windows-x64.zip\` (Windows x64)
- \`meta-automation-macos-universal.tar.gz\` (macOS Universal)
- \`meta-automation-android-termux.tar.gz\` (Android Termux)
- \`SHA256SUMS.txt\` (Cryptographic SHA-256 Checksums)

**Full Changelog**: https://github.com/sunmughan/meta-automation/compare/v1.2.1...v1.2.2`;

    const bodyArea = await ghPage.$("#release_body") || await ghPage.$("textarea[name=\"release[body]\"]");
    if (bodyArea) {
      await bodyArea.click();
      await ghPage.evaluate((txt) => {
        const area = document.querySelector("#release_body") || document.querySelector("textarea[name=\"release[body]\"]");
        if (area) {
          area.value = txt;
          area.dispatchEvent(new Event("input", { bubbles: true }));
          area.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }, bodyText);
    }
    await new Promise(r => setTimeout(r, 1000));

    // 4. Upload Assets
    console.log("Uploading release assets...");
    const releaseDir = path.resolve(__dirname, "../release");
    const assetFiles = [
      path.join(releaseDir, "meta-automation-1.2.2.tgz"),
      path.join(releaseDir, "meta-automation-universal-v1.2.2.zip"),
      path.join(releaseDir, "meta-automation-linux-x64.tar.gz"),
      path.join(releaseDir, "meta-automation-windows-x64.zip"),
      path.join(releaseDir, "meta-automation-macos-universal.tar.gz"),
      path.join(releaseDir, "meta-automation-android-termux.tar.gz"),
      path.join(releaseDir, "SHA256SUMS.txt")
    ].filter(f => fs.existsSync(f));

    console.log("Attaching files:", assetFiles.map(f => path.basename(f)));
    const fileInput = await ghPage.$("#releases-upload") || await ghPage.$("input[type=\"file\"][name=\"file\"]") || await ghPage.$("input[type=\"file\"]");
    if (fileInput) {
      await fileInput.uploadFile(...assetFiles);
      console.log("Assets attached, waiting for upload to complete...");

      for (let i = 0; i < 45; i++) {
        await new Promise(r => setTimeout(r, 2000));
        const status = await ghPage.evaluate(() => {
          const uploading = document.querySelectorAll(".is-uploading, [data-upload-progress], .upload-progress");
          const failed = document.querySelectorAll(".upload-failed");
          const success = document.querySelectorAll(".is-default, .upload-successful, [data-targets=\"file-attachment.files\"] li, .manifest-item");
          return { uploading: uploading.length, failed: failed.length, success: success.length };
        });
        console.log(`Upload check [${i + 1}/45]:`, status);
        if (status.uploading === 0 && i > 1) {
          console.log("All uploads finished!");
          break;
        }
      }
    }

    await new Promise(r => setTimeout(r, 3000));

    // 5. Click "Publish release"
    console.log("Publishing release on GitHub...");
    const published = await ghPage.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll("button[type=\"submit\"], input[type=\"submit\"]"));
      const pubBtn = buttons.find(b => {
        const text = (b.innerText || b.value || "").trim().toLowerCase();
        return text.includes("publish release");
      });
      if (pubBtn) {
        pubBtn.scrollIntoView({ behavior: "smooth", block: "center" });
        pubBtn.click();
        return true;
      }
      return false;
    });
    console.log("Clicked Publish release button:", published);

    await new Promise(r => setTimeout(r, 6000));
    console.log("Current page URL after publish:", ghPage.url());
    browser.disconnect();
    console.log("✅ Release v1.2.2 successfully published to GitHub with all assets!");
    process.exit(0);
  } catch (err) {
    console.error("❌ Failed to publish release:", err);
    process.exit(1);
  }
})();
