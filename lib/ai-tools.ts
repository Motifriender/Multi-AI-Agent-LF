// lib/ai-tools.ts
import {
  tool,
  type UIDataTypes,
  type UIMessage,
  type InferUITools,
} from "ai";
import { z } from "zod";
import RetellAI from "retell-ai-sdk";

const chatAIClient = new RetellAI.Client({
  // Make sure RETELL_AI_API_KEY is set in .env.local or your hosting env
  apiKey: process.env.RETELL_AI_API_KEY!,
});

/**
 * Chat AI Agent – uses Retell AI for general conversational support.
 */
const chatAIAgentTool = tool({
  description: "Handle general inquiries and provide conversational support using Retell AI.",
  inputSchema: z.object({
    clientName: z.string().describe("The client's name for personalization"),
    query: z.string().describe("The client's question or request"),
  }),
  async *execute({ clientName, query }) {
    yield { state: "processing" as const };

    // Interacting with Retell AI (pseudo – adjust to real SDK)
    const response = await chatAIClient.getResponse(query);

    yield {
      state: "complete" as const,
      result: `Response for ${clientName}: ${response}`,
    };
  },
});

/**
 * Intake Agent – creates or updates a client intake record.
 * In MVP form this just logs or stores to a simple in-memory store / DB.
 */
const intakeAgentTool = tool({
  description: `Create or update a client intake record, including contact details, matter description, and basic tags (matter type, urgency).`,
  inputSchema: z.object({
    clientName: z.string().describe("Client full name"),
    email: z.string().describe("Client email address"),
    phone: z.string().optional().describe("Client phone number"),
    matterDescription: z.string().describe("Free-text description of the legal issue"),
    matterType: z
      .string()
      .optional()
      .describe("Short label for matter type, e.g. 'family', 'immigration', 'business contracts'"),
    urgency: z
      .enum(["low", "medium", "high"])
      .optional()
      .describe("Rough urgency level based on deadlines or language used"),
  }),
  async *execute(input) {
    yield { state: "processing" as const };

    // TODO: replace this with a real DB (e.g. Prisma + Postgres, Supabase, etc.)
    const intakeId = crypto.randomUUID?.() ?? `intake_${Date.now()}`;

    console.log("[IntakeAgent] Created intake record", {
      intakeId,
      ...input,
    });

    yield {
      state: "complete" as const,
      result: `Intake record created with id ${intakeId} for ${
        input.clientName
      }. Matter type: ${input.matterType || "unspecified"}, urgency: ${
        input.urgency || "unspecified"
      }.`,
    };
  },
});

/**
 * Document Agent – drafts summaries and basic communications for lawyers and clients.
 * It does NOT send anything itself: it just returns text to be used by the email agent or UI.
 */
const documentAgentTool = tool({
  description: `Draft structured documents based on existing client and matter information: intake summaries for lawyers, follow-up emails, and simple engagement templates.`,
  inputSchema: z.object({
    mode: z
      .enum(["intakeSummary", "consultFollowupEmail", "engagementLetter"])
      .describe("Type of document to draft"),
    clientName: z.string().describe("Client name to personalize the document"),
    matterDescription: z
      .string()
      .describe("Key facts and context about the client's matter to include in the draft"),
    appointmentDateTime: z
      .string()
      .optional()
      .describe("ISO date/time string for the consultation, if relevant"),
    extraInstructions: z
      .string()
      .optional()
      .describe("Any extra instructions from the lawyer or firm regarding tone or content"),
  }),
  async *execute({ mode, clientName, matterDescription, appointmentDateTime, extraInstructions }) {
    yield { state: "processing" as const };

    let result = "";

    if (mode === "intakeSummary") {
      result = `Intake Summary for ${clientName}

Key Facts:
${matterDescription}

Consultation:
${appointmentDateTime || "Not yet scheduled."}

Lawyer Prep Checklist:
- Review any prior related matters for this client (if any).
- Identify key documents to request.
- Prepare 3–5 targeted questions to clarify the goals and constraints.

${extraInstructions || ""}`;
    } else if (mode === "consultFollowupEmail") {
      result = `Subject: Thank you for meeting with us, ${clientName}

Dear ${clientName},

Thank you for taking the time to speak with us${
        appointmentDateTime ? ` on ${appointmentDateTime}` : ""
      }.

Based on our discussion, here is a brief summary of your matter:
${matterDescription}

Next Steps:
- We will review the information and documents you’ve provided.
- We will follow up with any additional questions or documents needed.
- If you decide to move forward, we will send you our engagement letter for review.

${extraInstructions || "Best regards,\n[Your Law Firm Name]"}`;
    } else if (mode === "engagementLetter") {
      result = `Subject: Engagement Letter for ${clientName}

Dear ${clientName},

Thank you for considering our firm to assist you with the following matter:
${matterDescription}

This letter outlines the scope of our representation, our fees, and other important terms.
[INSERT FIRM-SPECIFIC TERMS HERE]

If these terms are acceptable, please sign and return this letter so we may begin work on your matter.

${extraInstructions || "Sincerely,\n[Your Law Firm Name]"}`;
    }

    yield {
      state: "complete" as const,
      result,
    };
  },
});

