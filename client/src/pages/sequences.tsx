import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Play,
  Pause,
  XCircle,
  CheckCircle2,
  Clock,
  Send,
  SkipForward,
  ListChecks,
} from "lucide-react";
import type { Contact } from "@shared/schema";

interface SequenceTemplate {
  id: string;
  name: string;
  steps: Array<{ stepNumber: number; delayDays: number; instructions: string }>;
}

interface SequenceStep {
  id: string;
  stepNumber: number;
  delayDays: number;
  instructions: string;
  status: string;
  scheduledFor: string | null;
  sentAt: string | null;
  subject: string | null;
}

interface Sequence {
  id: string;
  contactId: string;
  name: string;
  status: string;
  templateId: string | null;
  createdAt: string;
  steps?: SequenceStep[];
}

const STATUS_BADGE: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  active: { label: "Active", variant: "default" },
  completed: { label: "Completed", variant: "secondary" },
  paused: { label: "Paused", variant: "outline" },
  cancelled: { label: "Cancelled", variant: "destructive" },
};

const STEP_STATUS_COLORS: Record<string, string> = {
  pending: "bg-muted text-muted-foreground",
  due: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  sent: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  skipped: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500",
};

export default function SequencesPage() {
  const { toast } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [selectedContactId, setSelectedContactId] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [sequenceName, setSequenceName] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: sequences = [], isLoading } = useQuery<Sequence[]>({
    queryKey: ["/api/sequences"],
  });

  const { data: templates = [] } = useQuery<SequenceTemplate[]>({
    queryKey: ["/api/sequence-templates"],
  });

  const { data: contacts = [] } = useQuery<Contact[]>({
    queryKey: ["/api/contacts"],
  });

  const { data: expandedSequence } = useQuery<Sequence & { steps: SequenceStep[] }>({
    queryKey: ["/api/sequences", expandedId],
    enabled: !!expandedId,
  });

  const createMutation = useMutation({
    mutationFn: (body: { contactId: string; name: string; templateId: string }) =>
      apiRequest("POST", "/api/sequences", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sequences"] });
      setShowCreate(false);
      setSelectedContactId("");
      setSelectedTemplateId("");
      setSequenceName("");
      toast({ title: "Sequence created" });
    },
    onError: () => toast({ title: "Failed to create sequence", variant: "destructive" }),
  });

  const actionMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: string }) =>
      apiRequest("PATCH", `/api/sequences/${id}`, { action }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sequences"] });
      toast({ title: "Sequence updated" });
    },
  });

  const processDueMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/sequences/process-due"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sequences"] });
      queryClient.invalidateQueries({ queryKey: ["/api/actions"] });
      toast({ title: "Due steps processed" });
    },
  });

  const handleCreate = () => {
    if (!selectedContactId || !selectedTemplateId || !sequenceName) return;
    createMutation.mutate({
      contactId: selectedContactId,
      name: sequenceName,
      templateId: selectedTemplateId,
    });
  };

  const contactMap = new Map(contacts.map((c) => [c.id, c]));

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Sequences</h1>
        <div className="grid gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Sequences</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => processDueMutation.mutate()}>
            <Clock className="w-4 h-4 mr-2" />
            Process Due Steps
          </Button>
          <Dialog open={showCreate} onOpenChange={setShowCreate}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="w-4 h-4 mr-2" />
                New Sequence
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Sequence</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label>Contact</Label>
                  <Select value={selectedContactId} onValueChange={setSelectedContactId}>
                    <SelectTrigger><SelectValue placeholder="Select contact" /></SelectTrigger>
                    <SelectContent>
                      {contacts.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}{c.company ? ` — ${c.company}` : ""}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Template</Label>
                  <Select value={selectedTemplateId} onValueChange={(v) => {
                    setSelectedTemplateId(v);
                    const t = templates.find((t) => t.id === v);
                    if (t && !sequenceName) setSequenceName(t.name);
                  }}>
                    <SelectTrigger><SelectValue placeholder="Select template" /></SelectTrigger>
                    <SelectContent>
                      {templates.map((t) => (
                        <SelectItem key={t.id} value={t.id}>{t.name} ({t.steps.length} steps)</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Sequence Name</Label>
                  <Input value={sequenceName} onChange={(e) => setSequenceName(e.target.value)} placeholder="e.g., Networking follow-up" />
                </div>
                <Button onClick={handleCreate} disabled={createMutation.isPending || !selectedContactId || !selectedTemplateId || !sequenceName} className="w-full">
                  {createMutation.isPending ? "Creating..." : "Create Sequence"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {sequences.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <ListChecks className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg font-medium">No sequences yet</p>
            <p className="text-sm mt-1">Create a multi-step email sequence for a contact to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {sequences.map((seq) => {
            const contact = contactMap.get(seq.contactId);
            const badge = STATUS_BADGE[seq.status] || STATUS_BADGE.active;
            const isExpanded = expandedId === seq.id;

            return (
              <Card key={seq.id} className="cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : seq.id)}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base">{seq.name}</CardTitle>
                      <CardDescription>
                        {contact?.name || "Unknown"}{contact?.company ? ` — ${contact.company}` : ""}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                      {seq.status === "active" && (
                        <Button variant="ghost" size="sm" onClick={() => actionMutation.mutate({ id: seq.id, action: "pause" })}>
                          <Pause className="h-4 w-4" />
                        </Button>
                      )}
                      {seq.status === "paused" && (
                        <Button variant="ghost" size="sm" onClick={() => actionMutation.mutate({ id: seq.id, action: "resume" })}>
                          <Play className="h-4 w-4" />
                        </Button>
                      )}
                      {(seq.status === "active" || seq.status === "paused") && (
                        <Button variant="ghost" size="sm" onClick={() => actionMutation.mutate({ id: seq.id, action: "cancel" })}>
                          <XCircle className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                {isExpanded && expandedSequence?.steps && (
                  <CardContent>
                    <Separator className="mb-4" />
                    <div className="space-y-3">
                      {expandedSequence.steps.map((step) => (
                        <div key={step.id} className="flex items-start gap-3 text-sm">
                          <div className={`mt-0.5 px-2 py-0.5 rounded text-xs font-medium ${STEP_STATUS_COLORS[step.status] || ""}`}>
                            {step.status === "sent" && <CheckCircle2 className="h-3 w-3 inline mr-1" />}
                            {step.status === "due" && <Clock className="h-3 w-3 inline mr-1" />}
                            {step.status === "skipped" && <SkipForward className="h-3 w-3 inline mr-1" />}
                            Step {step.stepNumber}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-muted-foreground truncate">{step.instructions}</p>
                            {step.scheduledFor && step.status === "pending" && (
                              <p className="text-xs text-muted-foreground mt-0.5">
                                Scheduled: {new Date(step.scheduledFor).toLocaleDateString()}
                              </p>
                            )}
                            {step.sentAt && (
                              <p className="text-xs text-green-600 mt-0.5">
                                Sent: {new Date(step.sentAt).toLocaleDateString()}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
