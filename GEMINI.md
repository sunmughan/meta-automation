# Agent Guidelines & Memory: meta-automation

## 1. Branch Discipline & Remote Sync
- **Strict Branch Boundary:** Always operate strictly on the branch assigned by the user (currently `professional-growth-engine`). Never switch, checkout other branches, or merge without explicit instruction.
- **Git Push Verification:** Whenever changes are completed and tested, commit with descriptive messages and push directly to `origin <branch>`. Ensure `git status` reports `working tree clean` and `Your branch is up to date with 'origin/<branch>'`.

## 2. Zero-Hardcoding Architecture
- **No Hardcoded Selectors/Coordinates:** Never introduce CSS selectors, XPath expressions, pixel coordinates, or fixed click sequences into generic runtime business logic. All browser interactions must route through the semantic browser agent (`BrowserAgent` / `JobAgentRunner` / `GrowthRunner`).
- **Declarative Data Ownership:** Catalog and platform policies belong strictly in `config/` (e.g. `config/professional-growth-platforms.json`, `config/job-platforms.json`, `config/portfolio-platforms.json`) and `knowledge/` (e.g. `knowledge/portfolio/projects.json`).
- **No Hardcoded Portfolio Arrays:** Never embed static project arrays (`const PROJECTS = [ ... ]`) or legacy `portfolio_images` paths in source code.

## 3. State Machine & Idempotency Rules (Phase 6 Architecture)
- **Explicit Lifecycle:**
  - Growth Goals: `PLANNED -> STARTED -> IN_PROGRESS -> DONE` (terminal) | `FAILED` (safe retry) | `BLOCKED`.
  - Credentials: `DISCOVERED -> PLANNED -> ENROLLED -> IN_PROGRESS -> COMPLETED/DONE` | `FAILED` | `BLOCKED`.
  - Applications: `PLANNED -> DOCUMENTS_GENERATED -> APPLICATION_READY -> FORM_STARTED -> FORM_FILLED -> SUBMITTING -> SUBMITTED -> VERIFIED`.
- **Terminal State Protection:** Terminal states (`DONE`, `VERIFIED`, `COMPLETED`) are immutable. Never permit backward transitions (such as `DONE -> PLANNED`).
- **Application Duplicate Guards:** Only terminal successful applications (`SUBMITTED` or `VERIFIED`) satisfy duplicate skip gates. Unsubmitted applications (`APPLICATION_READY` or `FORM_FILLED`) interrupted by crash/restart must reconcile and resume, never skip.
- **Event-Based Idempotent Metrics:**
  - `goalsStarted`: Incremented strictly on the initial start event for a stable goal ID. Retrying a `FAILED` goal must not re-increment `goalsStarted`.
  - `goalsCompleted`: Incremented strictly once when transitioning to `DONE` for the first time.
- **Atomic Persistence:** All state file writes must use unique collision-free temporary filenames (`${filePath}.tmp.${Date.now()}.${process.pid}.${nonce}`) and atomic rename.
- **Sanitized Audit Trails:** State transitions append to `history` / `auditTrail` while strictly excluding sensitive credentials (passwords, cookies, tokens, auth headers).

## 4. Multi-OS & Runtime Resilience
- **Android Termux:** Background automation must maintain `termux-wake-lock` during execution and release with `termux-wake-unlock` on exit. If Termux:X11 display server drops or is inactive, automatically fall back to `--headless=new`.
- **Antigravity AI Runtime:** Always use `--dangerously-skip-permissions` to eliminate interactive TTY hangs, normalize Gemini models (e.g. `Gemini 3.8 Flash (Medium)`), and strip markdown code fences from JSON output.
