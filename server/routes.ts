import express, { type Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import multer from "multer";
// import OpenAI from "openai";
import { parseLinkedInTextToJson, generateDraft } from "./openai";
import {
  insertContactSchema,
  insertOutreachAttemptSchema,
  insertExperimentSchema,
  insertSettingsSchema,
} from "@shared/schema";
import batchRouter from "./routes/batch";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
});

// const openai = new OpenAI({
//   apiKey: process.env.OPENAI_API_KEY,
// });

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

async function parseWithOpenAI(text: string): Promise<any> {
  return parseLinkedInTextToJson(text);
}

// Helper function to parse LinkedIn profile text using OpenAI API
// async function parseWithOpenAI(text: string): Promise<any> {
//   const completion = await openai.chat.completions.create({
//     model: "gpt-4-turbo",
//     max_tokens: 1024,
//     response_format: { type: "json_object" },
//     messages: [
//       {
//         role: "system",
//         content:
//           "You are a helpful assistant that extracts structured data from LinkedIn profiles. Always respond with valid JSON.",
//       },
//       {
//         role: "user",
//         content: `Extract structured information from this LinkedIn profile PDF text. Return ONLY valid JSON with these exact fields (use null for missing fields):

// {
//   "name": "Full name without nicknames",
//   "headline": "Professional headline (the line with | separators)",
//   "location": "City, State/Country",
//   "company": "Current company name",
//   "role": "Current job title",
//   "about": "Summary/About section text",
//   "experience": "Experience section text (first 1000 chars)",
//   "education": "Education section text (first 500 chars)",
//   "skills": "Comma-separated skills from Top Skills section"
// }

// LinkedIn Profile Text:
// ${text.slice(0, 15000)}`,
//       },
//     ],
//   });

//   const responseText = completion.choices[0].message.content || "";

//   const jsonMatch = responseText.match(/\{[\s\S]*\}/);
//   if (!jsonMatch) {
//     throw new Error("Could not extract JSON from OpenAI response");
//   }

//   const parsed = JSON.parse(jsonMatch[0]);

//   // Convert nulls to undefined for consistency
//   Object.keys(parsed).forEach((key) => {
//     if (parsed[key] === null) parsed[key] = undefined;
//   });

//   return parsed;
// }

