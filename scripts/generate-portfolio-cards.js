/**
 * scripts/generate-portfolio-cards.js
 * Generates 1000x1000 professional portfolio cards for Freelancer.com using
 * Chromium's native high-DPI HTML5 Canvas over CDP.
 */

const fs = require("fs");
const path = require("path");
const http = require("http");
const WebSocket = require("ws");

const OUTPUT_DIR = path.resolve(__dirname, "../portfolio_images");
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const PROJECTS = [
  {
    id: "store",
    title: "Nita Kitchenware — Enterprise B2B E-Commerce",
    category: "Full-Stack Web & Mobile",
    description: "High-Performance Multi-Vendor Wholesale Marketplace with Native Flutter Apps",
    techStack: ["Laravel 10", "Flutter Mobile", "MySQL 8.0", "REST APIs", "Shiprocket Logistics"],
    metrics: "10K+ SKUs • Real-Time Order Dispatch • Multi-Tier Wholesale Pricing",
    colors: { bg1: "#0f172a", bg2: "#1e1b4b", accent1: "#f97316", accent2: "#ef4444" }
  },
  {
    id: "zynero_games",
    title: "Zynero Games — Real-Time Casino & Gaming Platform",
    category: "Game Server & Mobile",
    description: "High-Throughput WebSocket Card Gaming Engine with Low-Latency Sync",
    techStack: ["Node.js Sockets", "CodeIgniter PHP", "Redis Pub/Sub", "Android Native", "MySQL"],
    metrics: "Sub-50ms Latency • Real-Time Multiplayer • Provably Fair RNG",
    colors: { bg1: "#0d0b18", bg2: "#2e1065", accent1: "#a855f7", accent2: "#ec4899" }
  },
  {
    id: "openpatti",
    title: "OpenPatti — High-Traffic Live Results Publishing Platform",
    category: "High-Scale Web & API Architecture",
    description: "High-Concurrency Gaming Odds & Live Results Platform with Worker Queues",
    techStack: ["Turborepo", "Next.js 14", "Fastify Node.js", "Redis Queue", "Docker"],
    metrics: "100K+ Concurrent Daily Users • Sub-second Live Feed Updates",
    colors: { bg1: "#061a14", bg2: "#064e3b", accent1: "#10b981", accent2: "#06b6d4" }
  },
  {
    id: "staffease",
    title: "StaffGo — On-Demand Hospitality Staffing SaaS",
    category: "B2B Gig-Economy Platform",
    description: "Gig-Economy On-Demand Shift Hiring Platform for Hotels, Cafes & Events",
    techStack: ["Next.js 16", "TypeScript", "Prisma ORM", "Tailwind CSS", "Stripe Connect"],
    metrics: "Instant Shift Matching • Automated KYC • Dispute Resolution Engine",
    colors: { bg1: "#081b29", bg2: "#1e3a8a", accent1: "#3b82f6", accent2: "#60a5fa" }
  },
  {
    id: "printless",
    title: "Printless — Smart NFC & QR Digital Business Card",
    category: "IoT & Digital Product SaaS",
    description: "Contactless Smart Networking Platform with Real-Time Analytics & CRM Sync",
    techStack: ["React.js", "Node.js", "MongoDB", "NFC Dynamic Protocols", "AWS Lambda"],
    metrics: "1-Tap Contact Save • Dynamic QR Generation • Enterprise Lead Routing",
    colors: { bg1: "#041f1e", bg2: "#115e59", accent1: "#14b8a6", accent2: "#2dd4bf" }
  },
  {
    id: "vasera",
    title: "Societify — Smart Community & Society Management SaaS",
    category: "Community Operations & IoT",
    description: "Operating System for Modern Housing Societies: Visitor Entry, Guard Auth & Billing",
    techStack: ["Flutter App", "Laravel Backend", "MySQL", "Razorpay Gateway", "FCM Push"],
    metrics: "Biometric Guard Auth • 1-Tap Bill Payments • Resident Mobile App",
    colors: { bg1: "#111827", bg2: "#3730a3", accent1: "#6366f1", accent2: "#818cf8" }
  },
  {
    id: "onequotation",
    title: "1Quotation — Enterprise Quotation & Catalog SaaS",
    category: "Enterprise Sales Automation",
    description: "Automated Quotation Generation, Dynamic Pricing & Product Catalog Management",
    techStack: ["React 18", "Material UI", "Vite", "Node.js", "Automated PDF Engine"],
    metrics: "Instant PDF Generation • Multi-Tier Margin Calculator • Customer Portal",
    colors: { bg1: "#1c1917", bg2: "#78350f", accent1: "#f59e0b", accent2: "#d97706" }
  },
  {
    id: "maviinci",
    title: "BluePearl — Luxury E-Commerce & Inventory Management",
    category: "Luxury Retail & Commerce",
    description: "High-End Jewelry Boutique Commerce Suite with Real-Time Cloud Sync",
    techStack: ["React.js", "Firebase Realtime DB", "Tailwind CSS", "Framer Motion", "Cloud Storage"],
    metrics: "Smooth 60FPS UI • Real-time Stock Sync • Dynamic Currency Conversion",
    colors: { bg1: "#0b132b", bg2: "#1c2541", accent1: "#38bdf8", accent2: "#93c5fd" }
  },
  {
    id: "machine_mandi",
    title: "MachineMandi — Industrial Machinery B2B Marketplace",
    category: "Industrial B2B Marketplace",
    description: "Heavy Equipment & Industrial Machinery Trading Platform with RFQ Engine",
    techStack: ["Full-Stack Architecture", "B2B Trade Protocols", "RFQ Engine", "Cloud APIs"],
    metrics: "Verified Machinery Catalog • Direct Buyer-Seller RFQ • Inspection Workflow",
    colors: { bg1: "#18181b", bg2: "#27272a", accent1: "#eab308", accent2: "#ca8a04" }
  }
];

