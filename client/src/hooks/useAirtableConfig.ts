import { useState, useCallback } from "react";
import {
  getAirtableConfig,
  setAirtableConfig,
  clearAirtableConfig,
  updateAirtableConfigLastSync,
  type AirtableConfigStored,
} from "@/lib/airtableConfigStorage";

export type { AirtableConfigStored };

export function useAirtableConfig() {
  const [config, setConfigState] = useState<AirtableConfigStored | null>(() =>
    getAirtableConfig()
  );

  const refresh = useCallback(() => {
    setConfigState(getAirtableConfig());
  }, []);

  const setConfig = useCallback((value: AirtableConfigStored) => {
    setAirtableConfig(value);
    setConfigState(value);
  }, []);

  const clearConfig = useCallback(() => {
    clearAirtableConfig();
    setConfigState(null);
  }, []);

  const updateLastSync = useCallback((lastSyncAt: string) => {
    updateAirtableConfigLastSync(lastSyncAt);
    setConfigState(getAirtableConfig());
  }, []);

  return {
    config,
    setConfig,
    clearConfig,
    refresh,
    updateLastSync,
  };
}
