import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import {
  Mail,
  Phone,
  Calendar,
  Linkedin,
  MessageSquare,
  Plus,
} from "lucide-react";
import { useInteractions } from "@/hooks/useInteractions";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Interaction } from "@shared/schema";

// ── Channel icon mapping ───────────────────────────────────────────────────────

type Channel = "email" | "call" | "meeting" | "linkedin" | "text";

const channelIcons: Record<Channel, React.ElementType> = {
  email: Mail,
  call: Phone,
  meeting: Calendar,
  linkedin: Linkedin,
  text: MessageSquare,
};

const channelLabels: Record<Channel, string> = {
  email: "Email",
  call: "Call",
  meeting: "Meeting",
  linkedin: "LinkedIn",
  text: "Text",
};

function ChannelIcon({ channel }: { channel: string }) {
  const Icon = channelIcons[channel as Channel] ?? MessageSquare;
  return <Icon className="h-4 w-4" aria-label={channel} />;
}

// ── Direction badge ────────────────────────────────────────────────────────────

type Direction = "inbound" | "outbound" | "mutual";

/** Returns className overrides for each direction variant */
function directionBadgeClass(direction: string): string {
  switch (direction as Direction) {
    case "inbound":
      return "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border-0";
    case "outbound":
      return "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300 border-0";
    case "mutual":
      return "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 border-0";
    default:
      return "";
  }
}

// ── Log Interaction form schema ────────────────────────────────────────────────

export const logInteractionSchema = z.object({
  channel: z.enum(["email", "call", "meeting", "linkedin", "text"], {
    required_error: "Channel is required",
  }),
  direction: z.enum(["inbound", "outbound", "mutual"], {
    required_error: "Direction is required",
  }),
  occurred_at: z
    .string({ required_error: "Date is required" })
    .min(1, "Date is required"),
  summary: z.string().optional(),
  raw_content: z.string().optional(),
});

export type LogInteractionFormValues = z.infer<typeof logInteractionSchema>;

// ── Log Interaction Form (rendered inside Sheet) ───────────────────────────────

