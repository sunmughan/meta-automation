# Agentic Job Revenue Engine

The job-revenue subsystem is a separate execution plane inside Meta Automation. It uses the existing MiniMax M3 runtime and the existing semantic browser/action infrastructure, but runs through a dedicated browser profile and CDP port so social automation and job applications cannot steal each other's browser state.

## Design principles

- **Agentic UI operation:** platform behavior is discovered from the live browser DOM and accessibility/text evidence. No platform-specific CSS/XPath selectors, click coordinates, or hardcoded search-query lists are used by the job engine.
- **Data-driven platforms:** the target marketplaces and workflow modes live in `config/job-platforms.json`.
- **Remote-only and project-only:** these are hard configuration gates. An opportunity with unknown, hybrid, on-site, employment, or recruitment status is not applied to.
- **MiniMax only:** reasoning, qualification, document generation and browser planning route through the shared MiniMax M3 runtime.
- **Closed-loop execution:** snapshot -> plan -> act -> snapshot -> re-plan until the goal is done or human intervention is required.
- **Google OAuth without credential storage:** the job browser may use the platform's visible Google sign-in control and select the configured Google account only when it is already present in the browser chooser. Google passwords, 2FA codes and session cookies are never requested or stored by the application.
- **Challenge handoff:** CAPTCHA, bot challenges, identity verification, phone/security checks, payment/credit purchases or unknown mandatory fields stop the agent and return a user/manual action state.
- **Truthful verification:** an application is not recorded as verified until the browser loop observes a trustworthy post-submit state.

## Target platforms

The ten configured platforms are:

Upwork, Freelancer, Contra, PeoplePerHour, Guru, Workana, Malt, Arc, Toptal and Fiverr.

The platform registry is declarative; the same agentic browser engine is reused for every platform.

## Browser isolation

Social automation remains on its configured CDP endpoint (default :9222).

Job automation uses:

`JOB_BROWSER_CDP_URL=http://127.0.0.1:9223`

with:

`JOB_BROWSER_USER_DATA_DIR=./private/job-browser-profile`

This dedicated profile is where the Google account and marketplace sessions are established.

## End-to-end flow

```
Setup
  -> MiniMax key in local .env
  -> Google account configuration
  -> Base resume path
  -> Candidate profile

Google bootstrap
  -> open dedicated browser
  -> user signs into Google once when needed

Marketplace bootstrap
  -> open platform
  -> discover login/register UI
  -> Continue with Google
  -> verify authenticated state

Profile completion
  -> discover profile settings
  -> map live fields to verified candidate data
  -> fill only known values
  -> stop for unknown required values

Continuous hunting
  -> discover project/work area
  -> search/filter through live UI
  -> inspect opportunities
  -> verify explicit remote evidence
  -> qualify with MiniMax

Application
  -> generate tailored cover letter
  -> use base resume as factual source
  -> answer only known questions
  -> attach resume when requested
  -> submit through browser UI
  -> verify post-submit state
  -> persist application record

Report
  -> per-platform status
  -> discovered/qualified/submitted/verified counts
  -> manual-action and failure reasons
```

## Setup

1. Install the project with the platform installer.
2. The installer creates `.env` and launches the setup wizard.
3. Provide the MiniMax API key when prompted. It is stored only in the local `.env` file and the file permissions are restricted on Unix-like systems.
4. Provide the base resume path.
5. Confirm the Google account email.
6. Run `npm run jobs:google` once and sign into the configured Google account in the dedicated job browser when required.
7. Run `npm run jobs:auth`.
8. Run `npm run jobs:profile` when profile completion needs to be rerun.
9. Start the autonomous worker with `npm run jobs:run`.

## Local files

```
private/
  job-browser-profile/
  base-resume.pdf
  candidate-profile.json

job-state/
  opportunities.json

applications/
  <platform>/<opportunity>/
    cover-letter.txt
    document-plan.json
```

These paths are ignored by Git and are never part of the repository source of truth.

## Commands

```
npm run jobs:setup
npm run jobs:google
npm run jobs:auth
npm run jobs:profile
npm run jobs:scan
npm run jobs:status
npm run jobs:run
```

## What remains intentionally human-controlled

Only data or security events that are not present in the configured knowledge/base-resume sources are escalated. The agent does not guess, bypass security controls, or manufacture application facts.
