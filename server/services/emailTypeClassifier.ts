import crypto from "crypto";
import Anthropic from "@anthropic-ai/sdk";

export type EmailTypeSource = "label" | "subject";

export interface EmailTypeCandidate {
  signatureHash: string;
  signatureKey: string;
  messageCount: number;
  exampleSubjects: string[];
  meetingLinkedContactCount?: number;
  hasAnyMeetingLinkedContacts?: boolean;
  source?: EmailTypeSource;
  labelName?: string;
}

export interface ClassifiedEmailType {
  signatureHash: string;
  proposedLabel: string;
  messageCount: number;
  exampleSubjects: string[];
  meetingLinkedContactCount: number;
  hasAnyMeetingLinkedContacts: boolean;
  source: EmailTypeSource;
  labelName?: string;
}

function normalizeSubject(subject: string): string {
  let s = (subject || "").trim().toLowerCase();
  s = s.replace(/^(re|fwd|fw)\s*:\s*/gi, "");
  s = s.replace(/\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/g, "{date}");
  s = s.replace(/\b\d+\b/g, "{num}");
  s = s.replace(/\s+/g, " ").trim();
  return s || "(empty-subject)";
}

export function subjectSignatureHash(subject: string): { signatureHash: string; signatureKey: string } {
  const signatureKey = normalizeSubject(subject);
  const signatureHash = crypto.createHash("sha256").update(signatureKey).digest("hex");
  return { signatureHash, signatureKey };
}

async function labelWithClaude(
  candidates: EmailTypeCandidate[],
): Promise<Map<string, string>> {
  if (!process.env.ANTHROPIC_API_KEY || candidates.length === 0) return new Map();
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const subjectCandidates = candidates.filter((c) => c.source !== "label");
  if (subjectCandidates.length === 0) return new Map();

  const prompt = [
    "You are classifying email subject patterns into concise type labels.",
    "Return JSON object mapping signatureHash -> label.",
    "Labels should be short (2-6 words) and indicate email intent.",
    "If clearly non-networking (marketing, notifications, admin), make that explicit.",
    "",
    JSON.stringify(subjectCandidates.map((c) => ({
      signatureHash: c.signatureHash,
      messageCount: c.messageCount,
      meetingLinkedContactCount: c.meetingLinkedContactCount || 0,
      examples: c.exampleSubjects.slice(0, 3),
    }))),
  ].join("\n");

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1200,
      messages: [{ role: "user", content: prompt }],
    });
    const textBlock = response.content.find((b) => b.type === "text");
    const raw = (textBlock?.text || "").replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(raw) as Record<string, string>;
    const map = new Map<string, string>();
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "string" && v.trim()) map.set(k, v.trim());
    }
    return map;
  } catch {
    return new Map();
  }
}

function fallbackLabel(c: EmailTypeCandidate): string {
  const sample = (c.exampleSubjects[0] || "").toLowerCase();
  if (sample.includes("invoice") || sample.includes("receipt") || sample.includes("payment")) return "Billing / Finance";
  if (sample.includes("newsletter") || sample.includes("unsubscribe")) return "Marketing Newsletter";
  if (sample.includes("calendar") || sample.includes("invite")) return "Calendar Invite";
  if (sample.includes("opportunity")) return "Opportunity Outreach";
  if (sample.includes("introduction") || sample.includes("intro")) return "Introduction Thread";
  return "General Outreach";
}

export async function classifyEmailTypes(
  candidates: EmailTypeCandidate[],
): Promise<ClassifiedEmailType[]> {
  const aiLabels = await labelWithClaude(candidates);
  return candidates
    .sort((a, b) => b.messageCount - a.messageCount)
    .map((c) => {
      const source: EmailTypeSource = c.source === "label" ? "label" : "subject";
      const proposedLabel =
        source === "label" && c.labelName
          ? c.labelName
          : aiLabels.get(c.signatureHash) || fallbackLabel(c);
      return {
        signatureHash: c.signatureHash,
        proposedLabel,
        messageCount: c.messageCount,
        exampleSubjects: c.exampleSubjects,
        meetingLinkedContactCount: c.meetingLinkedContactCount || 0,
        hasAnyMeetingLinkedContacts: Boolean(c.hasAnyMeetingLinkedContacts),
        source,
        labelName: c.labelName,
      };
    });
}
