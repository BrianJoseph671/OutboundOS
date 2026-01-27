import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import {
  Search,
  Building2,
  User,
  Sparkles,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  Mail,
  Linkedin,
  MessageSquare,
  FileCheck,
  Edit,
  Send,
  Loader2,
  Filter,
  Calendar,
  Briefcase,
  Target,
  Lightbulb,
  ArrowUpDown,
} from "lucide-react";
import type { Contact } from "@shared/schema";

interface ResearchData {
  prospectSnapshot?: {
    background?: string;
    experience?: string;
    interests?: string[];
  };
  companySnapshot?: {
    description?: string;
    funding?: string;
    recentNews?: string[];
    industry?: string;
  };
  connectionAngles?: string[];
  conversationHooks?: string[];
  draftMessage?: string;
  qaStatus?: "pending" | "approved" | "rejected";
  qaFeedback?: string;
}

function ContactResultCard({
  contact,
  onRunQA,
  onEditDraft,
  onSend,
  isQALoading,
}: {
  contact: Contact;
  onRunQA: (contact: Contact) => void;
  onEditDraft: (contact: Contact) => void;
  onSend: (contact: Contact, type: "email" | "linkedin") => void;
  isQALoading: boolean;
}) {
  const { toast } = useToast();
  const [isExpanded, setIsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const initials = contact.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const research: ResearchData = contact.notes
    ? (() => {
        try {
          return JSON.parse(contact.notes);
        } catch {
          return {};
        }
      })()
    : {};

  const handleCopyDraft = async () => {
    if (research.draftMessage) {
      await navigator.clipboard.writeText(research.draftMessage);
      setCopied(true);
      toast({ title: "Message copied to clipboard" });
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const getQAStatusBadge = () => {
    switch (research.qaStatus) {
      case "approved":
        return (
          <Badge className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
            <Check className="w-3 h-3 mr-1" />
            QA Approved
          </Badge>
        );
      case "rejected":
        return (
          <Badge variant="destructive">
            Needs Revision
          </Badge>
        );
      default:
        return (
          <Badge variant="secondary">
            Pending QA
          </Badge>
        );
    }
  };

  return (
    <Card className="overflow-hidden" data-testid={`card-result-${contact.id}`}>
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover-elevate">
            <div className="flex items-center gap-4">
              <Avatar className="w-12 h-12">
                <AvatarFallback className="bg-muted text-muted-foreground font-medium">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium">{contact.name}</h3>
                  {getQAStatusBadge()}
                </div>
                <p className="text-sm text-muted-foreground">
                  {contact.role} at {contact.company}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {isExpanded ? (
                  <ChevronDown className="w-5 h-5 text-muted-foreground" />
                ) : (
                  <ChevronRight className="w-5 h-5 text-muted-foreground" />
                )}
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="pt-0 space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <h4 className="text-sm font-medium flex items-center gap-2">
                    <User className="w-4 h-4" />
                    Prospect Snapshot
                  </h4>
                  <div className="p-3 bg-muted/50 rounded-md text-sm space-y-2">
                    {research.prospectSnapshot?.background && (
                      <p>{research.prospectSnapshot.background}</p>
                    )}
                    {research.prospectSnapshot?.experience && (
                      <p className="text-muted-foreground">
                        {research.prospectSnapshot.experience}
                      </p>
                    )}
                    {!research.prospectSnapshot?.background && (
                      <p className="text-muted-foreground italic">
                        {contact.headline || contact.about || "No background information available"}
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="text-sm font-medium flex items-center gap-2">
                    <Building2 className="w-4 h-4" />
                    Company Snapshot
                  </h4>
                  <div className="p-3 bg-muted/50 rounded-md text-sm space-y-2">
                    {research.companySnapshot?.description && (
                      <p>{research.companySnapshot.description}</p>
                    )}
                    {research.companySnapshot?.funding && (
                      <p className="text-muted-foreground">
                        <span className="font-medium">Funding:</span> {research.companySnapshot.funding}
                      </p>
                    )}
                    {research.companySnapshot?.recentNews && research.companySnapshot.recentNews.length > 0 && (
                      <div>
                        <span className="font-medium">Recent News:</span>
                        <ul className="list-disc list-inside mt-1 text-muted-foreground">
                          {research.companySnapshot.recentNews.slice(0, 3).map((news, i) => (
                            <li key={i}>{news}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {!research.companySnapshot?.description && (
                      <p className="text-muted-foreground italic">
                        {contact.company || "No company information available"}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <h4 className="text-sm font-medium flex items-center gap-2">
                    <Target className="w-4 h-4" />
                    Connection Angles
                  </h4>
                  <div className="p-3 bg-muted/50 rounded-md text-sm">
                    {research.connectionAngles && research.connectionAngles.length > 0 ? (
                      <ul className="space-y-1">
                        {research.connectionAngles.map((angle, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <span className="text-primary">•</span>
                            {angle}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-muted-foreground italic">No connection angles identified</p>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="text-sm font-medium flex items-center gap-2">
                    <Lightbulb className="w-4 h-4" />
                    Conversation Hooks
                  </h4>
                  <div className="p-3 bg-muted/50 rounded-md text-sm">
                    {research.conversationHooks && research.conversationHooks.length > 0 ? (
                      <ul className="space-y-1">
                        {research.conversationHooks.map((hook, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <span className="text-primary">•</span>
                            {hook}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-muted-foreground italic">No conversation hooks identified</p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium flex items-center gap-2">
                  <MessageSquare className="w-4 h-4" />
                  Draft Message
                </h4>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCopyDraft}
                  disabled={!research.draftMessage}
                  data-testid="button-copy-draft"
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4 mr-1" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 mr-1" />
                      Copy
                    </>
                  )}
                </Button>
              </div>
              <div className="p-3 bg-muted/50 rounded-md text-sm whitespace-pre-wrap">
                {research.draftMessage || (
                  <span className="text-muted-foreground italic">No draft message available</span>
                )}
              </div>
              {research.qaFeedback && (
                <div className="p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-md text-sm">
                  <span className="font-medium">QA Feedback:</span> {research.qaFeedback}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 pt-2 border-t flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onRunQA(contact)}
                disabled={isQALoading}
                data-testid="button-run-qa"
              >
                {isQALoading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <FileCheck className="w-4 h-4 mr-2" />
                )}
                Run QA
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onEditDraft(contact)}
                data-testid="button-edit-draft"
              >
                <Edit className="w-4 h-4 mr-2" />
                Edit Draft
              </Button>
              <div className="flex-1" />
              {contact.email && (
                <Button
                  size="sm"
                  onClick={() => onSend(contact, "email")}
                  data-testid="button-send-email"
                >
                  <Mail className="w-4 h-4 mr-2" />
                  Send Email
                </Button>
              )}
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onSend(contact, "linkedin")}
                data-testid="button-log-linkedin"
              >
                <Linkedin className="w-4 h-4 mr-2" />
                Log LinkedIn
              </Button>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

function EditDraftModal({
  contact,
  open,
  onOpenChange,
  onSave,
}: {
  contact: Contact | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (contact: Contact, newDraft: string) => void;
}) {
  const [draft, setDraft] = useState("");

  const handleOpen = () => {
    if (contact?.notes) {
      try {
        const research = JSON.parse(contact.notes);
        setDraft(research.draftMessage || "");
      } catch {
        setDraft("");
      }
    }
  };

  const handleSave = () => {
    if (contact) {
      onSave(contact, draft);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" onOpenAutoFocus={handleOpen}>
        <DialogHeader>
          <DialogTitle>Edit Draft Message</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="text-sm text-muted-foreground">
            Editing message for <span className="font-medium">{contact?.name}</span>
          </div>
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={10}
            className="font-mono text-sm"
            placeholder="Enter your message..."
            data-testid="textarea-edit-draft"
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} data-testid="button-save-draft">
              Save Changes
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function Decisions() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("date");
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [qaLoadingId, setQaLoadingId] = useState<string | null>(null);

  const { data: contacts = [], isLoading } = useQuery<Contact[]>({
    queryKey: ["/api/contacts"],
  });

  const researchedContacts = contacts.filter((c) => {
    if (c.notes) {
      try {
        const research = JSON.parse(c.notes);
        return research.draftMessage || research.prospectSnapshot || research.companySnapshot;
      } catch {
        return false;
      }
    }
    return false;
  });

  const updateContactMutation = useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes: string }) => {
      const response = await apiRequest("PUT", `/api/contacts/${id}`, { notes });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      toast({ title: "Draft updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update draft", variant: "destructive" });
    },
  });

  const runQAMutation = useMutation({
    mutationFn: async (contact: Contact) => {
      setQaLoadingId(contact.id);
      const response = await apiRequest("POST", "/api/batch/qa/run", {
        contactId: contact.id,
        message: contact.notes ? JSON.parse(contact.notes).draftMessage : "",
      });
      return response.json();
    },
    onSuccess: (data, contact) => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      toast({ title: "QA completed", description: data.approved ? "Message approved" : "Revisions suggested" });
      setQaLoadingId(null);
    },
    onError: () => {
      toast({ title: "QA failed", variant: "destructive" });
      setQaLoadingId(null);
    },
  });

  const sendMutation = useMutation({
    mutationFn: async ({ contact, type }: { contact: Contact; type: "email" | "linkedin" }) => {
      const response = await apiRequest("POST", "/api/batch/send", {
        contactId: contact.id,
        type,
        message: contact.notes ? JSON.parse(contact.notes).draftMessage : "",
      });
      return response.json();
    },
    onSuccess: (_, { type }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      toast({ title: type === "email" ? "Email sent" : "LinkedIn message logged" });
    },
    onError: () => {
      toast({ title: "Failed to send message", variant: "destructive" });
    },
  });

  const handleRunQA = (contact: Contact) => {
    runQAMutation.mutate(contact);
  };

  const handleEditDraft = (contact: Contact) => {
    setEditingContact(contact);
  };

  const handleSaveDraft = (contact: Contact, newDraft: string) => {
    let research: ResearchData = {};
    if (contact.notes) {
      try {
        research = JSON.parse(contact.notes);
      } catch {}
    }
    research.draftMessage = newDraft;
    research.qaStatus = "pending";
    updateContactMutation.mutate({ id: contact.id, notes: JSON.stringify(research) });
  };

  const handleSend = (contact: Contact, type: "email" | "linkedin") => {
    sendMutation.mutate({ contact, type });
  };

  const filteredContacts = researchedContacts
    .filter((contact) => {
      const searchLower = search.toLowerCase();
      const matchesSearch =
        contact.name.toLowerCase().includes(searchLower) ||
        contact.company?.toLowerCase().includes(searchLower) ||
        contact.role?.toLowerCase().includes(searchLower);

      if (!matchesSearch) return false;

      if (statusFilter === "all") return true;

      try {
        const research = JSON.parse(contact.notes || "{}");
        return research.qaStatus === statusFilter;
      } catch {
        return statusFilter === "pending";
      }
    })
    .sort((a, b) => {
      switch (sortBy) {
        case "name":
          return a.name.localeCompare(b.name);
        case "company":
          return (a.company || "").localeCompare(b.company || "");
        case "date":
        default:
          return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      }
    });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Decisions</h1>
        <Badge variant="secondary" className="text-sm">
          {researchedContacts.length} researched
        </Badge>
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search results..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-search-results"
          />
        </div>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]" data-testid="select-status-filter">
            <Filter className="w-4 h-4 mr-2" />
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending QA</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Needs Revision</SelectItem>
          </SelectContent>
        </Select>

        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-[150px]" data-testid="select-sort-by">
            <ArrowUpDown className="w-4 h-4 mr-2" />
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="date">Date Researched</SelectItem>
            <SelectItem value="name">Name</SelectItem>
            <SelectItem value="company">Company</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-muted rounded-full animate-pulse" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-muted rounded w-32 animate-pulse" />
                    <div className="h-3 bg-muted rounded w-48 animate-pulse" />
                  </div>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      ) : filteredContacts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Sparkles className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="font-medium mb-2">
              {search || statusFilter !== "all" ? "No matching results" : "No research completed yet"}
            </h3>
            <p className="text-sm text-muted-foreground">
              {search || statusFilter !== "all"
                ? "Try adjusting your filters"
                : "Import contacts and run research to see results here"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredContacts.map((contact) => (
            <ContactResultCard
              key={contact.id}
              contact={contact}
              onRunQA={handleRunQA}
              onEditDraft={handleEditDraft}
              onSend={handleSend}
              isQALoading={qaLoadingId === contact.id}
            />
          ))}
        </div>
      )}

      <EditDraftModal
        contact={editingContact}
        open={!!editingContact}
        onOpenChange={(open) => !open && setEditingContact(null)}
        onSave={handleSaveDraft}
      />
    </div>
  );
}
