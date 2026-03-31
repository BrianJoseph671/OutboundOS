import { useState, useMemo } from "react";
import { formatDistanceToNow } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { ActionCard, ActionType } from "@shared/types/actions";
import { pendingMockActions } from "@/data/mock-actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  RefreshCw,
  X,
  Clock,
  Mail,
  Calendar,
  Video,
  Zap,
  Building2,
  Search,
} from "lucide-react";
import type { Contact } from "@shared/schema";

// ---------------------------------------------------------------------------
// Action type badge config
// ---------------------------------------------------------------------------

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
};

// ---------------------------------------------------------------------------
// Source icon helper
// ---------------------------------------------------------------------------

type SourceChannel = "email" | "meeting" | "video";

function SourceIcon({ channel }: { channel: SourceChannel }) {
  if (channel === "email") return <Mail className="h-4 w-4 text-muted-foreground" />;
  if (channel === "meeting") return <Calendar className="h-4 w-4 text-muted-foreground" />;
  return <Video className="h-4 w-4 text-muted-foreground" />;
}

// ---------------------------------------------------------------------------
// ActionCard component
// ---------------------------------------------------------------------------

interface ActionCardProps {
  action: ActionCard;
  onDismiss: (id: string) => void;
  onSnooze: (id: string, until: Date) => void;
}

