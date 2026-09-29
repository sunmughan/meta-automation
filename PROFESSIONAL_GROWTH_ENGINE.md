# Professional Growth Engine

The Professional Growth Engine is an agentic execution plane for continuous professional development.

## End-to-end flow

ONBOARDING PROFILE
  -> LIVE GITHUB / LINKEDIN EVIDENCE
  -> AI SKILL MAP + CONFIDENCE
  -> AI SKILL PLAN + SUCCESS EVIDENCE
  -> AI LEARNING-PLATFORM SELECTION
  -> LIVE PLATFORM OBSERVATION
  -> AI NEXT-BEST-ACTION
  -> ONE SEMANTIC BROWSER ACTION
  -> FRESH SNAPSHOT + POST-CONDITION VERIFICATION
  -> PERSIST DECISION / EVIDENCE / PROGRESS
  -> REPLAN

The engine does not encode a learning website workflow in JavaScript. Learning platforms are declared in config/professional-growth-platforms.json; the AI selects an enabled platform from the registry based on the selected skill, profile evidence and generated skill plan.

## Skill development

Run:

    npm run growth:skill -- DSA

The command does not force a particular provider. It refreshes professional evidence, builds an evidence-grounded skill map, creates a practical plan and observable success criteria, asks the AI to select a configured learning platform, resumes from persisted progress, observes the live platform, reasons about the next useful action, executes one semantic action group, verifies the resulting state, persists the decision/page/action evidence, and repeats until completion or a user-only action is required.

## Credential discovery

Run:

    npm run growth:discover -- Python

Discovery policy is configuration-driven. The search URL and query template live in the platform registry. Search results are only candidates; every candidate is re-opened and independently verified from visible page evidence.

The engine will not claim a credential is free or issuable unless the current page provides supporting evidence.

## Credential completion

A selected credential is executed through the same live-observe -> reason -> act -> verify loop.

The engine stops for CAPTCHA, MFA/OTP, identity verification, proctoring, payment, security challenges, or ambiguous completion state.

It never claims completion without visible credential evidence.

## State and recovery

Professional-growth state is persisted under the configured growth state file.

For active goals, each iteration can record current iteration, AI decision/reason, current page URL, browser action state, goal status, and completion evidence.

This allows a later run to resume from evidence rather than restarting a scripted workflow.

## Configuration rule

Business data and platform policy belong in configuration/knowledge sources.

Runtime modules must not contain hardcoded project catalogs, hardcoded learning-platform URLs, hardcoded credential search URLs, duplicated project metadata, or CSS/XPath/coordinate automation recipes.

Browser interaction must use semantic live-page evidence.