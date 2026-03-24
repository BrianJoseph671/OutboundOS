/**
 * Relationships router — interaction CRUD routes (Phase 1: RelationshipOS)
 * All routes require authentication via requireAuth middleware.
 * Mounted at /api in registerRoutes(), so route paths below are relative
 * (e.g. "/interactions" becomes "/api/interactions").
 */
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { storage } from "../storage";
import { insertInteractionSchema } from "@shared/schema";

export const relationshipsRouter = Router();

// Apply requireAuth to ALL routes in this router.
// NOTE: this router must be mounted at /api/interactions (not /api) so that
// the requireAuth middleware only intercepts /api/interactions/* requests and
// does NOT affect legacy /api/contacts, /api/settings, etc.
relationshipsRouter.use(requireAuth);

// Schema for creating an interaction (userId comes from the session, not the request body)
const createInteractionBodySchema = insertInteractionSchema.omit({ userId: true });

// Schema for updating an interaction — all fields are optional
const updateInteractionBodySchema = createInteractionBodySchema.partial();

// ── GET / (= /api/interactions) ───────────────────────────────────────────────

/**
 * GET /api/interactions
 * List interactions for the authenticated user.
 * Optional query param: ?contactId=X — filter by contact.
 * Results are ordered by occurred_at DESC.
 * Returns an empty array when there are no interactions.
 */
relationshipsRouter.get("/", async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const contactId = typeof req.query.contactId === "string" ? req.query.contactId : undefined;
    const result = await storage.getInteractions(userId, contactId);
    res.json(result);
  } catch (error) {
    console.error("[GET /interactions] Error:", error);
    res.status(500).json({ error: "Failed to fetch interactions" });
  }
});

// ── GET /:id (= /api/interactions/:id) ────────────────────────────────────────

/**
 * GET /api/interactions/:id
 * Get a single interaction by ID.
 * Returns 404 if not found or if it belongs to a different user.
 */
relationshipsRouter.get("/:id", async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const interaction = await storage.getInteraction(req.params.id, userId);
    if (!interaction) {
      return res.status(404).json({ error: "Interaction not found" });
    }
    res.json(interaction);
  } catch (error) {
    console.error("[GET /interactions/:id] Error:", error);
    res.status(500).json({ error: "Failed to fetch interaction" });
  }
});

// ── POST / (= /api/interactions) ─────────────────────────────────────────────

/**
 * POST /api/interactions
 * Create a new interaction.
 * Required body: { contactId, channel, direction, occurredAt }
 * Optional body:  { sourceId, summary, rawContent, openThreads }
 *
 * Returns:
 *   400 — invalid body (Zod validation failed)
 *   404 — contactId not found or belongs to another user
 *   409 — a non-null sourceId already exists for the same channel (dedup)
 *   201 — created interaction
 */
relationshipsRouter.post("/", async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;

    // Validate request body
    let body: z.infer<typeof createInteractionBodySchema>;
    try {
      body = createInteractionBodySchema.parse(req.body);
    } catch (validationError) {
      return res.status(400).json({ error: "Invalid interaction data" });
    }

    // Verify the contact exists and is owned by the authenticated user
    const contact = await storage.getContact(body.contactId, userId);
    if (!contact || contact.userId !== userId) {
      return res.status(404).json({ error: "Contact not found" });
    }

    // Idempotency guard: reject duplicate (channel, source_id) pairs
    if (body.sourceId != null) {
      const existing = await storage.getInteractionBySourceId(body.channel, body.sourceId, userId);
      if (existing) {
        return res.status(409).json({ error: "Interaction with this channel and source_id already exists" });
      }
    }

    let interaction: Awaited<ReturnType<typeof storage.createInteraction>>;
    try {
      interaction = await storage.createInteraction({ ...body, userId });
    } catch (dbError: unknown) {
      // PostgreSQL unique constraint violation (error code 23505):
      // The global unique index on (channel, source_id) can fire even when the
      // user-scoped pre-check above found nothing — e.g. a different user already
      // owns a row with the same (channel, source_id). Return 409 instead of 500.
      if (
        dbError !== null &&
        typeof dbError === "object" &&
        (dbError as { code?: string }).code === "23505"
      ) {
        return res
          .status(409)
          .json({ error: "Interaction with this channel and source_id already exists" });
      }
      throw dbError;
    }
    res.status(201).json(interaction);
  } catch (error) {
    console.error("[POST /interactions] Error:", error);
    res.status(500).json({ error: "Failed to create interaction" });
  }
});

// ── PATCH /:id (= /api/interactions/:id) ──────────────────────────────────────

/**
 * PATCH /api/interactions/:id
 * Partial update of an interaction. Only provided fields are updated.
 * Returns 200 with the updated interaction, or 404 if not found.
 */
relationshipsRouter.patch("/:id", async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;

    let body: z.infer<typeof updateInteractionBodySchema>;
    try {
      body = updateInteractionBodySchema.parse(req.body);
    } catch (validationError) {
      return res.status(400).json({ error: "Invalid interaction data" });
    }

    // If the request body includes a contactId reassignment, verify that the
    // new contact exists and belongs to the authenticated user before updating.
    if (body.contactId != null) {
      const newContact = await storage.getContact(body.contactId, userId);
      if (!newContact || newContact.userId !== userId) {
        return res.status(404).json({ error: "Contact not found" });
      }
    }

    const interaction = await storage.updateInteraction(req.params.id, userId, body);
    if (!interaction) {
      return res.status(404).json({ error: "Interaction not found" });
    }
    res.json(interaction);
  } catch (error) {
    console.error("[PATCH /interactions/:id] Error:", error);
    res.status(500).json({ error: "Failed to update interaction" });
  }
});

// ── DELETE /:id (= /api/interactions/:id) ─────────────────────────────────────

/**
 * DELETE /api/interactions/:id
 * Delete an interaction owned by the authenticated user.
 * Returns 200 on success, or 404 if not found.
 */
relationshipsRouter.delete("/:id", async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const deleted = await storage.deleteInteraction(req.params.id, userId);
    if (!deleted) {
      return res.status(404).json({ error: "Interaction not found" });
    }
    res.json({ success: true });
  } catch (error) {
    console.error("[DELETE /interactions/:id] Error:", error);
    res.status(500).json({ error: "Failed to delete interaction" });
  }
});
