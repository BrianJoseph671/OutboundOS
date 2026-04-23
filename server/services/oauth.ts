import crypto from "crypto";
import { encrypt, decrypt } from "../utils/encryption";
import { storage } from "../storage";

export interface OAuthProviderConfig {
  provider: string;
  clientId?: string;
  clientSecret?: string;
  authorizationUrl: string;
  tokenUrl: string;
  scopes: string[];
  redirectUri: string;
  mcpServerUrl?: string;
}

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  tokenType?: string;
  scope?: string;
}

const stateStore = new Map<string, { provider: string; createdAt: number }>();

setInterval(() => {
  const now = Date.now();
  const keys = Array.from(stateStore.keys());
  for (const key of keys) {
    const val = stateStore.get(key);
    if (val && now - val.createdAt > 10 * 60 * 1000) stateStore.delete(key);
  }
}, 60_000);

function getBaseUrl(): string {
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL;
  const replitDomains = process.env.REPLIT_DOMAINS;
  if (replitDomains) {
    const domain = replitDomains.split(",")[0].trim();
    return `https://${domain}`;
  }
  return "http://localhost:5000";
}

export function getProviderConfig(provider: string): OAuthProviderConfig {
  const baseUrl = getBaseUrl();

  if (provider === "google") {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new Error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required. Add them as secrets in your Replit project.");
    }
    return {
      provider: "google",
      clientId,
      clientSecret,
      authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      scopes: [
        "https://www.googleapis.com/auth/calendar.readonly",
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/gmail.compose",
        "https://www.googleapis.com/auth/userinfo.email",
        "https://www.googleapis.com/auth/userinfo.profile",
      ],
      redirectUri: `${baseUrl}/api/integrations/callback/google`,
    };
  }

  if (provider === "superhuman") {
    const mcpServerUrl =
      process.env.SUPERHUMAN_MCP_URL || "https://mcp.mail.superhuman.com/mcp";
    return {
      provider: "superhuman",
      // Superhuman MCP uses MCP OAuth discovery/registration flow rather than
      // static app client credentials in this service.
      authorizationUrl: mcpServerUrl,
      tokenUrl: mcpServerUrl,
      scopes: [],
      redirectUri: `${baseUrl}/api/integrations/callback/superhuman`,
      mcpServerUrl,
    };
  }

  throw new Error(`Unknown OAuth provider: ${provider}`);
}

export function generateAuthorizationUrl(provider: string): string {
  const config = getProviderConfig(provider);
  if (provider === "superhuman") {
    throw new Error(
      "Superhuman authorization must be started through the MCP OAuth flow. Use the Superhuman integration route wiring."
    );
  }
  if (!config.clientId) {
    throw new Error(`${provider} OAuth clientId is missing`);
  }
  const state = crypto.randomBytes(32).toString("hex");
  stateStore.set(state, { provider, createdAt: Date.now() });

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: config.scopes.join(" "),
    state,
    access_type: "offline",
    prompt: "consent",
  });

  return `${config.authorizationUrl}?${params.toString()}`;
}

export function validateState(state: string): string | null {
  const entry = stateStore.get(state);
  if (!entry) return null;
  stateStore.delete(state);
  return entry.provider;
}

export async function exchangeCodeForTokens(provider: string, code: string): Promise<OAuthTokens> {
  const config = getProviderConfig(provider);
  if (provider === "superhuman") {
    throw new Error(
      "Superhuman token exchange is handled by the MCP OAuth flow. Use the Superhuman integration route wiring."
    );
  }
  if (!config.clientId || !config.clientSecret) {
    throw new Error(`${provider} OAuth client credentials are missing`);
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: config.redirectUri,
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });

  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token exchange failed: ${error}`);
  }

  const data = await response.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
    tokenType: data.token_type,
    scope: data.scope,
  };
}

export async function refreshAccessToken(provider: string, userId: string): Promise<OAuthTokens | null> {
  const connection = await storage.getIntegrationConnection(provider, userId);
  if (!connection?.refreshToken) return null;

  const config = getProviderConfig(provider);
  if (provider === "superhuman") {
    // MCP OAuth refresh is handled in the MCP client path where discovery metadata
    // is available. Keep this service behavior explicit for now.
    return null;
  }
  if (!config.clientId || !config.clientSecret) {
    throw new Error(`${provider} OAuth client credentials are missing`);
  }
  const refreshToken = decrypt(connection.refreshToken);

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });

  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    console.error(`Token refresh failed for ${provider}:`, await response.text());
    return null;
  }

  const data = await response.json();
  const tokens: OAuthTokens = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken,
    expiresIn: data.expires_in,
    scope: data.scope,
  };

  await saveTokens(provider, userId, tokens);
  return tokens;
}

export async function saveTokens(provider: string, userId: string, tokens: OAuthTokens): Promise<void> {
  const expiresAt = tokens.expiresIn
    ? new Date(Date.now() + tokens.expiresIn * 1000)
    : null;

  await storage.upsertIntegrationConnection(provider, userId, {
    accessToken: encrypt(tokens.accessToken),
    refreshToken: tokens.refreshToken ? encrypt(tokens.refreshToken) : undefined,
    tokenExpiresAt: expiresAt,
    scopes: tokens.scope,
    isConnected: true,
  });
}

export async function getValidAccessToken(provider: string, userId: string): Promise<string | null> {
  const connection = await storage.getIntegrationConnection(provider, userId);
  if (!connection?.isConnected || !connection.accessToken) return null;

  if (connection.tokenExpiresAt && connection.tokenExpiresAt < new Date()) {
    const refreshed = await refreshAccessToken(provider, userId);
    if (!refreshed) {
      await storage.upsertIntegrationConnection(provider, userId, { isConnected: false });
      return null;
    }
    return refreshed.accessToken;
  }

  return decrypt(connection.accessToken);
}