async function generateCards() {
  const tabs = await new Promise((resolve, reject) => {
    http.get("http://127.0.0.1:9222/json", res => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => resolve(JSON.parse(data)));
    }).on("error", reject);
  });

  const flTab = tabs.find(t => t.url.includes("freelancer.com"));
  if (!flTab) throw new Error("Freelancer tab not found");

  const ws = new WebSocket(flTab.webSocketDebuggerUrl);
  await new Promise(r => ws.on("open", r));

  let msgId = 1;
  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = msgId++;
      const handler = (msg) => {
        const parsed = JSON.parse(msg);
        if (parsed.id === id) {
          ws.off("message", handler);
          if (parsed.error) reject(parsed.error);
          else resolve(parsed.result);
        }
      };
      ws.on("message", handler);
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  for (const proj of PROJECTS) {
    console.log(`🎨 Rendering 1000x1000 card for: ${proj.title}...`);
    const evalCode = `
      (() => {
        const canvas = document.createElement('canvas');
        canvas.width = 1000;
        canvas.height = 1000;
        const ctx = canvas.getContext('2d');

        // Background Gradient
        const grad = ctx.createLinearGradient(0, 0, 1000, 1000);
        grad.addColorStop(0, '${proj.colors.bg1}');
        grad.addColorStop(0.6, '${proj.colors.bg2}');
        grad.addColorStop(1, '#020617');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 1000, 1000);

        // Tech grid lines
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
        ctx.lineWidth = 1;
        for (let x = 40; x < 1000; x += 40) {
          ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 1000); ctx.stroke();
        }
        for (let y = 40; y < 1000; y += 40) {
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(1000, y); ctx.stroke();
        }

        // Glowing circle in background
        const radGrad = ctx.createRadialGradient(800, 200, 10, 800, 200, 400);
        radGrad.addColorStop(0, '${proj.colors.accent1}33');
        radGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = radGrad;
        ctx.fillRect(0, 0, 1000, 1000);

        // Card Frame / Inner Border
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.lineWidth = 2;
        ctx.strokeRect(50, 50, 900, 900);

        // Top Brand Header
        ctx.font = 'bold 22px system-ui, -apple-system, sans-serif';
        ctx.fillStyle = '${proj.colors.accent1}';
        ctx.fillText('PORTFOLIO SHOWCASE', 80, 120);

        ctx.font = '500 20px system-ui, -apple-system, sans-serif';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.fillText('${proj.category.toUpperCase()}', 80, 155);

        // Main Title (Wrap if needed)
        ctx.font = 'bold 42px system-ui, -apple-system, sans-serif';
        ctx.fillStyle = '#ffffff';
        const title = '${proj.title.replace(/'/g, "\\'")}';
        const words = title.split(' ');
        let line = '';
        let y = 240;
        for (let n = 0; n < words.length; n++) {
          const testLine = line + words[n] + ' ';
          const metrics = ctx.measureText(testLine);
          if (metrics.width > 800 && n > 0) {
            ctx.fillText(line, 80, y);
            line = words[n] + ' ';
            y += 54;
          } else {
            line = testLine;
          }
        }
        ctx.fillText(line, 80, y);

        // Description
        ctx.font = 'normal 24px system-ui, -apple-system, sans-serif';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
        const descWords = '${proj.description.replace(/'/g, "\\'")}'.split(' ');
        let descLine = '';
        let descY = y + 55;
        for (let n = 0; n < descWords.length; n++) {
          const testLine = descLine + descWords[n] + ' ';
          if (ctx.measureText(testLine).width > 800 && n > 0) {
            ctx.fillText(descLine, 80, descY);
            descLine = descWords[n] + ' ';
            descY += 34;
          } else {
            descLine = testLine;
          }
        }
        ctx.fillText(descLine, 80, descY);

        // Key Metrics Highlight Box
        const boxY = descY + 45;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.fillRect(80, boxY, 840, 75);
        ctx.strokeStyle = '${proj.colors.accent1}66';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(80, boxY, 840, 75);

        ctx.font = '600 20px system-ui, -apple-system, sans-serif';
        ctx.fillStyle = '${proj.colors.accent1}';
        ctx.fillText('KEY IMPACT:', 105, boxY + 45);

        ctx.font = '500 20px system-ui, -apple-system, sans-serif';
        ctx.fillStyle = '#f1f5f9';
        ctx.fillText('${proj.metrics}', 250, boxY + 45);

        // Tech Stack Badges
        const tech = ${JSON.stringify(proj.techStack)};
        let badgeX = 80;
        let badgeY = boxY + 130;
        ctx.font = 'bold 18px system-ui, -apple-system, sans-serif';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.fillText('CORE TECHNOLOGIES', 80, badgeY);
        badgeY += 25;

        for (const t of tech) {
          ctx.font = '600 18px system-ui, -apple-system, sans-serif';
          const textWidth = ctx.measureText(t).width;
          const badgeWidth = textWidth + 36;
          
          if (badgeX + badgeWidth > 900) {
            badgeX = 80;
            badgeY += 55;
          }

          // Badge pill
          ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
          ctx.beginPath();
          ctx.roundRect(badgeX, badgeY, badgeWidth, 42, 8);
          ctx.fill();
          ctx.strokeStyle = '${proj.colors.accent2}88';
          ctx.lineWidth = 1;
          ctx.stroke();

          ctx.fillStyle = '#ffffff';
          ctx.fillText(t, badgeX + 18, badgeY + 27);
          badgeX += badgeWidth + 16;
        }

        // Bottom Footer
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.beginPath();
        ctx.moveTo(80, 880);
        ctx.lineTo(920, 880);
        ctx.stroke();

        ctx.font = 'bold 20px system-ui, -apple-system, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.fillText('Sunmughan Swamy', 80, 920);

        ctx.font = 'normal 18px system-ui, -apple-system, sans-serif';
        ctx.fillStyle = '${proj.colors.accent1}';
        ctx.fillText('Ai Solution Architect & Software Engineer', 80, 946);

        ctx.font = '500 18px system-ui, -apple-system, sans-serif';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.fillText('github.com/sunmughan', 690, 930);

        return canvas.toDataURL('image/png');
      })()
    `;

    const res = await send("Runtime.evaluate", {
      expression: evalCode,
      returnByValue: true
    });

    const dataUrl = res.result.value;
    const base64Data = dataUrl.replace(/^data:image\/png;base64,/, "");
    const outPath = path.join(OUTPUT_DIR, `${proj.id}.png`);
    fs.writeFileSync(outPath, base64Data, "base64");
    console.log(`   ✅ Saved: ${outPath} (1000x1000)`);
  }

  ws.close();
  console.log("\n🎉 All 9 portfolio thumbnails generated successfully!");
}

generateCards().catch(console.error);
