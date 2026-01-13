/**
 * External Processing Performance
 * 
 * Unified view consolidating Partner Dashboard and External Analytics
 * into one authoritative page for managing external partners and processes.
 * 
 * Structure:
 * 1. Executive Summary - Headline KPIs
 * 2. Performance Analysis - By Partner, By Process, All Movements toggles
 * 3. Operational Detail - Movement records with overdue visibility
 */

import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useExternalAnalytics, DateRange, PROCESS_LABELS } from "@/hooks/useExternalAnalytics";
import { 
  Factory, Clock, CheckCircle, AlertTriangle, TrendingUp, 
  TrendingDown, Package, Download, Truck, Users,
  Activity, RefreshCw, CalendarIcon
} from "lucide-react";
import { downloadCSV, downloadPDF } from "@/lib/exportHelpers";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, Legend, PieChart, Pie, Cell
} from "recharts";
import { format, parseISO, differenceInDays } from "date-fns";

const CHART_COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

const ExternalProcessingPerformance = () => {
  const { toast } = useToast();
  const [dateRange, setDateRange] = useState<DateRange>('90');
  const [selectedPartner, setSelectedPartner] = useState<string | null>(null);
  const [selectedProcess, setSelectedProcess] = useState<string | null>(null);
  const [analysisView, setAnalysisView] = useState<"partner" | "process" | "movements">("partner");
  
  const { 
    movements, partnerMetrics, processMetrics, summary, 
    partnerMap, loading, refresh 
  } = useExternalAnalytics(dateRange);

  // Filter movements based on selection
  const filteredMovements = useMemo(() => {
    return movements.filter(m => {
      if (selectedPartner && m.partner_id !== selectedPartner) return false;
      if (selectedProcess && m.process_type !== selectedProcess) return false;
      return true;
    });
  }, [movements, selectedPartner, selectedProcess]);

  // Overdue movements for accountability section
  const overdueMovements = useMemo(() => {
    const today = new Date();
    return movements
      .filter(m => {
        const isComplete = m.status === 'received' || m.status === 'completed' || m.actual_return_date;
        if (isComplete) return false;
        if (!m.expected_return_date) return false;
        return parseISO(m.expected_return_date) < today;
      })
      .map(m => {
        const expectedDate = parseISO(m.expected_return_date!);
        const agingDays = differenceInDays(today, expectedDate);
        return { ...m, agingDays };
      })
      .sort((a, b) => b.agingDays - a.agingDays);
  }, [movements]);

  // Top performers for quick reference
  const topPerformers = useMemo(() => {
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

    return { topOnTime, topTurnaround, lowestLoss };
  }, [partnerMetrics]);

  // Chart data
  const partnerChartData = useMemo(() => {
    return partnerMetrics.slice(0, 10).map(p => ({
      name: p.partner_name.length > 12 ? p.partner_name.slice(0, 12) + "..." : p.partner_name,
      onTime: p.on_time_percentage,
      turnaround: p.turnaround_days_avg,
      loss: p.loss_percentage,
    }));
  }, [partnerMetrics]);

  const processChartData = useMemo(() => {
    return processMetrics.map(p => ({
      name: p.process_label,
      value: p.total_movements,
      turnaround: p.avg_turnaround_days,
      onTime: p.on_time_percentage,
    }));
  }, [processMetrics]);

  // Export functions
  const handleExportCSV = () => {
    const exportData = filteredMovements.map(m => ({
      'Challan': m.challan_no || '-',
      'Process': PROCESS_LABELS[m.process_type] || m.process_type,
      'Partner': partnerMap[m.partner_id || '']?.name || 'Unknown',
      'Qty Sent': m.quantity_sent,
      'Qty Returned': m.quantity_returned || 0,
      'Qty Rejected': m.quantity_rejected || 0,
      'Sent Date': m.sent_date ? format(parseISO(m.sent_date), 'dd/MM/yyyy') : '-',
      'Expected': m.expected_return_date ? format(parseISO(m.expected_return_date), 'dd/MM/yyyy') : '-',
      'Returned': m.actual_return_date ? format(parseISO(m.actual_return_date), 'dd/MM/yyyy') : '-',
      'Status': m.status || 'pending',
    }));
    downloadCSV(exportData, `external_processing_${dateRange}d`);
    toast({ description: 'CSV export completed' });
  };

  const handleExportPDF = () => {
    const exportData = partnerMetrics.map(p => ({
      partner: p.partner_name,
      movements: p.total_movements,
      completed: p.completed_movements,
      overdue: p.overdue_movements,
      turnaround: p.turnaround_days_avg + 'd',
      onTime: p.on_time_percentage + '%',
      loss: p.loss_percentage + '%',
    }));

    const columns = [
      { header: 'Partner', dataKey: 'partner' },
      { header: 'Movements', dataKey: 'movements' },
      { header: 'Completed', dataKey: 'completed' },
      { header: 'Overdue', dataKey: 'overdue' },
      { header: 'Turnaround', dataKey: 'turnaround' },
      { header: 'On-Time', dataKey: 'onTime' },
      { header: 'Loss', dataKey: 'loss' },
    ];

    downloadPDF(
      exportData,
      `external_processing_${dateRange}d`,
      `External Processing Performance (Last ${dateRange} Days)`,
      columns
    );
    toast({ description: 'PDF export completed' });
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto p-4 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Truck className="h-6 w-6" />
              External Processing Performance
            </h1>
            <p className="text-sm text-muted-foreground">
              Partner and process analytics with operational visibility
            </p>
          </div>
          <div className="flex gap-2 flex-wrap items-center">
            <Select value={dateRange} onValueChange={(v: DateRange) => setDateRange(v)}>
              <SelectTrigger className="w-40">
                <CalendarIcon className="h-4 w-4 mr-2" />
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
            <Button variant="ghost" size="icon" onClick={refresh}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* ============================================ */}
        {/* LAYER 1: EXECUTIVE SUMMARY */}
        {/* ============================================ */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1 text-xs">
                <Package className="h-3.5 w-3.5" /> Total Movements
              </CardDescription>
              <CardTitle className="text-2xl">{summary.total_movements}</CardTitle>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="text-xs">Completed</CardDescription>
              <CardTitle className="text-2xl text-green-600">{summary.completed_movements}</CardTitle>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="text-xs">Pending</CardDescription>
              <CardTitle className="text-2xl text-blue-600">{summary.pending_movements}</CardTitle>
            </CardHeader>
          </Card>

          <Card className={cn(summary.overdue_movements > 0 && "border-destructive/50")}>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1 text-xs">
                <AlertTriangle className="h-3.5 w-3.5" /> Overdue
              </CardDescription>
              <CardTitle className={cn(
                "text-2xl",
                summary.overdue_movements > 0 ? "text-destructive" : "text-green-600"
              )}>
                {summary.overdue_movements}
              </CardTitle>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1 text-xs">
                <Clock className="h-3.5 w-3.5" /> Avg Turnaround
              </CardDescription>
              <CardTitle className="text-2xl text-primary">{summary.avg_turnaround_days}d</CardTitle>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1 text-xs">
                <CheckCircle className="h-3.5 w-3.5" /> On-Time %
              </CardDescription>
              <CardTitle className={cn(
                "text-2xl",
                summary.on_time_percentage >= 80 ? "text-green-600" : 
                summary.on_time_percentage >= 60 ? "text-amber-600" : "text-destructive"
              )}>
                {summary.on_time_percentage}%
              </CardTitle>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="text-xs">Loss %</CardDescription>
              <CardTitle className={cn(
                "text-2xl",
                summary.loss_percentage <= 1 ? "text-green-600" : 
                summary.loss_percentage <= 3 ? "text-amber-600" : "text-destructive"
              )}>
                {summary.loss_percentage}%
              </CardTitle>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="text-xs">Qty Flow</CardDescription>
              <CardTitle className="text-lg">{summary.total_qty_sent.toLocaleString()}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="text-xs text-muted-foreground">
                Returned: {summary.total_qty_returned.toLocaleString()}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ============================================ */}
        {/* LAYER 2: PERFORMANCE ANALYSIS */}
        {/* ============================================ */}
        <Tabs value={analysisView} onValueChange={(v) => setAnalysisView(v as any)} className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <TabsList>
              <TabsTrigger value="partner" className="gap-2">
                <Users className="h-4 w-4" />
                By Partner
              </TabsTrigger>
              <TabsTrigger value="process" className="gap-2">
                <Factory className="h-4 w-4" />
                By Process
              </TabsTrigger>
              <TabsTrigger value="movements" className="gap-2">
                <Activity className="h-4 w-4" />
                All Movements
              </TabsTrigger>
            </TabsList>
          </div>

          {/* BY PARTNER */}
          <TabsContent value="partner" className="space-y-6">
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
                  {topPerformers.topOnTime.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Insufficient data</p>
                  ) : (
                    topPerformers.topOnTime.map((p, i) => (
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
                  {topPerformers.topTurnaround.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Insufficient data</p>
                  ) : (
                    topPerformers.topTurnaround.map((p, i) => (
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
                  {topPerformers.lowestLoss.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Insufficient data</p>
                  ) : (
                    topPerformers.lowestLoss.map((p, i) => (
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

            {/* Partner Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Partner Performance Comparison</CardTitle>
                  <CardDescription>On-time rate and loss % by partner</CardDescription>
                </CardHeader>
                <CardContent>
                  {partnerChartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={320}>
                      <BarChart data={partnerChartData} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis type="number" domain={[0, 100]} unit="%" />
                        <YAxis dataKey="name" type="category" width={100} className="text-xs" />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="onTime" name="On-Time %" fill="hsl(var(--chart-1))" radius={[0, 4, 4, 0]} />
                        <Bar dataKey="loss" name="Loss %" fill="hsl(var(--chart-3))" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-[320px] flex items-center justify-center text-muted-foreground">
                      No data available
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Turnaround by Partner</CardTitle>
                  <CardDescription>Average days from send to receive</CardDescription>
                </CardHeader>
                <CardContent>
                  {partnerChartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={320}>
                      <BarChart data={partnerChartData} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis type="number" unit="d" />
                        <YAxis dataKey="name" type="category" width={100} className="text-xs" />
                        <Tooltip />
                        <Bar dataKey="turnaround" fill="hsl(var(--primary))" name="Avg Days" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-[320px] flex items-center justify-center text-muted-foreground">
                      No data available
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Partner Details Table */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Partner Details</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="h-64 flex items-center justify-center text-muted-foreground">Loading...</div>
                ) : partnerMetrics.length === 0 ? (
                  <div className="h-64 flex items-center justify-center text-muted-foreground">No data</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Partner</TableHead>
                        <TableHead>Process</TableHead>
                        <TableHead className="text-right">Movements</TableHead>
                        <TableHead className="text-right">Pending</TableHead>
                        <TableHead className="text-right">Overdue</TableHead>
                        <TableHead className="text-right">Turnaround</TableHead>
                        <TableHead className="text-right">On-Time</TableHead>
                        <TableHead className="text-right">Loss</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {partnerMetrics.map(p => (
                        <TableRow 
                          key={p.partner_id}
                          className={cn(
                            "cursor-pointer hover:bg-muted/50",
                            selectedPartner === p.partner_id && "bg-muted"
                          )}
                          onClick={() => {
                            setSelectedPartner(selectedPartner === p.partner_id ? null : p.partner_id);
                            setAnalysisView("movements");
                          }}
                        >
                          <TableCell className="font-medium">{p.partner_name}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{p.process_type || 'General'}</Badge>
                          </TableCell>
                          <TableCell className="text-right">{p.total_movements}</TableCell>
                          <TableCell className="text-right">
                            {p.pending_movements > 0 ? (
                              <Badge variant="secondary">{p.pending_movements}</Badge>
                            ) : '-'}
                          </TableCell>
                          <TableCell className="text-right">
                            {p.overdue_movements > 0 ? (
                              <Badge variant="destructive">{p.overdue_movements}</Badge>
                            ) : <span className="text-green-600">0</span>}
                          </TableCell>
                          <TableCell className="text-right">{p.turnaround_days_avg}d</TableCell>
                          <TableCell className="text-right">
                            <span className={cn(
                              p.on_time_percentage >= 80 ? "text-green-600" : 
                              p.on_time_percentage >= 60 ? "text-amber-600" : "text-destructive"
                            )}>
                              {p.on_time_percentage}%
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <span className={cn(
                              p.loss_percentage <= 1 ? "text-green-600" : 
                              p.loss_percentage <= 3 ? "text-amber-600" : "text-destructive"
                            )}>
                              {p.loss_percentage}%
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* BY PROCESS */}
          <TabsContent value="process" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Movements by Process</CardTitle>
                  <CardDescription>Distribution across process types</CardDescription>
                </CardHeader>
                <CardContent>
                  {processChartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={processChartData}
                          cx="50%"
                          cy="50%"
                          outerRadius={100}
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
                  ) : (
                    <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                      No data
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Process Performance</CardTitle>
                  <CardDescription>Movements and turnaround by process</CardDescription>
                </CardHeader>
                <CardContent>
                  {processChartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={processChartData}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="name" className="text-xs" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="value" name="Movements" fill="hsl(var(--chart-1))" />
                        <Bar dataKey="turnaround" name="Avg Days" fill="hsl(var(--chart-2))" />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                      No data
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Process Details */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Process Details</CardTitle>
              </CardHeader>
              <CardContent>
                {processMetrics.length === 0 ? (
                  <div className="h-48 flex items-center justify-center text-muted-foreground">No data</div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {processMetrics.map(p => (
                      <div 
                        key={p.process}
                        className={cn(
                          "border rounded-lg p-4 cursor-pointer hover:bg-muted/50 transition-colors",
                          selectedProcess === p.process && "bg-muted border-primary"
                        )}
                        onClick={() => {
                          setSelectedProcess(selectedProcess === p.process ? null : p.process);
                          setAnalysisView("movements");
                        }}
                      >
                        <div className="flex items-center justify-between mb-3">
                          <span className="font-medium">{p.process_label}</span>
                          <Badge variant="outline">{p.total_movements} moves</Badge>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-sm">
                          <div>
                            <span className="text-muted-foreground text-xs block">Turnaround</span>
                            <span className="font-medium">{p.avg_turnaround_days}d</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground text-xs block">On-Time</span>
                            <span className={cn(
                              "font-medium",
                              p.on_time_percentage >= 80 ? "text-green-600" : "text-amber-600"
                            )}>{p.on_time_percentage}%</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground text-xs block">Loss</span>
                            <span className={cn(
                              "font-medium",
                              p.loss_percentage <= 1 ? "text-green-600" : "text-destructive"
                            )}>{p.loss_percentage}%</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ALL MOVEMENTS */}
          <TabsContent value="movements" className="space-y-4">
            {/* Filters */}
            <div className="flex gap-2 flex-wrap">
              <Select 
                value={selectedPartner || "all"} 
                onValueChange={(v) => setSelectedPartner(v === "all" ? null : v)}
              >
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="All Partners" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Partners</SelectItem>
                  {partnerMetrics.map(p => (
                    <SelectItem key={p.partner_id} value={p.partner_id}>
                      {p.partner_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select 
                value={selectedProcess || "all"} 
                onValueChange={(v) => setSelectedProcess(v === "all" ? null : v)}
              >
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="All Processes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Processes</SelectItem>
                  {processMetrics.map(p => (
                    <SelectItem key={p.process} value={p.process}>
                      {p.process_label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {(selectedPartner || selectedProcess) && (
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => { setSelectedPartner(null); setSelectedProcess(null); }}
                >
                  Clear Filters
                </Button>
              )}
            </div>

            {/* ============================================ */}
            {/* LAYER 3: OPERATIONAL DETAIL & ACCOUNTABILITY */}
            {/* ============================================ */}

            {/* Overdue Movements - Accountability Section */}
            {overdueMovements.length > 0 && (
              <Card className="border-destructive/50 bg-destructive/5">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2 text-destructive">
                    <AlertTriangle className="h-4 w-4" />
                    Overdue Movements - Partner Accountability
                    <Badge variant="destructive">{overdueMovements.length}</Badge>
                  </CardTitle>
                  <CardDescription>
                    Past expected return date - requires immediate follow-up
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Challan</TableHead>
                        <TableHead>Partner</TableHead>
                        <TableHead>Process</TableHead>
                        <TableHead className="text-right">Qty Sent</TableHead>
                        <TableHead>Expected</TableHead>
                        <TableHead className="text-center">Aging</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {overdueMovements.slice(0, 10).map(m => (
                        <TableRow key={m.id} className="bg-destructive/5">
                          <TableCell className="font-mono text-xs">{m.challan_no || '-'}</TableCell>
                          <TableCell className="font-medium">
                            {partnerMap[m.partner_id || '']?.name || 'Unknown'}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{PROCESS_LABELS[m.process_type] || m.process_type}</Badge>
                          </TableCell>
                          <TableCell className="text-right">{m.quantity_sent}</TableCell>
                          <TableCell>
                            {m.expected_return_date ? format(parseISO(m.expected_return_date), 'dd/MM/yy') : '-'}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="destructive">{m.agingDays}d overdue</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {overdueMovements.length > 10 && (
                    <div className="text-center text-sm text-muted-foreground mt-3">
                      +{overdueMovements.length - 10} more overdue movements
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Full Movement Records */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Movement Records ({filteredMovements.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="h-64 flex items-center justify-center text-muted-foreground">Loading...</div>
                ) : filteredMovements.length === 0 ? (
                  <div className="h-64 flex items-center justify-center text-muted-foreground">No movements found</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Challan</TableHead>
                        <TableHead>Process</TableHead>
                        <TableHead>Partner</TableHead>
                        <TableHead className="text-right">Qty Sent</TableHead>
                        <TableHead className="text-right">Returned</TableHead>
                        <TableHead>Sent Date</TableHead>
                        <TableHead>Expected</TableHead>
                        <TableHead>Returned</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredMovements.slice(0, 50).map(m => {
                        const isComplete = m.status === 'received' || m.status === 'completed' || m.actual_return_date;
                        const isOverdue = !isComplete && m.expected_return_date && new Date() > parseISO(m.expected_return_date);
                        const isOnTime = isComplete && m.expected_return_date && m.actual_return_date && 
                          parseISO(m.actual_return_date) <= parseISO(m.expected_return_date);
                        
                        return (
                          <TableRow key={m.id} className={cn(isOverdue && "bg-destructive/5")}>
                            <TableCell className="font-mono text-xs">{m.challan_no || '-'}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{PROCESS_LABELS[m.process_type] || m.process_type}</Badge>
                            </TableCell>
                            <TableCell>{partnerMap[m.partner_id || '']?.name || 'Unknown'}</TableCell>
                            <TableCell className="text-right">{m.quantity_sent}</TableCell>
                            <TableCell className="text-right">
                              {m.quantity_returned || 0}
                              {(m.quantity_rejected || 0) > 0 && (
                                <span className="text-destructive ml-1">(-{m.quantity_rejected})</span>
                              )}
                            </TableCell>
                            <TableCell>{m.sent_date ? format(parseISO(m.sent_date), 'dd/MM/yy') : '-'}</TableCell>
                            <TableCell>{m.expected_return_date ? format(parseISO(m.expected_return_date), 'dd/MM/yy') : '-'}</TableCell>
                            <TableCell>{m.actual_return_date ? format(parseISO(m.actual_return_date), 'dd/MM/yy') : '-'}</TableCell>
                            <TableCell>
                              {isComplete ? (
                                isOnTime ? (
                                  <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                                    <CheckCircle className="h-3 w-3 mr-1" /> On-Time
                                  </Badge>
                                ) : (
                                  <Badge variant="secondary">
                                    <TrendingDown className="h-3 w-3 mr-1" /> Late
                                  </Badge>
                                )
                              ) : isOverdue ? (
                                <Badge variant="destructive">
                                  <AlertTriangle className="h-3 w-3 mr-1" /> Overdue
                                </Badge>
                              ) : (
                                <Badge variant="outline">
                                  <Clock className="h-3 w-3 mr-1" /> Pending
                                </Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
                {filteredMovements.length > 50 && (
                  <div className="text-center text-sm text-muted-foreground mt-4">
                    Showing 50 of {filteredMovements.length} movements
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default ExternalProcessingPerformance;