function ActionCardComponent({ action, onDismiss, onSnooze }: ActionCardProps) {
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const config = ACTION_TYPE_CONFIG[action.actionType];

  // Determine source channel from triggerInteractionId heuristic
  // (mock data: null triggerInteractionId = reconnect/new_contact → calendar-like)
  const channel: SourceChannel =
    action.actionType === "open_thread" || action.actionType === "follow_up"
      ? "email"
      : action.actionType === "new_contact"
      ? "meeting"
      : "email";

  const snoozeOptions: { label: string; days: number }[] = [
    { label: "1 day", days: 1 },
    { label: "3 days", days: 3 },
    { label: "1 week", days: 7 },
  ];

  const handleSnooze = (days: number) => {
    const until = new Date();
    until.setDate(until.getDate() + days);
    onSnooze(action.id, until);
    setSnoozeOpen(false);
  };

  return (
    <div
      data-testid={`action-card-${action.id}`}
      className="flex flex-col gap-2 rounded-lg border bg-card p-4 shadow-sm hover:shadow-md transition-shadow"
    >
      {/* Header: name, company, badge, time */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm leading-tight truncate">
              {action.contactName}
            </span>
            {action.contactCompany && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Building2 className="h-3 w-3" />
                {action.contactCompany}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge
              variant="outline"
              className={config.className}
              data-testid={`badge-${action.actionType}`}
            >
              {config.label}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {formatDistanceToNow(action.createdAt, { addSuffix: true })}
            </span>
            <SourceIcon channel={channel} />
          </div>
        </div>

        {/* Actions: dismiss + snooze */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Snooze */}
          <Popover open={snoozeOpen} onOpenChange={setSnoozeOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                aria-label="Snooze action"
                data-testid={`snooze-${action.id}`}
              >
                <Clock className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-40 p-1" align="end">
              <div className="flex flex-col gap-0.5">
                {snoozeOptions.map((opt) => (
                  <Button
                    key={opt.days}
                    variant="ghost"
                    size="sm"
                    className="justify-start text-sm h-8"
                    onClick={() => handleSnooze(opt.days)}
                    data-testid={`snooze-option-${opt.days}`}
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          {/* Dismiss */}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
            aria-label="Dismiss action"
            onClick={() => onDismiss(action.id)}
            data-testid={`dismiss-${action.id}`}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Reason text — truncated to 2 lines */}
      <p className="text-sm text-muted-foreground line-clamp-2 leading-snug">
        {action.reason}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton loading cards
// ---------------------------------------------------------------------------

function ActionCardSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-2 flex-1">
          <Skeleton className="h-4 w-32" />
          <div className="flex gap-2">
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-4 w-16" />
          </div>
        </div>
        <div className="flex gap-1">
          <Skeleton className="h-7 w-7 rounded" />
          <Skeleton className="h-7 w-7 rounded" />
        </div>
      </div>
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-3/4" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rolodex tab content (calls GET /api/contacts)
// ---------------------------------------------------------------------------

function RolodexTab() {
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState<string>("all");

  const { data: contacts = [], isLoading } = useQuery<Contact[]>({
    queryKey: ["/api/contacts"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/contacts");
      return res.json();
    },
    staleTime: 30_000,
  });

  const filtered = useMemo(() => {
    return contacts.filter((c) => {
      const matchesSearch =
        !search ||
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        (c.company ?? "").toLowerCase().includes(search.toLowerCase());
      const matchesTier = tierFilter === "all" || c.tier === tierFilter;
      return matchesSearch && matchesTier;
    });
  }, [contacts, search, tierFilter]);

  return (
    <div className="flex flex-col gap-4">
      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search contacts…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8"
          />
        </div>
        <Select value={tierFilter} onValueChange={setTierFilter}>
          <SelectTrigger className="h-8 w-36">
            <SelectValue placeholder="All tiers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All tiers</SelectItem>
            <SelectItem value="vip">VIP</SelectItem>
            <SelectItem value="warm">Warm</SelectItem>
            <SelectItem value="cool">Cool</SelectItem>
            <SelectItem value="cold">Cold</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Contact list */}
      {isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-lg border bg-card p-3"
            >
              <Skeleton className="h-8 w-8 rounded-full" />
              <div className="flex flex-col gap-1 flex-1">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground">
          <Search className="h-8 w-8 opacity-40" />
          <p className="text-sm">No contacts found</p>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {filtered.map((contact) => (
            <div
              key={contact.id}
              className="flex items-center gap-3 rounded-lg border bg-card p-3 hover:bg-accent/50 transition-colors"
            >
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <span className="text-xs font-semibold text-primary">
                  {contact.name.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-sm font-medium truncate">{contact.name}</span>
                {contact.company && (
                  <span className="text-xs text-muted-foreground truncate">
                    {contact.company}
                  </span>
                )}
              </div>
              {contact.tier && contact.tier !== "cool" && (
                <Badge
                  variant="outline"
                  className={
                    contact.tier === "vip"
                      ? "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400"
                      : contact.tier === "warm"
                      ? "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400"
                      : "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400"
                  }
                >
                  {contact.tier}
                </Badge>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

interface EmptyStateProps {
  onSyncClick: () => void;
  isSyncing: boolean;
}

function EmptyState({ onSyncClick, isSyncing }: EmptyStateProps) {
  return (
    <div
      className="flex flex-col items-center justify-center py-20 gap-4 text-center"
      data-testid="empty-state"
    >
      <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
        <Zap className="h-8 w-8 text-muted-foreground opacity-50" />
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-base font-medium">All caught up.</p>
        <p className="text-sm text-muted-foreground">
          Hit Sync Recent to check for new activity.
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={onSyncClick}
        disabled={isSyncing}
        data-testid="empty-state-sync-button"
      >
        {isSyncing ? (
          <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <RefreshCw className="h-4 w-4 mr-2" />
        )}
        Sync Recent
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Actions Page
// ---------------------------------------------------------------------------

const ACTION_TYPE_OPTIONS: { label: string; value: ActionType | "all" }[] = [
  { label: "All Types", value: "all" },
  { label: "Follow Up", value: "follow_up" },
  { label: "Reconnect", value: "reconnect" },
  { label: "Open Thread", value: "open_thread" },
  { label: "New Contact", value: "new_contact" },
];

export default function ActionsPage() {
  const { toast } = useToast();

  // Local state for mock data (will be replaced by useActions hook in phase2-wire-ui-to-api)
  const [actions, setActions] = useState<ActionCard[]>(pendingMockActions);
  const [isSyncing, setIsSyncing] = useState(false);
  const [typeFilter, setTypeFilter] = useState<ActionType | "all">("all");
  const [companyFilter, setCompanyFilter] = useState("");

  // Filter and sort actions
  const filteredActions = useMemo(() => {
    let result = actions;
    if (typeFilter !== "all") {
      result = result.filter((a) => a.actionType === typeFilter);
    }
    if (companyFilter) {
      result = result.filter((a) =>
        (a.contactCompany ?? "")
          .toLowerCase()
          .includes(companyFilter.toLowerCase()),
      );
    }
    return result;
  }, [actions, typeFilter, companyFilter]);

  // Dismiss handler
  const handleDismiss = (id: string) => {
    setActions((prev) => prev.filter((a) => a.id !== id));
  };

  // Snooze handler (removes from visible list)
  const handleSnooze = (id: string, _until: Date) => {
    setActions((prev) => prev.filter((a) => a.id !== id));
  };

  // Sync Recent handler
  const handleSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      // Simulate 2s delay (will be replaced by real POST /api/sync in phase2-wire-ui-to-api)
      await new Promise<void>((resolve) => setTimeout(resolve, 2000));
      toast({
        title: "Sync complete",
        description: "3 new interactions, 2 new actions",
      });
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center gap-3 pb-4 border-b flex-wrap">
        <div className="flex items-center gap-2 flex-1 flex-wrap">
          {/* Sync Recent button */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleSync}
            disabled={isSyncing}
            data-testid="sync-recent-button"
          >
            <RefreshCw
              className={`h-4 w-4 mr-2 ${isSyncing ? "animate-spin" : ""}`}
            />
            {isSyncing ? "Syncing…" : "Sync Recent"}
          </Button>

          {/* Type filter */}
          <Select
            value={typeFilter}
            onValueChange={(v) => setTypeFilter(v as ActionType | "all")}
          >
            <SelectTrigger className="h-8 w-40" data-testid="type-filter">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              {ACTION_TYPE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Company filter */}
          <div className="relative">
            <Building2 className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Filter by company…"
              value={companyFilter}
              onChange={(e) => setCompanyFilter(e.target.value)}
              className="pl-8 h-8 w-48"
              data-testid="company-filter"
            />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="actions" className="flex-1 flex flex-col mt-4 min-h-0">
        <TabsList className="shrink-0 self-start">
          <TabsTrigger value="actions" data-testid="tab-actions">
            Actions
          </TabsTrigger>
          <TabsTrigger value="rolodex" data-testid="tab-rolodex">
            Rolodex
          </TabsTrigger>
        </TabsList>

        {/* Actions tab */}
        <TabsContent value="actions" className="flex-1 overflow-auto mt-4">
          {filteredActions.length === 0 ? (
            <EmptyState onSyncClick={handleSync} isSyncing={isSyncing} />
          ) : (
            <div className="flex flex-col gap-3 pb-4">
              {filteredActions.map((action) => (
                <ActionCardComponent
                  key={action.id}
                  action={action}
                  onDismiss={handleDismiss}
                  onSnooze={handleSnooze}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Rolodex tab */}
        <TabsContent value="rolodex" className="flex-1 overflow-auto mt-4">
          <RolodexTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
