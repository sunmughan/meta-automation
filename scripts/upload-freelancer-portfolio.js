/**
 * scripts/upload-freelancer-portfolio.js
 * Automated Portfolio Item Publisher for Freelancer.com over Chrome CDP.
 */

const fs = require("fs");
const path = require("path");
const http = require("http");
const WebSocket = require("ws");

const IMAGES_DIR = path.resolve(__dirname, "../portfolio_images");

const ITEMS = [
  {
    id: "zynero_games",
    title: "Zynero Games Real-Time Platform",
    description: "High-throughput real-time WebSocket card gaming engine and mobile platform. Features sub-50ms latency state synchronization, CodeIgniter PHP backend, Redis Pub/Sub distributed events, native Android client, and provably fair cryptographic RNG system.",
    tag: "gaming",
    image: path.join(IMAGES_DIR, "zynero_games.png")
  },
  {
    id: "openpatti",
    title: "OpenPatti Live Results Platform",
    description: "High-concurrency gaming odds and real-time live results publishing platform built with Turborepo monorepo, Next.js 14, Fastify Node.js microservices, Docker containerization, and Redis worker queues handling 100K+ concurrent daily users with sub-second feed latency.",
    tag: "nextjs",
    image: path.join(IMAGES_DIR, "openpatti.png")
  },
  {
    id: "staffease",
    title: "StaffGo Hospitality Staffing SaaS",
    description: "Enterprise gig-economy on-demand shift hiring SaaS platform tailored for hotels, restaurants, cafes, and event organizers. Features instant candidate-shift matching algorithms, automated KYC verification, real-time attendance tracking, and Stripe Connect payouts.",
    tag: "saas",
    image: path.join(IMAGES_DIR, "staffease.png")
  },
  {
    id: "printless",
    title: "Printless Smart NFC Business Card",
    description: "Contactless smart networking and digital identity platform utilizing dynamic NFC and QR protocols. Features real-time contact card sharing, profile engagement analytics, automated CRM lead routing, and highly scalable AWS serverless cloud infrastructure.",
    tag: "iot",
    image: path.join(IMAGES_DIR, "printless.png")
  },
  {
    id: "vasera",
    title: "Societify Smart Society SaaS",
    description: "Smart community operations and gated society management SaaS platform. Provides seamless visitor entry management, biometric guard authorization, resident Flutter mobile app, automated maintenance billing, and integrated online payment processing.",
    tag: "flutter",
    image: path.join(IMAGES_DIR, "vasera.png")
  },
  {
    id: "onequotation",
    title: "1Quotation Enterprise Catalog",
    description: "Enterprise sales automation and quotation management suite for B2B manufacturers and distributors. Features dynamic multi-tier catalog management, automated PDF quotation generation, custom margin and discount calculations, and dedicated customer approval portals.",
    tag: "saas",
    image: path.join(IMAGES_DIR, "onequotation.png")
  },
  {
    id: "maviinci",
    title: "BluePearl Luxury E-Commerce",
    description: "High-end luxury jewelry and boutique retail e-commerce platform. Features real-time Firebase stock synchronization, smooth Framer Motion 60FPS UI animations, dynamic multi-currency conversion, secure checkout flows, and cloud-based inventory tracking.",
    tag: "ecommerce",
    image: path.join(IMAGES_DIR, "maviinci.png")
  },
  {
    id: "machine_mandi",
    title: "MachineMandi B2B Marketplace",
    description: "Industrial heavy equipment and machinery B2B trading marketplace. Features comprehensive verified equipment catalogs, intelligent Request For Quote (RFQ) negotiation engine, buyer-seller direct messaging, and end-to-end machinery inspection workflows.",
    tag: "b2b",
    image: path.join(IMAGES_DIR, "machine_mandi.png")
  }
];

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function getFreelancerTab() {
  const tabs = await new Promise((resolve, reject) => {
    http.get("http://127.0.0.1:9222/json", res => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => resolve(JSON.parse(data)));
    }).on("error", reject);
  });

  const flTab = tabs.find(t => t.url && t.url.includes("freelancer.com"));
  if (!flTab) throw new Error("No active Freelancer tab found on CDP port 9222");
  return flTab;
}

