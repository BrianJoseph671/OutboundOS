import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  RefreshCw,
  Mail,
  Calendar,
  Video,
  ChevronDown,
  ChevronRight,
  Loader2,
  AlertCircle,
  BookOpen,
  Users,
} from "lucide-react";
import { useWeeklyBrief } from "@/hooks/useWeeklyBrief";
import type { WeeklyBriefResponse, WeeklyBriefCategory } from "@shared/types/phase4";

const TIER_CONFIG: Record<string, { label: string; className: string }> = {
  hot: {
    label: "Hot",
    className: "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800",
  },
  warm: {
    label: "Warm",
    className: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800",
  },
  cool: {
    label: "Cool",
    className: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800",
  },
};

function ChannelIcon({ channel }: { channel: string | null }) {
  if (channel === "email") return <Mail className="h-3.5 w-3.5 text-muted-foreground" />;
  if (channel === "meeting") return <Calendar className="h-3.5 w-3.5 text-muted-foreground" />;
  if (channel) return <Video className="h-3.5 w-3.5 text-muted-foreground" />;
  return null;
}

function CategorySection({ category }: { category: WeeklyBriefCategory }) {
  const [open, setOpen] = useState(true);

  return (
    <Card>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="flex items-center gap-2 w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors">
          {open ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          )}
          <span className="text-sm font-semibold flex-1">{category.label}</span>
          <Badge variant="secondary" className="text-xs">
            {category.contacts.length}
          </Badge>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-4 pb-3 flex flex-col gap-2">
            {category.contacts.map((contact) => {
              const tierCfg = TIER_CONFIG[contact.tier] || TIER_CONFIG.cool;
              return (
                <div
                  key={contact.contactId}
                  className="flex items-start gap-3 rounded-md border p-3 bg-background"
                >
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-xs font-semibold text-primary">
                      {contact.contactName.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium truncate">{contact.contactName}</span>
                      {contact.company && (
                        <span className="text-xs text-muted-foreground">{contact.company}</span>
                      )}
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${tierCfg.className}`}>
                        {tierCfg.label}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      {contact.snippet}
                    </p>
                    <div className="flex items-center gap-3 mt-1.5 text-[11px] text-muted-foreground">
                      {contact.lastInteractionChannel && (
                        <span className="flex items-center gap-1">
                          <ChannelIcon channel={contact.lastInteractionChannel} />
                          {contact.lastInteractionAt
                            ? new Date(contact.lastInteractionAt).toLocaleDateString()
                            : "—"}
                        </span>
                      )}
                      {contact.pendingActions > 0 && (
                        <span className="text-amber-600 dark:text-amber-400 font-medium">
                          {contact.pendingActions} pending action{contact.pendingActions > 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

export default function WeeklyBriefPage() {
  const [, navigate] = useLocation();
  const { generate } = useWeeklyBrief();
  const [brief, setBrief] = useState<WeeklyBriefResponse | null>(null);

  const isGenerating = generate.isPending;

  const handleGenerate = () => {
    generate.mutate({}, {
      onSuccess: (data) => setBrief(data),
    });
  };

  const handleBack = () => navigate("/actions");

  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      {/* Top bar */}
      <div className="flex items-center gap-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" onClick={handleBack} className="h-8 w-8" data-testid="back-button">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Back to Actions</TooltipContent>
        </Tooltip>
        <BookOpen className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-lg font-semibold">Weekly Brief</h1>
        {brief && (
          <span className="text-xs text-muted-foreground">
            {brief.weekStart} — {brief.weekEnd}
          </span>
        )}
        <div className="flex-1" />
        <Button
          variant="outline"
          size="sm"
          onClick={handleGenerate}
          disabled={isGenerating}
          data-testid="generate-brief-button"
        >
          {isGenerating ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          {isGenerating ? "Generating..." : "Generate"}
        </Button>
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Button variant="outline" size="sm" disabled data-testid="email-self-button">
                <Mail className="h-4 w-4 mr-2" />
                Email to Self
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>Coming soon — Superhuman MCP required</TooltipContent>
        </Tooltip>
      </div>

      <Separator />

      {/* Loading */}
      {isGenerating && !brief && (
        <div className="flex flex-col gap-3" data-testid="weekly-brief-loading">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-4 w-32 mb-3" />
                <Skeleton className="h-16 w-full mb-2" />
                <Skeleton className="h-16 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Error */}
      {generate.isError && (
        <Card data-testid="weekly-brief-error">
          <CardContent className="p-4 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
            <p className="text-sm text-muted-foreground">
              Failed to generate the weekly brief. Please try again.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Empty / Not generated */}
      {!brief && !isGenerating && !generate.isError && (
        <div className="flex flex-col items-center justify-center py-16 gap-4" data-testid="weekly-brief-empty">
          <Users className="h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            No brief generated yet. Click Generate to create your weekly relationship summary.
          </p>
        </div>
      )}

      {/* Brief content */}
      {brief && (
        <div className="flex flex-col gap-3" data-testid="weekly-brief-content">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {brief.totalContacts} contacts across {brief.categories.length} categories
            </span>
            <span className="text-xs text-muted-foreground">
              Generated {new Date(brief.generatedAt).toLocaleString()}
            </span>
          </div>
          {brief.categories.map((category) => (
            <CategorySection key={category.label} category={category} />
          ))}
        </div>
      )}
    </div>
  );
}
