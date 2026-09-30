const growthState = require("./growth-state-store");
const { GrowthRunner } = require("./growth-runner");
const { getPlatform } = require("./professional-growth-platform-registry");

async function runSkillDevelopment({ browserManager, aiRuntime, profile, skill, plan, platformId }) {
  const platform = getPlatform(platformId);
  if (!platform || platform.enabled === false) throw new Error("Selected growth platform is not enabled: " + platformId);
  if (!platform.url) throw new Error("Selected growth platform has no configured URL: " + platformId);

  const page = await browserManager.pageFor(platform.url);
  const runner = new GrowthRunner({ aiRuntime, page, platformId: platform.id });
  const goal = `Develop the selected professional skill using the live platform UI.

SKILL:
${skill}

PLATFORM:
${JSON.stringify(platform)}

SKILL PLAN:
${JSON.stringify(plan || {})}

OPERATING RULES:
- Inspect the current account/progress before acting.
- Select the next useful learning or practice activity from the visible platform state.
- Use the skill plan as reasoning context, not as a script.
- Continue from persisted progress where possible.
- Stop only when the selected objective is visibly complete or a user-only action is required.
- Never claim a milestone without visible evidence.
- Do not purchase anything.
- Never bypass CAPTCHA, MFA, identity verification, proctoring or security controls.`;

  const id = "skill:" + skill.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const existingGoal = growthState.getGoal(id);
  if (!existingGoal || (existingGoal.status !== "IN_PROGRESS" && existingGoal.status !== "STARTED")) {
    growthState.metric("goalsStarted");
  }
  const result = await runner.run({
    goal,
    platform,
    profile,
    context: {
      skill,
      plan: plan || {},
      mode: "SKILL_DEVELOPMENT",
      resumeFromState: true
    },
    allowedOrigin: new URL(platform.url).origin,
    onIteration: ({ iteration, snapshot, plan: iterationPlan, result: actionResult }) => {
      growthState.setGoal({
        id,
        type: "SKILL_DEVELOPMENT",
        skill,
        platform: platform.id,
        status: "IN_PROGRESS",
        lastIteration: iteration,
        lastDecision: iterationPlan?.reason || "",
        lastPageUrl: snapshot?.url || "",
        lastActionState: actionResult?.state || "",
        updatedAt: new Date().toISOString()
      });
    }
  });

  growthState.setGoal({
    id,
    type: "SKILL_DEVELOPMENT",
    platform: platform.id,
    skill,
    status: result.status,
    reason: result.reason || "",
    updatedAt: new Date().toISOString()
  });
  if (result.status === "DONE" && existingGoal?.status !== "DONE") growthState.metric("goalsCompleted");
  return result;
}

module.exports = { runSkillDevelopment };
