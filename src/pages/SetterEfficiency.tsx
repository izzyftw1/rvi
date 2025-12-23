/**
 * Setter Efficiency Page
 * 
 * READ-ONLY HISTORICAL ANALYTICS VIEW
 * All metrics derived exclusively from useSetterEfficiencyMetrics hook.
 * Sources data from cnc_programmer_activity - NOT production logs.
 * 
 * Metrics:
 * 1. Setup duration (setup_start_time → setup_end_time)
 * 2. First-off approval delay (setup_end_time → first_piece_approval_time)
 * 3. Repeat setup faults (same item/WO within 24h window)
 */

import { useState, useMemo } from "react";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, parseISO } from "date-fns";
import { 
  Wrench, Clock, RefreshCw, Download, Info, Timer, Zap, 
  AlertTriangle, TrendingUp, Award, RepeatIcon, CheckCircle2 
} from "lucide-react";
import { useSetterEfficiencyMetrics, type SetterMetrics, type SetupRecord } from "@/hooks/useSetterEfficiencyMetrics";
import { toast } from "sonner";

import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

type Period = "daily" | "weekly" | "monthly";

const SetterEfficiency = () => {
  const [period, setPeriod] = useState<Period>("daily");
  const [selectedDate, setSelectedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [activeTab, setActiveTab] = useState<"overview" | "details">("overview");

  // Get date range based on period
  const dateRange = useMemo(() => {
    const baseDate = parseISO(selectedDate);
    switch (period) {
      case "daily":
        return { start: selectedDate, end: selectedDate };
      case "weekly":
        return {
          start: format(startOfWeek(baseDate, { weekStartsOn: 1 }), "yyyy-MM-dd"),
          end: format(endOfWeek(baseDate, { weekStartsOn: 1 }), "yyyy-MM-dd"),
        };
      case "monthly":
        return {
          start: format(startOfMonth(baseDate), "yyyy-MM-dd"),
          end: format(endOfMonth(baseDate), "yyyy-MM-dd"),
        };
    }
  }, [period, selectedDate]);

  // SINGLE SOURCE: useSetterEfficiencyMetrics (NOT production log metrics)
  const { 
    setterMetrics, 
    setupRecords, 
    summary, 
    loading, 
    error, 
    refresh 
  } = useSetterEfficiencyMetrics({
    startDate: dateRange.start,
    endDate: dateRange.end,
    repeatWindowHours: 24,
  });

  const formatDuration = (minutes: number | null) => {
    if (!minutes || minutes <= 0) return "—";
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  const getSetupTimeColor = (avgTime: number) => {
    if (avgTime <= 15) return "text-green-600 dark:text-green-400";
    if (avgTime <= 30) return "text-amber-600 dark:text-amber-400";
    return "text-red-600 dark:text-red-400";
  };

  const getDelayColor = (delay: number) => {
    if (delay <= 5) return "text-green-600 dark:text-green-400";
    if (delay <= 15) return "text-amber-600 dark:text-amber-400";
    return "text-red-600 dark:text-red-400";
  };

  const getEfficiencyBadge = (score: number) => {
    if (score <= 20) return { label: "Excellent", variant: "default" as const, className: "bg-green-600" };
    if (score <= 35) return { label: "Good", variant: "secondary" as const, className: "bg-blue-600 text-white" };
    if (score <= 50) return { label: "Average", variant: "outline" as const, className: "" };
    return { label: "Needs Improvement", variant: "destructive" as const, className: "" };
  };

  const exportCSV = () => {
    if (setterMetrics.length === 0) {
      toast.error("No data to export");
      return;
    }

    const headers = [
      "Setter Name",
      "Total Setups",
      "Avg Setup Time (min)",
      "Min Setup Time (min)",
      "Max Setup Time (min)",
      "Avg Approval Delay (min)",
      "Max Approval Delay (min)",
      "Repeat Setups",
      "Efficiency Score",
    ];
    const rows = setterMetrics.map((m) => [
      m.setterName,
      m.totalSetups,
      m.avgSetupDurationMinutes,
      m.minSetupDurationMinutes,
      m.maxSetupDurationMinutes,
      m.avgApprovalDelayMinutes,
      m.maxApprovalDelayMinutes,
      m.repeatSetupCount,
      m.efficiencyScore,
    ]);

    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `setter-efficiency-${dateRange.start}-to-${dateRange.end}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exported");
  };

  return (
    <div className="container mx-auto p-4 space-y-6">
      <PageHeader
        title="Setter Efficiency"
        description="Setup performance analytics from CNC Programmer Activity"
      />

      {/* Data Source Notice */}
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          All metrics derived from <strong>CNC Programmer Activity</strong> records — NOT production logs.
          <br />
          <span className="text-xs text-muted-foreground">
            Setup Duration • First-off Approval Delay • Repeat Setup Detection
          </span>
        </AlertDescription>
      </Alert>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Wrench className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Setters</span>
            </div>
            {loading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{summary.setterCount}</div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Timer className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Total Setups</span>
            </div>
            {loading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{summary.totalSetups}</div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Avg Setup Time</span>
            </div>
            {loading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className={cn("text-2xl font-bold", getSetupTimeColor(summary.avgSetupDuration))}>
                {formatDuration(summary.avgSetupDuration)}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Avg Approval Delay</span>
            </div>
            {loading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className={cn("text-2xl font-bold", getDelayColor(summary.avgApprovalDelay))}>
                {formatDuration(summary.avgApprovalDelay)}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <RepeatIcon className="h-4 w-4 text-orange-500" />
              <span className="text-xs text-muted-foreground">Repeat Setups</span>
            </div>
            {loading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold text-orange-600">
                {summary.totalRepeatSetups}
                {summary.totalSetups > 0 && (
                  <span className="text-sm font-normal text-muted-foreground ml-1">
                    ({Math.round((summary.totalRepeatSetups / summary.totalSetups) * 100)}%)
                  </span>
                )}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Award className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Best Performer</span>
            </div>
            {loading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-lg font-bold truncate" title={summary.bestPerformer || ""}>
                {summary.bestPerformer || "—"}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-4 items-end">
            {/* Period Toggle */}
            <div className="space-y-2">
              <Label className="text-xs">Period</Label>
              <Tabs value={period} onValueChange={(v) => setPeriod(v as Period)}>
                <TabsList>
                  <TabsTrigger value="daily">Daily</TabsTrigger>
                  <TabsTrigger value="weekly">Weekly</TabsTrigger>
                  <TabsTrigger value="monthly">Monthly</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            {/* Date Picker */}
            <div className="space-y-2">
              <Label className="text-xs">Date</Label>
              <Input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-40"
              />
            </div>

            <div className="ml-auto flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {format(parseISO(dateRange.start), "MMM d")} –{" "}
                {format(parseISO(dateRange.end), "MMM d, yyyy")}
              </span>
              <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
                <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
              </Button>
              <Button variant="outline" size="sm" onClick={exportCSV} disabled={setterMetrics.length === 0}>
                <Download className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Content Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
        <TabsList>
          <TabsTrigger value="overview">Setter Overview</TabsTrigger>
          <TabsTrigger value="details">Setup Details</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Wrench className="h-5 w-5" />
                Setter Performance
              </CardTitle>
              <CardDescription>
                Ranked by efficiency score (lower is better)
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Skeleton key={i} className="h-14 w-full" />
                  ))}
                </div>
              ) : setterMetrics.length === 0 ? (
                <div className="text-center py-12">
                  <Wrench className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                  <h3 className="text-sm font-medium mb-1">No setter activity recorded</h3>
                  <p className="text-sm text-muted-foreground mb-1">
                    No CNC programmer activity entries for this period.
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Log setups via CNC Programmer Activity page.
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Setter</TableHead>
                      <TableHead className="text-center">Setups</TableHead>
                      <TableHead className="text-center">Avg Setup</TableHead>
                      <TableHead className="text-center">Min / Max</TableHead>
                      <TableHead className="text-center">Avg Delay</TableHead>
                      <TableHead className="text-center">Max Delay</TableHead>
                      <TableHead className="text-center">Repeats</TableHead>
                      <TableHead className="text-center">Score</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {setterMetrics.map((metrics, idx) => {
                      const badge = getEfficiencyBadge(metrics.efficiencyScore);
                      return (
                        <TableRow key={metrics.setterId}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {idx === 0 && <Award className="h-4 w-4 text-yellow-500" />}
                              <span className="font-medium">{metrics.setterName}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="secondary">{metrics.totalSetups}</Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <span className={cn("font-medium", getSetupTimeColor(metrics.avgSetupDurationMinutes))}>
                              {formatDuration(metrics.avgSetupDurationMinutes)}
                            </span>
                          </TableCell>
                          <TableCell className="text-center text-sm text-muted-foreground">
                            {formatDuration(metrics.minSetupDurationMinutes)} / {formatDuration(metrics.maxSetupDurationMinutes)}
                          </TableCell>
                          <TableCell className="text-center">
                            <span className={cn("font-medium", getDelayColor(metrics.avgApprovalDelayMinutes))}>
                              {formatDuration(metrics.avgApprovalDelayMinutes)}
                            </span>
                          </TableCell>
                          <TableCell className="text-center text-muted-foreground">
                            {formatDuration(metrics.maxApprovalDelayMinutes)}
                          </TableCell>
                          <TableCell className="text-center">
                            {metrics.repeatSetupCount > 0 ? (
                              <Badge variant="outline" className="text-orange-600 border-orange-300">
                                {metrics.repeatSetupCount}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">0</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant={badge.variant} className={badge.className}>
                              {metrics.efficiencyScore}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="details" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Timer className="h-5 w-5" />
                Setup Activity Log
              </CardTitle>
              <CardDescription>
                Individual setup records from CNC Programmer Activity
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : setupRecords.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  No setup records for this period.
                </div>
              ) : (
                <div className="max-h-[500px] overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Setter</TableHead>
                        <TableHead>Machine</TableHead>
                        <TableHead>Item / WO</TableHead>
                        <TableHead className="text-center">Duration</TableHead>
                        <TableHead className="text-center">Approval Delay</TableHead>
                        <TableHead className="text-center">Flags</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {setupRecords.map((record) => (
                        <TableRow key={record.id}>
                          <TableCell className="whitespace-nowrap">
                            {format(parseISO(record.activityDate), "MMM d")}
                          </TableCell>
                          <TableCell>{record.setterName}</TableCell>
                          <TableCell className="text-sm">{record.machineName}</TableCell>
                          <TableCell>
                            <div className="text-sm">
                              <span className="font-mono">{record.itemCode || "—"}</span>
                              {record.woDisplayId && (
                                <span className="text-muted-foreground ml-1">
                                  ({record.woDisplayId})
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <span className={cn("font-medium", getSetupTimeColor(record.setupDurationMinutes))}>
                              {formatDuration(record.setupDurationMinutes)}
                            </span>
                          </TableCell>
                          <TableCell className="text-center">
                            {record.approvalDelayMinutes !== null ? (
                              <span className={cn("font-medium", getDelayColor(record.approvalDelayMinutes))}>
                                {formatDuration(record.approvalDelayMinutes)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {record.isRepeatSetup && (
                              <Badge variant="outline" className="text-orange-600 border-orange-300 text-xs">
                                <RepeatIcon className="h-3 w-3 mr-1" />
                                Repeat
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Footer - Calculation Formulas */}
      <div className="bg-muted/30 border rounded-lg p-4">
        <h4 className="text-sm font-medium mb-2">Calculation Formulas</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs text-muted-foreground font-mono">
          <div>Setup Duration = setup_end_time − setup_start_time</div>
          <div>Approval Delay = first_piece_approval_time − setup_end_time</div>
          <div>Repeat Setup = same item+WO within 24h window</div>
        </div>
        <div className="mt-2 text-xs text-muted-foreground">
          <strong>Efficiency Score</strong> = Avg Setup Time + (Avg Delay × 0.5) + (Repeat % × 10) — <em>Lower is better</em>
        </div>
      </div>
    </div>
  );
};

export default SetterEfficiency;
