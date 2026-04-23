import { useMemo, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ArrowLeft, ArrowRight, CheckCircle2 } from "lucide-react";

interface ReviewItem {
  id: string;
  signatureHash: string;
  proposedLabel: string;
  exampleSubjects: string[];
  messageCount: number;
  hasAnyMeetingLinkedContacts?: boolean;
  meetingLinkedContactCount?: number;
  decision: "accept" | "reject" | null;
}

export default function NetworkReviewPage() {
  const { toast } = useToast();
  const [, params] = useRoute("/network-review/:sessionId");
  const [, navigate] = useLocation();
  const sessionId = params?.sessionId || "";

  const { data, isLoading } = useQuery<{
    session: { id: string; status: string };
    items: ReviewItem[];
  }>({
    queryKey: ["/api/index-review", sessionId],
    enabled: !!sessionId,
  });

  const undecided = useMemo(
    () => (data?.items || []).filter((i) => !i.decision),
    [data?.items],
  );
  const current = undecided[0];
  const decidedCount = (data?.items?.length || 0) - undecided.length;
  const totalCount = data?.items?.length || 0;
  const progress = totalCount > 0 ? (decidedCount / totalCount) * 100 : 0;

  const decideMutation = useMutation({
    mutationFn: (payload: { signatureHash: string; decision: "accept" | "reject" }) =>
      apiRequest("POST", `/api/index-review/${sessionId}/decide`, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/index-review", sessionId] }),
    onError: () => toast({ title: "Failed to save decision", variant: "destructive" }),
  });

  const completeMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/index-review/${sessionId}/complete`),
    onSuccess: () => {
      toast({ title: "Review complete. Contacts were filtered and indexed." });
      queryClient.invalidateQueries({ queryKey: ["/api/network/status"] });
      navigate("/settings");
    },
    onError: () => toast({ title: "Failed to complete review", variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading review...
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Review Email Types</h1>
        <p className="text-sm text-muted-foreground">
          Reviewing top 20 types by impact, with meeting-linked types prioritized.
        </p>
        <p className="text-sm text-muted-foreground">
          Swipe right/accept for real networking types. Swipe left/reject for types to auto-ignore in future indexing.
        </p>
        <Progress value={progress} className="h-2" />
        <p className="text-xs text-muted-foreground">{decidedCount} of {totalCount} reviewed</p>
      </div>

      {current ? (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{current.proposedLabel}</CardTitle>
              <div className="flex items-center gap-2">
                {current.hasAnyMeetingLinkedContacts ? (
                  <Badge variant="default">Met before</Badge>
                ) : null}
                <Badge variant="secondary">{current.messageCount} emails</Badge>
              </div>
            </div>
            <CardDescription>Example subjects in this type</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <ul className="space-y-2">
              {current.exampleSubjects.slice(0, 5).map((s, idx) => (
                <li key={idx} className="text-sm rounded border bg-muted/20 p-2">{s || "(empty subject)"}</li>
              ))}
            </ul>
            <div className="flex items-center justify-between pt-2">
              <Button
                variant="outline"
                onClick={() => decideMutation.mutate({ signatureHash: current.signatureHash, decision: "reject" })}
                disabled={decideMutation.isPending}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Reject Type
              </Button>
              <Button
                onClick={() => decideMutation.mutate({ signatureHash: current.signatureHash, decision: "accept" })}
                disabled={decideMutation.isPending}
              >
                Accept Type
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-10 text-center space-y-3">
            <CheckCircle2 className="h-8 w-8 mx-auto text-green-600" />
            <p className="font-medium">All email types reviewed</p>
            <p className="text-sm text-muted-foreground">
              Finalize to apply your rules and persist filtered contacts.
            </p>
            <Button onClick={() => completeMutation.mutate()} disabled={completeMutation.isPending}>
              {completeMutation.isPending ? "Finalizing..." : "Complete Review"}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
