import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useContacts } from "@/hooks/useContacts";
import { useAirtableConfig } from "@/hooks/useAirtableConfig";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  Search,
  Plus,
  Building2,
  Mail,
  Linkedin,
  MapPin,
  FileText,
  User,
  Briefcase,
  GraduationCap,
  Tag,
  X,
  ChevronRight,
  Trash2,
  Loader2,
  Check,
  AlertCircle,
  Upload,
  RefreshCw,
  Play,
  Sparkles,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { useBatchProgress } from "@/hooks/useBatchProgress";
import type { Contact, InsertContact, OutreachAttempt } from "@shared/schema";

type ContactResearchStatus = "pending" | "processing" | "completed" | "failed";

interface ContactStatusMap {
  [contactId: string]: {
    status: ContactResearchStatus;
    error?: string;
  };
}

interface BulkResearchResult {
  contactId: string;
  personName: string;
  company: string;
  status: "success" | "failed";
  error?: string;
}

interface BulkResearchResponse {
  total: number;
  results: BulkResearchResult[];
}

type BulkContactStatus = "queued" | "running" | "success" | "failed";

interface BulkContactEntry {
  contactId: string;
  name: string;
  company: string;
  status: BulkContactStatus;
  error?: string;
}

function BulkResearchDialog({
  open,
  onOpenChange,
  entries,
  total,
  completed,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entries: BulkContactEntry[];
  total: number;
  completed: number;
}) {
  const [, setLocation] = useLocation();
  const isDone = completed === total;
  const successCount = entries.filter((e) => e.status === "success").length;
  const failedCount = entries.filter((e) => e.status === "failed").length;
  const progressPct = total > 0 ? (completed / total) * 100 : 0;
  const successIds = entries.filter((e) => e.status === "success").map((e) => e.contactId);

  return (
    <Dialog open={open} onOpenChange={isDone ? onOpenChange : undefined}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isDone ? (
              <Check className="w-5 h-5 text-green-600" />
            ) : (
              <Loader2 className="w-5 h-5 animate-spin" />
            )}
            {isDone ? "Bulk Research Complete" : "Researching Contacts..."}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {completed}/{total} contacts processed
              </span>
              {isDone && (
                <span className="text-muted-foreground">
                  {successCount} succeeded, {failedCount} failed
                </span>
              )}
            </div>
            <Progress value={progressPct} className="h-2" data-testid="progress-bulk-research" />
          </div>

          <div className="max-h-64 overflow-y-auto space-y-1 border rounded-md p-2">
            {entries.map((entry) => (
              <div
                key={entry.contactId}
                className="flex items-center justify-between py-1.5 px-2 rounded text-sm"
                data-testid={`bulk-status-${entry.contactId}`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="truncate font-medium">{entry.name}</span>
                  {entry.company && (
                    <span className="truncate text-muted-foreground text-xs">
                      {entry.company}
                    </span>
                  )}
                </div>
                <div className="flex-shrink-0 ml-2">
                  {entry.status === "queued" && (
                    <Badge variant="secondary" className="text-xs">Queued</Badge>
                  )}
                  {entry.status === "running" && (
                    <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                      Running
                    </Badge>
                  )}
                  {entry.status === "success" && (
                    <Badge variant="secondary" className="text-xs bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
                      <Check className="w-3 h-3 mr-1" />
                      Success
                    </Badge>
                  )}
                  {entry.status === "failed" && (
                    <Badge variant="destructive" className="text-xs" title={entry.error}>
                      <AlertCircle className="w-3 h-3 mr-1" />
                      Failed
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>

          {isDone && (
            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-close-bulk-dialog">
                Close
              </Button>
              {successIds.length > 0 && (
                <Button
                  onClick={() => {
                    onOpenChange(false);
                    setLocation(`/research-queue?ids=${successIds.join(",")}`);
                  }}
                  data-testid="button-view-research-results"
                >
                  View Research Results
                </Button>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ResearchStatusBadge({
  status,
  error,
  onRetry,
}: {
  status: ContactResearchStatus;
  error?: string;
  onRetry?: () => void;
}) {
  switch (status) {
    case "pending":
      return (
        <Badge variant="secondary" className="text-xs">
          Pending
        </Badge>
      );
    case "processing":
      return (
        <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
          Processing
        </Badge>
      );
    case "completed":
      return (
        <Badge variant="secondary" className="text-xs bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
          <Check className="w-3 h-3 mr-1" />
          Researched
        </Badge>
      );
    case "failed":
      return (
        <div className="flex items-center gap-1">
          <Badge variant="destructive" className="text-xs">
            <X className="w-3 h-3 mr-1" />
            Failed
          </Badge>
          {onRetry && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={(e) => {
                e.stopPropagation();
                onRetry();
              }}
              data-testid="button-retry-research"
            >
              <RefreshCw className="w-3 h-3" />
            </Button>
          )}
        </div>
      );
    default:
      return null;
  }
}

function ContactCard({
  contact,
  onClick,
  researchStatus,
  onRetry,
}: {
  contact: Contact;
  onClick: () => void;
  researchStatus?: ContactResearchStatus;
  onRetry?: () => void;
}) {
  const initials = contact.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const tags = (contact.tags?.split(",").filter(Boolean) || []).filter(
    (tag) => tag.trim() !== "demo-import",
  );

  return (
    <Card
      className="cursor-pointer hover-elevate active-elevate-2 transition-colors"
      onClick={onClick}
      data-testid={`card-contact-${contact.id}`}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          <Avatar className="w-12 h-12">
            <AvatarFallback className="bg-muted text-muted-foreground font-medium">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-medium truncate">{contact.name}</h3>
              <div className="flex items-center gap-2 flex-shrink-0">
                {researchStatus && (
                  <ResearchStatusBadge
                    status={researchStatus}
                    onRetry={onRetry}
                  />
                )}
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </div>
            </div>
            {contact.role && (
              <p className="text-sm text-muted-foreground truncate">
                {contact.role}
              </p>
            )}
            {contact.company && (
              <p className="text-sm text-muted-foreground truncate flex items-center gap-1 mt-1">
                <Building2 className="w-3 h-3" />
                {contact.company}
              </p>
            )}
            {tags.length > 0 && (
              <div className="flex items-center gap-1 mt-2 flex-wrap">
                {tags.slice(0, 3).map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-xs">
                    {tag.trim()}
                  </Badge>
                ))}
                {tags.length > 3 && (
                  <span className="text-xs text-muted-foreground">
                    +{tags.length - 3}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ContactDetail({
  contact,
  onClose,
  onDelete,
}: {
  contact: Contact;
  onClose: () => void;
  onDelete: (id: string) => Promise<boolean>;
}) {
  const { toast } = useToast();
  const [isDeleting, setIsDeleting] = useState(false);
  const { data: attempts = [] } = useQuery<OutreachAttempt[]>({
    queryKey: ["/api/outreach-attempts", { contactId: contact.id }],
  });

  const contactAttempts = attempts.filter((a) => a.contactId === contact.id);

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this contact?")) return;
    setIsDeleting(true);
    try {
      const ok = await onDelete(contact.id);
      if (ok) {
        toast({ title: "Contact deleted successfully" });
        onClose();
      } else {
        toast({ title: "Failed to delete contact", variant: "destructive" });
      }
    } catch {
      toast({ title: "Failed to delete contact", variant: "destructive" });
    } finally {
      setIsDeleting(false);
    }
  };

  const initials = contact.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const tags = (contact.tags?.split(",").filter(Boolean) || []).filter(
    (tag) => tag.trim() !== "demo-import",
  );
  const skills = contact.skills?.split(",").filter(Boolean) || [];

  const getTypeLabel = (type: string) => {
    switch (type) {
      case "linkedin_connected":
        return "LinkedIn";
      case "linkedin_connect_request":
        return "LinkedIn Request";
      case "email":
        return "Email";
      default:
        return type;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4">
        <Avatar className="w-16 h-16">
          <AvatarFallback className="bg-muted text-muted-foreground font-medium text-xl">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <h2 className="text-xl font-semibold" data-testid="text-contact-name">
            {contact.name}
          </h2>
          {contact.headline && (
            <p className="text-muted-foreground mt-1">{contact.headline}</p>
          )}
          <div className="flex items-center gap-4 mt-3 flex-wrap">
            {contact.company && (
              <span className="flex items-center gap-1 text-sm">
                <Building2 className="w-4 h-4 text-muted-foreground" />
                {contact.company}
              </span>
            )}
            {contact.location && (
              <span className="flex items-center gap-1 text-sm">
                <MapPin className="w-4 h-4 text-muted-foreground" />
                {contact.location}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleDelete}
            disabled={isDeleting}
            data-testid="button-delete-contact"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            data-testid="button-close-contact"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {contact.email && (
          <a
            href={`mailto:${contact.email}`}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <Mail className="w-4 h-4" />
            {contact.email}
          </a>
        )}
        {contact.linkedinUrl && (
          <a
            href={contact.linkedinUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <Linkedin className="w-4 h-4" />
            LinkedIn
          </a>
        )}
      </div>

      {tags.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium flex items-center gap-1">
            <Tag className="w-4 h-4" />
            Tags
          </h3>
          <div className="flex items-center gap-2 flex-wrap">
            {tags.map((tag) => (
              <Badge key={tag} variant="secondary">
                {tag.trim()}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {contact.about && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium flex items-center gap-1">
            <User className="w-4 h-4" />
            About
          </h3>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
            {contact.about}
          </p>
        </div>
      )}

      {contact.experience && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium flex items-center gap-1">
            <Briefcase className="w-4 h-4" />
            Experience
          </h3>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
            {contact.experience}
          </p>
        </div>
      )}

      {contact.education && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium flex items-center gap-1">
            <GraduationCap className="w-4 h-4" />
            Education
          </h3>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
            {contact.education}
          </p>
        </div>
      )}

      {skills.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Skills</h3>
          <div className="flex items-center gap-2 flex-wrap">
            {skills.map((skill) => (
              <Badge key={skill} variant="outline" className="text-xs">
                {skill.trim()}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {contact.notes && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium flex items-center gap-1">
            <FileText className="w-4 h-4" />
            Notes
          </h3>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
            {contact.notes}
          </p>
        </div>
      )}

      <div className="space-y-3">
        <h3 className="text-sm font-medium">Outreach History</h3>
        {contactAttempts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No outreach attempts yet.
          </p>
        ) : (
          <div className="space-y-2">
            {contactAttempts.map((attempt) => (
              <div
                key={attempt.id}
                className="flex items-center justify-between gap-4 p-3 bg-muted/50 rounded-md"
              >
                <div>
                  <p className="text-sm font-medium">
                    {getTypeLabel(attempt.outreachType)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(attempt.dateSent).toLocaleDateString()}
                    {attempt.campaign && ` • ${attempt.campaign}`}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {attempt.responded && (
                    <Badge variant="secondary">Responded</Badge>
                  )}
                  {attempt.positiveResponse && (
                    <Badge className="bg-chart-2">Positive</Badge>
                  )}
                  {attempt.meetingBooked && (
                    <Badge className="bg-chart-3">Booked</Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AddContactModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const { createContact, bulkCreate } = useContacts();

  const [activeTab, setActiveTab] = useState("manual");
  const [formData, setFormData] = useState<Partial<InsertContact>>({
    name: "",
    company: "",
    role: "",
    linkedinUrl: "",
    email: "",
    headline: "",
    about: "",
    location: "",
    experience: "",
    education: "",
    skills: "",
    keywords: "",
    notes: "",
    tags: "",
  });
  const [pdfData, setPdfData] = useState<Partial<InsertContact> | null>(null);
  const [isParsingPdf, setIsParsingPdf] = useState(false);

  // Batch upload state
  type BatchResult = {
    filename: string;
    success: boolean;
    contact?: Partial<InsertContact>;
    error?: string;
    selected: boolean;
  };
  const [batchResults, setBatchResults] = useState<BatchResult[]>([]);
  const [isBatchParsing, setIsBatchParsing] = useState(false);
  const [batchProgress, setBatchProgress] = useState(0);
  const [isSavingBatch, setIsSavingBatch] = useState(false);

  const [isCreating, setIsCreating] = useState(false);

  const resetForm = () => {
    setFormData({
      name: "",
      company: "",
      role: "",
      linkedinUrl: "",
      email: "",
      headline: "",
      about: "",
      location: "",
      experience: "",
      education: "",
      skills: "",
      keywords: "",
      notes: "",
      tags: "",
    });
    setPdfData(null);
    setBatchResults([]);
    setBatchProgress(0);
  };

  const handleBatchUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsBatchParsing(true);
    setBatchProgress(0);
    setBatchResults([]);

    try {
      const formData = new FormData();
      for (let i = 0; i < files.length; i++) {
        formData.append("files", files[i]);
      }

      const response = await fetch("/api/parse-pdf-batch", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Failed to parse PDFs");
      }

      const result = await response.json();
      
      const batchItems: BatchResult[] = result.results.map((r: any) => ({
        filename: r.filename,
        success: r.success,
        contact: r.contact,
        error: r.error,
        selected: r.success, // Auto-select successful parses
      }));

      setBatchResults(batchItems);
      setBatchProgress(100);

      const successCount = batchItems.filter((r) => r.success).length;
      toast({
        title: `Parsed ${successCount} of ${files.length} PDFs successfully`,
        variant: successCount === files.length ? "default" : "destructive",
      });
    } catch (error) {
      console.error("[Batch PDF] Error:", error);
      toast({
        title: "Failed to parse PDFs",
        variant: "destructive",
      });
    } finally {
      setIsBatchParsing(false);
    }
  };

  const toggleBatchSelection = (index: number) => {
    setBatchResults((prev) =>
      prev.map((r, i) => (i === index ? { ...r, selected: !r.selected } : r))
    );
  };

  const handleSaveBatch = async () => {
    const selectedContacts = batchResults
      .filter((r) => r.success && r.selected && r.contact?.name)
      .map((r) => r.contact as InsertContact);

    if (selectedContacts.length === 0) {
      toast({ title: "No contacts selected to save", variant: "destructive" });
      return;
    }

    setIsSavingBatch(true);
    try {
      await bulkCreate(selectedContacts);
      toast({ title: `Saved ${selectedContacts.length} contacts successfully` });
      onOpenChange(false);
      resetForm();
    } catch {
      toast({
        title: "Failed to save contacts",
        variant: "destructive",
      });
    } finally {
      setIsSavingBatch(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const dataToSubmit = activeTab === "pdf" && pdfData ? pdfData : formData;
    if (!dataToSubmit.name?.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    setIsCreating(true);
    try {
      await createContact(dataToSubmit as InsertContact);
      toast({ title: "Contact created successfully" });
      onOpenChange(false);
      resetForm();
    } catch {
      toast({ title: "Failed to create contact", variant: "destructive" });
    } finally {
      setIsCreating(false);
    }
  };

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    console.log("[PDF Debug] Upload metadata:", {
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
    });

    setIsParsingPdf(true);

    try {
      // Send file using FormData (not JSON!)
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/parse-pdf", {
        method: "POST",
        body: formData, // Browser sets Content-Type automatically
      });

      console.log("[PDF Debug] API response:", response.status, response.ok);

      if (!response.ok) {
        throw new Error("Failed to parse PDF");
      }

      const parsed = await response.json();
      console.log("[PDF Debug] Parsed result:", parsed);

      setPdfData(parsed);
      setFormData((prev) => ({ ...prev, ...parsed }));
      toast({ title: "PDF parsed successfully" });
    } catch (error) {
      console.error("[PDF Debug] Error:", error);
      toast({
        title: "Failed to parse PDF",
        variant: "destructive",
      });
    } finally {
      setIsParsingPdf(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      resetForm();
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Contact</DialogTitle>
        </DialogHeader>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="pdf">Single PDF</TabsTrigger>
            <TabsTrigger value="batch">Batch Upload</TabsTrigger>
            <TabsTrigger value="manual">Manual Entry</TabsTrigger>
          </TabsList>
          <TabsContent value="pdf" className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="pdf-upload">LinkedIn Profile PDF</Label>
              <Input
                id="pdf-upload"
                type="file"
                accept=".pdf"
                onChange={handlePdfUpload}
                disabled={isParsingPdf}
                data-testid="input-pdf-upload"
              />
              {isParsingPdf && (
                <p className="text-sm text-muted-foreground">Parsing PDF...</p>
              )}
            </div>
            {pdfData && (
              <div className="p-4 bg-muted rounded-md space-y-3 max-h-96 overflow-y-auto">
                <h3 className="font-medium text-sm">Extracted Information</h3>
                {pdfData.name && (
                  <p>
                    <span className="font-medium">Name:</span> {pdfData.name}
                  </p>
                )}
                {pdfData.headline && (
                  <p>
                    <span className="font-medium">Headline:</span>{" "}
                    {pdfData.headline}
                  </p>
                )}
                {pdfData.company && (
                  <p>
                    <span className="font-medium">Company:</span>{" "}
                    {pdfData.company}
                  </p>
                )}
                {pdfData.role && (
                  <p>
                    <span className="font-medium">Role:</span> {pdfData.role}
                  </p>
                )}
                {pdfData.location && (
                  <p>
                    <span className="font-medium">Location:</span>{" "}
                    {pdfData.location}
                  </p>
                )}
                {pdfData.about && (
                  <p>
                    <span className="font-medium">About:</span>{" "}
                    {pdfData.about.slice(0, 100)}...
                  </p>
                )}
              </div>
            )}
          </TabsContent>
          <TabsContent value="batch" className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="batch-upload">Upload Multiple LinkedIn PDFs</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="batch-upload"
                  type="file"
                  accept=".pdf"
                  multiple
                  onChange={handleBatchUpload}
                  disabled={isBatchParsing || isSavingBatch}
                  data-testid="input-batch-upload"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Select multiple PDF files to import contacts in bulk (up to 20 files)
              </p>
            </div>

            {isBatchParsing && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">Processing PDFs...</span>
                </div>
                <Progress value={batchProgress} className="w-full" />
              </div>
            )}

            {batchResults.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium text-sm">
                    Parsed Contacts ({batchResults.filter((r) => r.success).length} successful,{" "}
                    {batchResults.filter((r) => !r.success).length} failed)
                  </h3>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setBatchResults((prev) =>
                        prev.map((r) => ({ ...r, selected: r.success }))
                      )
                    }
                  >
                    Select All
                  </Button>
                </div>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {batchResults.map((result, index) => (
                    <div
                      key={index}
                      className={`flex items-center gap-3 p-3 rounded-md border ${
                        result.success ? "bg-muted/50" : "bg-destructive/10 border-destructive/30"
                      }`}
                      data-testid={`batch-result-${index}`}
                    >
                      {result.success ? (
                        <Checkbox
                          checked={result.selected}
                          onCheckedChange={() => toggleBatchSelection(index)}
                          data-testid={`checkbox-batch-${index}`}
                        />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-destructive" />
                      )}
                      <div className="flex-1 min-w-0">
                        {result.success ? (
                          <>
                            <p className="font-medium text-sm truncate">
                              {result.contact?.name || "Unknown"}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {result.contact?.role && result.contact?.company
                                ? `${result.contact.role} at ${result.contact.company}`
                                : result.contact?.company || result.contact?.role || result.filename}
                            </p>
                          </>
                        ) : (
                          <>
                            <p className="font-medium text-sm truncate">{result.filename}</p>
                            <p className="text-xs text-destructive truncate">
                              {result.error || "Failed to parse"}
                            </p>
                          </>
                        )}
                      </div>
                      {result.success && <Check className="w-4 h-4 text-chart-2" />}
                    </div>
                  ))}
                </div>
                <Button
                  onClick={handleSaveBatch}
                  disabled={isSavingBatch || batchResults.filter((r) => r.selected).length === 0}
                  className="w-full"
                  data-testid="button-save-batch"
                >
                  {isSavingBatch ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4 mr-2" />
                      Save {batchResults.filter((r) => r.selected).length} Contacts
                    </>
                  )}
                </Button>
              </div>
            )}
          </TabsContent>
          <TabsContent value="manual">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name *</Label>
                  <Input
                    id="name"
                    value={formData.name || ""}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, name: e.target.value }))
                    }
                    placeholder="John Smith"
                    data-testid="input-contact-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email || ""}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        email: e.target.value,
                      }))
                    }
                    placeholder="john@company.com"
                    data-testid="input-contact-email"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="company">Company</Label>
                  <Input
                    id="company"
                    value={formData.company || ""}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        company: e.target.value,
                      }))
                    }
                    placeholder="Acme Inc"
                    data-testid="input-contact-company"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role">Role / Title</Label>
                  <Input
                    id="role"
                    value={formData.role || ""}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, role: e.target.value }))
                    }
                    placeholder="VP of Sales"
                    data-testid="input-contact-role"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="linkedinUrl">LinkedIn URL</Label>
                  <Input
                    id="linkedinUrl"
                    value={formData.linkedinUrl || ""}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        linkedinUrl: e.target.value,
                      }))
                    }
                    placeholder="https://linkedin.com/in/..."
                    data-testid="input-contact-linkedin"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="location">Location</Label>
                  <Input
                    id="location"
                    value={formData.location || ""}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        location: e.target.value,
                      }))
                    }
                    placeholder="San Francisco, CA"
                    data-testid="input-contact-location"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="headline">Headline</Label>
                <Input
                  id="headline"
                  value={formData.headline || ""}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      headline: e.target.value,
                    }))
                  }
                  placeholder="Sales Leader | Growth Expert"
                  data-testid="input-contact-headline"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="about">About</Label>
                <Textarea
                  id="about"
                  value={formData.about || ""}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, about: e.target.value }))
                  }
                  placeholder="Brief summary..."
                  rows={3}
                  data-testid="input-contact-about"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="experience">Experience</Label>
                  <Textarea
                    id="experience"
                    value={formData.experience || ""}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        experience: e.target.value,
                      }))
                    }
                    placeholder="Work history..."
                    rows={3}
                    data-testid="input-contact-experience"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="education">Education</Label>
                  <Textarea
                    id="education"
                    value={formData.education || ""}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        education: e.target.value,
                      }))
                    }
                    placeholder="Education history..."
                    rows={3}
                    data-testid="input-contact-education"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="skills">Skills (comma-separated)</Label>
                <Input
                  id="skills"
                  value={formData.skills || ""}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, skills: e.target.value }))
                  }
                  placeholder="Sales, Leadership, Strategy"
                  data-testid="input-contact-skills"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="tags">Tags (comma-separated)</Label>
                <Input
                  id="tags"
                  value={formData.tags || ""}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, tags: e.target.value }))
                  }
                  placeholder="Enterprise, Decision Maker, West Coast"
                  data-testid="input-contact-tags"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={formData.notes || ""}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, notes: e.target.value }))
                  }
                  placeholder="Additional notes..."
                  rows={2}
                  data-testid="input-contact-notes"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isCreating}
                  data-testid="button-save-contact"
                >
                  {isCreating ? "Saving..." : "Save Contact"}
                </Button>
              </div>
            </form>
          </TabsContent>
        </Tabs>
        <div className="flex justify-end gap-2 pt-4 mt-4 border-t">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isCreating}
            data-testid="button-save-contact"
          >
            {isCreating ? "Saving..." : "Save Contact"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function BatchProgressBar({
  progress,
  isComplete,
  currentContact,
  completedContacts,
  onViewResults,
}: {
  progress: { completed: number; failed: number; total: number; percentComplete: number } | null;
  isComplete: boolean;
  currentContact?: string;
  completedContacts?: Array<{ contactName: string }>;
  onViewResults?: () => void;
}) {
  if (!progress) return null;

  const recentlyCompleted = completedContacts?.slice(-3).reverse() || [];

  return (
    <Card className={`transition-all duration-300 ${
      isComplete 
        ? "border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/20" 
        : "border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20"
    }`}>
      <CardContent className="py-4">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {!isComplete && <Loader2 className="w-4 h-4 animate-spin text-blue-600" />}
              {isComplete && <Check className="w-4 h-4 text-green-600" />}
              <span className="font-medium">
                {isComplete ? "Research Complete!" : "Researching contacts..."}
              </span>
            </div>
            <span className="text-sm text-muted-foreground">
              {progress.completed + progress.failed} / {progress.total}
            </span>
          </div>
          
          <Progress value={progress.percentComplete} className="h-2" />
          
          {!isComplete && currentContact && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground animate-pulse">
              <Sparkles className="w-3 h-3 text-blue-500" />
              <span>Currently researching: <span className="font-medium text-foreground">{currentContact}</span></span>
            </div>
          )}
          
          {recentlyCompleted.length > 0 && !isComplete && (
            <div className="space-y-1">
              {recentlyCompleted.map((c, i) => (
                <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Check className="w-3 h-3 text-green-500" />
                  <span>{c.contactName} researched</span>
                </div>
              ))}
            </div>
          )}
          
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4 text-sm">
              <span className="flex items-center gap-1 text-green-600">
                <Check className="w-3 h-3" />
                {progress.completed} completed
              </span>
              {progress.failed > 0 && (
                <span className="flex items-center gap-1 text-red-600">
                  <X className="w-3 h-3" />
                  {progress.failed} failed
                </span>
              )}
            </div>
            
            {isComplete && onViewResults && (
              <Button
                size="sm"
                onClick={onViewResults}
                data-testid="button-view-research-results"
              >
                View Results
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface AirtableConfig {
  connected: boolean;
  baseId?: string;
  tableName?: string;
  lastSyncAt?: string;
  fieldMapping?: Record<string, string>;
}

function AirtableCard({
  config,
  onSync,
  onDisconnect,
  isSyncing,
}: {
  config: AirtableConfig | null;
  onSync: () => void;
  onDisconnect: () => void;
  isSyncing: boolean;
}) {
  if (!config?.connected) return null;

  const formatLastSync = (dateStr?: string) => {
    if (!dateStr) return "Never";
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours} hours ago`;
    return `${diffDays} days ago`;
  };

  return (
    <Card className="border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/20">
      <CardContent className="py-3 px-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center flex-shrink-0">
              <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
            </div>
            <div className="min-w-0">
              <p className="font-medium text-sm truncate">
                Airtable Connected
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {config.tableName} • Last synced: {formatLastSync(config.lastSyncAt)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={onSync}
              disabled={isSyncing}
              data-testid="button-sync-airtable"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${isSyncing ? "animate-spin" : ""}`} />
              {isSyncing ? "Syncing..." : "Sync"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onDisconnect}
              className="text-muted-foreground hover:text-destructive"
              data-testid="button-disconnect-airtable"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Contacts() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { contacts, isLoading, deleteContact, deleteContacts, bulkCreate, updateContact, invalidate } = useContacts();
  const [search, setSearch] = useState("");
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [contactStatuses, setContactStatuses] = useState<ContactStatusMap>({});
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [bulkEntries, setBulkEntries] = useState<BulkContactEntry[]>([]);
  const [bulkCompleted, setBulkCompleted] = useState(0);
  const [bulkTotal, setBulkTotal] = useState(0);

  const { data: packetsData } = useQuery<{ packets: Array<{ contactId: string; status: string }> }>({
    queryKey: ["/api/research-packets"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/research-packets");
      return res.json();
    },
  });

  const packetsByContactId = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of packetsData?.packets ?? []) {
      map.set(p.contactId, p.status);
    }
    return map;
  }, [packetsData?.packets]);

  const { config: airtableConfig, clearConfig: clearAirtableConfig, updateLastSync } = useAirtableConfig();

  const syncAirtableMutation = useMutation({
    mutationFn: async () => {
      if (!airtableConfig?.personalAccessToken) {
        throw new Error("Connect Airtable first");
      }
      const response = await apiRequest("POST", "/api/airtable/sync", {
        baseId: airtableConfig.baseId,
        tableName: airtableConfig.tableName,
        personalAccessToken: airtableConfig.personalAccessToken,
        viewName: airtableConfig.viewName ?? "Grid view",
        fieldMapping: airtableConfig.fieldMapping ?? undefined,
      });
      const data = await response.json();
      const incoming = data.contacts ?? [];
      if (incoming.length === 0) return { created: 0, updated: 0, lastSyncAt: data.lastSyncAt };
      const toCreate: Array<Omit<Contact, "id" | "createdAt">> = [];
      let updated = 0;
      for (const c of incoming) {
        const existing = contacts.find(
          (x) =>
            x.name.toLowerCase() === (c.name || "").toLowerCase() &&
            (x.company?.toLowerCase() ?? "") === (c.company ?? "").toLowerCase()
        );
        if (existing) {
          await updateContact(existing.id, {
            company: c.company ?? null,
            role: c.role ?? null,
            linkedinUrl: c.linkedinUrl ?? null,
            email: c.email ?? null,
            headline: c.headline ?? null,
            about: c.about ?? null,
            location: c.location ?? null,
            experience: c.experience ?? null,
            education: c.education ?? null,
            skills: c.skills ?? null,
            keywords: c.keywords ?? null,
            notes: c.notes ?? null,
            tags: existing.tags?.includes("airtable-sync") ? existing.tags : `${existing.tags || ""},airtable-sync`,
          });
          updated++;
        } else {
          toCreate.push({
            name: c.name || "",
            company: c.company ?? null,
            role: c.role ?? null,
            linkedinUrl: c.linkedinUrl ?? null,
            email: c.email ?? null,
            headline: c.headline ?? null,
            about: c.about ?? null,
            location: c.location ?? null,
            experience: c.experience ?? null,
            education: c.education ?? null,
            skills: c.skills ?? null,
            keywords: c.keywords ?? null,
            notes: c.notes ?? null,
            tags: c.tags ?? null,
            researchStatus: null,
            researchData: null,
          });
        }
      }
      if (toCreate.length > 0) await bulkCreate(toCreate);
      return { created: toCreate.length, updated, lastSyncAt: data.lastSyncAt };
    },
    onSuccess: (data) => {
      invalidate();
      if (data.lastSyncAt) updateLastSync(data.lastSyncAt);
      toast({
        title: "Airtable synced",
        description: `${data.created} new, ${data.updated} updated`,
      });
    },
    onError: (error: Error) => {
      toast({ title: "Sync failed", description: error.message, variant: "destructive" });
    },
  });

  const disconnectAirtableMutation = useMutation({
    mutationFn: async () => {
      clearAirtableConfig();
      await apiRequest("DELETE", "/api/airtable/config");
    },
    onSuccess: () => {
      toast({ title: "Airtable disconnected" });
    },
    onError: () => {
      toast({ title: "Failed to disconnect", variant: "destructive" });
    },
  });

  const { progress, completedContacts, failedContacts, currentContact, isComplete, isConnected } = useBatchProgress(activeJobId);

  useEffect(() => {
    if (!activeJobId) return;

    completedContacts.forEach((c) => {
      setContactStatuses((prev) => ({
        ...prev,
        [c.contactId]: { status: "completed" },
      }));
    });

    failedContacts.forEach((c) => {
      setContactStatuses((prev) => ({
        ...prev,
        [c.contactId]: { status: "failed", error: c.error },
      }));
    });
  }, [completedContacts, failedContacts, activeJobId]);

  useEffect(() => {
    if (isComplete && activeJobId) {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["/api/research-packets"] });
      toast({
        title: "Research complete",
        description: `${progress?.completed || 0} contacts researched successfully`,
      });
    }
  }, [isComplete, activeJobId, progress?.completed, toast, invalidate]);

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      await deleteContacts(ids);
    },
    onSuccess: () => {
      toast({ title: `Successfully deleted selected contacts` });
      setSelectedIds(new Set());
    },
    onError: () => {
      toast({ title: "Failed to delete contacts", variant: "destructive" });
    },
  });

  const batchResearchMutation = useMutation({
    mutationFn: async (contactsPayload: Array<{ id: string; name: string; company?: string; linkedinUrl?: string }>) => {
      const response = await apiRequest("POST", "/api/batch/research", { contacts: contactsPayload });
      return (await response.json()) as { jobId: string };
    },
    onSuccess: (data) => {
      setActiveJobId(data.jobId);
      const initialStatuses: ContactStatusMap = {};
      Array.from(selectedIds).forEach((id) => {
        initialStatuses[id] = { status: "processing" };
      });
      setContactStatuses(initialStatuses);
      toast({ title: "Research started", description: `Processing ${selectedIds.size} contacts` });
    },
    onError: () => {
      toast({ title: "Failed to start research", variant: "destructive" });
    },
  });

  const retryResearchMutation = useMutation({
    mutationFn: ({ jobId, contactId }: { jobId: string; contactId: string }) =>
      apiRequest("POST", `/api/batch/${jobId}/retry/${contactId}`),
    onSuccess: (_, { contactId }) => {
      setContactStatuses((prev) => ({
        ...prev,
        [contactId]: { status: "processing" },
      }));
      toast({ title: "Retrying research" });
    },
    onError: () => {
      toast({ title: "Failed to retry", variant: "destructive" });
    },
  });

  const [bulkResearchPending, setBulkResearchPending] = useState(false);

  const handleResearchSelected = async () => {
    if (selectedIds.size === 0) {
      toast({ title: "No contacts selected", variant: "destructive" });
      return;
    }

    const ids = Array.from(selectedIds);
    const entries: BulkContactEntry[] = ids.map((id) => {
      const c = contacts.find((ct) => ct.id === id);
      return {
        contactId: id,
        name: c?.name || "Unknown",
        company: c?.company || "",
        status: "queued" as BulkContactStatus,
      };
    });

    setBulkEntries(entries);
    setBulkTotal(ids.length);
    setBulkCompleted(0);
    setBulkDialogOpen(true);
    setBulkResearchPending(true);

    try {
      const contactsToSend = ids
        .map((id) => contacts.find((c) => c.id === id))
        .filter((c): c is Contact => c != null)
        .map((c) => ({ id: c.id, name: c.name, company: c.company ?? "" }));
      const response = await fetch("/api/research/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contacts: contactsToSend }),
      });

      if (!response.ok || !response.body) {
        throw new Error("Failed to start bulk research");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      const processSSEBlock = (block: string) => {
        let eventType = "";
        let dataLines: string[] = [];

        for (const line of block.split("\n")) {
          if (line.startsWith("event: ")) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            dataLines.push(line.slice(6));
          }
        }

        if (!eventType || dataLines.length === 0) return;

        try {
          const data = JSON.parse(dataLines.join("\n"));

          if (eventType === "status") {
            setBulkEntries((prev) =>
              prev.map((e) =>
                e.contactId === data.contactId
                  ? { ...e, status: data.status as BulkContactStatus, error: data.error }
                  : e
              )
            );
          } else if (eventType === "progress") {
            setBulkCompleted(data.completed);
          } else if (eventType === "done") {
            setBulkCompleted(data.total);
            invalidate();
            queryClient.invalidateQueries({ queryKey: ["/api/research-packets"] });
          }
        } catch {
          // skip malformed SSE data
        }
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() || "";

        for (const block of blocks) {
          if (block.trim()) processSSEBlock(block);
        }
      }

      if (buffer.trim()) processSSEBlock(buffer);
    } catch (err: any) {
      setBulkEntries((prev) =>
        prev.map((e) =>
          e.status === "queued" || e.status === "running"
            ? { ...e, status: "failed" as BulkContactStatus, error: err.message || "Request failed" }
            : e
        )
      );
      setBulkCompleted(ids.length);
      toast({ title: "Bulk research failed", variant: "destructive" });
    } finally {
      setBulkResearchPending(false);
    }
  };

  const handleResearchAll = () => {
    if (contacts.length === 0) {
      toast({ title: "No contacts to research", variant: "destructive" });
      return;
    }
    const allIds = contacts.map((c) => c.id);
    setSelectedIds(new Set(allIds));
    const contactsToSend = contacts.map((c) => ({
      id: c.id,
      name: c.name,
      company: c.company ?? "",
      linkedinUrl: c.linkedinUrl ?? undefined,
    }));
    batchResearchMutation.mutate(contactsToSend);
  };

  const handleRetryContact = (contactId: string) => {
    if (!activeJobId) return;
    retryResearchMutation.mutate({ jobId: activeJobId, contactId });
  };

  const sortedContacts = [...contacts];

  const filteredContacts = sortedContacts.filter((contact) => {
    const searchLower = search.toLowerCase();
    return (
      contact.name.toLowerCase().includes(searchLower) ||
      contact.company?.toLowerCase().includes(searchLower) ||
      contact.role?.toLowerCase().includes(searchLower) ||
      contact.tags?.toLowerCase().includes(searchLower)
    );
  });

  const handleSelect = (id: string, index: number, shiftKey: boolean) => {
    const next = new Set(selectedIds);
    
    if (shiftKey && lastSelectedIndex !== null) {
      const start = Math.min(lastSelectedIndex, index);
      const end = Math.max(lastSelectedIndex, index);
      const rangeIds = filteredContacts.slice(start, end + 1).map(c => c.id);
      
      const isSelecting = !selectedIds.has(id);
      rangeIds.forEach(rangeId => {
        if (isSelecting) next.add(rangeId);
        else next.delete(rangeId);
      });
    } else {
      if (next.has(id)) next.delete(id);
      else next.add(id);
    }
    
    setSelectedIds(next);
    setLastSelectedIndex(index);
  };

  return (
    <div className="flex gap-6 h-full">
      <div
        className={`flex-1 space-y-6 ${selectedContact ? "hidden lg:block lg:max-w-md" : ""}`}
      >
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold">Contacts</h1>
          <div className="flex items-center gap-2 flex-wrap">
            {selectedIds.size > 0 && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleResearchSelected}
                  disabled={selectedIds.size === 0 || bulkResearchPending}
                  data-testid="button-research-selected"
                >
                  {bulkResearchPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Search className="w-4 h-4 mr-2" />
                  )}
                  Research Selected ({selectedIds.size})
                </Button>
                <Button 
                  variant="destructive" 
                  size="sm"
                  onClick={() => {
                    if (confirm(`Are you sure you want to delete ${selectedIds.size} contacts?`)) {
                      bulkDeleteMutation.mutate(Array.from(selectedIds));
                    }
                  }}
                  disabled={bulkDeleteMutation.isPending}
                  data-testid="button-bulk-delete-contacts"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete ({selectedIds.size})
                </Button>
              </>
            )}
            {contacts.length > 0 && selectedIds.size === 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleResearchAll}
                disabled={batchResearchMutation.isPending || (activeJobId !== null && !isComplete)}
                data-testid="button-research-all"
              >
                <Play className="w-4 h-4 mr-2" />
                Research All
              </Button>
            )}
            <Button
              onClick={() => setAddModalOpen(true)}
              data-testid="button-add-contact"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Contact
            </Button>
          </div>
        </div>

        {activeJobId && progress && (
          <BatchProgressBar 
            progress={progress} 
            isComplete={isComplete}
            currentContact={currentContact?.contactName}
            completedContacts={completedContacts.map(c => ({ contactName: c.contactName }))}
            onViewResults={() => setLocation("/decisions")}
          />
        )}

        <AirtableCard
          config={airtableConfig ?? null}
          onSync={() => syncAirtableMutation.mutate()}
          onDisconnect={() => {
            if (confirm("Disconnect from Airtable? Your imported contacts will remain.")) {
              disconnectAirtableMutation.mutate();
            }
          }}
          isSyncing={syncAirtableMutation.isPending}
        />

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search contacts..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              data-testid="input-search-contacts"
            />
          </div>
          <div className="flex items-center gap-2 px-2 h-10 border rounded-md bg-muted/30">
            <Checkbox 
              checked={filteredContacts.length > 0 && selectedIds.size === filteredContacts.length}
              onCheckedChange={(checked) => {
                if (checked) {
                  setSelectedIds(new Set(filteredContacts.map(c => c.id)));
                } else {
                  setSelectedIds(new Set());
                }
              }}
              data-testid="checkbox-select-all-contacts"
            />
            <span className="text-xs text-muted-foreground whitespace-nowrap">Select All</span>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-muted rounded-full animate-pulse" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-muted rounded w-32 animate-pulse" />
                      <div className="h-3 bg-muted rounded w-24 animate-pulse" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filteredContacts.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <User className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="font-medium mb-2">
                {search ? "No contacts found" : "No contacts yet"}
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                {search
                  ? "Try a different search term"
                  : "Add your first contact to start tracking outreach"}
              </p>
              {!search && (
                <Button
                  onClick={() => setAddModalOpen(true)}
                  data-testid="button-add-first-contact"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Contact
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredContacts.map((contact, index) => (
              <div key={contact.id} className="relative group">
                <div className="absolute top-1/2 -translate-y-1/2 -left-3 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Checkbox 
                    checked={selectedIds.has(contact.id)}
                    onCheckedChange={() => {
                      const nativeEvent = window.event as unknown as React.MouseEvent;
                      handleSelect(contact.id, index, !!nativeEvent?.shiftKey);
                    }}
                    data-testid={`checkbox-select-contact-${contact.id}`}
                    className="bg-background shadow-sm"
                  />
                </div>
                {/* Visual indicator for selection when not hovered */}
                {selectedIds.has(contact.id) && (
                  <div className="absolute top-1/2 -translate-y-1/2 -left-3 z-10">
                    <Checkbox 
                      checked={true}
                      onCheckedChange={() => {
                        const nativeEvent = window.event as unknown as React.MouseEvent;
                        handleSelect(contact.id, index, !!nativeEvent?.shiftKey);
                      }}
                      className="bg-background shadow-sm"
                    />
                  </div>
                )}
                <div className={selectedIds.has(contact.id) ? "translate-x-4 transition-transform" : "transition-transform"}>
                  <ContactCard
                    contact={contact}
                    onClick={() => setSelectedContact(contact)}
                    researchStatus={(() => {
                    const live = contactStatuses[contact.id]?.status;
                    if (live) return live;
                    const s = packetsByContactId.get(contact.id);
                    if (s === "complete") return "completed";
                    if (s === "failed") return "failed";
                    if (s === "queued" || s === "researching") return "processing";
                    return undefined;
                  })()}
                    onRetry={() => handleRetryContact(contact.id)}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedContact && (
        <Card className="flex-1 lg:max-w-2xl">
          <CardContent className="p-6">
            <ContactDetail
              contact={selectedContact}
              onClose={() => setSelectedContact(null)}
              onDelete={deleteContact}
            />
          </CardContent>
        </Card>
      )}

      <AddContactModal open={addModalOpen} onOpenChange={setAddModalOpen} />
      <BulkResearchDialog
        open={bulkDialogOpen}
        onOpenChange={setBulkDialogOpen}
        entries={bulkEntries}
        total={bulkTotal}
        completed={bulkCompleted}
      />
    </div>
  );
}
