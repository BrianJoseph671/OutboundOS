import type { WeeklyBriefResponse } from "@shared/types/phase4";

export async function generateWeeklyBrief(
  _userId: string,
  _sendEmail?: boolean
): Promise<WeeklyBriefResponse> {
  // Stub — real implementation in next commit
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - now.getDay() + 1);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  return {
    generatedAt: now.toISOString(),
    weekStart: monday.toISOString().slice(0, 10),
    weekEnd: sunday.toISOString().slice(0, 10),
    categories: [],
    totalContacts: 0,
  };
}
