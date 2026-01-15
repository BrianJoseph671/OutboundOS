import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  RefreshCw,
  Check,
  Send,
  User,
  Target,
  Lightbulb,
  Award,
  MessageSquare,
  Clock,
  Sparkles,
} from "lucide-react";
import type { Contact, Settings, Experiment, InsertOutreachAttempt, OutreachType, OutreachGoal, ToneOption, LengthOption } from "@shared/schema";

interface ComposerState {
  contactId: string;
  goal: OutreachGoal | "";
  channel: OutreachType | "";
  personalizationSource: string;
  personalizationHook: string;
  valueHypothesis: string;
  credibilityProof: string;
  cta: string;
  timeframe: string;
  tone: ToneOption;
  length: LengthOption;
  experimentId: string;
  campaign: string;
}

interface GeneratedVariant {
  label: string;
  subject?: string;
  body: string;
}

const steps = [
  { id: 1, label: "Contact & Goal", icon: User },
  { id: 2, label: "Channel & Hook", icon: Target },
  { id: 3, label: "CTA & Tone", icon: MessageSquare },
  { id: 4, label: "Generate", icon: Sparkles },
];

const goalLabels: Record<OutreachGoal, string> = {
  intro_chat: "Intro to another connection",
  partnership: "Partnership",
  recruiting: "Recruiting",
  advice: "Ask for Advice",
};

const channelLabels: Record<OutreachType, string> = {
  linkedin_connected: "LinkedIn (Existing Connection)",
  linkedin_connect_request: "LinkedIn Connection Request",
  linkedin_inmail: "LinkedIn InMail",
  email: "Email",
  whatsapp: "WhatsApp",
};

