import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { apiRequest } from "@/lib/queryClient";
import { useActions } from "@/hooks/useActions";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft,
  Mail,
  Calendar,
  Video,
  Building2,
  CheckCircle2,
  X,
} from "lucide-react";
import type { ActionType } from "@shared/types/actions";

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

export default function ActionDetailPage() {
  const [, params] = useRoute("/actions/:id");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const actionId = params?.id;

  const { dismissAction, completeAction } = useActions();

  const { data: action, isLoading, isError } = useQuery<ActionDetail>({
    queryKey: ["/api/actions", actionId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/actions/${actionId}`);
      return res.json();
    },
    enabled: !!actionId,
  });

  const handleBack = () => navigate("/actions");

  const handleDismiss = () => {
    if (!actionId) return;
    dismissAction.mutate(actionId, {
      onSuccess: () => {
        toast({ title: "Action dismissed" });
        navigate("/actions");
      },
      onError: () => {
        toast({
          title: "Failed to dismiss",
          description: "Could not dismiss action. Please try again.",
          variant: "destructive",
        });
      },
    });
  };

  const handleComplete = () => {
    if (!actionId) return;
    completeAction.mutate(actionId, {
      onSuccess: () => {
        toast({ title: "Action completed" });
        navigate("/actions");
      },
      onError: () => {
        toast({
          title: "Failed to complete",
          description: "Could not complete action. Please try again.",
          variant: "destructive",
        });
      },
    });
  };

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 max-w-2xl" data-testid="action-detail-loading">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-6 w-48" />
        </div>
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (isError || !action) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4" data-testid="action-detail-error">
        <p className="text-sm text-destructive">Action not found.</p>
        <Button variant="outline" size="sm" onClick={handleBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Actions
        </Button>
      </div>
    );
  }

  const config = ACTION_TYPE_CONFIG[action.actionType];
  const isResolved = action.status === "completed" || action.status === "dismissed";

  return (
    <div className="flex flex-col gap-6 max-w-2xl" data-testid="action-detail">
      {/* Top bar */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={handleBack}
          className="h-8 w-8"
          data-testid="back-button"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-lg font-semibold">Action Detail</h1>
      </div>

      {/* Contact header */}
      <div className="flex flex-col gap-2 rounded-lg border bg-card p-5">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <span className="text-sm font-semibold text-primary">
              {action.contactName.charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-semibold text-base">{action.contactName}</span>
            {action.contactCompany && (
              <span className="text-sm text-muted-foreground flex items-center gap-1">
                <Building2 className="h-3 w-3" />
                {action.contactCompany}
              </span>
            )}
          </div>
          <Badge variant="outline" className={config.className}>
            {config.label}
          </Badge>
        </div>

        {action.contactEmail && (
          <span className="text-xs text-muted-foreground pl-13">{action.contactEmail}</span>
        )}
      </div>

      {/* Action info */}
      <div className="flex flex-col gap-3 rounded-lg border bg-card p-5">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Reason</span>
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(action.createdAt), { addSuffix: true })}
          </span>
        </div>
        <p className="text-sm text-foreground leading-relaxed">{action.reason}</p>

        <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2 border-t">
          <span>Priority: {action.priority}</span>
          <span>Status: {action.status}</span>
          {action.completedAt && (
            <span>
              Resolved {formatDistanceToNow(new Date(action.completedAt), { addSuffix: true })}
            </span>
          )}
        </div>
      </div>

      {/* Trigger interaction (if available) */}
      {action.triggerInteractionSummary && (
        <div className="flex flex-col gap-2 rounded-lg border bg-card p-5">
          <div className="flex items-center gap-2">
            <SourceIcon channel={action.triggerInteractionChannel} />
            <span className="text-sm font-medium">Trigger Interaction</span>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {action.triggerInteractionSummary}
          </p>
        </div>
      )}

      {/* Actions */}
      {!isResolved && (
        <div className="flex items-center gap-3">
          <Button
            variant="default"
            size="sm"
            onClick={handleComplete}
            disabled={completeAction.isPending}
            data-testid="complete-button"
          >
            <CheckCircle2 className="h-4 w-4 mr-2" />
            Complete
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDismiss}
            disabled={dismissAction.isPending}
            data-testid="dismiss-button"
          >
            <X className="h-4 w-4 mr-2" />
            Dismiss
          </Button>
        </div>
      )}
    </div>
  );
}