/**
 * Call Agent – represents "phone actions" handled by Retell.
 * This agent does not speak directly; instead, it triggers or logs outbound phone workflows.
 */
const callAgentTool = tool({
  description: `Initiate or describe phone call workflows (handled by Retell AI) for after-hours answering or follow-up calls. Use this when escalation to phone is needed or when the firm prefers phone confirmation.`,
  inputSchema: z.object({
    clientName: z.string().describe("Client name"),
    phoneNumber: z
      .string()
      .describe("Client phone number, ideally in E.164 format, e.g. +1XXXXXXXXXX"),
    reason: z
      .enum(["scheduleConsultation", "confirmAppointment", "generalCallback"])
      .describe("Reason for the call"),
    notesForAgent: z
      .string()
      .optional()
      .describe("Short context for the Retell agent, e.g. intake ID, matter type, or priority."),
  }),
  async *execute({ clientName, phoneNumber, reason, notesForAgent }) {
    yield { state: "processing" as const };

    // PSEUDO-CODE: here you would call your Retell outbound call API or log for staff follow-up.
    console.log("[CallAgent] Outbound call requested", {
      clientName,
      phoneNumber,
      reason,
      notesForAgent,
    });

    const reasonText =
      reason === "scheduleConsultation"
        ? "to schedule a consultation"
        : reason === "confirmAppointment"
        ? "to confirm an upcoming appointment"
        : "for a general callback";

    const result = `Outbound call workflow started for ${clientName} at ${phoneNumber} ${reasonText}. ${
      notesForAgent ? `Notes for the phone agent: ${notesForAgent}` : ""
    }`;

    yield {
      state: "complete" as const,
      result,
    };
  },
});

// Receptionist Agent - Central coordinator
const receptionistTool = tool({
  description: `Handle initial client interactions and coordinate with other agents. 
Route inquiries about client records to Portfolio Manager, 
scheduling questions to Calendar Agent, 
and communication needs to Email Agent.`,
  inputSchema: z.object({
    clientName: z.string().describe("The client name"),
    inquiry: z.string().describe("The nature of the inquiry"),
    action: z.enum(["greet", "route", "summarize"]).describe("Action to take"),
  }),
  async *execute({ clientName, inquiry, action }) {
    yield { state: "processing" as const };

    await new Promise((resolve) => setTimeout(resolve, 1000));

    let result = "";
    if (action === "greet") {
      result = `Welcome ${clientName}! I'm the receptionist agent. I understand you're inquiring about: ${inquiry}. Let me coordinate with the appropriate specialists to assist you.`;
    } else if (action === "route") {
      result = `Routing ${clientName}'s inquiry regarding "${inquiry}" to the appropriate specialized agents...`;
    } else {
      result = `Summary prepared for ${clientName}: All relevant agents have been consulted and your matter has been handled comprehensively.`;
    }

    yield {
      state: "complete" as const,
      result,
    };
  },
});

