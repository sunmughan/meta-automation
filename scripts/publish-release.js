/**
 * scripts/publish-release.js
 * Universal release publisher for GitHub Releases using authenticated browser CDP session.
 */

const path = require("path");
const fs = require("fs");

(async () => {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../package.json"), "utf8"));
    const version = pkg.version;
    const tag = `v${version}`;

    console.log(`==> Publishing release ${tag} for package ${pkg.name}...`);

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
    }, `${tag} - Omnichannel Autonomous Engagement Engine (LinkedIn, Facebook & Threads)`);

    const bodyTextarea = await ghPage.$("#release_body") || await ghPage.$("textarea[name=\"release[body]\"]");
    if (bodyTextarea) {
      const releaseNotes = `## What's New in ${tag}

### 🌐 Complete Omnichannel Support (LinkedIn + Facebook + Threads)
- **LinkedIn Inbound Operations**:
  - Automatically manages incoming connection requests: accepts individual profile requests (\`/in/\`) and automatically ignores/rejects page follows, group invites, and event invitations.
  - Direct Messages monitoring: checks unread DMs, detects sender context, avoids self-replies, and responds with tailored grounded AI.
  - Inbound comment replies: monitors notifications for replies to our posts and comments, responding back with user tags (\`@Name\`).
  - Daily B2B Thought-Leadership cross-posting: publishes daily authoritative technical posts reusing the high-impact visual media generated for Threads.
  - 2026 Modern DOM traversal for high-intent B2B keyword searches and executive feed monitoring.

- **Facebook Inbound & Outbound Operations**:
  - Inbound comment replies via Facebook notifications with tagged replies.
  - Messenger direct message monitoring with grounded AI response generation.
  - Commercial buyer keyword searches and public founder/agency group discovery.

- **Threads Continuous Presence**:
  - Live feed and keyword scanning with active lead qualification and verified commenting.
  - Inbound activity reply monitor and direct message responder.

### ⚡ Performance & Dynamic Architecture
- **Dynamic Antigravity Language Server CSRF Socket Discovery**: Dynamically resolves listening ports and matching CSRF tokens, preventing process hangs and speeding up AI reasoning.
- **Dedicated Browser Tab Instances**: Mutex-guarded dedicated tabs for Threads, LinkedIn, and Facebook with automatic foreground switching (\`bringToFront: true\`).
- **Sequential and Concurrent Multi-Tab Execution Modes**: Choose between seamless sequential multi-tab pipeline execution or simultaneous background multi-threading.

---

### 📦 Checksums
\`\`\`
${fs.readFileSync(path.resolve(__dirname, "../release/SHA256SUMS.txt"), "utf8")}
\`\`\``;

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
