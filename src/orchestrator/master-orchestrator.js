/**
 * src/orchestrator/master-orchestrator.js
 * Unified Master Orchestrator — coordinates Social, Job, Email, and Meeting engines.
 *
 * Runs a continuous 24/7 loop with intelligent priority scheduling:
 *   Priority 1: Email (check every 15 min — catch interview invitations fast)
 *   Priority 2: Job applications (high-value remote projects)
 *   Priority 3: Social media engagement (Threads, LinkedIn, Facebook, Instagram)
 *
 * Each operation goes through the Universal Agentic Loop — zero hardcoded UI logic.
 */

const CONFIG = require("../../config");
const AgenticSocialOps = require("../agent/social-operations");
const AgenticRunner = require("../agent/agentic-runner");
const EmailEngine = require("../jobs/email/email-engine");
const MeetingEngine = require("../jobs/meetings/meeting-engine");
const { registerOnPlatform } = require("../jobs/registration/registration-engine");
const { getEnabledPlatforms } = require("../jobs/platform-registry");
const { loadCandidateProfile } = require("../jobs/profile/profile-engine");
const { discoverOnPlatform } = require("../jobs/discovery/opportunity-engine");
const { applyToOpportunity } = require("../jobs/application/application-engine");
const jobState = require("../jobs/storage/job-state-store");
const stateStore = require("../storage/state-store");
const browserManager = require("../browser/browser-manager");
const logger = require("../logging/logger");

class MasterOrchestrator {
  constructor({ aiRuntime }) {
    this.aiRuntime = aiRuntime;
    this.cycle = 0;
    this.lastEmailCheck = 0;
    this.lastJobCycle = 0;
    this.emailCheckIntervalMs = 15 * 60 * 1000; // 15 minutes
    this.jobCycleIntervalMs = CONFIG.JOB_DISCOVERY_INTERVAL_SECONDS * 1000;
    this.socialCycleIntervalMs = CONFIG.SCAN_INTERVAL_SECONDS * 1000;
  }

