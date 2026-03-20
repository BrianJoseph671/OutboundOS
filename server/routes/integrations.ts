import { Router, type Request } from "express";
import { storage } from "../storage";
import {
  generateAuthorizationUrl,
  validateState,
  exchangeCodeForTokens,
  saveTokens,
} from "../services/oauth";
import { syncGoogleCalendarEvents } from "../services/googleIntegration";

const router = Router();

// Extract userId from typed session; throws 401 error if not authenticated
function getUserId(req: Request): string {
  if (!req.user?.id) {
    throw Object.assign(new Error("Not authenticated"), { status: 401 });
  }
  return req.user.id;
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
