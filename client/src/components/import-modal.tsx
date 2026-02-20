import { useState, useCallback, useRef, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useContacts } from "@/hooks/useContacts";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Upload, Loader2, CheckCircle2, AlertCircle, FileSpreadsheet, Database, GripVertical } from "lucide-react";

interface ImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

interface ParsedData {
  headers: string[];
  rows: string[][];
  totalRows: number;
}

interface FieldMapping {
  [key: string]: string;
}

const EXPECTED_FIELDS = [
  { key: "name", label: "Name", required: true },
  { key: "company", label: "Company Name", required: false },
  { key: "email", label: "Email", required: false },
  { key: "linkedinUrl", label: "LinkedIn URL", required: false },
  { key: "role", label: "Role", required: false },
  { key: "notes", label: "Notes", required: false },
];

export function ImportModal({ open, onOpenChange, onSuccess }: ImportModalProps) {
  const { toast } = useToast();
  const { bulkCreate } = useContacts();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [modalSize, setModalSize] = useState({ width: 0, height: 0 });
  const [isResizing, setIsResizing] = useState(false);
  const resizeRef = useRef<{ startX: number; startY: number; startWidth: number; startHeight: number } | null>(null);

  const [activeTab, setActiveTab] = useState("excel");
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ParsedData | null>(null);
  const [fieldMapping, setFieldMapping] = useState<FieldMapping>({});
  const [parseError, setParseError] = useState<string | null>(null);

  const [airtableBaseId, setAirtableBaseId] = useState("");
  const [airtableTableName, setAirtableTableName] = useState("");
  const [airtableToken, setAirtableToken] = useState("");
  const [airtableData, setAirtableData] = useState<ParsedData | null>(null);
  const [airtableFieldMapping, setAirtableFieldMapping] = useState<FieldMapping>({});
  const [airtableConnected, setAirtableConnected] = useState(false);

  useEffect(() => {
    if (open && modalSize.width === 0) {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      setModalSize({
        width: Math.min(Math.max(vw * 0.85, 600), 1400),
        height: Math.min(Math.max(vh * 0.85, 400), 900),
      });
    }
  }, [open, modalSize.width]);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    if (!dialogRef.current) return;
    
    const rect = dialogRef.current.getBoundingClientRect();
    resizeRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startWidth: rect.width,
      startHeight: rect.height,
    };
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!resizeRef.current) return;
      
      const deltaX = e.clientX - resizeRef.current.startX;
      const deltaY = e.clientY - resizeRef.current.startY;
      
      const newWidth = Math.max(600, Math.min(resizeRef.current.startWidth + deltaX, window.innerWidth * 0.95));
      const newHeight = Math.max(400, Math.min(resizeRef.current.startHeight + deltaY, window.innerHeight * 0.95));
      
      setModalSize({ width: newWidth, height: newHeight });
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      resizeRef.current = null;
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

  const parseExcelMutation = useMutation({
    mutationFn: async (file: File) => {
      const xlsx = await import("xlsx");
      const data = await file.arrayBuffer();
      const workbook = xlsx.read(data, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const jsonData = xlsx.utils.sheet_to_json(sheet, { header: 1 }) as string[][];
      if (jsonData.length === 0) throw new Error("Empty spreadsheet");
      const headers = jsonData[0].map((h) => String(h || "").trim());
      const rows = jsonData
        .slice(1)
        .filter((row) => row.some((cell) => cell !== null && cell !== undefined && String(cell).trim() !== ""))
        .map((row) => headers.map((_, i) => String(row[i] || "").trim()));
      return { headers, rows, totalRows: rows.length };
    },
    onSuccess: (data) => {
      setParsedData(data);
      setParseError(null);
      autoMapFields(data.headers);
    },
    onError: (error: Error) => {
      setParseError(error.message);
      setParsedData(null);
    },
  });

  const testAirtableMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/contacts/import/airtable", {
        baseId: airtableBaseId,
        tableName: airtableTableName,
        personalAccessToken: airtableToken,
        preview: true,
      });
      return response.json();
    },
    onSuccess: (data) => {
      setAirtableData(data);
      setAirtableConnected(true);
      autoMapFields(data.headers, true);
      toast({ title: "Connected to Airtable" });
    },
    onError: (error: Error) => {
      toast({ title: "Connection failed", description: error.message, variant: "destructive" });
      setAirtableConnected(false);
      setAirtableData(null);
    },
  });

  const [isImporting, setIsImporting] = useState(false);

  const runBulkCreate = async (contactsToImport: Record<string, string>[]) => {
    const mapped = contactsToImport.map((c) => ({
      name: c.name || "",
      company: c.company ?? null,
      role: c.role ?? null,
      email: c.email ?? null,
      linkedinUrl: c.linkedinUrl ?? null,
      headline: null,
      about: null,
      location: null,
      experience: null,
      education: null,
      skills: null,
      keywords: null,
      notes: c.notes ?? null,
      tags: null,
      researchStatus: null,
      researchData: null,
    }));
    await bulkCreate(mapped);
    toast({ title: `${mapped.length} contacts imported successfully` });
    resetState();
    onSuccess();
  };

  const autoMapFields = (headers: string[], isAirtable = false) => {
    const mapping: FieldMapping = {};
    const lowerHeaders = headers.map(h => h.toLowerCase());

    EXPECTED_FIELDS.forEach(field => {
      const matchIndex = lowerHeaders.findIndex(h => 
        h.includes(field.key.toLowerCase()) || 
        h.includes(field.label.toLowerCase()) ||
        (field.key === "name" && (h.includes("full name") || h === "name")) ||
        (field.key === "linkedinUrl" && (h.includes("linkedin") || h.includes("url"))) ||
        (field.key === "role" && (h.includes("title") || h.includes("position") || h.includes("job")))
      );
      if (matchIndex !== -1) {
        mapping[headers[matchIndex]] = field.key;
      }
    });

    if (isAirtable) {
      setAirtableFieldMapping(mapping);
    } else {
      setFieldMapping(mapping);
    }
  };

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      const validTypes = [
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-excel",
        "text/csv",
      ];
      if (!validTypes.includes(selectedFile.type) && 
          !selectedFile.name.endsWith(".xlsx") && 
          !selectedFile.name.endsWith(".xls") && 
          !selectedFile.name.endsWith(".csv")) {
        setParseError("Please upload an Excel (.xlsx, .xls) or CSV file");
        return;
      }
      if (selectedFile.size > 5 * 1024 * 1024) {
        setParseError("File size must be less than 5MB");
        return;
      }
      setFile(selectedFile);
      setParseError(null);
      parseExcelMutation.mutate(selectedFile);
    }
  }, []);

  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      const input = document.createElement("input");
      input.type = "file";
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(droppedFile);
      const event = { target: { files: dataTransfer.files } } as unknown as React.ChangeEvent<HTMLInputElement>;
      handleFileChange(event);
    }
  }, [handleFileChange]);

  const handleImportExcel = async () => {
    if (!parsedData) return;
    
    const contactsToImport = parsedData.rows.map(row => {
      const contact: Record<string, string> = {};
      parsedData.headers.forEach((header, index) => {
        const mappedField = fieldMapping[header];
        if (mappedField && row[index]) {
          contact[mappedField] = row[index];
        }
      });
      return contact;
    }).filter(c => c.name);

    if (contactsToImport.length === 0) {
      toast({ title: "No valid contacts found", description: "Make sure the Name field is mapped", variant: "destructive" });
      return;
    }

    setIsImporting(true);
    try {
      await runBulkCreate(contactsToImport);
    } catch (error) {
      toast({ title: "Import failed", description: (error as Error).message, variant: "destructive" });
    } finally {
      setIsImporting(false);
    }
  };

  const handleImportAirtable = async () => {
    if (!airtableData || !airtableConnected) return;
    
    const contactsToImport = airtableData.rows.map(row => {
      const contact: Record<string, string> = {};
      airtableData.headers.forEach((header, index) => {
        const mappedField = airtableFieldMapping[header];
        if (mappedField && row[index]) {
          contact[mappedField] = row[index];
        }
      });
      return contact;
    }).filter(c => c.name);

    if (contactsToImport.length === 0) {
      toast({ title: "No valid contacts found", description: "Make sure the Name field is mapped", variant: "destructive" });
      return;
    }

    setIsImporting(true);
    try {
      const configToSave = {
        baseId: airtableBaseId,
        tableName: airtableTableName,
        personalAccessToken: airtableToken,
        fieldMapping: airtableFieldMapping,
        viewName: "Grid view",
      };
      await apiRequest("POST", "/api/airtable/config", configToSave);
    } catch {
      toast({ title: "Warning", description: "Could not save Airtable connection, importing contacts anyway", variant: "destructive" });
    }
    try {
      await runBulkCreate(contactsToImport);
    } catch (error) {
      toast({ title: "Import failed", description: (error as Error).message, variant: "destructive" });
    } finally {
      setIsImporting(false);
    }
  };

  const resetState = () => {
    setFile(null);
    setParsedData(null);
    setFieldMapping({});
    setParseError(null);
    setAirtableBaseId("");
    setAirtableTableName("");
    setAirtableToken("");
    setAirtableData(null);
    setAirtableFieldMapping({});
    setAirtableConnected(false);
  };

  const getDisplayHeader = (header: string) => {
    const headerMap: Record<string, string> = {
      "Account": "Company Name",
      "Accounts": "Company Name",
    };
    return headerMap[header] || header;
  };

  const renderFieldMappingUI = (
    headers: string[], 
    mapping: FieldMapping, 
    setMapping: (m: FieldMapping) => void
  ) => (
    <div className="space-y-3 mt-4">
      <Label className="text-sm font-medium">Map columns to fields</Label>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {headers.map(header => (
          <div 
            key={header} 
            className="flex flex-col sm:flex-row items-start sm:items-center gap-2 p-3 rounded-md border bg-muted/30"
          >
            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium truncate block" title={getDisplayHeader(header)}>
                {getDisplayHeader(header)}
              </span>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <span className="text-muted-foreground hidden sm:inline">→</span>
              <Select
                value={mapping[header] || "skip"}
                onValueChange={(value) => {
                  setMapping({ ...mapping, [header]: value === "skip" ? "" : value });
                }}
              >
                <SelectTrigger className="w-full sm:w-36" data-testid={`select-mapping-${header}`}>
                  <SelectValue placeholder="Skip" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="skip">Skip</SelectItem>
                  {EXPECTED_FIELDS.map(field => (
                    <SelectItem key={field.key} value={field.key}>
                      {field.label} {field.required && "*"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderPreviewTable = (data: ParsedData) => (
    <div className="border rounded-md overflow-hidden">
      <div className="text-sm text-muted-foreground p-2 bg-muted/50 flex items-center justify-between">
        <span>Preview (first 5 rows of {data.totalRows})</span>
        <span className="text-xs">{data.headers.length} columns</span>
      </div>
      <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
        <Table>
          <TableHeader className="sticky top-0 bg-background z-10">
            <TableRow>
              {data.headers.map((header, i) => (
                <TableHead key={i} className="whitespace-nowrap font-medium">
                  {getDisplayHeader(header)}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.rows.slice(0, 5).map((row, i) => (
              <TableRow key={i}>
                {row.map((cell, j) => (
                  <TableCell key={j} className="whitespace-nowrap max-w-[250px] truncate">
                    {cell}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen) resetState();
      onOpenChange(isOpen);
    }}>
      <DialogContent 
        ref={dialogRef}
        className="flex flex-col p-0 gap-0"
        style={{
          width: modalSize.width > 0 ? `${modalSize.width}px` : "85vw",
          maxWidth: "1400px",
          height: modalSize.height > 0 ? `${modalSize.height}px` : "85vh",
          maxHeight: "90vh",
          minWidth: "600px",
          minHeight: "400px",
        }}
      >
        <DialogHeader className="p-6 pb-4 border-b shrink-0">
          <DialogTitle>Import Contacts</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-1 min-h-0">
            <div className="px-6 pt-4 shrink-0">
              <TabsList className="grid w-full grid-cols-2 max-w-md">
                <TabsTrigger value="excel" data-testid="tab-excel-upload">
                  <FileSpreadsheet className="w-4 h-4 mr-2" />
                  Excel Upload
                </TabsTrigger>
                <TabsTrigger value="airtable" data-testid="tab-airtable">
                  <Database className="w-4 h-4 mr-2" />
                  Airtable Connection
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="excel" className="flex-1 overflow-auto px-6 py-4 space-y-4 m-0 min-h-0">
              <div
                className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                  parseExcelMutation.isPending ? "border-primary/50 bg-primary/5" : "border-border hover:border-primary/50"
                }`}
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleFileDrop}
              >
                {parseExcelMutation.isPending ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">Parsing file...</p>
                  </div>
                ) : file ? (
                  <div className="flex flex-col items-center gap-2">
                    <CheckCircle2 className="w-8 h-8 text-green-500" />
                    <p className="font-medium">{file.name}</p>
                    <Button variant="ghost" size="sm" onClick={() => { setFile(null); setParsedData(null); }}>
                      Choose different file
                    </Button>
                  </div>
                ) : (
                  <label className="cursor-pointer flex flex-col items-center gap-2">
                    <Upload className="w-8 h-8 text-muted-foreground" />
                    <p className="font-medium">Drop file here or click to upload</p>
                    <p className="text-sm text-muted-foreground">Accepts .xlsx, .xls, .csv (max 5MB)</p>
                    <input
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      className="hidden"
                      onChange={handleFileChange}
                      data-testid="input-file-upload"
                    />
                  </label>
                )}
              </div>

              {parseError && (
                <div className="flex items-center gap-2 text-destructive text-sm">
                  <AlertCircle className="w-4 h-4" />
                  {parseError}
                </div>
              )}

              {!parsedData && (
                <div className="text-sm text-muted-foreground">
                  <strong>Expected columns:</strong> Name, Company, Email (optional), LinkedIn URL (optional), Role (optional), Notes (optional)
                </div>
              )}

              {parsedData && (
                <>
                  {renderPreviewTable(parsedData)}
                  {renderFieldMappingUI(parsedData.headers, fieldMapping, setFieldMapping)}
                </>
              )}
            </TabsContent>

            <TabsContent value="airtable" className="flex-1 overflow-auto px-6 py-4 space-y-4 m-0 min-h-0">
              {!airtableData ? (
                <div className="space-y-4 max-w-lg">
                  <div className="space-y-2">
                    <Label htmlFor="airtable-base-id">Airtable Base ID</Label>
                    <Input
                      id="airtable-base-id"
                      placeholder="appXXXXXXXXXXXXXX"
                      value={airtableBaseId}
                      onChange={(e) => setAirtableBaseId(e.target.value)}
                      data-testid="input-airtable-base-id"
                    />
                    <p className="text-xs text-muted-foreground">Found in your base URL after airtable.com/</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="airtable-table-name">Table Name</Label>
                    <Input
                      id="airtable-table-name"
                      placeholder="e.g., Prospects or Contacts"
                      value={airtableTableName}
                      onChange={(e) => setAirtableTableName(e.target.value)}
                      data-testid="input-airtable-table-name"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="airtable-token">Personal Access Token</Label>
                    <Input
                      id="airtable-token"
                      type="password"
                      placeholder="pat.XXXXXX.XXXXXX"
                      value={airtableToken}
                      onChange={(e) => setAirtableToken(e.target.value)}
                      data-testid="input-airtable-token"
                    />
                    <p className="text-xs text-muted-foreground">
                      Create at{" "}
                      <a href="https://airtable.com/create/tokens" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                        airtable.com/create/tokens
                      </a>
                    </p>
                  </div>

                  <Button
                    variant="outline"
                    onClick={() => testAirtableMutation.mutate()}
                    disabled={!airtableBaseId || !airtableTableName || !airtableToken || testAirtableMutation.isPending}
                    data-testid="button-test-airtable"
                  >
                    {testAirtableMutation.isPending ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Testing...</>
                    ) : airtableConnected ? (
                      <><CheckCircle2 className="w-4 h-4 mr-2 text-green-500" /> Connected</>
                    ) : (
                      "Test connection"
                    )}
                  </Button>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2 p-3 rounded-md bg-green-500/10 border border-green-500/20">
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                    <span className="text-sm font-medium">Connected to Airtable</span>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="ml-auto"
                      onClick={() => {
                        setAirtableData(null);
                        setAirtableConnected(false);
                      }}
                    >
                      Disconnect
                    </Button>
                  </div>
                  
                  {renderPreviewTable(airtableData)}
                  {renderFieldMappingUI(airtableData.headers, airtableFieldMapping, setAirtableFieldMapping)}
                  
                  <div className="flex items-center gap-2 p-3 rounded-md bg-muted/50">
                    <input type="checkbox" id="keep-synced" defaultChecked className="rounded" />
                    <Label htmlFor="keep-synced" className="text-sm">
                      Save connection and keep synced with Airtable
                    </Label>
                  </div>
                </>
              )}
            </TabsContent>
          </Tabs>
        </div>

        {((activeTab === "excel" && parsedData) || (activeTab === "airtable" && airtableData)) && (
          <div className="p-6 pt-4 border-t shrink-0 bg-background">
            <Button
              className="w-full"
              size="lg"
              onClick={activeTab === "excel" ? handleImportExcel : handleImportAirtable}
              disabled={isImporting}
              data-testid={activeTab === "excel" ? "button-confirm-import-excel" : "button-confirm-import-airtable"}
            >
              {isImporting ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Importing...</>
              ) : (
                `Import ${(activeTab === "excel" ? parsedData?.totalRows : airtableData?.totalRows) || 0} contacts`
              )}
            </Button>
          </div>
        )}

        <div
          className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize z-50 flex items-center justify-center opacity-50 hover:opacity-100 transition-opacity"
          onMouseDown={handleResizeStart}
          data-testid="modal-resize-handle"
        >
          <GripVertical className="w-3 h-3 rotate-[-45deg] text-muted-foreground" />
        </div>
      </DialogContent>
    </Dialog>
  );
}
