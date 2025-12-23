import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { differenceInDays, format, subDays } from "date-fns";
import { Download, TrendingUp, Clock, AlertTriangle, CheckCircle, Truck } from "lucide-react";
import { downloadCSV, downloadPDF } from "@/lib/exportHelpers";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface PartnerMetrics {
  partner_id: string;
  partner_name: string;
  process_type: string | null;
  // Derived from challan send/receive records
  total_challans: number;
  completed_challans: number;
  pending_challans: number;
  overdue_challans: number;
  // Quantities from challans
  total_qty_sent: number;
  total_qty_returned: number;
  qty_pending: number;
  // Calculated metrics
  turnaround_days_avg: number;
  turnaround_days_min: number;
  turnaround_days_max: number;
  delay_percentage: number;
  loss_percentage: number;
  on_time_percentage: number;
}

const PartnerPerformance = () => {
  const { toast } = useToast();
  const [dateRange, setDateRange] = useState<'90' | '180' | '365'>('90');
  const [moves, setMoves] = useState<any[]>([]);
  const [partners, setPartners] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [dateRange]);

  const loadData = async () => {
    try {
      setLoading(true);
      const days = parseInt(dateRange);
      const cutoffDate = format(subDays(new Date(), days), "yyyy-MM-dd");

      // Load all external moves (challans) within date range
      const [movesRes, partnersRes] = await Promise.all([
        supabase
          .from("wo_external_moves")
          .select(`
            id,
            partner_id,
            process,
            dispatch_date,
            expected_return_date,
            returned_date,
            quantity_sent,
            quantity_returned,
            status,
            challan_no
          `)
          .gte("dispatch_date", cutoffDate)
          .order("dispatch_date", { ascending: false }),
        supabase
          .from("external_partners")
          .select("id, name, process_type, is_active")
      ]);

      setMoves(movesRes.data || []);
      setPartners(partnersRes.data || []);
    } catch (error) {
      console.error("Error loading partner performance:", error);
      toast({
        title: "Error",
        description: "Failed to load partner performance data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Calculate metrics directly from challan send/receive records
  const partnerMetrics = useMemo((): PartnerMetrics[] => {
    const today = new Date();
    const metricsMap: Record<string, PartnerMetrics> = {};

    // Initialize metrics for each partner
    partners.forEach(partner => {
      metricsMap[partner.id] = {
        partner_id: partner.id,
        partner_name: partner.name,
        process_type: partner.process_type,
        total_challans: 0,
        completed_challans: 0,
        pending_challans: 0,
        overdue_challans: 0,
        total_qty_sent: 0,
        total_qty_returned: 0,
        qty_pending: 0,
        turnaround_days_avg: 0,
        turnaround_days_min: 999,
        turnaround_days_max: 0,
        delay_percentage: 0,
        loss_percentage: 0,
        on_time_percentage: 0,
      };
    });

    // Process each challan/move
    const turnaroundsByPartner: Record<string, number[]> = {};
    const delayedByPartner: Record<string, number> = {};
    const onTimeByPartner: Record<string, number> = {};

    moves.forEach(move => {
      const partnerId = move.partner_id;
      if (!partnerId || !metricsMap[partnerId]) return;

      const metrics = metricsMap[partnerId];
      metrics.total_challans++;
      metrics.total_qty_sent += move.quantity_sent || 0;
      metrics.total_qty_returned += move.quantity_returned || 0;

      const qtySent = move.quantity_sent || 0;
      const qtyReturned = move.quantity_returned || 0;
      const isComplete = move.status === 'received' || qtyReturned >= qtySent;
      const dispatchDate = move.dispatch_date ? new Date(move.dispatch_date) : null;
      const expectedDate = move.expected_return_date ? new Date(move.expected_return_date) : null;
      const returnedDate = move.returned_date ? new Date(move.returned_date) : null;

      if (isComplete) {
        metrics.completed_challans++;
        
        // Calculate turnaround time from challan send/receive
        if (dispatchDate && returnedDate) {
          const turnaround = differenceInDays(returnedDate, dispatchDate);
          if (!turnaroundsByPartner[partnerId]) turnaroundsByPartner[partnerId] = [];
          turnaroundsByPartner[partnerId].push(turnaround);
          
          if (turnaround < metrics.turnaround_days_min) metrics.turnaround_days_min = turnaround;
          if (turnaround > metrics.turnaround_days_max) metrics.turnaround_days_max = turnaround;
        }

        // Check if delayed (returned after expected date)
        if (expectedDate && returnedDate) {
          if (returnedDate > expectedDate) {
            delayedByPartner[partnerId] = (delayedByPartner[partnerId] || 0) + 1;
          } else {
            onTimeByPartner[partnerId] = (onTimeByPartner[partnerId] || 0) + 1;
          }
        }
      } else {
        metrics.pending_challans++;
        metrics.qty_pending += qtySent - qtyReturned;

        // Check if overdue (not returned and past expected date)
        if (expectedDate && today > expectedDate) {
          metrics.overdue_challans++;
          delayedByPartner[partnerId] = (delayedByPartner[partnerId] || 0) + 1;
        }
      }
    });

    // Calculate final metrics
    Object.values(metricsMap).forEach(metrics => {
      const partnerId = metrics.partner_id;
      
      // Average turnaround time
      const turnarounds = turnaroundsByPartner[partnerId] || [];
      if (turnarounds.length > 0) {
        metrics.turnaround_days_avg = Math.round(
          turnarounds.reduce((a, b) => a + b, 0) / turnarounds.length
        );
      }
      if (metrics.turnaround_days_min === 999) metrics.turnaround_days_min = 0;

      // Delay percentage = (delayed challans / total with expected dates) * 100
      const totalWithExpected = (delayedByPartner[partnerId] || 0) + (onTimeByPartner[partnerId] || 0);
      if (totalWithExpected > 0) {
        metrics.delay_percentage = Math.round(
          ((delayedByPartner[partnerId] || 0) / totalWithExpected) * 100
        );
        metrics.on_time_percentage = 100 - metrics.delay_percentage;
      }

      // Loss percentage = (qty_sent - qty_returned) / qty_sent * 100 (for completed)
      if (metrics.total_qty_sent > 0) {
        const totalLoss = metrics.total_qty_sent - metrics.total_qty_returned - metrics.qty_pending;
        metrics.loss_percentage = Math.max(0, Math.round((totalLoss / metrics.total_qty_sent) * 100 * 100) / 100);
      }
    });

    return Object.values(metricsMap)
      .filter(m => m.total_challans > 0)
      .sort((a, b) => b.total_challans - a.total_challans);
  }, [moves, partners]);

  // Summary stats
  const summaryStats = useMemo(() => {
    const totalChallans = partnerMetrics.reduce((sum, m) => sum + m.total_challans, 0);
    const completedChallans = partnerMetrics.reduce((sum, m) => sum + m.completed_challans, 0);
    const overdueChallans = partnerMetrics.reduce((sum, m) => sum + m.overdue_challans, 0);
    const totalQtySent = partnerMetrics.reduce((sum, m) => sum + m.total_qty_sent, 0);
    const totalQtyReturned = partnerMetrics.reduce((sum, m) => sum + m.total_qty_returned, 0);
    
    const avgTurnaround = partnerMetrics.length > 0
      ? Math.round(partnerMetrics.reduce((sum, m) => sum + m.turnaround_days_avg, 0) / partnerMetrics.length)
      : 0;
    
    const avgOnTime = partnerMetrics.length > 0
      ? Math.round(partnerMetrics.reduce((sum, m) => sum + m.on_time_percentage, 0) / partnerMetrics.length)
      : 0;

    return { totalChallans, completedChallans, overdueChallans, totalQtySent, totalQtyReturned, avgTurnaround, avgOnTime };
  }, [partnerMetrics]);

  // Chart data
  const chartData = useMemo(() => {
    return partnerMetrics.slice(0, 8).map(m => ({
      name: m.partner_name.length > 12 ? m.partner_name.slice(0, 12) + "..." : m.partner_name,
      turnaround: m.turnaround_days_avg,
      delay: m.delay_percentage,
      loss: m.loss_percentage,
    }));
  }, [partnerMetrics]);

  const handleExportCSV = () => {
    const exportData = partnerMetrics.map(p => ({
      'Partner': p.partner_name,
      'Process': p.process_type || 'N/A',
      'Total Challans': p.total_challans,
      'Completed': p.completed_challans,
      'Pending': p.pending_challans,
      'Overdue': p.overdue_challans,
      'Qty Sent': p.total_qty_sent,
      'Qty Returned': p.total_qty_returned,
      'Avg Turnaround (Days)': p.turnaround_days_avg,
      'Delay %': p.delay_percentage,
      'Loss %': p.loss_percentage,
      'On-Time %': p.on_time_percentage,
    }));
    downloadCSV(exportData, `partner_performance_${dateRange}d`);
    toast({ description: 'CSV export completed' });
  };

  const handleExportPDF = () => {
    const exportData = partnerMetrics.map(p => ({
      partner: p.partner_name,
      challans: p.total_challans,
      completed: p.completed_challans,
      turnaround: p.turnaround_days_avg + 'd',
      delay: p.delay_percentage + '%',
      loss: p.loss_percentage + '%',
    }));

    const columns = [
      { header: 'Partner', dataKey: 'partner' },
      { header: 'Challans', dataKey: 'challans' },
      { header: 'Completed', dataKey: 'completed' },
      { header: 'Turnaround', dataKey: 'turnaround' },
      { header: 'Delay %', dataKey: 'delay' },
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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Truck className="h-6 w-6" />
              Partner Performance
            </h1>
            <p className="text-sm text-muted-foreground">
              Metrics calculated from challan send/receive records
            </p>
          </div>
          <div className="flex gap-2">
            <Select value={dateRange} onValueChange={(v: any) => setDateRange(v)}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
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
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Challans</CardDescription>
              <CardTitle className="text-2xl">{summaryStats.totalChallans}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xs text-muted-foreground">
                {summaryStats.completedChallans} completed
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Avg Turnaround</CardDescription>
              <CardTitle className="text-2xl flex items-center gap-1">
                <Clock className="h-5 w-5 text-blue-500" />
                {summaryStats.avgTurnaround}d
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xs text-muted-foreground">
                Days from send to receive
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>On-Time Rate</CardDescription>
              <CardTitle className={cn(
                "text-2xl flex items-center gap-1",
                summaryStats.avgOnTime >= 80 ? "text-green-600" : summaryStats.avgOnTime >= 60 ? "text-amber-600" : "text-destructive"
              )}>
                <CheckCircle className="h-5 w-5" />
                {summaryStats.avgOnTime}%
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Progress value={summaryStats.avgOnTime} className="h-2" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Overdue Challans</CardDescription>
              <CardTitle className={cn(
                "text-2xl flex items-center gap-1",
                summaryStats.overdueChallans === 0 ? "text-green-600" : "text-destructive"
              )}>
                <AlertTriangle className="h-5 w-5" />
                {summaryStats.overdueChallans}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xs text-muted-foreground">
                Past expected return date
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Charts */}
        {!loading && chartData.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Turnaround Time by Partner</CardTitle>
                <CardDescription>Average days from send to receive</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={chartData} layout="vertical">
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
                <CardTitle className="text-base">Delay & Loss by Partner</CardTitle>
                <CardDescription>Percentage of delayed and lost items</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={chartData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis type="number" unit="%" />
                    <YAxis dataKey="name" type="category" width={100} className="text-xs" />
                    <Tooltip />
                    <Bar dataKey="delay" fill="hsl(var(--warning))" name="Delay %" radius={[0, 4, 4, 0]} />
                    <Bar dataKey="loss" fill="hsl(var(--destructive))" name="Loss %" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Detailed Table */}
        <Card>
          <CardHeader>
            <CardTitle>Partner Details</CardTitle>
            <CardDescription>
              All metrics derived from challan send/receive records
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-64 flex items-center justify-center">
                <p className="text-muted-foreground">Loading...</p>
              </div>
            ) : partnerMetrics.length === 0 ? (
              <div className="h-64 flex items-center justify-center">
                <p className="text-muted-foreground">No data available for selected period</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Partner</TableHead>
                    <TableHead>Process</TableHead>
                    <TableHead className="text-right">Challans</TableHead>
                    <TableHead className="text-right">Qty Sent</TableHead>
                    <TableHead className="text-right">Qty Returned</TableHead>
                    <TableHead className="text-right">Turnaround</TableHead>
                    <TableHead className="text-right">Delay %</TableHead>
                    <TableHead className="text-right">Loss %</TableHead>
                    <TableHead className="text-right">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {partnerMetrics.map((p) => (
                    <TableRow key={p.partner_id}>
                      <TableCell className="font-medium">{p.partner_name}</TableCell>
                      <TableCell className="text-muted-foreground">{p.process_type || '-'}</TableCell>
                      <TableCell className="text-right">
                        {p.completed_challans}/{p.total_challans}
                        {p.overdue_challans > 0 && (
                          <Badge variant="destructive" className="ml-2 text-xs">
                            {p.overdue_challans} overdue
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono">{p.total_qty_sent.toLocaleString()}</TableCell>
                      <TableCell className="text-right font-mono">{p.total_qty_returned.toLocaleString()}</TableCell>
                      <TableCell className="text-right">
                        <span className="font-mono">{p.turnaround_days_avg}d</span>
                        {p.turnaround_days_min !== p.turnaround_days_max && (
                          <span className="text-xs text-muted-foreground ml-1">
                            ({p.turnaround_days_min}-{p.turnaround_days_max})
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge 
                          variant={p.delay_percentage <= 10 ? "secondary" : p.delay_percentage <= 25 ? "outline" : "destructive"}
                        >
                          {p.delay_percentage}%
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge 
                          variant={p.loss_percentage <= 1 ? "secondary" : p.loss_percentage <= 5 ? "outline" : "destructive"}
                        >
                          {p.loss_percentage}%
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge 
                          variant={p.on_time_percentage >= 80 ? "default" : p.on_time_percentage >= 60 ? "secondary" : "destructive"}
                        >
                          {p.on_time_percentage}% on-time
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Top/Bottom Performers */}
        {!loading && partnerMetrics.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="border-green-200 dark:border-green-800">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  Best On-Time
                </CardTitle>
              </CardHeader>
              <CardContent>
                {(() => {
                  const top = [...partnerMetrics].sort((a, b) => b.on_time_percentage - a.on_time_percentage)[0];
                  return (
                    <div>
                      <p className="text-lg font-bold">{top.partner_name}</p>
                      <p className="text-sm text-muted-foreground">{top.on_time_percentage}% on-time</p>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>

            <Card className="border-blue-200 dark:border-blue-800">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Clock className="h-4 w-4 text-blue-600" />
                  Fastest Turnaround
                </CardTitle>
              </CardHeader>
              <CardContent>
                {(() => {
                  const fastest = [...partnerMetrics]
                    .filter(p => p.turnaround_days_avg > 0)
                    .sort((a, b) => a.turnaround_days_avg - b.turnaround_days_avg)[0];
                  return fastest ? (
                    <div>
                      <p className="text-lg font-bold">{fastest.partner_name}</p>
                      <p className="text-sm text-muted-foreground">{fastest.turnaround_days_avg} days avg</p>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">N/A</p>
                  );
                })()}
              </CardContent>
            </Card>

            <Card className="border-purple-200 dark:border-purple-800">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-purple-600" />
                  Lowest Loss
                </CardTitle>
              </CardHeader>
              <CardContent>
                {(() => {
                  const best = [...partnerMetrics]
                    .filter(p => p.total_qty_sent > 0)
                    .sort((a, b) => a.loss_percentage - b.loss_percentage)[0];
                  return best ? (
                    <div>
                      <p className="text-lg font-bold">{best.partner_name}</p>
                      <p className="text-sm text-muted-foreground">{best.loss_percentage}% loss</p>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">N/A</p>
                  );
                })()}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
};

export default PartnerPerformance;