// Portfolio Manager Agent - Client records management
const portfolioManagerTool = tool({
  description: `Retrieve and update client records, case histories, and documents. 
Manages client portfolios and provides access to relevant information.`,
  inputSchema: z.object({
    clientId: z.string().describe("Client identifier"),
    action: z.enum(["retrieve", "update", "search"]).describe("Action to perform"),
    details: z.string().optional().describe("Additional details or updates"),
  }),
  async *execute({ clientId, action, details }) {
    yield { state: "processing" as const };

    await new Promise((resolve) => setTimeout(resolve, 1500));

    let result = "";
    if (action === "retrieve") {
      result = `Retrieved portfolio for client ${clientId}: Active since 2022, 3 ongoing matters, last consultation 2 weeks ago. Case files include contract review, property transaction, and estate planning.`;
    } else if (action === "update") {
      result = `Portfolio updated for client ${clientId}: ${
        details || "New information added to record."
      } All changes synchronized with secure database.`;
    } else {
      result = `Search completed for client ${clientId}: Found relevant documents and case history matching "${details}". Records are ready for review.`;
    }

    yield {
      state: "complete" as const,
      result,
    };
  },
});

// Calendar Agent - Scheduling management
const calendarAgentTool = tool({
  description: `Manage scheduling for consultations using Google Calendar.
Use this to check availability, book new client consultations, and reschedule existing ones.`,
  inputSchema: z.object({
    scenario: z
      .enum(["newIntakeConsult", "rescheduleConsult", "checkAvailability"])
      .describe("Scheduling scenario to handle"),
    clientName: z.string().describe("Client full name"),
    clientEmail: z.string().describe("Client email address"),
    clientPhone: z
      .string()
      .optional()
      .describe("Client phone number, used in event description when available"),
    preferredDateTime: z
      .string()
      .optional()
      .describe(
        "Client's preferred date/time in ISO-8601 format if given (e.g., '2025-12-20T10:00:00-08:00').",
      ),
    durationMinutes: z
      .number()
      .optional()
      .describe("Consultation duration in minutes, default is 60."),
    lawyerCalendarId: z
      .string()
      .optional()
      .describe(
        "Google Calendar ID for the lawyer or firm resource (e.g., 'lawyer@example.com'). If omitted, use primary calendar.",
      ),
    timezone: z
      .string()
      .optional()
      .describe("IANA timezone string for the client, e.g. 'America/Los_Angeles'."),
    existingEventId: z
      .string()
      .optional()
      .describe("If rescheduling, the Google Calendar event ID of the existing appointment."),
  }),
  async *execute({
    scenario,
    clientName,
    clientEmail,
    clientPhone,
    preferredDateTime,
    durationMinutes = 60,
    lawyerCalendarId,
    timezone,
    existingEventId,
  }) {
    yield { state: "processing" as const };

    // TODO: Replace this placeholder logic with real Google Calendar API calls.
    const calendarLabel = lawyerCalendarId || "primary calendar";
    let result = "";

    if (scenario === "checkAvailability") {
      result = `Checked availability for ${clientName} on ${calendarLabel}.\n\nExample available slots (client timezone: ${
        timezone || "firm default"
      }):\n- Tomorrow at 10:00\n- Tomorrow at 14:00\n- The following day at 09:30\n\nAll slots are ${durationMinutes}-minute consultations.`;
    } else if (scenario === "newIntakeConsult") {
      const whenText =
        preferredDateTime ||
        "the next available slot within normal business hours (e.g., Mon–Fri, 9 AM–5 PM).";

      result = `New consultation booked for ${clientName} on ${calendarLabel} at ${whenText} for ${durationMinutes} minutes.\n\nEvent details:\n- Title: Initial Consultation – ${clientName}\n- Attendee: ${clientEmail}${
        clientPhone ? `\n- Phone: ${clientPhone}` : ""
      }\n- Timezone: ${timezone || "firm default"}\n\nA Google Calendar event was (or will be) created and an invite sent to the client.`;
    } else if (scenario === "rescheduleConsult") {
      const whenText =
        preferredDateTime ||
        "a new available slot similar to the original appointment time during business hours.";

      result = `Consultation for ${clientName} has been rescheduled on ${calendarLabel}.\n\n${
        existingEventId
          ? `Existing event ${existingEventId} was updated`
          : "Existing event was found and updated"
      } to ${whenText} for ${durationMinutes} minutes.\n\nThe client at ${clientEmail} has been notified and sent an updated calendar invite.`;
    }

    yield {
      state: "complete" as const,
      result,
    };
  },
});

