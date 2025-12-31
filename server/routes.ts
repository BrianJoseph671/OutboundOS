import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import multer from "multer";
import {
  insertContactSchema,
  insertOutreachAttemptSchema,
  insertExperimentSchema,
  insertSettingsSchema,
} from "@shared/schema";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
});

function parseLinkedInPdf(text: string) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  let name = "";
  let headline = "";
  let about = "";
  let location = "";
  let experience = "";
  let education = "";
  let skills = "";
  let company = "";
  let role = "";

  // FIXED POSITIONS (always the same on LinkedIn PDFs):

  // Line 0: "Contact" (skip)
  // Line 1: Name
  if (lines.length > 1 && lines[0].toLowerCase() === 'contact') {
    name = lines[1].replace(/\([^)]*\)/g, '').trim(); // Remove nicknames in parens
  }

  // Line 3: Headline (line with pipes)
  if (lines.length > 3 && lines[3].includes('|')) {
    headline = lines[3];
  }

  // Line 5: Location (could be anywhere in world, not just US)
  if (lines.length > 5) {
    location = lines[5];
  }

  // VARIABLE POSITIONS (use section markers):

  const summaryIdx = lines.findIndex(l => l.toLowerCase() === 'summary');
  const experienceIdx = lines.findIndex(l => l.toLowerCase() === 'experience');
  const educationIdx = lines.findIndex(l => l.toLowerCase() === 'education');
  const topSkillsIdx = lines.findIndex(l => l.toLowerCase() === 'top skills');

  // Skills: Between "Top Skills" and next section
  if (topSkillsIdx >= 0) {
    const nextSection = Math.min(
      ...[summaryIdx, experienceIdx, educationIdx]
        .filter(idx => idx > topSkillsIdx)
        .concat(lines.length)
    );
    skills = lines.slice(topSkillsIdx + 1, nextSection).join(', ');
  }

  // About: Between "Summary" and "Experience"
  if (summaryIdx >= 0 && experienceIdx > summaryIdx) {
    about = lines.slice(summaryIdx + 1, experienceIdx).join(' ').slice(0, 1000);
  }

  // Current company and role: First 2 lines after "Experience"
  if (experienceIdx >= 0) {
    if (experienceIdx + 1 < lines.length) {
      company = lines[experienceIdx + 1];
    }
    if (experienceIdx + 2 < lines.length) {
      role = lines[experienceIdx + 2];
    }

    // Full experience text
    const expEnd = educationIdx >= 0 ? educationIdx : Math.min(experienceIdx + 50, lines.length);
    experience = lines.slice(experienceIdx + 1, expEnd).join('\n').slice(0, 1000);
  }

  // Education: After "Education" section
  if (educationIdx >= 0) {
    const eduEnd = Math.min(educationIdx + 20, lines.length);
    education = lines.slice(educationIdx + 1, eduEnd).join('\n').slice(0, 500);
  }

  return {
    name: name || undefined,
    headline: headline || undefined,
    about: about || undefined,
    location: location || undefined,
    experience: experience || undefined,
    education: education || undefined,
    skills: skills || undefined,
    company: company || undefined,
    role: role || undefined,
  };
}

