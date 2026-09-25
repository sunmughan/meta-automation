#!/usr/bin/env node

const { AgenticSocialRunner } = require("./src/social/agentic-social-runner");

function args() {
  const out = {};
  for (const item of process.argv.slice(2)) {
    if (!item.startsWith("--")) continue;
    const body = item.slice(2);
    const split = body.indexOf("=");
    if (split < 0) {
      out[body] = true;
    } else {
      out[body.slice(0, split)] = body.slice(split + 1);
    }
  }
  return out;
}

async function main() {
  const options = args();
  const runner = new AgenticSocialRunner({
    maxIterations: Number(options.iterations || process.env.SOCIAL_AGENT_MAX_ITERATIONS || 8)
  });

  if (options.resume) runner.guard.resume();

  const results = await runner.runContinuous({
    once: Boolean(options.once),
    platform: options.platform,
    goal: options.goal,
    intervalMs: Number(options.interval || 0) || undefined
  });

  console.log(JSON.stringify(results, null, 2));
}

if (require.main === module) {
  main().catch(err => {
    console.error(err.message);
    process.exit(1);
  });
}

module.exports = { main, args };
