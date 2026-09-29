const JobAgentRunner = require("../browser/job-runner");
const state = require("./certification-state-store");
const { getEnabled } = require("./certification-platform-registry");

function itemKey(platformId, credentialId) {
  return `${platformId}:${credentialId}`;
}

function buildGoal(platform, credential) {
  return `Complete this free professional credential through the live website UI.

PLATFORM:
${platform.name}

CREDENTIAL:
${JSON.stringify(credential)}

REQUIREMENTS:
- Use only the visible website UI and the configured browser session.
- Find the exact credential/course from visible catalog/search results.
- Enroll or start learning when required.
- Complete lessons, labs, projects, quizzes and assessments using the candidate's verified knowledge and allowed assistance.
- Continue until the platform visibly confirms that the credential/certificate/badge has been issued.
- Never purchase a course, exam, subscription, credit, membership or upgrade.
- Never bypass CAPTCHA, bot checks, identity verification, proctoring, security controls or required legal/personal attestations.
- Never claim completion without visible platform evidence.
- When a user-only action is required, stop with USER_ACTION_REQUIRED or MANUAL_ACTION_REQUIRED and preserve the exact reason.
- Re-inspect the live page after every action batch.`;
}

async function runCredential({ platform, credential, page, browserAgent, aiRuntime, candidateProfile }) {
  const credentialId = credential.id || credential.title || "credential";
  const key = itemKey(platform.id, credentialId);
  const previous = state.get(key);

  if (previous?.status === "COMPLETED") {
    return { status: "COMPLETED", key, credential: previous };
  }

  state.upsert({
    key,
    platformId: platform.id,
    platformName: platform.name,
    credentialId,
    credentialTitle: credential.title || "",
    status: previous?.status || "DISCOVERED",
    startedAt: previous?.startedAt || new Date().toISOString()
  });

  if (!previous) state.metric("discovered");

  const runner = new JobAgentRunner({ aiRuntime, browserAgent });
  const result = await runner.run({
    goal: buildGoal(platform, credential),
    platform,
    candidateProfile,
    allowedOrigin: new URL(platform.url).origin,
    targetId: `certification:${key}`,
    context: {
      workflow: "JOB_CERTIFICATION",
      platformId: platform.id,
      credentialId,
      credentialTitle: credential.title || "",
      freeOnly: true,
      neverPurchase: true,
      completionRule: "VISIBLE_CREDENTIAL_ISSUED"
    }
  });

  const now = new Date().toISOString();
  const base = {
    key,
    platformId: platform.id,
    platformName: platform.name,
    credentialId,
    credentialTitle: credential.title || "",
    lastRunAt: now
  };

  if (result.status === "DONE") {
    state.upsert({
      ...base,
      status: "COMPLETED",
      completedAt: now,
      credentialUrl: result.snapshot?.url || null,
      evidence: result.reason || "Visible completion state reached"
    });
    state.metric("completed");
  } else if (result.status === "MAX_ITERATIONS") {
    state.upsert({ ...base, status: "IN_PROGRESS", reason: result.reason || "" });
    state.metric("inProgress");
  } else if (["USER_ACTION_REQUIRED", "MANUAL_ACTION_REQUIRED", "BLOCKED"].includes(result.status)) {
    state.upsert({ ...base, status: result.status, reason: result.reason || "" });
    state.metric("blocked");
  } else {
    state.upsert({ ...base, status: result.status || "FAILED", reason: result.reason || "" });
    state.metric("failed");
  }

  return { ...result, key };
}

async function runCatalog({ browserManager, browserAgentFactory, aiRuntime, candidateProfile, credentialsByPlatform = {} }) {
  const report = {};

  for (const platform of getEnabled()) {
    const page = await browserManager.openPlatform(platform);
    const agent = browserAgentFactory(page, platform.id);
    const credentials = Array.isArray(credentialsByPlatform[platform.id])
      ? credentialsByPlatform[platform.id].filter(c => c && c.enabled !== false)
      : [];

    report[platform.id] = {
      platform: platform.name,
      status: credentials.length ? "RUNNING" : "READY_FOR_DISCOVERY",
      credentials: []
    };

    if (!credentials.length) {
      browserManager.disconnect();
      continue;
    }

    for (const credential of credentials) {
      report[platform.id].credentials.push(
        await runCredential({
          platform,
          credential,
          page,
          browserAgent: agent,
          aiRuntime,
          candidateProfile
        })
      );
    }

    browserManager.disconnect();
  }

  return report;
}

module.exports = { runCredential, runCatalog };
