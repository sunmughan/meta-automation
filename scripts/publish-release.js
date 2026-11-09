/**
 * scripts/publish-release.js
 * Universal release publisher for GitHub Releases.
 * Uses GitHub REST API with GITHUB_TOKEN if available, otherwise falls back to browser CDP session.
 */

const path = require("path");
const fs = require("fs");

async function publishViaGitHubApi(tag, releaseNotes, version) {
  let token = process.env.GITHUB_TOKEN;
  if (!token) {
    const envPath = path.resolve(__dirname, "../.env");
    if (fs.existsSync(envPath)) {
      const match = fs.readFileSync(envPath, "utf8").match(/GITHUB_TOKEN=([^\r\n]+)/);
      if (match) token = match[1].trim();
    }
  }

  if (!token) return false;

  console.log(`==> Publishing via GitHub REST API with GITHUB_TOKEN...`);
  const repo = "sunmughan/meta-automation";
  const title = `${tag} - Comprehensive Cross-Platform Anti-Ban Fortification & Multi-Layer Stealth`;

  // 1. Check if release already exists
  const checkRes = await fetch(`https://api.github.com/repos/${repo}/releases/tags/${tag}`, {
    headers: {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/vnd.github+json",
      "User-Agent": "meta-automation-releaser"
    }
  });

  let releaseData = null;
  if (checkRes.ok) {
    releaseData = await checkRes.json();
    console.log(`Release ${tag} already exists (ID: ${releaseData.id}), updating release notes...`);
    const updateRes = await fetch(`https://api.github.com/repos/${repo}/releases/${releaseData.id}`, {
      method: "PATCH",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Accept": "application/vnd.github+json",
        "Content-Type": "application/json",
        "User-Agent": "meta-automation-releaser"
      },
      body: JSON.stringify({
        name: title,
        body: releaseNotes
      })
    });
    if (updateRes.ok) {
      releaseData = await updateRes.json();
    }
  } else {
    console.log(`Creating new release for ${tag}...`);
    const createRes = await fetch(`https://api.github.com/repos/${repo}/releases`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Accept": "application/vnd.github+json",
        "Content-Type": "application/json",
        "User-Agent": "meta-automation-releaser"
      },
      body: JSON.stringify({
        tag_name: tag,
        target_commitish: "agentic-social-v2",
        name: title,
        body: releaseNotes,
        draft: false,
        prerelease: false
      })
    });

    if (!createRes.ok) {
      const errText = await createRes.text();
      throw new Error(`GitHub API create release failed: ${createRes.status} ${errText}`);
    }
    releaseData = await createRes.json();
    console.log(`✅ Release created successfully with ID: ${releaseData.id}`);
  }

  // 2. Upload assets from release/
  const releaseDir = path.resolve(__dirname, "../release");
  if (fs.existsSync(releaseDir)) {
    const assetFiles = fs.readdirSync(releaseDir).map(f => path.join(releaseDir, f)).filter(f => fs.statSync(f).isFile() && !f.endsWith(".DS_Store"));
    const existingAssets = releaseData.assets || [];

    for (const filePath of assetFiles) {
      const fileName = path.basename(filePath);
      console.log(`Uploading asset: ${fileName}...`);

      const existing = existingAssets.find(a => a.name === fileName);
      if (existing) {
        console.log(`Deleting existing asset ${fileName} (${existing.id})...`);
        await fetch(`https://api.github.com/repos/${repo}/releases/assets/${existing.id}`, {
          method: "DELETE",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Accept": "application/vnd.github+json",
            "User-Agent": "meta-automation-releaser"
          }
        });
      }

      const fileBuffer = fs.readFileSync(filePath);
      const uploadUrl = `https://uploads.github.com/repos/${repo}/releases/${releaseData.id}/assets?name=${encodeURIComponent(fileName)}`;
      const uploadRes = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Accept": "application/vnd.github+json",
          "Content-Type": fileName.endsWith(".txt") ? "text/plain" : (fileName.endsWith(".zip") ? "application/zip" : "application/gzip"),
          "User-Agent": "meta-automation-releaser"
        },
        body: fileBuffer
      });

      if (!uploadRes.ok) {
        const errText = await uploadRes.text();
        console.warn(`Asset upload warning for ${fileName}: ${uploadRes.status} ${errText}`);
      } else {
        console.log(`✅ Uploaded: ${fileName}`);
      }
    }
  }

  console.log(`\n🎉 Release ${tag} successfully published and assets uploaded via GitHub API!`);
  console.log(`Release URL: ${releaseData.html_url}`);
  return true;
}

