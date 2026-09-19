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
    const cards = spec.cards || [];
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
    gap: 16px;
    margin: 28px 0;
  }
  .card {
    display: flex;
    align-items: flex-start;
    gap: 22px;
    padding: 22px 26px;
    border-radius: 18px;
    background: rgba(255, 255, 255, 0.025);
    border: 1px solid rgba(255, 255, 255, 0.07);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
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
   */
  generateQuoteCardHtml(spec) {
    const accent = spec.accentColor || "#00F0FF";
    const glow = spec.glowColor || "rgba(0, 240, 255, 0.15)";
    const badge = spec.badge || "CODEAIR • PERSPECTIVE";
    const quote = spec.quote || "";
    const author = spec.author || "Sunmughan Swamy";
    const role = spec.role || "Founder, CodeAir Software Solutions";
    const footerTag = spec.footerTag || "BUILDER NETWORK";

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
    padding: 80px;
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
    margin: auto 0;
  }
  .quote-mark {
    font-size: 72px;
    font-weight: 800;
    line-height: 1;
    color: ${accent};
    opacity: 0.6;
    margin-bottom: 8px;
  }
  .quote-text {
    font-size: 44px;
    font-weight: 800;
    line-height: 1.25;
    letter-spacing: -0.03em;
    background: linear-gradient(180deg, #FFFFFF 15%, #CBD5E1 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  .author-card {
    position: relative;
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: 32px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }
  .author-info {
    display: flex;
    align-items: center;
    gap: 18px;
  }
  .author-avatar-img {
    width: 54px;
    height: 54px;
    border-radius: 14px;
    object-fit: contain;
    box-shadow: 0 4px 16px rgba(0, 80, 255, 0.4);
  }
  .author-avatar-pixelgo {
    height: 52px;
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
    font-size: 19px;
    font-weight: 800;
    color: #F8FAFC;
    letter-spacing: -0.02em;
  }
  .author-role {
    font-size: 14px;
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
