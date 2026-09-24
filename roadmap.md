# Agentic Automation — Product Roadmap

> The repository slug remains `meta-automation` for URL compatibility. The product architecture and documentation now use **Agentic Automation**.

## Product definition

Agentic Automation is an end-to-end browser agent that operates on behalf of a configured person or business.

Its first principle is **principal awareness**:

```
WHO AM I REPRESENTING?
        ↓
WHAT DOES THAT PERSON / COMPANY DO?
        ↓
WHAT MAY I CLAIM?
        ↓
WHAT MAY I DO?
        ↓
WHERE MAY I OPERATE?
        ↓
WHAT REQUIRES APPROVAL?
```

## First-run onboarding

Onboarding is the first critical runtime step.

It captures:

1. Personal identity
2. Professional context
3. Verified profiles
4. Company / brand context
5. Audience
6. Approved services
7. Excluded services
8. Communication style
9. Business objective
10. CTA and forbidden topics
11. Per-action social controls
12. Browser type and CDP endpoint
13. Enabled platforms
14. Execution mode
15. Dry-run / approval mode
16. Per-action hourly budgets
17. AI provider and model

The structured profile is stored locally in `private/user-profile.json`. Knowledge source-of-truth files remain in `knowledge/`.

No social password, 2FA code, recovery code or CAPTCHA answer is collected.

## Runtime loop

```
ONBOARDING PROFILE
      ↓
KNOWLEDGE + RELATIONSHIP STATE
      ↓
LIVE BROWSER SNAPSHOT
      ↓
SECURITY GATE
      ↓
NEXT-BEST-ACTION
      ↓
ONE ATOMIC ACTION
      ↓
FRESH SNAPSHOT
      ↓
AI VERIFICATION
      ↓
STATE / RELATIONSHIP UPDATE
      ↓
REPLAN
```

## Browser architecture

The V2 execution plane does not depend on platform CSS selectors, XPath, selector wait chains, coordinate tables or regex-based UI decisions.

Interactive targets are derived from the current semantic DOM observation. If semantic evidence is insufficient, visual recovery can provide additional evidence and the browser is re-observed before action.

## Safety architecture

The agent treats the following as explicit manual-handoff states:

- CAPTCHA
- login required
- security challenge
- identity verification
- unknown security state
- ambiguous action outcome

Onboarding controls are enforced by the V2 runner rather than merely being documentation:

- dry-run blocks side effects;
- approval mode blocks side effects until approval is available;
- per-action enable/disable flags control like/comment/reply/DM/follow/connect/publish;
- hourly budgets are enforced and verified actions are persisted for accounting.

## Identity and relationships

Cross-platform identity is resolved conservatively. Exact platform identities can be reused immediately; uncertain cross-platform matches require explicit AI evidence before merge.

Relationship state is shared across supported social platforms.

## Job revenue plane

The job-revenue engine remains a separate execution plane with its own browser profile, authentication state and application state. It follows the same live-observe → reason → act → verify philosophy.

## Current verification

Run:

```bash
npm run test:agentic
```

This performs the static V2 browser architecture audit and the onboarding/control audit.

Live social execution still requires a user's authenticated browser/CDP environment.
