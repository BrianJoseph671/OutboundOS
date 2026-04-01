import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Download, AlertCircle, BarChart3 } from "lucide-react";
import { useRoi } from "@/hooks/useRoi";
import { apiRequest } from "@/lib/queryClient";
import type { RoiMetrics } from "@shared/types/phase4";

const TIER_COLORS: Record<string, string> = {
  hot: "#ef4444",
  warm: "#f59e0b",
  cool: "#3b82f6",
};

const ACTION_COLORS: Record<string, string> = {
  completed: "#22c55e",
  dismissed: "#6b7280",
  pending: "#f59e0b",
  snoozed: "#8b5cf6",
};

const CHANNEL_COLORS = {
  last30: "#3b82f6",
  last60: "#60a5fa",
  last90: "#93c5fd",
};

function handleExportCsv() {
  const url = "/api/dashboard/roi/export";
  const a = document.createElement("a");
  a.href = url;
  a.download = "roi-export.csv";
  a.click();
}

function TierChart({ data }: { data: RoiMetrics["contactsByTier"] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} layout="vertical" margin={{ left: 20 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" />
        <YAxis type="category" dataKey="tier" width={50} tick={{ fontSize: 12 }} />
        <RechartsTooltip />
        <Bar dataKey="count" name="Contacts" radius={[0, 4, 4, 0]}>
          {data.map((entry) => (
            <Cell key={entry.tier} fill={TIER_COLORS[entry.tier] || "#6b7280"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function ChannelChart({ data }: { data: RoiMetrics["interactionsByChannel"] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ left: 10 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="channel" tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} />
        <RechartsTooltip />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="last30" name="30 days" fill={CHANNEL_COLORS.last30} radius={[4, 4, 0, 0]} />
        <Bar dataKey="last60" name="60 days" fill={CHANNEL_COLORS.last60} radius={[4, 4, 0, 0]} />
        <Bar dataKey="last90" name="90 days" fill={CHANNEL_COLORS.last90} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function CompletionChart({ data }: { data: RoiMetrics["actionCompletion"] }) {
  const pieData = [
    { name: "Completed", value: data.completed, color: ACTION_COLORS.completed },
    { name: "Dismissed", value: data.dismissed, color: ACTION_COLORS.dismissed },
    { name: "Pending", value: data.pending, color: ACTION_COLORS.pending },
    { name: "Snoozed", value: data.snoozed, color: ACTION_COLORS.snoozed },
  ].filter((d) => d.value > 0);

  return (
    <div className="flex items-center gap-6">
      <div className="relative w-40 h-40 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={pieData}
              cx="50%"
              cy="50%"
              innerRadius={40}
              outerRadius={65}
              paddingAngle={2}
              dataKey="value"
            >
              {pieData.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Pie>
            <RechartsTooltip />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-lg font-bold">{data.completionRate.toFixed(0)}%</span>
        </div>
      </div>
      <div className="flex flex-col gap-1.5 text-sm">
        {pieData.map((d) => (
          <div key={d.name} className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-sm" style={{ backgroundColor: d.color }} />
            <span className="text-muted-foreground">{d.name}</span>
            <span className="font-medium ml-auto">{d.value}</span>
          </div>
        ))}
        <div className="border-t pt-1 mt-1 flex items-center gap-2">
          <span className="text-muted-foreground">Total</span>
          <span className="font-medium ml-auto">{data.total}</span>
        </div>
      </div>
    </div>
  );
}

function ConversionTable({ data }: { data: RoiMetrics["conversionTags"] }) {
  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">No conversion tags found.</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      {data.map((tag) => (
        <div key={tag.tag} className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-muted/50">
          <Badge variant="outline" className="text-xs font-normal">
            {tag.tag.replace(/_/g, " ")}
          </Badge>
          <span className="text-sm font-medium tabular-nums">{tag.count}</span>
        </div>
      ))}
    </div>
  );
}

export default function RoiDashboardPage() {
  const { metrics, isLoading, isError } = useRoi();

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 max-w-5xl" data-testid="roi-loading">
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-8 w-28" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="p-6"><Skeleton className="h-48 w-full" /></CardContent></Card>
          ))}
        </div>
      </div>
    );
  }

  if (isError || !metrics) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4" data-testid="roi-error">
        <AlertCircle className="h-6 w-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Failed to load ROI metrics. Please refresh.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 max-w-5xl" data-testid="roi-dashboard">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold">ROI Dashboard</h1>
        </div>
        <Button variant="outline" size="sm" onClick={handleExportCsv} data-testid="export-csv-button">
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Contacts by Tier</CardTitle>
          </CardHeader>
          <CardContent>
            <TierChart data={metrics.contactsByTier} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Interactions by Channel</CardTitle>
          </CardHeader>
          <CardContent>
            <ChannelChart data={metrics.interactionsByChannel} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Action Completion</CardTitle>
          </CardHeader>
          <CardContent>
            <CompletionChart data={metrics.actionCompletion} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Conversion Tags</CardTitle>
          </CardHeader>
          <CardContent>
            <ConversionTable data={metrics.conversionTags} />
          </CardContent>
        </Card>
      </div>

      <p className="text-[11px] text-muted-foreground text-right">
        Generated {new Date(metrics.generatedAt).toLocaleString()}
      </p>
    </div>
  );
}
