import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, FileText, Clock, Users } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import type { Meeting } from "@shared/schema";

interface ContactMeetingEntry {
  id: string;
  contactId: string;
  meetingId: string;
  matchedBy: string;
  meeting: Meeting;
}

interface MeetingTimelineProps {
  contactId: string;
}

export function MeetingTimeline({ contactId }: MeetingTimelineProps) {
  const { data: meetingLinks = [], isLoading } = useQuery<ContactMeetingEntry[]>({
    queryKey: [`/api/integrations/contacts/${contactId}/meetings`],
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-4">
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-muted rounded w-1/3" />
            <div className="h-12 bg-muted rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

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
          <Calendar className="h-4 w-4" />
          Meeting History
          <Badge variant="secondary" className="text-xs">{meetingLinks.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {sorted.map((entry) => {
          const m = entry.meeting;
          const startDate = m.startTime ? new Date(m.startTime) : null;
          const sourceLabel = m.source === "google_calendar" ? "Google Calendar" : "Granola";
          const attendeeCount = Array.isArray(m.attendees) ? (m.attendees as any[]).filter((a: any) => !a.self).length : 0;

          return (
            <div key={entry.id} className="flex gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
              <div className="flex flex-col items-center gap-1 min-w-[40px]">
                {startDate ? (
                  <>
                    <span className="text-xs font-medium">{format(startDate, "MMM")}</span>
                    <span className="text-lg font-semibold leading-none">{format(startDate, "d")}</span>
                  </>
                ) : (
                  <span className="text-xs text-muted-foreground">N/A</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{m.title || "Untitled Meeting"}</p>
                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                  {startDate && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {format(startDate, "h:mm a")}
                    </span>
                  )}
                  {attendeeCount > 0 && (
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {attendeeCount}
                    </span>
                  )}
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    {sourceLabel}
                  </Badge>
                </div>
                {m.notes && (
                  <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">
                    <FileText className="h-3 w-3 inline mr-1" />
                    {m.notes}
                  </p>
                )}
                {startDate && (
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {formatDistanceToNow(startDate, { addSuffix: true })}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
