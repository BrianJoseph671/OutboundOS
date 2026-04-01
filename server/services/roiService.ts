import { db } from "../db";
import { contacts, interactions, actions } from "@shared/schema";
import { eq, and, gte, sql as drizzleSql } from "drizzle-orm";
import type {
  RoiMetrics,
  TierCount,
  ChannelInteractions,
  ActionCompletionMetrics,
  ConversionTag,
} from "@shared/types/phase4";

const KNOWN_CONVERSION_TAGS = ["interview", "referral", "converted", "meeting_booked"];

async function contactsByTier(userId: string): Promise<TierCount[]> {
  const rows = await db
    .select({
      tier: contacts.tier,
      count: drizzleSql<number>`count(*)::int`,
    })
    .from(contacts)
    .where(eq(contacts.userId, userId))
    .groupBy(contacts.tier);

  return rows.map((r) => ({ tier: r.tier, count: r.count }));
}

async function interactionsByChannel(userId: string): Promise<ChannelInteractions[]> {
  const now = new Date();
  const d30 = new Date(now.getTime() - 30 * 86400000);
  const d60 = new Date(now.getTime() - 60 * 86400000);
  const d90 = new Date(now.getTime() - 90 * 86400000);

  const rows = await db
    .select({
      channel: interactions.channel,
      last30: drizzleSql<number>`count(*) filter (where ${interactions.occurredAt} >= ${d30})::int`,
      last60: drizzleSql<number>`count(*) filter (where ${interactions.occurredAt} >= ${d60})::int`,
      last90: drizzleSql<number>`count(*) filter (where ${interactions.occurredAt} >= ${d90})::int`,
    })
    .from(interactions)
    .where(
      and(
        eq(interactions.userId, userId),
        gte(interactions.occurredAt, d90)
      )
    )
    .groupBy(interactions.channel);

  return rows.map((r) => ({
    channel: r.channel,
    last30: r.last30,
    last60: r.last60,
    last90: r.last90,
  }));
}

async function actionCompletion(userId: string): Promise<ActionCompletionMetrics> {
  const rows = await db
    .select({
      status: actions.status,
      count: drizzleSql<number>`count(*)::int`,
    })
    .from(actions)
    .where(eq(actions.userId, userId))
    .groupBy(actions.status);

  const statusMap: Record<string, number> = {};
  for (const r of rows) {
    statusMap[r.status] = r.count;
  }

  const completed = statusMap["completed"] || 0;
  const dismissed = statusMap["dismissed"] || 0;
  const pending = statusMap["pending"] || 0;
  const snoozed = statusMap["snoozed"] || 0;
  const total = completed + dismissed + pending + snoozed;
  const completionRate = total > 0 ? Math.round((completed / total) * 1000) / 10 : 0;

  return { total, completed, dismissed, pending, snoozed, completionRate };
}

async function conversionTags(userId: string): Promise<ConversionTag[]> {
  const rows = await db
    .select({ tags: contacts.tags })
    .from(contacts)
    .where(eq(contacts.userId, userId));

  const tagCounts: Record<string, number> = {};
  for (const known of KNOWN_CONVERSION_TAGS) {
    tagCounts[known] = 0;
  }

  for (const row of rows) {
    if (!row.tags) continue;
    const parts = row.tags.split(",").map((t) => t.trim().toLowerCase());
    for (const part of parts) {
      if (KNOWN_CONVERSION_TAGS.includes(part)) {
        tagCounts[part] = (tagCounts[part] || 0) + 1;
      }
    }
  }

  return Object.entries(tagCounts)
    .filter(([, count]) => count > 0)
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);
}

export async function getRoiMetrics(userId: string): Promise<RoiMetrics> {
  const [tiers, channels, completion, tags] = await Promise.all([
    contactsByTier(userId),
    interactionsByChannel(userId),
    actionCompletion(userId),
    conversionTags(userId),
  ]);

  return {
    contactsByTier: tiers,
    interactionsByChannel: channels,
    actionCompletion: completion,
    conversionTags: tags,
    generatedAt: new Date().toISOString(),
  };
}

export function roiMetricsToCsv(metrics: RoiMetrics): string {
  const lines: string[] = ["Section,Label,Value"];

  for (const t of metrics.contactsByTier) {
    lines.push(`Contacts by Tier,${t.tier},${t.count}`);
  }

  for (const c of metrics.interactionsByChannel) {
    lines.push(`Interactions (30d),${c.channel},${c.last30}`);
    lines.push(`Interactions (60d),${c.channel},${c.last60}`);
    lines.push(`Interactions (90d),${c.channel},${c.last90}`);
  }

  lines.push(`Action Completion,total,${metrics.actionCompletion.total}`);
  lines.push(`Action Completion,completed,${metrics.actionCompletion.completed}`);
  lines.push(`Action Completion,dismissed,${metrics.actionCompletion.dismissed}`);
  lines.push(`Action Completion,pending,${metrics.actionCompletion.pending}`);
  lines.push(`Action Completion,snoozed,${metrics.actionCompletion.snoozed}`);
  lines.push(`Action Completion,completion_rate,${metrics.actionCompletion.completionRate}`);

  for (const tag of metrics.conversionTags) {
    lines.push(`Conversion Tags,${tag.tag},${tag.count}`);
  }

  return lines.join("\n") + "\n";
}
