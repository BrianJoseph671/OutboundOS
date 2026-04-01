import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { WeeklyBriefResponse } from "@shared/types/phase4";

export function useWeeklyBrief() {
  const generate = useMutation<WeeklyBriefResponse, Error, { sendEmail?: boolean }>({
    mutationFn: async (req) => {
      const res = await apiRequest("POST", "/api/briefs/weekly", req);
      return res.json();
    },
  });

  return { generate };
}
