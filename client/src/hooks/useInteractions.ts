import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { Interaction } from "@shared/schema";

/**
 * TanStack Query hook for fetching interactions for a given contact.
 * Returns interactions sorted by occurred_at descending (newest first).
 * Query key: ['interactions', contactId]
 */
export function useInteractions(contactId: string | undefined) {
  const queryClient = useQueryClient();

  const { data: interactions = [], isLoading } = useQuery<Interaction[]>({
    queryKey: ["interactions", contactId],
    queryFn: async () => {
      if (!contactId) return [];
      const res = await apiRequest(
        "GET",
        `/api/interactions?contactId=${encodeURIComponent(contactId)}`,
      );
      const data: Interaction[] = await res.json();
      // Sort by occurred_at descending (server also returns sorted, but enforce here)
      return data.sort(
        (a, b) =>
          new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
      );
    },
    enabled: !!contactId,
    staleTime: 30_000, // 30 seconds
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["interactions", contactId] });

  return { interactions, isLoading, invalidate };
}