function LogInteractionForm({
  contactId,
  onSuccess,
}: {
  contactId: string;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<LogInteractionFormValues>({
    resolver: zodResolver(logInteractionSchema),
    defaultValues: {
      channel: undefined,
      direction: undefined,
      occurred_at: "",
      summary: "",
      raw_content: "",
    },
  });

  const handleSubmit = async (values: LogInteractionFormValues) => {
    setIsSubmitting(true);
    try {
      await apiRequest("POST", "/api/interactions", {
        contactId,
        channel: values.channel,
        direction: values.direction,
        occurredAt: new Date(values.occurred_at).toISOString(),
        summary: values.summary || null,
        rawContent: values.raw_content || null,
      });

      toast({ title: "Interaction logged successfully" });

      // Invalidate both interactions and contacts queries
      queryClient.invalidateQueries({ queryKey: ["interactions", contactId] });
      queryClient.invalidateQueries({ queryKey: ["contacts"] });

      onSuccess();
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Failed to log interaction";
      toast({ title: message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(handleSubmit)}
        className="space-y-5 mt-4"
        data-testid="form-log-interaction"
      >
        {/* Channel */}
        <FormField
          control={form.control}
          name="channel"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Channel *</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger data-testid="select-interaction-channel">
                    <SelectValue placeholder="Select channel" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {(
                    Object.entries(channelLabels) as [Channel, string][]
                  ).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      <span className="flex items-center gap-2">
                        {label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Direction */}
        <FormField
          control={form.control}
          name="direction"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Direction *</FormLabel>
              <FormControl>
                <RadioGroup
                  onValueChange={field.onChange}
                  value={field.value}
                  className="flex gap-4"
                  data-testid="radio-interaction-direction"
                >
                  {(["inbound", "outbound", "mutual"] as Direction[]).map(
                    (dir) => (
                      <div key={dir} className="flex items-center gap-1.5">
                        <RadioGroupItem
                          value={dir}
                          id={`direction-${dir}`}
                          data-testid={`radio-direction-${dir}`}
                        />
                        <Label
                          htmlFor={`direction-${dir}`}
                          className="capitalize cursor-pointer"
                        >
                          {dir}
                        </Label>
                      </div>
                    ),
                  )}
                </RadioGroup>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Date */}
        <FormField
          control={form.control}
          name="occurred_at"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Date *</FormLabel>
              <FormControl>
                <Input
                  type="date"
                  {...field}
                  data-testid="input-interaction-date"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Summary (optional) */}
        <FormField
          control={form.control}
          name="summary"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Summary{" "}
                <span className="text-muted-foreground font-normal">
                  (optional)
                </span>
              </FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  placeholder="Brief description of the interaction..."
                  rows={2}
                  data-testid="textarea-interaction-summary"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Raw content (optional) */}
        <FormField
          control={form.control}
          name="raw_content"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Raw Content{" "}
                <span className="text-muted-foreground font-normal">
                  (optional)
                </span>
              </FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  placeholder="Paste message content, notes, etc..."
                  rows={3}
                  data-testid="textarea-interaction-raw-content"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end gap-2 pt-2">
          <Button
            type="submit"
            disabled={isSubmitting}
            data-testid="button-submit-interaction"
          >
            {isSubmitting ? "Saving..." : "Log Interaction"}
          </Button>
        </div>
      </form>
    </Form>
  );
}

// ── Interaction entry ─────────────────────────────────────────────────────────

function InteractionEntry({ interaction }: { interaction: Interaction }) {
  const date = new Date(interaction.occurredAt);
  const formattedDate = format(date, "MMM d, yyyy");

  return (
    <div
      className="flex items-start gap-3 py-3 border-b last:border-b-0"
      data-testid={`interaction-entry-${interaction.id}`}
    >
      {/* Channel icon */}
      <div className="flex-shrink-0 mt-0.5 text-muted-foreground">
        <ChannelIcon channel={interaction.channel} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">{formattedDate}</span>
          <Badge
            variant="secondary"
            className={`text-xs capitalize ${directionBadgeClass(interaction.direction)}`}
          >
            {interaction.direction}
          </Badge>
          <span className="text-xs text-muted-foreground capitalize">
            {channelLabels[interaction.channel as Channel] ?? interaction.channel}
          </span>
        </div>
        {interaction.summary && (
          <p className="text-sm text-foreground">{interaction.summary}</p>
        )}
      </div>
    </div>
  );
}

// ── Main InteractionTimeline component ────────────────────────────────────────

interface InteractionTimelineProps {
  contactId: string;
}

export function InteractionTimeline({ contactId }: InteractionTimelineProps) {
  const { interactions, isLoading } = useInteractions(contactId);
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <div className="space-y-3" data-testid="interaction-timeline">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Interaction Timeline</h3>
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              data-testid="button-log-interaction"
            >
              <Plus className="h-4 w-4 mr-1" />
              Log Interaction
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Log Interaction</SheetTitle>
            </SheetHeader>
            <LogInteractionForm
              contactId={contactId}
              onSuccess={() => setSheetOpen(false)}
            />
          </SheetContent>
        </Sheet>
      </div>

      {isLoading ? (
        <div className="space-y-3" data-testid="interaction-timeline-loading">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-start gap-3 py-3 border-b">
              <Skeleton className="h-4 w-4 rounded" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-3 w-48" />
              </div>
            </div>
          ))}
        </div>
      ) : interactions.length === 0 ? (
        <div
          className="py-8 text-center text-muted-foreground"
          data-testid="interaction-timeline-empty"
        >
          <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm font-medium">No interactions yet</p>
          <p className="text-xs mt-1">
            Click &quot;Log Interaction&quot; to record your first touchpoint.
          </p>
        </div>
      ) : (
        <div
          className="divide-y divide-border rounded-md border px-4"
          data-testid="interaction-timeline-list"
        >
          {interactions.map((interaction) => (
            <InteractionEntry key={interaction.id} interaction={interaction} />
          ))}
        </div>
      )}
    </div>
  );
}
