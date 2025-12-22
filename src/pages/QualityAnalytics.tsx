import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { format, subDays, startOfMonth, endOfMonth } from "date-fns";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  BarChart3,
  PieChart as PieChartIcon,
  Activity
} from "lucide-react";

const COLORS = ["#22c55e", "#ef4444", "#f59e0b", "#3b82f6", "#8b5cf6"];

export default function QualityAnalytics() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState("30");
  
  const [kpis, setKpis] = useState({
    totalInspections: 0,
    passRate: 0,
    ncrCount: 0,
    avgResolutionDays: 0,
    firstPassYield: 0,
    rejectionRate: 0
  });

  const [trendData, setTrendData] = useState<any[]>([]);
  const [defectData, setDefectData] = useState<any[]>([]);
  const [stageData, setStageData] = useState<any[]>([]);
  const [ncrBySeverity, setNcrBySeverity] = useState<any[]>([]);

  useEffect(() => {
    loadAnalytics();
  }, [dateRange]);

  const loadAnalytics = async () => {
    setLoading(true);
    try {
      const days = parseInt(dateRange);
      const startDate = format(subDays(new Date(), days), "yyyy-MM-dd");

      // Load QC Records
      const { data: qcRecords, error: qcError } = await supabase
        .from("qc_records")
        .select("id, result, qc_type, created_at")
        .gte("created_at", startDate);

      if (qcError) throw qcError;

      // Load NCRs
      const { data: ncrs, error: ncrError } = await supabase
        .from("ncrs")
        .select("id, status, ncr_type, created_at, closed_at")
        .gte("created_at", startDate);

      if (ncrError) throw ncrError;

      // Load Production Logs for rejection data
      const { data: productionLogs, error: prodError } = await supabase
        .from("daily_production_logs")
        .select(`
          log_date,
          actual_quantity,
          ok_quantity,
          total_rejection_quantity,
          rejection_dimension,
          rejection_setting,
          rejection_scratch,
          rejection_dent,
          rejection_tool_mark,
          rejection_forging_mark,
          rejection_material_not_ok,
          rejection_lining
        `)
        .gte("log_date", startDate);

      if (prodError) throw prodError;

      // Calculate KPIs
      const totalInspections = qcRecords?.length || 0;
      const passedCount = qcRecords?.filter(r => r.result === "pass").length || 0;
      const passRate = totalInspections > 0 ? Math.round((passedCount / totalInspections) * 100) : 0;
      
      const totalProduced = productionLogs?.reduce((sum, l) => sum + (l.actual_quantity || 0), 0) || 0;
      const totalOK = productionLogs?.reduce((sum, l) => sum + (l.ok_quantity || 0), 0) || 0;
      const totalRejected = productionLogs?.reduce((sum, l) => sum + (l.total_rejection_quantity || 0), 0) || 0;
      
      const firstPassYield = totalProduced > 0 ? Math.round((totalOK / totalProduced) * 100) : 0;
      const rejectionRate = totalProduced > 0 ? ((totalRejected / totalProduced) * 100).toFixed(2) : "0";

      // Calculate avg resolution days for closed NCRs
      const closedNCRs = (ncrs || []).filter((n: any) => n.closed_at);
      let avgResolutionDays = 0;
      if (closedNCRs.length > 0) {
        const totalDays = closedNCRs.reduce((sum: number, n: any) => {
          const created = new Date(n.created_at);
          const closed = new Date(n.closed_at!);
          return sum + ((closed.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
        }, 0);
        avgResolutionDays = Math.round(totalDays / closedNCRs.length);
      }

      setKpis({
        totalInspections,
        passRate,
        ncrCount: ncrs?.length || 0,
        avgResolutionDays,
        firstPassYield,
        rejectionRate: parseFloat(rejectionRate as string)
      });

      // Build trend data (daily pass rate)
      const dailyData: Record<string, { date: string; passed: number; failed: number; total: number }> = {};
      qcRecords?.forEach(qc => {
        const date = format(new Date(qc.created_at), "MMM dd");
        if (!dailyData[date]) {
          dailyData[date] = { date, passed: 0, failed: 0, total: 0 };
        }
        dailyData[date].total++;
        if (qc.result === "pass") dailyData[date].passed++;
        if (qc.result === "fail") dailyData[date].failed++;
      });
      setTrendData(Object.values(dailyData).slice(-14));

      // Build defect breakdown
      const defectTotals: Record<string, number> = {
        "Dimension": 0,
        "Setting": 0,
        "Scratch": 0,
        "Dent": 0,
        "Tool Mark": 0,
        "Forging Mark": 0,
        "Material": 0,
        "Lining": 0
      };
      productionLogs?.forEach(log => {
        defectTotals["Dimension"] += log.rejection_dimension || 0;
        defectTotals["Setting"] += log.rejection_setting || 0;
        defectTotals["Scratch"] += log.rejection_scratch || 0;
        defectTotals["Dent"] += log.rejection_dent || 0;
        defectTotals["Tool Mark"] += log.rejection_tool_mark || 0;
        defectTotals["Forging Mark"] += log.rejection_forging_mark || 0;
        defectTotals["Material"] += log.rejection_material_not_ok || 0;
        defectTotals["Lining"] += log.rejection_lining || 0;
      });
      setDefectData(Object.entries(defectTotals)
        .filter(([_, value]) => value > 0)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
      );

      // QC by Stage/Type
      const stageBreakdown: Record<string, { passed: number; failed: number }> = {};
      qcRecords?.forEach(qc => {
        const stage = qc.qc_type || "other";
        if (!stageBreakdown[stage]) {
          stageBreakdown[stage] = { passed: 0, failed: 0 };
        }
        if (qc.result === "pass") stageBreakdown[stage].passed++;
        if (qc.result === "fail") stageBreakdown[stage].failed++;
      });
      setStageData(Object.entries(stageBreakdown).map(([name, data]) => ({
        name: name.replace("_", " ").toUpperCase(),
        passed: data.passed,
        failed: data.failed
      })));

      // NCR by type (instead of severity which doesn't exist)
      const typeCounts: Record<string, number> = {};
      (ncrs || []).forEach((n: any) => {
        const type = n.ncr_type || "other";
        typeCounts[type] = (typeCounts[type] || 0) + 1;
      });
      setNcrBySeverity(Object.entries(typeCounts)
        .map(([name, value]) => ({ name: name.toUpperCase(), value }))
        .filter(d => d.value > 0)
      );

    } catch (error: any) {
      console.error("Error loading analytics:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load quality analytics"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Quality Analytics</h1>
            <p className="text-muted-foreground">
              Performance metrics and quality trends
            </p>
          </div>
          <div className="flex items-center gap-4">
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Select period" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
                <SelectItem value="180">Last 6 months</SelectItem>
              </SelectContent>
            </Select>
            <BarChart3 className="h-10 w-10 text-primary" />
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-sm text-muted-foreground">Total Inspections</p>
                <p className="text-3xl font-bold">{kpis.totalInspections}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-sm text-muted-foreground">Pass Rate</p>
                <p className={`text-3xl font-bold ${kpis.passRate >= 95 ? "text-green-600" : kpis.passRate >= 85 ? "text-amber-600" : "text-destructive"}`}>
                  {kpis.passRate}%
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-sm text-muted-foreground">First Pass Yield</p>
                <p className={`text-3xl font-bold ${kpis.firstPassYield >= 95 ? "text-green-600" : "text-amber-600"}`}>
                  {kpis.firstPassYield}%
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-sm text-muted-foreground">Rejection Rate</p>
                <p className={`text-3xl font-bold ${kpis.rejectionRate <= 2 ? "text-green-600" : "text-destructive"}`}>
                  {kpis.rejectionRate}%
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-sm text-muted-foreground">Open NCRs</p>
                <p className={`text-3xl font-bold ${kpis.ncrCount === 0 ? "text-green-600" : "text-amber-600"}`}>
                  {kpis.ncrCount}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-sm text-muted-foreground">Avg NCR Resolution</p>
                <p className="text-3xl font-bold">{kpis.avgResolutionDays}d</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Charts Row 1 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Daily Trend */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Daily QC Trend
              </CardTitle>
              <CardDescription>Pass vs Fail inspections over time</CardDescription>
            </CardHeader>
            <CardContent>
              {trendData.length === 0 ? (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  No data available
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" className="text-xs" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="passed" stroke="#22c55e" strokeWidth={2} name="Passed" />
                    <Line type="monotone" dataKey="failed" stroke="#ef4444" strokeWidth={2} name="Failed" />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Defect Pareto */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Defect Pareto
              </CardTitle>
              <CardDescription>Top rejection reasons by quantity</CardDescription>
            </CardHeader>
            <CardContent>
              {defectData.length === 0 ? (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  No defect data available
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={defectData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis type="number" />
                    <YAxis dataKey="name" type="category" width={100} className="text-xs" />
                    <Tooltip />
                    <Bar dataKey="value" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Charts Row 2 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* QC by Stage */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5" />
                QC by Stage
              </CardTitle>
              <CardDescription>Pass/Fail breakdown by inspection type</CardDescription>
            </CardHeader>
            <CardContent>
              {stageData.length === 0 ? (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  No stage data available
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={stageData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="name" className="text-xs" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="passed" fill="#22c55e" name="Passed" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="failed" fill="#ef4444" name="Failed" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* NCR by Severity */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                NCRs by Severity
              </CardTitle>
              <CardDescription>Distribution of non-conformances</CardDescription>
            </CardHeader>
            <CardContent>
              {ncrBySeverity.length === 0 ? (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-2" />
                    <p>No NCRs in this period</p>
                  </div>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={ncrBySeverity}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {ncrBySeverity.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
