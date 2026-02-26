import { Router } from "express";
import { batchProcessor } from "../services/batchProcessor";
import { n8nClient } from "../services/n8nClient";
import { storage } from "../storage";
import { appendResearchedTag } from "../utils/contactTags";

const router = Router();

router.post("/research", async (req, res) => {
  try {
    const { contactIds, contacts: contactsPayload } = req.body;

    let contacts: Array<{ id: string; name: string; company?: string; linkedinUrl?: string }>;

    if (Array.isArray(contactsPayload) && contactsPayload.length > 0) {
      contacts = contactsPayload.map((c: { id: string; name: string; company?: string; linkedinUrl?: string }) => ({
        id: c.id,
        name: c.name,
        company: c.company || "",
        linkedinUrl: c.linkedinUrl,
      }));
    } else if (Array.isArray(contactIds) && contactIds.length > 0) {
      const allContacts = await storage.getContacts();
      contacts = allContacts
        .filter((c) => contactIds.includes(c.id))
        .map((c) => ({
          id: c.id,
          name: c.name,
          company: c.company || "",
          linkedinUrl: c.linkedinUrl || undefined,
        }));
    } else {
      return res.status(400).json({ error: "contacts or contactIds array is required" });
    }

    if (contacts.length === 0) {
      return res.status(404).json({ error: "No matching contacts found" });
    }

    const jobId = await batchProcessor.startResearchBatch(contacts);

    res.json({ jobId, contactCount: contacts.length });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to start batch";
    res.status(500).json({ error: message });
  }
});

router.get("/:jobId/status", (req, res) => {
  try {
    const { jobId } = req.params;
    const status = batchProcessor.getJobStatusJSON(jobId);

    if (!status) {
      return res.status(404).json({ error: "Job not found" });
    }

    res.json(status);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to get status";
    res.status(500).json({ error: message });
  }
});

router.post("/:jobId/pause", (req, res) => {
  try {
    const { jobId } = req.params;
    const job = batchProcessor.getJobStatus(jobId);

    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }

    if (job.status !== "processing") {
      return res.status(400).json({ error: "Job is not currently processing" });
    }

    res.json({ message: "Pause requested", jobId });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to pause job";
    res.status(500).json({ error: message });
  }
});

router.post("/:jobId/resume", (req, res) => {
  try {
    const { jobId } = req.params;
    const job = batchProcessor.getJobStatus(jobId);

    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }

    res.json({ message: "Resume requested", jobId });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to resume job";
    res.status(500).json({ error: message });
  }
});

router.post("/:jobId/cancel", (req, res) => {
  try {
    const { jobId } = req.params;
    const job = batchProcessor.getJobStatus(jobId);

    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }

    res.json({ message: "Cancel requested", jobId });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to cancel job";
    res.status(500).json({ error: message });
  }
});

router.post("/:jobId/retry/:contactId", async (req, res) => {
  try {
    const { jobId, contactId } = req.params;
    const job = batchProcessor.getJobStatus(jobId);

    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }

    const contactResult = job.contacts.get(contactId);
    if (!contactResult) {
      return res.status(404).json({ error: "Contact not found in job" });
    }

    if (contactResult.status !== "failed") {
      return res.status(400).json({ error: "Contact is not in failed state" });
    }

    const contact = await storage.getContact(contactId);
    if (!contact) {
      return res.status(404).json({ error: "Contact not found" });
    }

    const researchResult = await n8nClient.research({
      personName: contact.name,
      company: contact.company || "",
      linkedinUrl: contact.linkedinUrl || undefined,
    });

    const research = researchResult.research || researchResult.profileInsight || "";

    const newTags = appendResearchedTag(contact.tags);
    await storage.updateContact(contactId, {
      notes: research ? `[AI Research]\n${research}` : undefined,
      tags: newTags,
    });

    res.json({
      contactId,
      status: "completed",
      research,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to retry contact";
    res.status(500).json({ error: message });
  }
});

router.post("/qa/:messageId", async (req, res) => {
  try {
    const { messageId } = req.params;
    const { draft, channel, contactName, company } = req.body;

    if (!draft || !channel || !contactName || !company) {
      return res.status(400).json({ error: "draft, channel, contactName, and company are required" });
    }

    const qaResult = await n8nClient.qa({
      draft,
      channel,
      contactName,
      company,
    });

    res.json({
      messageId,
      ...qaResult,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to run QA";
    res.status(500).json({ error: message });
  }
});

router.post("/send", async (req, res) => {
  try {
    const { personId, messageId, channel, contactName, company, numberOfMessages, goal } = req.body;

    if (!personId || !channel || !contactName || !company) {
      return res.status(400).json({ error: "personId, channel, contactName, and company are required" });
    }

    const sequenceResult = await n8nClient.sequence({
      contactId: personId,
      contactName,
      company,
      channel,
      numberOfMessages: numberOfMessages || 3,
      goal,
    });

    res.json({
      personId,
      messageId,
      ...sequenceResult,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to send message";
    res.status(500).json({ error: message });
  }
});

export default router;
