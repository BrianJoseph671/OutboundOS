/**
 * useCompose — TanStack Query mutations for draft composition and revision (Phase 3).
 */
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { ComposeRequest, ComposeResponse, ReviseRequest, ReviseResponse } from "@shared/types/draft";

export function useCompose() {
  const compose = useMutation<ComposeResponse, Error, ComposeRequest>({
    mutationFn: async (req) => {
      const res = await apiRequest("POST", "/api/compose", req);
      return res.json();
    },
  });

  const revise = useMutation<ReviseResponse, Error, ReviseRequest>({
    mutationFn: async (req) => {
      const res = await apiRequest("POST", "/api/compose/revise", req);
      return res.json();
    },
  });

  return { compose, revise };
}
