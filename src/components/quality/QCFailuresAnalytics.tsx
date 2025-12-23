import { useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle, TrendingUp, User, Cpu, Settings, RefreshCw } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend
} from "recharts";
import { cn } from "@/lib/utils";
import { QC_FAILURE_CATEGORIES, getCategoryColor, getCategoryLabel, type QCFailureCategory } from "@/config/qcFailureConfig";

interface QCCheck {
  id: string;
  wo_id: string;
  machine_id: string;
  operator_id?: string;
  status: string;
  check_datetime: string;
  failure_reason?: string;
  failure_category?: string;
  out_of_tolerance_dimensions?: string[];
  machines?: { name: string; machine_id: string };
  operator?: { full_name: string };
  work_order?: { display_id: string };
}

interface ProductionLog {
  id: string;
  wo_id: string;
  machine_id: string;
  operator_id?: string;
  setter_id?: string;
  total_rejection_quantity: number;
  rejection_dimension?: number;
  rejection_setting?: number;
  rejection_scratch?: number;
  rejection_dent?: number;
  rejection_tool_mark?: number;
  rejection_forging_mark?: number;
  rejection_material_not_ok?: number;
  rejection_lining?: number;
  rejection_face_not_ok?: number;
  rejection_previous_setup_fault?: number;
  log_date: string;
  machines?: { name: string; machine_id: string };
  operator?: { full_name: string };
  setter?: { full_name: string };
}

interface QCFailuresAnalyticsProps {
  hourlyChecks: QCCheck[];
  productionLogs: ProductionLog[];
}

const CHART_COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

// Defect type labels matching production log columns
const DEFECT_TYPE_LABELS: Record<string, string> = {
  rejection_dimension: 'Dimension',
  rejection_setting: 'Setting',
  rejection_scratch: 'Scratch',
  rejection_dent: 'Dent',
  rejection_tool_mark: 'Tool Mark',
  rejection_forging_mark: 'Forging Mark',
  rejection_material_not_ok: 'Material',
  rejection_lining: 'Lining',
  rejection_face_not_ok: 'Face',
  rejection_previous_setup_fault: 'Previous Setup'
};

