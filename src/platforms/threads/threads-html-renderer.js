/**
 * src/platforms/threads/threads-html-renderer.js
 * Ultra-clean, Stripe/x.ai/Linear/PayPal grade graphic renderer.
 * Generates 1080x1080 dark-mode social media cards & carousel slides.
 * Uses official CodeAir brand icon and authentic websites:
 * - CodeAir Software Solutions: www.codeair.tech
 * - PixelGo HMS: pixelgo.live
 */

const fs = require("fs");
const path = require("path");
const CONFIG = require("../../../config");
const browserManager = require("../../browser/browser-manager");
const logger = require("../../logging/logger");

const LOGO_CODEAIR = path.resolve(CONFIG.ROOT_DIR, "assets/codeair-logo.png");
const LOGO_PIXELGO = path.resolve(CONFIG.ROOT_DIR, "assets/pixelgo-logo.webp");

let _codeairLogoUri = null;
let _pixelgoLogoUri = null;

function getCodeAirLogoUri() {
  if (_codeairLogoUri) return _codeairLogoUri;
  if (fs.existsSync(LOGO_CODEAIR)) {
    try {
      _codeairLogoUri = `data:image/png;base64,${fs.readFileSync(LOGO_CODEAIR).toString("base64")}`;
    } catch (e) {}
  }
  return _codeairLogoUri || "";
}

function getPixelGoLogoUri() {
  if (_pixelgoLogoUri) return _pixelgoLogoUri;
  if (fs.existsSync(LOGO_PIXELGO)) {
    try {
      _pixelgoLogoUri = `data:image/webp;base64,${fs.readFileSync(LOGO_PIXELGO).toString("base64")}`;
    } catch (e) {}
  }
  return _pixelgoLogoUri || "";
}

