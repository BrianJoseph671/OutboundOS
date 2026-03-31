/**
 * Phase 2 — Action types for the Actions Page.
 * These types mirror the `actions` table schema in shared/schema.ts (added in phase2-schema-and-storage)
 * and are used throughout the UI and API layers.
 */

export type ActionType = 'follow_up' | 'reconnect' | 'open_thread' | 'new_contact';

export type ActionStatus = 'pending' | 'completed' | 'dismissed' | 'snoozed';

export type PlayType = 'warm' | 'cold' | 'intro';

/**
 * ActionCard — the shape returned by GET /api/actions.
 * Matches the `actions` table schema with joined contact fields.
 */
export interface ActionCard {
  id: string;
  userId: string;
  contactId: string;
  actionType: ActionType;
  triggerInteractionId: string | null;
  priority: number;
  status: ActionStatus;
  snoozedUntil: Date | null;
  reason: string;
  createdAt: Date;
  completedAt: Date | null;
  // Joined contact fields
  contactName: string;
  contactCompany: string | null;
  contactEmail: string | null;
}

/**
 * SyncResponse — the shape returned by POST /api/sync.
 */
export interface SyncResponse {
  newInteractions: number;
  newActions: number;
  errors: string[];
}

/**
 * ActionsFilter — query parameters accepted by GET /api/actions.
 */
export interface ActionsFilter {
  status?: ActionStatus;
  type?: ActionType;
  limit?: number;
  offset?: number;
}
