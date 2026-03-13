import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface IntegrationStatus {
  provider: string;
  connected?: boolean;
  isConnected?: boolean;
  providerAccountId?: string | null;
  scopes?: string | null;
}

interface SyncResult {
  synced: number;
  matched: number;
  errors: string[];
}

export function useIntegrations() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: integrations = [], isLoading } = useQuery<IntegrationStatus[]>({
    queryKey: ["/api/integrations"],
  });

  const isConnected = (provider: string) =>
    integrations.some((i) => i.provider === provider && (i.connected || i.isConnected));

  const syncGoogleMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/integrations/google/sync");
      return (await res.json()) as SyncResult;
    },
    onSuccess: (data) => {
      toast({
        title: "Google Calendar synced",
        description: `${data.synced} events synced, ${data.matched} contacts matched`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/integrations"] });
    },
    onError: (error: Error) => {
      toast({ title: "Sync failed", description: error.message, variant: "destructive" });
    },
  });

  const syncGranolaMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/integrations/granola/sync");
      return (await res.json()) as SyncResult;
    },
    onSuccess: (data) => {
      toast({
        title: "Granola meetings synced",
        description: `${data.synced} meetings synced, ${data.matched} contacts matched`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/integrations"] });
    },
    onError: (error: Error) => {
      toast({ title: "Sync failed", description: error.message, variant: "destructive" });
    },
  });

  return {
    integrations,
    isLoading,
    isConnected,
    syncGoogle: syncGoogleMutation.mutate,
    syncGranola: syncGranolaMutation.mutate,
    isSyncingGoogle: syncGoogleMutation.isPending,
    isSyncingGranola: syncGranolaMutation.isPending,
  };
}
