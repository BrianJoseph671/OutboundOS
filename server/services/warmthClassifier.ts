import type { WarmthTier } from "@shared/schema";

export interface WarmthInput {
  bidirectionalThreads: number;
  totalThreads: number;
  lastInteraction: Date | null;
  hasGranolaMeeting: boolean;
  hasCalendarEvent: boolean;
}

export interface WarmthResult {
  warmthScore: number;
  tier: WarmthTier;
}

function recencyBonus(lastInteraction: Date | null): number {
  if (!lastInteraction) return 0;
  const daysSince = (Date.now() - lastInteraction.getTime()) / (1000 * 60 * 60 * 24);
  if (daysSince < 7) return 15;
  if (daysSince < 14) return 10;
  if (daysSince < 30) return 5;
  if (daysSince < 60) return 2;
  return 0;
}

export function computeWarmth(input: WarmthInput): WarmthResult {
  const warmthScore =
    (input.bidirectionalThreads * 10) +
    (input.totalThreads * 2) +
    (input.hasGranolaMeeting ? 20 : 0) +
    (input.hasCalendarEvent ? 10 : 0) +
    recencyBonus(input.lastInteraction);

  let tier: WarmthTier;
  if (warmthScore >= 40) tier = "vip";
  else if (warmthScore >= 20) tier = "warm";
  else if (warmthScore >= 5) tier = "cool";
  else tier = "cold";

  return { warmthScore, tier };
}
