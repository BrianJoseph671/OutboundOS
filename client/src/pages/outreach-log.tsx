import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  FileText,
  Filter,
  RotateCcw,
  Download,
  Eye,
  MoreHorizontal,
  ChevronDown,
  ChevronUp,
  Plus,
} from "lucide-react";
import type { OutreachAttempt, Contact, Experiment, InsertOutreachAttempt } from "@shared/schema";
import { format } from "date-fns";

const outreachTypeLabels: Record<string, string> = {
  linkedin_connected: "LinkedIn",
  linkedin_connect_request: "LI Request",
  email: "Email",
};

function OutcomeCell({
  attempt,
  field,
  onUpdate,
}: {
  attempt: OutreachAttempt;
  field: "responded" | "positiveResponse" | "meetingBooked" | "converted";
  onUpdate: (value: boolean) => void;
}) {
  const value = attempt[field];

  return (
    <Checkbox
      checked={value || false}
      onCheckedChange={(checked) => onUpdate(checked === true)}
      data-testid={`checkbox-${field}-${attempt.id}`}
    />
  );
}

function AttemptDetailModal({
  attempt,
  contact,
  experiment,
  open,
  onOpenChange,
}: {
  attempt: OutreachAttempt;
  contact: Contact | undefined;
  experiment: Experiment | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Outreach Details</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs text-muted-foreground">Contact</Label>
              <p className="font-medium">{contact?.name || "Unknown"}</p>
              {contact?.company && (
                <p className="text-sm text-muted-foreground">{contact.company}</p>
              )}
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Date Sent</Label>
              <p className="font-medium">{format(new Date(attempt.dateSent), "PPP 'at' p")}</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label className="text-xs text-muted-foreground">Type</Label>
              <p className="font-medium">{outreachTypeLabels[attempt.outreachType]}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Campaign</Label>
              <p className="font-medium">{attempt.campaign || "—"}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Variant</Label>
              <p className="font-medium">{attempt.messageVariantLabel || "—"}</p>
            </div>
          </div>

          {experiment && (
            <div>
              <Label className="text-xs text-muted-foreground">Experiment</Label>
              <p className="font-medium">
                {experiment.name} (Variant {attempt.experimentVariant})
              </p>
            </div>
          )}

          {attempt.subject && (
            <div>
              <Label className="text-xs text-muted-foreground">Subject Line</Label>
              <p className="font-medium">{attempt.subject}</p>
            </div>
          )}

          <div>
            <Label className="text-xs text-muted-foreground">Message Body</Label>
            <div className="mt-1 p-3 bg-muted/50 rounded-md text-sm whitespace-pre-wrap">
              {attempt.messageBody}
            </div>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Outcomes</Label>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {attempt.responded && <Badge variant="secondary">Responded</Badge>}
              {attempt.positiveResponse && <Badge className="bg-chart-2">Positive</Badge>}
              {attempt.meetingBooked && <Badge className="bg-chart-3">Meeting Booked</Badge>}
              {attempt.converted && <Badge className="bg-chart-5">Converted</Badge>}
              {!attempt.responded && !attempt.positiveResponse && !attempt.meetingBooked && !attempt.converted && (
                <span className="text-sm text-muted-foreground">No outcomes recorded yet</span>
              )}
            </div>
          </div>

          {attempt.notes && (
            <div>
              <Label className="text-xs text-muted-foreground">Notes</Label>
              <p className="text-sm whitespace-pre-wrap">{attempt.notes}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ManualEntryModal({
  open,
  onOpenChange,
  contacts,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contacts: Contact[];
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    contactId: "",
    outreachType: "linkedin_connected",
    campaign: "",
    messageBody: "",
    subject: "",
    notes: "",
  });

  const createMutation = useMutation({
    mutationFn: (data: InsertOutreachAttempt) =>
      apiRequest("POST", "/api/outreach-attempts", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/outreach-attempts"] });
      toast({ title: "Outreach entry added" });
      onOpenChange(false);
      setFormData({
        contactId: "",
        outreachType: "linkedin_connected",
        campaign: "",
        messageBody: "",
        subject: "",
        notes: "",
      });
      onSuccess();
    },
    onError: () => {
      toast({ title: "Failed to add entry", variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.contactId || !formData.messageBody) {
      toast({ title: "Please fill in required fields", variant: "destructive" });
      return;
    }
    createMutation.mutate(formData as InsertOutreachAttempt);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Manual Outreach Entry</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="contact">Contact *</Label>
            <Select
              value={formData.contactId}
              onValueChange={(value) => setFormData((prev) => ({ ...prev, contactId: value }))}
            >
              <SelectTrigger data-testid="select-manual-contact">
                <SelectValue placeholder="Select a contact" />
              </SelectTrigger>
              <SelectContent>
                {contacts.map((contact) => (
                  <SelectItem key={contact.id} value={contact.id}>
                    {contact.name} {contact.company ? `(${contact.company})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="outreach-type">Outreach Type</Label>
              <Select
                value={formData.outreachType}
                onValueChange={(value) => setFormData((prev) => ({ ...prev, outreachType: value }))}
              >
                <SelectTrigger data-testid="select-manual-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="linkedin_connected">LinkedIn Message</SelectItem>
                  <SelectItem value="linkedin_connect_request">LinkedIn Request</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="campaign">Campaign (optional)</Label>
              <Input
                id="campaign"
                value={formData.campaign}
                onChange={(e) => setFormData((prev) => ({ ...prev, campaign: e.target.value }))}
                placeholder="e.g., Q1 Outreach"
                data-testid="input-manual-campaign"
              />
            </div>
          </div>

          {formData.outreachType === "email" && (
            <div className="space-y-2">
              <Label htmlFor="subject">Subject Line</Label>
              <Input
                id="subject"
                value={formData.subject}
                onChange={(e) => setFormData((prev) => ({ ...prev, subject: e.target.value }))}
                placeholder="Email subject"
                data-testid="input-manual-subject"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="message">Message Body *</Label>
            <Textarea
              id="message"
              value={formData.messageBody}
              onChange={(e) => setFormData((prev) => ({ ...prev, messageBody: e.target.value }))}
              placeholder="Paste or type the message you sent..."
              rows={6}
              data-testid="textarea-manual-message"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
              placeholder="Any additional context..."
              rows={2}
              data-testid="textarea-manual-notes"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending} data-testid="button-save-manual-entry">
              {createMutation.isPending ? "Saving..." : "Add Entry"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function OutreachLog() {
  const { toast } = useToast();
  const [dateRange, setDateRange] = useState("all");
  const [outreachType, setOutreachType] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [campaignFilter, setCampaignFilter] = useState("all");
  const [experimentFilter, setExperimentFilter] = useState("all");
  const [selectedAttempt, setSelectedAttempt] = useState<OutreachAttempt | null>(null);
  const [sortField, setSortField] = useState<"dateSent" | "contact">("dateSent");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [showManualEntry, setShowManualEntry] = useState(false);

  const { data: attempts = [], isLoading } = useQuery<OutreachAttempt[]>({
    queryKey: ["/api/outreach-attempts"],
  });

  const { data: contacts = [] } = useQuery<Contact[]>({
    queryKey: ["/api/contacts"],
  });

  const { data: experiments = [] } = useQuery<Experiment[]>({
    queryKey: ["/api/experiments"],
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Partial<OutreachAttempt>) =>
      apiRequest("PATCH", `/api/outreach-attempts/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/outreach-attempts"] });
    },
    onError: () => {
      toast({ title: "Failed to update", variant: "destructive" });
    },
  });

  const campaigns = Array.from(new Set(attempts.map((a) => a.campaign).filter(Boolean))) as string[];

  const filteredAttempts = attempts.filter((attempt) => {
    if (outreachType !== "all" && attempt.outreachType !== outreachType) return false;
    if (campaignFilter !== "all" && attempt.campaign !== campaignFilter) return false;
    if (experimentFilter !== "all" && attempt.experimentId !== experimentFilter) return false;
    
    if (statusFilter === "responded" && !attempt.responded) return false;
    if (statusFilter === "positive" && !attempt.positiveResponse) return false;
    if (statusFilter === "booked" && !attempt.meetingBooked) return false;
    if (statusFilter === "converted" && !attempt.converted) return false;
    if (statusFilter === "no_response" && attempt.responded) return false;
    
    return true;
  });

  const sortedAttempts = [...filteredAttempts].sort((a, b) => {
    if (sortField === "dateSent") {
      const aDate = new Date(a.dateSent).getTime();
      const bDate = new Date(b.dateSent).getTime();
      return sortDirection === "desc" ? bDate - aDate : aDate - bDate;
    }
    
    const aContact = contacts.find((c) => c.id === a.contactId);
    const bContact = contacts.find((c) => c.id === b.contactId);
    const aName = aContact?.name || "";
    const bName = bContact?.name || "";
    return sortDirection === "desc" ? bName.localeCompare(aName) : aName.localeCompare(bName);
  });

  const handleExport = async () => {
    try {
      const response = await fetch("/api/export/outreach-attempts");
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `outreach-log-${format(new Date(), "yyyy-MM-dd")}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast({ title: "Export downloaded" });
    } catch {
      toast({ title: "Failed to export", variant: "destructive" });
    }
  };

  const resetFilters = () => {
    setDateRange("all");
    setOutreachType("all");
    setStatusFilter("all");
    setCampaignFilter("all");
    setExperimentFilter("all");
  };

  const toggleSort = (field: "dateSent" | "contact") => {
    if (sortField === field) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const SortIcon = ({ field }: { field: "dateSent" | "contact" }) => {
    if (sortField !== field) return null;
    return sortDirection === "desc" ? (
      <ChevronDown className="w-3 h-3" />
    ) : (
      <ChevronUp className="w-3 h-3" />
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-semibold">Outreach Log</h1>
        <div className="flex items-center gap-2">
          <Button onClick={() => setShowManualEntry(true)} data-testid="button-add-manual-entry">
            <Plus className="w-4 h-4 mr-2" />
            Add Entry
          </Button>
          <Button variant="outline" onClick={handleExport} data-testid="button-export-csv">
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="w-4 h-4 text-muted-foreground" />
        <Select value={outreachType} onValueChange={setOutreachType}>
          <SelectTrigger className="w-[140px]" data-testid="select-log-type">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="linkedin_connected">LinkedIn</SelectItem>
            <SelectItem value="linkedin_connect_request">LI Request</SelectItem>
            <SelectItem value="email">Email</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]" data-testid="select-log-status">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="responded">Responded</SelectItem>
            <SelectItem value="positive">Positive</SelectItem>
            <SelectItem value="booked">Booked</SelectItem>
            <SelectItem value="converted">Converted</SelectItem>
            <SelectItem value="no_response">No response</SelectItem>
          </SelectContent>
        </Select>
        <Select value={campaignFilter} onValueChange={setCampaignFilter}>
          <SelectTrigger className="w-[140px]" data-testid="select-log-campaign">
            <SelectValue placeholder="Campaign" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All campaigns</SelectItem>
            {campaigns.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={experimentFilter} onValueChange={setExperimentFilter}>
          <SelectTrigger className="w-[140px]" data-testid="select-log-experiment">
            <SelectValue placeholder="Experiment" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All experiments</SelectItem>
            {experiments.map((e) => (
              <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="ghost" size="icon" onClick={resetFilters} data-testid="button-reset-log-filters">
          <RotateCcw className="w-4 h-4" />
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th
                    className="text-left py-3 px-4 font-medium text-muted-foreground cursor-pointer"
                    onClick={() => toggleSort("dateSent")}
                  >
                    <span className="flex items-center gap-1">
                      Date <SortIcon field="dateSent" />
                    </span>
                  </th>
                  <th
                    className="text-left py-3 px-4 font-medium text-muted-foreground cursor-pointer"
                    onClick={() => toggleSort("contact")}
                  >
                    <span className="flex items-center gap-1">
                      Contact <SortIcon field="contact" />
                    </span>
                  </th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Type</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Campaign</th>
                  <th className="text-center py-3 px-4 font-medium text-muted-foreground">Responded</th>
                  <th className="text-center py-3 px-4 font-medium text-muted-foreground">Positive</th>
                  <th className="text-center py-3 px-4 font-medium text-muted-foreground">Booked</th>
                  <th className="text-center py-3 px-4 font-medium text-muted-foreground">Converted</th>
                  <th className="text-right py-3 px-4 font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center">
                      <div className="animate-pulse flex items-center justify-center gap-2">
                        <div className="w-4 h-4 bg-muted rounded-full" />
                        <div className="w-24 h-4 bg-muted rounded" />
                      </div>
                    </td>
                  </tr>
                ) : sortedAttempts.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center">
                      <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                      <h3 className="font-medium mb-2">No outreach attempts yet</h3>
                      <p className="text-sm text-muted-foreground">
                        Use the Composer to create and log your first outreach message
                      </p>
                    </td>
                  </tr>
                ) : (
                  sortedAttempts.map((attempt) => {
                    const contact = contacts.find((c) => c.id === attempt.contactId);
                    const experiment = experiments.find((e) => e.id === attempt.experimentId);

                    return (
                      <tr
                        key={attempt.id}
                        className="border-b last:border-0 hover:bg-muted/30 transition-colors"
                        data-testid={`row-attempt-${attempt.id}`}
                      >
                        <td className="py-3 px-4 tabular-nums">
                          {format(new Date(attempt.dateSent), "MMM d, yyyy")}
                        </td>
                        <td className="py-3 px-4">
                          <div>
                            <span className="font-medium">{contact?.name || "Unknown"}</span>
                            {contact?.company && (
                              <span className="text-muted-foreground ml-1">@ {contact.company}</span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <Badge variant="outline">{outreachTypeLabels[attempt.outreachType]}</Badge>
                        </td>
                        <td className="py-3 px-4 text-muted-foreground">
                          {attempt.campaign || "—"}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <OutcomeCell
                            attempt={attempt}
                            field="responded"
                            onUpdate={(v) => updateMutation.mutate({ id: attempt.id, responded: v })}
                          />
                        </td>
                        <td className="py-3 px-4 text-center">
                          <OutcomeCell
                            attempt={attempt}
                            field="positiveResponse"
                            onUpdate={(v) => updateMutation.mutate({ id: attempt.id, positiveResponse: v })}
                          />
                        </td>
                        <td className="py-3 px-4 text-center">
                          <OutcomeCell
                            attempt={attempt}
                            field="meetingBooked"
                            onUpdate={(v) => updateMutation.mutate({ id: attempt.id, meetingBooked: v })}
                          />
                        </td>
                        <td className="py-3 px-4 text-center">
                          <OutcomeCell
                            attempt={attempt}
                            field="converted"
                            onUpdate={(v) => updateMutation.mutate({ id: attempt.id, converted: v })}
                          />
                        </td>
                        <td className="py-3 px-4 text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setSelectedAttempt(attempt)}
                            data-testid={`button-view-attempt-${attempt.id}`}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {selectedAttempt && (
        <AttemptDetailModal
          attempt={selectedAttempt}
          contact={contacts.find((c) => c.id === selectedAttempt.contactId)}
          experiment={experiments.find((e) => e.id === selectedAttempt.experimentId)}
          open={!!selectedAttempt}
          onOpenChange={(open) => !open && setSelectedAttempt(null)}
        />
      )}

      <ManualEntryModal
        open={showManualEntry}
        onOpenChange={setShowManualEntry}
        contacts={contacts}
        onSuccess={() => {}}
      />
    </div>
  );
}
