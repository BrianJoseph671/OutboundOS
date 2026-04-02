import { Router, type Request } from "express";
import crypto from "crypto";
import { storage } from "../storage";
import {
  generateAuthorizationUrl,
  validateState,
  exchangeCodeForTokens,
  saveTokens,
} from "../services/oauth";
import { syncGoogleCalendarEvents } from "../services/googleIntegration";
import { auth, type OAuthClientProvider, type OAuthDiscoveryState } from "@modelcontextprotocol/sdk/client/auth.js";
import type { OAuthClientInformationMixed, OAuthClientMetadata, OAuthTokens as SdkOAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";
import { clearSuperhumanClient } from "../services/mcpClient";

const router = Router();
const SUPERHUMAN_MCP_URL =
  process.env.SUPERHUMAN_MCP_URL || "https://mcp.mail.superhuman.com/mcp";
const superhumanStateStore = new Map<string, {
  userId: string;
  createdAt: number;
  clientInformation?: OAuthClientInformationMixed;
  discoveryState?: OAuthDiscoveryState;
  codeVerifier?: string;
}>();

setInterval(() => {
  const now = Date.now();
  superhumanStateStore.forEach((value, key) => {
    if (now - value.createdAt > 10 * 60 * 1000) {
      superhumanStateStore.delete(key);
    }
  });
}, 60_000);

// Extract userId from typed session; throws 401 error if not authenticated
function getUserId(req: Request): string {
  if (!req.user?.id) {
    throw Object.assign(new Error("Not authenticated"), { status: 401 });
  }
  return req.user.id;
}

function getBaseUrl(): string {
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL;
  const replitDomains = process.env.REPLIT_DOMAINS;
  if (replitDomains) {
    const domain = replitDomains.split(",")[0].trim();
    return `https://${domain}`;
  }
  return "http://localhost:5000";
}

/**
 * Logo shown on the Superhuman OAuth consent screen (RFC 7591 `logo_uri`).
 * Set OAUTH_CLIENT_LOGO_URL to override (e.g. CDN); default is this app's public brand asset.
 */
function getSuperhumanOAuthLogoUri(): string {
  const fromEnv = process.env.OAUTH_CLIENT_LOGO_URL?.trim();
  if (fromEnv) return fromEnv;
  return `${getBaseUrl()}/brand/outbound-os-mark.svg`;
}

function buildSuperhumanProvider(stateKey: string): OAuthClientProvider {
  const session = superhumanStateStore.get(stateKey);
  if (!session) {
    throw new Error("Invalid or expired Superhuman OAuth state");
  }

  const redirectUrl = `${getBaseUrl()}/api/integrations/callback/superhuman`;
  const clientMetadata: OAuthClientMetadata = {
    redirect_uris: [redirectUrl],
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
    client_name: "Outbound OS",
    logo_uri: getSuperhumanOAuthLogoUri(),
  };

  return {
    get redirectUrl() {
      return redirectUrl;
    },
    get clientMetadata() {
      return clientMetadata;
    },
    state() {
      return stateKey;
    },
    clientInformation() {
      return session.clientInformation;
    },
    saveClientInformation(clientInformation: OAuthClientInformationMixed) {
      session.clientInformation = clientInformation;
    },
    tokens() {
      return undefined;
    },
    async saveTokens(tokens: SdkOAuthTokens) {
      await saveTokens("superhuman", session.userId, {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresIn: tokens.expires_in,
        tokenType: tokens.token_type,
        scope: tokens.scope,
      });
      await storage.upsertIntegrationConnection("superhuman", session.userId, {
        metadata: {
          oauthDiscovery: session.discoveryState ?? null,
          oauthClientInformation: session.clientInformation ?? null,
        },
        providerAccountId: process.env.BRIAN_EMAIL ?? undefined,
      });
    },
    redirectToAuthorization(authorizationUrl: URL) {
      session.createdAt = Date.now();
      // Store on session object via closure side-effect for caller to read.
      (session as { authorizationUrl?: string }).authorizationUrl = authorizationUrl.toString();
    },
    saveCodeVerifier(codeVerifier: string) {
      session.codeVerifier = codeVerifier;
    },
    codeVerifier() {
      if (!session.codeVerifier) {
        throw new Error("Missing PKCE code verifier");
      }
      return session.codeVerifier;
    },
    saveDiscoveryState(state: OAuthDiscoveryState) {
      session.discoveryState = state;
    },
    discoveryState() {
      return session.discoveryState;
    },
    invalidateCredentials(scope: "all" | "client" | "tokens" | "verifier" | "discovery") {
      if (scope === "all" || scope === "client") session.clientInformation = undefined;
      if (scope === "all" || scope === "verifier") session.codeVerifier = undefined;
      if (scope === "all" || scope === "discovery") session.discoveryState = undefined;
    },
  };
}

// List all integration connections (masks tokens)
router.get("/", async (req, res) => {
  try {
    const userId = getUserId(req);
    const connections = await storage.getAllIntegrationConnections(userId);
    const masked = connections.map((c) => ({
      provider: c.provider,
      isConnected: c.isConnected,
      scopes: c.scopes,
      providerAccountId: c.providerAccountId,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));

    // Granola is considered connected whenever Google is connected
    const googleConn = connections.find((c) => c.provider === "google");
    const granolaConn = connections.find((c) => c.provider === "granola");
    if (googleConn?.isConnected && !granolaConn?.isConnected) {
      masked.push({
        provider: "granola",
        isConnected: true,
        scopes: "via-google",
        providerAccountId: googleConn.providerAccountId || null,
        createdAt: googleConn.createdAt,
        updatedAt: googleConn.updatedAt,
      });
    }

    res.json(masked);
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to fetch integrations" });
  }
});

// Get single integration status
router.get("/:provider", async (req, res) => {
  try {
    const userId = getUserId(req);
    const { provider } = req.params;

    if (provider === "granola") {
      const google = await storage.getIntegrationConnection("google", userId);
      return res.json({
        connected: !!google?.isConnected,
        provider: "granola",
        via: "google",
      });
    }

    const conn = await storage.getIntegrationConnection(provider, userId);
    if (!conn) {
      return res.json({ connected: false, provider });
    }
    res.json({
      connected: conn.isConnected,
      provider: conn.provider,
      scopes: conn.scopes,
      providerAccountId: conn.providerAccountId,
      updatedAt: conn.updatedAt,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to fetch integration status" });
  }
});

// Start OAuth flow — returns authorization URL
// Granola has no separate OAuth; it uses Google auth
router.post("/:provider/connect", async (req, res) => {
  try {
    const userId = getUserId(req);
    const { provider } = req.params;

    if (provider === "superhuman") {
      const stateKey = crypto.randomUUID();
      superhumanStateStore.set(stateKey, { userId, createdAt: Date.now() });
      const authProvider = buildSuperhumanProvider(stateKey);

      const authResult = await auth(authProvider, {
        serverUrl: SUPERHUMAN_MCP_URL,
      });

      if (authResult === "AUTHORIZED") {
        return res.json({ connected: true, provider: "superhuman" });
      }

      const session = superhumanStateStore.get(stateKey) as { authorizationUrl?: string } | undefined;
      if (!session?.authorizationUrl) {
        throw new Error("Failed to start Superhuman authorization");
      }
      return res.json({ authorizationUrl: session.authorizationUrl });
    }

    if (provider === "granola") {
      const google = await storage.getIntegrationConnection("google", userId);
      if (!google?.isConnected) {
        return res.status(400).json({
          error: "Connect your Google account first — Granola uses Google auth.",
          requiresGoogle: true,
        });
      }
      return res.json({ connected: true, via: "google" });
    }

    const url = generateAuthorizationUrl(provider);
    res.json({ authorizationUrl: url });
  } catch (error: any) {
    res.status(400).json({ error: error.message || "Failed to start OAuth flow" });
  }
});

// OAuth callback
router.get("/callback/:provider", async (req, res) => {
  try {
    if (req.params.provider === "superhuman") {
      const code = req.query.code;
      const state = req.query.state;
      if (!code || !state) {
        return res.redirect("/settings?integration_error=missing_params");
      }

      const stateKey = String(state);
      const session = superhumanStateStore.get(stateKey);
      if (!session) {
        return res.redirect("/settings?integration_error=invalid_state");
      }

      // Do not require req.user on this request. Returning from the IdP is a
      // cross-site top-level navigation; some browsers or host mismatches
      // (localhost vs 127.0.0.1) omit the session cookie, which previously
      // aborted the flow before token exchange. userId from state was set on
      // an authenticated POST /connect and is the trust anchor for this code.
      const cookieUserId = req.user?.id;
      if (cookieUserId && cookieUserId !== session.userId) {
        console.warn(
          "[integrations] Superhuman OAuth callback: session user does not match connect state",
        );
        return res.redirect("/settings?integration_error=session_mismatch");
      }

      const userId = session.userId;

      const authProvider = buildSuperhumanProvider(stateKey);
      await auth(authProvider, {
        serverUrl: SUPERHUMAN_MCP_URL,
        authorizationCode: String(code),
      });
      superhumanStateStore.delete(stateKey);
      await clearSuperhumanClient(userId);
      return res.redirect("/settings?integration_success=superhuman");
    }

    const { code, state, error: oauthError } = req.query;

    if (oauthError) {
      return res.redirect(`/settings?integration_error=${encodeURIComponent(String(oauthError))}`);
    }

    if (!code || !state) {
      return res.redirect("/settings?integration_error=missing_params");
    }

    const provider = validateState(String(state));
    if (!provider) {
      return res.redirect("/settings?integration_error=invalid_state");
    }

    const userId = req.user?.id;
    if (!userId) {
      return res.redirect("/settings?integration_error=not_authenticated");
    }

    const tokens = await exchangeCodeForTokens(provider, String(code));
    await saveTokens(provider, userId, tokens);

    if (provider === "google") {
      try {
        const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
          headers: { Authorization: `Bearer ${tokens.accessToken}` },
        });
        if (userInfoRes.ok) {
          const userInfo = await userInfoRes.json();
          await storage.upsertIntegrationConnection(provider, userId, {
            providerAccountId: userInfo.email,
          });
        }
      } catch {
        // Non-critical
      }
    }

    res.redirect(`/settings?integration_success=${provider}`);
  } catch (error: any) {
    console.error("OAuth callback error:", error);
    res.redirect(`/settings?integration_error=${encodeURIComponent(error.message || "callback_failed")}`);
  }
});

// Disconnect an integration
router.delete("/:provider", async (req, res) => {
  try {
    const userId = getUserId(req);
    const { provider } = req.params;
    await storage.deleteIntegrationConnection(provider, userId);
    if (provider === "superhuman") {
      await clearSuperhumanClient(userId);
    }

    // Disconnecting Google also removes Granola access
    if (provider === "google") {
      await storage.deleteIntegrationConnection("granola", userId).catch(() => {});
    }

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to disconnect" });
  }
});

// Meetings — list all synced meetings
router.get("/:provider/meetings", async (req, res) => {
  try {
    const userId = getUserId(req);
    const allMeetings = await storage.getMeetings(userId);
    const filtered = req.params.provider === "all"
      ? allMeetings
      : allMeetings.filter((m) => m.source === req.params.provider || m.source === `${req.params.provider}_calendar`);
    res.json(filtered);
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to fetch meetings" });
  }
});

// Get meetings linked to a specific contact
router.get("/contacts/:contactId/meetings", async (req, res) => {
  try {
    const userId = getUserId(req);
    const contact = await storage.getContact(req.params.contactId, userId);
    if (!contact) {
      return res.status(404).json({ error: "Contact not found" });
    }
    const contactMeetings = await storage.getContactMeetings(req.params.contactId);
    res.json(contactMeetings);
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to fetch contact meetings" });
  }
});

// Sync Google Calendar events
router.post("/google/sync", async (req, res) => {
  try {
    const userId = getUserId(req);
    const result = await syncGoogleCalendarEvents(userId);
    res.json(result);
  } catch (error: any) {
    console.error("Google Calendar sync error:", error);
    res.status(500).json({ error: error.message || "Failed to sync Google Calendar" });
  }
});

// Sync Granola meetings via MCP (uses Google token)
router.post("/granola/sync", async (req, res) => {
  try {
    const userId = getUserId(req);
    const { syncGranolaMeetings } = await import("../services/granolaIntegration");
    const result = await syncGranolaMeetings(userId);
    res.json(result);
  } catch (error: any) {
    console.error("Granola sync error:", error);
    res.status(500).json({ error: error.message || "Failed to sync Granola meetings" });
  }
});

// Generate AI follow-up based on meeting context
router.post("/meetings/:meetingId/follow-up", async (req, res) => {
  try {
    const userId = getUserId(req);
    const { generateMeetingFollowUp } = await import("../services/meetingFollowUp");
    const { contactId, tone } = req.body;
    const result = await generateMeetingFollowUp(req.params.meetingId, contactId, tone, userId);
    res.json(result);
  } catch (error: any) {
    console.error("Follow-up generation error:", error);
    res.status(500).json({ error: error.message || "Failed to generate follow-up" });
  }
});

export default router;
