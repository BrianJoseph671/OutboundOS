export type ContactTier = "warm" | "cool" | "cold" | "vip";

export function getTierBadgeClass(tier: string): string {
  switch (tier as ContactTier) {
    case "warm":
      return "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border-0";
    case "cool":
      return "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border-0";
    case "cold":
      return "bg-slate-100 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300 border-0";
    case "vip":
      return "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 border-0";
    default:
      return "bg-slate-100 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300 border-0";
  }
}

// Highest-to-lowest priority, used to pick a single representative color when a
// city pin represents multiple contacts across different tiers.
const TIER_RANK: Record<ContactTier, number> = { vip: 3, warm: 2, cool: 1, cold: 0 };

export function getHighestTier(tiers: string[]): ContactTier {
  let best: ContactTier = "cold";
  for (const tier of tiers) {
    const rank = TIER_RANK[tier as ContactTier] ?? -1;
    if (rank > TIER_RANK[best]) {
      best = tier as ContactTier;
    }
  }
  return best;
}

// Solid dot/pin colors (as opposed to the badge tint classes above) for use on the map.
export function getTierDotColor(tier: string): string {
  switch (tier as ContactTier) {
    case "vip":
      return "#a855f7"; // purple-500
    case "warm":
      return "#f59e0b"; // amber-500
    case "cool":
      return "#3b82f6"; // blue-500
    case "cold":
    default:
      return "#64748b"; // slate-500
  }
}
