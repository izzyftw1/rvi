/**
 * Production Log Dashboard
 * 
 * READ-ONLY analytics dashboard derived SOLELY from daily_production_logs.
 * NO manual overrides - this reflects actual logged data only.
 * 
 * Provides:
 * - Daily output trends
 * - Shift performance comparison
 * - Scrap/rejection trends
 * - Downtime Pareto
 * - Machine utilisation
 */

import { useProductionLogMetrics } from "@/hooks/useProductionLogMetrics";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  TrendingUp, 
  Target, 
  AlertTriangle, 
  Clock, 
  Factory,
  BarChart3,
  Activity,
  Info
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatPercent, formatCount } from "@/lib/displayUtils";

interface ProductionLogDashboardProps {
  period?: 'today' | 'week' | 'month';
  siteId?: string;
  compact?: boolean;
}

export function ProductionLogDashboard({ 
  period = 'today', 
  siteId,
  compact = false 
}: ProductionLogDashboardProps) {
  const { metrics, loading, error } = useProductionLogMetrics({ 
    period, 
    siteId 
  });

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center h-32">
            <div className="animate-pulse text-muted-foreground">Loading production metrics...</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-destructive">Error: {error}</div>
        </CardContent>
      </Card>
    );
  }

  if (!metrics || metrics.logCount === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-muted-foreground">
          <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>No production logs for this period</p>
          <p className="text-xs mt-1">Data appears when production logs are recorded</p>
        </CardContent>
      </Card>
    );
  }

  const periodLabels = {
    today: "Today",
    week: "This Week", 
    month: "This Month"
  };

  if (compact) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Production Metrics
            </CardTitle>
            <Badge variant="outline" className="text-xs">
              {periodLabels[period]}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Output vs Target */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Output</span>
              <span className="font-medium">
                {metrics.totalOutput.toLocaleString()} / {metrics.totalTarget.toLocaleString()}
              </span>
            </div>
            <Progress 
              value={metrics.totalTarget > 0 ? (metrics.totalOutput / metrics.totalTarget) * 100 : 0} 
              className="h-2" 
            />
          </div>
          
          {/* Key metrics row */}
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="text-center p-2 bg-muted/50 rounded">
              <p className="text-muted-foreground">Efficiency</p>
              <p className={cn(
                "font-bold",
                metrics.overallEfficiency >= 80 ? "text-green-600" : 
                metrics.overallEfficiency >= 60 ? "text-amber-600" : "text-red-600"
              )}>
                {formatPercent(metrics.overallEfficiency)}
              </p>
            </div>
            <div className="text-center p-2 bg-muted/50 rounded">
              <p className="text-muted-foreground">Rejection</p>
              <p className={cn(
                "font-bold",
                metrics.rejectionRate > 3 ? "text-red-600" : 
                metrics.rejectionRate > 1 ? "text-amber-600" : "text-green-600"
              )}>
                {formatPercent(metrics.rejectionRate, 1)}
              </p>
            </div>
            <div className="text-center p-2 bg-muted/50 rounded">
              <p className="text-muted-foreground">Utilisation</p>
              <p className={cn(
                "font-bold",
                metrics.utilizationPercent >= 70 ? "text-green-600" : 
                metrics.utilizationPercent >= 50 ? "text-amber-600" : "text-red-600"
              )}>
                {formatPercent(metrics.utilizationPercent)}
              </p>
            </div>
          </div>
          
          <p className="text-[10px] text-muted-foreground text-center">
            Based on {metrics.logCount} production log entries
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Production Analytics
          </h2>
          <p className="text-sm text-muted-foreground flex items-center gap-1">
            <Info className="h-3 w-3" />
            Read-only view derived from {metrics.logCount} production log entries
          </p>
        </div>
        <Badge variant="secondary">{periodLabels[period]}</Badge>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <Target className="h-6 w-6 text-primary" />
              <div>
                <p className="text-xs text-muted-foreground">Output vs Target</p>
                <p className="text-xl font-bold">
                  {metrics.totalOutput.toLocaleString()}
                  <span className="text-sm font-normal text-muted-foreground">
                    {" "}/ {metrics.totalTarget.toLocaleString()}
                  </span>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <TrendingUp className={cn(
                "h-6 w-6",
                metrics.overallEfficiency >= 80 ? "text-green-600" : 
                metrics.overallEfficiency >= 60 ? "text-amber-600" : "text-red-600"
              )} />
              <div>
                <p className="text-xs text-muted-foreground">Avg Efficiency</p>
                <p className={cn(
                  "text-xl font-bold",
                  metrics.overallEfficiency >= 80 ? "text-green-600" : 
                  metrics.overallEfficiency >= 60 ? "text-amber-600" : "text-red-600"
                )}>
                  {formatPercent(metrics.overallEfficiency)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className={cn(
                "h-6 w-6",
                metrics.rejectionRate > 3 ? "text-red-600" : 
                metrics.rejectionRate > 1 ? "text-amber-600" : "text-green-600"
              )} />
              <div>
                <p className="text-xs text-muted-foreground">Rejection Rate</p>
                <p className={cn(
                  "text-xl font-bold",
                  metrics.rejectionRate > 3 ? "text-red-600" : 
                  metrics.rejectionRate > 1 ? "text-amber-600" : "text-green-600"
                )}>
                  {formatPercent(metrics.rejectionRate, 1)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {metrics.totalRejections.toLocaleString()} pcs
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <Factory className={cn(
                "h-6 w-6",
                metrics.utilizationPercent >= 70 ? "text-green-600" : 
                metrics.utilizationPercent >= 50 ? "text-amber-600" : "text-red-600"
              )} />
              <div>
                <p className="text-xs text-muted-foreground">Machine Utilisation</p>
                <p className={cn(
                  "text-xl font-bold",
                  metrics.utilizationPercent >= 70 ? "text-green-600" : 
                  metrics.utilizationPercent >= 50 ? "text-amber-600" : "text-red-600"
                )}>
                  {formatPercent(metrics.utilizationPercent)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Tabs */}
      <Tabs defaultValue="trends" className="w-full">
        <TabsList>
          <TabsTrigger value="trends">Daily Trends</TabsTrigger>
          <TabsTrigger value="shifts">Shift Performance</TabsTrigger>
          <TabsTrigger value="machines">Machine Utilisation</TabsTrigger>
          <TabsTrigger value="rejections">Rejection Pareto</TabsTrigger>
          <TabsTrigger value="downtime">Downtime Pareto</TabsTrigger>
        </TabsList>

        <TabsContent value="trends" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Daily Output Trend</CardTitle>
              <CardDescription>Output and rejection by day</CardDescription>
            </CardHeader>
            <CardContent>
              {metrics.dailyMetrics.length === 0 ? (
                <p className="text-muted-foreground text-sm">No daily data available</p>
              ) : (
                <div className="space-y-2">
                  {metrics.dailyMetrics.map((day) => (
                    <div key={day.date} className="flex items-center gap-4 p-2 rounded bg-muted/30">
                      <span className="text-sm font-mono w-24">{day.date}</span>
                      <div className="flex-1">
                        <Progress 
                          value={day.totalTarget > 0 ? (day.totalOutput / day.totalTarget) * 100 : 0}
                          className="h-2"
                        />
                      </div>
                      <span className="text-sm font-medium w-20 text-right">
                        {day.totalOutput.toLocaleString()}
                      </span>
                      <span className="text-xs text-muted-foreground w-16 text-right">
                        {day.totalRejections > 0 && (
                          <span className="text-red-600">-{day.totalRejections}</span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="shifts" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Shift Performance</CardTitle>
              <CardDescription>Comparison by shift</CardDescription>
            </CardHeader>
            <CardContent>
              {metrics.shiftMetrics.length === 0 ? (
                <p className="text-muted-foreground text-sm">No shift data available</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {metrics.shiftMetrics.map((shift) => (
                    <div key={shift.shift} className="p-4 rounded-lg border bg-card">
                      <h4 className="font-medium mb-2">{shift.shift}</h4>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Output</span>
                          <span className="font-medium">{shift.totalOutput.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Efficiency</span>
                          <span className={cn(
                            "font-medium",
                            shift.avgEfficiency >= 80 ? "text-green-600" : 
                            shift.avgEfficiency >= 60 ? "text-amber-600" : "text-red-600"
                          )}>
                            {shift.avgEfficiency.toFixed(1)}%
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Rejections</span>
                          <span className={shift.totalRejections > 0 ? "text-red-600" : ""}>
                            {shift.totalRejections.toLocaleString()}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground pt-1">
                          {shift.logCount} log entries
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="machines" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Machine Utilisation</CardTitle>
              <CardDescription>Runtime and output by machine</CardDescription>
            </CardHeader>
            <CardContent>
              {metrics.machineMetrics.length === 0 ? (
                <p className="text-muted-foreground text-sm">No machine data available</p>
              ) : (
                <div className="space-y-3">
                  {metrics.machineMetrics.slice(0, 10).map((machine) => (
                    <div key={machine.machineId} className="flex items-center gap-4 p-3 rounded-lg border">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{machine.machineName}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Progress 
                            value={machine.utilizationPercent} 
                            className="h-2 flex-1"
                          />
                          <span className="text-xs font-medium w-12 text-right">
                            {machine.utilizationPercent.toFixed(0)}%
                          </span>
                        </div>
                      </div>
                      <div className="text-right text-sm">
                        <p className="font-medium">{machine.totalOutput.toLocaleString()} pcs</p>
                        <p className="text-xs text-muted-foreground">
                          {Math.round(machine.totalRuntime / 60)}h runtime
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rejections" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Rejection Pareto</CardTitle>
              <CardDescription>Top rejection reasons</CardDescription>
            </CardHeader>
            <CardContent>
              {metrics.rejectionBreakdown.length === 0 ? (
                <p className="text-muted-foreground text-sm">No rejections recorded</p>
              ) : (
                <div className="space-y-2">
                  {metrics.rejectionBreakdown.map((item, idx) => (
                    <div key={item.reason} className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground w-4">{idx + 1}</span>
                      <span className="flex-1 text-sm">{item.reason}</span>
                      <Progress 
                        value={item.percent} 
                        className="w-32 h-2"
                      />
                      <span className="text-sm font-medium w-16 text-right">
                        {item.count.toLocaleString()}
                      </span>
                      <span className="text-xs text-muted-foreground w-12 text-right">
                        {item.percent.toFixed(1)}%
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="downtime" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Downtime Pareto</CardTitle>
              <CardDescription>Top downtime reasons</CardDescription>
            </CardHeader>
            <CardContent>
              {metrics.downtimePareto.length === 0 ? (
                <p className="text-muted-foreground text-sm">No downtime events recorded</p>
              ) : (
                <div className="space-y-2">
                  {metrics.downtimePareto.map((item, idx) => (
                    <div key={item.reason} className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground w-4">{idx + 1}</span>
                      <span className="flex-1 text-sm">{item.reason}</span>
                      <Progress 
                        value={item.percent} 
                        className="w-32 h-2"
                      />
                      <span className="text-sm font-medium w-16 text-right">
                        {Math.round(item.minutes / 60)}h
                      </span>
                      <span className="text-xs text-muted-foreground w-12 text-right">
                        {item.percent.toFixed(1)}%
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Footer note */}
      <div className="text-xs text-muted-foreground text-center p-4 bg-muted/30 rounded-lg">
        <Info className="h-3 w-3 inline mr-1" />
        All metrics are derived from Production Log entries. No manual overrides are applied.
      </div>
    </div>
  );
}