class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.msgId = 1;
  }

  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((resolve, reject) => {
      this.ws.on("open", resolve);
      this.ws.on("error", reject);
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.msgId++;
      const handler = (msg) => {
        const parsed = JSON.parse(msg);
        if (parsed.id === id) {
          this.ws.off("message", handler);
          if (parsed.error) reject(parsed.error);
          else resolve(parsed.result);
        }
      };
      this.ws.on("message", handler);
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const res = await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true
    });
    return res.result ? res.result.value : null;
  }

  close() {
    if (this.ws) {
      try { this.ws.close(); } catch (_) {}
    }
  }
}

async function publishItem(cdp, item) {
  console.log(`\n==================================================`);
  console.log(`🚀 Starting publication: ${item.title}`);
  console.log(`   Image : ${item.image}`);
  console.log(`   Tag   : ${item.tag}`);
  console.log(`   Chars : ${item.description.length} chars (required: >= 140)`);
  console.log(`==================================================`);

  if (!fs.existsSync(item.image)) {
    throw new Error(`Thumbnail image file not found: ${item.image}`);
  }

  // 1. Navigate to /discover/publish
  console.log("➡️  Navigating to /discover/publish...");
  await cdp.send("Page.navigate", { url: "https://www.freelancer.com/discover/publish" });
  await sleep(6000);

  // 2. Locate file input and set image file
  console.log("📁 Uploading thumbnail via CDP DOM.setFileInputFiles...");
  const fileInputRes = await cdp.send("Runtime.evaluate", {
    expression: 'document.querySelector("input[type=file]")'
  });

  if (!fileInputRes.result || !fileInputRes.result.objectId) {
    throw new Error("File input element not found on /discover/publish");
  }

  await cdp.send("DOM.setFileInputFiles", {
    files: [item.image],
    objectId: fileInputRes.result.objectId
  });

  // Wait for thumbnail preview to render
  console.log("⏳ Waiting for image upload processing...");
  let uploaded = false;
  for (let i = 0; i < 15; i++) {
    await sleep(1000);
    const hasPreview = await cdp.evaluate(`
      Boolean(document.querySelector('img[src*="blob"], .PreviewImage, fl-picture, .UploadPreview, .FilePreview, [class*="ImagePreview"], [class*="Thumbnail"]'))
    `);
    if (hasPreview) {
      uploaded = true;
      console.log("✅ Thumbnail uploaded and verified in DOM.");
      break;
    }
  }

  if (!uploaded) {
    console.warn("⚠️  Preview element not detected within 15s; proceeding with form fields...");
  }

  // 3. Fill Title & Description
  console.log(`✍️  Setting title: "${item.title}"`);
  await cdp.evaluate(`
    (() => {
      function setInputValue(el, val) {
        if (!el) return;
        el.value = val;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('blur', { bubbles: true }));
      }
      const titleInput = document.querySelector('input[placeholder*="Geometric logo"]');
      const descTextarea = document.querySelector('textarea[placeholder*="Tell us what makes"]');
      setInputValue(titleInput, ${JSON.stringify(item.title)});
      setInputValue(descTextarea, ${JSON.stringify(item.description)});
    })()
  `);

  await sleep(1000);

  // 4. Focus and input tag
  console.log(`🏷️  Adding tag: "${item.tag}"`);
  await cdp.evaluate(`
    (() => {
      const tagInput = document.querySelector('input[placeholder*="illustration"]');
      if (tagInput) {
        tagInput.focus();
        tagInput.click();
      }
    })()
  `);

  await sleep(400);

  for (const char of item.tag) {
    await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", text: char, unmodifiedText: char });
    await cdp.send("Input.dispatchKeyEvent", { type: "keyUp" });
    await sleep(100);
  }
  await sleep(800);
  await cdp.send("Input.dispatchKeyEvent", { type: "rawKeyDown", windowsVirtualKeyCode: 13 });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", windowsVirtualKeyCode: 13 });
  await sleep(600);
  await cdp.evaluate(`
    (() => {
      const option = document.querySelector('fl-dropdown-item, .DropdownItem, [role="option"]');
      if (option) option.click();
    })()
  `);
  await sleep(1500);

  // 5. Click Next button
  console.log("➡️  Clicking Next...");
  await cdp.evaluate(`
    (() => {
      const btns = Array.from(document.querySelectorAll('button, fl-button'));
      const nextBtn = btns.find(b => b.innerText?.trim() === 'Next' && b.tagName === 'BUTTON') || btns.find(b => b.innerText?.trim() === 'Next');
      if (nextBtn) {
        nextBtn.click();
      }
    })()
  `);

  // Wait for preview page
  let onPreview = false;
  for (let i = 0; i < 20; i++) {
    await sleep(1000);
    const url = await cdp.evaluate("window.location.href");
    if (url && url.includes("/publish/preview")) {
      onPreview = true;
      console.log(`✅ Arrived at preview page: ${url}`);
      break;
    }
  }

  if (!onPreview) {
    const errorSnippet = await cdp.evaluate("document.body.innerText.slice(0, 800)");
    throw new Error(`Failed to advance to preview page for "${item.title}". Snippet: ${errorSnippet.replace(/\\n+/g, " ")}`);
  }

  await sleep(2000);

  // 6. Click Publish button
  console.log("🚀 Clicking Publish...");
  await cdp.evaluate(`
    (() => {
      const btns = Array.from(document.querySelectorAll('button, fl-button'));
      const publishBtn = btns.find(b => b.innerText?.trim() === 'Publish' && b.tagName === 'BUTTON') || btns.find(b => b.innerText?.trim() === 'Publish');
      if (publishBtn) publishBtn.click();
    })()
  `);

  // Wait for Done button or navigation
  let published = false;
  for (let i = 0; i < 20; i++) {
    await sleep(1000);
    const checkState = await cdp.evaluate(`
      (() => {
        const doneBtn = Array.from(document.querySelectorAll('button, fl-button')).some(b => b.innerText?.trim() === 'Done');
        return { hasDone: doneBtn, url: window.location.href };
      })()
    `);
    if (checkState && (checkState.hasDone || checkState.url.includes("/discover/manage"))) {
      published = true;
      console.log(`🎉 Successfully published: "${item.title}"!`);
      break;
    }
  }

  if (!published) {
    console.warn("⚠️  'Done' confirmation not detected within 20s; proceeding...");
  }

  await sleep(3000);
}

