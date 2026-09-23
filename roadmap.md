# Meta Automation — Current Roadmap

## Runtime architecture

Meta Automation is standardized on **MiniMax M3** for runtime AI reasoning. The runtime uses the native MiniMax HTTP API and keeps the API key in local environment configuration only.

MiniMax's official M3 page documents the native chat endpoint at `https://api.minimax.io/v1/text/chatcompletion_v2` and bearer-token authorization. M3 is positioned by MiniMax for coding and agentic workflows, with up to a 1M-token context window. citeturn410955search0turn410955search1

## Agentic browser architecture

Browser operation follows a closed loop:

```
LIVE PAGE
  ↓
Semantic Snapshot
  ↓
MiniMax M3 Decision
  ↓
Structured Action Plan
  ↓
Browser Action
  ↓
Fresh Snapshot
  ↓
Re-plan
  ↓
Post-condition Verification
```

The job-revenue plane does not contain platform-specific CSS/XPath selectors, coordinate lists, hardcoded discovery query lists, or platform-specific workflows in executable job logic. Platform metadata is declarative in `config/job-platforms.json`.

The browser planner is forbidden from inventing selectors, calling hidden endpoints, bypassing security challenges, or fabricating application facts.

## Knowledge and source-of-truth rules

Business identity, founder identity, services, profiles, positioning, communication style, content pillars and lead-qualification rules are loaded from `knowledge/*.md`.

The job application engine additionally grounds document generation in the locally supplied base resume. Generated cover letters and application metadata are derived artifacts, not new source-of-truth records.

## Agentic Job Revenue Engine

```
Platform Registry
  ↓
Live UI Discovery Agent
  ↓
Opportunity Extraction
  ↓
Detail-page Verification Agent
  ↓
Remote + Project Gate
  ↓
MiniMax Qualification
  ↓
Truthful Document Generation
  ↓
Live Browser Application Agent
  ↓
Visible Submission Verification
  ↓
Persistent State + Reports
```

Configured target marketplaces live in `config/job-platforms.json`. Platform enablement is environment-driven and does not require changing agent code.

The engine defaults to **remote-only** and **project-only**. Unknown work mode is never promoted to remote.

## Authentication

The job engine uses a dedicated browser/CDP session so job workflows do not take over the existing social-automation browser.

Google authentication is handled through visible browser UI. The system may select an already-present Google account or type the configured account email when a visible “Use another account” flow is offered. It never stores or asks for a Google password, recovery code or 2FA code.

CAPTCHA, bot challenges, identity checks, phone verification and other user-only security gates stop the workflow and return a manual-action state.

## Application verification

A successful click is not treated as a successful application.

The application flow:
1. captures the live form;
2. maps required fields to verified candidate data;
3. generates a truthful cover letter;
4. attaches the unchanged base resume when requested;
5. submits through the visible UI;
6. captures a fresh post-submit snapshot;
7. asks MiniMax to verify explicit platform-owned confirmation;
8. records `VERIFIED` only after explicit confirmation.

Ambiguous outcomes remain `UNVERIFIED`.

## Local configuration

Use:

```bash
npm run jobs:setup
npm run jobs:google
npm run jobs:auth
npm run jobs:profile
npm run jobs:scan
npm run jobs:status
npm run jobs:run
```

The setup wizard creates a local `.env` from the template when necessary and securely prompts for `MINIMAX_API_KEY` when it is missing.

Never commit `.env`, browser session data, the base resume, candidate profile state, generated applications, or API keys.

## Verification status

Repository changes have been statically inspected through GitHub. A real end-to-end execution still requires the user's machine with Node dependencies, a valid MiniMax API key, a working browser/CDP session and the required marketplace authentication. No live external execution is claimed from this environment.
