const assert = require("assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const onboarding = fs.readFileSync(path.join(ROOT, "threads-agent.js"), "utf8");
const runner = fs.readFileSync(path.join(ROOT, "src/social/agentic-social-runner.js"), "utf8");

const requiredPrompts = [
  "Full name",
  "Role / title",
  "Professional bio",
  "Skills / expertise",
  "Timezone",
  "LinkedIn URL",
  "Threads username",
  "Company / brand name",
  "Company website",
  "Ideal customers / audience",
  "Approved services",
  "Excluded / do-not-sell services",
  "Communication style",
  "Primary objective",
  "Allow autonomous likes?",
  "Allow autonomous comments?",
  "Allow autonomous replies?",
  "Allow autonomous DM replies?",
  "Allow autonomous follows?",
  "Allow autonomous connection requests?",
  "Allow autonomous publishing?",
  "Browser (auto/chrome/edge/brave/chromium)",
  "Browser CDP URL",
  "Enabled platforms",
  "Execution mode",
  "Start in DRY RUN mode?",
  "Require approval before side effects?",
  "Max likes/hour",\n  "Max comments/hour",
  "Max replies/hour",
  "Max DMs/hour",
  "Max follows/hour",
  "Max connections/hour",
  "Max publishes/hour",
  "AI provider"
];

for (const prompt of requiredPrompts) {
  assert(onboarding.includes(prompt), "Onboarding missing: " + prompt);
}

assert(onboarding.includes("private/user-profile.json"), "Onboarding must persist structured user profile");
assert(onboarding.includes("MINIMAX_API_KEY"), "Onboarding must support MiniMax credentials");
assert(!onboarding.includes("fb_live_"), "Onboarding must not contain a hardcoded API credential");
assert(!onboarding.includes("new RegExp("), "Onboarding must not use regex env mutation");
assert(!onboarding.includes("replace(/^@/"), "Onboarding must not use regex identity normalization");

for (const control of [
  "autoLike",
  "autoComment",
  "autoReply",
  "autoDm",
  "autoFollow",
  "autoConnect",
  "autoPublish"
]) {
  assert(runner.includes(control), "V2 runner must enforce onboarding control: " + control);
}

assert(runner.includes("DRY_RUN_BLOCKED"), "V2 runner must enforce dry-run");
assert(runner.includes("APPROVAL_REQUIRED"), "V2 runner must enforce approval mode");
assert(runner.includes("actionPolicy.canPerform"), "V2 runner must enforce side-effect budgets");
assert(runner.includes("actionPolicy.record"), "V2 runner must record verified side effects");

console.log("Agentic V2 onboarding audit passed.");
