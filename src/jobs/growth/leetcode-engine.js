const growthState = require("./growth-state-store");
const { GrowthRunner } = require("./growth-runner");
const CONFIG = require("../../../config");

async function runLeetCode({ browserManager, aiRuntime, profile, skill }) {
  const platform = {
    id: "leetcode",
    name: "LeetCode",
    url: "https://leetcode.com/",
    kind: "SKILL_DEVELOPMENT"
  };

  const page = await browserManager.pageFor(platform.url);
  const runner = new GrowthRunner({ aiRuntime, page, platformId: platform.id });
  const goal = `Improve the user's LeetCode skill in: ${skill}.
Use the currently logged-in LeetCode account.
Study the visible account state and current progress before acting.
Select the next useful learning/practice activity for the selected skill.
Work through visible learning/practice activities and keep progressing from the current state.
Persist progress after meaningful milestones.
Do not use passwords or security codes.
Stop when a user-only security action is required or when the selected learning objective is visibly completed.`;

  growthState.metric("goalsStarted");
  const result = await runner.run({
    goal,
    platform,
    profile,
    context: { skill, mode: "SKILL_DEVELOPMENT", resumeFromState: true },
    allowedOrigin: new URL(platform.url).origin
  });

  const id = "leetcode:" + skill.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  growthState.setGoal({
    id,
    type: "SKILL_DEVELOPMENT",
    platform: "leetcode",
    skill,
    status: result.status,
    reason: result.reason || "",
    updatedAt: new Date().toISOString()
  });
  if (result.status === "DONE") growthState.metric("goalsCompleted");
  return result;
}

module.exports = { runLeetCode };