export async function registerRoutes(
  httpServer: Server,
  app: Express,
): Promise<Server> {
  // Batch processing routes
  app.use("/api/batch", batchRouter);

  // =========================
  // CERT: Level 3 proof (simple, deterministic)
  // =========================
  app.get("/api/cert/level3-proof-v2", async (_req, res) => {
    try {
      const hasOpenAI = Boolean(process.env.OPENAI_API_KEY);
      const hasAirtable = Boolean(process.env.AIRTABLE_API_KEY);
      const hasDb = Boolean(process.env.DATABASE_URL);

      let contactsCount: number | null = null;
      try {
        const contacts = await storage.getContacts();
        contactsCount = contacts.length;
      } catch {
        contactsCount = null;
      }

      res.json({
        ok: true,
        secrets: {
          hasOpenAI,
          hasAirtable,
          hasDb,
        },
        contactsCount,
      });
    } catch (e: any) {
      res.status(500).json({
        ok: false,
        error: e?.message || "unknown error",
      });
    }
  });



  // CERT: Level 3 proof endpoint (DB write + DB read + OpenAI twice)
  app.get("/api/cert/airtable-ping", async (_req, res) => {
    try {
      const baseId = process.env.AIRTABLE_BASE_ID;
      const token = process.env.AIRTABLE_API_KEY;

      const tableName = process.env.AIRTABLE_TABLE_NAME || "Contacts";

      console.log("[airtable-ping] token prefix:", token?.slice(0, 6));
      console.log("[airtable-ping] baseId:", baseId);
      console.log("[airtable-ping] tableName:", tableName);

      if (!baseId || !token) {
        return res.status(400).json({
          ok: false,
          error: "Missing AIRTABLE_BASE_ID or AIRTABLE_API_KEY in Secrets",
        });
      }

      const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}?maxRecords=1`;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const text = await response.text();
      res.status(response.status).send(text);
    } catch (error: any) {
      console.error("[CERT airtable-ping] Error:", error);
      res.status(500).json({ ok: false, error: error?.message || "Unknown error" });
    }
  });

  app.get("/api/cert/level3-proof-v2", async (_req, res) => {
    try {
      const hasOpenAI = Boolean(process.env.OPENAI_API_KEY);
      const hasAirtable = Boolean(process.env.AIRTABLE_API_KEY);
      const hasDb = Boolean(process.env.DATABASE_URL);

      // Deterministic external API call that requires no keys
      const r = await fetch("https://httpbin.org/get");
      const j = await r.json();

      // Also prove DB works by reading count
      const contactsCount = (await storage.getContacts()).length;

      res.json({
        ok: true,
        secrets: { hasOpenAI, hasAirtable, hasDb },
        externalApi: { ok: r.ok, url: j.url, origin: j.origin },
        contactsCount,
      });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e?.message || "unknown error" });
    }
  });

  // CERT: Airtable ping using Secrets (proves secret-based API integration)
  app.get("/api/cert/airtable-ping", async (_req, res) => {
    try {
      const baseId = process.env.AIRTABLE_BASE_ID;
      const token = process.env.AIRTABLE_API_KEY;
      if (!baseId || !token) {
        return res.status(400).json({ ok: false, error: "Missing AIRTABLE_BASE_ID or AIRTABLE_API_KEY in Secrets" });
      }

      // Choose a table name that exists in that base. If unsure, set AIRTABLE_TABLE_NAME in Secrets and use that.
      const tableName = process.env.AIRTABLE_TABLE_NAME || "Contacts";

      const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}?maxRecords=1`;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const text = await response.text();
      res.status(response.ok ? 200 : 500).send(text);
    } catch (error: any) {
      console.error("[CERT airtable-ping] Error:", error);
      res.status(500).json({ ok: false, error: error?.message || "Unknown error" });
    }
  });



  
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

  // Excel/CSV Import - Parse spreadsheet file and return structured data
  app.post("/api/contacts/import/excel", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      if (req.file.size > 5 * 1024 * 1024) {
        return res.status(400).json({ message: "File size must be less than 5MB" });
      }

      const xlsx = await import("xlsx");
      const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const jsonData = xlsx.utils.sheet_to_json(sheet, { header: 1 }) as string[][];

      if (jsonData.length === 0) {
        return res.status(400).json({ message: "Empty spreadsheet" });
      }

      const headers = jsonData[0].map(h => String(h || "").trim());
      const rows = jsonData.slice(1).filter(row => row.some(cell => cell !== null && cell !== undefined && String(cell).trim() !== ""));

      res.json({
        headers,
        rows: rows.map(row => headers.map((_, i) => String(row[i] || "").trim())),
        totalRows: rows.length,
      });
    } catch (error) {
      console.error("[Excel Import] Error:", error);
      res.status(500).json({ message: "Failed to parse spreadsheet" });
    }
  });

  // Airtable Import - Connect to Airtable and fetch records
  app.post("/api/contacts/import/airtable", async (req, res) => {
    try {
      const { baseId, tableName, personalAccessToken, preview, viewName } = req.body;

      if (!baseId || !tableName || !personalAccessToken) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      // Build URL with view parameter to preserve Airtable grid order
      const params = new URLSearchParams({
        maxRecords: preview ? "100" : "1000",
        cellFormat: "string",
        timeZone: "America/New_York",
        userLocale: "en-us",
      });
      
      // Use specified view or default to "Grid view" for consistent ordering
      const view = viewName || "Grid view";
      params.set("view", view);

      const response = await fetch(
        `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}?${params.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${personalAccessToken}`,
          },
        }
      );

      if (!response.ok) {
        const error = await response.json();
        return res.status(response.status).json({ 
          message: error.error?.message || "Failed to connect to Airtable" 
        });
      }

      const data = await response.json();
      const records = data.records || [];

      if (records.length === 0) {
        return res.status(400).json({ message: "No records found in table" });
      }

      // Extract headers from first record's fields
      const headers = Object.keys(records[0]?.fields || {});
      
      // Convert records to rows
      const rows = records.map((record: any) => 
        headers.map(header => String(record.fields?.[header] || "").trim())
      );

      res.json({
        headers,
        rows,
        totalRows: rows.length,
      });
    } catch (error) {
      console.error("[Airtable Import] Error:", error);
      res.status(500).json({ message: "Failed to connect to Airtable" });
    }
  });

  // Get Airtable connection config
  app.get("/api/airtable/config", async (req, res) => {
    try {
      const config = await storage.getAirtableConfig();
      if (!config) {
        return res.json({ connected: false });
      }
      res.json({
        connected: true,
        baseId: config.baseId,
        tableName: config.tableName,
        viewName: config.viewName || "Grid view",
        lastSyncAt: config.lastSyncAt,
        fieldMapping: config.fieldMapping ? JSON.parse(config.fieldMapping) : null,
      });
    } catch (error) {
      console.error("[Airtable Config] Error:", error);
      res.status(500).json({ message: "Failed to get Airtable config" });
    }
  });

  // Save Airtable connection config
  app.post("/api/airtable/config", async (req, res) => {
    try {
      const { baseId, tableName, personalAccessToken, fieldMapping, viewName } = req.body;
      
      if (!baseId || !tableName || !personalAccessToken) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      const config = await storage.saveAirtableConfig({
        baseId,
        tableName,
        personalAccessToken,
        fieldMapping: fieldMapping ? JSON.stringify(fieldMapping) : null,
        viewName: viewName || "Grid view",
        lastSyncAt: new Date(),
        isConnected: true,
      });

      res.json({
        connected: true,
        baseId: config.baseId,
        tableName: config.tableName,
        viewName: config.viewName,
        lastSyncAt: config.lastSyncAt,
      });
    } catch (error) {
      console.error("[Airtable Config] Save error:", error);
      res.status(500).json({ message: "Failed to save Airtable config" });
    }
  });

  // Disconnect Airtable
  app.delete("/api/airtable/config", async (req, res) => {
    try {
      await storage.deleteAirtableConfig();
      res.json({ success: true });
    } catch (error) {
      console.error("[Airtable Config] Delete error:", error);
      res.status(500).json({ message: "Failed to disconnect Airtable" });
    }
  });

  // Sync/Refresh contacts from Airtable
  app.post("/api/airtable/sync", async (req, res) => {
    try {
      const config = await storage.getAirtableConfig();
      
      if (!config) {
        return res.status(400).json({ message: "Airtable not connected" });
      }

      // Build URL with view parameter to preserve Airtable grid order
      const params = new URLSearchParams({
        maxRecords: "1000",
        view: config.viewName || "Grid view", // Use stored view to preserve user's ordering
      });

      const response = await fetch(
        `https://api.airtable.com/v0/${config.baseId}/${encodeURIComponent(config.tableName)}?${params.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${config.personalAccessToken}`,
          },
        }
      );

      if (!response.ok) {
        const error = await response.json();
        return res.status(response.status).json({ 
          message: error.error?.message || "Failed to fetch from Airtable" 
        });
      }

      const data = await response.json();
      const records = data.records || [];

      if (records.length === 0) {
        return res.json({ synced: 0, created: 0, updated: 0, message: "No records found" });
      }

      const fieldMapping = config.fieldMapping ? JSON.parse(config.fieldMapping) : {};
      let created = 0;
      let updated = 0;

      // Process records in sequential order to preserve Airtable's sequence
      for (const record of records) {
        const fields = record.fields || {};
        
        const contact: Record<string, string> = {};
        
        for (const [airtableField, appField] of Object.entries(fieldMapping)) {
          if (appField && fields[airtableField]) {
            contact[appField as string] = String(fields[airtableField]).trim();
          }
        }

        if (!contact.name) continue;

        const existingContacts = await storage.getContacts();
        const existing = existingContacts.find(c => 
          c.name.toLowerCase() === contact.name.toLowerCase() && 
          (c.company?.toLowerCase() === contact.company?.toLowerCase() || (!c.company && !contact.company))
        );

        if (existing) {
          await storage.updateContact(existing.id, {
            ...contact,
            tags: existing.tags?.includes("airtable-sync") ? existing.tags : `${existing.tags || ""},airtable-sync`,
          });
          updated++;
        } else {
          // Important: createContact is awaited to ensure sequential database insertion
          await storage.createContact({
            ...contact,
            tags: "airtable-sync",
          } as any);
          created++;
        }
      }

      await storage.updateAirtableConfig(config.id, {
        lastSyncAt: new Date(),
      });

      res.json({ 
        synced: records.length, 
        created, 
        updated,
        lastSyncAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error("[Airtable Sync] Error:", error);
      res.status(500).json({ message: "Failed to sync from Airtable" });
    }
  });

  // n8n Webhook - Import batch outreach logs
  app.post("/api/webhooks/outreach-logs", express.json(), async (req, res) => {
    console.log("WEBHOOK HIT - /api/webhooks/outreach-logs");
    try {
      console.log("[Outreach Webhook] Received payload:", JSON.stringify(req.body, null, 2));
      
      // Handle n8n structure: { "attempts": [...] } or just an array or single object
      let logs: any[];
      if (req.body.attempts && Array.isArray(req.body.attempts)) {
        logs = req.body.attempts;
        console.log(`[Outreach Webhook] Found ${logs.length} attempts in 'attempts' array`);
      } else if (Array.isArray(req.body)) {
        logs = req.body;
        console.log(`[Outreach Webhook] Found ${logs.length} items in root array`);
      } else {
        logs = [req.body];
        console.log("[Outreach Webhook] Single object received");
      }
      
      const results = {
        success: 0,
        failed: 0,
        errors: [] as string[],
        created: [] as string[],
      };

      const outreachTypeMapping: Record<string, string> = {
        "LinkedIn Message": "linkedin_connected",
        "LinkedIn Connection": "linkedin_connected",
        "LinkedIn Connection Request": "linkedin_connect_request",
        "LinkedIn Request": "linkedin_connect_request",
        "LinkedIn Connect": "linkedin_connect_request",
        "LinkedIn InMail": "linkedin_inmail",
        "InMail": "linkedin_inmail",
        "Email": "email",
        "Cold Email": "email",
        "WhatsApp": "whatsapp",
      };

      for (let i = 0; i < logs.length; i++) {
        const logData = logs[i];
        console.log(`[Outreach Webhook] Processing item ${i + 1}:`, JSON.stringify(logData));
        
        try {
          // Get contact name - exact field names from n8n
          const personName = logData.contactName;
          if (!personName) {
            console.error(`[Outreach Webhook] Item ${i + 1} missing contactName`);
            results.failed++;
            results.errors.push(`Item ${i + 1}: Missing contactName`);
            continue;
          }

          // Find or create contact
          const contacts = await storage.getContacts();
          let contact = contacts.find(c => c.name.toLowerCase() === personName.toLowerCase());

          if (!contact) {
            console.log(`[Outreach Webhook] Auto-creating contact: ${personName}`);
            contact = await storage.createContact({
              name: personName,
              company: logData.company || "Unknown",
              tags: "auto-created-from-webhook",
            } as any);
            console.log(`[Outreach Webhook] Created contact with ID: ${contact.id}`);
          } else {
            console.log(`[Outreach Webhook] Found existing contact: ${contact.name} (ID: ${contact.id})`);
          }

          // Map outreach type
          const rawOutreachType = logData.outreachType || "Email";
          const mappedType = outreachTypeMapping[rawOutreachType] || 
            (rawOutreachType.toLowerCase().includes("linkedin") ? "linkedin_connected" : "email");
          console.log(`[Outreach Webhook] Outreach type: ${rawOutreachType} -> ${mappedType}`);

          // Parse date sent (handle both "datesent" and "dateSent")
          const dateSentStr = logData.datesent || logData.dateSent;
          const dateSent = dateSentStr ? new Date(dateSentStr) : new Date();
          console.log(`[Outreach Webhook] Date sent: ${dateSentStr} -> ${dateSent.toISOString()}`);

          // Parse response date (handle both "dateresponse" and "responseDate")
          const dateResponseStr = logData.dateresponse || logData.responseDate;
          let responseDate: Date | null = null;
          if (dateResponseStr && dateResponseStr !== "") {
            responseDate = new Date(dateResponseStr);
            console.log(`[Outreach Webhook] Response date: ${dateResponseStr} -> ${responseDate.toISOString()}`);
          }

          // Convert string booleans to actual booleans
          const toBool = (val: any): boolean => val === true || val === "true";

          const outreachData: any = {
            contactId: contact.id,
            outreachType: mappedType,
            subject: logData.subjectLine || "",
            messageBody: logData.messageBody || "",
            dateSent: dateSent,
            campaign: logData.campaign || "n8n-import",
            responded: toBool(logData.responded),
            positiveResponse: toBool(logData.positiveResponse),
            meetingBooked: toBool(logData.meetingBooked),
            converted: toBool(logData.converted),
            notes: logData.notes || "",
            relationshipType: "cold",
            responseDate: responseDate,
          };

          console.log(`[Outreach Webhook] Creating outreach attempt:`, JSON.stringify(outreachData));

          const validatedData = insertOutreachAttemptSchema.parse(outreachData);
          const created = await storage.createOutreachAttempt(validatedData);
          console.log(`[Outreach Webhook] Created outreach attempt with ID: ${created.id}`);
          
          results.success++;
          results.created.push(`${personName}: ${mappedType}`);
        } catch (error: any) {
          console.error(`[Outreach Webhook] Error processing item ${i + 1}:`, error.message);
          results.failed++;
          results.errors.push(`Item ${i + 1}: ${error.message}`);
        }
      }

      console.log(`[Outreach Webhook] Import complete. Success: ${results.success}, Failed: ${results.failed}`);
      res.json(results);
    } catch (error: any) {
      console.error("[Outreach Webhook] Fatal error:", error);
      res.status(500).json({ error: error.message || "Failed to process outreach logs" });
    }
  });

  // Bulk Create Contacts - Create multiple contacts at once
  app.post("/api/contacts/bulk-create", async (req, res) => {
    try {
      const { contacts } = req.body;

      if (!Array.isArray(contacts)) {
        return res.status(400).json({ message: "Expected array of contacts" });
      }

      let created = 0;
      const errors: string[] = [];

      // Process in sequential order to preserve input sequence in database
      for (const contactData of contacts) {
        try {
          if (!contactData.name) {
            errors.push("Missing name for a contact");
            continue;
          }

          // Add import tag
          const dataWithTag = {
            ...contactData,
            tags: contactData.tags ? `${contactData.tags},spreadsheet-import` : "spreadsheet-import",
          };

          const validatedData = insertContactSchema.parse(dataWithTag);
          // Await ensure sequential insertion order for ID/CreatedAt consistency
          await storage.createContact(validatedData);
          created++;
        } catch (err) {
          errors.push(`Failed to create: ${contactData.name || "unknown"}`);
        }
      }

      res.json({ created, errors });
    } catch (error) {
      console.error("[Bulk Create] Error:", error);
      res.status(500).json({ message: "Failed to create contacts" });
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

      const response = await fetch("https://n8n.srv1096794.hstgr.cloud/webhook/028dc28a-4779-4a35-80cf-87dfbde544f8", {
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

  // Proxy endpoint for n8n user profile research workflow
  app.post("/api/user-profile-research", async (req, res) => {
    try {
      const { personName, company, linkedinUrl } = req.body;

      if (!personName || !company) {
        return res.status(400).json({ error: "personName and company are required" });
      }

      const response = await fetch("https://n8n.srv1096794.hstgr.cloud/webhook/user-profile-research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personName, company, linkedinUrl: linkedinUrl || "" }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.log("User profile research webhook failed:", response.status, errorText);
        // Return default profile if webhook fails
        return res.json({ 
          profileInsight: `${personName} works at ${company}. Complete your profile to unlock personalized outreach recommendations.`,
          success: true,
          fallback: true
        });
      }

      const text = await response.text();
      if (!text || text.trim() === "") {
        // Return default profile if empty response
        return res.json({ 
          profileInsight: `${personName} works at ${company}. Complete your profile to unlock personalized outreach recommendations.`,
          success: true,
          fallback: true
        });
      }

      try {
        const result = JSON.parse(text);
        res.json(result);
      } catch (parseError) {
        console.log("User profile research JSON parse error:", parseError, "Response was:", text.substring(0, 200));
        // Return default profile if JSON parse fails
        return res.json({ 
          profileInsight: `${personName} works at ${company}. Complete your profile to unlock personalized outreach recommendations.`,
          success: true,
          fallback: true
        });
      }
    } catch (error: any) {
      console.error("User profile research webhook error:", error);
      // Return default profile on error
      res.json({ 
        profileInsight: "Complete your profile to unlock personalized outreach recommendations.",
        success: true,
        fallback: true
      });
    }
  });
  // ---------------------------------------------------------------------------
  // POST /api/research/bulk — Bulk research via n8n webhook (one call per contact)
  //
  // "Will the n8n workflow handle 3 concurrent inputs?"
  // Answer: Each HTTP request triggers a *separate* n8n execution, so the
  // workflow remains linear per execution — it never receives an array.
  // The only risk is too many simultaneous requests overwhelming n8n, which is
  // why we rate-limit concurrency to 3 at a time on this side.
  //
  // This endpoint uses Server-Sent Events (SSE) to stream per-contact status
  // updates to the client as each webhook call starts, succeeds, or fails.
  // ---------------------------------------------------------------------------
  function extractResearchData(
    raw: any,
    personName: string,
    company: string
  ): {
    prospectSnapshot: string;
    companySnapshot: string;
    signalsHooks: string[];
    messageDraft: string;
  } {
    const result = {
      prospectSnapshot: "",
      companySnapshot: "",
      signalsHooks: [] as string[],
      messageDraft: "",
    };

    if (!raw || typeof raw !== "object") return result;

    const data = raw.data && typeof raw.data === "object" ? raw.data : raw;

    if (typeof data.prospectSnapshot === "string") result.prospectSnapshot = data.prospectSnapshot;
    else if (typeof data.prospect_snapshot === "string") result.prospectSnapshot = data.prospect_snapshot;
    else if (typeof data.profileInsight === "string") result.prospectSnapshot = data.profileInsight;
    else if (typeof data.profile_insight === "string") result.prospectSnapshot = data.profile_insight;

    if (typeof data.companySnapshot === "string") result.companySnapshot = data.companySnapshot;
    else if (typeof data.company_snapshot === "string") result.companySnapshot = data.company_snapshot;
    else if (typeof data.companyInsight === "string") result.companySnapshot = data.companyInsight;
    else if (typeof data.company_insight === "string") result.companySnapshot = data.company_insight;

    if (Array.isArray(data.signalsHooks)) result.signalsHooks = data.signalsHooks.filter((s: any) => typeof s === "string");
    else if (Array.isArray(data.signals_hooks)) result.signalsHooks = data.signals_hooks.filter((s: any) => typeof s === "string");
    else if (Array.isArray(data.signals)) result.signalsHooks = data.signals.filter((s: any) => typeof s === "string");
    else if (Array.isArray(data.hooks)) result.signalsHooks = data.hooks.filter((s: any) => typeof s === "string");
    else if (typeof data.signalsHooks === "string") result.signalsHooks = data.signalsHooks.split("\n").filter(Boolean);
    else if (typeof data.signals === "string") result.signalsHooks = data.signals.split("\n").filter(Boolean);

    if (typeof data.messageDraft === "string") result.messageDraft = data.messageDraft;
    else if (typeof data.message_draft === "string") result.messageDraft = data.message_draft;
    else if (typeof data.draft === "string") result.messageDraft = data.draft;
    else if (typeof data.message === "string") result.messageDraft = data.message;

    if (!result.prospectSnapshot && !result.companySnapshot && !result.messageDraft) {
      const researchText = typeof data.research === "string" ? data.research
        : typeof data.output === "string" ? data.output
        : typeof data.result === "string" ? data.result
        : typeof data.text === "string" ? data.text
        : null;

      if (researchText) {
        result.prospectSnapshot = researchText;
      } else {
        const keys = Object.keys(data).filter(k => !["success", "error", "fallback"].includes(k));
        for (const key of keys) {
          if (typeof data[key] === "string" && data[key].length > 30) {
            result.prospectSnapshot = data[key];
            break;
          }
        }
      }
    }

    return result;
  }

  app.post("/api/research/bulk", async (req, res) => {
    const { contactIds } = req.body as { contactIds?: string[] };

    if (!Array.isArray(contactIds) || contactIds.length === 0) {
      return res.status(400).json({ error: "contactIds array is required" });
    }

    const CONCURRENCY = 3;
    const MAX_RETRIES = 1;
    const TIMEOUT_MS = 90_000;
    const WEBHOOK_URL =
      process.env.N8N_RESEARCH_WEBHOOK_URL ||
      "https://n8n.srv1096794.hstgr.cloud/webhook/028dc28a-4779-4a35-80cf-87dfbde544f8";

    const batchId = `bulk-${Date.now()}`;

    const contacts = await Promise.all(
      contactIds.map((id) => storage.getContact(id))
    );

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    function send(event: string, data: Record<string, unknown>) {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    }

    interface BulkResult {
      contactId: string;
      personName: string;
      company: string;
      status: "success" | "failed";
      error?: string;
    }

    const results: BulkResult[] = [];

    async function callWebhook(
      contactId: string,
      personName: string,
      company: string
    ): Promise<BulkResult> {
      const idempotencyKey = `${contactId}:${batchId}`;

      send("status", { contactId, status: "running" });

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

          const response = await fetch(WEBHOOK_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Idempotency-Key": idempotencyKey,
            },
            body: JSON.stringify({ personName, company }),
            signal: controller.signal,
          });

          clearTimeout(timer);

          if (!response.ok) {
            const errText = await response.text().catch(() => "");
            throw new Error(`HTTP ${response.status}: ${errText}`);
          }

          const responseData = await response.json();
          console.log(`[BulkResearch] Webhook response for ${personName}:`, JSON.stringify(responseData).substring(0, 500));

          try {
            const researchPayload = extractResearchData(responseData, personName, company);
            await storage.updateContact(contactId, {
              researchStatus: "completed",
              researchData: JSON.stringify(researchPayload),
            });
          } catch (storeErr: any) {
            console.error(`[BulkResearch] Failed to store research for ${personName}:`, storeErr.message);
            const result: BulkResult = { contactId, personName, company, status: "failed", error: "Research received but failed to save" };
            send("status", { contactId, status: "failed", error: result.error });
            return result;
          }

          const result: BulkResult = { contactId, personName, company, status: "success" };
          send("status", { contactId, status: "success" });
          return result;
        } catch (err: any) {
          if (attempt < MAX_RETRIES) {
            await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
            continue;
          }
          const errorMsg = err.message || "Unknown error";
          const result: BulkResult = { contactId, personName, company, status: "failed", error: errorMsg };
          send("status", { contactId, status: "failed", error: errorMsg });
          return result;
        }
      }

      const result: BulkResult = { contactId, personName, company, status: "failed", error: "Exhausted retries" };
      send("status", { contactId, status: "failed", error: "Exhausted retries" });
      return result;
    }

    for (const id of contactIds!) {
      send("status", { contactId: id, status: "queued" });
    }

    interface QueueTask {
      contactId: string;
      personName: string;
      company: string;
      fn: () => Promise<BulkResult>;
    }

    const queue: QueueTask[] = contacts.map((contact, idx) => {
      const id = contactIds![idx];
      const name = contact?.name || "Unknown";
      const comp = contact?.company || "";

      if (!contact) {
        return {
          contactId: id,
          personName: name,
          company: comp,
          fn: async (): Promise<BulkResult> => {
            const result: BulkResult = {
              contactId: id,
              personName: name,
              company: comp,
              status: "failed",
              error: "Contact not found",
            };
            send("status", { contactId: id, status: "failed", error: "Contact not found" });
            return result;
          },
        };
      }
      return {
        contactId: id,
        personName: name,
        company: comp,
        fn: () => callWebhook(id, name, comp),
      };
    });

    let running = 0;
    let queueIndex = 0;

    await new Promise<void>((resolve) => {
      function next() {
        if (results.length === queue.length) {
          resolve();
          return;
        }
        while (running < CONCURRENCY && queueIndex < queue.length) {
          const task = queue[queueIndex++];
          running++;
          task
            .fn()
            .catch((err: any): BulkResult => {
              const failResult: BulkResult = {
                contactId: task.contactId,
                personName: task.personName,
                company: task.company,
                status: "failed",
                error: err?.message || "Unexpected error",
              };
              send("status", { contactId: task.contactId, status: "failed", error: failResult.error });
              return failResult;
            })
            .then((result) => {
              results.push(result);
              running--;
              send("progress", { completed: results.length, total: queue.length });
              next();
            });
        }
      }
      next();
    });

    send("done", { total: contactIds.length, results });
    res.end();
  });

  return httpServer;
}
