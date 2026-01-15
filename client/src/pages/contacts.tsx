import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
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
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import type { Contact, InsertContact, OutreachAttempt } from "@shared/schema";

function ContactCard({
  contact,
  onClick,
}: {
  contact: Contact;
  onClick: () => void;
}) {
  const initials = contact.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const tags = contact.tags?.split(",").filter(Boolean) || [];

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
              <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
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
}: {
  contact: Contact;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const { data: attempts = [] } = useQuery<OutreachAttempt[]>({
    queryKey: ["/api/outreach-attempts", { contactId: contact.id }],
  });

  const contactAttempts = attempts.filter((a) => a.contactId === contact.id);

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/contacts/${contact.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      toast({ title: "Contact deleted successfully" });
      onClose();
    },
    onError: () => {
      toast({ title: "Failed to delete contact", variant: "destructive" });
    },
  });

  const handleDelete = () => {
    if (confirm("Are you sure you want to delete this contact?")) {
      deleteMutation.mutate();
    }
  };

  const initials = contact.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const tags = contact.tags?.split(",").filter(Boolean) || [];
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
            disabled={deleteMutation.isPending}
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

  const createMutation = useMutation({
    mutationFn: (data: InsertContact) =>
      apiRequest("POST", "/api/contacts", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      toast({ title: "Contact created successfully" });
      onOpenChange(false);
      resetForm();
    },
    onError: () => {
      toast({ title: "Failed to create contact", variant: "destructive" });
    },
  });

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
    let savedCount = 0;

    try {
      for (const contact of selectedContacts) {
        await apiRequest("POST", "/api/contacts", contact);
        savedCount++;
      }

      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      toast({ title: `Saved ${savedCount} contacts successfully` });
      onOpenChange(false);
      resetForm();
    } catch (error) {
      toast({
        title: `Saved ${savedCount} contacts, but some failed`,
        variant: "destructive",
      });
    } finally {
      setIsSavingBatch(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const dataToSubmit = activeTab === "pdf" && pdfData ? pdfData : formData;
    if (!dataToSubmit.name?.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    createMutation.mutate(dataToSubmit as InsertContact);
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
                  disabled={createMutation.isPending}
                  data-testid="button-save-contact"
                >
                  {createMutation.isPending ? "Saving..." : "Save Contact"}
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
            disabled={createMutation.isPending}
            data-testid="button-save-contact"
          >
            {createMutation.isPending ? "Saving..." : "Save Contact"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function Contacts() {
  const [search, setSearch] = useState("");
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);

  const { data: contacts = [], isLoading } = useQuery<Contact[]>({
    queryKey: ["/api/contacts"],
  });

  const sortedContacts = [...contacts].sort((a, b) => {
    return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
  });

  const filteredContacts = sortedContacts.filter((contact) => {
    const searchLower = search.toLowerCase();
    return (
      contact.name.toLowerCase().includes(searchLower) ||
      contact.company?.toLowerCase().includes(searchLower) ||
      contact.role?.toLowerCase().includes(searchLower) ||
      contact.tags?.toLowerCase().includes(searchLower)
    );
  });

  return (
    <div className="flex gap-6 h-full">
      <div
        className={`flex-1 space-y-6 ${selectedContact ? "hidden lg:block lg:max-w-md" : ""}`}
      >
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold">Contacts</h1>
          <Button
            onClick={() => setAddModalOpen(true)}
            data-testid="button-add-contact"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Contact
          </Button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search contacts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-search-contacts"
          />
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
            {filteredContacts.map((contact) => (
              <ContactCard
                key={contact.id}
                contact={contact}
                onClick={() => setSelectedContact(contact)}
              />
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
            />
          </CardContent>
        </Card>
      )}

      <AddContactModal open={addModalOpen} onOpenChange={setAddModalOpen} />
    </div>
  );
}
