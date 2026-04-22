import { useState, useRef, useEffect, useCallback } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useActions } from "@/hooks/useActions";
import { useBrief } from "@/hooks/useBrief";
import { useCompose } from "@/hooks/useCompose";
import { useToast } from "@/hooks/use-toast";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import {
  ArrowLeft,
  Send,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Mail,
  Calendar,
  Video,
  Loader2,
  Flame,
  Snowflake,
  Users,
  Building2,
  AlertCircle,
} from "lucide-react";
import type { ActionType } from "@shared/types/actions";
import type { ChatMessage, PlayType, ComposeResponse } from "@shared/types/draft";

const ACTION_TYPE_CONFIG: Record<
  ActionType,
  { label: string; className: string }
> = {
  follow_up: {
    label: "Follow Up",
    className:
      "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800",
  },
  reconnect: {
    label: "Reconnect",
    className:
      "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800",
  },
  open_thread: {
    label: "Open Thread",
    className:
      "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-800",
  },
  new_contact: {
    label: "New Contact",
    className:
      "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800",
  },
  new_reply: {
    label: "New Reply",
    className:
      "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800",
  },
  sequence_step: {
    label: "Sequence Step",
    className:
      "bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-400 dark:border-indigo-800",
  },
};

interface ActionDetail {
  id: string;
  userId: string;
  contactId: string;
  actionType: ActionType;
  triggerInteractionId: string | null;
  priority: number;
  status: string;
  snoozedUntil: string | null;
  reason: string;
  createdAt: string;
  completedAt: string | null;
  contactName: string;
  contactCompany: string | null;
  contactEmail: string | null;
  triggerInteractionSummary: string | null;
  triggerInteractionChannel: string | null;
}

function SourceIcon({ channel }: { channel: string | null }) {
  if (channel === "email") return <Mail className="h-4 w-4 text-muted-foreground" />;
  if (channel === "meeting") return <Calendar className="h-4 w-4 text-muted-foreground" />;
  return <Video className="h-4 w-4 text-muted-foreground" />;
}

const PRESETS: Array<{ type: PlayType; label: string; icon: React.ReactNode; tooltip: string }> = [
  { type: "warm", label: "Warm", icon: <Flame className="h-3.5 w-3.5" />, tooltip: "Reference shared history and open threads" },
  { type: "cold", label: "Cold", icon: <Snowflake className="h-3.5 w-3.5" />, tooltip: "Professional outreach with value proposition" },
  { type: "intro", label: "Intro", icon: <Users className="h-3.5 w-3.5" />, tooltip: "Request an introduction through this contact" },
];

const BRIEF_SECTION_LABELS: Record<string, string> = {
  relationshipSummary: "Relationship Summary",
  recentInteractions: "Recent Interactions",
  openThreads: "Open Threads",
  relationshipHealth: "Relationship Health",
  suggestedApproach: "Suggested Approach",
};

