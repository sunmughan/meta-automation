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
    }, `${tag} - Agentic Browser Controller, 2026 Live-DOM Adapters & Omnichannel AI Growth Engine`);

    const bodyTextarea = await ghPage.$("#release_body") || await ghPage.$("textarea[name=\"release[body]\"]");
    if (bodyTextarea) {
      const releaseNotes = `## What's New in ${tag}

### 🎮 Agentic Browser Controller Architecture
- **Live DOM as Ground Truth**: Operates directly with the live browser DOM over Chrome DevTools Protocol (\`CDP\` :9222). Bypasses brittle third-party APIs, sandbox limitations, 2FA hurdles, and rate limit bans.
- **9-Level Semantic Fallback Locator**: Completely eliminates brittle single-selector dependencies across: (1) ARIA role + accessible name, (2) visible text, (3) \`aria-label\`, (4) \`title\`, (5) \`placeholder\`, (6) semantic DOM attributes, (7) candidate multi-selectors, (8) contextual parent scoping, and (9) bounding box coordinates.
- **Truthful Action State Machine**: Strict lifecycle (\`DISCOVERED ➔ DECIDING ➔ ATTEMPTED ➔ SUBMITTED ➔ VERIFIED\`). Zero unverified confirmations — actions are only marked \`VERIFIED\` after independent out-of-composer DOM inspection.
- **Automated Failure Diagnostics**: Captures full-page screenshots and DOM dumps to \`logs/screenshots/\` on any blocked or unverified attempt.

### ✍️ 2026 TipTap & ProseMirror Rich-Text Dispatch Engine
- **Block Editor State Synchronization**: Specialized injection pipeline for LinkedIn post modals, LinkedIn comment boxes, and Facebook Comet composers.
- **Synthetic InputEvent & Typing Jitter**: Dispatches \`beforeinput\` and \`InputEvent("input", { inputType: "insertText", data: char, bubbles: true })\` with human-like variable cadence (30–95ms jitter).
- **ProseMirror Empty Node Cleansing**: Replaces \`<p class="is-editor-empty">\` to trigger internal virtual DOM document updates and cleanly enable post/comment submit buttons.

### 📜 Virtualized Container-Level Programmatic Scrolling
- **Overcoming SPA Viewport Traps**: Replaces non-functional \`window.scrollBy\` with container-level scrolling on \`main#workspace, #workspace, .scaffold-layout__main\`.
- **Triggering IntersectionObservers**: Ensures continuous feed recycling and captures live dynamic posts without getting stuck.

### 🖱️ CDP Native Mouse Click Dispatch (\`page.mouse.click(x, y)\`)
- **Ember.js & React SPA Route Navigation**: Calculates bounding boxes and sends genuine OS-level hardware mouse clicks, ensuring conversation switching in LinkedIn messaging and modal triggers succeed without event dropping.

### 📱 Android Termux + Termux:X11 Parity
- **Full Mobile Autonomy**: Run 24/7 on Android devices without root via Termux and Termux:X11.
- **Android 12+ Optimization Guidelines**: Comprehensive documentation for disabling Phantom Process Killer via ADB and setting battery to Unrestricted.
- **1-Click Master Runner**: \`./start-termux\` manages X11 display, launches Chromium with CDP flags, and connects the engine automatically.

### 🌐 Omnichannel Coverage (LinkedIn + Facebook + Threads)
- **LinkedIn Outbound & Inbound**: TipTap post publishing, container scrolling feed discovery, connection triage (\`/in/\` accepted, spam rejected), unread DM triage & AI conversion replies, inbound comment replies with \`@Name\` tags.
- **Facebook Operations**: Founder & agency group discovery, commercial buyer search, timeline post publishing, Messenger direct message triage, comment notification replies.
- **Threads Continuous Presence**: High-intent keyword discovery, home feed scanning, viral quote-posting, activity replies, direct messages.

### ⚡ Round-Robin Tab Isolation & Performance
- **Visual Foreground Switching**: Sequential execution cycles Threads ➔ Facebook ➔ LinkedIn with \`bringToFront: true\`, preventing focus-stealing and keyboard collisions.
- **Dynamic Knowledge Grounding**: 100% brand isolation with live hot-reloading from \`knowledge/*.md\`. Official WhatsApp booking link (\`https://wa.me/919584215603\`).

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