function StepIndicator({
  currentStep,
  steps,
}: {
  currentStep: number;
  steps: { id: number; label: string; icon: any }[];
}) {
  return (
    <div className="flex items-center justify-between mb-8">
      {steps.map((step, idx) => {
        const isActive = currentStep === step.id;
        const isCompleted = currentStep > step.id;
        const Icon = step.icon;
        
        return (
          <div key={step.id} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-colors ${
                  isActive
                    ? "bg-primary border-primary text-primary-foreground"
                    : isCompleted
                    ? "bg-chart-2 border-chart-2 text-white"
                    : "border-muted bg-background text-muted-foreground"
                }`}
              >
                {isCompleted ? (
                  <Check className="w-5 h-5" />
                ) : (
                  <Icon className="w-5 h-5" />
                )}
              </div>
              <span className={`text-xs mt-2 ${isActive ? "font-medium" : "text-muted-foreground"}`}>
                {step.label}
              </span>
            </div>
            {idx < steps.length - 1 && (
              <div
                className={`w-12 h-0.5 mx-2 mt-[-20px] ${
                  isCompleted ? "bg-chart-2" : "bg-muted"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function generateMessage(
  state: ComposerState,
  contact: Contact | undefined,
  settings: Settings | undefined,
  variant: "A" | "B" | "C"
): GeneratedVariant {
  const name = contact?.name?.split(" ")[0] || "there";
  const company = contact?.company || "your company";
  const role = contact?.role || "your role";

  const hook = "";
  const value = "I think we could have an interesting conversation.";
  const proof = "";
  const cta = state.cta || "Would you be open to a quick chat?";
  const logistics = state.timeframe && settings?.includeLogisticsLine !== false
    ? `\n\nI'm available ${state.timeframe}.`
    : "";

  const toneGreeting = {
    professional: `Hi ${name},`,
    friendly: `Hey ${name}!`,
    direct: name + ",",
  };

  const greeting = toneGreeting[state.tone] || toneGreeting.professional;

  let body = "";
  
  if (state.channel === "linkedin_connect_request") {
    const limit = settings?.connectionRequestCharLimit || 300;
    body = `${greeting}\n\n${value}\n\n${cta}`.slice(0, limit);
  } else {
    body = `${greeting}\n\n${value}\n\n${cta}${logistics}`;
  }

  if (state.length === "short") {
    body = body.split("\n\n").slice(0, 3).join("\n\n");
  } else if (state.length === "long") {
    body = body + `\n\nI've been working in this space and have seen what works.`;
  }

  let subject: string | undefined;
  if (state.channel === "email") {
    const patterns = settings?.emailSubjectPatterns?.split("\n") || [
      "Quick question about {company}",
      "{name} x networking",
    ];
    const pattern = patterns[variant === "A" ? 0 : variant === "B" ? 1 : 0] || patterns[0];
    subject = pattern
      .replace("{company}", company)
      .replace("{name}", name)
      .replace("{role}", role);
  }

  return {
    label: variant,
    subject,
    body: body.trim(),
  };
}

function VariantCard({
  variant,
  onEdit,
  onCopy,
  copied,
  channel,
}: {
  variant: GeneratedVariant;
  onEdit: (body: string, subject?: string) => void;
  onCopy: () => void;
  copied: boolean;
  channel: OutreachType | "";
}) {
  const charCount = variant.body.length;
  const charLimit = channel === "linkedin_connect_request" ? 300 : undefined;
  const isOverLimit = charLimit && charCount > charLimit;

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="py-3 px-4 border-b flex-row items-center justify-between gap-2">
        <Badge variant="secondary">Variant {variant.label}</Badge>
        <Button
          variant="ghost"
          size="sm"
          onClick={onCopy}
          data-testid={`button-copy-variant-${variant.label}`}
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
      </CardHeader>
      <CardContent className="p-4 flex-1 flex flex-col gap-3">
        {variant.subject && (
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Subject Line</Label>
            <Input
              value={variant.subject}
              onChange={(e) => onEdit(variant.body, e.target.value)}
              className="text-sm"
              data-testid={`input-variant-${variant.label}-subject`}
            />
          </div>
        )}
        <div className="flex-1 flex flex-col space-y-1">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">Message Body</Label>
            {charLimit && (
              <span className={`text-xs ${isOverLimit ? "text-destructive" : "text-muted-foreground"}`}>
                {charCount}/{charLimit}
              </span>
            )}
          </div>
          <Textarea
            value={variant.body}
            onChange={(e) => onEdit(e.target.value, variant.subject)}
            className="flex-1 min-h-[200px] text-sm resize-none"
            data-testid={`input-variant-${variant.label}-body`}
          />
        </div>
      </CardContent>
    </Card>
  );
}

export default function Composer() {
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(1);
  const [copiedVariant, setCopiedVariant] = useState<string | null>(null);

  const [state, setState] = useState<ComposerState>({
    contactId: "",
    goal: "",
    channel: "",
    personalizationSource: "",
    personalizationHook: "",
    valueHypothesis: "",
    credibilityProof: "",
    cta: "",
    timeframe: "",
    tone: "professional",
    length: "medium",
    experimentId: "",
    campaign: "",
  });

  const [variants, setVariants] = useState<GeneratedVariant[]>([]);

  const { data: contacts = [] } = useQuery<Contact[]>({ queryKey: ["/api/contacts"] });
  const { data: settings } = useQuery<Settings>({ queryKey: ["/api/settings"] });
  const { data: experiments = [] } = useQuery<Experiment[]>({ queryKey: ["/api/experiments"] });

  const sortedContacts = useMemo(() => {
    return [...contacts].sort((a, b) => {
      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    });
  }, [contacts]);

  const selectedContact = contacts.find((c) => c.id === state.contactId);

  const activeExperiments = experiments.filter(
    (e) => e.active && (!state.channel || e.outreachType === state.channel)
  );

  const personalizationOptions = [
    { value: "Role", label: "Role" },
    { value: "Company", label: "Company" },
    { value: "University", label: "University" },
    { value: "Extracurricular", label: "Extracurricular" },
    { value: "Personal", label: "Personal" },
  ];

  const logMutation = useMutation({
    mutationFn: (data: InsertOutreachAttempt) => apiRequest("POST", "/api/outreach-attempts", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/outreach-attempts"] });
      toast({ title: "Outreach logged successfully" });
    },
    onError: () => {
      toast({ title: "Failed to log outreach", variant: "destructive" });
    },
  });

  const handleGenerate = () => {
    const generatedVariants: GeneratedVariant[] = ["A", "B", "C"].map((v) =>
      generateMessage(state, selectedContact, settings || undefined, v as "A" | "B" | "C")
    );
    setVariants(generatedVariants);
  };

  const handleRegenerate = () => {
    handleGenerate();
    toast({ title: "Variants regenerated" });
  };

  const handleCopy = async (variant: GeneratedVariant) => {
    const text = variant.subject
      ? `Subject: ${variant.subject}\n\n${variant.body}`
      : variant.body;
    await navigator.clipboard.writeText(text);
    setCopiedVariant(variant.label);
    setTimeout(() => setCopiedVariant(null), 2000);
    toast({ title: "Copied to clipboard" });
  };

  const handleLogOutreach = (variant: GeneratedVariant) => {
    if (!state.contactId || !state.channel) {
      toast({ title: "Select a contact and channel first", variant: "destructive" });
      return;
    }

    const selectedExperiment = experiments.find((e) => e.id === state.experimentId);

    logMutation.mutate({
      contactId: state.contactId,
      outreachType: state.channel,
      campaign: state.campaign || null,
      messageVariantLabel: variant.label,
      messageBody: variant.body,
      subject: variant.subject || null,
      experimentId: state.experimentId || null,
      experimentVariant: state.experimentId ? variant.label : null,
      responded: false,
      positiveResponse: false,
      meetingBooked: false,
      converted: false,
      notes: null,
    });
  };

  const handleVariantEdit = (index: number, body: string, subject?: string) => {
    setVariants((prev) =>
      prev.map((v, i) => (i === index ? { ...v, body, subject } : v))
    );
  };

  const canProceed = () => {
    switch (currentStep) {
      case 1: return state.contactId && state.goal;
      case 2: return state.channel && state.personalizationSource;
      case 3: return state.cta;
      case 4: return true;
      default: return true;
    }
  };

  const nextStep = () => {
    if (currentStep < 4) {
      setCurrentStep(currentStep + 1);
      if (currentStep === 3) {
        handleGenerate();
      }
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-semibold">Message Composer</h1>

      <Card>
        <CardContent className="p-6">
          <StepIndicator currentStep={currentStep} steps={steps} />

          {currentStep === 1 && (
            <div className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="contact">Select Contact *</Label>
                <Select
                  value={state.contactId}
                  onValueChange={(v) => setState((s) => ({ ...s, contactId: v }))}
                >
                  <SelectTrigger data-testid="select-composer-contact">
                    <SelectValue placeholder="Choose a contact" />
                  </SelectTrigger>
                  <SelectContent>
                    {sortedContacts.length === 0 ? (
                      <SelectItem value="none" disabled>No contacts yet</SelectItem>
                    ) : (
                      sortedContacts.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name} {c.company && `- ${c.company}`}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="goal">Outreach Goal *</Label>
                <Select
                  value={state.goal}
                  onValueChange={(v) => setState((s) => ({ ...s, goal: v as OutreachGoal }))}
                >
                  <SelectTrigger data-testid="select-composer-goal">
                    <SelectValue placeholder="What's your goal?" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(goalLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="campaign">Campaign (optional)</Label>
                <Input
                  id="campaign"
                  value={state.campaign}
                  onChange={(e) => setState((s) => ({ ...s, campaign: e.target.value }))}
                  placeholder="e.g., Q1 Enterprise, Series A Founders"
                  data-testid="input-composer-campaign"
                />
              </div>
            </div>
          )}

          {currentStep === 2 && (
            <div className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="channel">Channel / Type *</Label>
                <Select
                  value={state.channel}
                  onValueChange={(v) => setState((s) => ({ ...s, channel: v as OutreachType }))}
                >
                  <SelectTrigger data-testid="select-composer-channel">
                    <SelectValue placeholder="Choose channel" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(channelLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {state.channel === "linkedin_connect_request" && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Max {settings?.connectionRequestCharLimit || 300} characters
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Personalization Source</Label>
                <Select
                  value={state.personalizationSource}
                  onValueChange={(v) => {
                    setState((s) => ({
                      ...s,
                      personalizationSource: v,
                    }));
                  }}
                >
                  <SelectTrigger data-testid="select-composer-personalization">
                    <SelectValue placeholder="Select personalization source" />
                  </SelectTrigger>
                  <SelectContent>
                    {personalizationOptions.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {currentStep === 3 && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="tone">Tone</Label>
                  <Select
                    value={state.tone}
                    onValueChange={(v) => setState((s) => ({ ...s, tone: v as ToneOption }))}
                  >
                    <SelectTrigger data-testid="select-composer-tone">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="professional">Professional</SelectItem>
                      <SelectItem value="friendly">Friendly</SelectItem>
                      <SelectItem value="direct">Direct</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="length">Length</Label>
                  <Select
                    value={state.length}
                    onValueChange={(v) => setState((s) => ({ ...s, length: v as LengthOption }))}
                  >
                    <SelectTrigger data-testid="select-composer-length">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="short">Short</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="long">Long</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="cta">Ask / CTA *</Label>
                <Input
                  id="cta"
                  value={state.cta}
                  onChange={(e) => setState((s) => ({ ...s, cta: e.target.value }))}
                  placeholder="a 15-minute chat"
                  data-testid="input-composer-cta"
                />
                <p className="text-xs text-muted-foreground">
                  What you're asking for (chat, intro, referral, etc.)
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="timeframe">Timeframe (optional)</Label>
                <Input
                  id="timeframe"
                  value={state.timeframe}
                  onChange={(e) => setState((s) => ({ ...s, timeframe: e.target.value }))}
                  placeholder="this week or next"
                  data-testid="input-composer-timeframe"
                />
              </div>

              {activeExperiments.length > 0 && (
                <div className="space-y-2">
                  <Label htmlFor="experiment">A/B Experiment (optional)</Label>
                  <Select
                    value={state.experimentId || "none"}
                    onValueChange={(v) => setState((s) => ({ ...s, experimentId: v === "none" ? "" : v }))}
                  >
                    <SelectTrigger data-testid="select-composer-experiment">
                      <SelectValue placeholder="Select an experiment" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {activeExperiments.map((e) => (
                        <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}

          {currentStep === 4 && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium">Generated Variants</h3>
                <Button variant="outline" onClick={handleRegenerate} data-testid="button-regenerate">
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Regenerate
                </Button>
              </div>

              {variants.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Sparkles className="w-12 h-12 mx-auto mb-4" />
                  <p>Click Generate to create message variants</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {variants.map((variant, idx) => (
                    <div key={variant.label} className="space-y-2">
                      <VariantCard
                        variant={variant}
                        onEdit={(body, subject) => handleVariantEdit(idx, body, subject)}
                        onCopy={() => handleCopy(variant)}
                        copied={copiedVariant === variant.label}
                        channel={state.channel}
                      />
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => handleLogOutreach(variant)}
                        disabled={logMutation.isPending}
                        data-testid={`button-log-variant-${variant.label}`}
                      >
                        <Send className="w-4 h-4 mr-2" />
                        Log Outreach
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex justify-between mt-8 pt-6 border-t">
            <Button
              variant="outline"
              onClick={prevStep}
              disabled={currentStep === 1}
              data-testid="button-composer-back"
            >
              <ChevronLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            {currentStep < 4 ? (
              <Button
                onClick={nextStep}
                disabled={!canProceed()}
                data-testid="button-composer-next"
              >
                {currentStep === 3 ? "Generate" : "Next"}
                <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            ) : (
              <Button
                variant="outline"
                onClick={() => {
                  setCurrentStep(1);
                  setVariants([]);
                  setState({
                    contactId: "",
                    goal: "",
                    channel: "",
                    personalizationSource: "",
                    personalizationHook: "",
                    valueHypothesis: "",
                    credibilityProof: "",
                    cta: "",
                    timeframe: "",
                    tone: "professional",
                    length: "medium",
                    experimentId: "",
                    campaign: "",
                  });
                }}
                data-testid="button-composer-reset"
              >
                Start New Message
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
