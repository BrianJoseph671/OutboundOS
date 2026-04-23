/**
 * Network Indexer — scans email history via Gmail API, identifies real contacts,
 * filters noise, computes warmth scores, and persists to the database.
 *
 * Supports two modes:
 *   - Full index: scans last 6 months of sent email (initial setup)
 *   - Incremental sync: scans last 7 days of inbound + outbound
 */
import { storage } from "../storage";
import { listGmailThreads, type GmailThreadSummary } from "./gmailClient";
import { computeWarmth } from "./warmthClassifier";
import type { Contact, WarmthTier } from "@shared/schema";
import { detectActions } from "../agent/services/actionDetector";
import { classifyEmailTypes, subjectSignatureHash, type EmailTypeCandidate } from "./emailTypeClassifier";

const PAGE_SIZE = 50;
const MAX_PAGES = 40; // safety cap: 40 * 50 = 2000 threads max
const MAX_REVIEW_ITEMS = 20;

// ─── Noise Filtering ─────────────────────────────────────────────────────────

const NOISE_EMAIL_PATTERNS = [
  /^noreply@/i,
  /^no-reply@/i,
  /^notifications?@/i,
  /^mailer-daemon@/i,
  /^.*@calendar\.google\.com$/i,
  /^.*@resource\.calendar\.google\.com$/i,
  /^mailer-daemon@googlemail\.com$/i,
  /^support@/i,
  /^info@/i,
  /^team@/i,
  /^hello@/i,
  /^billing@/i,
  /^feedback@/i,
  /^donotreply@/i,
];

function isNoiseEmail(email: string): boolean {
  const lower = email.toLowerCase().trim();
  return NOISE_EMAIL_PATTERNS.some((pattern) => pattern.test(lower));
}

