/**
 * Compose router — Draft composition and revision (Phase 3: Draft Workspace)
 * Mounted at /api/compose in registerRoutes().
 * Routes:
 *   POST /         — create initial draft
 *   POST /revise   — revise existing draft
 */
import { Router, type Request, type Response } from "express";
import { createDraft, reviseDraft } from "../services/composeService";
import type { ComposeRequest, ReviseRequest } from "@shared/types/draft";

export const composeRouter = Router();

composeRouter.post("/", async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const body = req.body as ComposeRequest;

    if (!body.actionId || !body.contactId || !body.instructions) {
      return res.status(400).json({
        error: "actionId, contactId, and instructions are required",
      });
    }

    const result = await createDraft(body, userId);
    res.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.includes("not found")) {
      return res.status(404).json({ error: message });
    }
    console.error("[POST /compose] Error:", error);
    res.status(500).json({ error: "Failed to compose draft" });
  }
});

composeRouter.post("/revise", async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const body = req.body as ReviseRequest;

    if (!body.draftId || !body.draftThreadId || !body.instructions || !body.actionId || !body.contactId) {
      return res.status(400).json({
        error: "draftId, draftThreadId, instructions, actionId, and contactId are required",
      });
    }

    const result = await reviseDraft(body, userId);
    res.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[POST /compose/revise] Error:", error);
    res.status(500).json({ error: "Failed to revise draft" });
  }
});
