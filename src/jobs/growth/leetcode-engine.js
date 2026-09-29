const { runSkillDevelopment } = require("./skill-development-engine");

async function runLeetCode({ browserManager, aiRuntime, profile, skill, plan, platformId = "leetcode" }) {
  return runSkillDevelopment({
    browserManager,
    aiRuntime,
    profile,
    skill,
    plan,
    platformId
  });
}

module.exports = { runLeetCode, runSkillDevelopment };
