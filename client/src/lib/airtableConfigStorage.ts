const STORAGE_KEY = "outbound-airtable-config";

export interface AirtableConfigStored {
  connected: boolean;
  baseId: string;
  tableName: string;
  personalAccessToken: string;
  viewName?: string;
  fieldMapping?: Record<string, string>;
  lastSyncAt?: string;
}

export function getAirtableConfig(): AirtableConfigStored | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AirtableConfigStored;
  } catch {
    return null;
  }
}

export function setAirtableConfig(config: AirtableConfigStored): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function clearAirtableConfig(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function updateAirtableConfigLastSync(lastSyncAt: string): void {
  const config = getAirtableConfig();
  if (!config) return;
  setAirtableConfig({ ...config, lastSyncAt });
}
