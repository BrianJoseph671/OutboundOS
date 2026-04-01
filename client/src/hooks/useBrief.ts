/**
 * useBrief — TanStack Query hook for contact brief generation (Phase 3).
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { ContactBrief } from "@shared/types/draft";

export function useBrief(contactId: string | undefined) {
  const queryClient = useQueryClient();
  const queryKey = ["/api/contacts", contactId, "brief"];

  const {
    data: brief,
    isLoading,
    isError,
    error,
  } = useQuery<ContactBrief>({
    queryKey,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/contacts/${contactId}/brief`);
      return res.json();
    },
    enabled: !!contactId,
    staleTime: 60_000,
  });

  const regenerate = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/contacts/${contactId}/brief/regenerate`);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(queryKey, data);
    },
  });

  return { brief, isLoading, isError, error, regenerate };
}