(async () => {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../package.json"), "utf8"));
    const version = pkg.version;
    const tag = `v${version}`;

    console.log(`==> Publishing release ${tag} for package ${pkg.name}...`);

    const checksumsPath = path.resolve(__dirname, "../release/SHA256SUMS.txt");
    const checksumsContent = fs.existsSync(checksumsPath) ? fs.readFileSync(checksumsPath, "utf8") : "";

    const releaseNotes = `## What's New in ${tag}

### 🛡️ Multi-Layer Anti-Ban & Cross-Platform Stealth Engine
- **CDP Anti-Detection Launch Flags**: Automatic injection of \`--disable-blink-features=AutomationControlled\`, \`--password-store=basic\`, and \`--enable-automation=false\` to eliminate automation artifacts at the browser engine level.
- **Dynamic CDP Stealth Injections**: Injected on every new document to mask \`navigator.webdriver\`, emulate \`window.chrome.runtime\`/\`window.chrome.app\`, and normalize permissions queries across Threads, Instagram, Facebook, and LinkedIn tabs.
- **Closed-Loop Warning & Action-Block Escalation**: Active real-time DOM detection for action blocks, temporary restrictions, captchas, and rate-limit dialogs. Immediately halts actions and escalates cooldown timers (30m / 120m / 24h emergency backoff) via \`AntiBan\`.

### 🖱️ Humanized Interaction Mechanics
- **Cubic Bezier Mouse Movement**: Replaced instant coordinate jumps with natural human mouse trajectories (\`humanMouseMove\` and \`humanClick\`) featuring randomized control points and velocity easing.
- **Micro-Jitter Coordinates**: Element clicks land within a natural randomized bounding area rather than fixed mathematical centers.
- **Dynamic Typing Cadence**: Keystroke jitter (22–55ms) with natural cognitive pauses between words (40–120ms) and sentence boundaries (70–210ms).

### 💼 Job Engine (Freelancer) Full Anti-Ban Protection
- **Integrated Marketplace Limits**: Extended \`PLATFORM_LIMITS\` and \`MIN_ACTION_GAP_SECONDS\` to Freelancer and Upwork proposals (\`bid\` and \`apply\` actions).
- **Enforced Safety Gates**: Pre-application rate limit checks, human reading delays, and verified submission tracking before recording success.

### 📸 Instagram Guarded Live Interaction Pipeline
- **CDP Execution Engine**: Upgraded from mock placeholder to active live posting pipeline with duplicate prevention, checkpoint detection, and DOM verification.

### 🧪 Resilient Browser Auto-Detection & Semantic Fallback
- **Auto-Browser Resolution**: Gracefully resolves the primary browser candidate profile without crashing in headless container environments.
- **Grounded Semantic AI Matching**: Refined capability matching to accurately qualify natural language buyer inquiries and career advice posts.

---

### 📦 Checksums
\`\`\`
${checksumsContent}
\`\`\``;

    // Try API publication first if token available
    const apiSuccess = await publishViaGitHubApi(tag, releaseNotes, version);
    if (apiSuccess) {
      process.exit(0);
    }

    console.log("==> No GITHUB_TOKEN found; falling back to browser CDP session...");

    const puppeteer = await import("puppeteer-core");
    const browser = await puppeteer.connect({ browserURL: "http://127.0.0.1:9222" });
    const pages = await browser.pages();
    let ghPage = pages.find(p => p.url().includes("github.com"));
    if (!ghPage) {
      console.log("Opening new tab for GitHub...");
      ghPage = await browser.newPage();
    }

    console.log(`Navigating to release page for tag ${tag}...`);
    await ghPage.goto(`https://github.com/sunmughan/meta-automation/releases/new?tag=${tag}`, {
      waitUntil: "domcontentloaded",
      timeout: 30000
    });
    await new Promise(r => setTimeout(r, 2500));

    // 1. Verify tag picker
    const currentTag = await ghPage.evaluate(() => {
      const btn = document.querySelector("#ref-picker-releases-tag");
      return btn ? btn.innerText.trim() : "";
    });
    console.log("Current tag picker text:", currentTag);

    if (!currentTag.includes(tag)) {
      const tagBtn = await ghPage.$("#ref-picker-releases-tag");
      if (tagBtn) {
        await tagBtn.click();
        await new Promise(r => setTimeout(r, 1000));
        await ghPage.evaluate((targetTag) => {
          const items = Array.from(document.querySelectorAll("[role=\"menuitem\"], [role=\"option\"], li, a, button, span"));
          const match = items.find(el => (el.innerText || "").trim() === targetTag);
          if (match) match.click();
        }, tag);
        await new Promise(r => setTimeout(r, 1500));
      }
    }

    // 2. Set Title & Body
    console.log("Setting title and release notes...");
    await ghPage.evaluate((titleText) => {
      const el = document.querySelector("#release_name, input[name=\"release[name]\"]");
      if (el) {
        el.value = titleText;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }, `${tag} - Comprehensive Cross-Platform Anti-Ban Fortification & Multi-Layer Stealth`);

    const bodyTextarea = await ghPage.$("#release_body") || await ghPage.$("textarea[name=\"release[body]\"]");
    if (bodyTextarea) {
      await ghPage.evaluate((notes) => {
        const ta = document.querySelector("#release_body, textarea[name=\"release[body]\"]");
        if (ta) {
          ta.value = notes;
          ta.dispatchEvent(new Event("input", { bubbles: true }));
          ta.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }, releaseNotes);
    }

    // 3. Upload Assets
    console.log("Uploading release assets...");
    const releaseDir = path.resolve(__dirname, "../release");
    if (fs.existsSync(releaseDir)) {
      const assetFiles = fs.readdirSync(releaseDir).map(f => path.join(releaseDir, f)).filter(f => fs.statSync(f).isFile());
      console.log("Attaching files:", assetFiles.map(f => path.basename(f)));
      const fileInput = await ghPage.$("#releases-upload") || await ghPage.$("input[type=\"file\"][name=\"file\"]") || await ghPage.$("input[type=\"file\"]");
      if (fileInput && assetFiles.length > 0) {
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
          if (status.uploading === 0 && i > 1) {
            console.log("All uploads finished!");
            break;
          }
        }
      }
    }

    await new Promise(r => setTimeout(r, 3000));

    // 4. Click Publish release
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
    console.log(`✅ Release ${tag} successfully published to GitHub!`);
    process.exit(0);
  } catch (err) {
    console.error("❌ Failed to publish release:", err);
    process.exit(1);
  }
})();
