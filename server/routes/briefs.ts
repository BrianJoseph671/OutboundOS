/**
 * Briefs router — Contact brief generation and caching (Phase 3: Context Engine)
 * Mounted at /api/contacts in registerRoutes() (shares prefix with other contact routes).
 * Routes:
 *   GET  /:id/brief           — return cached brief (<24h) or generate fresh
 *   POST /:id/brief/regenerate — force regenerate, bypass cache
 */
import { Router, type Request, type Response } from "express";
import { generateBrief } from "../services/briefGenerator";

export const briefsRouter = Router();

briefsRouter.get("/:id/brief", async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const contactId = req.params.id;
    const brief = await generateBrief(contactId, userId);
    res.json(brief);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.includes("not found")) {
      return res.status(404).json({ error: message });
    }
    console.error("[GET /contacts/:id/brief] Error:", error);
    res.status(500).json({ error: "Failed to generate brief" });
  }
});

briefsRouter.post("/:id/brief/regenerate", async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const contactId = req.params.id;
    const brief = await generateBrief(contactId, userId, { force: true });
    res.json(brief);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.includes("not found")) {
      return res.status(404).json({ error: message });
    }
    console.error("[POST /contacts/:id/brief/regenerate] Error:", error);
    res.status(500).json({ error: "Failed to regenerate brief" });
  }
});
