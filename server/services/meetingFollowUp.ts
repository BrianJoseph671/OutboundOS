import { storage } from "../storage";
import { openai } from "../openai";

interface FollowUpResult {
  message: string;
  subject?: string;
  meetingContext: {
    title: string | null;
    date: string | null;
    notes: string | null;
    actionItems: string[];
  };
}

export async function generateMeetingFollowUp(
  meetingId: string,
  contactId: string,
  tone: string = "professional"
): Promise<FollowUpResult> {
  if (!openai) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  const meeting = await storage.getMeeting(meetingId);
  if (!meeting) {
    throw new Error("Meeting not found");
  }

  const contact = await storage.getContact(contactId);
  if (!contact) {
    throw new Error("Contact not found");
  }

  // Gather all meetings with this contact for relationship context
  const contactMeetings = await storage.getContactMeetings(contactId);
  const meetingHistory = contactMeetings
    .filter((cm) => cm.meeting.id !== meetingId)
    .slice(0, 5)
    .map((cm) => ({
      title: cm.meeting.title,
      date: cm.meeting.startTime ? new Date(cm.meeting.startTime).toLocaleDateString() : "unknown date",
    }));

  // Get outreach history
  const outreachAttempts = await storage.getOutreachAttemptsByContact(contactId);
  const recentOutreach = outreachAttempts.slice(0, 3);

  // Build context
  const meetingDate = meeting.startTime
    ? new Date(meeting.startTime).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
    : "recently";

  const actionItems = Array.isArray(meeting.actionItems) ? meeting.actionItems as string[] : [];

  let contextBlock = `Meeting: "${meeting.title || "Untitled"}" on ${meetingDate}\n`;
  if (meeting.notes) contextBlock += `Notes: ${meeting.notes.slice(0, 1500)}\n`;
  if (meeting.summary) contextBlock += `Summary: ${meeting.summary.slice(0, 800)}\n`;
  if (actionItems.length > 0) contextBlock += `Action Items:\n${actionItems.map((ai) => `- ${ai}`).join("\n")}\n`;
  if (meeting.transcript) contextBlock += `Key discussion points (from transcript): ${meeting.transcript.slice(0, 1000)}\n`;

  if (meetingHistory.length > 0) {
    contextBlock += `\nPrevious meetings with this person:\n`;
    meetingHistory.forEach((m) => {
      contextBlock += `- "${m.title}" on ${m.date}\n`;
    });
  }

  if (recentOutreach.length > 0) {
    contextBlock += `\nRecent outreach history:\n`;
    recentOutreach.forEach((o) => {
      contextBlock += `- ${o.outreachType} on ${o.dateSent ? new Date(o.dateSent).toLocaleDateString() : "unknown"}: ${o.responded ? "responded" : "no response"}\n`;
    });
  }

  const prompt = `You are writing a follow-up message after a meeting. The tone should be ${tone}.

Contact: ${contact.name}${contact.company ? ` at ${contact.company}` : ""}${contact.role ? ` (${contact.role})` : ""}

${contextBlock}

Write a personalized follow-up message that:
1. References specific topics or decisions from the meeting
2. Mentions any action items or next steps discussed
3. Feels natural and relationship-building, not generic
4. Is concise (2-4 paragraphs max)
5. Includes a clear next step or CTA

Also generate a short email subject line.

Return JSON: { "message": "...", "subject": "..." }`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 600,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: "You write personalized follow-up messages after meetings. Always respond with valid JSON." },
      { role: "user", content: prompt },
    ],
  });

  const responseText = completion.choices[0]?.message?.content || "";
  let parsed: { message: string; subject?: string };

  try {
    parsed = JSON.parse(responseText);
  } catch {
    parsed = { message: responseText, subject: `Following up on our meeting` };
  }

  return {
    message: parsed.message,
    subject: parsed.subject,
    meetingContext: {
      title: meeting.title,
      date: meetingDate,
      notes: meeting.notes ? meeting.notes.slice(0, 200) : null,
      actionItems,
    },
  };
}

export async function generateBulkFollowUps(
  contactIds: string[],
  tone: string = "professional"
): Promise<Array<{ contactId: string; result?: FollowUpResult; error?: string }>> {
  const results = [];

  for (const contactId of contactIds) {
    try {
      const contactMeetings = await storage.getContactMeetings(contactId);
      if (contactMeetings.length === 0) {
        results.push({ contactId, error: "No meetings found for contact" });
        continue;
      }

      // Use the most recent meeting
      const sorted = [...contactMeetings].sort((a, b) => {
        const aTime = a.meeting.startTime ? new Date(a.meeting.startTime).getTime() : 0;
        const bTime = b.meeting.startTime ? new Date(b.meeting.startTime).getTime() : 0;
        return bTime - aTime;
      });

      const result = await generateMeetingFollowUp(sorted[0].meetingId, contactId, tone);
      results.push({ contactId, result });
    } catch (err: any) {
      results.push({ contactId, error: err.message });
    }
  }

  return results;
}
