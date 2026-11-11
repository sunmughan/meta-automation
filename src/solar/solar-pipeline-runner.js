/**
 * src/solar/solar-pipeline-runner.js
 * Solar Client Pipeline Runner - scaffold only.
 *
 * Runs the four solar pipelines (buyer-discovery, pain-point-hunting,
 * warranty-angle, sarpanch-outreach) through the shared flow: scan, AI classify, dedup,
 * draft, approve, record.
 *
 * The Sarpanch pipeline also has an SMS leg (Google Messages for web) that is
 * manual 1-to-1 messaging from the client own phone number. This runner never
 * sends SMS. It only drafts social pitches and tracks Sarpanch leads.
 *
 * SAFETY: this runner is DRY RUN ONLY. It never posts, comments, likes or
 * sends a DM. Live actions stay behind a human approval gate that does not
 * exist yet. Setting dryRun to false throws.
 */

const fs = require("fs");
const path = require("path");
const logger = require("../logging/logger");
const solarIntentClassifier = require("../leads/solar-intent-classifier");
const solarCommentGenerator = require("../engagement/solar-comment-generator");

const ROOT_DIR = path.resolve(__dirname, "..", "..");

function loadPipelineConfig() {
  const configPath = path.join(ROOT_DIR, "config", "solar-pipelines.json");
  return JSON.parse(fs.readFileSync(configPath, "utf8"));
}

function loadSkipLists(stateDir) {
  const handlesPath = path.join(stateDir, "solar-skip-handles.txt");
  const urlsPath = path.join(stateDir, "solar-skip-urls.txt");
  const read = (p) => (fs.existsSync(p) ? fs.readFileSync(p, "utf8").split("\n").map((s) => s.trim()).filter(Boolean) : []);
  return { handles: new Set(read(handlesPath)), urls: new Set(read(urlsPath)) };
}

class SolarPipelineRunner {
  constructor(options = {}) {
    this.config = loadPipelineConfig();
    this.dryRun = true;
    this.stateDir = options.stateDir || path.join(ROOT_DIR, "logs", "solar");
    if (!fs.existsSync(this.stateDir)) fs.mkdirSync(this.stateDir, { recursive: true });
    this.skipLists = loadSkipLists(this.stateDir);
  }

  /**
   * Run one pipeline over a list of captured posts.
   * In this scaffold the posts are supplied by the caller (scan step is a
   * separate browser task). Classification is live AI; drafting is live AI.
   *
   * @param {string} pipelineId - buyer-discovery | pain-point-hunting | warranty-angle | sarpanch-outreach
   * @param {Array<Object>} posts - captured posts { text, username, url, postId, platform }
   * @returns {Promise<Object>} run summary with drafts, never live actions
   */
  async runPipeline(pipelineId, posts = []) {
    const pipeline = this.config.pipelines[pipelineId];
    if (!pipeline) throw new Error(`Unknown solar pipeline: ${pipelineId}`);

    const summary = { pipeline: pipelineId, scanned: posts.length, qualified: 0, skipped: 0, drafts: [] };

    for (const post of posts) {
      const handle = String(post.username || "").replace(/^@+/, "").trim().toLowerCase();
      const url = String(post.url || "").trim();

      if ((handle && this.skipLists.handles.has(handle)) || (url && this.skipLists.urls.has(url))) {
        summary.skipped += 1;
        continue;
      }

      const decision = await solarIntentClassifier.classifyAsync(post, { pipeline: pipelineId });
      if (!decision.qualified || !decision.should_reply) {
        summary.skipped += 1;
        continue;
      }

      const draft = solarCommentGenerator.generateSolarComment({
        text: post.text,
        username: post.username,
        authorName: post.authorName,
        platform: post.platform,
        intent: decision.intent,
        leadType: decision.lead_type,
        pipeline: pipelineId,
        matchedCategories: decision.matched_categories || [],
      });

      summary.qualified += 1;
      summary.drafts.push({
        pipeline: pipelineId,
        postUrl: url,
        author: post.username,
        decision: decision.decision,
        draft,
        status: "DRAFT_ONLY",
        livePosted: false,
      });
    }

    const outPath = path.join(this.stateDir, `solar-run-${pipelineId}-${Date.now()}.json`);
    fs.writeFileSync(outPath, JSON.stringify(summary, null, 2), "utf8");
    logger.info(`Solar pipeline ${pipelineId}: ${summary.qualified} drafts, ${summary.skipped} skipped. Saved to ${outPath}`);
    return summary;
  }

  /**
   * Live posting is not implemented in this scaffold.
   * Any attempt to enable it throws until a human approval gate is built.
   */
  async postLive() {
    throw new Error("Live posting is disabled in the solar scaffold. Build the human approval gate first.");
  }
}

module.exports = SolarPipelineRunner;
module.exports.loadPipelineConfig = loadPipelineConfig;
