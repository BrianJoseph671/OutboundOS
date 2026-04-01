/**
 * Phase 4 — Weekly Brief + ROI Dashboard types.
 * Used by both client and server layers.
 */

// ---------------------------------------------------------------------------
// Weekly Brief
// ---------------------------------------------------------------------------

export interface WeeklyBriefContact {
  contactId: string;
  contactName: string;
  company: string | null;
  tier: string;
  lastInteractionAt: string | null;
  lastInteractionChannel: string | null;
  pendingActions: number;
  snippet: string;
}

export interface WeeklyBriefCategory {
  label: string;
  contacts: WeeklyBriefContact[];
}

export interface WeeklyBriefResponse {
  generatedAt: string;
  weekStart: string;
  weekEnd: string;
  categories: WeeklyBriefCategory[];
  totalContacts: number;
  emailSent?: boolean;
}

// ---------------------------------------------------------------------------
// ROI Dashboard
// ---------------------------------------------------------------------------

export interface TierCount {
  tier: string;
  count: number;
}

export interface ChannelInteractions {
  channel: string;
  last30: number;
  last60: number;
  last90: number;
}

export interface ActionCompletionMetrics {
  total: number;
  completed: number;
  dismissed: number;
  pending: number;
  snoozed: number;
  completionRate: number;
}

export interface ConversionTag {
  tag: string;
  count: number;
}

export interface RoiMetrics {
  contactsByTier: TierCount[];
  interactionsByChannel: ChannelInteractions[];
  actionCompletion: ActionCompletionMetrics;
  conversionTags: ConversionTag[];
  generatedAt: string;
}
