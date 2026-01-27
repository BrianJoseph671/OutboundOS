import { useState, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
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
import { Upload, Loader2, CheckCircle2, AlertCircle, FileSpreadsheet, Database } from "lucide-react";

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
  { key: "company", label: "Company", required: false },
  { key: "email", label: "Email", required: false },
  { key: "linkedinUrl", label: "LinkedIn URL", required: false },
  { key: "role", label: "Role", required: false },
  { key: "notes", label: "Notes", required: false },
];

export function ImportModal({ open, onOpenChange, onSuccess }: ImportModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

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

  const parseExcelMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const response = await fetch("/api/contacts/import/excel", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to parse file");
      }
      return response.json();
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

  const bulkCreateMutation = useMutation({
    mutationFn: async (contacts: object[]) => {
      const response = await apiRequest("POST", "/api/contacts/bulk-create", { contacts });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      toast({ title: `${data.created} contacts imported successfully` });
      resetState();
      onSuccess();
    },
    onError: (error: Error) => {
      toast({ title: "Import failed", description: error.message, variant: "destructive" });
    },
  });

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
      const formData = new FormData();
      formData.append("file", selectedFile);
      parseExcelMutation.mutate(formData);
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

  const handleImportExcel = () => {
    if (!parsedData) return;
    
    const contacts = parsedData.rows.map(row => {
      const contact: Record<string, string> = {};
      parsedData.headers.forEach((header, index) => {
        const mappedField = fieldMapping[header];
        if (mappedField && row[index]) {
          contact[mappedField] = row[index];
        }
      });
      return contact;
    }).filter(c => c.name);

    if (contacts.length === 0) {
      toast({ title: "No valid contacts found", description: "Make sure the Name field is mapped", variant: "destructive" });
      return;
    }

    bulkCreateMutation.mutate(contacts);
  };

  const saveAirtableConfigMutation = useMutation({
    mutationFn: async (config: { baseId: string; tableName: string; personalAccessToken: string; fieldMapping: FieldMapping }) => {
      const response = await apiRequest("POST", "/api/airtable/config", config);
      return response.json();
    },
  });

  const handleImportAirtable = () => {
    if (!airtableData || !airtableConnected) return;
    
    const contacts = airtableData.rows.map(row => {
      const contact: Record<string, string> = {};
      airtableData.headers.forEach((header, index) => {
        const mappedField = airtableFieldMapping[header];
        if (mappedField && row[index]) {
          contact[mappedField] = row[index];
        }
      });
      return contact;
    }).filter(c => c.name);

    if (contacts.length === 0) {
      toast({ title: "No valid contacts found", description: "Make sure the Name field is mapped", variant: "destructive" });
      return;
    }

    bulkCreateMutation.mutate(contacts, {
      onSuccess: () => {
        saveAirtableConfigMutation.mutate({
          baseId: airtableBaseId,
          tableName: airtableTableName,
          personalAccessToken: airtableToken,
          fieldMapping: airtableFieldMapping,
        }, {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/airtable/config"] });
          },
          onError: () => {
            toast({ title: "Warning", description: "Contacts imported but credentials not saved for sync", variant: "destructive" });
          }
        });
      }
    });
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

  const renderFieldMappingUI = (
    headers: string[], 
    mapping: FieldMapping, 
    setMapping: (m: FieldMapping) => void
  ) => (
    <div className="space-y-3 mt-4">
      <Label className="text-sm font-medium">Map columns to fields</Label>
      <div className="grid gap-2">
        {headers.map(header => (
          <div key={header} className="flex items-center gap-3">
            <span className="text-sm w-40 truncate" title={header}>{header}</span>
            <span className="text-muted-foreground">→</span>
            <Select
              value={mapping[header] || "skip"}
              onValueChange={(value) => {
                setMapping({ ...mapping, [header]: value === "skip" ? "" : value });
              }}
            >
              <SelectTrigger className="w-40" data-testid={`select-mapping-${header}`}>
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
        ))}
      </div>
    </div>
  );

  const renderPreviewTable = (data: ParsedData) => (
    <div className="mt-4 border rounded-md overflow-hidden">
      <div className="text-sm text-muted-foreground p-2 bg-muted/50">
        Preview (first 5 rows of {data.totalRows})
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {data.headers.map((header, i) => (
                <TableHead key={i} className="whitespace-nowrap">{header}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.rows.slice(0, 5).map((row, i) => (
              <TableRow key={i}>
                {row.map((cell, j) => (
                  <TableCell key={j} className="whitespace-nowrap max-w-[200px] truncate">
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
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Contacts</DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="excel" data-testid="tab-excel-upload">
              <FileSpreadsheet className="w-4 h-4 mr-2" />
              Excel Upload
            </TabsTrigger>
            <TabsTrigger value="airtable" data-testid="tab-airtable">
              <Database className="w-4 h-4 mr-2" />
              Airtable Connection
            </TabsTrigger>
          </TabsList>

          <TabsContent value="excel" className="space-y-4 pt-4">
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

            <div className="text-sm text-muted-foreground">
              <strong>Expected columns:</strong> Name, Company, Email (optional), LinkedIn URL (optional), Role (optional), Notes (optional)
            </div>

            {parsedData && (
              <>
                {renderPreviewTable(parsedData)}
                {renderFieldMappingUI(parsedData.headers, fieldMapping, setFieldMapping)}
                
                <Button
                  className="w-full"
                  onClick={handleImportExcel}
                  disabled={bulkCreateMutation.isPending || !fieldMapping[Object.keys(fieldMapping).find(k => fieldMapping[k] === "name") || ""]}
                  data-testid="button-confirm-import-excel"
                >
                  {bulkCreateMutation.isPending ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Importing...</>
                  ) : (
                    `Import ${parsedData.totalRows} contacts`
                  )}
                </Button>
              </>
            )}
          </TabsContent>

          <TabsContent value="airtable" className="space-y-4 pt-4">
            <div className="space-y-4">
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

            {airtableData && (
              <>
                {renderPreviewTable(airtableData)}
                {renderFieldMappingUI(airtableData.headers, airtableFieldMapping, setAirtableFieldMapping)}
                
                <div className="flex items-center gap-2 p-3 rounded-md bg-muted/50">
                  <input type="checkbox" id="keep-synced" disabled className="rounded" />
                  <Label htmlFor="keep-synced" className="text-sm text-muted-foreground cursor-not-allowed">
                    Keep synced with Airtable (coming soon)
                  </Label>
                </div>

                <Button
                  className="w-full"
                  onClick={handleImportAirtable}
                  disabled={bulkCreateMutation.isPending}
                  data-testid="button-confirm-import-airtable"
                >
                  {bulkCreateMutation.isPending ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Importing...</>
                  ) : (
                    `Import ${airtableData.totalRows} contacts`
                  )}
                </Button>
              </>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
