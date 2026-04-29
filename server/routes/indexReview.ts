import { Router, type Request, type Response } from "express";
import { storage } from "../storage";
import { completeIndexReviewSession } from "../services/networkIndexer";

export const indexReviewRouter = Router();

indexReviewRouter.get("/pending", async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const session = await storage.getLatestPendingIndexReviewSession(userId);
    if (!session) return res.json({ session: null });
    res.json({ session: { id: session.id, status: session.status, createdAt: session.createdAt } });
  } catch (error) {
    console.error("[GET /index-review/pending]", error);
    res.status(500).json({ error: "Failed to fetch pending review session" });
  }
});

indexReviewRouter.get("/:sessionId", async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const session = await storage.getIndexReviewSession(req.params.sessionId, userId);
    if (!session) return res.status(404).json({ error: "Review session not found" });
    const items = await storage.getIndexReviewItems(session.id);
    const summary = (session.summary || {}) as Record<string, any>;
    const signatureMeetingSignals = (summary.signatureMeetingSignals || {}) as Record<
      string,
      {
        hasAnyMeetingLinkedContacts?: boolean;
        meetingLinkedContactCount?: number;
        source?: "label" | "subject";
        labelName?: string | null;
      }
    >;
    const enrichedItems = items.map((item) => {
      const signal = signatureMeetingSignals[item.signatureHash] || {};
      return {
        ...item,
        hasAnyMeetingLinkedContacts: Boolean(signal.hasAnyMeetingLinkedContacts),
        meetingLinkedContactCount: Number(signal.meetingLinkedContactCount || 0),
        source: signal.source === "label" ? "label" : "subject",
        labelName: signal.labelName || null,
      };
    });
    res.json({
      session,
      items: enrichedItems,
    });
  } catch (error) {
    console.error("[GET /index-review/:sessionId]", error);
    res.status(500).json({ error: "Failed to fetch index review session" });
  }
});

indexReviewRouter.post("/:sessionId/decide", async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const session = await storage.getIndexReviewSession(req.params.sessionId, userId);
    if (!session) return res.status(404).json({ error: "Review session not found" });
    if (session.status !== "pending_review") {
      return res.status(400).json({ error: "Session is not pending review" });
    }

    const { signatureHash, decision } = req.body as {
      signatureHash?: string;
      decision?: "accept" | "reject";
    };
    if (!signatureHash || !decision || !["accept", "reject"].includes(decision)) {
      return res.status(400).json({ error: "signatureHash and valid decision are required" });
    }

    const updated = await storage.updateIndexReviewItemDecision(session.id, signatureHash, decision);
    if (!updated) return res.status(404).json({ error: "Review item not found" });

    res.json(updated);
  } catch (error) {
    console.error("[POST /index-review/:sessionId/decide]", error);
    res.status(500).json({ error: "Failed to save decision" });
  }
});

indexReviewRouter.post("/:sessionId/complete", async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const result = await completeIndexReviewSession(userId, req.params.sessionId);
    res.json({ status: "completed", ...result });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to complete review";
    res.status(400).json({ error: msg });
  }
});
