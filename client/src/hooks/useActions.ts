/**
 * useActions — TanStack Query hook for the Actions Page.
 *
 * Fetches GET /api/actions with optional filter params and provides
 * mutations for dismiss, snooze, complete, and sync.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { ActionCard, ActionsFilter, SyncResponse } from "@shared/types/actions";
import { apiRequest } from "@/lib/queryClient";

const ACTIONS_QUERY_KEY = "/api/actions";

/**
 * Build the URL for GET /api/actions with optional filter params.
 */
function buildActionsUrl(filters?: ActionsFilter): string {
  const params = new URLSearchParams();
  if (filters?.status) params.set("status", filters.status);
  if (filters?.type) params.set("type", filters.type);
  if (filters?.limit !== undefined) params.set("limit", String(filters.limit));
  if (filters?.offset !== undefined) params.set("offset", String(filters.offset));
  const qs = params.toString();
  return qs ? `/api/actions?${qs}` : "/api/actions";
}

/**
 * useActions — fetches actions from the API with optional filters.
 *
 * @param filters - Optional ActionsFilter object (status, type, limit, offset)
 * @returns { actions, isLoading, isError, invalidate, dismissAction, snoozeAction, completeAction, syncRecent }
 */
export function useActions(filters?: ActionsFilter) {
  const queryClient = useQueryClient();

  // Dynamic query key: include filters so different filter combos have separate cache entries
  const queryKey = filters
    ? [ACTIONS_QUERY_KEY, filters]
    : [ACTIONS_QUERY_KEY];

  const {
    data: actions = [],
    isLoading,
    isError,
  } = useQuery<ActionCard[]>({
    queryKey,
    queryFn: async () => {
      const url = buildActionsUrl(filters);
      const res = await apiRequest("GET", url);
      return res.json();
    },
    staleTime: 30_000, // 30 seconds
  });

  /** Invalidate all /api/actions queries (regardless of filter) */
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: [ACTIONS_QUERY_KEY] });

  /** Dismiss an action: PATCH /api/actions/:id with { status: "dismissed" } */
  const dismissAction = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("PATCH", `/api/actions/${id}`, {
        status: "dismissed",
      });
      return res.json();
    },
    onSuccess: () => invalidate(),
  });

  /** Snooze an action: PATCH /api/actions/:id with { status: "snoozed", snoozedUntil } */
  const snoozeAction = useMutation({
    mutationFn: async ({
      id,
      snoozedUntil,
    }: {
      id: string;
      snoozedUntil: string;
    }) => {
      const res = await apiRequest("PATCH", `/api/actions/${id}`, {
        status: "snoozed",
        snoozedUntil,
      });
      return res.json();
    },
    onSuccess: () => invalidate(),
  });

  /** Complete an action: PATCH /api/actions/:id with { status: "completed" } */
  const completeAction = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("PATCH", `/api/actions/${id}`, {
        status: "completed",
      });
      return res.json();
    },
    onSuccess: () => invalidate(),
  });

  /** Sync Recent: POST /api/sync — returns SyncResponse and invalidates actions */
  const syncRecent = useMutation({
    mutationFn: async (): Promise<SyncResponse> => {
      const res = await apiRequest("POST", "/api/sync");
      return res.json();
    },
    onSuccess: () => invalidate(),
  });

  return {
    actions,
    isLoading,
    isError,
    invalidate,
    dismissAction,
    snoozeAction,
    completeAction,
    syncRecent,
  };
}
