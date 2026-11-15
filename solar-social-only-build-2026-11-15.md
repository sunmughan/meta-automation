# Solar-social-only branch build — 2026-11-15

Branch: `solar-social-only` (from `solar-client-pipeline` @ `31a3c9b`)
Build commit: `14c2537` (54 files changed, +71 / -5130)
Run-log commit: `64cb29c` (this file)
Pushed to GitHub: NO (per task; local branch only)
`main` and `solar-client-pipeline`: untouched (`solar-client-pipeline` still @ `31a3c9b`)

## What was removed (31 files deleted)

- `src/jobs/` — entire job-automation engine (15 files: ai, application,
  browser, discovery, documents, email, meetings, platform-registry,
  platform-session, profile, registration, storage)
- `src/orchestrator/master-orchestrator.js` — job-only orchestrator
- `job-agent.js`, `config/job-platforms.json`, `JOB_REVENUE_ENGINE.md`
- `scripts/setup-job-engine.js`, `scripts/upload-freelancer-portfolio.js`,
  `scripts/generate-portfolio-cards.js`, `scripts/launch-job-browser.js`,
  `scripts/layout-cdp-windows.js`
- `start-job-automation`, `start-job-automation.bat`,
  `start-job-automation.ps1`, `status-job-automation`, `stop-job-automation`
- `tests/job-engine-audit.js`

## What was edited (24 files, job paths stripped, solar/social kept)

- `src/core/autopilot-manager.js` — rewritten social-only: 1 mode, no mode
  prompt, no Freelancer-only browser enforcement, no job launcher
- `scripts/desktop-runner.js` — rewritten social-only (CDP :9222 only)
- `src/agent/agentic-runner.js` — removed `candidateProfile` (job-only)
  plumbing; `maxIterations` default is now plain `12`
- `src/agent/social-operations.js` — `maxIterations` plain `10`
  (was `CONFIG.JOB_MAX_PLAN_ITERATIONS`)
- `src/ai/ai-runtime.js`, `src/agent/browser-agent.js` — header/comment wording
- `config/index.js` — all `JOB_*` keys removed, `DESKTOP_SPLIT_PERCENT` removed
- `threads-agent.js` — `master`/`orchestrator` command and `run --master`
  branch removed
- `package.json` — `start:job`, all `jobs:*`, `desktop:layout` scripts
  removed; test script no longer references `job-engine-audit.js`;
  `job-automation` keyword removed
- `README.md` — Dual Autopilot / Job Revenue Engine sections removed;
  architecture diagram collapsed to the social plane only
- `roadmap.md` — "Job revenue plane" section removed
- `acceptance-matrix.json` — 5 Job Engine entries removed (21 remain)
- `status-automation`, `stop-automation`, `stop-automation.ps1` — job
  worker / job CDP :9223 / job state / job log sections removed
- `start-automation` — header now social-only
- `installers/install-{linux,macos,windows.ps1,android-termux}.sh` —
  job-agent chmod lines, setup-job-engine steps, job launch echos removed
- `.env.example` — whole "AGENTIC JOB REVENUE ENGINE" section + desktop
  split vars removed; `.gitignore` — `job-state/`, `applications/`,
  `job-agent.pid` removed
- `tests/autopilot-modes.test.js`, `tests/desktop-runner.test.js` —
  rewritten for the single social mode + absence assertions

## Verification grep (after commit)

Pattern `freelance|certificate|job-platform|jobPlatform|job-engine|
job_agent|job-agent|jobs/|job_state|job-state` (case-insensitive) matches
only the files below. No `require` of any deleted module remains anywhere
(checked separately for `src/jobs`, `master-orchestrator`, `job-agent`,
`job-platforms`, `layout-cdp-windows`, `launch-job-browser`,
`setup-job-engine`, `upload-freelancer`, `generate-portfolio`,
`portfolio-syncer`, `platform-registry`, `job-state`, `CONFIG.JOB_*` —
zero hits outside the intentional test assertions).

### Intentionally retained (NOT job functionality)