export default function DraftWorkspace() {
  const [, params] = useRoute("/actions/:id/draft");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const actionId = params?.id;

  const { completeAction } = useActions();
  const { compose, revise } = useCompose();

  const { data: action, isLoading: actionLoading, isError: actionError } = useQuery<ActionDetail>({
    queryKey: ["/api/actions", actionId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/actions/${actionId}`);
      return res.json();
    },
    enabled: !!actionId,
  });

  const { brief, isLoading: briefLoading, isError: briefError, regenerate } = useBrief(action?.contactId);

  const [draftTo, setDraftTo] = useState("");
  const [draftSubject, setDraftSubject] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(null);
  const [currentDraftThreadId, setCurrentDraftThreadId] = useState<string | null>(null);
  const [hasComposed, setHasComposed] = useState(false);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: "system-1",
      role: "assistant",
      content: "Ready to help you draft a message. Choose a preset or type your instructions below.",
      timestamp: new Date().toISOString(),
    },
  ]);
  const [chatInput, setChatInput] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);

  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    relationshipSummary: true,
    recentInteractions: true,
    openThreads: true,
    relationshipHealth: false,
    suggestedApproach: true,
  });

  const toggleSection = (key: string) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  useEffect(() => {
    if (action?.contactEmail && !draftTo) {
      setDraftTo(action.contactEmail);
    }
  }, [action?.contactEmail, draftTo]);

  // Esc to go back
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        const active = document.activeElement;
        const isInputFocused =
          active instanceof HTMLInputElement ||
          active instanceof HTMLTextAreaElement;
        if (!isInputFocused) {
          navigate("/actions");
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigate]);

  const applyDraftResponse = useCallback((res: ComposeResponse) => {
    if (res.to) setDraftTo(res.to);
    if (res.subject) setDraftSubject(res.subject);
    setDraftBody(res.body);
    setCurrentDraftId(res.draftId);
    setCurrentDraftThreadId(res.draftThreadId);
    setHasComposed(true);
  }, []);

  const handleCompose = useCallback(
    async (instructions: string, playType?: PlayType) => {
      if (!actionId || !action?.contactId) return;

      const userMsg: ChatMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        content: playType ? `[${playType.toUpperCase()} preset] ${instructions}` : instructions,
        timestamp: new Date().toISOString(),
      };
      setChatMessages((prev) => [...prev, userMsg]);

      try {
        let result: ComposeResponse;

        if (hasComposed && currentDraftId && currentDraftThreadId) {
          result = await revise.mutateAsync({
            draftId: currentDraftId,
            draftThreadId: currentDraftThreadId,
            instructions,
            actionId,
            contactId: action.contactId,
          });
        } else {
          result = await compose.mutateAsync({
            actionId,
            contactId: action.contactId,
            instructions,
            playType: playType || null,
            to: draftTo || undefined,
            subject: draftSubject || undefined,
          });
        }

        applyDraftResponse(result);

        const assistantMsg: ChatMessage = {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: hasComposed
            ? "Draft revised. Check the center panel for the updated version."
            : "Draft generated. Review and edit in the center panel, or ask me to revise it.",
          timestamp: new Date().toISOString(),
        };
        setChatMessages((prev) => [...prev, assistantMsg]);
      } catch {
        const errorMsg: ChatMessage = {
          id: `error-${Date.now()}`,
          role: "assistant",
          content: "Something went wrong generating the draft. Please try again.",
          timestamp: new Date().toISOString(),
        };
        setChatMessages((prev) => [...prev, errorMsg]);
      }

      // Preserve focus on chat input after send
      requestAnimationFrame(() => chatInputRef.current?.focus());
    },
    [actionId, action?.contactId, hasComposed, currentDraftId, currentDraftThreadId, draftTo, draftSubject, compose, revise, applyDraftResponse]
  );

  const handlePreset = (playType: PlayType) => {
    const presetInstructions: Record<PlayType, string> = {
      warm: "Draft a warm follow-up referencing our recent conversations.",
      cold: "Draft a professional outreach focused on value proposition.",
      intro: "Draft an introduction request — make the ask clear and concise.",
    };
    handleCompose(presetInstructions[playType], playType);
  };

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    handleCompose(chatInput.trim());
    setChatInput("");
  };

  const handleSend = async () => {
    if (!actionId || !draftBody.trim()) return;
    completeAction.mutate(actionId, {
      onSuccess: () => {
        toast({ title: "Draft sent and action completed" });
        navigate("/actions");
      },
      onError: () => {
        toast({
          title: "Failed to send",
          description: "Could not complete the action. Please try again.",
          variant: "destructive",
        });
      },
    });
  };

  const handleBack = () => navigate("/actions");

  const isComposing = compose.isPending || revise.isPending;
  const isSending = completeAction.isPending;

  // ── Loading skeleton ──────────────────────────────────────────────────────
  if (actionLoading) {
    return (
      <div className="flex flex-col h-[calc(100vh-7rem)] -mx-6 -my-6" data-testid="draft-workspace-loading">
        {/* Top bar skeleton */}
        <div className="flex items-center gap-3 px-4 py-3 border-b bg-background shrink-0">
          <Skeleton className="h-8 w-8 rounded-md" />
          <Skeleton className="h-8 w-8 rounded-full" />
          <div className="flex flex-col gap-1">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
        {/* 3-panel skeleton */}
        <div className="flex flex-1 min-h-0">
          <div className="w-[30%] border-r p-4 flex flex-col gap-3">
            <Skeleton className="h-4 w-24" />
            <div className="flex gap-2">
              <Skeleton className="h-7 w-16 rounded-md" />
              <Skeleton className="h-7 w-16 rounded-md" />
              <Skeleton className="h-7 w-16 rounded-md" />
            </div>
            <Skeleton className="h-20 w-full rounded-lg" />
            <Skeleton className="h-20 w-full rounded-lg" />
          </div>
          <div className="w-[35%] border-r p-4 flex flex-col gap-3">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-8 w-full rounded-md" />
            <Skeleton className="h-8 w-full rounded-md" />
            <Skeleton className="h-40 w-full rounded-md" />
          </div>
          <div className="w-[35%] p-4 flex flex-col gap-3">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-20 w-full rounded-xl" />
            <Skeleton className="h-20 w-full rounded-xl" />
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-16 w-full rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  // ── Error state ───────────────────────────────────────────────────────────
  if (actionError || !action) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4" data-testid="draft-workspace-error">
        <AlertCircle className="h-6 w-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          This action could not be loaded. It may have been deleted or you may not have access.
        </p>
        <Button variant="outline" size="sm" onClick={handleBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Actions
        </Button>
      </div>
    );
  }

  const config = ACTION_TYPE_CONFIG[action.actionType];

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)] -mx-6 -my-6" data-testid="draft-workspace">
      {/* ── Top bar ────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b bg-background shrink-0">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleBack}
              className="h-8 w-8"
              data-testid="back-button"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Back to Actions (Esc)</TooltipContent>
        </Tooltip>

        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <span className="text-xs font-semibold text-primary">
            {action.contactName.charAt(0).toUpperCase()}
          </span>
        </div>
        <div className="flex flex-col min-w-0">
          <span className="font-semibold text-sm leading-tight">{action.contactName}</span>
          {action.contactCompany && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Building2 className="h-3 w-3" />
              {action.contactCompany}
            </span>
          )}
        </div>
        <Badge variant="outline" className={config.className}>
          {config.label}
        </Badge>
      </div>

      {/* ── 3-column layout ────────────────────────────────────────────────── */}
      <ResizablePanelGroup direction="horizontal" className="flex-1 min-h-0">

        {/* ── Left: AI Chat ────────────────────────────────────────────────── */}
        <ResizablePanel defaultSize={30} minSize={20} data-testid="chat-panel">
          <div className="flex flex-col h-full">
            <div className="px-4 py-3 border-b shrink-0">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                AI Assistant
              </h2>
              <div className="flex gap-2">
                {PRESETS.map((preset) => (
                  <Tooltip key={preset.type}>
                    <TooltipTrigger asChild>
                      <span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handlePreset(preset.type)}
                          disabled={isComposing}
                          data-testid={`preset-${preset.type}`}
                          className="text-xs h-7 gap-1"
                        >
                          {preset.icon}
                          {preset.label}
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      {isComposing ? "Generating draft..." : preset.tooltip}
                    </TooltipContent>
                  </Tooltip>
                ))}
              </div>
            </div>

            <ScrollArea className="flex-1 min-h-0">
              <div className="px-4 py-3 flex flex-col gap-3">
                {chatMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`text-sm rounded-lg p-3 ${
                      msg.role === "user"
                        ? "bg-primary/10 ml-6"
                        : "bg-muted mr-6"
                    }`}
                  >
                    <p className="text-[11px] font-medium mb-1 text-muted-foreground">
                      {msg.role === "user" ? "You" : "Assistant"}
                    </p>
                    <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                  </div>
                ))}
                {isComposing && (
                  <div className="bg-muted mr-6 rounded-lg p-3 flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Generating...
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
            </ScrollArea>

            <form onSubmit={handleChatSubmit} className="px-4 py-3 border-t shrink-0">
              <div className="flex gap-2">
                <Input
                  ref={chatInputRef}
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder={hasComposed ? "Ask for a revision..." : "Type instructions..."}
                  disabled={isComposing}
                  className="text-sm"
                  data-testid="chat-input"
                />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <Button
                        type="submit"
                        size="icon"
                        disabled={isComposing || !chatInput.trim()}
                        className="shrink-0"
                        data-testid="chat-send"
                      >
                        <Send className="h-4 w-4" />
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    {isComposing ? "Generating..." : !chatInput.trim() ? "Type a message first" : "Send"}
                  </TooltipContent>
                </Tooltip>
              </div>
            </form>
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* ── Center: Editable Draft ───────────────────────────────────────── */}
        <ResizablePanel defaultSize={35} minSize={25} data-testid="draft-panel">
          <div className="flex flex-col h-full">
            <div className="px-4 py-3 border-b shrink-0">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Draft
              </h2>
            </div>
            <div className="flex-1 overflow-auto px-4 py-3 flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground">To</label>
                <Input
                  value={draftTo}
                  onChange={(e) => setDraftTo(e.target.value)}
                  placeholder="recipient@example.com"
                  className="text-sm h-9"
                  data-testid="draft-to"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground">Subject</label>
                <Input
                  value={draftSubject}
                  onChange={(e) => setDraftSubject(e.target.value)}
                  placeholder="Email subject"
                  className="text-sm h-9"
                  data-testid="draft-subject"
                />
              </div>
              <div className="flex flex-col gap-1.5 flex-1">
                <label className="text-xs font-medium text-muted-foreground">Body</label>
                <Textarea
                  value={draftBody}
                  onChange={(e) => setDraftBody(e.target.value)}
                  placeholder={hasComposed ? "" : "Use the AI assistant or a preset to generate a draft..."}
                  className="text-sm flex-1 min-h-[200px] resize-none leading-relaxed"
                  data-testid="draft-body"
                />
              </div>
            </div>
            <div className="px-4 py-3 border-t shrink-0 flex items-center gap-3">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button
                      onClick={handleSend}
                      disabled={!draftBody.trim() || isSending}
                      data-testid="send-button"
                      className="gap-2"
                    >
                      {isSending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                      Send to Superhuman
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top">
                  {!draftBody.trim()
                    ? "Generate a draft first"
                    : isSending
                      ? "Sending..."
                      : "Send draft and complete action"}
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* ── Right: Context Panel ─────────────────────────────────────────── */}
        <ResizablePanel defaultSize={35} minSize={20} data-testid="context-panel">
          <ScrollArea className="h-full">
            <div className="px-4 py-3 flex flex-col gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Context
              </h2>

              {/* Trigger interaction card */}
              {action.triggerInteractionSummary && (
                <Card>
                  <CardHeader className="p-3 pb-0">
                    <CardTitle className="text-xs font-medium flex items-center gap-2">
                      <SourceIcon channel={action.triggerInteractionChannel} />
                      Trigger Interaction
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 pt-2">
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {action.triggerInteractionSummary}
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* Reason card */}
              <Card>
                <CardHeader className="p-3 pb-0">
                  <CardTitle className="text-xs font-medium">Why this action</CardTitle>
                </CardHeader>
                <CardContent className="p-3 pt-2">
                  <p className="text-sm text-muted-foreground leading-relaxed">{action.reason}</p>
                </CardContent>
              </Card>

              <Separator />

              {/* Brief header + regenerate */}
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Brief
                </h3>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => regenerate.mutate()}
                        disabled={regenerate.isPending || briefLoading}
                        className="h-7 text-xs gap-1"
                        data-testid="regenerate-brief"
                      >
                        <RefreshCw className={`h-3.5 w-3.5 ${regenerate.isPending ? "animate-spin" : ""}`} />
                        Regenerate
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="left">
                    {regenerate.isPending || briefLoading
                      ? "Generating brief..."
                      : "Force-refresh the brief (bypasses cache)"}
                  </TooltipContent>
                </Tooltip>
              </div>

              {/* Brief body */}
              {briefLoading ? (
                <div className="flex flex-col gap-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Card key={i}>
                      <CardContent className="p-3">
                        <Skeleton className="h-3 w-28 mb-2" />
                        <Skeleton className="h-3 w-full" />
                        <Skeleton className="h-3 w-4/5 mt-1" />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : briefError ? (
                <Card>
                  <CardContent className="p-3 flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                    <p className="text-sm text-muted-foreground">
                      Brief could not be loaded. Click Regenerate to try again.
                    </p>
                  </CardContent>
                </Card>
              ) : brief ? (
                <div className="flex flex-col gap-2">
                  {Object.entries(brief.sections).map(([key, value]) => (
                    <Card key={key} className="overflow-hidden">
                      <Collapsible
                        open={openSections[key]}
                        onOpenChange={() => toggleSection(key)}
                      >
                        <CollapsibleTrigger className="flex items-center gap-2 w-full text-left px-3 py-2.5 hover:bg-muted/50 transition-colors">
                          {openSections[key] ? (
                            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          )}
                          <span className="text-xs font-medium">
                            {BRIEF_SECTION_LABELS[key] || key}
                          </span>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="px-3 pb-3 pt-0">
                            <p className="text-sm text-muted-foreground pl-5 whitespace-pre-wrap leading-relaxed">
                              {value}
                            </p>
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    </Card>
                  ))}
                </div>
              ) : (
                <Card>
                  <CardContent className="p-3">
                    <p className="text-sm text-muted-foreground">
                      No brief available yet. Click Regenerate to generate one.
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* Sources */}
              {brief?.sources && brief.sources.length > 0 && (
                <>
                  <Separator />
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Sources
                  </h3>
                  <Card>
                    <CardContent className="p-3 flex flex-col gap-2.5">
                      {brief.sources.map((source, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                          <SourceIcon channel={source.type} />
                          <div className="min-w-0">
                            <p className="leading-relaxed">{source.summary}</p>
                            <p className="text-[10px] opacity-60 mt-0.5">
                              {new Date(source.date).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </>
              )}
            </div>
          </ScrollArea>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
