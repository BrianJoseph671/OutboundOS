/**
 * Actions router — actions CRUD and sync routes (Phase 2: RelationshipOS)
 * All routes require authentication (catch-all auth middleware in routes.ts applies).
 * Mounted at /api/actions in registerRoutes().
 *
 * Also exports syncRouter for POST /api/sync.
 */
import { Router, type Request, type Response } from "express";
import { storage } from "../storage";

export const actionsRouter = Router();

// ── Allowed values ─────────────────────────────────────────────────────────────

const VALID_STATUSES = ["pending", "completed", "dismissed", "snoozed"] as const;
const VALID_ACTION_TYPES = ["follow_up", "reconnect", "open_thread", "new_contact"] as const;

type ActionStatus = (typeof VALID_STATUSES)[number];

function isValidStatus(value: string): value is ActionStatus {
  return (VALID_STATUSES as readonly string[]).includes(value);
}

function isValidActionType(value: string): boolean {
  return (VALID_ACTION_TYPES as readonly string[]).includes(value);
}

// ── GET / (= /api/actions) ────────────────────────────────────────────────────

/**
 * GET /api/actions
 * List actions for the authenticated user.
 * Query params:
 *   status  — filter by status (pending | completed | dismissed | snoozed). Invalid value → 400.
 *   type    — filter by action_type (follow_up | reconnect | open_thread | new_contact). Invalid → 400.
 *   limit   — max results (default 50)
 *   offset  — pagination offset (default 0)
 */
actionsRouter.get("/", async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;

    // Validate status param
    const statusParam = req.query.status;
    if (statusParam !== undefined && typeof statusParam === "string") {
      if (!isValidStatus(statusParam)) {
        return res.status(400).json({
          error: `Invalid status '${statusParam}'. Must be one of: ${VALID_STATUSES.join(", ")}`,
        });
      }
    }

    // Validate type param
    const typeParam = req.query.type;
    if (typeParam !== undefined && typeof typeParam === "string") {
      if (!isValidActionType(typeParam)) {
        return res.status(400).json({
          error: `Invalid type '${typeParam}'. Must be one of: ${VALID_ACTION_TYPES.join(", ")}`,
        });
      }
    }

    const limitParam = req.query.limit;
    const offsetParam = req.query.offset;

    const MAX_LIMIT = 100;

    let limit = 50;
    if (limitParam !== undefined && typeof limitParam === "string") {
      const parsed = parseInt(limitParam, 10);
      if (isNaN(parsed) || String(parsed) !== limitParam.trim()) {
        return res.status(400).json({ error: "Invalid limit: must be a non-negative integer" });
      }
      if (parsed < 0) {
        return res.status(400).json({ error: "Invalid limit: must be a non-negative integer" });
      }
      limit = Math.min(parsed, MAX_LIMIT);
    }

    let offset = 0;
    if (offsetParam !== undefined && typeof offsetParam === "string") {
      const parsed = parseInt(offsetParam, 10);
      if (isNaN(parsed) || String(parsed) !== offsetParam.trim()) {
        return res.status(400).json({ error: "Invalid offset: must be a non-negative integer" });
      }
      if (parsed < 0) {
        return res.status(400).json({ error: "Invalid offset: must be a non-negative integer" });
      }
      offset = parsed;
    }

    const result = await storage.getActions(userId, {
      status: typeof statusParam === "string" ? statusParam : undefined,
      type: typeof typeParam === "string" ? typeParam : undefined,
      limit,
      offset,
    });

    res.json(result);
  } catch (error) {
    console.error("[GET /actions] Error:", error);
    res.status(500).json({ error: "Failed to fetch actions" });
  }
});

// ── GET /:id (= /api/actions/:id) ─────────────────────────────────────────────

/**
 * GET /api/actions/:id
 * Get a single action by ID.
 * Returns 404 if not found or if it belongs to a different user.
 */
actionsRouter.get("/:id", async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const action = await storage.getAction(req.params.id, userId);
    if (!action) {
      return res.status(404).json({ error: "Action not found" });
    }
    res.json(action);
  } catch (error) {
    console.error("[GET /actions/:id] Error:", error);
    res.status(500).json({ error: "Failed to fetch action" });
  }
});

// ── PATCH /:id (= /api/actions/:id) ───────────────────────────────────────────

/**
 * PATCH /api/actions/:id
 * Update an action's status (and optionally snoozedUntil, priority, reason).
 *
 * Validation:
 *   - If status is provided, it must be a valid status value → 400 otherwise
 *   - If status='snoozed', snoozedUntil must also be provided → 400 otherwise
 *
 * Returns:
 *   200  — updated action
 *   400  — invalid status value or missing snoozedUntil when snoozed
 *   404  — action not found or belongs to another user
 */
actionsRouter.patch("/:id", async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { status, snoozedUntil, priority, reason } = req.body as {
      status?: string;
      snoozedUntil?: string;
      priority?: number;
      reason?: string;
    };

    // Validate status if provided
    if (status !== undefined) {
      if (!isValidStatus(status)) {
        return res.status(400).json({
          error: `Invalid status '${status}'. Must be one of: ${VALID_STATUSES.join(", ")}`,
        });
      }
      // Require snoozedUntil when status=snoozed
      if (status === "snoozed" && !snoozedUntil) {
        return res.status(400).json({
          error: "snoozedUntil is required when status is 'snoozed'",
        });
      }
    }

    // Build update payload (only include provided fields)
    const updateData: Record<string, unknown> = {};
    if (status !== undefined) updateData.status = status;
    if (snoozedUntil !== undefined) updateData.snoozedUntil = new Date(snoozedUntil);
    if (priority !== undefined) updateData.priority = priority;
    if (reason !== undefined) updateData.reason = reason;

    const updated = await storage.updateAction(req.params.id, userId, updateData as Parameters<typeof storage.updateAction>[2]);
    if (!updated) {
      return res.status(404).json({ error: "Action not found" });
    }
    res.json(updated);
  } catch (error) {
    console.error("[PATCH /actions/:id] Error:", error);
    res.status(500).json({ error: "Failed to update action" });
  }
});

// ── DELETE /:id (= /api/actions/:id) ─────────────────────────────────────────

/**
 * DELETE /api/actions/:id
 * Delete an action.
 * Returns 200 on success, 404 if not found or belongs to another user.
 */
actionsRouter.delete("/:id", async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const deleted = await storage.deleteAction(req.params.id, userId);
    if (!deleted) {
      return res.status(404).json({ error: "Action not found" });
    }
    res.json({ success: true });
  } catch (error) {
    console.error("[DELETE /actions/:id] Error:", error);
    res.status(500).json({ error: "Failed to delete action" });
  }
});

// ── POST /api/sync (sync route) ───────────────────────────────────────────────
// Exported separately so routes.ts can mount it directly on app.

export const syncRouter = Router();

/**
 * POST /api/sync
 * Trigger a sync of recent interactions via the LangGraph agent.
 * The agent uses MCP tool adapters (TODO placeholders) to pull data from
 * Superhuman, Granola, and Google Calendar.
 *
 * Returns 200 with { newInteractions: number, newActions: number, errors: string[] }
 * Partial failure: if some MCP sources fail, successful results are still returned.
 */
syncRouter.post("/", async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { runSync } = await import("../agent/index");
    const result = await runSync(userId);
    res.json(result);
  } catch (error) {
    console.error("[POST /sync] Error:", error);
    res.status(500).json({ error: "Sync failed" });
  }
});