| File | Matches | Why kept |
|---|---|---|
| `src/ai/ai-decision-engine.js` (7) | `freelance`, `job seeker`, `career` regexes + prompts | Social lead filter: these patterns REJECT sellers / job-seekers / career-advice posts. They are what keeps solar pitches away from non-buyers. |
| `knowledge/company.md` (4), `knowledge/lead-rules.md` (2), `knowledge/examples.md` (1), `knowledge/search-queries.md` (3), `knowledge/pillars.md` (1) | seller / job-seeker examples, "looking for freelance developer" search phrases, "Freelancers" as audience word | Same screening knowledge the AI engine reads; no job-hunting instructions remain. |
| `tests/fixtures/legacy-classifier.js` (15), `tests/suite.js` (8), `tests/facebook-search.test.js` (2), `tests/pillar-and-search-audit.js` (1) | seller-post fixtures ("I'm a freelance AI developer…"), buyer-hiring-a-freelancer fixtures, "Corporate job ads must be disqualified" | Test fixtures for the skip-buyer-vs-seller classifier. |
| `tests/autopilot-modes.test.js` (3), `tests/desktop-runner.test.js` (1) | `job-agent.js` / `config/job-platforms.json` strings | Negative assertions: these files MUST NOT exist / MUST NOT be referenced. |
| `installers/install-linux.sh` (1) | `ca-certificates` | System TLS package name, unrelated to any certificate pipeline. |
| `src/platforms/threads/threads-media.js` (1) | "Background Job Queues" | Carousel card title about Redis/BullMQ background queues, unrelated to freelance jobs. |

Zero `certificate` references exist in the repo other than `ca-certificates`
above. No certificate pipeline ever existed in this repo.

## Safety (verified, not assumed)

- `config/index.js`: `DRY_RUN=true` (default, `process.env.DRY_RUN !== "false"`)
- `config/solar-pipelines.json`: `dryRun=true`, `livePosting=false`,
  `approvalRequired=true`, `maxRepliesPerDayPerPlatform=15`
- Scope: `state=Madhya Pradesh`, `stateOnly=true`
- SMS channel (config only): `google-messages-web`, sender "Amit Mathur, the
  client's own phone and SIM number", quota 100/day, manual 1-to-1 only
- `SolarPipelineRunner.postLive()` throws by design (verified below)

## Dry-run verification (REAL, no mocks)

Command: `node /tmp/solar-dryrun-verify.js` (script at `/tmp/solar-dryrun-verify.js`,
full log at `/tmp/solar-dryrun-2026-11-15.log`). Exit code 0.

Real output (verbatim, timestamps trimmed):

```
PIPELINES: buyer-discovery, pain-point-hunting, sarpanch-outreach, warranty-angle
SAFETY: dryRun=true livePosting=false approvalRequired=true maxRepliesPerDayPerPlatform=15
SCOPE: state=Madhya Pradesh stateOnly=true cities=Indore|Bhopal|Jabalpur|Gwalior|Ujjain|Sagar|Dewas|Satna|Ratlam|Rewa
SMS: channel=google-messages-web sender=Amit Mathur, the client's own phone and SIM number quota=100/day
SCREENING: antigravity-ai-live-reasoning
EMPTY-RUN buyer-discovery: scanned=0 qualified=0 skipped=0 drafts=0
EMPTY-RUN pain-point-hunting: scanned=0 qualified=0 skipped=0 drafts=0
EMPTY-RUN sarpanch-outreach: scanned=0 qualified=0 skipped=0 drafts=0
EMPTY-RUN warranty-angle: scanned=0 qualified=0 skipped=0 drafts=0
WARN: Antigravity CLI unavailable/failed; trying local Language Server bridge: Antigravity CLI (agy) is not available in PATH
WARN: [AI Engine] External AI unavailable (Antigravity Language Server session not found on localhost). Routing to grounded local semantic analysis for post sample1...
WARN: [AI Engine] External AI unavailable (Antigravity Language Server session not found on localhost). Routing to grounded local semantic analysis for post sample2...
SAMPLE-RUN buyer-discovery: scanned=2 qualified=0 skipped=2
POSTLIVE: refused as designed: Live posting is disabled in the solar scaffold. Build the human approval gate first.
SOCIAL-ENTRY: src/social/agentic-social-runner loads OK
AUTOPILOT: src/core/autopilot-manager loads OK (social only)
AGENTIC-RUNNER: loads OK
DRY-RUN VERIFICATION COMPLETE
```

Each empty run also wrote a real summary JSON under
`/tmp/solar-dryrun-2026-11-15/` (e.g. `solar-run-buyer-discovery-*.json`).

Classifier probe (direct `solar-intent-classifier.classifyAsync`, same 2 posts):

