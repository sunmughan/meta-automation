/**
 * src/jobs/meetings/meeting-engine.js
 * Agentic Meeting Setup Engine.
 *
 * Handles meeting creation and management through live browser observation:
 *   - Google Meet creation via Google Calendar
 *   - Microsoft Teams meeting joining
 *   - Zoom meeting joining
 *   - Calendar event management
 *   - Meeting invitation responses
 *
 * ZERO hardcoded selectors — AI observes each meeting platform's live UI.
 */

const AgenticRunner = require("../../agent/agentic-runner");
const logger = require("../../logging/logger");

class MeetingEngine {
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
  // CREATE GOOGLE MEET — via Google Calendar
  // ═══════════════════════════════════════════════════════════════

  /**
   * Creates a Google Meet meeting by creating a Google Calendar event.
   *
   * @param {Object} params
   * @param {string} params.title — Meeting title
   * @param {string} params.dateTime — Date and time (e.g., "2026-09-25 14:00")
   * @param {string[]} params.attendees — List of attendee emails
   * @param {string} [params.agenda] — Meeting description/agenda
   * @param {number} [params.durationMinutes=30] — Duration
   */
  async createGoogleMeet({ title, dateTime, attendees, agenda, durationMinutes = 30 }) {
    logger.info(`[MEETING ENGINE] Creating Google Meet: "${title}" at ${dateTime}`);

    const attendeeList = Array.isArray(attendees) ? attendees.join(", ") : attendees;

    const result = await this.runner.run({
      goal: `Open Google Calendar (calendar.google.com).
Create a new event:
1. Click the "+" or "Create" button or click on the time slot
2. Title: "${title}"
3. Date/Time: ${dateTime} (duration: ${durationMinutes} minutes)
4. Click "Add Google Meet video conferencing" or ensure Meet is attached
5. Add attendees: ${attendeeList}
   - Type each email in the "Add guests" field
6. ${agenda ? `Description/Agenda: "${agenda}"` : "Leave description empty"}
7. Click "Save" to create the event

After saving:
- Verify the event appears on the calendar
- Extract the Google Meet link (it should look like meet.google.com/xxx-xxxx-xxx)

Return DONE with the meeting details.
Output: { "meetLink": "https://meet.google.com/...", "eventCreated": true, "title": "", "dateTime": "" }`,
      context: {
        workflow: "CREATE_GMEET",
        targetId: `meeting:create:${title.slice(0, 20)}`
      },
      allowedOrigins: [
        "https://calendar.google.com",
        "https://meet.google.com",
        "https://accounts.google.com"
      ]
    });

    return {
      success: result.status === "DONE",
      meetLink: result.data?.meetLink || null,
      eventCreated: result.data?.eventCreated || false,
      title,
      dateTime,
      attendees,
      result
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // JOIN MEETING — join Google Meet, Teams, or Zoom
  // ═══════════════════════════════════════════════════════════════

  /**
   * Joins an existing meeting using its URL.
   * AI navigates to the meeting link and handles the join flow.
   *
   * @param {string} meetingUrl — Full meeting URL
   * @param {Object} [options={}] — { muteAudio, muteVideo }
   */
  async joinMeeting(meetingUrl, options = {}) {
    logger.info(`[MEETING ENGINE] Joining meeting: ${meetingUrl}`);

    let meetingType = "UNKNOWN";
    if (meetingUrl.includes("meet.google.com")) meetingType = "GOOGLE_MEET";
    else if (meetingUrl.includes("teams.microsoft.com") || meetingUrl.includes("teams.live.com")) meetingType = "MICROSOFT_TEAMS";
    else if (meetingUrl.includes("zoom.us") || meetingUrl.includes("zoom.com")) meetingType = "ZOOM";

    const muteInstructions = [];
    if (options.muteAudio !== false) muteInstructions.push("Mute the microphone if possible");
    if (options.muteVideo !== false) muteInstructions.push("Turn off the camera if possible");

    const result = await this.runner.run({
      goal: `Open the meeting URL: ${meetingUrl}

Meeting type: ${meetingType}

For Google Meet:
- Click "Join now" or "Ask to join"
- ${muteInstructions.join(". ")}

For Microsoft Teams:
- If prompted, select "Continue on this browser" or "Join on the web" (not the app)
- Enter display name if asked
- Click "Join now"
- ${muteInstructions.join(". ")}

For Zoom:
- If prompted, select "Join from your browser" or "Launch Meeting"
- Enter display name if asked
- Click "Join"

Verify you've successfully joined the meeting by looking for:
- Video/audio controls visible
- Meeting participants visible
- Chat or meeting interface active

Return DONE when successfully joined.
Output: { "joined": true, "meetingType": "${meetingType}", "participants": [] }`,
      context: {
        workflow: "JOIN_MEETING",
        meetingType,
        targetId: `meeting:join:${meetingType}`
      },
      allowedOrigins: [new URL(meetingUrl).origin]
    });

    return {
      success: result.status === "DONE",
      joined: result.data?.joined || false,
      meetingType,
      meetingUrl,
      result
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // RESPOND TO MEETING INVITE — accept/decline
  // ═══════════════════════════════════════════════════════════════

  /**
   * Responds to a meeting invitation (accept or decline).
   *
   * @param {Object} invitation — { organizer, subject, dateTime, meetingLink }
   * @param {string} [response="ACCEPT"] — "ACCEPT" or "DECLINE"
   * @param {string} [declineNote] — Note for decline
   */
  async respondToInvite(invitation, response = "ACCEPT", declineNote) {
    logger.info(`[MEETING ENGINE] ${response}ing meeting invite from ${invitation.organizer}: "${invitation.subject}"`);

    const result = await this.runner.run({
      goal: `In Google Calendar or Gmail, find the meeting invitation:
- From: ${invitation.organizer}
- Subject: "${invitation.subject}"
- Date/Time: ${invitation.dateTime || "see invitation"}

${response === "ACCEPT"
  ? `Accept the invitation by clicking "Yes" or "Accept" on the RSVP.
     Verify the event is added to the calendar.`
  : `Decline the invitation by clicking "No" or "Decline".
     ${declineNote ? `Add a note: "${declineNote}"` : ""}`}

Extract the meeting details (link, time, organizer).
Return DONE with meeting details.
Output: { "responded": true, "response": "${response}", "meetingLink": "${invitation.meetingLink || ""}", "dateTime": "" }`,
      context: {
        workflow: "MEETING_RESPONSE",
        response,
        targetId: `meeting:respond:${invitation.subject?.slice(0, 20) || "invite"}`
      },
      allowedOrigins: [
        "https://mail.google.com",
        "https://calendar.google.com",
        "https://meet.google.com"
      ]
    });

    return {
      success: result.status === "DONE",
      responded: result.data?.responded || false,
      response,
      meetingLink: result.data?.meetingLink || invitation.meetingLink,
      result
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // CHECK CALENDAR — view upcoming meetings
  // ═══════════════════════════════════════════════════════════════

  /**
   * Checks Google Calendar for upcoming meetings.
   *
   * @param {Object} [options={}] — { daysAhead }
   */
  async checkUpcomingMeetings(options = {}) {
    const daysAhead = options.daysAhead || 7;

    const result = await this.runner.run({
      goal: `Open Google Calendar (calendar.google.com).
Check for upcoming meetings/events in the next ${daysAhead} days.
For each meeting, extract:
- Title
- Date and time
- Duration
- Meeting link (Google Meet, Teams, Zoom, etc.)
- Attendees if visible
- Description/agenda if visible

Return DONE with the list of upcoming meetings.
Output: { "meetings": [{ "title": "", "dateTime": "", "meetingLink": "", "attendees": [], "description": "" }] }`,
      context: {
        workflow: "CHECK_CALENDAR",
        targetId: "meeting:check-upcoming"
      },
      allowedOrigins: ["https://calendar.google.com"]
    });

    return {
      success: result.status === "DONE",
      meetings: result.data?.meetings || [],
      result
    };
  }
}

module.exports = MeetingEngine;
