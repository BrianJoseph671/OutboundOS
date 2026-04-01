import type { RoiMetrics } from "@shared/types/phase4";

export const mockRoiMetrics: RoiMetrics = {
  contactsByTier: [
    { tier: "hot", count: 8 },
    { tier: "warm", count: 23 },
    { tier: "cool", count: 45 },
  ],
  interactionsByChannel: [
    { channel: "email", last30: 34, last60: 58, last90: 82 },
    { channel: "meeting", last30: 12, last60: 22, last90: 31 },
    { channel: "calendar", last30: 8, last60: 15, last90: 20 },
  ],
  actionCompletion: {
    total: 47,
    completed: 28,
    dismissed: 7,
    pending: 10,
    snoozed: 2,
    completionRate: 59.6,
  },
  conversionTags: [
    { tag: "meeting_booked", count: 14 },
    { tag: "interview", count: 6 },
    { tag: "referral", count: 4 },
    { tag: "converted", count: 2 },
  ],
  generatedAt: new Date().toISOString(),
};
