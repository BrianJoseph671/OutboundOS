import { Router } from "express";
import { storage } from "../storage";
import {
  generateAuthorizationUrl,
  validateState,
  exchangeCodeForTokens,
  saveTokens,
  getValidAccessToken,
} from "../services/oauth";
import { decrypt } from "../utils/encryption";
import { syncGoogleCalendarEvents } from "../services/googleIntegration";

const router = Router();

// List all integration connections (masks tokens)
router.get("/", async (_req, res) => {
  try {
    const connections = await storage.getAllIntegrationConnections();
    const masked = connections.map((c) => ({
      provider: c.provider,
      isConnected: c.isConnected,
      scopes: c.scopes,
      providerAccountId: c.providerAccountId,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));
    res.json(masked);
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to fetch integrations" });
  }
});

// Get single integration status
router.get("/:provider", async (req, res) => {
  try {
    const conn = await storage.getIntegrationConnection(req.params.provider);
    if (!conn) {
      return res.json({ connected: false, provider: req.params.provider });
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
router.post("/:provider/connect", async (req, res) => {
  try {
    const { provider } = req.params;
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

    const tokens = await exchangeCodeForTokens(provider, String(code));
    await saveTokens(provider, tokens);

    // Fetch provider account info for display
    if (provider === "google") {
      try {
        const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
          headers: { Authorization: `Bearer ${tokens.accessToken}` },
        });
        if (userInfoRes.ok) {
          const userInfo = await userInfoRes.json();
          await storage.upsertIntegrationConnection(provider, {
            providerAccountId: userInfo.email,
          });
        }
      } catch {
        // Non-critical: account info fetch failed
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
    const { provider } = req.params;
    await storage.deleteIntegrationConnection(provider);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to disconnect" });
  }
});

// Meetings — list all synced meetings
router.get("/:provider/meetings", async (req, res) => {
  try {
    const allMeetings = await storage.getMeetings();
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
    const contactMeetings = await storage.getContactMeetings(req.params.contactId);
    res.json(contactMeetings);
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to fetch contact meetings" });
  }
});

// Sync Google Calendar events
router.post("/google/sync", async (_req, res) => {
  try {
    const result = await syncGoogleCalendarEvents();
    res.json(result);
  } catch (error: any) {
    console.error("Google Calendar sync error:", error);
    res.status(500).json({ error: error.message || "Failed to sync Google Calendar" });
  }
});

// Sync Granola meetings via MCP
router.post("/granola/sync", async (_req, res) => {
  try {
    const { syncGranolaMeetings } = await import("../services/granolaIntegration");
    const result = await syncGranolaMeetings();
    res.json(result);
  } catch (error: any) {
    console.error("Granola sync error:", error);
    res.status(500).json({ error: error.message || "Failed to sync Granola meetings" });
  }
});

// Generate AI follow-up based on meeting context
router.post("/meetings/:meetingId/follow-up", async (req, res) => {
  try {
    const { generateMeetingFollowUp } = await import("../services/meetingFollowUp");
    const { contactId, tone } = req.body;
    const result = await generateMeetingFollowUp(req.params.meetingId, contactId, tone);
    res.json(result);
  } catch (error: any) {
    console.error("Follow-up generation error:", error);
    res.status(500).json({ error: error.message || "Failed to generate follow-up" });
  }
});

export default router;
