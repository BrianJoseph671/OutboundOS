import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Linkedin,
  Mail,
  Pause,
  Phone,
  Check,
  ChevronDown,
  ChevronRight,
  MessageSquare,
  AlertCircle,
  Calendar,
  Eye,
  Snowflake,
  RotateCcw,
  Edit,
} from "lucide-react";
import {
  initialDecisions,
  initialActivityFeed,
  initialParkedLeads,
  type DecisionItem,
  type ActivityEvent,
  type ParkedLead,
} from "@/mockData";

// Decision Card Component
function DecisionCard({
  decision,
  onAction,
  isApproved,
}: {
  decision: DecisionItem;
  onAction: () => void;
  isApproved: boolean;
}) {
  const getActionText = () => {
    switch (decision.actionType) {
      case "switch_to_linkedin":
        return "Switch channel to LinkedIn";
      case "follow_up_email":
        return "Send email follow up";
      case "pause":
        return "Pause lead";
      case "call":
        return "Schedule a call";
      default:
        return "Take action";
    }
  };

  const getButtonText = () => {
    switch (decision.actionType) {
      case "switch_to_linkedin":
        return "Draft LinkedIn message";
      case "follow_up_email":
        return "Prepare email";
      case "pause":
        return "Mark paused";
      case "call":
        return "Schedule call";
      default:
        return "Take action";
    }
  };

  const getChannelIcon = () => {
    switch (decision.channelRecommended) {
      case "LinkedIn":
        return <Linkedin className="w-3 h-3" />;
      case "Email":
        return <Mail className="w-3 h-3" />;
      case "Call":
        return <Phone className="w-3 h-3" />;
      case "Pause":
        return <Pause className="w-3 h-3" />;
      default:
        return null;
    }
  };

  const getPriorityColor = () => {
    switch (decision.priority) {
      case "High":
        return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
      case "Medium":
        return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
      case "Low":
        return "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400";
      default:
        return "";
    }
  };

  return (
    <Card
      className={`transition-all ${isApproved ? "opacity-60 border-green-500/50" : ""}`}
      data-testid={`card-decision-${decision.id}`}
    >
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-base">{getActionText()}</h3>
          {isApproved && (
            <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 shrink-0">
              <Check className="w-3 h-3 mr-1" />
              Approved
            </Badge>
          )}
        </div>

        <p className="text-sm text-muted-foreground">
          {decision.personName}, {decision.title} at {decision.company}
        </p>

        <p className="text-xs text-muted-foreground">{decision.reason}</p>

        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="gap-1">
            {getChannelIcon()}
            {decision.channelRecommended}
          </Badge>
          <Badge className={getPriorityColor()}>{decision.priority}</Badge>
        </div>

        {!isApproved && (
          <Button
            onClick={onAction}
            className="w-full mt-2"
            data-testid={`button-action-${decision.id}`}
          >
            {getButtonText()}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

// Decision Drawer Component
function DecisionDrawer({
  decision,
  open,
  onOpenChange,
  onApprove,
  onEdit,
}: {
  decision: DecisionItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApprove: () => void;
  onEdit: () => void;
}) {
  const [checklist, setChecklist] = useState({
    personalizedOpener: false,
    clearCta: false,
    credibility: false,
  });

  const handleApprove = () => {
    onApprove();
    setChecklist({ personalizedOpener: false, clearCta: false, credibility: false });
  };

  if (!decision) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="mb-6">
          <SheetTitle>Review Message</SheetTitle>
        </SheetHeader>

        <div className="space-y-6">
          <div>
            <p className="text-sm text-muted-foreground mb-1">To</p>
            <p className="font-medium">
              {decision.personName}, {decision.title}
            </p>
            <p className="text-sm text-muted-foreground">{decision.company}</p>
          </div>

          {decision.suggestedSubject && (
            <div>
              <p className="text-sm text-muted-foreground mb-1">Subject</p>
              <p className="font-medium">{decision.suggestedSubject}</p>
            </div>
          )}

          <div>
            <p className="text-sm text-muted-foreground mb-2">
              {decision.actionType === "pause" ? "Recommendation" : "Message"}
            </p>
            <div className="p-4 bg-muted/50 rounded-lg text-sm whitespace-pre-wrap">
              {decision.suggestedBody}
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-medium">Quality checklist</p>
            <div className="space-y-2">
              <label className="flex items-center gap-3 cursor-pointer">
                <Checkbox
                  checked={checklist.personalizedOpener}
                  onCheckedChange={(checked) =>
                    setChecklist((prev) => ({ ...prev, personalizedOpener: !!checked }))
                  }
                  data-testid="checkbox-personalized"
                />
                <span className="text-sm">Personalized opener</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <Checkbox
                  checked={checklist.clearCta}
                  onCheckedChange={(checked) =>
                    setChecklist((prev) => ({ ...prev, clearCta: !!checked }))
                  }
                  data-testid="checkbox-cta"
                />
                <span className="text-sm">Clear CTA</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <Checkbox
                  checked={checklist.credibility}
                  onCheckedChange={(checked) =>
                    setChecklist((prev) => ({ ...prev, credibility: !!checked }))
                  }
                  data-testid="checkbox-credibility"
                />
                <span className="text-sm">One sentence credibility</span>
              </label>
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <Button onClick={handleApprove} className="flex-1" data-testid="button-approve">
              <Check className="w-4 h-4 mr-2" />
              Approve
            </Button>
            <Button variant="outline" onClick={onEdit} className="flex-1" data-testid="button-edit">
              <Edit className="w-4 h-4 mr-2" />
              Edit
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// Event Item Component
function EventItem({
  event,
  onClick,
}: {
  event: ActivityEvent;
  onClick: () => void;
}) {
  const getEventIcon = () => {
    switch (event.type) {
      case "positive_reply":
        return <MessageSquare className="w-4 h-4 text-green-600" />;
      case "bounce":
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      case "marked_cold":
        return <Snowflake className="w-4 h-4 text-blue-500" />;
      case "opened":
        return <Eye className="w-4 h-4 text-amber-500" />;
      case "scheduled":
        return <Calendar className="w-4 h-4 text-purple-500" />;
      case "unparked":
        return <RotateCcw className="w-4 h-4 text-emerald-500" />;
      default:
        return null;
    }
  };

  return (
    <button
      onClick={onClick}
      className="w-full flex items-start gap-3 p-3 rounded-lg hover-elevate text-left transition-colors"
      data-testid={`event-${event.id}`}
    >
      <div className="mt-0.5">{getEventIcon()}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm">{event.text}</p>
        <p className="text-xs text-muted-foreground">{event.time}</p>
      </div>
    </button>
  );
}

// Parked Lead Row Component
function ParkedLeadRow({
  lead,
  onUnpark,
}: {
  lead: ParkedLead;
  onUnpark: () => void;
}) {
  return (
    <div
      className="flex items-center justify-between gap-4 py-3 border-b last:border-0"
      data-testid={`parked-${lead.id}`}
    >
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm">{lead.personName}</p>
        <p className="text-xs text-muted-foreground">{lead.company}</p>
      </div>
      <div className="flex-1 min-w-0 hidden sm:block">
        <p className="text-sm text-muted-foreground">{lead.reason}</p>
      </div>
      <div className="text-sm text-muted-foreground shrink-0 hidden md:block">
        Until {lead.parkedUntil}
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={onUnpark}
        data-testid={`button-unpark-${lead.id}`}
      >
        Unpark
      </Button>
    </div>
  );
}

// Event Details Modal
function EventModal({
  event,
  open,
  onOpenChange,
}: {
  event: ActivityEvent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!event) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{event.text}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">{event.time}</p>
          <p className="text-sm">{event.details}</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Main Decisions Page
export default function Decisions() {
  const [decisions, setDecisions] = useState<DecisionItem[]>(initialDecisions);
  const [activityFeed, setActivityFeed] = useState<ActivityEvent[]>(initialActivityFeed);
  const [parkedLeads, setParkedLeads] = useState<ParkedLead[]>(initialParkedLeads);

  const [selectedDecision, setSelectedDecision] = useState<DecisionItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [approvedIds, setApprovedIds] = useState<Set<string>>(new Set());

  const [selectedEvent, setSelectedEvent] = useState<ActivityEvent | null>(null);
  const [eventModalOpen, setEventModalOpen] = useState(false);

  const [parkedOpen, setParkedOpen] = useState(false);

  const handleCardAction = (decision: DecisionItem) => {
    setSelectedDecision(decision);
    setDrawerOpen(true);
  };

  const handleApprove = () => {
    if (!selectedDecision) return;

    // Mark as approved
    setApprovedIds((prev) => new Set(prev).add(selectedDecision.id));

    // Move approved to bottom
    setDecisions((prev) => {
      const approved = prev.find((d) => d.id === selectedDecision.id);
      const others = prev.filter((d) => d.id !== selectedDecision.id);
      return approved ? [...others, approved] : prev;
    });

    // Add activity event
    const actionText =
      selectedDecision.actionType === "switch_to_linkedin"
        ? "Switch to LinkedIn"
        : selectedDecision.actionType === "follow_up_email"
          ? "Email follow up"
          : selectedDecision.actionType === "pause"
            ? "Pause lead"
            : "Action";

    const newEvent: ActivityEvent = {
      id: `evt-${Date.now()}`,
      time: "Just now",
      type: "scheduled",
      text: `Approved: ${actionText} for ${selectedDecision.personName}`,
      details: `You approved the recommended action "${actionText}" for ${selectedDecision.personName} at ${selectedDecision.company}. The message is ready to send.`,
    };

    setActivityFeed((prev) => [newEvent, ...prev]);
    setDrawerOpen(false);
  };

  const handleEdit = () => {
    // For now, just close drawer - in real app would open editor
    setDrawerOpen(false);
  };

  const handleEventClick = (event: ActivityEvent) => {
    setSelectedEvent(event);
    setEventModalOpen(true);
  };

  const handleUnpark = (lead: ParkedLead) => {
    // Remove from parked
    setParkedLeads((prev) => prev.filter((l) => l.id !== lead.id));

    // Add activity event
    const newEvent: ActivityEvent = {
      id: `evt-${Date.now()}`,
      time: "Just now",
      type: "unparked",
      text: `Unparked: ${lead.personName}`,
      details: `${lead.personName} from ${lead.company} was unparked. Originally parked because: "${lead.reason}". They are now back in your active pipeline.`,
    };

    setActivityFeed((prev) => [newEvent, ...prev]);
  };

  // Sort decisions: non-approved first, then approved
  const sortedDecisions = [...decisions].sort((a, b) => {
    const aApproved = approvedIds.has(a.id);
    const bApproved = approvedIds.has(b.id);
    if (aApproved === bApproved) return 0;
    return aApproved ? 1 : -1;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold">Decisions</h1>
        <p className="text-muted-foreground">Do the next right thing. Approve and move on.</p>
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column - Decisions Queue */}
        <div className="space-y-4">
          <h2 className="text-lg font-medium">Next 3</h2>
          <div className="space-y-4">
            {sortedDecisions.slice(0, 3).map((decision) => (
              <DecisionCard
                key={decision.id}
                decision={decision}
                onAction={() => handleCardAction(decision)}
                isApproved={approvedIds.has(decision.id)}
              />
            ))}
          </div>
        </div>

        {/* Right Column - Activity Feed */}
        <div className="space-y-4">
          <h2 className="text-lg font-medium">Recently changed</h2>
          <Card>
            <CardContent className="p-2">
              <div className="divide-y">
                {activityFeed.slice(0, 6).map((event) => (
                  <EventItem
                    key={event.id}
                    event={event}
                    onClick={() => handleEventClick(event)}
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Parked Section - Collapsible */}
      <Collapsible open={parkedOpen} onOpenChange={setParkedOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover-elevate">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-medium flex items-center gap-2">
                  <Pause className="w-4 h-4" />
                  Parked for now
                  <Badge variant="secondary" className="ml-2">
                    {parkedLeads.length}
                  </Badge>
                </CardTitle>
                {parkedOpen ? (
                  <ChevronDown className="w-5 h-5 text-muted-foreground" />
                ) : (
                  <ChevronRight className="w-5 h-5 text-muted-foreground" />
                )}
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0">
              {parkedLeads.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No parked leads
                </p>
              ) : (
                <div>
                  {parkedLeads.map((lead) => (
                    <ParkedLeadRow
                      key={lead.id}
                      lead={lead}
                      onUnpark={() => handleUnpark(lead)}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Decision Drawer */}
      <DecisionDrawer
        decision={selectedDecision}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        onApprove={handleApprove}
        onEdit={handleEdit}
      />

      {/* Event Modal */}
      <EventModal
        event={selectedEvent}
        open={eventModalOpen}
        onOpenChange={setEventModalOpen}
      />
    </div>
  );
}