async function main() {
  console.log("Connecting to Freelancer CDP session...");
  const tab = await getFreelancerTab();
  const cdp = new CDPClient(tab.webSocketDebuggerUrl);
  await cdp.connect();

  console.log("✅ Connected to Freelancer CDP tab.");

  // Inspect current manage page
  await cdp.send("Page.navigate", { url: "https://www.freelancer.com/discover/manage" });
  await sleep(5000);

  const existingText = await cdp.evaluate("document.body.innerText") || "";

  for (const item of ITEMS) {
    if (existingText.includes(item.title)) {
      console.log(`⏩ Item already published, skipping: "${item.title}"`);
      continue;
    }

    try {
      await publishItem(cdp, item);
    } catch (err) {
      console.error(`❌ Error publishing "${item.title}": ${err.message}`);
    }
  }

  // Final verification on manage page
  console.log("\n==================================================");
  console.log("🔍 Performing final portfolio audit on /discover/manage...");
  await cdp.send("Page.navigate", { url: "https://www.freelancer.com/discover/manage" });
  await sleep(6000);

  const finalText = await cdp.evaluate("document.body.innerText") || "";
  console.log("\nPortfolio verification results:");
  const allProjects = [{ title: "Nita Kitchenware B2B E-Commerce" }, ...ITEMS];
  let publishedCount = 0;
  for (const p of allProjects) {
    const present = finalText.includes(p.title);
    if (present) publishedCount++;
    console.log(`  ${present ? "✅" : "❌"} ${p.title}`);
  }

  console.log(`\nTotal verified published: ${publishedCount} / ${allProjects.length}`);

  cdp.close();
  console.log("\n🎉 Portfolio update completed!");
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