class ThreadsHtmlRenderer {
  /**
   * Generates HTML markup for a structured slide card.
   */
  generateSlideHtml(spec) {
    const accent = spec.accentColor || "#00F0FF";
    const glow = spec.glowColor || "rgba(0, 240, 255, 0.12)";
    const badge = spec.badge || "CODEAIR • INNOVATION";
    const title = spec.title || "";
    const subtitle = spec.subtitle || "";
    let cards = spec.cards;
    if (!Array.isArray(cards) || cards.length === 0) {
      cards = [
        { num: "01", title: "System Architecture", desc: subtitle || "Engineered for high-concurrency throughput and fault tolerance." },
        { num: "02", title: "Deterministic Pipelines", desc: "Automated verification contracts eliminate silent failures and data drift." },
        { num: "03", title: "Production Outcome", desc: "Delivers measurable compounding value with zero operational waste." }
      ];
    }
    const slideNum = spec.slide_num || 1;
    const totalSlides = spec.total_slides || 5;
    const author = spec.author || "Sunmughan Swamy • Founder";

    const isPixelGo = (spec.badge || "").includes("PIXELGO") ||
                      (spec.title || "").includes("PixelGo") ||
                      spec.pillar === "pixelgo_hms";
    const website = isPixelGo ? "pixelgo.live" : "www.codeair.tech";
    const company = isPixelGo ? "PIXELGO HMS" : "CODEAIR SOFTWARE SOLUTIONS";
    const logoDataUri = isPixelGo ? getPixelGoLogoUri() : getCodeAirLogoUri();
    const logoClass = isPixelGo ? "brand-logo-pixelgo" : "brand-logo-codeair";

    const cardsHtml = cards.map(c => `
      <div class="card">
        <div class="card-num" style="color: ${accent}; border-color: ${accent}40; background: ${accent}15;">${c.num}</div>
        <div class="card-text">
          <div class="card-title">${c.title}</div>
          <div class="card-desc">${c.desc}</div>
        </div>
      </div>
    `).join("");

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: 1080px;
    height: 1080px;
    background: #07090E;
    color: #F3F4F6;
    font-family: "Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, sans-serif;
    position: relative;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 72px;
  }
  .glow-top-right {
    position: absolute;
    top: -120px;
    right: -120px;
    width: 550px;
    height: 550px;
    background: radial-gradient(circle, ${glow} 0%, rgba(99, 102, 241, 0.08) 40%, transparent 70%);
    pointer-events: none;
  }
  .glow-bottom-left {
    position: absolute;
    bottom: -150px;
    left: -150px;
    width: 600px;
    height: 600px;
    background: radial-gradient(circle, rgba(121, 40, 202, 0.12) 0%, transparent 65%);
    pointer-events: none;
  }
  .grid-pattern {
    position: absolute;
    inset: 0;
    background-image: radial-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px);
    background-size: 32px 32px;
    pointer-events: none;
  }
  .header {
    position: relative;
    z-index: 10;
  }
  .badge {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    padding: 8px 18px;
    border-radius: 9999px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.09);
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: ${accent};
    margin-bottom: 24px;
  }
  .badge-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: ${accent};
    box-shadow: 0 0 12px ${accent};
  }
  .title {
    font-size: 48px;
    font-weight: 800;
    line-height: 1.15;
    letter-spacing: -0.035em;
    background: linear-gradient(180deg, #FFFFFF 20%, #B8C0CC 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    margin-bottom: 14px;
    max-width: 930px;
  }
  .subtitle {
    font-size: 22px;
    font-weight: 400;
    line-height: 1.45;
    color: #94A3B8;
    letter-spacing: -0.01em;
    max-width: 900px;
  }
  .content {
    position: relative;
    z-index: 10;
    display: flex;
    flex-direction: column;
    gap: 18px;
    margin: 24px 0;
    flex: 1;
    justify-content: center;
  }
  .card {
    display: flex;
    align-items: flex-start;
    gap: 22px;
    padding: 22px 26px;
    border-radius: 18px;
    background: rgba(255, 255, 255, 0.035);
    border: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.05);
  }
  .card-num {
    font-size: 15px;
    font-weight: 800;
    letter-spacing: 0.05em;
    padding: 6px 12px;
    border-radius: 10px;
    border: 1px solid;
    flex-shrink: 0;
  }
  .card-text {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .card-title {
    font-size: 20px;
    font-weight: 700;
    color: #F8FAFC;
    letter-spacing: -0.02em;
  }
  .card-desc {
    font-size: 16.5px;
    font-weight: 400;
    color: #94A3B8;
    line-height: 1.45;
  }
  .footer {
    position: relative;
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: 24px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }
  .footer-brand {
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .brand-logo-codeair {
    width: 36px;
    height: 36px;
    border-radius: 10px;
    object-fit: contain;
    box-shadow: 0 4px 14px rgba(0, 80, 255, 0.35);
  }
  .brand-logo-pixelgo {
    height: 38px;
    width: auto;
    max-width: 140px;
    object-fit: contain;
    filter: drop-shadow(0 2px 8px rgba(16, 185, 129, 0.35));
  }
  .footer-brand-info {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .company-name {
    font-size: 14px;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: #E2E8F0;
  }
  .website-tag {
    font-size: 13px;
    font-weight: 600;
    color: ${accent};
    letter-spacing: 0.04em;
  }
  .footer-author {
    font-size: 13px;
    font-weight: 500;
    color: #64748B;
  }
  .footer-slide {
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.12em;
    color: ${accent};
    padding: 6px 14px;
    border-radius: 9999px;
    background: ${accent}12;
    border: 1px solid ${accent}30;
  }
</style>
</head>
<body>
  <div class="glow-top-right"></div>
  <div class="glow-bottom-left"></div>
  <div class="grid-pattern"></div>
  
  <div class="header">
    <div class="badge">
      <span class="badge-dot"></span>
      ${badge}
    </div>
    <div class="title">${title}</div>
    <div class="subtitle">${subtitle}</div>
  </div>
  
  <div class="content">
    ${cardsHtml}
  </div>
  
  <div class="footer">
    <div class="footer-brand">
      ${logoDataUri ? `<img src="${logoDataUri}" class="${logoClass}" alt="${company} Logo" />` : ''}
      <div class="footer-brand-info">
        <span class="company-name">${company}</span>
        <span class="website-tag">• ${website}</span>
      </div>
    </div>
    <div class="footer-author">${author}</div>
    <div class="footer-slide">0${slideNum} / 0${totalSlides}</div>
  </div>
</body>
</html>`;
  }

  /**
   * Generates HTML markup for a high-impact single quote or discussion card.
   * Executive Infographic Layout: Features bold perspective quote and 3-part
   * architectural / strategic principles panel, completely eliminating empty space.
   */
  generateQuoteCardHtml(spec) {
    const accent = spec.accentColor || "#00F0FF";
    const glow = spec.glowColor || "rgba(0, 240, 255, 0.15)";
    const badge = spec.badge || "CODEAIR • PERSPECTIVE";
    const quote = spec.quote || "";
    const author = spec.author || "Sunmughan Swamy";
    const role = spec.role || "Founder, CodeAir Software Solutions";
    const footerTag = spec.footerTag || "BUILDER NETWORK";

    let takeaways = spec.takeaways || spec.cards || [];
    if (!Array.isArray(takeaways) || takeaways.length === 0) {
      takeaways = [
        { num: "01", title: "Systematic Architecture", desc: "Eliminating fragile glue code with robust deterministic systems and state machines." },
        { num: "02", title: "Execution Velocity", desc: "Relentless shipping speed driven by direct user feedback loops and verified actions." },
        { num: "03", title: "Sustainable Scale", desc: "Resilient infrastructure built for sub-second latency, zero waste, and high reliability." }
      ];
    }

    const takeawaysHtml = takeaways.slice(0, 3).map(t => `
      <div class="takeaway-card">
        <div class="takeaway-badge" style="color: ${accent}; border-color: ${accent}40; background: ${accent}15;">${t.num || "◆"}</div>
        <div class="takeaway-content">
          <div class="takeaway-title">${t.title}</div>
          <div class="takeaway-desc">${t.desc}</div>
        </div>
      </div>
    `).join("");

    const isPixelGo = (spec.badge || "").includes("PIXELGO") ||
                      (spec.quote || "").includes("PixelGo") ||
                      spec.pillar === "pixelgo_hms";
    const website = isPixelGo ? "pixelgo.live" : "www.codeair.tech";
    const logoDataUri = isPixelGo ? getPixelGoLogoUri() : getCodeAirLogoUri();
    const avatarClass = isPixelGo ? "author-avatar-pixelgo" : "author-avatar-img";

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: 1080px;
    height: 1080px;
    background: #07090E;
    color: #F3F4F6;
    font-family: "Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, sans-serif;
    position: relative;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 72px;
  }
  .glow-center {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 700px;
    height: 700px;
    background: radial-gradient(circle, ${glow} 0%, transparent 60%);
    pointer-events: none;
  }
  .grid-pattern {
    position: absolute;
    inset: 0;
    background-image: radial-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px);
    background-size: 32px 32px;
    pointer-events: none;
  }
  .top-bar {
    position: relative;
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .badge {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    padding: 8px 18px;
    border-radius: 9999px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.09);
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: ${accent};
  }
  .badge-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: ${accent};
    box-shadow: 0 0 12px ${accent};
  }
  .tag {
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.1em;
    color: #64748B;
    text-transform: uppercase;
  }
  .quote-container {
    position: relative;
    z-index: 10;
    margin: 16px 0 12px 0;
  }
  .quote-mark {
    font-size: 56px;
    font-weight: 800;
    line-height: 1;
    color: ${accent};
    opacity: 0.7;
    margin-bottom: 4px;
  }
  .quote-text {
    font-size: 36px;
    font-weight: 800;
    line-height: 1.25;
    letter-spacing: -0.03em;
    background: linear-gradient(180deg, #FFFFFF 15%, #CBD5E1 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  .takeaways-panel {
    position: relative;
    z-index: 10;
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin: 14px 0;
    flex: 1;
    justify-content: center;
  }
  .takeaways-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 2px;
  }
  .takeaways-label {
    font-size: 11.5px;
    font-weight: 800;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: #64748B;
  }
  .takeaways-line {
    flex: 1;
    height: 1px;
    background: linear-gradient(90deg, rgba(255, 255, 255, 0.1) 0%, transparent 100%);
  }
  .takeaways-grid {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .takeaway-card {
    display: flex;
    align-items: flex-start;
    gap: 18px;
    padding: 16px 20px;
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.035);
    border: 1px solid rgba(255, 255, 255, 0.075);
    box-shadow: 0 4px 18px rgba(0, 0, 0, 0.3);
  }
  .takeaway-badge {
    font-size: 13px;
    font-weight: 800;
    letter-spacing: 0.04em;
    padding: 5px 10px;
    border-radius: 8px;
    border: 1px solid;
    flex-shrink: 0;
  }
  .takeaway-content {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .takeaway-title {
    font-size: 17px;
    font-weight: 700;
    color: #F8FAFC;
    letter-spacing: -0.01em;
  }
  .takeaway-desc {
    font-size: 14.5px;
    font-weight: 400;
    color: #94A3B8;
    line-height: 1.4;
  }
  .author-card {
    position: relative;
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: 24px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }
  .author-info {
    display: flex;
    align-items: center;
    gap: 18px;
  }
  .author-avatar-img {
    width: 50px;
    height: 50px;
    border-radius: 14px;
    object-fit: contain;
    box-shadow: 0 4px 16px rgba(0, 80, 255, 0.4);
  }
  .author-avatar-pixelgo {
    height: 48px;
    width: auto;
    max-width: 140px;
    object-fit: contain;
    filter: drop-shadow(0 4px 12px rgba(16, 185, 129, 0.35));
  }
  .author-details {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .author-name {
    font-size: 18px;
    font-weight: 800;
    color: #F8FAFC;
    letter-spacing: -0.02em;
  }
  .author-role {
    font-size: 13.5px;
    font-weight: 500;
    color: #94A3B8;
  }
  .author-site {
    color: ${accent};
    font-weight: 600;
  }
  .brand-tag {
    font-size: 12.5px;
    font-weight: 700;
    letter-spacing: 0.12em;
    color: ${accent};
    padding: 8px 16px;
    border-radius: 9999px;
    background: ${accent}12;
    border: 1px solid ${accent}30;
  }
</style>
</head>
<body>
  <div class="glow-center"></div>
  <div class="grid-pattern"></div>
  
  <div class="top-bar">
    <div class="badge">
      <span class="badge-dot"></span>
      ${badge}
    </div>
    <div class="tag">${footerTag}</div>
  </div>
  
  <div class="quote-container">
    <div class="quote-mark">“</div>
    <div class="quote-text">${quote}</div>
  </div>

  <div class="takeaways-panel">
    <div class="takeaways-header">
      <span class="takeaways-label">EXECUTIVE HIGHLIGHTS & ARCHITECTURAL PRINCIPLES</span>
      <span class="takeaways-line"></span>
    </div>
    <div class="takeaways-grid">
      ${takeawaysHtml}
    </div>
  </div>
  
  <div class="author-card">
    <div class="author-info">
      ${logoDataUri ? `<img src="${logoDataUri}" class="${avatarClass}" alt="Logo" />` : ''}
      <div class="author-details">
        <div class="author-name">${author}</div>
        <div class="author-role">${role} • <span class="author-site">${website}</span></div>
      </div>
    </div>
    <div class="brand-tag">${isPixelGo ? 'PIXELGO' : 'CODEAIR'}</div>
  </div>
</body>
</html>`;
  }

  /**
   * Generates HTML markup for a dark-mode terminal code snippet card.
   */
  generateCodeCardHtml(spec) {
    const accent = spec.accentColor || "#00F0FF";
    const glow = spec.glowColor || "rgba(0, 240, 255, 0.15)";
    const badge = spec.badge || "CODEAIR • ARCHITECTURE RUNTIME";
    const title = spec.title || spec.code_title || "agent_orchestrator.ts";
    const rawCode = spec.code || spec.code_snippet || `// CodeAir Autonomous Orchestration
const orchestrator = new AgenticPipeline({
  runtime: "gemini-3.8-flash-high",
  guardrails: { maxRetries: 3, deterministicFSM: true },
  async onEvent(event: StreamEvent): Promise<ActionVerdict> {
    const sanitized = sanitizeDomPayload(event.payload);
    return await verifyAndCommitAction(sanitized);
  }
});`;
    const language = spec.language || spec.code_language || "TypeScript";
    const author = spec.author || "Sunmughan Swamy • Founder";
    const website = "www.codeair.tech";
    const logoDataUri = getCodeAirLogoUri();

    // Syntax formatting helper
    const escapeHtml = (str) => str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const lines = rawCode.trim().split("\n");
    const codeLinesHtml = lines.map((line, idx) => {
      let l = escapeHtml(line);
      if (l.trim().startsWith("//")) {
        l = `<span style="color: #64748B; font-style: italic;">${l}</span>`;
      } else {
        l = l.replace(/(['"`])(.*?)\1/g, '<span style="color: #34D399;">$1$2$1</span>');
        l = l.replace(/\b(async|await|const|let|var|function|return|class|new|import|export|from|if|else|try|catch|throw|interface|type)\b/g, '<span style="color: #F472B6; font-weight: 600;">$1</span>');
        l = l.replace(/\b(Promise|StateStore|Agent|Router|Context|Client|Server|Array|Set|Map|String|Boolean|Number|AgenticPipeline|StreamEvent|ActionVerdict)\b/g, '<span style="color: #60A5FA;">$1</span>');
        l = l.replace(/\b(\d+)\b/g, '<span style="color: #FBBF24;">$1</span>');
      }
      const num = String(idx + 1).padStart(2, "0");
      return `<div class="code-line"><span class="line-num">${num}</span><span class="line-content">${l}</span></div>`;
    }).join("");

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: 1080px;
    height: 1080px;
    background: #07090E;
    color: #F3F4F6;
    font-family: "Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, sans-serif;
    position: relative;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 72px;
  }
  .glow-top-right {
    position: absolute;
    top: -120px;
    right: -120px;
    width: 600px;
    height: 600px;
    background: radial-gradient(circle, ${glow} 0%, rgba(99, 102, 241, 0.08) 40%, transparent 70%);
    pointer-events: none;
  }
  .glow-bottom-left {
    position: absolute;
    bottom: -150px;
    left: -150px;
    width: 600px;
    height: 600px;
    background: radial-gradient(circle, rgba(121, 40, 202, 0.12) 0%, transparent 65%);
    pointer-events: none;
  }
  .grid-pattern {
    position: absolute;
    inset: 0;
    background-image: radial-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px);
    background-size: 32px 32px;
    pointer-events: none;
  }
  .header {
    position: relative;
    z-index: 10;
  }
  .badge {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    padding: 8px 18px;
    border-radius: 9999px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.09);
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: ${accent};
    margin-bottom: 20px;
  }
  .badge-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: ${accent};
    box-shadow: 0 0 12px ${accent};
  }
  .headline {
    font-size: 34px;
    font-weight: 800;
    line-height: 1.25;
    letter-spacing: -0.03em;
    background: linear-gradient(180deg, #FFFFFF 15%, #CBD5E1 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  .terminal {
    position: relative;
    z-index: 10;
    margin: 28px 0;
    border-radius: 20px;
    background: rgba(13, 17, 23, 0.88);
    border: 1px solid rgba(255, 255, 255, 0.1);
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6), 0 0 40px rgba(0, 240, 255, 0.06);
    overflow: hidden;
  }
  .terminal-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 22px;
    background: rgba(255, 255, 255, 0.03);
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  }
  .terminal-dots {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
  }
  .dot-red { background: #FF5F56; }
  .dot-yellow { background: #FFBD2E; }
  .dot-green { background: #27C93F; }
  .terminal-title {
    font-family: "JetBrains Mono", monospace;
    font-size: 14px;
    font-weight: 600;
    color: #94A3B8;
    letter-spacing: -0.01em;
  }
  .terminal-lang {
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: ${accent};
    text-transform: uppercase;
    background: ${accent}15;
    padding: 4px 10px;
    border-radius: 6px;
    border: 1px solid ${accent}30;
  }
  .terminal-body {
    padding: 26px 28px;
    font-family: "JetBrains Mono", monospace;
    font-size: 17px;
    line-height: 1.7;
    overflow: hidden;
    color: #E2E8F0;
  }
  .code-line {
    display: flex;
    align-items: flex-start;
    gap: 20px;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .line-num {
    color: #475569;
    user-select: none;
    font-weight: 500;
    flex-shrink: 0;
  }
  .line-content {
    flex: 1;
  }
  .footer {
    position: relative;
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: 24px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }
  .footer-brand {
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .brand-logo-codeair {
    width: 38px;
    height: 38px;
    border-radius: 10px;
    object-fit: contain;
    box-shadow: 0 4px 14px rgba(0, 80, 255, 0.35);
  }
  .footer-brand-info {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .company-name {
    font-size: 14px;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: #E2E8F0;
  }
  .website-tag {
    font-size: 13px;
    font-weight: 600;
    color: ${accent};
    letter-spacing: 0.04em;
  }
  .footer-author {
    font-size: 13px;
    font-weight: 500;
    color: #64748B;
  }
  .footer-tag {
    font-size: 12.5px;
    font-weight: 700;
    letter-spacing: 0.12em;
    color: ${accent};
    padding: 6px 14px;
    border-radius: 9999px;
    background: ${accent}12;
    border: 1px solid ${accent}30;
  }
</style>
</head>
<body>
  <div class="glow-top-right"></div>
  <div class="glow-bottom-left"></div>
  <div class="grid-pattern"></div>

  <div class="header">
    <div class="badge">
      <span class="badge-dot"></span>
      ${badge}
    </div>
    <div class="headline">Deterministic Code & System Implementation</div>
  </div>

  <div class="terminal">
    <div class="terminal-bar">
      <div class="terminal-dots">
        <span class="dot dot-red"></span>
        <span class="dot dot-yellow"></span>
        <span class="dot dot-green"></span>
      </div>
      <div class="terminal-title">${title}</div>
      <div class="terminal-lang">${language}</div>
    </div>
    <div class="terminal-body">
      ${codeLinesHtml}
    </div>
  </div>

  <div class="footer">
    <div class="footer-brand">
      ${logoDataUri ? `<img src="${logoDataUri}" class="brand-logo-codeair" alt="CodeAir Logo" />` : ''}
      <div class="footer-brand-info">
        <span class="company-name">CODEAIR SOFTWARE SOLUTIONS</span>
        <span class="website-tag">• ${website}</span>
      </div>
    </div>
    <div class="footer-author">${author}</div>
    <div class="footer-tag">PRODUCTION RUNTIME</div>
  </div>
</body>
</html>`;
  }

  /**
   * Generates HTML markup for a system architecture topology diagram card.
   */
  generateArchitectureCardHtml(spec) {
    const accent = spec.accentColor || "#00F0FF";
    const glow = spec.glowColor || "rgba(0, 240, 255, 0.16)";
    const badge = spec.badge || "CODEAIR • TOPOLOGY BLUEPRINT";
    const title = spec.title || spec.arch_title || "Distributed Agent Pipeline";
    const subtitle = spec.subtitle || "Resilient multi-stage execution with deterministic guardrails";
    const author = spec.author || "Sunmughan Swamy • Founder";
    const website = "www.codeair.tech";
    const logoDataUri = getCodeAirLogoUri();

    const components = (spec.components || spec.arch_components || [
      { name: "01. Ingestion Stream", role: "Multi-signal event capture & aggressive DOM token pruning", icon: "⚡" },
      { name: "02. Autonomous Router", role: "Strict finite-state machine (Scan → Qualify → Propose → Execute)", icon: "🛡️" },
      { name: "03. Gemini 3.8 Flash High", role: "Sub-second structured reasoning & schema-validated output", icon: "🧠" },
      { name: "04. Verified Action Core", role: "Atomic Puppeteer/CDP mutation with strict multi-signal verification", icon: "🚀" }
    ]);

    const nodesHtml = components.map((comp, idx) => `
      <div class="node-wrapper">
        <div class="node-card">
          <div class="node-icon-box">${comp.icon || "◆"}</div>
          <div class="node-details">
            <div class="node-title">${comp.name}</div>
            <div class="node-role">${comp.role}</div>
          </div>
          <div class="node-step">0${idx + 1}</div>
        </div>
        ${idx < components.length - 1 ? `
          <div class="node-connector">
            <div class="connector-line"></div>
            <div class="connector-arrow">▼</div>
          </div>
        ` : ''}
      </div>
    `).join("");

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: 1080px;
    height: 1080px;
    background: #07090E;
    color: #F3F4F6;
    font-family: "Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, sans-serif;
    position: relative;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 72px;
  }
  .glow-top-right {
    position: absolute;
    top: -120px;
    right: -120px;
    width: 600px;
    height: 600px;
    background: radial-gradient(circle, ${glow} 0%, rgba(99, 102, 241, 0.08) 40%, transparent 70%);
    pointer-events: none;
  }
  .glow-bottom-left {
    position: absolute;
    bottom: -150px;
    left: -150px;
    width: 600px;
    height: 600px;
    background: radial-gradient(circle, rgba(121, 40, 202, 0.12) 0%, transparent 65%);
    pointer-events: none;
  }
  .grid-pattern {
    position: absolute;
    inset: 0;
    background-image: radial-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px);
    background-size: 32px 32px;
    pointer-events: none;
  }
  .header {
    position: relative;
    z-index: 10;
  }
  .badge {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    padding: 8px 18px;
    border-radius: 9999px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.09);
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: ${accent};
    margin-bottom: 20px;
  }
  .badge-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: ${accent};
    box-shadow: 0 0 12px ${accent};
  }
  .title {
    font-size: 42px;
    font-weight: 800;
    line-height: 1.15;
    letter-spacing: -0.035em;
    background: linear-gradient(180deg, #FFFFFF 20%, #B8C0CC 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    margin-bottom: 8px;
  }
  .subtitle {
    font-size: 20px;
    font-weight: 400;
    color: #94A3B8;
    line-height: 1.4;
  }
  .diagram-container {
    position: relative;
    z-index: 10;
    display: flex;
    flex-direction: column;
    gap: 0px;
    margin: 20px 0;
  }
  .node-wrapper {
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 100%;
  }
  .node-card {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 20px;
    padding: 20px 24px;
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
    position: relative;
  }
  .node-icon-box {
    width: 48px;
    height: 48px;
    border-radius: 12px;
    background: ${accent}18;
    border: 1px solid ${accent}40;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 22px;
    flex-shrink: 0;
  }
  .node-details {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .node-title {
    font-size: 19px;
    font-weight: 700;
    color: #F8FAFC;
    letter-spacing: -0.02em;
  }
  .node-role {
    font-size: 15px;
    font-weight: 400;
    color: #94A3B8;
    line-height: 1.4;
  }
  .node-step {
    font-size: 13px;
    font-weight: 800;
    letter-spacing: 0.1em;
    color: ${accent};
    padding: 6px 12px;
    border-radius: 8px;
    background: ${accent}15;
    border: 1px solid ${accent}30;
  }
  .node-connector {
    display: flex;
    flex-direction: column;
    align-items: center;
    height: 24px;
    justify-content: center;
    position: relative;
  }
  .connector-line {
    width: 2px;
    height: 12px;
    background: linear-gradient(180deg, ${accent}80, ${accent}20);
  }
  .connector-arrow {
    font-size: 9px;
    color: ${accent};
    line-height: 1;
    margin-top: -2px;
  }
  .footer {
    position: relative;
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: 24px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }
  .footer-brand {
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .brand-logo-codeair {
    width: 38px;
    height: 38px;
    border-radius: 10px;
    object-fit: contain;
    box-shadow: 0 4px 14px rgba(0, 80, 255, 0.35);
  }
  .footer-brand-info {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .company-name {
    font-size: 14px;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: #E2E8F0;
  }
  .website-tag {
    font-size: 13px;
    font-weight: 600;
    color: ${accent};
    letter-spacing: 0.04em;
  }
  .footer-author {
    font-size: 13px;
    font-weight: 500;
    color: #64748B;
  }
  .footer-tag {
    font-size: 12.5px;
    font-weight: 700;
    letter-spacing: 0.12em;
    color: ${accent};
    padding: 6px 14px;
    border-radius: 9999px;
    background: ${accent}12;
    border: 1px solid ${accent}30;
  }
</style>
</head>
<body>
  <div class="glow-top-right"></div>
  <div class="glow-bottom-left"></div>
  <div class="grid-pattern"></div>

  <div class="header">
    <div class="badge">
      <span class="badge-dot"></span>
      ${badge}
    </div>
    <div class="title">${title}</div>
    <div class="subtitle">${subtitle}</div>
  </div>

  <div class="diagram-container">
    ${nodesHtml}
  </div>

  <div class="footer">
    <div class="footer-brand">
      ${logoDataUri ? `<img src="${logoDataUri}" class="brand-logo-codeair" alt="CodeAir Logo" />` : ''}
      <div class="footer-brand-info">
        <span class="company-name">CODEAIR SOFTWARE SOLUTIONS</span>
        <span class="website-tag">• ${website}</span>
      </div>
    </div>
    <div class="footer-author">${author}</div>
    <div class="footer-tag">SYSTEM TOPOLOGY</div>
  </div>
</body>
</html>`;
  }

  /**
   * Renders HTML to a 1080x1080 PNG file via Puppeteer page.
   */
  async renderHtmlToImage(html, outputPath) {
    let browser = null;
    let page = null;
    try {
      browser = await browserManager.connect();
      page = await browser.newPage();
      await page.setViewport({ width: 1080, height: 1080, deviceScaleFactor: 1 });
      await page.setContent(html, { waitUntil: "networkidle0" });
      await page.screenshot({ path: outputPath, type: "png" });
      return outputPath;
    } catch (err) {
      logger.error(`Failed rendering HTML card to image: ${err.message}`);
      return null;
    } finally {
      if (page) {
        await page.close().catch(() => {});
      }
    }
  }
}

const threadsHtmlRenderer = new ThreadsHtmlRenderer();
module.exports = threadsHtmlRenderer;
