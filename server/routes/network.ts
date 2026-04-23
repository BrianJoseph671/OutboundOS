import { Router, type Request, type Response } from "express";
import { prepareIndexReviewSession, runIncrementalSync } from "../services/networkIndexer";
import { storage } from "../storage";

export const networkRouter = Router();

/**
 * POST /api/network/index — scan + create type-review session.
 */
networkRouter.post("/index", async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const user = await storage.getUser(userId);
    const userEmail = user?.email;
    if (!userEmail) {
      return res.status(400).json({ error: "User email not found. Connect your Google account first." });
    }

    const latest = await storage.getLatestNetworkIndexJob(userId);
    if (latest && (latest.status === "running" || latest.status === "pending_review")) {
      const pendingSession = latest.status === "pending_review"
        ? await storage.getLatestPendingIndexReviewSession(userId)
        : undefined;
      return res.status(409).json({
        error: latest.status === "pending_review"
          ? "A review is pending for your latest index run"
          : "An index is already running",
        jobId: latest.id,
        sessionId: pendingSession?.id,
      });
    }

    const prepared = await prepareIndexReviewSession(userId, userEmail);
    res.json({
      status: "pending_review",
      sessionId: prepared.sessionId,
      jobId: prepared.jobId,
      typeCount: prepared.typeCount,
      autoAcceptedCount: prepared.autoAcceptedCount,
      totalClassifiedCount: prepared.totalClassifiedCount,
      calendarPrioritizedCount: prepared.calendarPrioritizedCount,
    });
  } catch (error) {
    console.error("[POST /api/network/index]", error);
    res.status(500).json({ error: "Failed to start network index" });
  }
});

/**
 * POST /api/network/sync — trigger an incremental 7-day sync.
 */
networkRouter.post("/sync", async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const user = await storage.getUser(userId);
    const userEmail = user?.email;
    if (!userEmail) {
      return res.status(400).json({ error: "User email not found. Connect your Google account first." });
    }

    const latest = await storage.getLatestNetworkIndexJob(userId);
    if (latest && latest.status === "running") {
      return res.status(409).json({
        error: "A sync is already running",
        jobId: latest.id,
      });
    }

    res.json({ status: "started" });

    runIncrementalSync(userId, userEmail).catch((err) => {
      console.error("[NetworkRouter] Background incremental sync failed:", err);
    });
  } catch (error) {
    console.error("[POST /api/network/sync]", error);
    res.status(500).json({ error: "Failed to start network sync" });
  }
});

/**
 * GET /api/network/status — get the latest index job status and stats.
 */
networkRouter.get("/status", async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const jobId = typeof req.query.jobId === "string" ? req.query.jobId : undefined;

    let job;
    if (jobId) {
      job = await storage.getNetworkIndexJob(jobId, userId);
    } else {
      job = await storage.getLatestNetworkIndexJob(userId);
    }

    if (!job) {
      return res.json({ status: "none", message: "No index has been run yet" });
    }

    const pendingSession = job.status === "pending_review"
      ? await storage.getLatestPendingIndexReviewSession(userId)
      : undefined;

    res.json({
      jobId: job.id,
      sessionId: pendingSession?.id,
      status: job.status,
      threadsScanned: job.threadsScanned,
      contactsFound: job.contactsFound,
      contactsUpdated: job.contactsUpdated,
      errors: job.errors,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
    });
  } catch (error) {
    console.error("[GET /api/network/status]", error);
    res.status(500).json({ error: "Failed to get network status" });
  }
});
