import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import multer from "multer";
import OpenAI from "openai";
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

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Helper function to extract text from PDF using pdf.js-extract
async function extractPdfText(buffer: Buffer): Promise<string> {
  const { PDFExtract } = await import("pdf.js-extract");
  const pdfExtract = new PDFExtract();
  const data = await pdfExtract.extractBuffer(buffer);

  return data.pages
    .map((page: any) => {
      const lines: { [y: number]: string[] } = {};
      page.content.forEach((item: any) => {
        const y = Math.round(item.y);
        if (!lines[y]) lines[y] = [];
        lines[y].push(item.str);
      });
      return Object.keys(lines)
        .sort((a, b) => parseInt(a) - parseInt(b))
        .map((y) => lines[parseInt(y)].join(" "))
        .join("\n");
    })
    .join("\n\n");
}

// Helper function to parse LinkedIn profile text using OpenAI API
async function parseWithOpenAI(text: string): Promise<any> {
  const completion = await openai.chat.completions.create({
    model: "gpt-4-turbo",
    max_tokens: 1024,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You are a helpful assistant that extracts structured data from LinkedIn profiles. Always respond with valid JSON.",
      },
      {
        role: "user",
        content: `Extract structured information from this LinkedIn profile PDF text. Return ONLY valid JSON with these exact fields (use null for missing fields):

{
  "name": "Full name without nicknames",
  "headline": "Professional headline (the line with | separators)",
  "location": "City, State/Country",
  "company": "Current company name",
  "role": "Current job title",
  "about": "Summary/About section text",
  "experience": "Experience section text (first 1000 chars)",
  "education": "Education section text (first 500 chars)",
  "skills": "Comma-separated skills from Top Skills section"
}

LinkedIn Profile Text:
${text.slice(0, 15000)}`,
      },
    ],
  });

  const responseText = completion.choices[0].message.content || "";

  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Could not extract JSON from OpenAI response");
  }

  const parsed = JSON.parse(jsonMatch[0]);

  // Convert nulls to undefined for consistency
  Object.keys(parsed).forEach((key) => {
    if (parsed[key] === null) parsed[key] = undefined;
  });

  return parsed;
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

  app.post("/api/contacts/bulk-delete", async (req, res) => {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids)) {
        return res.status(400).json({ error: "Expected array of ids" });
      }
      const count = await storage.deleteContacts(ids);
      res.json({ success: true, count });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete contacts" });
    }
  });

  // Bulk Contact Import
  app.post("/api/contacts/bulk-import", async (req, res) => {
    try {
      const contacts = req.body.contacts;

      if (!Array.isArray(contacts)) {
        return res.status(400).json({ error: "Expected array of contacts" });
      }

      const results = {
        success: 0,
        failed: 0,
        errors: [] as string[],
      };

      for (const contactData of contacts) {
        try {
          if (!contactData.name) {
            results.failed++;
            results.errors.push("Missing name for contact");
            continue;
          }

          const existing = await storage.getContacts();
          const duplicate = existing.find(
            (c) => c.name.toLowerCase() === contactData.name.toLowerCase(),
          );

          if (duplicate) {
            results.failed++;
            results.errors.push(`Duplicate: ${contactData.name}`);
            continue;
          }

          const validatedData = insertContactSchema.parse(contactData);
          await storage.createContact(validatedData);
          results.success++;
        } catch (error) {
          results.failed++;
          results.errors.push(`Failed: ${contactData.name}`);
        }
      }

      res.json(results);
    } catch (error) {
      res.status(500).json({ error: "Bulk import failed" });
    }
  });

  // PDF Parsing - uses Claude API for intelligent extraction
  app.post("/api/parse-pdf", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      console.log("[PDF] File uploaded:", req.file.originalname, req.file.size, "bytes");

      // Extract text from PDF
      let text = "";
      try {
        text = await extractPdfText(req.file.buffer);
        console.log("[PDF] Extracted", text.length, "characters");
      } catch (pdfError) {
        console.log("[PDF] pdf.js-extract failed:", pdfError);
        return res.status(500).json({ error: "Failed to extract PDF text" });
      }

      if (!text) {
        return res.status(400).json({ error: "No text extracted from PDF" });
      }

      // Use OpenAI to parse the LinkedIn profile
      console.log("[PDF] Sending to OpenAI API for parsing...");
      const parsed = await parseWithOpenAI(text);
      console.log("[PDF] Parsed fields:", Object.keys(parsed).filter((k) => parsed[k]));

      res.json(parsed);
    } catch (error) {
      console.error("[PDF] Error:", error);
      res.status(500).json({ error: "Failed to parse PDF" });
    }
  });

  // Batch PDF Parsing - uses Claude API for intelligent extraction
  app.post("/api/parse-pdf-batch", upload.array("files", 20), async (req, res) => {
    const files = req.files as Express.Multer.File[];

    if (!files || files.length === 0) {
      return res.status(400).json({ error: "No files uploaded" });
    }

    console.log(`[PDF Batch] Processing ${files.length} files`);

    const results: Array<{
      filename: string;
      success: boolean;
      contact?: any;
      error?: string;
    }> = [];

    // Process files sequentially to avoid overwhelming the API
    for (const file of files) {
      try {
        console.log(`[PDF Batch] Processing: ${file.originalname}`);

        // Extract text from PDF
        const text = await extractPdfText(file.buffer);
        console.log(`[PDF Batch] Extracted ${text.length} characters from ${file.originalname}`);

        if (!text) {
          throw new Error("No text extracted from PDF");
        }

        // Use OpenAI to parse
        const parsed = await parseWithOpenAI(text);

        results.push({
          filename: file.originalname,
          success: true,
          contact: parsed,
        });

        console.log(`[PDF Batch] Successfully parsed: ${file.originalname}`);
      } catch (error) {
        console.error(`[PDF Batch] Failed to parse ${file.originalname}:`, error);
        results.push({
          filename: file.originalname,
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    console.log(`[PDF Batch] Complete: ${successCount}/${files.length} successful`);

    res.json({
      totalFiles: files.length,
      successCount,
      failureCount: files.length - successCount,
      results,
    });
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

      // LinkedIn parsing now uses Python-based parser (not available in debug endpoint)
      const linkedInParsed: Record<string, unknown> = {};
      const linkedInParseError = "LinkedIn parsing uses Python pdfplumber - use /api/parse-pdf endpoint instead";
      const parsedFieldsFound: { field: string; charCount: number; preview: string }[] = [];

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
      console.log(`Updating outreach attempt ${req.params.id}:`, req.body);
      
      const { id, ...data } = req.body;
      const updateData: any = { ...data };
      
      // Map frontend fields to DB schema if necessary and handle dates
      if (updateData.dateSent) {
        const d = new Date(updateData.dateSent);
        if (!isNaN(d.getTime())) {
          updateData.dateSent = d;
        } else {
          delete updateData.dateSent;
        }
      }
      
      if (updateData.responseDate) {
        const d = new Date(updateData.responseDate);
        if (!isNaN(d.getTime())) {
          updateData.responseDate = d;
        } else {
          updateData.responseDate = null;
        }
      } else if (updateData.responseDate === "") {
        updateData.responseDate = null;
      }

      // Ensure required fields are not explicitly set to empty strings if they should be null
      const nullableFields = ['campaign', 'subject', 'notes', 'messageVariantLabel', 'companyTier', 'experimentId', 'experimentVariant'];
      nullableFields.forEach(field => {
        if (updateData[field] === "") {
          updateData[field] = null;
        }
      });

      const attempt = await storage.updateOutreachAttempt(
        req.params.id,
        updateData,
      );
      
      if (!attempt) {
        return res.status(404).json({ error: "Outreach attempt not found" });
      }
      res.json(attempt);
    } catch (error) {
      console.error("Update error:", error);
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

  app.post("/api/outreach-attempts/bulk-delete", async (req, res) => {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids)) {
        return res.status(400).json({ error: "Expected array of ids" });
      }
      const count = await storage.deleteOutreachAttempts(ids);
      res.json({ success: true, count });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete outreach attempts" });
    }
  });

  // Bulk Outreach Import
  app.post("/api/outreach-attempts/bulk-import", async (req, res) => {
    try {
      const attempts = req.body.attempts;

      if (!Array.isArray(attempts)) {
        return res.status(400).json({ error: "Expected array of attempts" });
      }

      const results = { success: 0, failed: 0, errors: [] as string[] };

      // Map human-readable outreach types to database format
      const outreachTypeMap: Record<string, string> = {
        "linkedin message": "linkedin_connected",
        "linkedin_message": "linkedin_connected",
        "linkedin connected": "linkedin_connected",
        "linkedin": "linkedin_connected",
        "linkedin connection request": "linkedin_connect_request",
        "linkedin connect request": "linkedin_connect_request",
        "linkedin_connect_request": "linkedin_connect_request",
        "connection request": "linkedin_connect_request",
        "inmail": "linkedin_inmail",
        "linkedin inmail": "linkedin_inmail",
        "linkedin_inmail": "linkedin_inmail",
        "email": "email",
        "whatsapp": "whatsapp",
        // Already in correct format
        "linkedin_connected": "linkedin_connected",
      };

      for (const attemptData of attempts) {
        try {
          // Find contact by name to get contactId
          const contacts = await storage.getContacts();
          const contact = contacts.find(
            (c) => c.name.toLowerCase() === attemptData.contactName.toLowerCase(),
          );

          if (!contact) {
            results.failed++;
            results.errors.push(`Contact not found: ${attemptData.contactName}`);
            continue;
          }

          // Map outreach type to valid format
          const rawType = (attemptData.outreachType || "linkedin_connected").toLowerCase().trim();
          const mappedOutreachType = outreachTypeMap[rawType] || "linkedin_connected";

          // Parse dates - handle both datesent/dateresponse and dateSent/responseDate
          const dateSentValue = attemptData.datesent || attemptData.dateSent;
          const responseDateValue = attemptData.dateresponse || attemptData.responseDate;

          // Create attempt with contactId
          const attempt = {
            contactId: contact.id,
            outreachType: mappedOutreachType,
            dateSent: dateSentValue ? new Date(dateSentValue) : new Date(),
            responseDate: responseDateValue ? new Date(responseDateValue) : null,
            campaign: attemptData.campaign || null,
            messageVariantLabel: attemptData.messageVariantLabel || null,
            messageBody: attemptData.messageText || attemptData.messageBody || "",
            responded: attemptData.responded === "true" || attemptData.responded === true,
            positiveResponse: attemptData.positiveResponse === "true" || attemptData.positiveResponse === true,
            meetingBooked: attemptData.meetingBooked === "true" || attemptData.meetingBooked === true,
            converted: attemptData.converted === "true" || attemptData.converted === true,
            notes: attemptData.notes || null,
            companyTier: attemptData.companyTier || null,
            followUpSent: attemptData.followUpSent === "true" || attemptData.followUpSent === true,
            respondedAfterFollowup: attemptData.respondedAfterFollowup === "true" || attemptData.respondedAfterFollowup === true,
          };

          // Calculate daysToResponse if we have both dates and responded
          if (attempt.responded && attempt.dateSent && attempt.responseDate) {
            const sentDate = new Date(attempt.dateSent);
            const respDate = new Date(attempt.responseDate);
            const diffTime = respDate.getTime() - sentDate.getTime();
            (attempt as any).daysToResponse = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
          }

          const validated = insertOutreachAttemptSchema.parse(attempt);
          await storage.createOutreachAttempt(validated);
          results.success++;
        } catch (error) {
          results.failed++;
          results.errors.push(`Failed: ${attemptData.contactName} - ${error}`);
        }
      }

      res.json(results);
    } catch (error) {
      res.status(500).json({ error: "Bulk import failed" });
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
        "Relationship",
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
          (a as any).relationshipType || "cold",
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

  // Proxy endpoint for n8n webhook to avoid CORS issues
  app.post("/api/generate-outreach", async (req, res) => {
    try {
      const response = await fetch("https://n8n.srv1096794.hstgr.cloud/webhook/generate-outreach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req.body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return res.status(response.status).json({ error: errorText || `HTTP ${response.status}` });
      }

      const result = await response.json();
      res.json(result);
    } catch (error: any) {
      console.error("n8n webhook proxy error:", error);
      res.status(500).json({ error: error.message || "Failed to generate outreach" });
    }
  });
  // Proxy endpoint for n8n prospect research workflow
  app.post("/api/prospect-research", async (req, res) => {
    try {
      const { personName, company } = req.body;

      if (!personName || !company) {
        return res.status(400).json({ error: "personName and company are required" });
      }

      const response = await fetch("https://n8n.srv1096794.hstgr.cloud/webhook/prospect-research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personName, company }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return res.status(response.status).json({ error: errorText || `HTTP ${response.status}` });
      }

      const result = await response.json();
      res.json(result);
    } catch (error: any) {
      console.error("Prospect research webhook error:", error);
      res.status(500).json({ error: error.message || "Failed to research prospect" });
    }
  });
  return httpServer;
}