function extractEmailAddress(raw: string): string {
  const match = raw.match(/<([^>]+)>/);
  return (match?.[1] || raw).trim().toLowerCase();
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface ScannedContact {
  email: string;
  name: string;
  threadCount: number;
  bidirectionalThreads: number;
  lastInbound: Date | null;
  lastOutbound: Date | null;
  lastInteraction: Date | null;
  company: string | null;
}

interface IndexProgress {
  jobId: string;
  threadsScanned: number;
  contactsFound: number;
  contactsUpdated: number;
  errors: string[];
}

// ─── Core Logic ───────────────────────────────────────────────────────────────

/**
 * Scan threads from email and build a map of unique contacts with interaction stats.
 */
async function scanThreads(
  userId: string,
  userEmail: string,
  query: { start_date: string; end_date: string; from?: string[]; to?: string[] },
  onProgress?: (threadsScanned: number) => void,
): Promise<{
  contactMap: Map<string, ScannedContact>;
  threadsScanned: number;
  emailTypeCandidates: EmailTypeCandidate[];
  signaturesByEmail: Map<string, Set<string>>;
}> {
  const contactMap = new Map<string, ScannedContact>();
  const signaturesByEmail = new Map<string, Set<string>>();
  const typeSignals = new Map<string, { signatureKey: string; count: number; examples: Set<string> }>();
  let threadsScanned = 0;
  let cursor: string | undefined;

  for (let page = 0; page < MAX_PAGES; page++) {
    let response;
    try {
      response = await listGmailThreads(userId, {
        ...query,
        limit: PAGE_SIZE,
        ...(cursor ? { cursor } : {}),
      });
    } catch (err) {
      console.error("[NetworkIndexer] Error fetching threads page", page, err);
      break;
    }

    const threads = response.threads || [];
    if (threads.length === 0) break;

    for (const thread of threads) {
      threadsScanned++;
      processThread(thread, userEmail, contactMap, typeSignals, signaturesByEmail);
    }

    onProgress?.(threadsScanned);

    cursor = response.next_cursor;
    if (!cursor) break;
  }

  const emailTypeCandidates: EmailTypeCandidate[] = Array.from(typeSignals.entries()).map(
    ([signatureHash, v]) => ({
      signatureHash,
      signatureKey: v.signatureKey,
      messageCount: v.count,
      exampleSubjects: Array.from(v.examples).slice(0, 5),
    }),
  );
  return { contactMap, threadsScanned, emailTypeCandidates, signaturesByEmail };
}

function processThread(
  thread: GmailThreadSummary,
  userEmail: string,
  contactMap: Map<string, ScannedContact>,
  typeSignals: Map<string, { signatureKey: string; count: number; examples: Set<string> }>,
  signaturesByEmail: Map<string, Set<string>>,
) {
  const userNorm = userEmail.toLowerCase().trim();
  const participants = (thread.participants || []).map(extractEmailAddress);

  // Determine direction from messages if available
  const messages = thread.messages || [];
  let hasUserSent = false;
  let hasUserReceived = false;
  let latestInbound: Date | null = null;
  let latestOutbound: Date | null = null;

  if (messages.length > 0) {
    for (const msg of messages) {
      const from = extractEmailAddress(msg.from || "");
      const msgDate = msg.sent_at ? new Date(msg.sent_at) : null;
      if (from === userNorm) {
        hasUserSent = true;
        if (msgDate && (!latestOutbound || msgDate > latestOutbound)) {
          latestOutbound = msgDate;
        }
      } else {
        hasUserReceived = true;
        if (msgDate && (!latestInbound || msgDate > latestInbound)) {
          latestInbound = msgDate;
        }
      }
    }
  } else {
    // No message detail — infer from thread metadata
    hasUserSent = true; // we searched from:me
    const threadDate = thread.last_message_at ? new Date(thread.last_message_at) : null;
    latestOutbound = threadDate;
  }

  const isBidirectional = hasUserSent && hasUserReceived;
  const subject = thread.subject || "";
  const signature = subjectSignatureHash(subject);
  const existingType = typeSignals.get(signature.signatureHash);
  if (existingType) {
    existingType.count++;
    if (subject) existingType.examples.add(subject);
  } else {
    typeSignals.set(signature.signatureHash, {
      signatureKey: signature.signatureKey,
      count: 1,
      examples: new Set(subject ? [subject] : []),
    });
  }

  // Extract counterparty emails (non-user participants)
  const counterparties = participants.filter((p) => p !== userNorm && !isNoiseEmail(p));

  for (const email of counterparties) {
    const setForEmail = signaturesByEmail.get(email) || new Set<string>();
    setForEmail.add(signature.signatureHash);
    signaturesByEmail.set(email, setForEmail);
    const existing = contactMap.get(email);
    if (existing) {
      existing.threadCount++;
      if (isBidirectional) existing.bidirectionalThreads++;
      if (latestInbound && (!existing.lastInbound || latestInbound > existing.lastInbound)) {
        existing.lastInbound = latestInbound;
      }
      if (latestOutbound && (!existing.lastOutbound || latestOutbound > existing.lastOutbound)) {
        existing.lastOutbound = latestOutbound;
      }
      const newest = [latestInbound, latestOutbound].filter(Boolean).sort((a, b) => b!.getTime() - a!.getTime())[0] || null;
      if (newest && (!existing.lastInteraction || newest > existing.lastInteraction)) {
        existing.lastInteraction = newest;
      }
    } else {
      const newest = [latestInbound, latestOutbound].filter(Boolean).sort((a, b) => b!.getTime() - a!.getTime())[0] || null;
      // Extract name from participant string or derive from email
      const nameFromParticipant = extractNameFromParticipants(thread.participants || [], email);
      contactMap.set(email, {
        email,
        name: nameFromParticipant || email.split("@")[0],
        threadCount: 1,
        bidirectionalThreads: isBidirectional ? 1 : 0,
        lastInbound: latestInbound,
        lastOutbound: latestOutbound,
        lastInteraction: newest,
        company: extractCompanyFromEmail(email),
      });
    }
  }
}

function extractNameFromParticipants(participants: string[], targetEmail: string): string | null {
  for (const p of participants) {
    const match = p.match(/^(.+?)\s*<([^>]+)>/);
    if (match && extractEmailAddress(p) === targetEmail) {
      return match[1].trim().replace(/^["']|["']$/g, "");
    }
  }
  return null;
}

function extractCompanyFromEmail(email: string): string | null {
  const domain = email.split("@")[1];
  if (!domain) return null;
  const genericDomains = new Set(["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com", "aol.com", "protonmail.com", "me.com", "live.com", "msn.com"]);
  if (genericDomains.has(domain.toLowerCase())) return null;
  // Convert domain to company name: "acme.com" -> "Acme"
  const parts = domain.split(".");
  return parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
}

// ─── Persistence ──────────────────────────────────────────────────────────────

async function persistContacts(
  userId: string,
  contactMap: Map<string, ScannedContact>,
  hasGranolaMap: Map<string, boolean>,
  hasCalendarMap: Map<string, boolean>,
): Promise<{ contactsFound: number; contactsUpdated: number }> {
  let contactsUpdated = 0;
  const contactsFound = contactMap.size;

  for (const [email, scanned] of Array.from(contactMap.entries())) {
    const { warmthScore, tier } = computeWarmth({
      bidirectionalThreads: scanned.bidirectionalThreads,
      totalThreads: scanned.threadCount,
      lastInteraction: scanned.lastInteraction,
      hasGranolaMeeting: hasGranolaMap.get(email) || false,
      hasCalendarEvent: hasCalendarMap.get(email) || false,
    });

    const lastInteractionAt = scanned.lastInteraction;

    const existing = await storage.getContactByEmail(email, userId);
    if (existing) {
      await storage.updateContact(existing.id, userId, {
        warmthScore,
        tier,
        bidirectionalThreads: scanned.bidirectionalThreads,
        totalThreads: scanned.threadCount,
        lastInboundAt: scanned.lastInbound,
        lastOutboundAt: scanned.lastOutbound,
        lastInteractionAt,
        indexedAt: new Date(),
        ...(scanned.company && !existing.company ? { company: scanned.company } : {}),
      });
      contactsUpdated++;
    } else {
      await storage.createContact({
        userId,
        name: scanned.name,
        email,
        company: scanned.company,
        source: "gmail",
        tier,
        warmthScore,
        bidirectionalThreads: scanned.bidirectionalThreads,
        totalThreads: scanned.threadCount,
        lastInboundAt: scanned.lastInbound,
        lastOutboundAt: scanned.lastOutbound,
        lastInteractionAt,
        indexedAt: new Date(),
      });
      contactsUpdated++;
    }
  }

  return { contactsFound, contactsUpdated };
}

// ─── Cross-Reference: Granola & Calendar ──────────────────────────────────────

async function buildCrossRefMaps(userId: string): Promise<{
  hasGranolaMap: Map<string, boolean>;
  hasCalendarMap: Map<string, boolean>;
}> {
  const hasGranolaMap = new Map<string, boolean>();
  const hasCalendarMap = new Map<string, boolean>();

  // Check meetings table for Granola and Calendar meetings
  try {
    const allMeetings = await storage.getMeetings(userId);
    for (const meeting of allMeetings) {
      const attendees = meeting.attendees || [];
      for (const attendee of attendees) {
        const email = (attendee.email || "").toLowerCase().trim();
        if (!email || attendee.self) continue;
        if (meeting.source === "granola") {
          hasGranolaMap.set(email, true);
        } else if (meeting.source === "google_calendar") {
          hasCalendarMap.set(email, true);
        }
      }
    }
  } catch (err) {
    console.warn("[NetworkIndexer] Failed to load meetings for cross-ref:", err);
  }

  return { hasGranolaMap, hasCalendarMap };
}

function filterContactsByRejectedSignatures(
  contactMap: Map<string, ScannedContact>,
  signaturesByEmail: Map<string, Set<string>>,
  rejected: Set<string>,
): Map<string, ScannedContact> {
  if (rejected.size === 0) return contactMap;
  const filtered = new Map<string, ScannedContact>();
  for (const [email, scanned] of Array.from(contactMap.entries())) {
    const signatures = signaturesByEmail.get(email);
    const shouldReject = signatures ? Array.from(signatures).some((sig) => rejected.has(sig)) : false;
    if (!shouldReject) filtered.set(email, scanned);
  }
  return filtered;
}

export async function prepareIndexReviewSession(
  userId: string,
  userEmail: string,
): Promise<{
  sessionId: string;
  jobId: string;
  typeCount: number;
  autoAcceptedCount: number;
  totalClassifiedCount: number;
  calendarPrioritizedCount: number;
}> {
  const job = await storage.createNetworkIndexJob({
    userId,
    status: "running",
    startedAt: new Date(),
  });

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const scan = await scanThreads(
    userId,
    userEmail,
    {
      start_date: sixMonthsAgo.toISOString(),
      end_date: new Date().toISOString(),
      from: [userEmail],
    },
    async (scanned) => {
      try {
        await storage.updateNetworkIndexJob(job.id, userId, { threadsScanned: scanned });
      } catch { /* non-critical */ }
    },
  );

  const { hasGranolaMap, hasCalendarMap } = await buildCrossRefMaps(userId);
  const meetingLinkedSignals = new Map<string, { meetingLinkedContactCount: number; hasAnyMeetingLinkedContacts: boolean }>();
  for (const candidate of scan.emailTypeCandidates) {
    const linkedEmails: string[] = [];
    for (const [email, signatureSet] of Array.from(scan.signaturesByEmail.entries())) {
      if (signatureSet.has(candidate.signatureHash)) linkedEmails.push(email);
    }
    let count = 0;
    for (const email of linkedEmails) {
      if (hasGranolaMap.get(email) || hasCalendarMap.get(email)) count++;
    }
    meetingLinkedSignals.set(candidate.signatureHash, {
      meetingLinkedContactCount: count,
      hasAnyMeetingLinkedContacts: count > 0,
    });
  }

  const enrichedCandidates = scan.emailTypeCandidates.map((c) => {
    const signal = meetingLinkedSignals.get(c.signatureHash);
    return {
      ...c,
      meetingLinkedContactCount: signal?.meetingLinkedContactCount || 0,
      hasAnyMeetingLinkedContacts: signal?.hasAnyMeetingLinkedContacts || false,
    };
  });

  const classified = await classifyEmailTypes(enrichedCandidates);
  const ranked = [...classified].sort((a, b) => {
    if (a.hasAnyMeetingLinkedContacts !== b.hasAnyMeetingLinkedContacts) {
      return a.hasAnyMeetingLinkedContacts ? -1 : 1;
    }
    if ((a.meetingLinkedContactCount || 0) !== (b.meetingLinkedContactCount || 0)) {
      return (b.meetingLinkedContactCount || 0) - (a.meetingLinkedContactCount || 0);
    }
    return b.messageCount - a.messageCount;
  });
  const reviewItems = ranked.slice(0, MAX_REVIEW_ITEMS);
  const autoAcceptedItems = ranked.slice(MAX_REVIEW_ITEMS);
  const calendarPrioritizedCount = reviewItems.filter((i) => i.hasAnyMeetingLinkedContacts).length;
  const session = await storage.createIndexReviewSession({
    userId,
    jobId: job.id,
    status: "pending_review",
    summary: {
      threadsScanned: scan.threadsScanned,
      contacts: Array.from(scan.contactMap.entries()).map(([email, c]) => ({
        ...c,
        lastInbound: c.lastInbound?.toISOString() || null,
        lastOutbound: c.lastOutbound?.toISOString() || null,
        lastInteraction: c.lastInteraction?.toISOString() || null,
      })),
      signaturesByEmail: Object.fromEntries(
        Array.from(scan.signaturesByEmail.entries()).map(([email, set]) => [email, Array.from(set)]),
      ),
      totalClassifiedCount: ranked.length,
      reviewVisibleCount: reviewItems.length,
      autoAcceptedCount: autoAcceptedItems.length,
      calendarPrioritizedCount,
      signatureMeetingSignals: Object.fromEntries(
        ranked.map((r) => [
          r.signatureHash,
          {
            hasAnyMeetingLinkedContacts: r.hasAnyMeetingLinkedContacts,
            meetingLinkedContactCount: r.meetingLinkedContactCount,
          },
        ]),
      ),
    },
  });

  for (const item of reviewItems) {
    await storage.createIndexReviewItem({
      sessionId: session.id,
      signatureHash: item.signatureHash,
      proposedLabel: item.proposedLabel,
      exampleSubjects: item.exampleSubjects,
      messageCount: item.messageCount,
      decision: null,
    });
  }
  for (const item of autoAcceptedItems) {
    await storage.upsertEmailTypeRule(userId, item.signatureHash, {
      label: item.proposedLabel,
      decision: "accept",
      examples: item.exampleSubjects || [],
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);
  }

  await storage.updateNetworkIndexJob(job.id, userId, {
    status: "pending_review",
    threadsScanned: scan.threadsScanned,
    contactsFound: scan.contactMap.size,
  } as any);

  return {
    sessionId: session.id,
    jobId: job.id,
    typeCount: reviewItems.length,
    autoAcceptedCount: autoAcceptedItems.length,
    totalClassifiedCount: ranked.length,
    calendarPrioritizedCount,
  };
}

export async function completeIndexReviewSession(
  userId: string,
  sessionId: string,
): Promise<IndexProgress> {
  const session = await storage.getIndexReviewSession(sessionId, userId);
  if (!session) throw new Error("Review session not found");
  if (session.status !== "pending_review") throw new Error("Review session is not pending");
  const items = await storage.getIndexReviewItems(session.id);

  for (const item of items) {
    const decision = item.decision || "accept";
    await storage.upsertEmailTypeRule(userId, item.signatureHash, {
      label: item.proposedLabel,
      decision,
      examples: item.exampleSubjects || [],
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);
  }

  const rejected = await storage.getRejectedEmailTypeSignatures(userId);
  const summary = (session.summary || {}) as Record<string, any>;
  const contactsRaw = Array.isArray(summary.contacts) ? summary.contacts : [];
  const signaturesByEmailRaw = (summary.signaturesByEmail || {}) as Record<string, string[]>;

  const contactMap = new Map<string, ScannedContact>();
  for (const c of contactsRaw) {
    contactMap.set(c.email, {
      email: c.email,
      name: c.name,
      threadCount: c.threadCount,
      bidirectionalThreads: c.bidirectionalThreads,
      lastInbound: c.lastInbound ? new Date(c.lastInbound) : null,
      lastOutbound: c.lastOutbound ? new Date(c.lastOutbound) : null,
      lastInteraction: c.lastInteraction ? new Date(c.lastInteraction) : null,
      company: c.company || null,
    });
  }
  const signaturesByEmail = new Map<string, Set<string>>();
  for (const [email, signatures] of Object.entries(signaturesByEmailRaw)) {
    signaturesByEmail.set(email, new Set(Array.isArray(signatures) ? signatures : []));
  }

  const filteredMap = filterContactsByRejectedSignatures(contactMap, signaturesByEmail, rejected);
  const { hasGranolaMap, hasCalendarMap } = await buildCrossRefMaps(userId);
  const { contactsFound, contactsUpdated } = await persistContacts(
    userId,
    filteredMap,
    hasGranolaMap,
    hasCalendarMap,
  );

  try {
    const recentInteractions = await storage.getInteractions(userId);
    const actionsToCreate = await detectActions(userId, recentInteractions);
    for (const action of actionsToCreate) {
      try { await storage.createAction(action); } catch { /* dedup */ }
    }
  } catch {
    // no-op
  }

  await storage.updateIndexReviewSession(session.id, userId, {
    status: "approved",
    resolvedAt: new Date(),
  } as any);

  if (session.jobId) {
    await storage.updateNetworkIndexJob(session.jobId, userId, {
      status: "completed",
      contactsFound,
      contactsUpdated,
      completedAt: new Date(),
    } as any);
  }

  return {
    jobId: session.jobId || "",
    threadsScanned: Number(summary.threadsScanned || 0),
    contactsFound,
    contactsUpdated,
    errors: [],
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Run a full 6-month email index for a user.
 * Creates a job record for progress tracking and updates it as work proceeds.
 */
export async function runFullIndex(
  userId: string,
  userEmail: string,
): Promise<IndexProgress> {
  const prep = await prepareIndexReviewSession(userId, userEmail);
  return {
    jobId: prep.jobId,
    threadsScanned: 0,
    contactsFound: 0,
    contactsUpdated: 0,
    errors: [],
  };
}

/**
 * Run an incremental 7-day sync — scans recent inbound and outbound threads.
 */
export async function runIncrementalSync(
  userId: string,
  userEmail: string,
): Promise<IndexProgress> {
  const job = await storage.createNetworkIndexJob({
    userId,
    status: "running",
    startedAt: new Date(),
  });

  const progress: IndexProgress = {
    jobId: job.id,
    threadsScanned: 0,
    contactsFound: 0,
    contactsUpdated: 0,
    errors: [],
  };

  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const now = new Date().toISOString();
    const start = sevenDaysAgo.toISOString();

    const rejected = await storage.getRejectedEmailTypeSignatures(userId);

    // Scan outbound threads
    const outbound = await scanThreads(userId, userEmail, {
      start_date: start,
      end_date: now,
      from: [userEmail],
    });

    // Scan inbound threads (to:me)
    const inbound = await scanThreads(userId, userEmail, {
      start_date: start,
      end_date: now,
      to: [userEmail],
    });

    // Merge contact maps + signature maps
    const mergedMap = new Map(Array.from(outbound.contactMap.entries()));
    const mergedSignatures = new Map(Array.from(outbound.signaturesByEmail.entries()));
    for (const [email, scanned] of Array.from(inbound.contactMap.entries())) {
      const existing = mergedMap.get(email);
      if (existing) {
        existing.threadCount += scanned.threadCount;
        existing.bidirectionalThreads += scanned.bidirectionalThreads;
        if (scanned.lastInbound && (!existing.lastInbound || scanned.lastInbound > existing.lastInbound)) {
          existing.lastInbound = scanned.lastInbound;
        }
        if (scanned.lastOutbound && (!existing.lastOutbound || scanned.lastOutbound > existing.lastOutbound)) {
          existing.lastOutbound = scanned.lastOutbound;
        }
        const newest = [existing.lastInbound, existing.lastOutbound, scanned.lastInbound, scanned.lastOutbound]
          .filter(Boolean)
          .sort((a, b) => b!.getTime() - a!.getTime())[0] || null;
        if (newest) existing.lastInteraction = newest;
      } else {
        mergedMap.set(email, scanned);
      }
      const existingSignatures = mergedSignatures.get(email) || new Set<string>();
      const inboundSignatures = inbound.signaturesByEmail.get(email) || new Set<string>();
      for (const sig of Array.from(inboundSignatures)) existingSignatures.add(sig);
      mergedSignatures.set(email, existingSignatures);
    }

    progress.threadsScanned = outbound.threadsScanned + inbound.threadsScanned;
    const filteredMap = filterContactsByRejectedSignatures(mergedMap, mergedSignatures, rejected);

    const { hasGranolaMap, hasCalendarMap } = await buildCrossRefMaps(userId);
    const { contactsFound, contactsUpdated } = await persistContacts(
      userId, filteredMap, hasGranolaMap, hasCalendarMap,
    );
    progress.contactsFound = contactsFound;
    progress.contactsUpdated = contactsUpdated;

    // Run action detection after sync
    try {
      const recentInteractions = await storage.getInteractions(userId);
      const actionsToCreate = await detectActions(userId, recentInteractions);
      for (const action of actionsToCreate) {
        try { await storage.createAction(action); } catch { /* dedup */ }
      }
    } catch (err) {
      console.warn("[NetworkIndexer] Action detection after sync failed:", err);
    }

    await storage.updateNetworkIndexJob(job.id, userId, {
      status: "completed",
      threadsScanned: progress.threadsScanned,
      contactsFound,
      contactsUpdated,
      completedAt: new Date(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    progress.errors.push(msg);
    console.error("[NetworkIndexer] Incremental sync failed:", msg);
    await storage.updateNetworkIndexJob(job.id, userId, {
      status: "failed",
      errors: [msg],
      completedAt: new Date(),
    });
  }

  return progress;
}
