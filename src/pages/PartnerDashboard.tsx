import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useExternalAnalytics, DateRange, PROCESS_LABELS } from "@/hooks/useExternalAnalytics";
import { 
  Truck, Clock, CheckCircle, AlertTriangle, Download, 
  TrendingUp, Package, ArrowRight, Factory 
} from "lucide-react";
import { downloadCSV, downloadPDF } from "@/lib/exportHelpers";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, PieChart, Pie, Cell, Legend 
} from "recharts";
import { Link } from "react-router-dom";

const CHART_COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

const PartnerDashboard = () => {
  const { toast } = useToast();
  const [dateRange, setDateRange] = useState<DateRange>('90');
  const { partnerMetrics, processMetrics, summary, loading } = useExternalAnalytics(dateRange);

  // Top performers
  const topOnTime = [...partnerMetrics]
    .filter(p => p.completed_movements >= 3)
    .sort((a, b) => b.on_time_percentage - a.on_time_percentage)
    .slice(0, 3);

  const topTurnaround = [...partnerMetrics]
    .filter(p => p.completed_movements >= 3 && p.turnaround_days_avg > 0)
    .sort((a, b) => a.turnaround_days_avg - b.turnaround_days_avg)
    .slice(0, 3);

  const lowestLoss = [...partnerMetrics]
    .filter(p => p.completed_movements >= 3)
    .sort((a, b) => a.loss_percentage - b.loss_percentage)
    .slice(0, 3);

  // Chart data
  const partnerChartData = partnerMetrics.slice(0, 8).map(m => ({
    name: m.partner_name.length > 12 ? m.partner_name.slice(0, 12) + "..." : m.partner_name,
    turnaround: m.turnaround_days_avg,
    onTime: m.on_time_percentage,
    loss: m.loss_percentage,
  }));

  const processChartData = processMetrics.map(p => ({
    name: p.process_label,
    value: p.total_movements,
  }));

  const handleExportCSV = () => {
    const exportData = partnerMetrics.map(p => ({
      'Partner': p.partner_name,
      'Process': p.process_type || 'N/A',
      'Total Movements': p.total_movements,
      'Completed': p.completed_movements,
      'Pending': p.pending_movements,
      'Overdue': p.overdue_movements,
      'Qty Sent': p.total_qty_sent,
      'Qty Returned': p.total_qty_returned,
      'Qty Rejected': p.total_qty_rejected,
      'Avg Turnaround (Days)': p.turnaround_days_avg,
      'On-Time %': p.on_time_percentage,
      'Loss %': p.loss_percentage,
    }));
    downloadCSV(exportData, `partner_performance_${dateRange}d`);
    toast({ description: 'CSV export completed' });
  };

  const handleExportPDF = () => {
    const exportData = partnerMetrics.map(p => ({
      partner: p.partner_name,
      movements: p.total_movements,
      completed: p.completed_movements,
      turnaround: p.turnaround_days_avg + 'd',
      onTime: p.on_time_percentage + '%',
      loss: p.loss_percentage + '%',
    }));

    const columns = [
      { header: 'Partner', dataKey: 'partner' },
      { header: 'Movements', dataKey: 'movements' },
      { header: 'Completed', dataKey: 'completed' },
      { header: 'Turnaround', dataKey: 'turnaround' },
      { header: 'On-Time %', dataKey: 'onTime' },
      { header: 'Loss %', dataKey: 'loss' },
    ];

    downloadPDF(
      exportData,
      `partner_performance_${dateRange}d`,
      `Partner Performance Report (Last ${dateRange} Days)`,
      columns
    );
    toast({ description: 'PDF export completed' });
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto p-4 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Truck className="h-6 w-6" />
              Partner Performance
            </h1>
            <p className="text-sm text-muted-foreground">
              Summary KPIs from external movements & receipts
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Select value={dateRange} onValueChange={(v: DateRange) => setDateRange(v)}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="30">Last 30 Days</SelectItem>
                <SelectItem value="90">Last 90 Days</SelectItem>
                <SelectItem value="180">Last 180 Days</SelectItem>
                <SelectItem value="365">Last 365 Days</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={handleExportCSV} variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              CSV
            </Button>
            <Button onClick={handleExportPDF} variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              PDF
            </Button>
            <Button asChild variant="default" size="sm">
              <Link to="/external-analytics">
                Drill-Down <ArrowRight className="h-4 w-4 ml-2" />
              </Link>
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1">
                <Package className="h-3.5 w-3.5" /> Movements
              </CardDescription>
              <CardTitle className="text-2xl">{summary.total_movements}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xs text-muted-foreground">
                {summary.completed_movements} completed
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" /> Avg Turnaround
              </CardDescription>
              <CardTitle className="text-2xl text-primary">
                {summary.avg_turnaround_days}d
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xs text-muted-foreground">
                Send to receive
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1">
                <CheckCircle className="h-3.5 w-3.5" /> On-Time
              </CardDescription>
              <CardTitle className={cn(
                "text-2xl",
                summary.on_time_percentage >= 80 ? "text-green-600" : 
                summary.on_time_percentage >= 60 ? "text-amber-600" : "text-destructive"
              )}>
                {summary.on_time_percentage}%
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Progress value={summary.on_time_percentage} className="h-2" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5" /> Overdue
              </CardDescription>
              <CardTitle className={cn(
                "text-2xl",
                summary.overdue_movements === 0 ? "text-green-600" : "text-destructive"
              )}>
                {summary.overdue_movements}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xs text-muted-foreground">
                Past expected date
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Loss %</CardDescription>
              <CardTitle className={cn(
                "text-2xl",
                summary.loss_percentage <= 1 ? "text-green-600" : 
                summary.loss_percentage <= 3 ? "text-amber-600" : "text-destructive"
              )}>
                {summary.loss_percentage}%
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xs text-muted-foreground">
                Closed movements only
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Qty Flow</CardDescription>
              <CardTitle className="text-lg">
                {summary.total_qty_sent.toLocaleString()}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xs text-muted-foreground">
                Returned: {summary.total_qty_returned.toLocaleString()}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Charts */}
        {!loading && partnerChartData.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Turnaround by Partner</CardTitle>
                <CardDescription>Average days from send to receive</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={partnerChartData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis type="number" unit="d" />
                    <YAxis dataKey="name" type="category" width={100} className="text-xs" />
                    <Tooltip />
                    <Bar dataKey="turnaround" fill="hsl(var(--primary))" name="Avg Days" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Movements by Process</CardTitle>
                <CardDescription>Distribution across process types</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={processChartData}
                      cx="50%"
                      cy="50%"
                      outerRadius={90}
                      dataKey="value"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      labelLine={false}
                    >
                      {processChartData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Top Performers */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-green-600" />
                Best On-Time
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {topOnTime.length === 0 ? (
                <p className="text-sm text-muted-foreground">Insufficient data</p>
              ) : (
                topOnTime.map((p, i) => (
                  <div key={p.partner_id} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="w-5 h-5 p-0 flex items-center justify-center text-xs">
                        {i + 1}
                      </Badge>
                      <span className="text-sm truncate max-w-[120px]">{p.partner_name}</span>
                    </div>
                    <Badge variant="secondary" className="text-green-600">{p.on_time_percentage}%</Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Clock className="h-4 w-4 text-blue-600" />
                Fastest Turnaround
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {topTurnaround.length === 0 ? (
                <p className="text-sm text-muted-foreground">Insufficient data</p>
              ) : (
                topTurnaround.map((p, i) => (
                  <div key={p.partner_id} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="w-5 h-5 p-0 flex items-center justify-center text-xs">
                        {i + 1}
                      </Badge>
                      <span className="text-sm truncate max-w-[120px]">{p.partner_name}</span>
                    </div>
                    <Badge variant="secondary" className="text-blue-600">{p.turnaround_days_avg}d</Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Factory className="h-4 w-4 text-emerald-600" />
                Lowest Loss
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {lowestLoss.length === 0 ? (
                <p className="text-sm text-muted-foreground">Insufficient data</p>
              ) : (
                lowestLoss.map((p, i) => (
                  <div key={p.partner_id} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="w-5 h-5 p-0 flex items-center justify-center text-xs">
                        {i + 1}
                      </Badge>
                      <span className="text-sm truncate max-w-[120px]">{p.partner_name}</span>
                    </div>
                    <Badge variant="secondary" className="text-emerald-600">{p.loss_percentage}%</Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        {/* Quick partner list */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Partner Overview</CardTitle>
                <CardDescription>All partners with activity in period</CardDescription>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link to="/external-analytics">
                  View Details <ArrowRight className="h-4 w-4 ml-2" />
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-32 flex items-center justify-center text-muted-foreground">
                Loading...
              </div>
            ) : partnerMetrics.length === 0 ? (
              <div className="h-32 flex items-center justify-center text-muted-foreground">
                No data for selected period
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {partnerMetrics.slice(0, 8).map(p => (
                  <div key={p.partner_id} className="border rounded-lg p-3 space-y-1">
                    <div className="font-medium text-sm truncate">{p.partner_name}</div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{p.total_movements} moves</span>
                      <span>•</span>
                      <span className={p.on_time_percentage >= 80 ? "text-green-600" : "text-amber-600"}>
                        {p.on_time_percentage}% on-time
                      </span>
                    </div>
                    {p.overdue_movements > 0 && (
                      <Badge variant="destructive" className="text-xs">{p.overdue_movements} overdue</Badge>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default PartnerDashboard;
