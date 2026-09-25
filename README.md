# Agentic Automation 🤖

[![Agentic](https://img.shields.io/badge/Architecture-End--to--End%20Agentic-blue.svg)](https://github.com/sunmughan/meta-automation)
[![Platforms](https://img.shields.io/badge/Social-Threads%20%7C%20Facebook%20%7C%20LinkedIn-success.svg)](https://github.com/sunmughan/meta-automation)
[![Browser](https://img.shields.io/badge/Browser-CDP%20%2B%20Live%20DOM-critical.svg)](https://github.com/sunmughan/meta-automation)
[![Release](https://img.shields.io/badge/Release-v1.7.0-blueviolet.svg)](https://github.com/sunmughan/meta-automation/releases/tag/v1.7.0)
[![Node](https://img.shields.io/badge/Node.js-%3E%3D18-339933.svg)](https://nodejs.org)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

> **Repository URL compatibility:** the GitHub slug remains `meta-automation`. The product is no longer positioned as a conventional "Meta Automation" bot. It is an **end-to-end agentic automation runtime** that learns who it represents, observes live browser state, reasons about what should happen next, executes one action, verifies the result, and continues from fresh evidence.

Built by **CodeAir Software Solutions**.

---

## What this project is now

This is a **personal/business operating agent for browser-based work**.

Instead of maintaining a separate bot for every website, the system provides one agentic execution plane:

```
Your Identity + Business Context
             ↓
      Agentic Brain / Memory
             ↓
      Live Browser Observation
             ↓
       Security / Safety Gate
             ↓
       Next-Best-Action Reasoning
             ↓
        One Atomic Action
             ↓
       Fresh Browser State
             ↓
       AI Evidence Verification
             ↓
      Relationship / State Update
             ↓
             LOOP
```

The important principle is:

**The agent does not know you because your name is hardcoded into a prompt. It knows you because onboarding creates a structured source of truth about the person, company, capabilities, communication style, browser environment and operating controls.**

---

# 🚀 First Run: Onboarding Comes First

The first-time onboarding flow is the most important configuration in the system.

Run:

```bash
npm run onboard
```

or:

```bash
node threads-agent.js onboard
```

The wizard is divided into six simple stages.

### 1. Your identity

The agent learns:

- Full name
- Professional role / title
- Professional bio
- Skills and expertise
- Location
- Timezone
- Languages

Example:

```text
Sunmughan Swamy
Founder / CTO
Software engineering, SaaS, AI automation, architecture...
India
Asia/Kolkata
English, Hindi
```

This becomes part of the agent's identity context.

### 2. Verified profiles

You provide the identities the agent is allowed to represent:

- LinkedIn
- Threads
- GitHub
- Personal website / portfolio
- WhatsApp booking URL

The agent can therefore distinguish between:

```text
PERSONAL IDENTITY
COMPANY IDENTITY
PRODUCT IDENTITY
CONTACT / HANDOFF IDENTITY
```

### 3. Company / brand

The agent learns:

- Company name
- Website
- What the company does
- Main product / demo
- Ideal customer
- Approved services
- Excluded services

This is the foundation for grounded business reasoning.

For example, if your company provides custom SaaS development but not SEO services, the agent has an explicit boundary instead of inventing an answer.

### 4. Agent behaviour

You define:

- Communication style
- Primary objective
- Preferred CTA
- Topics / claims to avoid
- Autonomous DM replies
- Autonomous follows
- Autonomous connection requests
- Autonomous publishing

This is deliberately separate from identity.

**Who you are** and **what the agent is allowed to do on your behalf** are different pieces of state.

### 5. Browser & platform control

You configure:

- Browser: auto / Chrome / Edge / Brave / Chromium
- CDP endpoint
- Enabled social platforms
- Round-robin or concurrent execution

Supported social platforms in the V2 agentic plane:

- Threads
- Facebook
- LinkedIn

The browser session remains yours. The agent operates through the authenticated browser/CDP environment rather than asking for platform passwords.

### 6. Safety & AI

You configure:

- Dry-run mode
- Approval mode
- Maximum comments/hour
- Maximum replies/hour
- Maximum DMs/hour
- Maximum follows/hour
- Maximum connections/hour
- Maximum publishes/hour
- Scan interval
- AI provider
- AI model
- AI credentials

**Recommended first-run configuration:**

```text
DRY RUN        = ON
APPROVAL       = ON
AUTO DM        = OFF
AUTO FOLLOW    = OFF
AUTO CONNECT   = OFF
AUTO PUBLISH   = OFF
```

Once the user verifies the agent's behavior, controls can be relaxed deliberately.

---

# 🧠 Where the user's information lives

Onboarding creates two different kinds of state.

### Source-of-truth knowledge

```text
knowledge/
├── founder.md
├── company.md
├── profiles.md
└── services.md
```

These files describe **who the agent represents** and what it is allowed to claim.

### Private operational profile

```text
private/user-profile.json
```

This stores the structured onboarding configuration, including:

- identity
- profiles
- company context
- behavior controls
- browser settings
- safety budgets
- AI selection

The `private/` directory is gitignored.

Secrets such as API keys remain in local `.env` configuration and are never requested through social login flows.

---

# 🔄 How the agent actually operates

The agent does not execute a pre-written social script.

For every meaningful cycle:

### Observe

It captures a semantic representation of the current live browser state:

- visible text
- interactive controls
- roles
- accessible names
- editable fields
- links
- dialogs
- visible content cards
- current URL
- element relationships

### Reason

The AI considers:

- your identity
- company context
- conversation history
- relationship state
- current browser state
- current objective
- safety controls

It chooses the **next best action**, rather than following a fixed platform script.

### Execute

The browser agent executes one atomic action against a target discovered from the current live observation.

### Verify

After the action:

```text
OLD STATE
   ↓
ACTION
   ↓
NEW LIVE STATE
   ↓
AI VERIFICATION
```

A click is not automatically considered a success.

An application is not considered submitted merely because a button was clicked.

A message is not considered sent merely because typing completed.

### Re-plan

The agent observes again and decides what to do next.

---

# 🧩 No brittle UI automation in the V2 execution plane

The V2 agent does **not** depend on:

- platform CSS selectors
- XPath recipes
- selector wait chains
- coordinate tables
- platform-specific click maps
- regex-based UI decisions
- hardcoded social conversation templates

Interactive targets are discovered from the current semantic browser snapshot.

This makes the execution model:

```
LIVE UI → UNDERSTAND → ACT → RE-OBSERVE
```

rather than:

```
IF selector X exists → CLICK X
```

---

# 🛡️ Security model

Security is treated as a first-class state.

The agent stops and requests human intervention when it encounters:

- CAPTCHA
- login requirement
- identity verification
- security checkpoint
- unknown security state
- ambiguous authentication state

The system does not attempt to bypass these controls.

Unexpected browser tabs can also be quarantined so an agentic workflow does not accidentally act on an unrelated page.

---

# 👤 Cross-platform identity & relationship memory

A person discovered on one platform does not have to remain an isolated record.

The relationship layer can connect verified identities across:

```text
Threads
   ↕
Facebook
   ↕
LinkedIn
```

The lifecycle is:

```text
OBSERVED
  ↓
IDENTIFIED
  ↓
QUALIFIED
  ↓
ENGAGED
  ↓
CONVERSATION
  ↓
OPPORTUNITY
  ↓
HANDOFF
  ↓
WON / LOST
```

Identity resolution is conservative. Uncertain cross-platform matches are not automatically merged.

---

# ✍️ Omnichannel content

The content engine starts from a business objective rather than platform-specific copy.

The agent can reason about the same idea and produce platform-native variants for:

- Threads
- LinkedIn
- Facebook

The user's configured voice, business context, audience and approved capabilities are used as grounding.

---

# 💼 Agentic Job Revenue Engine

The repository also contains a separate job/revenue automation plane.

It uses the same general agentic philosophy:

```
LIVE MARKETPLACE UI
      ↓
DISCOVER
      ↓
VERIFY
      ↓
QUALIFY
      ↓
GENERATE TRUTHFUL DOCUMENTS
      ↓
APPLY THROUGH VISIBLE UI
      ↓
VERIFY SUBMISSION
      ↓
PERSIST RESULT
```

Job automation has its own browser profile and state.

Run:

```bash
npm run jobs:setup
npm run jobs:google
npm run jobs:auth
npm run jobs:profile
npm run jobs:scan
npm run jobs:run
npm run jobs:status
```

See [JOB_REVENUE_ENGINE.md](JOB_REVENUE_ENGINE.md).

---

# 🖥️ Browser architecture

The runtime connects to a user-controlled Chromium-family browser through CDP.

Supported browser choices:

- Chrome
- Edge
- Brave
- Chromium
- Auto-detected browser

Example:

```text
User's authenticated browser
          ↓
       CDP :9222
          ↓
Universal Browser Agent
          ↓
Semantic Observation
          ↓
AI Reasoning
```

The automation does not need your platform password.

---

# 📱 Android / Termux + Termux:X11

The project provides first-class support for **Android 24/7 background autonomous execution** via Termux and Termux:X11.

### 1. Install Android dependencies

```bash
pkg update -y
pkg install -y git nodejs-lts x11-repo chromium termux-x11-nightly zip
```

### 2. Clone and install

```bash
git clone https://github.com/sunmughan/meta-automation.git
cd meta-automation
npm install
```

### 3. Master Runner (`./start-termux`)

The runner automatically manages the entire execution stack:

```bash
# Start continuous daemon in background
./start-termux

# Inspect live status and PID
./status-automation

# Stream live activity logs
tail -f logs/daemon.log

# Gracefully stop the automation
./stop-automation

# Restart or run interactively in foreground
./start-termux --restart
./start-termux --foreground
```

**What `./start-termux` handles automatically:**
- **Termux:X11 Display Management**: Validates and initializes display `:1` with companion app activation.
- **Fullscreen Chromium Geometry**: Detects Android display resolution (e.g., `1080x2400`), configures precise window position (`--window-position=0,0`) and size flags to prevent off-screen modal rendering.
- **CDP Bridge**: Launches Chromium with `--remote-debugging-port=9222` while preserving your logged-in cookies and sessions.
- **Antigravity-First AI Runtime**: Automatically validates the local Antigravity Language Server environment before starting.

> [!TIP]
> **Android 12+ Optimization:** Disable Phantom Process Killer via ADB (`adb shell "/system/bin/device_config put activity_manager max_phantom_processes 2147483647"`) and set Termux battery usage to **Unrestricted** to prevent OS background suspension.

---

# 🤖 Multi-Tier AI Decision Engine

The automation features a resilient **3-tier semantic decision pipeline**:

1. **Tier 1: Antigravity Language Server (Local / Primary)** — High-precision local reasoning without third-party API dependencies or subscription token limits.
2. **Tier 2: Cloud AI Fallback (MiniMax M3 / OpenAI)** — Seamless failover if local language server is busy or unavailable.
3. **Tier 3: Grounded Local Semantic Classifier** — Zero premature discards; strictly classifies leads into:
   - `BUYER` (Project buyers needing custom apps, portals, SaaS, mobile, AI)
   - `FOUNDER_NETWORKING` (Builder community, indie hackers, technical co-founder outreach)
   - `TECH_DISCUSSION` (Framework architectures, technical consultation)
   - `FEEDBACK_REQUEST` (Product launch roasts, MVP critiques)
   - `AUTOMATION` (Workflow optimization, scrapers, bot integrations)
   - Strict exclusions: `RECRUITMENT`, `JOB_SEEKER`, `SERVICE_PROVIDER` (promotional spam), `OUT_OF_SCOPE` (graphic design, logos, accounting), and `IRRELEVANT` (community opinion polls).

### Universal Clean Handle Sanitization
Eliminates brittle `@user`, `@buyer`, `@facebook_buyer`, or `@linkedin_user` placeholder tags across all platforms, ensuring every generated comment reads naturally and seamlessly.

---

# ⚙️ Main commands

### First-time onboarding & profile configuration

```bash
npm run onboard
```

### Agentic social runtime

```bash
# Run one cycle across configured platforms
npm run agentic:social -- --once

# Single platform single cycle
npm run agentic:social -- --platform=threads --once
npm run agentic:social -- --platform=facebook --once
npm run agentic:social -- --platform=linkedin --once

# Continuous autonomous daemon (infinite loop with adaptive backoff)
npm run agentic:social -- --daemon
npm run agentic:social -- --platform=threads --daemon
```

Custom objective:

```bash
npm run agentic:social -- --goal="discover relevant software buyers and contribute useful responses"
```

Resume after a manual safety pause:

```bash
npm run agentic:social -- --resume
```

### Distribution release packaging

```bash
# Builds npm package, cross-platform tarballs & zip archives with SHA256 checksums
npm run build:release
```

Generated packages in `release/`:
- `meta-automation-1.7.0.tgz` (npm distribution package)
- `meta-automation-android-termux.tar.gz` (Android Termux optimized bundle)
- `meta-automation-linux-x64.tar.gz` (Linux distribution archive)
- `meta-automation-macos-universal.tar.gz` (macOS distribution archive)
- `meta-automation-windows-x64.zip` (Windows distribution archive)
- `meta-automation-universal-v1.7.0.zip` (Universal platform release archive)
- `SHA256SUMS.txt` (Cryptographic verification checksums)

### Verification & audits

```bash
# Deterministic Agentic V2 architecture & onboarding audit
npm run test:agentic

# Legacy test suite & browser e2e
npm run e2e:browser
npm test
```

---

# 📂 Project structure

```text
meta-automation/
├── agentic-social.js                 # V2 agentic social entry point
├── threads-agent.js                  # Unified CLI + onboarding
├── config/
│   ├── index.js                      # Runtime configuration
│   ├── social-platforms.json         # Declarative social platform registry
│   └── social-lifecycle.json         # Relationship lifecycle
├── knowledge/
│   ├── founder.md                    # Who the agent represents
│   ├── company.md                    # Company source of truth
│   ├── profiles.md                   # Verified identity URLs
│   └── services.md                   # Allowed / excluded capabilities
├── src/
│   ├── agent/
│   │   ├── universal-browser-agent.js
│   │   └── visual-fallback.js
│   ├── agentic/
│   │   └── next-best-action.js
│   ├── ai/
│   │   └── ai-runtime.js
│   ├── browser/
│   ├── content/
│   │   └── omnichannel-content.js
│   ├── leads/
│   │   ├── relationship-engine.js
│   │   └── intelligent-identity-resolver.js
│   ├── safety/
│   │   ├── global-guard.js
│   │   └── social-action-policy.js
│   ├── social/
│   │   └── agentic-social-runner.js
│   └── telemetry/
├── private/                          # Local-only user profile / credentials
├── tests/
│   └── agentic-v2.test.js
└── roadmap.md
```

---

# 🔐 What onboarding should NOT ask for

The onboarding wizard intentionally does **not** ask for:

- social-media passwords
- Google passwords
- 2FA codes
- recovery codes
- CAPTCHA answers
- private authentication cookies

Authentication happens through the visible browser session.

When a security gate appears, the correct action is human handoff.

---

# 🧪 Verification

The V2 architecture includes a static audit covering:

- universal browser-agent structure
- semantic execution path
- absence of CSS selector lookup in V2
- absence of XPath dependency
- absence of selector waits
- absence of regex-based UI matching
- lifecycle configuration
- identity resolver
- safety policy
- V2 runner wiring

Run:

```bash
npm run test:agentic
```

Live social E2E testing still requires an authenticated browser/CDP session on the user's machine.

---

# 🗺️ Product direction

The long-term architecture is:

```text
                 USER / BUSINESS
                        ↓
                ONBOARDING PROFILE
                        ↓
              PERSONAL KNOWLEDGE GRAPH
                        ↓
                AGENTIC MEMORY
                        ↓
          ┌─────────────┴─────────────┐
          ↓                           ↓
    SOCIAL WORK                     JOB WORK
          ↓                           ↓
     LIVE BROWSER                 LIVE BROWSER
          ↓                           ↓
       OBSERVE                     OBSERVE
          ↓                           ↓
       REASON                      REASON
          ↓                           ↓
       EXECUTE                     EXECUTE
          ↓                           ↓
       VERIFY                      VERIFY
          └─────────────┬─────────────┘
                        ↓
                 STATE + TELEMETRY
```

The goal is not to create another collection of website bots.

The goal is to create **one configurable agent that understands its principal and can operate safely across changing browser interfaces.**

---

## License

MIT.

Built by [Sunmughan Swamy](https://github.com/sunmughan) and [CodeAir Software Solutions](https://www.codeair.tech).

**Repository slug:** `sunmughan/meta-automation` — intentionally retained for URL compatibility.
