import { Router, type Request, type Response } from "express";
import { getRoiMetrics, roiMetricsToCsv } from "../services/roiService";

export const roiRouter = Router();

roiRouter.get("/roi", async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const metrics = await getRoiMetrics(userId);
    res.json(metrics);
  } catch (error) {
    console.error("[GET /dashboard/roi] Error:", error);
    res.status(500).json({ error: "Failed to compute ROI metrics" });
  }
});

roiRouter.get("/roi/export", async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const metrics = await getRoiMetrics(userId);
    const csv = roiMetricsToCsv(metrics);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", 'attachment; filename="roi-export.csv"');
    res.send(csv);
  } catch (error) {
    console.error("[GET /dashboard/roi/export] Error:", error);
    res.status(500).json({ error: "Failed to export ROI metrics" });
  }
});
