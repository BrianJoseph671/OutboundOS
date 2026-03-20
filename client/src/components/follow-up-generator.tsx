import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Loader2, Send, Copy, Calendar, Sparkles } from "lucide-react";
import type { Meeting } from "@shared/schema";

interface ContactMeetingEntry {
  id: string;
  contactId: string;
  meetingId: string;
  matchedBy: string;
  meeting: Meeting;
}

interface FollowUpResult {
  message: string;
  subject?: string;
  meetingContext: {
    title: string | null;
    date: string | null;
    notes: string | null;
    actionItems: string[];
  };
}

interface FollowUpGeneratorProps {
  contactId: string;
  contactName: string;
}

export function FollowUpGenerator({ contactId, contactName }: FollowUpGeneratorProps) {
  const { toast } = useToast();
  const [selectedMeetingId, setSelectedMeetingId] = useState<string>("");
  const [tone, setTone] = useState("professional");
  const [generatedMessage, setGeneratedMessage] = useState("");
  const [generatedSubject, setGeneratedSubject] = useState("");

  const { data: meetingLinks = [] } = useQuery<ContactMeetingEntry[]>({
    queryKey: [`/api/integrations/contacts/${contactId}/meetings`],
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const meetingId = selectedMeetingId || meetingLinks[0]?.meetingId;
      if (!meetingId) throw new Error("No meeting selected");

      const res = await apiRequest("POST", `/api/integrations/meetings/${meetingId}/follow-up`, {
        contactId,
        tone,
      });
      return (await res.json()) as FollowUpResult;
    },
    onSuccess: (data) => {
      setGeneratedMessage(data.message);
      setGeneratedSubject(data.subject || "");
      toast({ title: "Follow-up generated" });
    },
    onError: (error: Error) => {
      toast({ title: "Generation failed", description: error.message, variant: "destructive" });
    },
  });

  const handleCopy = () => {
    const text = generatedSubject
      ? `Subject: ${generatedSubject}\n\n${generatedMessage}`
      : generatedMessage;
    navigator.clipboard.writeText(text);
    toast({ title: "Copied to clipboard" });
  };

  if (meetingLinks.length === 0) {
    return null;
  }

  const sorted = [...meetingLinks].sort((a, b) => {
    const aTime = a.meeting.startTime ? new Date(a.meeting.startTime).getTime() : 0;
    const bTime = b.meeting.startTime ? new Date(b.meeting.startTime).getTime() : 0;
    return bTime - aTime;
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Sparkles className="h-4 w-4" />
          Write Follow-up
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Select
            value={selectedMeetingId || sorted[0]?.meetingId || ""}
            onValueChange={setSelectedMeetingId}
          >
            <SelectTrigger className="flex-1">
              <SelectValue placeholder="Select meeting" />
            </SelectTrigger>
            <SelectContent>
              {sorted.map((entry) => (
                <SelectItem key={entry.meetingId} value={entry.meetingId}>
                  <span className="flex items-center gap-2">
                    <Calendar className="h-3 w-3" />
                    {entry.meeting.title || "Untitled"}
                    {entry.meeting.startTime && (
                      <span className="text-xs text-muted-foreground ml-1">
                        {new Date(entry.meeting.startTime).toLocaleDateString()}
                      </span>
                    )}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={tone} onValueChange={setTone}>
            <SelectTrigger className="w-[130px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="professional">Professional</SelectItem>
              <SelectItem value="friendly">Friendly</SelectItem>
              <SelectItem value="direct">Direct</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button
          onClick={() => generateMutation.mutate()}
          disabled={generateMutation.isPending || meetingLinks.length === 0}
          className="w-full"
          size="sm"
        >
          {generateMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Sparkles className="h-4 w-4 mr-2" />
          )}
          Generate Follow-up
        </Button>

        {generatedMessage && (
          <div className="space-y-2">
            {generatedSubject && (
              <div className="text-xs">
                <span className="font-medium text-muted-foreground">Subject: </span>
                <span>{generatedSubject}</span>
              </div>
            )}
            <Textarea
              value={generatedMessage}
              onChange={(e) => setGeneratedMessage(e.target.value)}
              rows={8}
              className="text-sm"
            />
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleCopy}>
                <Copy className="h-3 w-3 mr-1" />
                Copy
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
