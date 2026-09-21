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
const knowledge = require("../../knowledge/knowledge-engine");

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

function generateQrSvg() {
  return `<svg width="90" height="90" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="100" height="100" rx="8" fill="white"/>
    <!-- Top-left finder -->
    <rect x="10" y="10" width="24" height="24" rx="3" fill="black"/>
    <rect x="14" y="14" width="16" height="16" fill="white"/>
    <rect x="18" y="18" width="8" height="8" fill="black"/>
    <!-- Top-right finder -->
    <rect x="66" y="10" width="24" height="24" rx="3" fill="black"/>
    <rect x="70" y="14" width="16" height="16" fill="white"/>
    <rect x="74" y="18" width="8" height="8" fill="black"/>
    <!-- Bottom-left finder -->
    <rect x="10" y="66" width="24" height="24" rx="3" fill="black"/>
    <rect x="14" y="70" width="16" height="16" fill="white"/>
    <rect x="18" y="74" width="8" height="8" fill="black"/>
    <!-- Timing tracks & alignment patterns -->
    <rect x="38" y="12" width="4" height="4" fill="black"/>
    <rect x="46" y="12" width="4" height="4" fill="black"/>
    <rect x="54" y="12" width="4" height="4" fill="black"/>
    <rect x="12" y="38" width="4" height="4" fill="black"/>
    <rect x="12" y="46" width="4" height="4" fill="black"/>
    <rect x="12" y="54" width="4" height="4" fill="black"/>
    <!-- Data modules -->
    <rect x="40" y="24" width="6" height="6" fill="black"/>
    <rect x="50" y="24" width="6" height="6" fill="black"/>
    <rect x="40" y="34" width="6" height="6" fill="black"/>
    <rect x="48" y="34" width="8" height="6" fill="black"/>
    <rect x="60" y="34" width="6" height="6" fill="black"/>
    <rect x="70" y="38" width="6" height="6" fill="black"/>
    <rect x="80" y="38" width="8" height="6" fill="black"/>
    <rect x="40" y="44" width="6" height="6" fill="black"/>
    <rect x="52" y="44" width="6" height="6" fill="black"/>
    <rect x="64" y="44" width="8" height="6" fill="black"/>
    <rect x="78" y="48" width="6" height="6" fill="black"/>
    <rect x="24" y="44" width="6" height="6" fill="black"/>
    <rect x="30" y="52" width="6" height="6" fill="black"/>
    <rect x="40" y="54" width="8" height="6" fill="black"/>
    <rect x="54" y="54" width="6" height="6" fill="black"/>
    <rect x="64" y="54" width="6" height="6" fill="black"/>
    <rect x="76" y="58" width="8" height="6" fill="black"/>
    <rect x="40" y="66" width="6" height="6" fill="black"/>
    <rect x="50" y="66" width="8" height="6" fill="black"/>
    <rect x="62" y="66" width="6" height="6" fill="black"/>
    <rect x="74" y="66" width="8" height="6" fill="black"/>
    <rect x="40" y="78" width="8" height="6" fill="black"/>
    <rect x="54" y="78" width="6" height="6" fill="black"/>
    <rect x="66" y="78" width="6" height="6" fill="black"/>
    <rect x="78" y="78" width="6" height="6" fill="black"/>
    <rect x="44" y="86" width="6" height="6" fill="black"/>
    <rect x="58" y="86" width="8" height="6" fill="black"/>
    <rect x="72" y="86" width="6" height="6" fill="black"/>
    <rect x="82" y="86" width="6" height="6" fill="black"/>
  </svg>`;
}

