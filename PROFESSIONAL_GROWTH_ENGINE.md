# Professional Growth Engine

The Professional Growth Engine extends the Job Engine with two user-selected workflows:

1. Skill development
2. Credential/certification discovery and completion

## User flow

Run onboarding first:

```bash
npm run onboard
```

During onboarding the user can select skills to improve and certification skill areas. The configured GitHub and LinkedIn profiles are then used as profile evidence.

Run profile analysis:

```bash
npm run growth:profile
```

Run a selected LeetCode skill goal:

```bash
npm run growth:skill -- DSA
```

Discover free credentials for a skill:

```bash
npm run growth:discover -- Python
```

Run the complete selected growth queue:

```bash
npm run growth:run
```

The browser layer is internal. The product workflow is expressed as profile analysis, skill planning, discovery, enrollment, execution and credential verification.

CAPTCHA, authentication/security challenges and payment remain user-intervention points.

## Browser/AI architecture

```
Onboarding
  -> GitHub + LinkedIn profile evidence
  -> Gemini via Antigravity
  -> skill/credential planning
  -> live browser observation
  -> semantic action plan
  -> browser execution
  -> fresh evidence
  -> next decision
```
