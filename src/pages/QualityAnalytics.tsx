/**
 * Quality Analytics Page
 * 
 * READ-ONLY HISTORICAL ANALYTICS VIEW
 * All metrics derived exclusively from useProductionLogMetrics hook.
 * No local calculations or write actions.
 */

import { useState, useMemo } from "react";
import { format, subDays } from "date-fns";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader, PageContainer } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { BarChart3, Target, AlertTriangle, TrendingUp, Percent, Clock, Info } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useProductionLogMetrics } from "@/hooks/useProductionLogMetrics";

const COLORS = ["#22c55e", "#f59e0b", "#ef4444", "#3b82f6", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"];

export default function QualityAnalytics() {
  const [dateRange, setDateRange] = useState("30");
  const [trendView, setTrendView] = useState<"operator" | "machine" | "rejection">("operator");

  // Calculate date range
  const calculatedRange = useMemo(() => {
    const days = parseInt(dateRange);
    return {
      start: format(subDays(new Date(), days), "yyyy-MM-dd"),
      end: format(new Date(), "yyyy-MM-dd"),
    };
  }, [dateRange]);

  // SINGLE SOURCE: useProductionLogMetrics
  const { metrics, loading } = useProductionLogMetrics({
    startDate: calculatedRange.start,
    endDate: calculatedRange.end,
    period: 'custom',
  });

  // KPIs - derived from hook only
  const kpis = useMemo(() => {
    if (!metrics) return [];
    
    const totalProduced = metrics.totalOutput + metrics.totalRejections;
    const fpy = totalProduced > 0 ? ((metrics.totalOutput) / totalProduced) * 100 : 100;
    const rejectionRate = metrics.rejectionRate || 0;
    
    return [
      { 
        label: "First Pass Yield", 
        value: fpy.toFixed(1), 
        unit: "%", 
        status: (fpy >= 95 ? "good" : fpy >= 85 ? "warning" : "critical") as "good" | "warning" | "critical", 
        icon: <Target className="h-4 w-4" /> 
      },
      { 
        label: "Rejection Rate", 
        value: rejectionRate.toFixed(2), 
        unit: "%", 
        status: (rejectionRate <= 2 ? "good" : rejectionRate <= 5 ? "warning" : "critical") as "good" | "warning" | "critical", 
        icon: <AlertTriangle className="h-4 w-4" /> 
      },
      { 
        label: "Overall Efficiency", 
        value: (metrics.overallEfficiency || 0).toFixed(1), 
        unit: "%", 
        status: ((metrics.overallEfficiency || 0) >= 85 ? "good" : (metrics.overallEfficiency || 0) >= 70 ? "warning" : "critical") as "good" | "warning" | "critical", 
        icon: <TrendingUp className="h-4 w-4" /> 
      },
      { 
        label: "Total Rejections", 
        value: (metrics.totalRejections || 0).toLocaleString(), 
        unit: "pcs", 
        status: ((metrics.totalRejections || 0) === 0 ? "good" : (metrics.totalRejections || 0) <= 100 ? "warning" : "critical") as "good" | "warning" | "critical", 
        icon: <AlertTriangle className="h-4 w-4" /> 
      },
      { 
        label: "Production Logs", 
        value: metrics.logCount || 0, 
        status: "good" as "good" | "warning" | "critical", 
        icon: <Clock className="h-4 w-4" /> 
      },
      { 
        label: "Utilisation", 
        value: (metrics.utilizationPercent || 0).toFixed(1), 
        unit: "%", 
        status: ((metrics.utilizationPercent || 0) >= 80 ? "good" : (metrics.utilizationPercent || 0) >= 60 ? "warning" : "critical") as "good" | "warning" | "critical", 
        icon: <Percent className="h-4 w-4" /> 
      },
    ];
  }, [metrics]);

  // Operator trends - from hook
  const operatorTrends = useMemo(() => {
    if (!metrics?.operatorMetrics) return [];
    return metrics.operatorMetrics
      .filter(op => op.totalRejections > 0)
      .map(op => ({
        name: op.operatorName.length > 12 ? op.operatorName.slice(0, 12) + '...' : op.operatorName,
        fullName: op.operatorName,
        rejected: op.totalRejections,
        produced: op.totalActual,
        rejectionRate: op.scrapPercent,
      }))
      .sort((a, b) => b.rejected - a.rejected)
      .slice(0, 10);
  }, [metrics]);

  // Machine trends - from hook
  const machineTrends = useMemo(() => {
    if (!metrics?.machineMetrics) return [];
    return metrics.machineMetrics
      .filter(m => m.totalRejections > 0)
      .map(m => ({
        name: m.machineName.split(' - ')[0],
        fullName: m.machineName,
        rejected: m.totalRejections,
        produced: m.totalOutput,
        rejectionRate: m.totalOutput + m.totalRejections > 0
          ? (m.totalRejections / (m.totalOutput + m.totalRejections)) * 100
          : 0,
      }))
      .sort((a, b) => b.rejected - a.rejected)
      .slice(0, 10);
  }, [metrics]);

  // Rejection breakdown - from hook
  const rejectionBreakdown = useMemo(() => {
    if (!metrics?.rejectionBreakdown) return [];
    return metrics.rejectionBreakdown
      .filter(r => r.count > 0)
      .slice(0, 10);
  }, [metrics]);

  // Quality loss indicators - from hook
  const qualityLoss = useMemo(() => {
    if (!metrics) return { scrapPcs: 0, scrapPercent: 0 };
    return {
      scrapPcs: metrics.totalRejections,
      scrapPercent: metrics.rejectionRate,
    };
  }, [metrics]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "good": return "text-green-600 dark:text-green-400";
      case "warning": return "text-amber-600 dark:text-amber-400";
      case "critical": return "text-red-600 dark:text-red-400";
      default: return "";
    }
  };

  const getStatusBg = (status: string) => {
    switch (status) {
      case "good": return "bg-green-100 dark:bg-green-900/20";
      case "warning": return "bg-amber-100 dark:bg-amber-900/20";
      case "critical": return "bg-red-100 dark:bg-red-900/20";
      default: return "";
    }
  };

  if (loading) {
    return (
      <PageContainer>
        <PageHeader title="Quality Analytics" description="Loading..." />
        <div className="grid gap-4">
          <Skeleton className="h-24 w-full" />
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-28" />
            ))}
          </div>
          <Skeleton className="h-[400px]" />
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <PageHeader
          title="Quality Analytics"
          description="Defect trends derived from Production Logs"
          icon={<BarChart3 className="h-6 w-6" />}
        />
        <Select value={dateRange} onValueChange={setDateRange}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="14">Last 14 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="60">Last 60 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Read-only notice */}
      <Alert className="mb-6">
        <Info className="h-4 w-4" />
        <AlertDescription>
          All metrics derived from Production Log entries via shared calculation engine. This is a read-only view — no local calculations.
        </AlertDescription>
      </Alert>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        {kpis.map((kpi, idx) => (
          <Card key={idx} className={cn("relative overflow-hidden", getStatusBg(kpi.status))}>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 mb-1">
                <span className={getStatusColor(kpi.status)}>{kpi.icon}</span>
                <span className="text-xs text-muted-foreground">{kpi.label}</span>
              </div>
              <p className={cn("text-2xl font-bold", getStatusColor(kpi.status))}>
                {kpi.value}{kpi.unit && <span className="text-sm font-normal ml-1">{kpi.unit}</span>}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quality Loss Summary */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            Quality Loss Summary
          </CardTitle>
          <CardDescription>Scrap and rejection impact from production logs</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
              <p className="text-3xl font-bold text-red-600 dark:text-red-400">
                {qualityLoss.scrapPcs.toLocaleString()}
              </p>
              <p className="text-sm text-muted-foreground">Total Scrap (pcs)</p>
            </div>
            <div className="text-center p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
              <p className="text-3xl font-bold text-red-600 dark:text-red-400">
                {qualityLoss.scrapPercent.toFixed(2)}%
              </p>
              <p className="text-sm text-muted-foreground">Scrap Rate</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Defect Trends */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Defect Trends</CardTitle>
              <CardDescription>Rejection analysis by category</CardDescription>
            </div>
            <Tabs value={trendView} onValueChange={(v) => setTrendView(v as any)}>
              <TabsList>
                <TabsTrigger value="operator">By Operator</TabsTrigger>
                <TabsTrigger value="machine">By Machine</TabsTrigger>
                <TabsTrigger value="rejection">By Type</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-6">
            {/* Chart */}
            <div className="h-[300px]">
              {trendView === "operator" && operatorTrends.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={operatorTrends} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis type="number" />
                    <YAxis dataKey="name" type="category" width={80} className="text-xs" />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--popover))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                      formatter={(value: number) => [value.toLocaleString(), 'Rejections']}
                    />
                    <Bar dataKey="rejected" fill="#ef4444" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : trendView === "machine" && machineTrends.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={machineTrends} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis type="number" />
                    <YAxis dataKey="name" type="category" width={80} className="text-xs" />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--popover))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                      formatter={(value: number) => [value.toLocaleString(), 'Rejections']}
                    />
                    <Bar dataKey="rejected" fill="#f59e0b" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : trendView === "rejection" && rejectionBreakdown.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={rejectionBreakdown} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis type="number" />
                    <YAxis dataKey="reason" type="category" width={100} className="text-xs" />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--popover))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                      formatter={(value: number) => [value.toLocaleString(), 'Count']}
                    />
                    <Bar dataKey="count" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                  No data for selected view
                </div>
              )}
            </div>

            {/* Table */}
            <div className="overflow-auto max-h-[300px]">
              {trendView === "operator" && operatorTrends.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Operator</TableHead>
                      <TableHead className="text-right">Rejected</TableHead>
                      <TableHead className="text-right">Rate %</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {operatorTrends.map((op, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-medium">{op.fullName}</TableCell>
                        <TableCell className="text-right text-red-600">{op.rejected.toLocaleString()}</TableCell>
                        <TableCell className="text-right">{op.rejectionRate.toFixed(1)}%</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : trendView === "machine" && machineTrends.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Machine</TableHead>
                      <TableHead className="text-right">Rejected</TableHead>
                      <TableHead className="text-right">Rate %</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {machineTrends.map((m, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-medium">{m.fullName}</TableCell>
                        <TableCell className="text-right text-red-600">{m.rejected.toLocaleString()}</TableCell>
                        <TableCell className="text-right">{m.rejectionRate.toFixed(1)}%</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : trendView === "rejection" && rejectionBreakdown.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Rejection Type</TableHead>
                      <TableHead className="text-right">Count</TableHead>
                      <TableHead className="text-right">% of Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rejectionBreakdown.map((r, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-medium">{r.reason}</TableCell>
                        <TableCell className="text-right text-red-600">{r.count.toLocaleString()}</TableCell>
                        <TableCell className="text-right">{r.percent.toFixed(1)}%</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                  No data for selected view
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Footer */}
      <div className="bg-muted/30 border rounded-lg p-4">
        <h4 className="text-sm font-medium mb-2">Calculation Formulas</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs text-muted-foreground font-mono">
          <div>FPY = (OK Qty ÷ Total Produced) × 100</div>
          <div>Rejection Rate = (Rejected ÷ Total) × 100</div>
          <div>Scrap % = (Rejections ÷ Actual Qty) × 100</div>
        </div>
      </div>
    </PageContainer>
  );
}