function generateCalendarSvg() {
  return `<svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="#FACC15" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="3" ry="3"></rect>
    <line x1="16" y1="2" x2="16" y2="6"></line>
    <line x1="8" y1="2" x2="8" y2="6"></line>
    <line x1="3" y1="10" x2="21" y2="10"></line>
    <circle cx="8" cy="14" r="1" fill="#FACC15"></circle>
    <circle cx="12" cy="14" r="1" fill="#FACC15"></circle>
    <circle cx="16" cy="14" r="1" fill="#FACC15"></circle>
    <circle cx="8" cy="18" r="1" fill="#FACC15"></circle>
    <circle cx="12" cy="18" r="1" fill="#FACC15"></circle>
    <circle cx="16" cy="18" r="1" fill="#FACC15"></circle>
  </svg>`;
}

function generateCodeBadgeSvg() {
  return `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="16 18 22 12 16 6"></polyline>
    <polyline points="8 6 2 12 8 18"></polyline>
  </svg>`;
}

class ThreadsHtmlRenderer {
  /**
   * Generates HTML markup for a structured slide card.
   */
  generateSlideHtml(spec) {
    const founder = knowledge.getFounderInfo();
    const companyInfo = knowledge.getCompanyInfo();
    const profiles = knowledge.getOfficialProfiles();
    const compTag = (companyInfo.name || "COMPANY").toUpperCase().slice(0, 10);

    const accent = spec.accentColor || "#00F0FF";
    const glow = spec.glowColor || "rgba(0, 240, 255, 0.12)";
    const badge = spec.badge || `${compTag} • INNOVATION`;
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
    const author = spec.author || `${founder.name || "Founder"} • ${founder.role || "Founder"}`;

    const isPixelGo = (spec.badge || "").includes("PIXELGO") ||
                      (spec.title || "").includes("PixelGo") ||
                      spec.pillar === "pixelgo_hms";
    const defaultSite = (profiles.company?.website || companyInfo.website || "").replace(/^https?:\/\//, "");
    const website = spec.website || (isPixelGo ? (companyInfo.productUrl ? companyInfo.productUrl.replace(/^https?:\/\//, "") : "pixelgo.live") : defaultSite);
    const company = spec.company || (isPixelGo ? (companyInfo.productName || "PRODUCT").toUpperCase() : (companyInfo.name || "COMPANY").toUpperCase());
    const logoDataUri = spec.logoDataUri || (isPixelGo ? getPixelGoLogoUri() : getCodeAirLogoUri());
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
    const founder = knowledge.getFounderInfo();
    const companyInfo = knowledge.getCompanyInfo();
    const profiles = knowledge.getOfficialProfiles();
    const compTag = (companyInfo.name || "COMPANY").toUpperCase().slice(0, 10);

    const accent = spec.accentColor || "#00F0FF";
    const glow = spec.glowColor || "rgba(0, 240, 255, 0.15)";
    const badge = spec.badge || `${compTag} • PERSPECTIVE`;
    const quote = spec.quote || "";
    const author = spec.author || founder.name || "Founder";
    const role = spec.role || `${founder.role || "Founder"}, ${companyInfo.name || "Software"}`;
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
    const defaultSite = (profiles.company?.website || companyInfo.website || "").replace(/^https?:\/\//, "");
    const website = spec.website || (isPixelGo ? (companyInfo.productUrl ? companyInfo.productUrl.replace(/^https?:\/\//, "") : "pixelgo.live") : defaultSite);
    const brandTag = spec.brandTag || (isPixelGo ? "PRODUCT" : compTag);
    const logoDataUri = spec.logoDataUri || (isPixelGo ? getPixelGoLogoUri() : getCodeAirLogoUri());
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
    <div class="brand-tag">${brandTag}</div>
  </div>
</body>
</html>`;
  }

  /**
   * Generates HTML markup for a dark-mode terminal code snippet card.
   */
  generateCodeCardHtml(spec) {
    const founder = knowledge.getFounderInfo();
    const companyInfo = knowledge.getCompanyInfo();
    const profiles = knowledge.getOfficialProfiles();
    const compTag = (companyInfo.name || "COMPANY").toUpperCase().slice(0, 10);
    const companyName = (companyInfo.name || "COMPANY").toUpperCase();

    const accent = spec.accentColor || "#00F0FF";
    const glow = spec.glowColor || "rgba(0, 240, 255, 0.15)";
    const badge = spec.badge || `${compTag} • ARCHITECTURE RUNTIME`;
    const title = spec.title || spec.code_title || "agent_orchestrator.ts";
    const rawCode = spec.code || spec.code_snippet || `// ${companyInfo.name || "Agent"} Autonomous Orchestration
const orchestrator = new AgenticPipeline({
  runtime: "gemini-3.8-flash-high",
  guardrails: { maxRetries: 3, deterministicFSM: true },
  async onEvent(event: StreamEvent): Promise<ActionVerdict> {
    const sanitized = sanitizeDomPayload(event.payload);
    return await verifyAndCommitAction(sanitized);
  }
});`;
    const language = spec.language || spec.code_language || "TypeScript";
    const author = spec.author || `${founder.name || "Founder"} • ${founder.role || "Founder"}`;
    const defaultSite = (profiles.company?.website || companyInfo.website || "").replace(/^https?:\/\//, "");
    const website = spec.website || defaultSite;
    const logoDataUri = spec.logoDataUri || getCodeAirLogoUri();

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
      ${logoDataUri ? `<img src="${logoDataUri}" class="brand-logo-codeair" alt="${companyName} Logo" />` : ''}
      <div class="footer-brand-info">
        <span class="company-name">${companyName}</span>
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
    const founder = knowledge.getFounderInfo();
    const companyInfo = knowledge.getCompanyInfo();
    const profiles = knowledge.getOfficialProfiles();
    const compTag = (companyInfo.name || "COMPANY").toUpperCase().slice(0, 10);
    const companyName = (companyInfo.name || "COMPANY").toUpperCase();

    const accent = spec.accentColor || "#00F0FF";
    const glow = spec.glowColor || "rgba(0, 240, 255, 0.16)";
    const badge = spec.badge || `${compTag} • TOPOLOGY BLUEPRINT`;
    const title = spec.title || spec.arch_title || "Distributed Agent Pipeline";
    const subtitle = spec.subtitle || "Resilient multi-stage execution with deterministic guardrails";
    const author = spec.author || `${founder.name || "Founder"} • ${founder.role || "Founder"}`;
    const defaultSite = (profiles.company?.website || companyInfo.website || "").replace(/^https?:\/\//, "");
    const website = spec.website || defaultSite;
    const logoDataUri = spec.logoDataUri || getCodeAirLogoUri();

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
      ${logoDataUri ? `<img src="${logoDataUri}" class="brand-logo-codeair" alt="${companyName} Logo" />` : ''}
      <div class="footer-brand-info">
        <span class="company-name">${companyName}</span>
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
   * Generates HTML markup for an executive "Developers Connect" style event / announcement card.
   * Replicates the exact modern visual aesthetic of the high-contrast developer graphic:
   * - Deep obsidian textured matrix background (#05070D)
   * - Neon Cyber Lime & Lemon Yellow 3D extruded title banners ("DEVELOPERS" / "CONNECT")
   * - Top chevron teaser: "▶▶▶ SOMETHING EXCITING IS COMING"
   * - High-contrast code badge: "< / >" + "HTML" / "TS" / "AI" chip
   * - Tagline: "Because Every Great Website Has A Developer Behind It"
   * - Right vertical spine text rotated 90deg with arrow markers
   * - Authentic vector QR code + "REGISTER YOUR INTEREST HERE" URL
   * - Calendar badge with launch date ("OCTOBER 29TH, 2026")
   */
  generateDeveloperConnectCardHtml(spec = {}) {
    const founder = knowledge.getFounderInfo();
    const companyInfo = knowledge.getCompanyInfo();
    const profiles = knowledge.getOfficialProfiles();

    const banner1 = (spec.banner1 || spec.titleTop || "DEVELOPERS").toUpperCase();
    const banner2 = (spec.banner2 || spec.titleBottom || "CONNECT").toUpperCase();
    const teaser = spec.teaser || "SOMETHING EXCITING IS COMING";
    const techTag = spec.techTag || "HTML";
    const tagline = spec.tagline || spec.subtitle || "Because Every Great Website Has A Developer Behind It";
    const defaultSite = (profiles.company?.website || companyInfo.website || "https://www.codeair.tech");
    const websiteUrl = spec.website || defaultSite;
    const registerLabel = spec.registerLabel || "REGISTER YOUR INTEREST HERE:";
    const dateText = spec.date || "OCTOBER 29TH, 2026";
    const verticalText = (spec.verticalText || "DEVELOPERS CONNECT").toUpperCase();
    const brandName = (spec.brandName || companyInfo.name || "CodeAir").toUpperCase();
    const logoDataUri = spec.logoDataUri || getCodeAirLogoUri();

    let cards = spec.cards;
    if (!Array.isArray(cards) || cards.length === 0) {
      cards = [
        { num: "01", title: "Enterprise Stack Standards", desc: "Build using modern TypeScript, Next.js, Node.js, and scalable backends." },
        { num: "02", title: "Collaborative Velocity", desc: "Work with experienced architects solving real client engineering challenges." },
        { num: "03", title: "Direct Revenue Share", desc: "Fair, transparent compensation directly tied to delivered project milestones." }
      ];
    }

    const cardsHtml = cards.slice(0, 3).map(c => `
      <div class="dev-card">
        <div class="dev-card-num">${c.num}</div>
        <div class="dev-card-info">
          <div class="dev-card-title">${c.title}</div>
          <div class="dev-card-desc">${c.desc}</div>
        </div>
      </div>
    `).join("");

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700;800;900&family=JetBrains+Mono:wght@700;800&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: 1080px;
    height: 1080px;
    background: #05070D;
    color: #F8FAFC;
    font-family: "Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, sans-serif;
    position: relative;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 60px 70px 54px 64px;
  }
  .ambient-glow-top {
    position: absolute;
    top: -140px;
    right: 40px;
    width: 580px;
    height: 580px;
    background: radial-gradient(circle, rgba(0, 255, 102, 0.16) 0%, rgba(16, 185, 129, 0.06) 45%, transparent 70%);
    pointer-events: none;
  }
  .ambient-glow-bottom {
    position: absolute;
    bottom: -160px;
    left: -120px;
    width: 620px;
    height: 620px;
    background: radial-gradient(circle, rgba(0, 255, 102, 0.12) 0%, rgba(250, 204, 21, 0.05) 50%, transparent 70%);
    pointer-events: none;
  }
  .cyber-dots {
    position: absolute;
    inset: 0;
    background-image: radial-gradient(rgba(0, 255, 102, 0.12) 1.5px, transparent 1.5px);
    background-size: 28px 28px;
    pointer-events: none;
  }
  .diagonal-mesh {
    position: absolute;
    top: 0;
    left: 0;
    width: 550px;
    height: 1080px;
    background: linear-gradient(135deg, rgba(0, 255, 102, 0.06) 0%, rgba(250, 204, 21, 0.02) 40%, transparent 80%);
    pointer-events: none;
  }
  .vertical-spine {
    position: absolute;
    right: 32px;
    top: 50%;
    transform: translateY(-50%) rotate(90deg);
    transform-origin: center center;
    display: flex;
    align-items: center;
    gap: 16px;
    white-space: nowrap;
    z-index: 20;
    user-select: none;
  }
  .spine-text {
    font-size: 13px;
    font-weight: 800;
    letter-spacing: 0.38em;
    color: #94A3B8;
    text-transform: uppercase;
  }
  .spine-arrows {
    display: flex;
    flex-direction: column;
    gap: 3px;
    color: #F8FAFC;
    font-size: 10px;
    transform: rotate(-90deg);
  }
  .header-row {
    position: relative;
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .brand-pill {
    display: inline-flex;
    align-items: center;
    gap: 12px;
  }
  .brand-logo-box {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .brand-logo-img {
    width: 38px;
    height: 38px;
    border-radius: 8px;
    object-fit: contain;
  }
  .brand-tag-dot {
    font-size: 32px;
    font-weight: 900;
    color: #00FF66;
    line-height: 1;
  }
  .brand-title {
    font-size: 26px;
    font-weight: 900;
    letter-spacing: -0.02em;
    color: #F8FAFC;
  }
  .brand-subtitle {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: #64748B;
    text-transform: uppercase;
    display: block;
    margin-top: -3px;
  }
  .teaser-banner {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 4px;
  }
  .teaser-chevrons {
    display: flex;
    align-items: center;
    gap: 4px;
    color: #FACC15;
    font-size: 18px;
    font-weight: 900;
    letter-spacing: -0.05em;
  }
  .teaser-text {
    font-size: 19px;
    font-weight: 900;
    letter-spacing: 0.04em;
    color: #FFFFFF;
    text-transform: uppercase;
  }
  .hero-block {
    position: relative;
    z-index: 10;
    margin-top: 14px;
  }
  .tech-badge-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
    padding-right: 60px;
  }
  .code-pill {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 6px 14px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(245, 158, 11, 0.4);
    box-shadow: 0 0 16px rgba(245, 158, 11, 0.15);
  }
  .chip-tag {
    font-family: "JetBrains Mono", monospace;
    font-size: 14px;
    font-weight: 900;
    letter-spacing: 0.08em;
    background: #00FF66;
    color: #05080D;
    padding: 6px 16px;
    border-radius: 8px;
    box-shadow: 0 4px 14px rgba(0, 255, 102, 0.35);
  }
  .banner-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-width: 820px;
  }
  .banner-box-green {
    background: #00FF66;
    padding: 12px 28px;
    border-radius: 6px;
    box-shadow: 12px 12px 0px #02240F, 0 16px 36px rgba(0, 255, 102, 0.25);
    display: inline-block;
  }
  .banner-title-dark {
    font-size: 58px;
    font-weight: 900;
    letter-spacing: -0.035em;
    line-height: 1;
    color: #05080D;
    text-transform: uppercase;
  }
  .banner-box-yellow {
    background: #FACC15;
    padding: 12px 28px;
    border-radius: 6px;
    box-shadow: 12px 12px 0px #2E2300, 0 16px 36px rgba(250, 204, 21, 0.25);
    display: inline-block;
  }
  .banner-title-yellow-dark {
    font-size: 58px;
    font-weight: 900;
    letter-spacing: -0.035em;
    line-height: 1;
    color: #05080D;
    text-transform: uppercase;
  }
  .hero-tagline {
    font-size: 21px;
    font-weight: 600;
    color: #CBD5E1;
    line-height: 1.4;
    margin-top: 20px;
    max-width: 780px;
  }
  .cards-container {
    position: relative;
    z-index: 10;
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin: 18px 0;
    max-width: 840px;
  }
  .dev-card {
    display: flex;
    align-items: center;
    gap: 20px;
    padding: 14px 22px;
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.035);
    border: 1px solid rgba(0, 255, 102, 0.2);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
  }
  .dev-card-num {
    font-size: 15px;
    font-weight: 900;
    letter-spacing: 0.04em;
    color: #00FF66;
    background: rgba(0, 255, 102, 0.12);
    border: 1px solid rgba(0, 255, 102, 0.35);
    padding: 6px 12px;
    border-radius: 8px;
    flex-shrink: 0;
  }
  .dev-card-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .dev-card-title {
    font-size: 17px;
    font-weight: 800;
    color: #F8FAFC;
    letter-spacing: -0.01em;
  }
  .dev-card-desc {
    font-size: 14px;
    font-weight: 500;
    color: #94A3B8;
    line-height: 1.35;
  }
  .footer-row {
    position: relative;
    z-index: 10;
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    padding-top: 18px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    max-width: 880px;
  }
  .qr-group {
    display: flex;
    align-items: center;
    gap: 20px;
  }
  .qr-frame {
    padding: 6px;
    background: #FFFFFF;
    border-radius: 12px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
    flex-shrink: 0;
  }
  .qr-info {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .qr-heading {
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.12em;
    color: #94A3B8;
    text-transform: uppercase;
  }
  .qr-action {
    font-size: 17px;
    font-weight: 900;
    letter-spacing: 0.02em;
    color: #00FF66;
    text-transform: uppercase;
  }
  .qr-url {
    font-family: "JetBrains Mono", monospace;
    font-size: 13px;
    font-weight: 700;
    color: #F8FAFC;
    word-break: break-all;
    margin-top: 2px;
  }
  .date-badge {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 10px 20px;
    border-radius: 12px;
    background: rgba(250, 204, 21, 0.08);
    border: 1px solid rgba(250, 204, 21, 0.25);
  }
  .date-text-group {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .date-label {
    font-size: 10.5px;
    font-weight: 800;
    letter-spacing: 0.14em;
    color: #FACC15;
    text-transform: uppercase;
  }
  .date-value {
    font-size: 19px;
    font-weight: 900;
    color: #FFFFFF;
    letter-spacing: 0.02em;
  }
</style>
</head>
<body>
  <div class="ambient-glow-top"></div>
  <div class="ambient-glow-bottom"></div>
  <div class="cyber-dots"></div>
  <div class="diagonal-mesh"></div>

  <div class="vertical-spine">
    <span class="spine-text">${verticalText}</span>
    <div class="spine-arrows">
      <span>&#9660;</span>
      <span>&#9660;</span>
      <span>&#9660;</span>
    </div>
  </div>

  <div class="header-row">
    <div class="brand-pill">
      ${logoDataUri ? `<img src="${logoDataUri}" class="brand-logo-img" alt="Logo" />` : `<span class="brand-tag-dot">.</span>`}
      <div class="brand-logo-box">
        <div>
          <span class="brand-title">${brandName}</span>
          <span class="brand-subtitle">Software Solutions</span>
        </div>
      </div>
    </div>
    <div class="teaser-banner">
      <div class="teaser-chevrons">&gt;&gt;&gt;</div>
      <div class="teaser-text">${teaser}</div>
    </div>
  </div>

  <div class="hero-block">
    <div class="tech-badge-row">
      <div class="code-pill">
        ${generateCodeBadgeSvg()}
      </div>
      <div class="chip-tag">${techTag}</div>
    </div>
    <div class="banner-group">
      <div>
        <div class="banner-box-green">
          <div class="banner-title-dark">${banner1}</div>
        </div>
      </div>
      <div>
        <div class="banner-box-yellow">
          <div class="banner-title-yellow-dark">${banner2}</div>
        </div>
      </div>
    </div>
    <div class="hero-tagline">${tagline}</div>
  </div>

  <div class="cards-container">
    ${cardsHtml}
  </div>

  <div class="footer-row">
    <div class="qr-group">
      <div class="qr-frame">
        ${generateQrSvg()}
      </div>
      <div class="qr-info">
        <span class="qr-heading">BE AMONG THE FIRST TO KNOW</span>
        <span class="qr-action">${registerLabel}</span>
        <span class="qr-url">${websiteUrl}</span>
      </div>
    </div>
    <div class="date-badge">
      ${generateCalendarSvg()}
      <div class="date-text-group">
        <span class="date-label">LAUNCH &bull; EVENT</span>
        <span class="date-value">${dateText}</span>
      </div>
    </div>
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
