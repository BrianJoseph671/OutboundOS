import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  FlaskConical,
  Play,
  Pause,
  BarChart3,
  Calendar,
  Target,
} from "lucide-react";
import type { Experiment, InsertExperiment, OutreachAttempt } from "@shared/schema";

const variableLabels: Record<string, string> = {
  hook: "Hook / Personalization",
  cta: "Call to Action",
  length: "Message Length",
  tone: "Tone / Style",
};

const channelLabels: Record<string, string> = {
  linkedin_connected: "LinkedIn (Connected)",
  linkedin_connect_request: "LinkedIn (Request)",
  email: "Email",
};

function ExperimentCard({
  experiment,
  stats,
  onToggle,
}: {
  experiment: Experiment;
  stats: { a: { sent: number; responded: number }; b: { sent: number; responded: number } };
  onToggle: () => void;
}) {
  const aRate = stats.a.sent > 0 ? ((stats.a.responded / stats.a.sent) * 100).toFixed(1) : "0";
  const bRate = stats.b.sent > 0 ? ((stats.b.responded / stats.b.sent) * 100).toFixed(1) : "0";

  const calculateSignificance = () => {
    if (stats.a.sent < 20 || stats.b.sent < 20) return null;
    
    const p1 = stats.a.responded / stats.a.sent;
    const p2 = stats.b.responded / stats.b.sent;
    const pPool = (stats.a.responded + stats.b.responded) / (stats.a.sent + stats.b.sent);
    const se = Math.sqrt(pPool * (1 - pPool) * (1/stats.a.sent + 1/stats.b.sent));
    
    if (se === 0) return null;
    
    const z = Math.abs(p1 - p2) / se;
    return z > 1.96;
  };

  const significance = calculateSignificance();

  return (
    <Card data-testid={`card-experiment-${experiment.id}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base font-medium">{experiment.name}</CardTitle>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <Badge variant="outline">{channelLabels[experiment.outreachType]}</Badge>
              <Badge variant="secondary">{variableLabels[experiment.variableTested]}</Badge>
              {experiment.active ? (
                <Badge className="bg-chart-2">Active</Badge>
              ) : (
                <Badge variant="secondary">Paused</Badge>
              )}
            </div>
          </div>
          <Switch
            checked={experiment.active || false}
            onCheckedChange={onToggle}
            data-testid={`switch-experiment-${experiment.id}`}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {experiment.hypothesis && (
          <p className="text-sm text-muted-foreground">{experiment.hypothesis}</p>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="p-3 bg-muted/50 rounded-md">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Variant A</span>
              <span className="text-sm tabular-nums">{aRate}%</span>
            </div>
            <p className="text-xs text-muted-foreground line-clamp-2">{experiment.variantAText}</p>
            <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
              <span>{stats.a.sent} sent</span>
              <span>•</span>
              <span>{stats.a.responded} responded</span>
            </div>
          </div>

          <div className="p-3 bg-muted/50 rounded-md">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Variant B</span>
              <span className="text-sm tabular-nums">{bRate}%</span>
            </div>
            <p className="text-xs text-muted-foreground line-clamp-2">{experiment.variantBText}</p>
            <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
              <span>{stats.b.sent} sent</span>
              <span>•</span>
              <span>{stats.b.responded} responded</span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t">
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            {experiment.startDate && (
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                Started {new Date(experiment.startDate).toLocaleDateString()}
              </span>
            )}
          </div>
          {significance !== null ? (
            <Badge variant={significance ? "default" : "secondary"}>
              {significance ? "Statistically Significant" : "Not Significant"}
            </Badge>
          ) : (
            <span className="text-xs text-muted-foreground">Need 20+ sends per variant</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function CreateExperimentModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const [formData, setFormData] = useState<Partial<InsertExperiment>>({
    name: "",
    outreachType: "linkedin_connected",
    hypothesis: "",
    variableTested: "hook",
    variantAText: "",
    variantBText: "",
    active: true,
  });

  const createMutation = useMutation({
    mutationFn: (data: InsertExperiment) => apiRequest("POST", "/api/experiments", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/experiments"] });
      toast({ title: "Experiment created successfully" });
      onOpenChange(false);
      setFormData({
        name: "",
        outreachType: "linkedin_connected",
        hypothesis: "",
        variableTested: "hook",
        variantAText: "",
        variantBText: "",
        active: true,
      });
    },
    onError: () => {
      toast({ title: "Failed to create experiment", variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name?.trim() || !formData.variantAText?.trim() || !formData.variantBText?.trim()) {
      toast({ title: "Please fill in all required fields", variant: "destructive" });
      return;
    }
    createMutation.mutate({
      ...formData,
      startDate: new Date(),
    } as InsertExperiment);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Experiment</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Experiment Name *</Label>
            <Input
              id="name"
              value={formData.name || ""}
              onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="e.g., Hook variation test"
              data-testid="input-experiment-name"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="outreachType">Outreach Type</Label>
              <Select
                value={formData.outreachType}
                onValueChange={(v) => setFormData((prev) => ({ ...prev, outreachType: v }))}
              >
                <SelectTrigger data-testid="select-experiment-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(channelLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="variableTested">Variable Being Tested</Label>
              <Select
                value={formData.variableTested}
                onValueChange={(v) => setFormData((prev) => ({ ...prev, variableTested: v }))}
              >
                <SelectTrigger data-testid="select-experiment-variable">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(variableLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="hypothesis">Hypothesis (optional)</Label>
            <Textarea
              id="hypothesis"
              value={formData.hypothesis || ""}
              onChange={(e) => setFormData((prev) => ({ ...prev, hypothesis: e.target.value }))}
              placeholder="I believe that variant A will outperform B because..."
              rows={2}
              data-testid="input-experiment-hypothesis"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="variantA">Variant A Text *</Label>
            <Textarea
              id="variantA"
              value={formData.variantAText || ""}
              onChange={(e) => setFormData((prev) => ({ ...prev, variantAText: e.target.value }))}
              placeholder="The first version of your message element..."
              rows={3}
              data-testid="input-experiment-variant-a"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="variantB">Variant B Text *</Label>
            <Textarea
              id="variantB"
              value={formData.variantBText || ""}
              onChange={(e) => setFormData((prev) => ({ ...prev, variantBText: e.target.value }))}
              placeholder="The second version of your message element..."
              rows={3}
              data-testid="input-experiment-variant-b"
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending} data-testid="button-create-experiment">
              {createMutation.isPending ? "Creating..." : "Create Experiment"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function Experiments() {
  const { toast } = useToast();
  const [createModalOpen, setCreateModalOpen] = useState(false);

  const { data: experiments = [], isLoading } = useQuery<Experiment[]>({
    queryKey: ["/api/experiments"],
  });

  const { data: attempts = [] } = useQuery<OutreachAttempt[]>({
    queryKey: ["/api/outreach-attempts"],
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      apiRequest("PATCH", `/api/experiments/${id}`, { active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/experiments"] });
      toast({ title: "Experiment updated" });
    },
  });

  const getExperimentStats = (experimentId: string) => {
    const expAttempts = attempts.filter((a) => a.experimentId === experimentId);
    const variantA = expAttempts.filter((a) => a.experimentVariant === "A");
    const variantB = expAttempts.filter((a) => a.experimentVariant === "B");
    
    return {
      a: { sent: variantA.length, responded: variantA.filter((a) => a.responded).length },
      b: { sent: variantB.length, responded: variantB.filter((a) => a.responded).length },
    };
  };

  const activeExperiments = experiments.filter((e) => e.active);
  const pausedExperiments = experiments.filter((e) => !e.active);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Experiments</h1>
        <Button onClick={() => setCreateModalOpen(true)} data-testid="button-create-experiment">
          <Plus className="w-4 h-4 mr-2" />
          New Experiment
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[1, 2].map((i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="animate-pulse space-y-4">
                  <div className="h-5 bg-muted rounded w-1/2" />
                  <div className="h-4 bg-muted rounded w-3/4" />
                  <div className="grid grid-cols-2 gap-4">
                    <div className="h-20 bg-muted rounded" />
                    <div className="h-20 bg-muted rounded" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : experiments.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FlaskConical className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="font-medium mb-2">No experiments yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Create your first A/B experiment to optimize your outreach messages
            </p>
            <Button onClick={() => setCreateModalOpen(true)} data-testid="button-create-first-experiment">
              <Plus className="w-4 h-4 mr-2" />
              Create Experiment
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {activeExperiments.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-medium flex items-center gap-2">
                <Play className="w-4 h-4 text-chart-2" />
                Active Experiments ({activeExperiments.length})
              </h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {activeExperiments.map((exp) => (
                  <ExperimentCard
                    key={exp.id}
                    experiment={exp}
                    stats={getExperimentStats(exp.id)}
                    onToggle={() => toggleMutation.mutate({ id: exp.id, active: false })}
                  />
                ))}
              </div>
            </div>
          )}

          {pausedExperiments.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-medium flex items-center gap-2">
                <Pause className="w-4 h-4 text-muted-foreground" />
                Paused Experiments ({pausedExperiments.length})
              </h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {pausedExperiments.map((exp) => (
                  <ExperimentCard
                    key={exp.id}
                    experiment={exp}
                    stats={getExperimentStats(exp.id)}
                    onToggle={() => toggleMutation.mutate({ id: exp.id, active: true })}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <CreateExperimentModal open={createModalOpen} onOpenChange={setCreateModalOpen} />
    </div>
  );
}