export async function registerRoutes(
  httpServer: Server,
  app: Express,
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

  // PDF Parsing - accepts file upload with pdf.js-extract
  app.post("/api/parse-pdf", upload.single("file"), async (req, res) => {
    try {
      let text = "";

      if (req.file) {
        console.log("[PDF Debug] File uploaded:", {
          originalName: req.file.originalname,
          size: req.file.size,
        });

        try {
          const { PDFExtract } = await import("pdf.js-extract");
          const pdfExtract = new PDFExtract();

          // Extract text from buffer
          const data = await pdfExtract.extractBuffer(req.file.buffer);

          // Combine all text from all pages
          text = data.pages
            .map((page: any) => {
              // Group items by Y coordinate to detect lines
              const lines: { [y: number]: string[] } = {};
              page.content.forEach((item: any) => {
                const y = Math.round(item.y);
                if (!lines[y]) lines[y] = [];
                lines[y].push(item.str);
              });
              // Sort by Y coordinate and join
              return Object.keys(lines)
                .sort((a, b) => parseInt(a) - parseInt(b))
                .map((y) => lines[parseInt(y)].join(" "))
                .join("\n");
            })
            .join("\n\n");

          console.log("[PDF Debug] pdf.js-extract successful");
          console.log("[PDF Debug] Pages:", data.pages.length);
          console.log("[PDF Debug] Extracted", text.length, "characters");
          console.log("[PDF Debug] First 30 lines after extraction:");
          text.split('\n').slice(0, 30).forEach((line, idx) => {
            console.log(`[Line ${idx}]: "${line}"`);
          });
          console.log("[PDF Debug] First 500 chars:", text.slice(0, 500));
        } catch (pdfError) {
          console.log("[PDF Debug] pdf.js-extract failed:", pdfError);
          return res.status(500).json({ error: "Failed to parse PDF" });
        }
      }

      if (!text) {
        return res.status(400).json({ error: "No text provided" });
      }

      const parsed = parseLinkedInPdf(text);
      console.log(
        "[PDF Debug] Parsed fields:",
        Object.keys(parsed).filter((k) => parsed[k as keyof typeof parsed]),
      );

      res.json(parsed);
    } catch (error) {
      console.error("[PDF Debug] Error:", error);
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
          usage: "POST multipart/form-data with field 'file' containing PDF",
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

      // Method 1: Proper PDF parsing with pdf.js-extract
      let pdfParseResult: {
        success: boolean;
        pageCount: number;
        totalCharCount: number;
        extractedText: string;
        error?: string;
      } = {
        success: false,
        pageCount: 0,
        totalCharCount: 0,
        extractedText: "",
      };

      try {
        const { PDFExtract } = await import("pdf.js-extract");
        const pdfExtract = new PDFExtract();
        const data = await pdfExtract.extractBuffer(file.buffer);
        const extractedText = data.pages
          .map((page: any) =>
            page.content.map((item: any) => item.str).join(" "),
          )
          .join("\n");

        pdfParseResult = {
          success: true,
          pageCount: data.pages.length,
          totalCharCount: extractedText.length,
          extractedText: extractedText,
        };
        console.log(
          "[PDF Debug] pdf.js-extract success. Pages:",
          data.pages.length,
          "Chars:",
          extractedText.length,
        );
      } catch (e) {
        pdfParseResult.error = String(e);
        console.log("[PDF Debug] pdf.js-extract failed:", e);
      }

      // Method 2: Raw buffer as text (what file.text() does in browser)
      const rawText = file.buffer.toString("utf-8");
      const rawTextAnalysis = {
        totalCharCount: rawText.length,
        lineCount: rawText.split("\n").length,
        containsBinaryMarkers: /[\x00-\x08\x0E-\x1F]/.test(
          rawText.slice(0, 100),
        ),
        startsWithPdfHeader: rawText.startsWith("%PDF"),
        hasReadableContent: /[a-zA-Z]{3,}/.test(rawText.slice(0, 500)),
        first100Chars: rawText.slice(0, 100),
      };

      // Use the properly extracted text for analysis
      const text = pdfParseResult.success
        ? pdfParseResult.extractedText
        : rawText;
      const lines = text.split("\n");
      const nonEmptyLines = lines.filter((l: string) => l.trim().length > 0);

      // Per-page character counts (if pdf-parse succeeded, estimate by splitting text)
      const charCountPerPage: { page: number; charCount: number }[] = [];
      if (pdfParseResult.success && pdfParseResult.pageCount > 0) {
        // Estimate per-page by splitting text evenly (pdf-parse doesn't give per-page text)
        const avgCharsPerPage = Math.floor(
          pdfParseResult.totalCharCount / pdfParseResult.pageCount,
        );
        for (let i = 0; i < pdfParseResult.pageCount; i++) {
          charCountPerPage.push({
            page: i + 1,
            charCount:
              i === pdfParseResult.pageCount - 1
                ? pdfParseResult.totalCharCount - avgCharsPerPage * i
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
        currentFlowWouldFail:
          rawTextAnalysis.containsBinaryMarkers &&
          !rawTextAnalysis.hasReadableContent,

        // pdf-parse success indicates the PDF CAN be parsed properly
        pdfParseWouldSucceed: pdfParseResult.success,

        // The exact trigger for "PDF must be text-based" toast:
        triggerCondition: {
          description:
            "Toast triggers when catch block in handlePdfUpload is entered",
          causes: [
            "!response.ok (server returned 4xx/5xx error)",
            "response.json() throws (invalid JSON response)",
            "Any fetch or processing exception",
          ],
          currentBehavior:
            "Since parseLinkedInPdf always returns an object (even empty), the toast currently only shows on server/network errors, NOT on garbage text input. The real problem is that extraction returns empty fields.",
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
        .map(([k, v]) => ({
          field: k,
          charCount: String(v).length,
          preview: String(v).slice(0, 50),
        }));

      const debugInfo = {
        uploadMetadata,

        // Real PDF parsing results
        pdfParsing: {
          method: "pdf.js-extract library",
          success: pdfParseResult.success,
          pageCount: pdfParseResult.pageCount,
          totalCharCount: pdfParseResult.totalCharCount,
          charCountPerPage,
          first1000Chars: pdfParseResult.extractedText.slice(0, 1000),
          error: pdfParseResult.error,
        },

        // What current file.text() approach produces
        rawBufferAsText: {
          method:
            "file.buffer.toString('utf-8') - simulates browser file.text()",
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
      res
        .status(500)
        .json({ error: "Debug analysis failed", details: String(error) });
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
      const attempt = await storage.updateOutreachAttempt(
        req.params.id,
        req.body,
      );
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
      const experiment = await storage.updateExperiment(
        req.params.id,
        req.body,
      );
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

      const headers = [
        "Name",
        "Company",
        "Role",
        "Email",
        "LinkedIn URL",
        "Location",
        "Tags",
      ];
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
        ...rows.map((row) =>
          row.map((cell) => `"${(cell || "").replace(/"/g, '""')}"`).join(","),
        ),
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
        "Date",
        "Contact",
        "Company",
        "Type",
        "Campaign",
        "Variant",
        "Responded",
        "Positive",
        "Booked",
        "Converted",
        "Notes",
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
        ...rows.map((row) =>
          row.map((cell) => `"${(cell || "").replace(/"/g, '""')}"`).join(","),
        ),
      ].join("\n");

      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        "attachment; filename=outreach-attempts.csv",
      );
      res.send(csv);
    } catch (error) {
      res.status(500).json({ error: "Failed to export outreach attempts" });
    }
  });

  return httpServer;
}
