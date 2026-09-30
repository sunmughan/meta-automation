const { BrowserAgent } = require("../../agent/browser-agent");
const { discoverCredentials, verifyCredentialPage } = require("./growth-ai");
const growthState = require("./growth-state-store");
const { getDiscoveryConfig } = require("./professional-growth-platform-registry");
const CONFIG = require("../../../config");

async function discoverForSkill({ browserManager, aiRuntime, skill }) {
  const discovery = getDiscoveryConfig();
  if (discovery.enabled === false) return [];

  const queryTemplate = discovery.queryTemplate || "{skill} free certificate certification digital credential course";
  const query = encodeURIComponent(queryTemplate.replace("{skill}", skill));
  const searchUrl = (discovery.searchUrlTemplate || CONFIG.PROFESSIONAL_GROWTH_SEARCH_URL).replace("{query}", query);
  const page = await browserManager.pageFor(searchUrl);
  const agent = new BrowserAgent(page, "credential-discovery");
  const searchSnapshot = await agent.captureLiveSnapshot("credential-search");
  const discovered = await discoverCredentials({ skill, searchSnapshot, aiRuntime });

  const limit = Math.min(
    CONFIG.PROFESSIONAL_GROWTH_MAX_DISCOVERY_CANDIDATES,
    Number(discovery.maxCandidatesPerQuery) || CONFIG.PROFESSIONAL_GROWTH_MAX_DISCOVERY_CANDIDATES
  );
  const candidates = Array.isArray(discovered?.candidates) ? discovered.candidates.slice(0, limit) : [];
  const verified = [];

  for (const candidate of candidates) {
    if (!candidate.url) continue;
    try {
      const candidatePage = await browserManager.pageFor(candidate.url);
      const candidateAgent = new BrowserAgent(candidatePage, "credential:" + (candidate.issuer || "unknown"));
      const snapshot = await candidateAgent.captureLiveSnapshot("credential-page");
      const result = await verifyCredentialPage({ skill, snapshot, aiRuntime });
      if (result?.isCredential && result?.free === true && result?.issueEvidence) {
        const item = {
          id: Buffer.from(candidate.url).toString("base64url").slice(0, 40),
          ...candidate,
          ...result,
          discoveredAt: new Date().toISOString()
        };
        growthState.transitionCredential(item.id, "DISCOVERED", item);
        growthState.metric("credentialsDiscovered");
        verified.push(item);
      }
    } catch (_) {
      // Discovery is best-effort; the AI must re-verify each candidate on its own page.
    }
  }

  return verified;
}

module.exports = { discoverForSkill };