// Email Agent - Communication automation
const emailAgentTool = tool({
  description: `Handle outgoing client emails for confirmations, reminders, after-hours acknowledgements, and general updates.
This agent drafts and "sends" emails via the firm's email provider (TODO: integrate with a real service).`,
  inputSchema: z.object({
    scenario: z
      .enum(["intakeConfirmation", "consultReminder", "afterHoursReceipt", "genericUpdate"])
      .describe("Email scenario to handle"),
    recipientEmail: z.string().describe("Client email address"),
    clientName: z.string().describe("Client name for personalization"),
    appointmentDateTime: z
      .string()
      .optional()
      .describe("ISO date/time string of the consultation when relevant."),
    officeLocationOrLink: z
      .string()
      .optional()
      .describe("Office address or video link to include in confirmation/reminder emails."),
    customSubject: z
      .string()
      .optional()
      .describe("Optional custom subject for generic updates."),
    customBody: z
      .string()
      .optional()
      .describe(
        "Optional custom body text for generic updates. If omitted, a neutral template will be used.",
      ),
  }),
  async *execute({
    scenario,
    recipientEmail,
    clientName,
    appointmentDateTime,
    officeLocationOrLink,
    customSubject,
    customBody,
  }) {
    yield { state: "processing" as const };

    // TODO: plug into a real provider (SendGrid, SES, Resend, etc.).
    await new Promise((resolve) => setTimeout(resolve, 500));

    let subject = "";
    let body = "";

    if (scenario === "intakeConfirmation") {
      subject = `Consultation confirmed – ${clientName}`;
      body = `Dear ${clientName},

Thank you for contacting our firm. Your consultation has been scheduled${
        appointmentDateTime ? ` for ${appointmentDateTime}` : ""
      }.

Location / Meeting Link:
${officeLocationOrLink || "[Office address or video link will be provided separately]"}

If you need to reschedule, please reply to this email or call our office.

Best regards,
[Your Law Firm Name]`;
    } else if (scenario === "consultReminder") {
      subject = `Upcoming consultation reminder – ${clientName}`;
      body = `Dear ${clientName},

This is a friendly reminder of your upcoming consultation${
        appointmentDateTime ? ` on ${appointmentDateTime}` : ""
      }.

Location / Meeting Link:
${officeLocationOrLink || "[Office address or video link will be provided separately]"}

Please have any relevant documents ready, and plan to join a few minutes early.

Best regards,
[Your Law Firm Name]`;
    } else if (scenario === "afterHoursReceipt") {
      subject = `We received your message – ${clientName}`;
      body = `Dear ${clientName},

Thank you for reaching out. Our office is currently closed, but we have received your message${
        appointmentDateTime
          ? ` and noted your requested consultation time of ${appointmentDateTime}`
          : ""
      }.

A member of our team will review your information and follow up during regular business hours.

If this is an emergency or a time-sensitive legal deadline, please indicate that clearly in your reply.

Best regards,
[Your Law Firm Name]`;
    } else if (scenario === "genericUpdate") {
      subject = customSubject || `Update regarding your matter`;
      body =
        customBody ||
        `Dear ${clientName},

We wanted to share a brief update regarding your matter.

[Insert update details here.]

Best regards,
[Your Law Firm Name]`;
    }

    console.log("[EmailAgent] Email 'sent':", {
      scenario,
      to: recipientEmail,
      subject,
    });

    const result = `Email prepared and sent to ${recipientEmail}.\nSubject: ${subject}\n\n${body}`;

    yield {
      state: "complete" as const,
      result,
    };
  },
});

export const tools = {
  receptionist: receptionistTool,
  portfolioManager: portfolioManagerTool,
  calendarAgent: calendarAgentTool,
  emailAgent: emailAgentTool,
  chatAIAgent: chatAIAgentTool,
  intakeAgent: intakeAgentTool,
  documentAgent: documentAgentTool,
  callAgent: callAgentTool,
} as const;

export type AssistantToolsMessage = UIMessage<
  never,
  UIDataTypes,
  InferUITools<typeof tools>
>;
