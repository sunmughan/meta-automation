/**
 * src/jobs/email/email-engine.js
 * Agentic Email Integration Engine.
 *
 * Handles all Gmail/email operations through live browser observation:
 *   - Email verification for platform registrations
 *   - Inbox monitoring for job application responses
 *   - Reading and responding to client/recruiter emails
 *   - Processing interview invitations
 *   - Managing email-based follow-ups
 *
 * ZERO hardcoded selectors — AI reads Gmail's live UI.
 */

const CONFIG = require("../../../config");
const AgenticRunner = require("../../agent/agentic-runner");
const logger = require("../../logging/logger");

class EmailEngine {
  /**
   * @param {Object} options
   * @param {Object} options.aiRuntime — MiniMax M3 AI runtime
   * @param {Object} options.browserAgent — BrowserAgent with page
   */
  constructor({ aiRuntime, browserAgent }) {
    this.aiRuntime = aiRuntime;
    this.browserAgent = browserAgent;
    this.runner = new AgenticRunner({ aiRuntime, browserAgent, maxIterations: 10 });
  }

  // ═══════════════════════════════════════════════════════════════
  // EMAIL VERIFICATION — verify registration emails from platforms
  // ═══════════════════════════════════════════════════════════════

  /**
   * Opens Gmail and verifies a registration email from a specific platform.
   * AI searches for the verification email, opens it, and clicks the verify link.
   *
   * @param {string} platformName — Name of the platform (e.g., "Upwork", "Freelancer")
   * @param {string} [platformDomain] — Domain to look for (e.g., "upwork.com")
   */
  async verifyRegistrationEmail(platformName, platformDomain) {
    logger.info(`[EMAIL ENGINE] Checking Gmail for verification email from ${platformName}...`);

    const result = await this.runner.run({
      goal: `Open Gmail (mail.google.com) if not already there.
Search for a recent email from ${platformName}${platformDomain ? ` (from @${platformDomain} or similar)` : ""}.
Look for emails with subjects containing: "verify", "confirm", "welcome", "activate", "registration".

When you find the verification email:
1. Open it
2. Read the email content
3. Find the verification link or button ("Verify Email", "Confirm Account", "Activate Account", or a verification URL)
4. Click the verification link/button
5. A new tab or page should open with ${platformName}
6. On the verification page, look for confirmation ("Email verified", "Account activated", "Success")
7. Return DONE if verification succeeded

If no verification email is found, return BLOCKED with reason "NO_VERIFICATION_EMAIL_FOUND".
If the email requires a code instead of a link, extract the code and return it in data.

Output on success: { "verified": true, "evidence": "what confirmation I see" }
Output if code needed: { "verified": false, "verificationCode": "123456" }`,
      context: {
        workflow: "EMAIL_VERIFICATION",
        platform: platformName,
        targetId: `email-verify:${platformName}`
      },
      allowedOrigins: [
        "https://mail.google.com",
        platformDomain ? `https://${platformDomain}` : "",
        platformDomain ? `https://www.${platformDomain}` : ""
      ].filter(Boolean)
    });

    return {
      verified: result.status === "DONE" && result.data?.verified,
      verificationCode: result.data?.verificationCode || null,
      evidence: result.data?.evidence || result.reason,
      status: result.status,
      result
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // INBOX CHECK — monitor for job responses & client messages
  // ═══════════════════════════════════════════════════════════════

  /**
   * Checks Gmail inbox for relevant emails (job responses, interview invitations,
   * client messages, platform notifications).
   *
   * @param {Object} [options={}]
   * @param {string[]} [options.filterKeywords] — Keywords to look for
   * @param {number} [options.maxEmails=15] — Max emails to process
   */
  async checkInbox(options = {}) {
    const filterKeywords = options.filterKeywords || [
      "interview", "application", "project", "meeting", "proposal",
      "accepted", "shortlisted", "offer", "congratulations"
    ];
    const maxEmails = options.maxEmails || 15;

    logger.info(`[EMAIL ENGINE] Checking Gmail inbox for relevant emails...`);

    const result = await this.runner.run({
      goal: `Open Gmail (mail.google.com) if not already there.
Check the inbox for recent unread emails. Scan up to ${maxEmails} recent emails.

For each email, classify it into one of these categories:
- JOB_RESPONSE: Responses to job applications (accepted, rejected, shortlisted, follow-up)
- INTERVIEW_INVITATION: Interview scheduling, meeting links, calendar invites
- CLIENT_MESSAGE: Direct messages from potential clients or recruiters
- PLATFORM_NOTIFICATION: Notifications from job platforms (new matches, messages)
- FOLLOW_UP_NEEDED: Emails that require our response
- IRRELEVANT: Marketing, newsletters, spam, system notifications

Look specifically for emails related to: ${filterKeywords.join(", ")}

For each relevant email (not IRRELEVANT), extract:
- Sender name and email
- Subject line
- Preview/summary of content
- Category (from above)
- Whether it requires a response from us
- Whether it contains a meeting/interview invitation with a link
- Any meeting links (Google Meet, Zoom, Microsoft Teams URLs)

Return DONE with extracted email data.
Output: { 
  "emails": [{ "sender": "", "email": "", "subject": "", "preview": "", "category": "", 
               "needsResponse": true/false, "hasInvitation": true/false, "meetingLink": "" }],
  "unreadCount": 0,
  "relevantCount": 0
}`,
      context: {
        workflow: "INBOX_CHECK",
        maxEmails,
        targetId: "email:inbox-check"
      },
      allowedOrigins: ["https://mail.google.com"]
    });

    if (result.status === "DONE" && result.data) {
      const emails = result.data.emails || [];
      const hasInvitations = emails.some(e => e.hasInvitation);

      return {
        success: true,
        emails,
        unreadCount: result.data.unreadCount || emails.length,
        relevantCount: result.data.relevantCount || emails.filter(e => e.category !== "IRRELEVANT").length,
        hasInvitations,
        invitations: emails.filter(e => e.hasInvitation),
        needsResponse: emails.filter(e => e.needsResponse)
      };
    }

    return {
      success: false,
      emails: [],
      unreadCount: 0,
      relevantCount: 0,
      hasInvitations: false,
      reason: result.reason || result.status
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // READ & RESPOND — open, read, and reply to specific emails
  // ═══════════════════════════════════════════════════════════════

  /**
   * Opens a specific email and responds to it.
   *
   * @param {string} emailSubject — Subject line to find
   * @param {string} responseText — The response to send
   * @param {Object} [options={}] — { strategy }
   */
  async readAndRespond(emailSubject, responseText, options = {}) {
    logger.info(`[EMAIL ENGINE] Opening and responding to email: "${emailSubject.slice(0, 60)}"`);

    const result = await this.runner.run({
      goal: `In Gmail, find and open the email with subject containing: "${emailSubject}".
Read the full email content.
Click "Reply" or "Reply All".
Type this response: "${responseText}"
Click "Send" to send the reply.
Verify the reply appears as sent in the conversation thread.

Return DONE if the reply was sent successfully.`,
      context: {
        workflow: "EMAIL_RESPOND",
        targetId: `email:respond:${emailSubject.slice(0, 30)}`
      },
      allowedOrigins: ["https://mail.google.com"]
    });

    return {
      success: result.status === "DONE",
      emailSubject,
      result
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // INTERVIEW PROCESSING — handle meeting invitations
  // ═══════════════════════════════════════════════════════════════

  /**
   * Processes interview/meeting invitations found in emails.
   * Accepts calendar invites and extracts meeting details.
   */
  async processInterviewInvitations() {
    logger.info(`[EMAIL ENGINE] Processing interview invitations in Gmail...`);

    const result = await this.runner.run({
      goal: `In Gmail, search for recent emails containing meeting or interview invitations.
Look for emails with:
- Google Calendar invites (RSVP buttons: Yes, No, Maybe)
- Google Meet links (meet.google.com/...)
- Microsoft Teams links (teams.microsoft.com/...)
- Zoom links (zoom.us/...)
- Interview scheduling (Calendly, cal.com, etc.)
- Subject containing: "interview", "meeting", "call", "schedule"

For each invitation found:
1. Open the email
2. Extract: date, time, timezone, meeting link, organizer name/email, description/agenda
3. If there's a calendar RSVP (Yes/No/Maybe), click "Yes" to accept
4. If it's a Calendly/scheduler link, note the URL but don't click (return data only)

Return DONE with all found and processed invitations.
Output: { 
  "invitations": [{ 
    "organizer": "", "subject": "", "dateTime": "", "timezone": "",
    "meetingLink": "", "meetingType": "GOOGLE_MEET|TEAMS|ZOOM|OTHER",
    "accepted": true/false, "description": ""
  }]
}`,
      context: {
        workflow: "INTERVIEW_PROCESSING",
        targetId: "email:interview-process"
      },
      allowedOrigins: [
        "https://mail.google.com",
        "https://calendar.google.com",
        "https://meet.google.com"
      ]
    });

    return {
      success: result.status === "DONE",
      invitations: result.data?.invitations || [],
      result
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // COMPOSE — compose and send a new email
  // ═══════════════════════════════════════════════════════════════

  /**
   * Composes and sends a new email.
   *
   * @param {string} to — Recipient email
   * @param {string} subject — Email subject
   * @param {string} body — Email body
   */
  async composeAndSend(to, subject, body) {
    logger.info(`[EMAIL ENGINE] Composing email to ${to}: "${subject.slice(0, 40)}"`);

    const result = await this.runner.run({
      goal: `In Gmail, compose a new email:
- Click the "Compose" button
- In the "To" field, type: ${to}
- In the "Subject" field, type: ${subject}
- In the body, type: ${body}
- Click "Send"
- Verify the email was sent (check for "Message sent" notification or sent folder)

Return DONE if sent successfully.`,
      context: {
        workflow: "EMAIL_COMPOSE",
        targetId: `email:compose:${to}`
      },
      allowedOrigins: ["https://mail.google.com"]
    });

    return {
      success: result.status === "DONE",
      to,
      subject,
      result
    };
  }
}

module.exports = EmailEngine;
