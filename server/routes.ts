import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import multer from "multer";
import { createRequire } from "module";
import {
  insertContactSchema,
  insertOutreachAttemptSchema,
  insertExperimentSchema,
  insertSettingsSchema,
} from "@shared/schema";

const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse");

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

  // PDF Parsing - accepts pre-extracted text from client OR file upload
  app.post("/api/parse-pdf", upload.single("file"), async (req, res) => {
    try {
      let text = req.body.text;
      let extractionSource = "request_body_text";
      let pageCount = 0;
      let pdfParseSuccess = false;
      
      // If file uploaded, try to extract text properly with pdf-parse
      if (req.file) {
        extractionSource = "file_upload_pdf_parse";
        console.log("[PDF Debug] /api/parse-pdf - File uploaded:", {
          originalName: req.file.originalname,
          mimeType: req.file.mimetype,
          size: req.file.size,
        });
        
        try {
          const pdfData = await pdfParse(req.file.buffer);
          text = pdfData.text;
          pageCount = pdfData.numpages;
          pdfParseSuccess = true;
          console.log("[PDF Debug] pdf-parse extraction successful");
          console.log("[PDF Debug] Page count:", pageCount);
          console.log("[PDF Debug] Total char count:", text.length);
          console.log("[PDF Debug] First 1000 chars:", text.slice(0, 1000));
          
          // Estimate per-page chars (pdf-parse doesn't give true per-page text)
          if (pageCount > 0) {
            const avgCharsPerPage = Math.floor(text.length / pageCount);
            console.log("[PDF Debug] Avg chars per page (estimated):", avgCharsPerPage);
          }
        } catch (pdfError) {
          console.log("[PDF Debug] pdf-parse failed, falling back to raw buffer:", pdfError);
          text = req.file.buffer.toString("utf-8");
          extractionSource = "file_upload_raw_buffer";
        }
      }
      
      // DEBUG: Log incoming request details
      console.log("[PDF Debug] /api/parse-pdf called");
      console.log("[PDF Debug] Extraction source:", extractionSource);
      console.log("[PDF Debug] Text provided:", !!text);
      console.log("[PDF Debug] Text length:", text?.length || 0);
      
      if (!text) {
        console.log("[PDF Debug] Error: No text provided - will return 400");
        console.log("[PDF Debug] Boolean condition: !text =", !text);
        return res.status(400).json({ error: "No text provided" });
      }

      // DEBUG: Analyze text quality
      const lines = text.split("\n");
      const nonEmptyLines = lines.filter((l: string) => l.trim().length > 0);
      const containsBinaryMarkers = /[\x00-\x08\x0E-\x1F]/.test(text.slice(0, 100));
      const hasReadableContent = /[a-zA-Z]{3,}/.test(text.slice(0, 500));
      
      console.log("[PDF Debug] Line count:", lines.length);
      console.log("[PDF Debug] Non-empty line count:", nonEmptyLines.length);
      console.log("[PDF Debug] Contains binary markers:", containsBinaryMarkers);
      console.log("[PDF Debug] Has readable content:", hasReadableContent);
      console.log("[PDF Debug] First 1000 chars:", text.slice(0, 1000));

      const parsed = parseLinkedInPdf(text);
      
      // DEBUG: Log parsed result
      const fieldsFound = Object.keys(parsed).filter(k => parsed[k as keyof typeof parsed]);
      console.log("[PDF Debug] Parsed fields found:", fieldsFound);
      console.log("[PDF Debug] Fields count:", fieldsFound.length);
      
      res.json(parsed);
    } catch (error) {
      console.error("[PDF Debug] PDF parsing error:", error);
      console.log("[PDF Debug] Will return 500 - this triggers client catch block");
      res.status(500).json({ error: "Failed to parse PDF" });
    }
  });

  // DEBUG: PDF analysis endpoint - returns detailed extraction info using real PDF parsing
  // Accepts multipart file upload with field name "file"
  app.post("/debug/pdf", upload.single("file"), async (req, res) => {
    try {
      const file = req.file;
      
      if (!file) {
        return res.status(400).json({ 
          error: "No file uploaded",
          usage: "POST multipart/form-data with field 'file' containing PDF"
        });
      }
      
      // Upload metadata
      const uploadMetadata = {
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        encoding: file.encoding,
        bufferLength: file.buffer.length,
      };
      console.log("[PDF Debug] Upload metadata:", uploadMetadata);
      
      // Method 1: Proper PDF parsing with pdf-parse
      let pdfParseResult: {
        success: boolean;
        pageCount: number;
        totalCharCount: number;
        extractedText: string;
        error?: string;
        metadata?: Record<string, unknown>;
      } = {
        success: false,
        pageCount: 0,
        totalCharCount: 0,
        extractedText: "",
      };
      
      try {
        const pdfData = await pdfParse(file.buffer);
        pdfParseResult = {
          success: true,
          pageCount: pdfData.numpages,
          totalCharCount: pdfData.text.length,
          extractedText: pdfData.text,
          metadata: {
            info: pdfData.info,
            version: pdfData.version,
          },
        };
        console.log("[PDF Debug] pdf-parse success. Pages:", pdfData.numpages, "Chars:", pdfData.text.length);
      } catch (e) {
        pdfParseResult.error = String(e);
        console.log("[PDF Debug] pdf-parse failed:", e);
      }
      
      // Method 2: Raw buffer as text (what file.text() does in browser)
      const rawText = file.buffer.toString("utf-8");
      const rawTextAnalysis = {
        totalCharCount: rawText.length,
        lineCount: rawText.split("\n").length,
        containsBinaryMarkers: /[\x00-\x08\x0E-\x1F]/.test(rawText.slice(0, 100)),
        startsWithPdfHeader: rawText.startsWith("%PDF"),
        hasReadableContent: /[a-zA-Z]{3,}/.test(rawText.slice(0, 500)),
        first100Chars: rawText.slice(0, 100),
      };
      
      // Use the properly extracted text for analysis
      const text = pdfParseResult.success ? pdfParseResult.extractedText : rawText;
      const lines = text.split("\n");
      const nonEmptyLines = lines.filter((l: string) => l.trim().length > 0);
      
      // Per-page character counts (if pdf-parse succeeded, estimate by splitting text)
      const charCountPerPage: { page: number; charCount: number; }[] = [];
      if (pdfParseResult.success && pdfParseResult.pageCount > 0) {
        // Estimate per-page by splitting text evenly (pdf-parse doesn't give per-page text)
        const avgCharsPerPage = Math.floor(pdfParseResult.totalCharCount / pdfParseResult.pageCount);
        for (let i = 0; i < pdfParseResult.pageCount; i++) {
          charCountPerPage.push({
            page: i + 1,
            charCount: i === pdfParseResult.pageCount - 1 
              ? pdfParseResult.totalCharCount - (avgCharsPerPage * i)
              : avgCharsPerPage,
          });
        }
      }
      
      // Boolean conditions that trigger 'PDF must be text-based' error
      const errorConditions = {
        // Current client-side flow uses file.text() which produces garbage for binary PDFs
        clientUsesFileText: true,
        fileTextProducesBinaryGarbage: rawTextAnalysis.containsBinaryMarkers,
        
        // What happens with current implementation:
        currentFlowWouldFail: rawTextAnalysis.containsBinaryMarkers && !rawTextAnalysis.hasReadableContent,
        
        // pdf-parse success indicates the PDF CAN be parsed properly
        pdfParseWouldSucceed: pdfParseResult.success,
        
        // The exact trigger for "PDF must be text-based" toast:
        triggerCondition: {
          description: "Toast triggers when catch block in handlePdfUpload is entered",
          causes: [
            "!response.ok (server returned 4xx/5xx error)",
            "response.json() throws (invalid JSON response)",
            "Any fetch or processing exception"
          ],
          currentBehavior: "Since parseLinkedInPdf always returns an object (even empty), the toast currently only shows on server/network errors, NOT on garbage text input. The real problem is that extraction returns empty fields.",
        },
        
        // Summary
        summary: pdfParseResult.success 
          ? "This PDF can be properly parsed. The current file.text() approach loses the content. Use pdf-parse instead."
          : "PDF parsing failed: " + pdfParseResult.error,
      };
      
      // Parse with LinkedIn parser to show what current flow extracts
      let linkedInParsed: Record<string, unknown> = {};
      let linkedInParseError = null;
      try {
        linkedInParsed = parseLinkedInPdf(text);
      } catch (e) {
        linkedInParseError = String(e);
      }
      
      const parsedFieldsFound = Object.entries(linkedInParsed)
        .filter(([_, v]) => v !== undefined && v !== "")
        .map(([k, v]) => ({ field: k, charCount: String(v).length, preview: String(v).slice(0, 50) }));
      
      const debugInfo = {
        uploadMetadata,
        
        // Real PDF parsing results
        pdfParsing: {
          method: "pdf-parse library",
          success: pdfParseResult.success,
          pageCount: pdfParseResult.pageCount,
          totalCharCount: pdfParseResult.totalCharCount,
          charCountPerPage,
          first1000Chars: pdfParseResult.extractedText.slice(0, 1000),
          error: pdfParseResult.error,
          metadata: pdfParseResult.metadata,
        },
        
        // What current file.text() approach produces
        rawBufferAsText: {
          method: "file.buffer.toString('utf-8') - simulates browser file.text()",
          ...rawTextAnalysis,
        },
        
        // Text analysis (using proper extracted text if available)
        textAnalysis: {
          source: pdfParseResult.success ? "pdf-parse" : "raw buffer",
          totalCharCount: text.length,
          totalLineCount: lines.length,
          nonEmptyLineCount: nonEmptyLines.length,
        },
        
        // Error conditions
        errorConditions,
        
        // LinkedIn parsing results
        linkedInParsing: {
          parseError: linkedInParseError,
          parsedResult: linkedInParsed,
          parsedFieldsSummary: parsedFieldsFound,
          fieldsExtractedCount: parsedFieldsFound.length,
        },
      };
      
      console.log("[PDF Debug] /debug/pdf analysis complete");
      res.json(debugInfo);
    } catch (error) {
      console.error("[PDF Debug] Debug endpoint error:", error);
      res.status(500).json({ error: "Debug analysis failed", details: String(error) });
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
