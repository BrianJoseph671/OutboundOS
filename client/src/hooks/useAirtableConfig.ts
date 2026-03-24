import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export interface AirtableConfigStored {
  connected: boolean;
  baseId: string;
  tableName: string;
  personalAccessToken: string;
  viewName?: string;
  fieldMapping?: Record<string, string>;
  lastSyncAt?: string;
}

interface AirtableConfigResponse {
  connected: boolean;
  baseId?: string;
  tableName?: string;
  viewName?: string;
  lastSyncAt?: string;
  fieldMapping?: Record<string, string>;
}

const QUERY_KEY = ["/api/airtable/config"];

export function useAirtableConfig() {
  const queryClient = useQueryClient();

  const { data: rawConfig } = useQuery<AirtableConfigResponse>({
    queryKey: QUERY_KEY,
  });

  const config: AirtableConfigStored | null =
    rawConfig?.connected && rawConfig.baseId && rawConfig.tableName
      ? {
          connected: true,
          baseId: rawConfig.baseId,
          tableName: rawConfig.tableName,
          personalAccessToken: "",
          viewName: rawConfig.viewName,
          fieldMapping: rawConfig.fieldMapping,
          lastSyncAt: rawConfig.lastSyncAt,
        }
      : null;

  const saveMutation = useMutation({
    mutationFn: async (value: AirtableConfigStored) => {
      const res = await apiRequest("POST", "/api/airtable/config", {
        baseId: value.baseId,
        tableName: value.tableName,
        personalAccessToken: value.personalAccessToken,
        viewName: value.viewName,
        fieldMapping: value.fieldMapping,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", "/api/airtable/config");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });

  const setConfig = (value: AirtableConfigStored) => {
    saveMutation.mutate(value);
  };

  const clearConfig = () => {
    deleteMutation.mutate();
  };

  const updateLastSync = (lastSyncAt: string) => {
    queryClient.setQueryData<AirtableConfigResponse>(QUERY_KEY, (prev) =>
      prev ? { ...prev, lastSyncAt } : prev
    );
  };

  return {
    config,
    setConfig,
    clearConfig,
    refresh: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
    updateLastSync,
    isSaving: saveMutation.isPending,
  };
}
