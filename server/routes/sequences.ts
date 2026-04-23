import { Router, type Request, type Response } from "express";
import { storage } from "../storage";
import {
  createSequence,
  markStepSent,
  pauseSequence,
  resumeSequence,
  cancelSequence,
  processDueSteps,
  checkReplyAndAutoComplete,
  seedDefaultTemplates,
} from "../services/sequenceManager";

export const sequencesRouter = Router();
export const sequenceTemplatesRouter = Router();

// ─── Sequences CRUD ──────────────────────────────────────────────────────────

sequencesRouter.get("/", async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const contactId = typeof req.query.contactId === "string" ? req.query.contactId : undefined;
    const seqs = await storage.getSequences(userId, { status, contactId });
    res.json(seqs);
  } catch (error) {
    console.error("[GET /sequences]", error);
    res.status(500).json({ error: "Failed to fetch sequences" });
  }
});

sequencesRouter.get("/:id", async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const seq = await storage.getSequence(req.params.id, userId);
    if (!seq) return res.status(404).json({ error: "Sequence not found" });

    const steps = await storage.getSequenceSteps(seq.id);
    res.json({ ...seq, steps });
  } catch (error) {
    console.error("[GET /sequences/:id]", error);
    res.status(500).json({ error: "Failed to fetch sequence" });
  }
});

sequencesRouter.post("/", async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { contactId, name, templateId, customSteps } = req.body;

    if (!contactId || !name) {
      return res.status(400).json({ error: "contactId and name are required" });
    }

    const result = await createSequence({
      userId,
      contactId,
      name,
      templateId,
      customSteps,
    });

    res.status(201).json(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to create sequence";
    console.error("[POST /sequences]", error);
    res.status(400).json({ error: msg });
  }
});

sequencesRouter.patch("/:id", async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { action } = req.body as { action: "pause" | "resume" | "cancel" };

    let result;
    switch (action) {
      case "pause":
        result = await pauseSequence(req.params.id, userId);
        break;
      case "resume":
        result = await resumeSequence(req.params.id, userId);
        break;
      case "cancel":
        result = await cancelSequence(req.params.id, userId);
        break;
      default:
        return res.status(400).json({ error: "action must be pause, resume, or cancel" });
    }

    if (!result) return res.status(404).json({ error: "Sequence not found" });
    res.json(result);
  } catch (error) {
    console.error("[PATCH /sequences/:id]", error);
    res.status(500).json({ error: "Failed to update sequence" });
  }
});

// Mark a step as sent
sequencesRouter.post("/:id/steps/:stepId/send", async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { draftId, threadId } = req.body;
    const step = await markStepSent(req.params.stepId, userId, draftId, threadId);
    if (!step) return res.status(404).json({ error: "Step not found" });
    res.json(step);
  } catch (error) {
    console.error("[POST /sequences/:id/steps/:stepId/send]", error);
    res.status(500).json({ error: "Failed to mark step as sent" });
  }
});

// Process due steps (can be called by cron or manually)
sequencesRouter.post("/process-due", async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const dueCount = await processDueSteps(userId);
    const completedCount = await checkReplyAndAutoComplete(userId);
    res.json({ dueStepsProcessed: dueCount, sequencesAutoCompleted: completedCount });
  } catch (error) {
    console.error("[POST /sequences/process-due]", error);
    res.status(500).json({ error: "Failed to process due steps" });
  }
});

// ─── Sequence Templates ──────────────────────────────────────────────────────

sequenceTemplatesRouter.get("/", async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    // Seed defaults on first access
    await seedDefaultTemplates(userId);
    const templates = await storage.getSequenceTemplates(userId);
    res.json(templates);
  } catch (error) {
    console.error("[GET /sequence-templates]", error);
    res.status(500).json({ error: "Failed to fetch templates" });
  }
});

sequenceTemplatesRouter.post("/", async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { name, steps } = req.body;
    if (!name || !steps) return res.status(400).json({ error: "name and steps are required" });

    const template = await storage.createSequenceTemplate({ userId, name, steps });
    res.status(201).json(template);
  } catch (error) {
    console.error("[POST /sequence-templates]", error);
    res.status(500).json({ error: "Failed to create template" });
  }
});

sequenceTemplatesRouter.put("/:id", async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { name, steps } = req.body;
    const updated = await storage.updateSequenceTemplate(req.params.id, userId, { name, steps });
    if (!updated) return res.status(404).json({ error: "Template not found" });
    res.json(updated);
  } catch (error) {
    console.error("[PUT /sequence-templates/:id]", error);
    res.status(500).json({ error: "Failed to update template" });
  }
});

sequenceTemplatesRouter.delete("/:id", async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const deleted = await storage.deleteSequenceTemplate(req.params.id, userId);
    if (!deleted) return res.status(404).json({ error: "Template not found" });
    res.json({ success: true });
  } catch (error) {
    console.error("[DELETE /sequence-templates/:id]", error);
    res.status(500).json({ error: "Failed to delete template" });
  }
});
