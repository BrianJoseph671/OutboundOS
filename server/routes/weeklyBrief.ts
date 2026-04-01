import { Router, type Request, type Response } from "express";
import { generateWeeklyBrief } from "../services/weeklyBriefService";

export const weeklyBriefRouter = Router();

weeklyBriefRouter.post("/weekly", async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { sendEmail } = req.body as { sendEmail?: boolean };
    const brief = await generateWeeklyBrief(userId, sendEmail);
    res.json(brief);
  } catch (error) {
    console.error("[POST /briefs/weekly] Error:", error);
    res.status(500).json({ error: "Failed to generate weekly brief" });
  }
});
