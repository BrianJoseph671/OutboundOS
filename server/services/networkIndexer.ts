/**
 * Network Indexer — scans email history via Superhuman MCP, identifies real contacts,
 * filters noise, computes warmth scores, and persists to the database.
 *
 * Supports two modes:
 *   - Full index: scans last 6 months of sent email (initial setup)
 *   - Incremental sync: scans last 7 days of inbound + outbound
 */
import { storage } from "../storage";
import { listThreads, type SuperhumanThreadSummary } from "./mcpClient";
import { computeWarmth } from "./warmthClassifier";
import type { Contact, WarmthTier } from "@shared/schema";
import { detectActions } from "../agent/services/actionDetector";

const PAGE_SIZE = 50;
const MAX_PAGES = 40; // safety cap: 40 * 50 = 2000 threads max

// ─── Noise Filtering ─────────────────────────────────────────────────────────

const NOISE_EMAIL_PATTERNS = [
  /^noreply@/i,
  /^no-reply@/i,
  /^notifications?@/i,
  /^mailer-daemon@/i,
  /^reminder@superhuman\.com$/i,
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
): Promise<{ contactMap: Map<string, ScannedContact>; threadsScanned: number }> {
  const contactMap = new Map<string, ScannedContact>();
  let threadsScanned = 0;
  let cursor: string | undefined;

  for (let page = 0; page < MAX_PAGES; page++) {
    let response;
    try {
      response = await listThreads(userId, {
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
      processThread(thread, userEmail, contactMap);
    }

    onProgress?.(threadsScanned);

    cursor = response.next_cursor;
    if (!cursor) break;
  }

  return { contactMap, threadsScanned };
}

function processThread(
  thread: SuperhumanThreadSummary,
  userEmail: string,
  contactMap: Map<string, ScannedContact>,
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

  // Extract counterparty emails (non-user participants)
  const counterparties = participants.filter((p) => p !== userNorm && !isNoiseEmail(p));

  for (const email of counterparties) {
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

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Run a full 6-month email index for a user.
 * Creates a job record for progress tracking and updates it as work proceeds.
 */
export async function runFullIndex(
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
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const { contactMap, threadsScanned } = await scanThreads(
      userId,
      userEmail,
      {
        start_date: sixMonthsAgo.toISOString(),
        end_date: new Date().toISOString(),
        from: [userEmail],
      },
      async (scanned) => {
        // Periodic progress update
        try {
          await storage.updateNetworkIndexJob(job.id, userId, {
            threadsScanned: scanned,
          });
        } catch { /* non-critical */ }
      },
    );

    progress.threadsScanned = threadsScanned;

    // Build cross-reference maps from existing meetings
    const { hasGranolaMap, hasCalendarMap } = await buildCrossRefMaps(userId);

    // Persist contacts with warmth scoring
    const { contactsFound, contactsUpdated } = await persistContacts(
      userId, contactMap, hasGranolaMap, hasCalendarMap,
    );
    progress.contactsFound = contactsFound;
    progress.contactsUpdated = contactsUpdated;

    // Run action detection after indexing
    try {
      const recentInteractions = await storage.getInteractions(userId);
      const actionsToCreate = await detectActions(userId, recentInteractions);
      for (const action of actionsToCreate) {
        try { await storage.createAction(action); } catch { /* dedup */ }
      }
    } catch (err) {
      console.warn("[NetworkIndexer] Action detection after full index failed:", err);
    }

    await storage.updateNetworkIndexJob(job.id, userId, {
      status: "completed",
      threadsScanned,
      contactsFound,
      contactsUpdated,
      completedAt: new Date(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    progress.errors.push(msg);
    console.error("[NetworkIndexer] Full index failed:", msg);
    await storage.updateNetworkIndexJob(job.id, userId, {
      status: "failed",
      errors: [msg],
      completedAt: new Date(),
    });
  }

  return progress;
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

    // Merge contact maps
    const mergedMap = new Map(Array.from(outbound.contactMap.entries()));
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
    }

    progress.threadsScanned = outbound.threadsScanned + inbound.threadsScanned;

    const { hasGranolaMap, hasCalendarMap } = await buildCrossRefMaps(userId);
    const { contactsFound, contactsUpdated } = await persistContacts(
      userId, mergedMap, hasGranolaMap, hasCalendarMap,
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