export function QCFailuresAnalytics({ hourlyChecks, productionLogs }: QCFailuresAnalyticsProps) {
  // Calculate failures by operator
  const failuresByOperator = useMemo(() => {
    const operatorData: Record<string, { name: string; failures: number; total: number; rejections: number }> = {};
    
    // From hourly checks
    hourlyChecks.forEach(check => {
      const name = (check.operator as any)?.full_name || 'Unknown';
      if (!operatorData[name]) {
        operatorData[name] = { name, failures: 0, total: 0, rejections: 0 };
      }
      operatorData[name].total++;
      if (check.status === 'fail') {
        operatorData[name].failures++;
      }
    });

    // Add rejection data from production logs
    productionLogs.forEach(log => {
      const name = (log.operator as any)?.full_name || 'Unknown';
      if (!operatorData[name]) {
        operatorData[name] = { name, failures: 0, total: 0, rejections: 0 };
      }
      operatorData[name].rejections += log.total_rejection_quantity || 0;
    });

    return Object.values(operatorData)
      .map(d => ({
        ...d,
        failureRate: d.total > 0 ? (d.failures / d.total) * 100 : 0
      }))
      .filter(d => d.failures > 0 || d.rejections > 0)
      .sort((a, b) => b.failures + b.rejections - (a.failures + a.rejections))
      .slice(0, 10);
  }, [hourlyChecks, productionLogs]);

  // Calculate failures by machine
  const failuresByMachine = useMemo(() => {
    const machineData: Record<string, { name: string; failures: number; total: number; rejections: number }> = {};
    
    hourlyChecks.forEach(check => {
      const name = (check.machines as any)?.name || (check.machines as any)?.machine_id || 'Unknown';
      if (!machineData[name]) {
        machineData[name] = { name, failures: 0, total: 0, rejections: 0 };
      }
      machineData[name].total++;
      if (check.status === 'fail') {
        machineData[name].failures++;
      }
    });

    productionLogs.forEach(log => {
      const name = (log.machines as any)?.name || 'Unknown';
      if (!machineData[name]) {
        machineData[name] = { name, failures: 0, total: 0, rejections: 0 };
      }
      machineData[name].rejections += log.total_rejection_quantity || 0;
    });

    return Object.values(machineData)
      .map(d => ({
        ...d,
        failureRate: d.total > 0 ? (d.failures / d.total) * 100 : 0
      }))
      .filter(d => d.failures > 0 || d.rejections > 0)
      .sort((a, b) => b.failures + b.rejections - (a.failures + a.rejections))
      .slice(0, 10);
  }, [hourlyChecks, productionLogs]);

  // Calculate failures by defect type (from production logs)
  const failuresByDefectType = useMemo(() => {
    const defectData: Record<string, number> = {};
    
    productionLogs.forEach(log => {
      Object.entries(DEFECT_TYPE_LABELS).forEach(([key, label]) => {
        const value = (log as any)[key] || 0;
        if (value > 0) {
          defectData[label] = (defectData[label] || 0) + value;
        }
      });
    });

    return Object.entries(defectData)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [productionLogs]);

  // Failures by setup/setter
  const failuresBySetter = useMemo(() => {
    const setterData: Record<string, { name: string; rejections: number; logs: number }> = {};
    
    productionLogs.forEach(log => {
      const name = (log.setter as any)?.full_name || 'Unknown';
      if (!setterData[name]) {
        setterData[name] = { name, rejections: 0, logs: 0 };
      }
      setterData[name].logs++;
      // Setup-related rejections
      const setupRejections = (log.rejection_setting || 0) + (log.rejection_previous_setup_fault || 0);
      setterData[name].rejections += setupRejections;
    });

    return Object.values(setterData)
      .filter(d => d.rejections > 0)
      .sort((a, b) => b.rejections - a.rejections)
      .slice(0, 10);
  }, [productionLogs]);

  // Detect repeat issues (same machine + same defect type appearing multiple times)
  const repeatIssues = useMemo(() => {
    const issueMap: Record<string, { machine: string; defect: string; count: number; dates: string[] }> = {};
    
    productionLogs.forEach(log => {
      const machineName = (log.machines as any)?.name || 'Unknown';
      
      Object.entries(DEFECT_TYPE_LABELS).forEach(([key, defectLabel]) => {
        const value = (log as any)[key] || 0;
        if (value > 0) {
          const issueKey = `${machineName}|${defectLabel}`;
          if (!issueMap[issueKey]) {
            issueMap[issueKey] = { machine: machineName, defect: defectLabel, count: 0, dates: [] };
          }
          issueMap[issueKey].count += value;
          if (!issueMap[issueKey].dates.includes(log.log_date)) {
            issueMap[issueKey].dates.push(log.log_date);
          }
        }
      });
    });

    // Filter to issues appearing on multiple dates (repeat issues)
    return Object.values(issueMap)
      .filter(issue => issue.dates.length >= 2)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [productionLogs]);

  // Summary stats
  const summary = useMemo(() => {
    const totalChecks = hourlyChecks.length;
    const failedChecks = hourlyChecks.filter(c => c.status === 'fail').length;
    const failRate = totalChecks > 0 ? (failedChecks / totalChecks) * 100 : 0;
    const totalRejections = productionLogs.reduce((sum, l) => sum + (l.total_rejection_quantity || 0), 0);

    return {
      totalChecks,
      failedChecks,
      failRate: failRate.toFixed(1),
      totalRejections,
      repeatIssueCount: repeatIssues.length,
      topOffender: failuresByMachine[0]?.name || 'N/A'
    };
  }, [hourlyChecks, productionLogs, failuresByMachine, repeatIssues]);

  const renderBarChart = (data: Array<{ name: string; failures?: number; rejections?: number; count?: number }>, dataKey: string, title: string) => {
    if (!data || data.length === 0) {
      return (
        <div className="h-[280px] flex items-center justify-center text-muted-foreground">
          No data available
        </div>
      );
    }

    return (
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data} layout="vertical">
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis type="number" />
          <YAxis 
            dataKey="name" 
            type="category" 
            width={100} 
            tick={{ fontSize: 11 }}
          />
          <Tooltip />
          <Bar dataKey={dataKey} fill="hsl(var(--destructive))" name={title} radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    );
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-muted-foreground text-sm">QC Checks</div>
            <div className="text-2xl font-bold">{summary.totalChecks}</div>
            <div className="text-xs text-muted-foreground">{summary.failedChecks} failed</div>
          </CardContent>
        </Card>
        <Card className={cn(parseFloat(summary.failRate) > 5 && "border-red-200 dark:border-red-800")}>
          <CardContent className="pt-4">
            <div className="text-muted-foreground text-sm flex items-center gap-1">
              <AlertTriangle className="h-4 w-4" />
              Fail Rate
            </div>
            <div className="text-2xl font-bold">{summary.failRate}%</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-muted-foreground text-sm">Total Rejections</div>
            <div className="text-2xl font-bold text-destructive">{summary.totalRejections.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card className={cn(summary.repeatIssueCount > 0 && "border-amber-200 dark:border-amber-800")}>
          <CardContent className="pt-4">
            <div className="text-muted-foreground text-sm flex items-center gap-1">
              <RefreshCw className="h-4 w-4" />
              Repeat Issues
            </div>
            <div className="text-2xl font-bold text-amber-600">{summary.repeatIssueCount}</div>
          </CardContent>
        </Card>
      </div>

      {/* Repeat Issues Alert */}
      {repeatIssues.length > 0 && (
        <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2 text-amber-700 dark:text-amber-300">
              <RefreshCw className="h-5 w-5" />
              Repeat Issues Detected
            </CardTitle>
            <CardDescription>Same defect occurring on same machine across multiple days</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {repeatIssues.slice(0, 5).map((issue, idx) => (
                <div key={idx} className="flex items-center justify-between p-2 rounded bg-background/50">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{issue.machine}</Badge>
                    <span className="text-sm">{issue.defect}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="destructive">{issue.count} pcs</Badge>
                    <span className="text-xs text-muted-foreground">{issue.dates.length} occurrences</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Analytics Tabs */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            QC Failure Analysis
          </CardTitle>
          <CardDescription>Breakdown by operator, machine, setter, and defect type</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="operator" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="operator" className="gap-1">
                <User className="h-4 w-4" />
                Operator
              </TabsTrigger>
              <TabsTrigger value="machine" className="gap-1">
                <Cpu className="h-4 w-4" />
                Machine
              </TabsTrigger>
              <TabsTrigger value="setter" className="gap-1">
                <Settings className="h-4 w-4" />
                Setup/Setter
              </TabsTrigger>
              <TabsTrigger value="defect" className="gap-1">
                <AlertTriangle className="h-4 w-4" />
                Defect Type
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="operator" className="mt-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                  <h4 className="text-sm font-medium mb-3">Rejections by Operator</h4>
                  {renderBarChart(failuresByOperator, 'rejections', 'Rejections')}
                </div>
                <div className="space-y-2">
                  <h4 className="text-sm font-medium mb-3">Top Operators with Issues</h4>
                  {failuresByOperator.map((op, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2 rounded bg-muted/30">
                      <span className="font-medium">{op.name}</span>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className="text-sm font-mono">{op.rejections} rej</div>
                          <div className="text-xs text-muted-foreground">{op.failures} QC fails</div>
                        </div>
                        {op.failureRate > 10 && (
                          <Badge variant="destructive" className="text-xs">High</Badge>
                        )}
                      </div>
                    </div>
                  ))}
                  {failuresByOperator.length === 0 && (
                    <p className="text-muted-foreground text-sm">No operator-linked failures</p>
                  )}
                </div>
              </div>
            </TabsContent>
            
            <TabsContent value="machine" className="mt-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                  <h4 className="text-sm font-medium mb-3">Rejections by Machine</h4>
                  {renderBarChart(failuresByMachine, 'rejections', 'Rejections')}
                </div>
                <div className="space-y-2">
                  <h4 className="text-sm font-medium mb-3">Top Machines with Issues</h4>
                  {failuresByMachine.map((m, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2 rounded bg-muted/30">
                      <span className="font-medium">{m.name}</span>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className="text-sm font-mono">{m.rejections} rej</div>
                          <div className="text-xs text-muted-foreground">{m.failures} QC fails</div>
                        </div>
                        {m.failureRate > 10 && (
                          <Badge variant="destructive" className="text-xs">High</Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>
            
            <TabsContent value="setter" className="mt-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                  <h4 className="text-sm font-medium mb-3">Setup-Related Rejections by Setter</h4>
                  {renderBarChart(failuresBySetter, 'rejections', 'Setup Rejections')}
                </div>
                <div className="space-y-2">
                  <h4 className="text-sm font-medium mb-3">Top Setters with Setup Issues</h4>
                  {failuresBySetter.map((s, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2 rounded bg-muted/30">
                      <span className="font-medium">{s.name}</span>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{s.logs} setups</Badge>
                        <Badge variant="destructive">{s.rejections} setup rej</Badge>
                      </div>
                    </div>
                  ))}
                  {failuresBySetter.length === 0 && (
                    <p className="text-muted-foreground text-sm">No setup-related rejections</p>
                  )}
                </div>
              </div>
            </TabsContent>
            
            <TabsContent value="defect" className="mt-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                  <h4 className="text-sm font-medium mb-3">Rejections by Defect Type</h4>
                  {failuresByDefectType.length > 0 ? (
                    <ResponsiveContainer width="100%" height={280}>
                      <PieChart>
                        <Pie
                          data={failuresByDefectType}
                          cx="50%"
                          cy="50%"
                          outerRadius={100}
                          fill="#8884d8"
                          dataKey="count"
                          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        >
                          {failuresByDefectType.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-[280px] flex items-center justify-center text-muted-foreground">
                      No defect data available
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <h4 className="text-sm font-medium mb-3">Defect Type Breakdown</h4>
                  {failuresByDefectType.map((d, idx) => (
                    <div key={idx} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span>{d.name}</span>
                        <span className="font-mono">{d.count} pcs</span>
                      </div>
                      <Progress 
                        value={(d.count / (failuresByDefectType[0]?.count || 1)) * 100} 
                        className="h-2"
                      />
                    </div>
                  ))}
                  {failuresByDefectType.length === 0 && (
                    <p className="text-muted-foreground text-sm">No defect data</p>
                  )}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
