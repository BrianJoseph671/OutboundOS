import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  Send,
  Calendar,
  TrendingUp,
  Filter,
  RotateCcw,
} from "lucide-react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { OutreachAttempt, Experiment } from "@shared/schema";

interface DashboardMetrics {
  totalSent: number;
  meetingsBooked: number;
  converted: number;
}

interface PerformanceByType {
  type: string;
  sent: number;
  responded: number;
  positive: number;
  booked: number;
  converted: number;
}

interface ExperimentStats {
  experimentId: string;
  experimentName: string;
  variantA: { sent: number; responded: number; positive: number; booked: number };
  variantB: { sent: number; responded: number; positive: number; booked: number };
}

function MetricCard({
  title,
  value,
  icon: Icon,
  trend,
}: {
  title: string;
  value: number;
  icon: React.ElementType;
  trend?: number;
}) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-3xl font-bold mt-1" data-testid={`metric-${title.toLowerCase().replace(/\s/g, "-")}`}>
              {value.toLocaleString()}
            </p>
            {trend !== undefined && (
              <div className="flex items-center gap-1 mt-2">
                <TrendingUp className="w-3 h-3 text-chart-2" />
                <span className="text-xs text-chart-2">{trend}% vs last period</span>
              </div>
            )}
          </div>
          <div className="w-12 h-12 rounded-md bg-muted flex items-center justify-center">
            <Icon className="w-6 h-6 text-muted-foreground" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function FunnelChart({ metrics }: { metrics: DashboardMetrics }) {
  const stages = [
    { label: "Sent", value: metrics.totalSent, color: "bg-chart-1" },
    { label: "Booked", value: metrics.meetingsBooked, color: "bg-chart-3" },
    { label: "Converted", value: metrics.converted, color: "bg-chart-5" },
  ];

  const maxValue = Math.max(...stages.map((s) => s.value), 1);

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-lg font-medium">Conversion Funnel</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {stages.map((stage, idx) => {
          const percentage = maxValue > 0 ? (stage.value / maxValue) * 100 : 0;
          const conversionRate = idx > 0 && stages[idx - 1].value > 0
            ? ((stage.value / stages[idx - 1].value) * 100).toFixed(1)
            : null;
          
          return (
            <div key={stage.label} className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{stage.label}</span>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground tabular-nums">{stage.value}</span>
                  {conversionRate && (
                    <Badge variant="secondary" className="text-xs">
                      {conversionRate}%
                    </Badge>
                  )}
                </div>
              </div>
              <div className="h-3 bg-muted rounded-sm overflow-hidden">
                <div
                  className={`h-full ${stage.color} transition-all duration-500 rounded-sm`}
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function PerformanceTable({ data }: { data: PerformanceByType[] }) {
  const getTypeLabel = (type: string) => {
    switch (type) {
      case "linkedin_connected": return "LinkedIn Message";
      case "linkedin_connect_request": return "LinkedIn Request";
      case "linkedin_inmail": return "LinkedIn InMail";
      case "email": return "Email";
      default: return type;
    }
  };

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-lg font-medium">Performance by Outreach Type</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-3 px-2 font-medium text-muted-foreground">Type</th>
                <th className="text-right py-3 px-2 font-medium text-muted-foreground">Sent</th>
                <th className="text-right py-3 px-2 font-medium text-muted-foreground">Responded</th>
                <th className="text-right py-3 px-2 font-medium text-muted-foreground">Response %</th>
                <th className="text-right py-3 px-2 font-medium text-muted-foreground">Positive</th>
                <th className="text-right py-3 px-2 font-medium text-muted-foreground">Booked</th>
              </tr>
            </thead>
            <tbody>
              {data.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-muted-foreground">
                    No outreach data yet. Start sending messages to see performance.
                  </td>
                </tr>
              ) : (
                data.map((row) => (
                  <tr key={row.type} className="border-b last:border-0 hover-elevate">
                    <td className="py-3 px-2 font-medium">{getTypeLabel(row.type)}</td>
                    <td className="py-3 px-2 text-right tabular-nums">{row.sent}</td>
                    <td className="py-3 px-2 text-right tabular-nums">{row.responded}</td>
                    <td className="py-3 px-2 text-right tabular-nums">
                      {row.sent > 0 ? ((row.responded / row.sent) * 100).toFixed(1) : 0}%
                    </td>
                    <td className="py-3 px-2 text-right tabular-nums">{row.positive}</td>
                    <td className="py-3 px-2 text-right tabular-nums">{row.booked}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function ExperimentTable({ data }: { data: ExperimentStats[] }) {
  const calculateSignificance = (a: { sent: number; responded: number }, b: { sent: number; responded: number }) => {
    if (a.sent < 20 || b.sent < 20) return null;
    
    const p1 = a.responded / a.sent;
    const p2 = b.responded / b.sent;
    const pPool = (a.responded + b.responded) / (a.sent + b.sent);
    const se = Math.sqrt(pPool * (1 - pPool) * (1/a.sent + 1/b.sent));
    
    if (se === 0) return null;
    
    const z = Math.abs(p1 - p2) / se;
    return z > 1.96 ? "Significant" : "Not significant";
  };

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-lg font-medium">Experiment Performance</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-3 px-2 font-medium text-muted-foreground">Experiment</th>
                <th className="text-right py-3 px-2 font-medium text-muted-foreground">A Sent</th>
                <th className="text-right py-3 px-2 font-medium text-muted-foreground">A Response %</th>
                <th className="text-right py-3 px-2 font-medium text-muted-foreground">B Sent</th>
                <th className="text-right py-3 px-2 font-medium text-muted-foreground">B Response %</th>
                <th className="text-right py-3 px-2 font-medium text-muted-foreground">Significance</th>
              </tr>
            </thead>
            <tbody>
              {data.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-muted-foreground">
                    No experiments yet. Create an experiment to start A/B testing.
                  </td>
                </tr>
              ) : (
                data.map((exp) => {
                  const significance = calculateSignificance(exp.variantA, exp.variantB);
                  return (
                    <tr key={exp.experimentId} className="border-b last:border-0 hover-elevate">
                      <td className="py-3 px-2 font-medium">{exp.experimentName}</td>
                      <td className="py-3 px-2 text-right tabular-nums">{exp.variantA.sent}</td>
                      <td className="py-3 px-2 text-right tabular-nums">
                        {exp.variantA.sent > 0 ? ((exp.variantA.responded / exp.variantA.sent) * 100).toFixed(1) : 0}%
                      </td>
                      <td className="py-3 px-2 text-right tabular-nums">{exp.variantB.sent}</td>
                      <td className="py-3 px-2 text-right tabular-nums">
                        {exp.variantB.sent > 0 ? ((exp.variantB.responded / exp.variantB.sent) * 100).toFixed(1) : 0}%
                      </td>
                      <td className="py-3 px-2 text-right">
                        {significance ? (
                          <Badge variant={significance === "Significant" ? "default" : "secondary"}>
                            {significance}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">Need 20+ per variant</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const [dateRange, setDateRange] = useState("all");
  const [outreachType, setOutreachType] = useState("all");
  const [campaign, setCampaign] = useState("all");

  const { data: attempts = [] } = useQuery<OutreachAttempt[]>({
    queryKey: ["/api/outreach-attempts"],
  });

  const { data: experiments = [] } = useQuery<Experiment[]>({
    queryKey: ["/api/experiments"],
  });

  const campaigns = Array.from(new Set(attempts.map((a) => a.campaign).filter(Boolean))) as string[];

  const filteredAttempts = attempts.filter((attempt) => {
    if (outreachType !== "all" && attempt.outreachType !== outreachType) return false;
    if (campaign !== "all" && attempt.campaign !== campaign) return false;
    return true;
  });

  const metrics: DashboardMetrics = {
    totalSent: filteredAttempts.length,
    meetingsBooked: filteredAttempts.filter((a) => a.meetingBooked).length,
    converted: filteredAttempts.filter((a) => a.converted).length,
  };

  const performanceByType: PerformanceByType[] = ["linkedin_connected", "linkedin_connect_request", "linkedin_inmail", "email"]
    .map((type) => {
      const typeAttempts = filteredAttempts.filter((a) => a.outreachType === type);
      return {
        type,
        sent: typeAttempts.length,
        responded: typeAttempts.filter((a) => a.responded).length,
        positive: typeAttempts.filter((a) => a.positiveResponse).length,
        booked: typeAttempts.filter((a) => a.meetingBooked).length,
        converted: typeAttempts.filter((a) => a.converted).length,
      };
    })
    .filter((p) => p.sent > 0);

  const experimentStats: ExperimentStats[] = experiments.map((exp) => {
    const expAttempts = filteredAttempts.filter((a) => a.experimentId === exp.id);
    const variantA = expAttempts.filter((a) => a.experimentVariant === "A");
    const variantB = expAttempts.filter((a) => a.experimentVariant === "B");
    
    return {
      experimentId: exp.id,
      experimentName: exp.name,
      variantA: {
        sent: variantA.length,
        responded: variantA.filter((a) => a.responded).length,
        positive: variantA.filter((a) => a.positiveResponse).length,
        booked: variantA.filter((a) => a.meetingBooked).length,
      },
      variantB: {
        sent: variantB.length,
        responded: variantB.filter((a) => a.responded).length,
        positive: variantB.filter((a) => a.positiveResponse).length,
        booked: variantB.filter((a) => a.meetingBooked).length,
      },
    };
  });

  const resetFilters = () => {
    setDateRange("all");
    setOutreachType("all");
    setCampaign("all");
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-[140px]" data-testid="select-date-range">
              <SelectValue placeholder="Date range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All time</SelectItem>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
          <Select value={outreachType} onValueChange={setOutreachType}>
            <SelectTrigger className="w-[160px]" data-testid="select-outreach-type">
              <SelectValue placeholder="Outreach type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="linkedin_connected">LinkedIn Message</SelectItem>
              <SelectItem value="linkedin_connect_request">LinkedIn Request</SelectItem>
              <SelectItem value="linkedin_inmail">LinkedIn InMail</SelectItem>
              <SelectItem value="email">Email</SelectItem>
            </SelectContent>
          </Select>
          <Select value={campaign} onValueChange={setCampaign}>
            <SelectTrigger className="w-[140px]" data-testid="select-campaign">
              <SelectValue placeholder="Campaign" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All campaigns</SelectItem>
              {campaigns.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="ghost" size="icon" onClick={resetFilters} data-testid="button-reset-filters">
            <RotateCcw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <MetricCard title="Total Sent" value={metrics.totalSent} icon={Send} />
        <MetricCard title="Meetings Booked" value={metrics.meetingsBooked} icon={Calendar} />
        <MetricCard title="Converted" value={metrics.converted} icon={TrendingUp} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <FunnelChart metrics={metrics} />
        <PerformanceTable data={performanceByType} />
      </div>

      <ExperimentTable data={experimentStats} />
    </div>
  );
}
