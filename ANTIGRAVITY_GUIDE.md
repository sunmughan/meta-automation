# 🪐 Antigravity Master Guide: Meta Automation

This guide provides complete, step-by-step instructions on setting up **Google Antigravity**, integrating it with **Meta Automation**, and orchestrating autonomous lead generation on **Linux**, **macOS**, **Windows**, and **Android (Termux)**.

---

## 📑 Table of Contents

1. [Architectural Overview](#architectural-overview)
2. [Installing Antigravity Across All Devices](#installing-antigravity-across-all-devices)
   - [Linux (Ubuntu, Debian, Zorin, Fedora)](#1-linux)
   - [macOS (Apple Silicon & Intel)](#2-macos)
   - [Windows (Windows 10/11)](#3-windows)
   - [Android (Termux)](#4-android-termux)
3. [Opening Meta Automation in Antigravity](#opening-meta-automation-in-antigravity)
4. [Master Prompts to Control the Automation](#master-prompts-to-control-the-automation)
   - [Prompt 1: Full Autonomous Mode (Live Growth Loop)](#prompt-1-full-autonomous-mode)
   - [Prompt 2: Lead Discovery & Market Intelligence Scan](#prompt-2-lead-discovery--market-intelligence-scan)
   - [Prompt 3: Human-in-the-Loop Review & Approval Mode](#prompt-3-human-in-the-loop-review--approval-mode)
   - [Prompt 4: Visual Carousel Deck & Brand Card Generation](#prompt-4-visual-carousel-deck--brand-card-generation)
5. [Running Standalone in Background (Outside Antigravity)](#running-standalone-in-background-outside-antigravity)
6. [Troubleshooting & FAQ](#troubleshooting--faq)

---

## 🧠 Architectural Overview

**Meta Automation** uses a dual-layer architecture:
- **The Brain (Antigravity AI / Gemini 3.6 Flash)**: Analyzes conversational context, evaluates genuine purchase intent, applies anti-spam negative filtering, resolves persona identities (Founder vs. Company), and drafts executive-level responses.
- **The Hands (Puppeteer + CDP on Port 9222)**: Directly controls your existing authenticated desktop or mobile browser session, types with human cadence and jitter, renders Stripe/Linear-grade graphics, and submits posts/DMs without API keys or session resets.

---

## 💻 Installing Antigravity Across All Devices

### 1. Linux
- **Antigravity IDE**: Download the Linux `.deb` or `.tar.gz` from the official portal and install:
  ```bash
  sudo apt install ./antigravity_latest_amd64.deb
  ```
- **Antigravity CLI (`agy`)**:
  ```bash
  curl -fsSL https://antigravity.google/install.sh | bash
  ```

### 2. macOS
- **Antigravity Desktop**: Download the Universal `.dmg` from the official portal, open it, and drag `Antigravity.app` to `/Applications`.
- **Antigravity CLI (`agy`)**:
  ```bash
  curl -fsSL https://antigravity.google/install.sh | bash
  ```

### 3. Windows
- **Antigravity Desktop**: Download and run `AntigravitySetup.exe`.
- **Antigravity CLI (`agy`)**: Open PowerShell as Administrator and run:
  ```powershell
  iwr -useb https://antigravity.google/install.ps1 | iex
  ```

### 4. Android (Termux)
In Termux, you can install the Antigravity CLI and tools directly:
```bash
# Inside Termux
pkg update -y
pkg install -y nodejs-lts git
npm install -g @google/antigravity
```
Verify installation:
```bash
agy --version || antigravity --version
```

---

## 📂 Opening Meta Automation in Antigravity

1. Launch **Antigravity IDE** (or start the terminal TUI via `agy`).
2. Click **File -> Open Folder...** (or in CLI: `agy /path/to/meta-automation`).
3. Select the `meta-automation` root directory.
4. Antigravity will automatically index `knowledge/`, `config/`, and `src/`.

---

## 💬 Master Prompts to Control the Automation

When interacting with Antigravity inside this repository, use these battle-tested prompts depending on your goal:

### Prompt 1: Full Autonomous Mode
> Use this when you want the agent to operate completely autonomously with continuous discovery, lead qualification, and live commenting.

```text
You are the primary growth director for Meta Automation.
1. Attach to the active Brave/Chromium browser on CDP port 9222.
2. Continuously scan the Threads organic feed and all 13 high-intent search channels for prospective buyers looking for website design, SaaS, AI automation, custom CRMs, and hospital software.
3. Apply strict negative filters to reject recruiters, job seekers, and generic service sellers.
4. Route qualified leads to either Founder identity (Sunmughan Swamy) or Company identity (CodeAir Software Solutions).
5. Post contextual, high-value comments and monitor direct messages with duplicate guards.
6. Execute the automated 3-hour publishing cadence across the 5 strategic content pillars.
```

---

### Prompt 2: Lead Discovery & Market Intelligence Scan
> Use this when you want a market audit without posting any live comments.

```text
Run a lead discovery scan on Threads without posting live comments.
1. Search across all 13 buyer query channels (e.g., 'need a website', 'looking for SaaS developer', 'automate support with AI').
2. Classify every discovered post into HOT, WARM, or COLD leads.
3. Extract usernames, post URLs, and specific client requirements.
4. Output a clean summary table of qualified leads ready for review.
```

---

### Prompt 3: Human-in-the-Loop Review & Approval Mode
> Use this when you want to review and approve every drafted comment before it goes live.

```text
Set operational mode to APPROVAL_MODE=true.
1. Scan for newly posted buyer requests on Threads and Instagram.
2. For every qualified lead, draft a tailored, engaging comment using our company knowledge base.
3. Queue the drafted comments in our state store and present each drafted response to me for confirmation.
4. Only publish comments that I explicitly approve.
```

---

### Prompt 4: Visual Carousel Deck & Brand Card Generation
> Use this to generate Stripe/Linear-grade 1080x1080 social media visual assets.

```text
Generate a high-fidelity visual asset for social publishing:
1. Target pillar: 'pixelgo_hms' (Hospital Management System) or 'agentic_ai'.
2. Use the HTML graphic renderer to produce a 5-slide dark-mode carousel deck (1080x1080).
3. Include official brand emblems, typography, and authentic URLs (pixelgo.live for PixelGo, www.codeair.tech for CodeAir).
4. Save the generated slide PNGs in logs/media_slides/ and draft an accompanying high-engagement caption.
```

---

## ⚡ Running Standalone in Background (Outside Antigravity)

You don't need to keep the Antigravity IDE open all day. You can launch Meta Automation as a persistent, detached background daemon that will run non-stop 24/7 on your machine:

### Linux & macOS
```bash
# Start background daemon
./start-automation

# Check live stats, scanned leads, and rate limits
./status-automation

# Gracefully stop
./stop-automation
```

### Windows (PowerShell)
```powershell
# Start background daemon
powershell -ExecutionPolicy Bypass -File .\start-automation.ps1

# Or simply double click:
start-automation.bat

# Check live stats
powershell -ExecutionPolicy Bypass -File .\status-automation.ps1

# Stop daemon
powershell -ExecutionPolicy Bypass -File .\stop-automation.ps1
```

### Android (Termux)
```bash
# In Termux:
~/start-meta.sh

# Or directly:
./start-termux
```

---

## 🛠️ Troubleshooting & FAQ

### Q: Does closing Antigravity stop the automation?
**No.** If launched using `./start-automation` (or `start-automation.ps1` / `start-termux`), the daemon runs detached from your terminal or IDE under its own PID. You can close Antigravity, close the terminal window, or lock your screen — the automation continues running.

### Q: What happens if the machine is powered off?
When you turn your laptop/phone back on:
1. Launch your browser with `./scripts/launch-brave-cdp.sh` (or `launch-brave-cdp.ps1`).
2. Run `./start-automation` (or `start-automation.ps1` / `~/start-meta.sh`).
It will immediately resume from where it left off without duplicating any past comments or DMs.

### Q: Where are the logs and leads stored?
- Live daemon log: `logs/daemon.log`
- Audit trail: `logs/audit.log`
- Leads database: `threads-leads.json`
- State store: `threads-engagement-state.json`

---

*Engineered with excellence by [CodeAir Software Solutions](https://www.codeair.tech).*