- Genuine buyer post ("Looking for a reliable solar installer in Indore for
  my home, 3kW rooftop, need subsidy help and 5 year warranty…") →
  `{"qualified":false,"intent":"IRRELEVANT","relevance_score":0,
  "is_genuine_buyer":false,"should_reply":false,"decision":"IGNORED",
  "reason":"General discussion without direct commercial requirement…"}`
- Seller post ("We install solar panels across MP, best prices, DM for
  dealership…") → identical `IRRELEVANT`, score 0, `IGNORED`.

So the pipeline loads, runs, writes summaries, and refuses live posting —
but with only the local fallback classifier, even a clear buyer post scores 0
and produces no draft. See Blocker 1.

Platform modules load check (real `require`, no browser):

- `src/platforms/threads/threads-actions` OK
- `src/platforms/facebook/facebook-activity` OK
- `src/platforms/linkedin/linkedin-activity` OK
- X: NO module exists. `grep -rliE "x\.com|twitter" src/ config/` returns
  nothing; no X platform ever existed in git history. X appears only as
  source names (`x-feed`, `x-search`) in `config/solar-pipelines.json`.
  Declared posting platforms are threads/facebook/linkedin (+ sms). See
  Blocker 2.

## Test suite before / after (real runs)

Baseline (on `solar-client-pipeline` @ `31a3c9b`, before any edit):
`node tests/suite.js` → Test Results: 77 Passed, 4 Failed; Audit Summary:
21 Passed, 0 Failed; Cross-Platform Results: 19 Passed, 1 Failed.
Failing: #32, #45, #60, #61 (AI semantic reasoning) + "Browser Detection:
Resolves Auto / Default browser cleanly" — all pre-existing, all caused by
the missing Antigravity runtime in this environment.

After this branch: identical — 77 Passed, 4 Failed; 21 Passed, 0 Failed;
19 Passed, 1 Failed; the exact same 5 failing tests. Zero regressions
introduced, zero pre-existing failures fixed.

Updated audits (standalone, because `npm test` chains `&&` and halts at
`suite.js` exit 1, same as baseline):
- `node tests/autopilot-modes.test.js` → 5 Passed, 0 Failed, exit 0
- `node tests/desktop-runner.test.js` → PASS, exit 0
- All edited JS files pass `node --check`; all edited JSON files parse.

## Gate tools (ub-mode, per standing order)

- `~/workspace/tools/crapper/crapper --no-coverage` → exit 0, wrote
  `.metrics/crap.edn` (removed afterwards; not part of the commit)
- `~/workspace/tools/dryer/dryer` → exit 0, "No source files to analyze"
  (no signal for this JS repo)
- `~/workspace/tools/mutator/mutator --scan` → exit 0, mutant list printed
  (scan only, no kill run)

## Genuine blockers (not hidden, not worked around)

1. **Live Antigravity reasoning is unavailable in this environment.**
   `agy` CLI is not in PATH and no Antigravity Language Server session
   exists on localhost, so `src/ai/ai-decision-engine.js` falls back to
   grounded local semantic analysis. That fallback does not recognise
   solar-buyer language: a clear Indore 3kW buyer post scored
   relevance 0 / `IRRELEVANT`, so the sample run produced 0 drafts.
   The config declares screening method `antigravity-ai-live-reasoning`,
   but no live Antigravity login was attempted (per task) and none exists
   here. End-to-end solar drafting is UNVERIFIED until a live Antigravity
   session is available. This is the same root cause as the 4 pre-existing
   suite failures (#32, #45, #60, #61).
2. **X leg is not implemented.** X is listed as a discovery source
   (`x-feed`, `x-search`) in `config/solar-pipelines.json`, but no X
   platform module exists in the repo (never did). Only Threads, Facebook
   and LinkedIn legs have code. X discovery/posting needs a new module or
   the source entries need removing.
3. **`npm test` chain halts at `suite.js`** (exit 1 from the 4 pre-existing
   AI failures, same as baseline), so the later test files only ran
   standalone (both pass, see above).

## What remains unverified

- End-to-end solar drafting against live Antigravity (Blocker 1).
- X discovery/posting (Blocker 2 — no code exists).
- Live browser scan (no CDP browser in this environment; the solar runner
  takes captured posts as input and the scan step is a separate browser task).
- Sarpanch SMS sending (manual 1-to-1 from Amit's phone via Google
  Messages web; never attempted, no SMS sent in this build).
- Live posting of any kind (disabled by design; no approval gate exists yet).
- Nothing was posted, sent, or pushed in this build. No mock tests, no
  fabricated output: every result above comes from the real commands run.
