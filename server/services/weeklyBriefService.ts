import { db } from "../db";
import { contacts, interactions, actions } from "@shared/schema";
import { eq, and, gte, desc, sql as drizzleSql, inArray } from "drizzle-orm";
import type {
  WeeklyBriefResponse,
  WeeklyBriefCategory,
  WeeklyBriefContact,
} from "@shared/types/phase4";

const MAX_PER_CATEGORY = 10;

function getWeekBounds(): { weekStart: Date; weekEnd: Date } {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { weekStart: monday, weekEnd: sunday };
}

function toContact(
  row: { id: string; name: string; company: string | null; tier: string; lastInteractionAt: Date | null; lastInteractionChannel: string | null },
  pendingActions: number,
  snippet: string
): WeeklyBriefContact {
  return {
    contactId: row.id,
    contactName: row.name,
    company: row.company,
    tier: row.tier,
    lastInteractionAt: row.lastInteractionAt?.toISOString() ?? null,
    lastInteractionChannel: row.lastInteractionChannel,
    pendingActions,
    snippet,
  };
}

async function needsFollowUp(userId: string): Promise<WeeklyBriefContact[]> {
  const rows = await db
    .select({
      contactId: contacts.id,
      contactName: contacts.name,
      company: contacts.company,
      tier: contacts.tier,
      lastInteractionAt: contacts.lastInteractionAt,
      lastInteractionChannel: contacts.lastInteractionChannel,
      pendingCount: drizzleSql<number>`count(${actions.id})::int`,
    })
    .from(actions)
    .innerJoin(contacts, eq(actions.contactId, contacts.id))
    .where(
      and(
        eq(actions.userId, userId),
        eq(actions.status, "pending"),
        drizzleSql`${actions.actionType} IN ('follow_up', 'open_thread')`
      )
    )
    .groupBy(contacts.id, contacts.name, contacts.company, contacts.tier, contacts.lastInteractionAt, contacts.lastInteractionChannel)
    .orderBy(desc(contacts.lastInteractionAt))
    .limit(MAX_PER_CATEGORY);

  return rows.map((r) =>
    toContact(
      { id: r.contactId, name: r.contactName, company: r.company, tier: r.tier, lastInteractionAt: r.lastInteractionAt, lastInteractionChannel: r.lastInteractionChannel },
      r.pendingCount,
      r.pendingCount > 1 ? `${r.pendingCount} pending actions need attention.` : "Has a pending follow-up or open thread."
    )
  );
}

async function goingCold(userId: string, excludeIds: Set<string>): Promise<WeeklyBriefContact[]> {
  const cutoff = new Date(Date.now() - 14 * 86400000);
  const allRows = await db
    .select()
    .from(contacts)
    .where(
      and(
        eq(contacts.userId, userId),
        drizzleSql`${contacts.tier} IN ('warm', 'hot')`,
        drizzleSql`(${contacts.lastInteractionAt} IS NOT NULL AND ${contacts.lastInteractionAt} < ${cutoff})`
      )
    )
    .orderBy(contacts.lastInteractionAt)
    .limit(MAX_PER_CATEGORY + excludeIds.size);

  const filtered = allRows.filter((r) => !excludeIds.has(r.id)).slice(0, MAX_PER_CATEGORY);

  return filtered.map((r) => {
    const days = r.lastInteractionAt
      ? Math.round((Date.now() - new Date(r.lastInteractionAt).getTime()) / 86400000)
      : 0;
    return toContact(r, 0, `Last interaction ${days} days ago — risk of going cold.`);
  });
}

async function newThisWeek(userId: string, excludeIds: Set<string>): Promise<WeeklyBriefContact[]> {
  const { weekStart } = getWeekBounds();
  const allRows = await db
    .select()
    .from(contacts)
    .where(
      and(
        eq(contacts.userId, userId),
        gte(contacts.createdAt, weekStart)
      )
    )
    .orderBy(desc(contacts.createdAt))
    .limit(MAX_PER_CATEGORY + excludeIds.size);

  const filtered = allRows.filter((r) => !excludeIds.has(r.id)).slice(0, MAX_PER_CATEGORY);

  return filtered.map((r) =>
    toContact(r, 0, `Added ${new Date(r.createdAt).toLocaleDateString()}.`)
  );
}

async function recentlyActive(userId: string, excludeIds: Set<string>): Promise<WeeklyBriefContact[]> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000);

  const rows = await db
    .selectDistinctOn([interactions.contactId], {
      contactId: interactions.contactId,
      summary: interactions.summary,
      channel: interactions.channel,
      occurredAt: interactions.occurredAt,
    })
    .from(interactions)
    .where(
      and(
        eq(interactions.userId, userId),
        gte(interactions.occurredAt, sevenDaysAgo)
      )
    )
    .orderBy(interactions.contactId, desc(interactions.occurredAt))
    .limit(MAX_PER_CATEGORY * 2);

  const activeContactIds = rows
    .filter((r) => !excludeIds.has(r.contactId))
    .map((r) => r.contactId)
    .slice(0, MAX_PER_CATEGORY);

  if (activeContactIds.length === 0) return [];

  const contactRows = await db
    .select()
    .from(contacts)
    .where(inArray(contacts.id, activeContactIds));

  const contactMap = new Map(contactRows.map((c) => [c.id, c]));
  const interactionMap = new Map(rows.map((r) => [r.contactId, r]));

  return activeContactIds.map((id) => {
    const c = contactMap.get(id)!;
    const i = interactionMap.get(id);
    const snippet = i?.summary
      ? `${i.channel} on ${new Date(i.occurredAt).toLocaleDateString()}: ${i.summary.slice(0, 80)}`
      : "Recent interaction recorded.";
    return toContact(c, 0, snippet);
  });
}

export async function generateWeeklyBrief(
  userId: string,
  sendEmail?: boolean
): Promise<WeeklyBriefResponse> {
  const { weekStart, weekEnd } = getWeekBounds();

  const followUpContacts = await needsFollowUp(userId);
  const followUpIds = new Set(followUpContacts.map((c) => c.contactId));

  const coldContacts = await goingCold(userId, followUpIds);
  const coldIds = new Set(coldContacts.map((c) => c.contactId));

  const allExcluded = new Set(Array.from(followUpIds).concat(Array.from(coldIds)));
  const newContacts = await newThisWeek(userId, allExcluded);
  const newIds = new Set(newContacts.map((c) => c.contactId));

  const allExcluded2 = new Set(Array.from(allExcluded).concat(Array.from(newIds)));
  const activeContacts = await recentlyActive(userId, allExcluded2);

  const categories: WeeklyBriefCategory[] = [];
  if (followUpContacts.length > 0) categories.push({ label: "Needs Follow-Up", contacts: followUpContacts });
  if (coldContacts.length > 0) categories.push({ label: "Going Cold", contacts: coldContacts });
  if (newContacts.length > 0) categories.push({ label: "New This Week", contacts: newContacts });
  if (activeContacts.length > 0) categories.push({ label: "Recently Active", contacts: activeContacts });

  const totalContacts = categories.reduce((sum, c) => sum + c.contacts.length, 0);

  // TODO: Wire Superhuman MCP send_email to BRIAN_EMAIL when sendEmail=true
  const emailSent = sendEmail ? false : undefined;

  return {
    generatedAt: new Date().toISOString(),
    weekStart: weekStart.toISOString().slice(0, 10),
    weekEnd: weekEnd.toISOString().slice(0, 10),
    categories,
    totalContacts,
    emailSent,
  };
}