  /**
   * The master continuous loop. Runs until process is killed.
   */
  async runContinuous() {
    logger.info("[MASTER ORCHESTRATOR] Starting unified agentic orchestrator...");

    while (true) {
      this.cycle++;
      const cycleStart = Date.now();
      const cycleReport = {
        cycle: this.cycle,
        startedAt: new Date().toISOString(),
        results: {},
        errors: []
      };

      try {
        // ═══════════════════════════════════════════════
        // PRIORITY 1: Email monitoring (every 15 min)
        // ═══════════════════════════════════════════════
        if (this.shouldCheckEmail()) {
          logger.info(`[ORCHESTRATOR] Priority 1: Checking email inbox...`);
          try {
            cycleReport.results.email = await this.runEmailCycle();
            this.lastEmailCheck = Date.now();

            // Process interview invitations immediately if found
            if (cycleReport.results.email?.hasInvitations) {
              logger.info(`[ORCHESTRATOR] Found interview invitations — processing immediately...`);
              cycleReport.results.meetings = await this.processMeetingInvitations();
            }
          } catch (emailErr) {
            cycleReport.errors.push({ engine: "email", error: emailErr.message });
            logger.error(`[ORCHESTRATOR] Email cycle failed: ${emailErr.message}`);
          }
        }

        // ═══════════════════════════════════════════════
        // PRIORITY 2: Job engine (when enabled)
        // ═══════════════════════════════════════════════
        if (CONFIG.JOB_AUTOMATION_ENABLED && this.shouldRunJobCycle()) {
          logger.info(`[ORCHESTRATOR] Priority 2: Running job engine cycle...`);
          try {
            cycleReport.results.jobs = await this.runJobCycle();
            this.lastJobCycle = Date.now();
          } catch (jobErr) {
            cycleReport.errors.push({ engine: "jobs", error: jobErr.message });
            logger.error(`[ORCHESTRATOR] Job cycle failed: ${jobErr.message}`);
          }
        }

        // ═══════════════════════════════════════════════
        // PRIORITY 3: Social media operations
        // ═══════════════════════════════════════════════
        logger.info(`[ORCHESTRATOR] Priority 3: Running social media cycles...`);
        const socialPlatforms = ["threads", "linkedin", "facebook"];

        for (const platform of socialPlatforms) {
          try {
            cycleReport.results[`social:${platform}`] = await this.runSocialCycle(platform);
          } catch (socialErr) {
            cycleReport.errors.push({ engine: `social:${platform}`, error: socialErr.message });
            logger.error(`[ORCHESTRATOR] ${platform} cycle failed: ${socialErr.message}`);
          }
        }

        // ═══════════════════════════════════════════════
        // Cycle complete — report & wait
        // ═══════════════════════════════════════════════
        cycleReport.completedAt = new Date().toISOString();
        cycleReport.durationMs = Date.now() - cycleStart;
        cycleReport.status = cycleReport.errors.length === 0 ? "SUCCESS" : "PARTIAL_FAILURE";

        this.logCycleReport(cycleReport);

        if (process.argv.includes("--once")) {
          logger.info("[ORCHESTRATOR] Single cycle completed (--once flag). Exiting.");
          return cycleReport;
        }

        // Wait for next cycle
        await new Promise(r => setTimeout(r, this.socialCycleIntervalMs));

      } catch (fatalErr) {
        logger.error(`[ORCHESTRATOR] Fatal error in cycle ${this.cycle}: ${fatalErr.message}`);
        cycleReport.errors.push({ engine: "orchestrator", error: fatalErr.message });
        // Recover after 30s on fatal errors
        await new Promise(r => setTimeout(r, 30000));
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // SOCIAL CYCLE — agentic operations on a single platform
  // ═══════════════════════════════════════════════════════════════

  async runSocialCycle(platform) {
    const result = { platform, operations: [], status: "SUCCESS" };

    const getPageFn = {
      threads: () => browserManager.getThreadsPage({ bringToFront: true }),
      linkedin: () => browserManager.getLinkedInPage({ bringToFront: true }),
      facebook: () => browserManager.getFacebookPage({ bringToFront: true }),
      instagram: () => browserManager.getInstagramPage({ bringToFront: true })
    };

    const pageFn = getPageFn[platform];
    if (!pageFn) {
      result.status = "SKIPPED";
      result.reason = "Unknown platform";
      return result;
    }

    try {
      const page = await pageFn();
      const { BrowserAgent } = require("../agent/browser-agent");
      const browserAgent = new BrowserAgent(page, platform);
      const socialOps = new AgenticSocialOps({
        aiRuntime: this.aiRuntime,
        browserAgent,
        platform
      });

      // 1. Feed scan
      logger.info(`[${platform.toUpperCase()}] Scanning feed...`);
      const feedResult = await socialOps.scanFeed({ maxPosts: 10 });
      result.operations.push({ op: "feed_scan", ...feedResult });

      // 2. Search discovery (every 4th cycle)
      if (this.cycle % 4 === 1) {
        logger.info(`[${platform.toUpperCase()}] Running AI search discovery...`);
        const searchResult = await socialOps.searchDiscovery();
        result.operations.push({ op: "search_discovery", ...searchResult });
      }

      // 3. Check notifications
      if (this.cycle % 3 === 1) {
        logger.info(`[${platform.toUpperCase()}] Checking notifications...`);
        const notifResult = await socialOps.checkNotifications();
        result.operations.push({ op: "notifications", ...notifResult });
      }

      // 4. Check messages
      if (this.cycle % 5 === 1) {
        logger.info(`[${platform.toUpperCase()}] Checking messages...`);
        const msgResult = await socialOps.checkMessages();
        result.operations.push({ op: "messages", ...msgResult });
      }

      // 5. Connection requests (LinkedIn, Facebook)
      if ((platform === "linkedin" || platform === "facebook") && this.cycle % 3 === 0) {
        logger.info(`[${platform.toUpperCase()}] Processing connection requests...`);
        const connResult = await socialOps.processConnectionRequests();
        result.operations.push({ op: "connections", ...connResult });
      }

    } catch (err) {
      result.status = "FAILED";
      result.error = err.message;
      logger.error(`[${platform.toUpperCase()}] Social cycle failed: ${err.message}`);
    }

    return result;
  }

  // ═══════════════════════════════════════════════════════════════
  // JOB CYCLE — discover, qualify, apply across all platforms
  // ═══════════════════════════════════════════════════════════════

  async runJobCycle() {
    const profile = loadCandidateProfile();
    if (!profile) return { status: "SKIPPED", reason: "No candidate profile configured" };

    const jobBrowserManager = require("../jobs/browser/job-browser-manager");
    const JobBrowserAgent = require("../jobs/browser/job-browser-agent");

    try {
      await jobBrowserManager.connect();
    } catch (err) {
      return { status: "FAILED", reason: `Job browser not available: ${err.message}` };
    }

    const report = {};
    for (const platform of getEnabledPlatforms()) {
      const platformState = jobState.state.platforms[platform.id];

      // If not authenticated, try registration first
      if (!platformState || !["AUTHENTICATED", "READY"].includes(platformState.status)) {
        logger.info(`[JOB ENGINE] ${platform.name} not authenticated — attempting registration...`);
        const page = await jobBrowserManager.open(platform.url);
        const agent = new JobBrowserAgent(page, platform.id);

        const regResult = await registerOnPlatform({
          platform, page, browserAgent: agent,
          aiRuntime: this.aiRuntime, candidateProfile: profile
        });

        // Handle email verification if needed
        if (regResult.status === "NEEDS_EMAIL_VERIFICATION") {
          const gmailPage = await jobBrowserManager.open("https://mail.google.com/");
          const gmailAgent = new JobBrowserAgent(gmailPage, "gmail");
          const emailEngine = new EmailEngine({ aiRuntime: this.aiRuntime, browserAgent: gmailAgent });
          const verifyResult = await emailEngine.verifyRegistrationEmail(platform.name, new URL(platform.url).hostname);

          if (verifyResult.verified) {
            // Go back to platform and verify auth
            await page.goto(platform.url, { waitUntil: "domcontentloaded" });
            jobState.setPlatformState(platform.id, { status: "AUTHENTICATED", method: "EMAIL_VERIFIED" });
          }
        }

        if (!["AUTHENTICATED", "READY"].includes(jobState.state.platforms[platform.id]?.status)) {
          report[platform.id] = { status: "NOT_AUTHENTICATED", reason: regResult.reason };
          continue;
        }
      }

      // Discover and apply
      try {
        const page = await jobBrowserManager.open(platform.url);
        const agent = new JobBrowserAgent(page, platform.id);

        const discovery = await discoverOnPlatform({
          platform, page, browserAgent: agent,
          aiRuntime: this.aiRuntime, candidateProfile: profile
        });

        report[platform.id] = {
          discoveryStatus: discovery.status,
          opportunities: discovery.opportunities?.length || 0,
          applications: []
        };

        for (const opportunity of discovery.opportunities || []) {
          const appResult = await applyToOpportunity({
            opportunity, page, browserAgent: agent,
            aiRuntime: this.aiRuntime
          });

          report[platform.id].applications.push({
            opportunity: opportunity.key,
            status: appResult.status,
            reason: appResult.reason || ""
          });

          if (appResult.status === "RATE_LIMITED") break;
        }
      } catch (err) {
        report[platform.id] = { status: "FAILED", error: err.message };
      }
    }

    jobBrowserManager.disconnect();
    return report;
  }

  // ═══════════════════════════════════════════════════════════════
  // EMAIL CYCLE — check inbox, process responses
  // ═══════════════════════════════════════════════════════════════

  async runEmailCycle() {
    const jobBrowserManager = require("../jobs/browser/job-browser-manager");
    const JobBrowserAgent = require("../jobs/browser/job-browser-agent");

    try {
      await jobBrowserManager.connect();
      const gmailPage = await jobBrowserManager.open("https://mail.google.com/");
      const gmailAgent = new JobBrowserAgent(gmailPage, "gmail");
      const emailEngine = new EmailEngine({ aiRuntime: this.aiRuntime, browserAgent: gmailAgent });

      const inboxResult = await emailEngine.checkInbox({
        filterKeywords: ["interview", "application", "project", "meeting", "proposal", "accepted", "shortlisted"]
      });

      jobBrowserManager.disconnect();
      return inboxResult;
    } catch (err) {
      logger.error(`[EMAIL CYCLE] Failed: ${err.message}`);
      return { success: false, reason: err.message };
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // MEETING PROCESSING
  // ═══════════════════════════════════════════════════════════════

  async processMeetingInvitations() {
    const jobBrowserManager = require("../jobs/browser/job-browser-manager");
    const JobBrowserAgent = require("../jobs/browser/job-browser-agent");

    try {
      await jobBrowserManager.connect();
      const gmailPage = await jobBrowserManager.open("https://mail.google.com/");
      const gmailAgent = new JobBrowserAgent(gmailPage, "gmail");
      const emailEngine = new EmailEngine({ aiRuntime: this.aiRuntime, browserAgent: gmailAgent });

      const result = await emailEngine.processInterviewInvitations();
      jobBrowserManager.disconnect();
      return result;
    } catch (err) {
      logger.error(`[MEETING PROCESSING] Failed: ${err.message}`);
      return { success: false, reason: err.message };
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // SCHEDULING HELPERS
  // ═══════════════════════════════════════════════════════════════

  shouldCheckEmail() {
    return Date.now() - this.lastEmailCheck >= this.emailCheckIntervalMs;
  }

  shouldRunJobCycle() {
    return Date.now() - this.lastJobCycle >= this.jobCycleIntervalMs;
  }

  logCycleReport(report) {
    const opCount = Object.keys(report.results).length;
    const errorCount = report.errors.length;
    const duration = report.durationMs ? `${(report.durationMs / 1000).toFixed(1)}s` : "?";

    logger.info(`[ORCHESTRATOR] Cycle #${report.cycle} ${report.status} — ${opCount} engines, ${errorCount} errors, ${duration}`);

    if (errorCount > 0) {
      for (const err of report.errors) {
        logger.warn(`  └─ ${err.engine}: ${err.error}`);
      }
    }
  }
}

module.exports = MasterOrchestrator;
