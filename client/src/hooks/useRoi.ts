import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { RoiMetrics } from "@shared/types/phase4";

export function useRoi() {
  const {
    data: metrics,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<RoiMetrics>({
    queryKey: ["/api/dashboard/roi"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/dashboard/roi");
      return res.json();
    },
    staleTime: 60_000,
  });

  return { metrics, isLoading, isError, error, refetch };
}
