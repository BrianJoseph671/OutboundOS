import { Router, type Request, type Response } from "express";
import { runFullIndex, runIncrementalSync } from "../services/networkIndexer";
import { storage } from "../storage";

export const networkRouter = Router();

/**
 * POST /api/network/index — trigger a full 6-month email index.
 * Runs asynchronously; returns the job ID immediately so the client can poll status.
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
    if (latest && latest.status === "running") {
      return res.status(409).json({
        error: "An index is already running",
        jobId: latest.id,
      });
    }

    // Respond immediately, then run in background.
    // runFullIndex creates and manages its own job record.
    res.json({ status: "started" });

    runFullIndex(userId, userEmail).catch((err) => {
      console.error("[NetworkRouter] Background full index failed:", err);
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

    res.json({
      jobId: job.id,
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
