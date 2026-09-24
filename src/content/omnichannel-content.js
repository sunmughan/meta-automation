/**
 * One master content idea -> platform-native adaptations.
 * No platform template code; adaptation is model-driven.
 */

const knowledge = require("../knowledge/knowledge-engine");

class OmnichannelContent {
  constructor({ aiRuntime }) {
    this.aiRuntime = aiRuntime;
  }

  async generate(masterIdea, platforms = ["threads", "facebook", "linkedin"]) {
    const company = knowledge.getCompanyInfo();
    const founder = knowledge.getFounderInfo();

    const prompt = [
      "Create platform-native versions of one master content idea.",
      "Keep the underlying factual idea consistent while adapting length, tone, formatting, and CTA to each platform.",
      "Do not copy platform-specific boilerplate.",
      "Do not invent claims not supported by the master idea or supplied brand context.",
      "Return JSON with one object per platform containing postText, contentIntent, and suggestedCTA.",
      "",
      "MASTER IDEA:",
      String(masterIdea || ""),
      "BRAND:",
      JSON.stringify({
        company: company?.name,
        summary: company?.summary,
        founder: founder?.name,
        role: founder?.role
      }),
      "PLATFORMS:",
      JSON.stringify(platforms)
    ].join("\n");

    return this.aiRuntime.callAi(prompt, {
      taskType: "OMNICHANNEL_CONTENT",
      priority: 3
    });
  }
}
module.exports = OmnichannelContent;
