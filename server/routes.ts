import type { Express } from "express";
import { createServer, type Server } from "http";
import { createRequire } from "module";
import { storage } from "./storage";
import multer from "multer";
import {
  insertContactSchema,
  insertOutreachAttemptSchema,
  insertExperimentSchema,
  insertSettingsSchema,
} from "@shared/schema";

const require = createRequire(import.meta.url);
const pdfParseModule = require("pdf-parse");
// pdf-parse exports as default in the CommonJS module
const pdfParse = typeof pdfParseModule === 'function' ? pdfParseModule : pdfParseModule.default;

const upload = multer({ storage: multer.memoryStorage() });

function parseLinkedInPdf(text: string) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  
  let name = "";
  let headline = "";
  let about = "";
  let location = "";
  let experience = "";
  let education = "";
  let skills = "";
  let company = "";
  let role = "";

  let currentSection = "";
  const sectionPatterns = {
    experience: /^experience$/i,
    education: /^education$/i,
    skills: /^skills$/i,
    about: /^about$/i,
    summary: /^summary$/i,
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    if (i === 0 && !name) {
      name = line;
      continue;
    }
    
    if (i === 1 && name && !headline) {
      headline = line;
      continue;
    }

    if (sectionPatterns.experience.test(line)) {
      currentSection = "experience";
      continue;
    }
    if (sectionPatterns.education.test(line)) {
      currentSection = "education";
      continue;
    }
    if (sectionPatterns.skills.test(line)) {
      currentSection = "skills";
      continue;
    }
    if (sectionPatterns.about.test(line) || sectionPatterns.summary.test(line)) {
      currentSection = "about";
      continue;
    }

    if (currentSection === "experience") {
      experience += (experience ? "\n" : "") + line;
      if (!company && line.length > 2) {
        const parts = line.split(" at ");
        if (parts.length === 2) {
          role = parts[0].trim();
          company = parts[1].trim();
        } else if (!role) {
          role = line;
        }
      }
    } else if (currentSection === "education") {
      education += (education ? "\n" : "") + line;
    } else if (currentSection === "skills") {
      skills += (skills ? ", " : "") + line;
    } else if (currentSection === "about") {
      about += (about ? " " : "") + line;
    }

    if (line.toLowerCase().includes("location") || 
        (line.includes(",") && (line.includes("CA") || line.includes("NY") || line.includes("TX")))) {
      if (!location) {
        location = line.replace(/location:?/i, "").trim();
      }
    }
  }

  if (headline.includes(" at ")) {
    const parts = headline.split(" at ");
    if (!role) role = parts[0].trim();
    if (!company) company = parts[1].split("|")[0].trim();
  }

  return {
    name: name || undefined,
    headline: headline || undefined,
    about: about || undefined,
    location: location || undefined,
    experience: experience.slice(0, 1000) || undefined,
    education: education.slice(0, 500) || undefined,
    skills: skills.slice(0, 500) || undefined,
    company: company || undefined,
    role: role || undefined,
  };
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Contacts
  app.get("/api/contacts", async (req, res) => {
    try {
      const contacts = await storage.getContacts();
      res.json(contacts);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch contacts" });
    }
  });

  app.get("/api/contacts/:id", async (req, res) => {
    try {
      const contact = await storage.getContact(req.params.id);
      if (!contact) {
        return res.status(404).json({ error: "Contact not found" });
      }
      res.json(contact);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch contact" });
    }
  });

  app.post("/api/contacts", async (req, res) => {
    try {
      const validatedData = insertContactSchema.parse(req.body);
      const contact = await storage.createContact(validatedData);
      res.status(201).json(contact);
    } catch (error) {
      res.status(400).json({ error: "Invalid contact data" });
    }
  });

  app.patch("/api/contacts/:id", async (req, res) => {
    try {
      const contact = await storage.updateContact(req.params.id, req.body);
      if (!contact) {
        return res.status(404).json({ error: "Contact not found" });
      }
      res.json(contact);
    } catch (error) {
      res.status(500).json({ error: "Failed to update contact" });
    }
  });

  app.delete("/api/contacts/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteContact(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Contact not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete contact" });
    }
  });

  // PDF Parsing
  app.post("/api/parse-pdf", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const data = await pdfParse(req.file.buffer);
      const parsed = parseLinkedInPdf(data.text);
      res.json(parsed);
    } catch (error) {
      console.error("PDF parsing error:", error);
      res.status(500).json({ error: "Failed to parse PDF" });
    }
  });

  // Outreach Attempts
  app.get("/api/outreach-attempts", async (req, res) => {
    try {
      const attempts = await storage.getOutreachAttempts();
      res.json(attempts);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch outreach attempts" });
    }
  });

  app.get("/api/outreach-attempts/:id", async (req, res) => {
    try {
      const attempt = await storage.getOutreachAttempt(req.params.id);
      if (!attempt) {
        return res.status(404).json({ error: "Outreach attempt not found" });
      }
      res.json(attempt);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch outreach attempt" });
    }
  });

  app.post("/api/outreach-attempts", async (req, res) => {
    try {
      const validatedData = insertOutreachAttemptSchema.parse(req.body);
      const attempt = await storage.createOutreachAttempt(validatedData);
      res.status(201).json(attempt);
    } catch (error) {
      console.error("Create attempt error:", error);
      res.status(400).json({ error: "Invalid outreach attempt data" });
    }
  });

  app.patch("/api/outreach-attempts/:id", async (req, res) => {
    try {
      const attempt = await storage.updateOutreachAttempt(req.params.id, req.body);
      if (!attempt) {
        return res.status(404).json({ error: "Outreach attempt not found" });
      }
      res.json(attempt);
    } catch (error) {
      res.status(500).json({ error: "Failed to update outreach attempt" });
    }
  });

  app.delete("/api/outreach-attempts/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteOutreachAttempt(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Outreach attempt not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete outreach attempt" });
    }
  });

  // Experiments
  app.get("/api/experiments", async (req, res) => {
    try {
      const experiments = await storage.getExperiments();
      res.json(experiments);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch experiments" });
    }
  });

  app.get("/api/experiments/:id", async (req, res) => {
    try {
      const experiment = await storage.getExperiment(req.params.id);
      if (!experiment) {
        return res.status(404).json({ error: "Experiment not found" });
      }
      res.json(experiment);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch experiment" });
    }
  });

  app.post("/api/experiments", async (req, res) => {
    try {
      const validatedData = insertExperimentSchema.parse(req.body);
      const experiment = await storage.createExperiment(validatedData);
      res.status(201).json(experiment);
    } catch (error) {
      res.status(400).json({ error: "Invalid experiment data" });
    }
  });

  app.patch("/api/experiments/:id", async (req, res) => {
    try {
      const experiment = await storage.updateExperiment(req.params.id, req.body);
      if (!experiment) {
        return res.status(404).json({ error: "Experiment not found" });
      }
      res.json(experiment);
    } catch (error) {
      res.status(500).json({ error: "Failed to update experiment" });
    }
  });

  app.delete("/api/experiments/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteExperiment(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Experiment not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete experiment" });
    }
  });

  // Settings
  app.get("/api/settings", async (req, res) => {
    try {
      const settings = await storage.getSettings();
      res.json(settings || {});
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch settings" });
    }
  });

  app.post("/api/settings", async (req, res) => {
    try {
      const validatedData = insertSettingsSchema.parse(req.body);
      const settings = await storage.createSettings(validatedData);
      res.status(201).json(settings);
    } catch (error) {
      res.status(400).json({ error: "Invalid settings data" });
    }
  });

  app.patch("/api/settings/:id", async (req, res) => {
    try {
      const settings = await storage.updateSettings(req.params.id, req.body);
      if (!settings) {
        return res.status(404).json({ error: "Settings not found" });
      }
      res.json(settings);
    } catch (error) {
      res.status(500).json({ error: "Failed to update settings" });
    }
  });

  // CSV Export
  app.get("/api/export/contacts", async (req, res) => {
    try {
      const contacts = await storage.getContacts();
      
      const headers = ["Name", "Company", "Role", "Email", "LinkedIn URL", "Location", "Tags"];
      const rows = contacts.map((c) => [
        c.name || "",
        c.company || "",
        c.role || "",
        c.email || "",
        c.linkedinUrl || "",
        c.location || "",
        c.tags || "",
      ]);
      
      const csv = [
        headers.join(","),
        ...rows.map((row) => row.map((cell) => `"${(cell || "").replace(/"/g, '""')}"`).join(",")),
      ].join("\n");
      
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=contacts.csv");
      res.send(csv);
    } catch (error) {
      res.status(500).json({ error: "Failed to export contacts" });
    }
  });

  app.get("/api/export/outreach-attempts", async (req, res) => {
    try {
      const attempts = await storage.getOutreachAttempts();
      const contacts = await storage.getContacts();
      const contactMap = new Map(contacts.map((c) => [c.id, c]));
      
      const headers = [
        "Date", "Contact", "Company", "Type", "Campaign", "Variant",
        "Responded", "Positive", "Booked", "Converted", "Notes"
      ];
      
      const rows = attempts.map((a) => {
        const contact = contactMap.get(a.contactId);
        return [
          a.dateSent ? new Date(a.dateSent).toISOString().split("T")[0] : "",
          contact?.name || "",
          contact?.company || "",
          a.outreachType || "",
          a.campaign || "",
          a.messageVariantLabel || "",
          a.responded ? "Yes" : "No",
          a.positiveResponse ? "Yes" : "No",
          a.meetingBooked ? "Yes" : "No",
          a.converted ? "Yes" : "No",
          a.notes || "",
        ];
      });
      
      const csv = [
        headers.join(","),
        ...rows.map((row) => row.map((cell) => `"${(cell || "").replace(/"/g, '""')}"`).join(",")),
      ].join("\n");
      
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=outreach-attempts.csv");
      res.send(csv);
    } catch (error) {
      res.status(500).json({ error: "Failed to export outreach attempts" });
    }
  });

  return httpServer;
}
