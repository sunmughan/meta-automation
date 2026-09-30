# Agentic Automation 🤖

[![Version](https://img.shields.io/badge/Version-2.1.0-blueviolet.svg)](https://github.com/sunmughan/meta-automation/releases)
[![Architecture](https://img.shields.io/badge/Architecture-End--to--End%20Agentic-blue.svg)](https://github.com/sunmughan/meta-automation)
[![AI Engine](https://img.shields.io/badge/AI%20Runtime-Antigravity%20Gemini%203.8%20Flash-critical.svg)](https://github.com/sunmughan/meta-automation)
[![Platforms](https://img.shields.io/badge/Social-Threads%20%7C%20Facebook%20%7C%20LinkedIn-success.svg)](https://github.com/sunmughan/meta-automation)
[![Job Marketplaces](https://img.shields.io/badge/Jobs-10%20Marketplaces-orange.svg)](config/job-platforms.json)
[![Growth Engine](https://img.shields.io/badge/Growth-LeetCode%20%7C%20Kaggle%20%7C%20HackerRank-teal.svg)](config/professional-growth-platforms.json)
[![Node](https://img.shields.io/badge/Node.js-%3E%3D18-339933.svg)](https://nodejs.org)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

> **Repository URL Compatibility:** The GitHub slug remains `meta-automation` for URL compatibility. The product has evolved from a legacy social bot into a production-grade, multi-engine **Agentic Personal & Enterprise Operating System**. It represents a configured principal, observes live browser state over Chrome DevTools Protocol (CDP), reasons over live accessibility DOM trees, executes atomic semantic actions, and truthfully verifies every state transition.

Crafted by **[CodeAir Software Solutions](https://www.codeair.tech)** under the lead of **[Sunmughan Swamy](https://github.com/sunmughan)**.

---

## 📑 Table of Contents

1. [Executive Overview & Agentic Philosophy](#-executive-overview--agentic-philosophy)
2. [System Architecture & Multi-Engine Plane](#-system-architecture--multi-engine-plane)
3. [Antigravity AI Reasoning Plane](#-antigravity-ai-reasoning-plane)
4. [First-Run Setup & Interactive Onboarding](#-first-run-setup--interactive-onboarding)
5. [Social Autopilot Engine](#-social-autopilot-engine)
6. [Job Revenue Engine & Marketplaces](#-job-revenue-engine--marketplaces)
7. [Professional Growth & Credential Engine](#-professional-growth--credential-engine)
8. [Declarative Portfolio Generator & Publisher](#-declarative-portfolio-generator--publisher)
9. [Phase 6 State Machine & Idempotency Architecture](#-phase-6-state-machine--idempotency-architecture)
10. [Cross-Platform Identity & Relationship Memory](#-cross-platform-identity--relationship-memory)
11. [Semantic Browser & CDP Architecture](#-semantic-browser--cdp-architecture)
12. [Multi-OS Installation & 24/7 Resilience](#-multi-os-installation--247-resilience)
13. [CLI Command Reference](#-cli-command-reference)
14. [Repository & Knowledge Base Structure](#-repository--knowledge-base-structure)
15. [Safety, Security & Privacy Guarantees](#-safety-security--privacy-guarantees)
16. [Verification, Audits & Quality Assurance](#-verification-audits--quality-assurance)
17. [Distribution Packaging & Releases](#-distribution-packaging--releases)
18. [Sponsorship, Enterprise Services & Backers](#-sponsorship-enterprise-services--backers)

---

## 🧭 Executive Overview & Agentic Philosophy

Most automation tools fail because they are brittle: they rely on hardcoded CSS selectors, XPath strings, pixel click coordinates, or simulated bot scripts that break the moment a web application updates its frontend. Furthermore, typical AI bots hallucinate credentials, spam low-quality comments, or store sensitive social media passwords in plain text.

**Agentic Automation v2.1.0** takes a fundamentally different approach:

```
Who do I represent? (Onboarding & Knowledge Base)
                  ↓
What does that person/company do? (Approved Capabilities & Scope)
                  ↓
What am I looking at? (Semantic Live DOM & Accessibility Tree)
                  ↓
Is it safe to proceed? (Rate Limits, Safety Gates, CAPTCHA Handoff)
                  ↓
What is the single best atomic step? (Antigravity AI Reasoning)
                  ↓
Execute one verified action (CDP Native Input/Mouse)
                  ↓
Did the browser state truthfully change? (Post-Condition Verification)
                  ↓
Update State Machine & Replan
```

### Core Tenets
- **Principal Grounding:** The agent never relies on hardcoded names or arbitrary hallucinations in prompts. It operates strictly from dynamic knowledge bases (`knowledge/*.md`) and candidate profiles (`private/user-profile.json`).
- **Semantic Live DOM Grounding:** Zero reliance on brittle CSS/XPath selector wait-chains. UI elements are discovered organically by ARIA roles, accessible names, text content, and element hierarchies.
- **Truthful Action State Machine:** An action is never recorded as "done" because a button was clicked. Applications, posts, comments, and credential enrollments are verified through independent, post-submit live DOM state evidence.
- **Zero Credential Hoarding:** Social passwords, Google passwords, 2FA/TOTP codes, and session cookies are never requested or stored. The agent connects to your authenticated Chromium browser session via CDP.
- **Immediate Human Handoff:** CAPTCHAs, bot challenges, two-factor authentication prompts, KYC verifications, and payment gates trigger an immediate, graceful pause and notify the user for human resolution.

---

## 🏛️ System Architecture & Multi-Engine Plane

Agentic Automation is structured into mutually exclusive execution planes managed by a master orchestrator:

```
                                 ┌──────────────────────────────────────────────┐
                                 │       Agentic Automation Master Runner       │
                                 │     (./start-termux | npm start | CLI)       │
                                 └──────────────────────┬───────────────────────┘
                                                        │
                      ┌─────────────────────────────────┼─────────────────────────────────┐
                      ▼                                 ▼                                 ▼
        ┌───────────────────────────┐     ┌───────────────────────────┐     ┌───────────────────────────┐
        │    1. Social Autopilot    │     │   2. Job Revenue Engine   │     │ 3. Professional Growth    │
        │  (Threads, FB, LinkedIn)  │     │ (Freelancer, Upwork, etc) │     │ (LeetCode, Kaggle, etc)   │
        └─────────────┬─────────────┘     └─────────────┬─────────────┘     └─────────────┬─────────────┘
                      │                                 │                                 │
          • CDP Port :9222                  • CDP Port :9223 / :9222          • Shared / Dedicated CDP
          • Omnichannel Discovery           • Dedicated Profile               • Live Profile Intelligence
          • Lead Qualification              • Remote-Only Gate                • Curriculum AI Planner
          • Rich-Text TipTap Typing         • Grounded Proposal AI            • Live DOM Skill Runner
          • Relationship Lifecycle          • Declarative Marketplaces        • Credential Discovery
                      │                                 │                                 │
                      └─────────────────────────────────┼─────────────────────────────────┘
                                                        │
                                                        ▼
                                      ┌───────────────────────────────────┐
                                      │     Antigravity AI Runtime        │
                                      │   (Active Gemini 3.8 Flash)       │
                                      └─────────────────┬─────────────────┘
                                                        │
                                                        ▼
                                      ┌───────────────────────────────────┐
                                      │  Phase 6 State Machine & Storage  │
                                      │   (Atomic JSON, Idempotency)      │
                                      └───────────────────────────────────┘
```

### Mutual Exclusivity & Single Active Engine Rule
To prevent race conditions, keyboard focus collisions, and session cross-contamination:
- **Exactly one engine runs in the active browser context at any given time.**
- Starting the Job Revenue Engine automatically closes unrelated social tabs (Threads, Facebook, Instagram, LinkedIn) and confines activity strictly to the target marketplace.
- Starting the Social Autopilot focuses on social workflows while preserving isolated job browser states.

---

## 🧠 Antigravity AI Reasoning Plane

The intelligence core is powered by **Google Antigravity AI** utilizing **Gemini 3.8 Flash** via the local authenticated session:

```
[System Input] ──> [Prompt Sanitizer] ──> [Local Antigravity CLI (agy)] ──> [Structured JSON Response]
                                                     │
                                            (Fallback if unavail)
                                                     ▼
                                       [Cloud Fallback / Local Heuristic]
```

### Key AI Properties
1. **Local Antigravity Session (`agy` CLI):** Routes reasoning directly through the user's active Google account session on their machine. This eliminates third-party subscription fees, third-party API token consumption, and external rate limits.
2. **Deterministic JSON Encoders:** AI outputs are validated against strict JSON schemas before being consumed by browser operators.
3. **Resilient 3-Tier Hierarchy:**
   - **Tier 1 (Primary):** Local Antigravity CLI Runtime running Gemini 3.8 Flash.
   - **Tier 2 (Cloud Fallback):** Direct Gemini / MiniMax / OpenAI cloud endpoints configured in `.env`.
   - **Tier 3 (Grounded Rule Heuristic):** Zero-crash local semantic classifier for essential lead triage when offline.
4. **Strict Context Isolation:** Prompts do not leak private environment variables, unapproved business claims, or raw cookies.

---

## 🚀 First-Run Setup & Interactive Onboarding

The first runtime step is onboarding, which establishes the structured ground truth for the principal:

```bash
npm run onboard
# or:
node threads-agent.js onboard
```

The interactive wizard guides you through seven comprehensive stages:

### Stage 1: Personal Identity
Defines full name, professional role, bio, core technical skills, physical location, timezone, and working languages.

### Stage 2: Verified Profiles
Connects authorized identities that the agent is permitted to represent:
- LinkedIn Profile URL
- Threads Profile URL
- GitHub Profile URL
- Personal Portfolio / Website
- Official WhatsApp Direct Booking Link (e.g., `https://wa.me/codeair`)

### Stage 3: Company & Brand Identity
Captures company name, website, value proposition, ideal client profile (ICP), approved service offerings, and explicitly excluded services (e.g., "Custom SaaS & AI Agents approved; Graphic Design & Logo creation excluded").

### Stage 4: Agentic Operating Behavior
Defines conversational tone (authoritative, technical, conversational), primary business objective, preferred call-to-action (CTA), forbidden topics, and autonomous permission switches:
- `Auto-DM Replies` (ON/OFF)
- `Auto-Follow` (ON/OFF)
- `Auto-Connect` (ON/OFF)
- `Auto-Publish` (ON/OFF)

### Stage 5: Browser Environment & CDP Connection
Selects Chromium engine (Auto-detect / Chrome / Brave / Edge / Chromium) and remote debugging port (default `:9222`). Configures window geometry and multi-tab management.

### Stage 6: Safety, Budgets & AI Provider
Configures dry-run mode, manual approval mode, hourly action budgets (comments, DMs, follows, connects, publishes), and AI engine selection.

### Stage 7: Professional Growth & Skills
Selects target skill development tracks (e.g., `DSA`, `Distributed Systems`, `React`) and credential discovery topics (e.g., `Python`, `Machine Learning`).

> [!TIP]
> **Recommended First-Run Profile:**
> Keep `DRY RUN = ON` and `APPROVAL = ON` during your first sessions. Once you observe the agent's accurate reasoning in the live browser, you can toggle them off to grant full autonomy.

All private onboarding data is securely written to `private/user-profile.json` (gitignored).

---

## 🌐 Social Autopilot Engine

The Social Autopilot automates thought leadership, inbound conversation triage, connection building, and high-intent buyer discovery across **Threads**, **Facebook**, and **LinkedIn**.

### 1. High-Intent Lead Qualification
Posts and conversations are analyzed through semantic classification into six distinct categories:
- **`BUYER`**: Founders, CTOs, or business owners actively seeking custom SaaS, mobile apps, web applications, or AI automation.
- **`FOUNDER_NETWORKING`**: Technical peers, indie hackers, and founders building complementary products.
- **`TECH_DISCUSSION`**: Meaningful discussions on architecture, software engineering, and AI paradigms.
- **`FEEDBACK_REQUEST`**: Product roasts, landing page audits, and MVP critiques.
- **`AUTOMATION`**: Workflow optimization inquiries, web scrapers, and bot integrations.
- **Strict Exclusions:** Non-relevant posts are discarded without side effects (`RECRUITMENT`, `JOB_SEEKER`, `SERVICE_PROVIDER` spam, `OUT_OF_SCOPE` topics like accounting, and `IRRELEVANT` polls).

### 2. Universal Clean Handle Sanitization
Eliminates brittle `@buyer`, `@user`, `@facebook_user`, or generic placeholder tags across all platforms, ensuring generated responses reference verified human names or natural conversational greetings.

### 3. TipTap & ProseMirror Rich-Text Dispatch
Modern web apps (such as LinkedIn and Facebook Comet) use virtualized rich-text editors. Traditional `element.value = text` or `sendkeys` triggers silent failures. The engine uses a synthetic `InputEvent` pipeline with natural human jitter (30–95ms cadence) and cleanses `<p class="is-editor-empty">` nodes to ensure submit buttons cleanly enable.

### 4. Omnichannel Coverage
- **Threads:** High-intent search discovery, home feed scanning, viral quote-posting, inbound activity replies, direct messages.
- **Facebook:** Founder & agency group scanning, commercial keyword search, timeline post publishing, Messenger direct message triage, comment notification replies.
- **LinkedIn:** TipTap post publishing, container scrolling feed discovery (`main#workspace`, `.scaffold-layout__main`), connection request triage (accepts real professionals, filters spam), unread DM triage with AI conversion replies, inbound comment replies.

---

## 💼 Job Revenue Engine & Marketplaces

The Job Revenue Engine is a dedicated execution plane designed to autonomously hunt, qualify, and apply for high-value remote software contracts across 10 freelance marketplaces.

### Supported Marketplaces (`config/job-platforms.json`)
The platform registry is 100% declarative:
1. **Freelancer.com**
2. **Upwork**
3. **Contra**
4. **PeoplePerHour**
5. **Guru**
6. **Workana**
7. **Malt**
8. **Arc.dev**
9. **Toptal**
10. **Fiverr**

### Strict Operational Principles
- **Remote-Only & Project-Only Hard Gates:** The engine automatically rejects any opportunity categorized as on-site, hybrid, full-time employment, or recruitment agency placement.
- **Fact-Grounded Document Generation:** Cover letters and screening answers are synthesized strictly from `private/base-resume.pdf` and verified knowledge base documents. The agent never hallucinates unverified qualifications, dates, or skills.
- **Google OAuth Without Password Hoarding:** When platforms offer "Continue with Google", the agent selects the configured Google account from the browser's native account chooser. Passwords and 2FA secrets are never handled by code.
- **Browser Isolation:** Runs on a dedicated browser profile (`JOB_BROWSER_USER_DATA_DIR=./private/job-browser-profile`) on port `:9223`, ensuring social networking cookies and marketplace sessions never cross-contaminate.
- **Truthful Post-Submit Verification:** An application is only recorded as `VERIFIED` when the live DOM displays post-submission confirmation (e.g., success banner, application ID, or proposal status indicator).

---

## 📈 Professional Growth & Credential Engine

The Professional Growth Engine transforms the agent into an autonomous career coach and skill development partner.

```
Onboarding Profile & Live GitHub/LinkedIn Evidence
                       ↓
         AI Skill Map & Confidence Scoring
                       ↓
           Curriculum & Goal Generation
                       ↓
  AI Learning Platform Selection (Declarative Registry)
                       ↓
             Live Platform Observation
                       ↓
        Next-Best-Action Reasoning (Gemini)
                       ↓
               Semantic Action Execution
                       ↓
    Post-Condition Verification & Progress Tracking
                       ↓
           Idempotent State Persistence
```

### Features & Capabilities
1. **Dynamic Platform Registry (`config/professional-growth-platforms.json`):**
   - **LeetCode:** Data structures and algorithms mastery.
   - **Kaggle:** Machine learning, data science competitions, and micro-courses.
   - **HackerRank:** Domain-specific problem solving and language skill verification.
   - **freeCodeCamp:** Web development, full-stack JavaScript, and responsive design certifications.
   - **Exercism:** Deep language fluency and mentor code reviews.
   - **Coursera:** University-grade computer science and AI course tracking.
2. **Evidence-Grounded Skill Mapping:** Discovers existing public repositories and work history from GitHub and LinkedIn to benchmark current proficiency before setting goals.
3. **Credential Discovery Engine:** Discovers high-value, free or issuable industry certifications matching target topics. Every candidate link is independently audited by navigating to the live landing page to confirm free enrollment and issuable credential status.
4. **Autonomous Skill Runner:** Interactively navigates exercises, reads task prompts, writes solutions, runs verification test suites on-platform, and tracks completion.
5. **Graceful Checkpoints:** Pauses immediately if an exam requires human identity verification, proctoring, webcam access, or paid subscription gates.

---

## 🎨 Declarative Portfolio Generator & Publisher

Showcasing technical work is essential for winning client contracts on marketplaces like Freelancer.com.

### High-DPI 1000x1000 Canvas Renderer
Using Chromium's native HTML5 canvas over CDP (`scripts/generate-portfolio-cards.js`), the engine creates publication-ready visual showcase cards directly from the single source of truth (`knowledge/portfolio/projects.json`):
- Dynamic brand color palettes & ambient lighting gradients
- Stylized typography and technology badges
- Realized business impact metrics (e.g., "10k+ Active Users", "99.9% Uptime")
- High-contrast visual hierarchy optimized for marketplace discovery grids

### Automated Multi-Platform Publisher
Using `scripts/upload-freelancer-portfolio.js` and `src/jobs/portfolio/portfolio-publisher.js`:
- Discovers `/discover/publish` workflows on live marketplace DOMs
- Attaches rendered high-resolution images via `DOM.setFileInputFiles`
- Populates compliant project titles and descriptions (enforcing minimum 140-character requirements)
- Tags relevant programming languages and frameworks
- Submits and verifies publication status on the live platform

---

## ⚙️ Phase 6 State Machine & Idempotency Architecture

To ensure 24/7 reliability without duplicate actions or state corruption, all execution planes are governed by strict, validated state machines with atomic persistence.

### 1. Goal Lifecycle State Machine
Governs professional growth goals and skill curricula:
```
[DISCOVERED] ──> [PLAN_CREATED] ──> [IN_PROGRESS] ──> [VERIFYING] ──> [COMPLETED]
                        │                  │
                        └──> [BLOCKED_USER_ACTION] ──> [FAILED]
```
- Valid transitions: `transitionGoal(goal, targetStatus, reason)` enforces strict state evolution. Invalid jumps (e.g., `DISCOVERED` directly to `COMPLETED`) throw explicit errors.

### 2. Job Application Lifecycle State Machine
Governs marketplace bids and client proposals:
```
[DISCOVERED] ──> [QUALIFIED] ──> [APPLICATION_READY] ──> [FORM_FILLED] ──> [SUBMITTED] ──> [VERIFIED]
                                                                                │
                                                      [FAILED] <────────────────┴──> [MANUAL_REVIEW]
```
- **Skip Gate Idempotency:** Unsubmitted proposals in transitional states (`APPLICATION_READY`, `FORM_FILLED`) are re-attempted rather than falsely discarded as duplicates. Once an application reaches `SUBMITTED` or `VERIFIED`, it is permanently skipped to prevent duplicate bids.

### 3. Credential Lifecycle State Machine
Governs certifications and course tracks:
```
[DISCOVERED] ──> [ELIGIBLE] ──> [ENROLLED] ──> [IN_PROGRESS] ──> [COMPLETED]
                                                      │
                                                      └──> [BLOCKED]
```

### 4. Atomic JSON Persistence
State stores (`job-state-store.js`, `growth-state-store.js`, `certification-state-store.js`) use atomic file write pipelines: data is written to a temporary file (`.tmp.[pid]`) and safely renamed (`fs.renameSync`) to the destination file. This guarantees zero state corruption even during sudden OS power cuts or `SIGKILL` termination.

---

## 👥 Cross-Platform Identity & Relationship Memory

The relationship engine maintains a unified identity graph across Threads, Facebook, and LinkedIn:

```
[OBSERVED] ──> [IDENTIFIED] ──> [QUALIFIED] ──> [ENGAGED] ──> [CONVERSATION] ──> [OPPORTUNITY] ──> [HANDOFF] ──> [WON / LOST]
```

### Conservative Identity Resolution
- Direct username matches on the same platform are reused immediately.
- Cross-platform matching (e.g., linking a Threads author to a LinkedIn profile) requires explicit identity corroboration (matching personal websites, company URLs, or AI-verified context).
- Interactions, comments, and direct messages are logged with full timestamps, providing contextual continuity across touchpoints.

---

## 🖥️ Semantic Browser & CDP Architecture

The engine connects to Chromium via the Chrome DevTools Protocol (`CDP`), functioning without third-party automation wrappers that trigger anti-bot defenses.

### 9-Level Semantic Fallback Locator
If an interface undergoes layout adjustments, the engine evaluates elements across 9 fallback levels:
1. ARIA role + accessible name (`role="button"[name="Post"]`)
2. Exact visible text matching
3. Semantic attributes (`aria-label`, `title`, `placeholder`)
4. Relative structural positioning (parent card container scoping)
5. Fuzzy normalized text content
6. Interactive element type matching (`button`, `input[type="submit"]`)
7. Standard fallback CSS selectors
8. Visual layout estimation via DOM bounding client rects
9. Hardware mouse click dispatch (`page.mouse.click(x, y)`)

---

## 📲 Multi-OS Installation & 24/7 Resilience

Agentic Automation runs natively across **Android (Termux)**, **Linux**, **macOS**, and **Windows**.

### 📱 Android (Termux + Termux:X11)
Run completely untethered on an Android phone 24/7 without root access:

```bash
# 1. Update Termux packages and install dependencies
pkg update -y
pkg install -y git nodejs-lts x11-repo chromium termux-x11-nightly zip termux-api

# 2. Clone repository & install dependencies
git clone https://github.com/sunmughan/meta-automation.git
cd meta-automation
npm install

# 3. Launch interactive master runner
./start-termux
```

#### Automated Android Resilience Features:
- **Termux Wake-Lock Management:** Automatically acquires `termux-wake-lock` on startup and cleanly releases it via `termux-wake-unlock` on exit, preventing CPU sleep during background execution.
- **Headless Mode Fallback:** Automatically detects if an X11/XDG display server is running; if no display is available, it falls back seamlessly to Puppeteer's high-performance headless mode (`--headless=new`).
- **Resolution Adaptation:** Detects mobile screen geometry (e.g., `1080x2400`) and positions Chromium windows accurately to prevent off-screen modal rendering.
- **Android 12+ Optimization:** Disable Phantom Process Killer via ADB (`adb shell "/system/bin/device_config put activity_manager max_phantom_processes 2147483647"`) and set Termux battery usage to **Unrestricted**.

### 🐧 Linux (Ubuntu / Debian / Arch / Fedora)
```bash
bash installers/install-linux.sh
npm run start
```

### 🍎 macOS (Apple Silicon & Intel)
```bash
bash installers/install-macos.sh
npm run start
```

### 🪟 Windows (PowerShell & Batch)
```powershell
# PowerShell
.\installers\install-windows.ps1
npm run start

# Batch
.\installers\install-windows.bat
```

### 🪟 Desktop Window Layout Manager
For multi-window monitoring on desktop displays, run:
```bash
npm run desktop:layout
```
This automatically tiles social automation, job automation, and terminal monitoring windows side-by-side.

---

## ⌨️ CLI Command Reference

### Master Launchers
| Command | Launcher Script | Description |
|---|---|---|
| `npm start` | `./start-termux` / `scripts/desktop-runner.js` | Interactive launcher (select Social, Job, or Combined) |
| `npm run start:social` | `./start-automation` | Launches dedicated Social Autopilot daemon |
| `npm run start:job` | `./start-job-automation` | Launches dedicated Job Revenue Engine daemon |
| `npm run onboard` | `node threads-agent.js onboard` | Launches 7-stage interactive onboarding wizard |

### Social Autopilot Commands
| Command | Description |
|---|---|
| `npm run agentic:social -- --once` | Executes one complete cycle across all enabled social platforms |
| `npm run agentic:social -- --platform=threads --once` | Executes one cycle on Threads |
| `npm run agentic:social -- --platform=facebook --once` | Executes one cycle on Facebook |
| `npm run agentic:social -- --platform=linkedin --once` | Executes one cycle on LinkedIn |
| `npm run agentic:social -- --daemon` | Runs continuous autonomous social daemon with adaptive backoff |
| `npm run agentic:social -- --goal="<custom objective>"` | Directs social engine toward a specific contextual goal |
| `npm run agentic:social -- --resume` | Resumes execution following a manual security pause |

### Job Revenue Engine Commands
| Command | Description |
|---|---|
| `npm run jobs:setup` | Sets up candidate profile, resume path, and target marketplaces |
| `npm run jobs:google` | Opens dedicated job browser to authenticate Google session |
| `npm run jobs:auth` | Verifies active session cookies on all configured marketplaces |
| `npm run jobs:profile` | Audits candidate profile completeness and portfolio links |
| `npm run jobs:scan` | Scans for open remote projects matching candidate skills |
| `npm run jobs:run` | Executes autonomous job discovery, proposal generation, and submission |
| `npm run jobs:status` | Displays live metrics: discovered, qualified, submitted, verified bids |

### Professional Growth Engine Commands
| Command | Description |
|---|---|
| `npm run growth:profile` | Inspects live GitHub and LinkedIn profiles to generate skill map |
| `npm run growth:skill -- <Skill>` | Creates and runs curriculum for a target skill (e.g. `DSA`, `React`) |
| `npm run growth:discover -- <Topic>` | Discovers and live-verifies free/issuable industry certifications |
| `npm run growth:run` | Resumes and executes active skill and certification goals |
| `npm run growth:status` | Displays progress, completed modules, and active goal status |

### Portfolio Commands
| Command | Description |
|---|---|
| `npm run portfolio:generate` | Renders 1000x1000 high-DPI showcase cards from `projects.json` |
| `npm run portfolio:publish` | Uploads and publishes portfolio items to Freelancer.com |

### Verification & Testing
| Command | Description |
|---|---|
| `npm test` | Runs complete master test suite (all 8 validation suites) |
| `npm run test:state-machine` | Runs Phase 6 state machine and idempotency validation tests |
| `npm run test:growth` | Runs Professional Growth Engine tests |
| `npm run test:portfolio` | Runs Portfolio Architecture validation tests |
| `npm run test:agentic` | Runs static architecture and onboarding compliance audits |
| `npm run e2e:browser` | Runs live end-to-end browser connection tests |

---

## 📁 Repository & Knowledge Base Structure

```text
meta-automation/
├── package.json                      # Project manifest (v2.1.0)
├── agentic-social.js                 # Social Autopilot CLI entry point
├── job-agent.js                      # Job Revenue & Growth CLI entry point
├── threads-agent.js                  # Master CLI & onboarding controller
├── config/
│   ├── index.js                      # Runtime configuration manager
│   ├── job-platforms.json            # 10 declarative job marketplaces
│   ├── professional-growth-platforms.json # Declarative learning platform registry
│   ├── portfolio-platforms.json      # Declarative portfolio publishing registry
│   ├── social-platforms.json         # Declarative social platform registry
│   └── social-lifecycle.json         # Relationship state definitions
├── knowledge/                        # Dynamic Knowledge Base (Hot-reloaded)
│   ├── founder.md                    # Founder professional context & voice
│   ├── company.md                    # Company business profile & value prop
│   ├── services.md                   # Approved & excluded service catalog
│   ├── profiles.md                   # Official verified profile URLs & WhatsApp
│   ├── pillars.md                    # Content pillars & thought-leadership themes
│   ├── lead-rules.md                 # Lead qualification criteria & rules
│   ├── search-queries.md             # Platform-specific high-intent discovery terms
│   ├── positioning.md                # Brand positioning & messaging guidelines
│   └── portfolio/
│       └── projects.json             # Single source of truth for portfolio showcase
├── src/
│   ├── agent/                        # Semantic browser agent & action verification
│   ├── agentic/                      # Next-best-action reasoning engines
│   ├── ai/                           # Antigravity CLI & Gemini AI runtime
│   ├── browser/                      # CDP browser management & operator tools
│   ├── content/                      # Omnichannel content generation
│   ├── jobs/                         # Job Revenue & Professional Growth engines
│   │   ├── application/              # Proposal & document generation engine
│   │   ├── growth/                   # Skill development & credential discovery
│   │   ├── portfolio/                # Canvas card generation & publishing
│   │   └── storage/                  # Atomic state stores & validators
│   ├── leads/                        # Lead scoring, identity graph & relationships
│   └── safety/                       # Global guard, rate limiters & action policy
├── installers/                       # Automated cross-platform installers
│   ├── install-android-termux.sh
│   ├── install-linux.sh
│   ├── install-macos.sh
│   ├── install-windows.bat
│   └── install-windows.ps1
├── scripts/                          # Utility & automation scripts
│   ├── desktop-runner.js             # Dual autopilot desktop orchestrator
│   ├── generate-portfolio-cards.js   # 1000x1000 High-DPI canvas generator
│   ├── layout-cdp-windows.js         # Window tiling manager
│   ├── package-release.sh            # Automated distribution packager
│   └── upload-freelancer-portfolio.js# Freelancer.com portfolio publisher
└── tests/                            # Comprehensive automated test suites
    ├── autopilot-modes.test.js
    ├── cross-platform-audit.js
    ├── desktop-runner.test.js
    ├── job-engine-audit.js
    ├── portfolio-architecture.test.js
    ├── professional-growth.test.js
    ├── state-machine-idempotency.test.js
    └── suite.js
```

---

## 🔒 Safety, Security & Privacy Guarantees

Agentic Automation operates under strict ethical and technical guardrails:

1. **Zero Credential Hoarding:** Social passwords, Google passwords, and multi-factor codes are never stored on disk or transmitted to any server. Authentication remains in your local browser profile.
2. **Deterministic Rate Limiting:** Enforces strict hourly budgets across all actions (comments, DMs, connection requests, applications) to preserve account health.
3. **Challenge Handoff:** If a platform presents a CAPTCHA, SMS OTP, biometric prompt, or KYC checkpoint, the agent immediately halts the workflow and sounds a notification for human resolution.
4. **Local Data Sovereignty:** All state files, candidate resumes, and private profiles reside on your local machine (`private/` and `job-state/`). Nothing is sent to telemetry or tracking servers.
5. **Brand Integrity:** All outbound posts, comments, and proposals are checked against `knowledge/services.md` to ensure no false claims or out-of-scope commitments are made.

---

## 🧪 Verification, Audits & Quality Assurance

The codebase is backed by a multi-layered automated test suite ensuring high reliability across all platforms:

```bash
# Run all test suites
npm test
```

### Test Suite Breakdown:
- **`tests/suite.js`**: Core unit tests covering dynamic knowledge parsing, WhatsApp URL resolution, prompt building, and content safety filters.
- **`tests/cross-platform-audit.js`**: Verifies dynamic knowledge grounding across Threads, Facebook, and LinkedIn without hardcoded company artifacts.
- **`tests/job-engine-audit.js`**: Audits the Job Revenue Engine for remote-only enforcement, proposal fact-grounding, and marketplace registries.
- **`tests/desktop-runner.test.js`**: Validates mutual exclusivity between Social and Job autopilots and process clean-up.
- **`tests/autopilot-modes.test.js`**: Verifies strict execution mode switching and single active engine rules.
- **`tests/professional-growth.test.js`**: Verifies skill plan generation, credential discovery, platform selection, and evidence tracking.
- **`tests/portfolio-architecture.test.js`**: Verifies single catalog truth in `projects.json`, absence of hardcoded duplicate arrays, and asset integrity.
- **`tests/state-machine-idempotency.test.js`**: 10 rigorous tests validating Phase 6 state transitions, atomic persistence, unsubmitted proposal retry gates, and audit trails.

---

## 📦 Distribution Packaging & Releases

Build distribution archives and npm packages with a single command:

```bash
npm run build:release
```

This automated packaging script produces:
- `meta-automation-2.1.0.tgz` (NPM distribution tarball)
- `meta-automation-android-termux.tar.gz` (Termux-optimized bundle)
- `meta-automation-linux-x64.tar.gz` (Linux distribution archive)
- `meta-automation-macos-universal.tar.gz` (macOS distribution archive)
- `meta-automation-windows-x64.zip` (Windows distribution archive)
- `meta-automation-universal-v2.1.0.zip` (Universal bundle)
- `SHA256SUMS.txt` (Cryptographic verification checksums)

---

## 💖 Sponsorship, Enterprise Services & Backers

Thank you for supporting **Agentic Automation**! This project is maintained and continuously advanced by **[CodeAir Software Solutions](https://www.codeair.tech)** under the leadership of **[Sunmughan Swamy](https://github.com/sunmughan)**.

### Why Sponsor?
Your sponsorship directly fuels:
- Ongoing development of local Antigravity AI reasoning and multi-modal browser capabilities.
- Continuous maintenance of live DOM locators resilient against modern frontend updates.
- Native mobile optimizations for 24/7 background execution on Android Termux.
- Expansion of declarative registries across global job marketplaces and learning platforms.

### Sponsorship Tiers
| Tier | Name | Benefits |
|---|---|---|
| **$10/mo** | **Backer** | Recognition in the README Backers section & project Discord badge. |
| **$50/mo** | **Pro Builder** | Priority issue triage, early access to experimental branches, and prompt libraries. |
| **$250/mo** | **Enterprise Supporter** | Logo placement on README & website + direct technical consultation channel. |
| **$1,000/mo** | **Custom Automation Partner** | Dedicated monthly roadmap alignment, custom platform adapter engineering, and SLA. |

### Enterprise Deployments & Inquiries
For custom enterprise deployments, dedicated agent customization, CRM integrations, or white-label solutions:
- **GitHub Sponsors:** [github.com/sponsors/sunmughan](https://github.com/sponsors/sunmughan)
- **Website:** [www.codeair.tech](https://www.codeair.tech)
- **Direct Email:** [contact@codeair.tech](mailto:contact@codeair.tech)
- **Official WhatsApp:** [wa.me/codeair](https://wa.me/codeair)
- **Featured Product:** [PixelGo HMS (Hospital Management System)](https://pixelgo.live)

---

## 📄 License

Distributed under the **MIT License**. See [LICENSE](LICENSE) for details.

*Crafted with precision by [CodeAir Software Solutions](https://www.codeair.tech).*
