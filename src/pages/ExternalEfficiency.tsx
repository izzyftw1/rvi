import { useState, useEffect, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { 
  TrendingUp, 
  TrendingDown, 
  Clock, 
  Package, 
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  Truck,
  Factory
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell,
  LineChart,
  Line,
  Legend
} from "recharts";
import { differenceInDays, parseISO, subDays, startOfMonth, format } from "date-fns";

type PeriodType = 'daily' | 'weekly' | 'monthly';

interface ExternalMove {
  id: string;
  work_order_id: string;
  process: string;
  partner_id: string | null;
  dispatch_date: string | null;
  expected_return_date: string | null;
  returned_date: string | null;
  quantity_sent: number;
  quantity_returned: number;
  status: string;
}

interface VendorMetrics {
  partnerId: string;
  partnerName: string;
  totalJobs: number;
  completedJobs: number;
  avgTurnaroundDays: number;
  onTimeRate: number;
  lossPercent: number;
  totalSent: number;
  totalReceived: number;
  overdueJobs: number;
}

interface ProcessMetrics {
  process: string;
  totalJobs: number;
  avgTurnaroundDays: number;
  lossPercent: number;
  onTimeRate: number;
}

const PROCESS_LABELS: Record<string, string> = {
  job_work: 'Job Work',
  plating: 'Plating',
  buffing: 'Buffing',
  blasting: 'Blasting',
  forging_ext: 'Forging',
  heat_treatment: 'Heat Treatment',
  grinding: 'Grinding'
};

const CHART_COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

const ExternalEfficiency = () => {
  const [period, setPeriod] = useState<PeriodType>('weekly');
  const [moves, setMoves] = useState<ExternalMove[]>([]);
  const [partners, setPartners] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const getDateRange = useCallback(() => {
    const now = new Date();
    switch (period) {
      case 'daily':
        return subDays(now, 1);
      case 'weekly':
        return subDays(now, 7);
      case 'monthly':
        return startOfMonth(now);
      default:
        return subDays(now, 7);
    }
  }, [period]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const startDate = getDateRange().toISOString().split('T')[0];

      // Load external moves
      const { data: movesData, error: movesError } = await supabase
        .from('wo_external_moves')
        .select('*')
        .or(`dispatch_date.gte.${startDate},returned_date.gte.${startDate},status.eq.sent`);

      if (movesError) throw movesError;

      // Load partners
      const { data: partnersData } = await supabase
        .from('external_partners')
        .select('id, name');

      const partnersMap: Record<string, string> = {};
      (partnersData || []).forEach((p: any) => {
        partnersMap[p.id] = p.name;
      });

      setMoves(movesData || []);
      setPartners(partnersMap);
    } catch (error) {
      console.error('Error loading external efficiency data:', error);
    } finally {
      setLoading(false);
    }
  }, [getDateRange]);

  useEffect(() => {
    loadData();

    const channel = supabase
      .channel('external-efficiency-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wo_external_moves' }, loadData)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadData]);

  // Calculate summary metrics
  const summary = useMemo(() => {
    const today = new Date();
    const completed = moves.filter(m => m.returned_date);
    const pending = moves.filter(m => !m.returned_date && m.status === 'sent');
    const overdue = pending.filter(m => m.expected_return_date && parseISO(m.expected_return_date) < today);

    // Turnaround calculation (for completed jobs)
    const turnaroundDays = completed
      .filter(m => m.dispatch_date && m.returned_date)
      .map(m => differenceInDays(parseISO(m.returned_date!), parseISO(m.dispatch_date!)));
    
    const avgTurnaround = turnaroundDays.length > 0
      ? turnaroundDays.reduce((a, b) => a + b, 0) / turnaroundDays.length
      : 0;

    // Loss calculation
    const totalSent = moves.reduce((sum, m) => sum + (m.quantity_sent || 0), 0);
    const totalReceived = completed.reduce((sum, m) => sum + (m.quantity_returned || 0), 0);
    const lossPercent = totalSent > 0 ? ((totalSent - totalReceived) / totalSent) * 100 : 0;

    // On-time rate (completed jobs that returned on or before expected date)
    const onTimeJobs = completed.filter(m => {
      if (!m.expected_return_date || !m.returned_date) return false;
      return parseISO(m.returned_date) <= parseISO(m.expected_return_date);
    });
    const onTimeRate = completed.length > 0 ? (onTimeJobs.length / completed.length) * 100 : 0;

    return {
      totalJobs: moves.length,
      completedJobs: completed.length,
      pendingJobs: pending.length,
      overdueJobs: overdue.length,
      avgTurnaround: avgTurnaround.toFixed(1),
      lossPercent: lossPercent.toFixed(1),
      onTimeRate: onTimeRate.toFixed(0),
      totalSent,
      totalReceived
    };
  }, [moves]);

  // Vendor metrics
  const vendorMetrics = useMemo((): VendorMetrics[] => {
    const today = new Date();
    const vendorMap = new Map<string, {
      jobs: ExternalMove[];
      completed: ExternalMove[];
      totalSent: number;
      totalReceived: number;
    }>();

    moves.forEach(move => {
      const partnerId = move.partner_id || 'unknown';
      if (!vendorMap.has(partnerId)) {
        vendorMap.set(partnerId, { jobs: [], completed: [], totalSent: 0, totalReceived: 0 });
      }
      const v = vendorMap.get(partnerId)!;
      v.jobs.push(move);
      v.totalSent += move.quantity_sent || 0;
      if (move.returned_date) {
        v.completed.push(move);
        v.totalReceived += move.quantity_returned || 0;
      }
    });

    return Array.from(vendorMap.entries()).map(([partnerId, data]) => {
      const turnarounds = data.completed
        .filter(m => m.dispatch_date && m.returned_date)
        .map(m => differenceInDays(parseISO(m.returned_date!), parseISO(m.dispatch_date!)));
      
      const avgTurnaround = turnarounds.length > 0
        ? turnarounds.reduce((a, b) => a + b, 0) / turnarounds.length
        : 0;

      const onTimeJobs = data.completed.filter(m => {
        if (!m.expected_return_date || !m.returned_date) return false;
        return parseISO(m.returned_date) <= parseISO(m.expected_return_date);
      });

      const overdueJobs = data.jobs.filter(m => 
        !m.returned_date && m.expected_return_date && parseISO(m.expected_return_date) < today
      );

      const lossPercent = data.totalSent > 0 
        ? ((data.totalSent - data.totalReceived) / data.totalSent) * 100 
        : 0;

      return {
        partnerId,
        partnerName: partners[partnerId] || 'Unknown Vendor',
        totalJobs: data.jobs.length,
        completedJobs: data.completed.length,
        avgTurnaroundDays: Math.round(avgTurnaround * 10) / 10,
        onTimeRate: data.completed.length > 0 ? Math.round((onTimeJobs.length / data.completed.length) * 100) : 0,
        lossPercent: Math.round(lossPercent * 10) / 10,
        totalSent: data.totalSent,
        totalReceived: data.totalReceived,
        overdueJobs: overdueJobs.length
      };
    }).sort((a, b) => b.totalJobs - a.totalJobs);
  }, [moves, partners]);

  // Process metrics
  const processMetrics = useMemo((): ProcessMetrics[] => {
    const processMap = new Map<string, ExternalMove[]>();

    moves.forEach(move => {
      const process = move.process || 'unknown';
      if (!processMap.has(process)) {
        processMap.set(process, []);
      }
      processMap.get(process)!.push(move);
    });

    return Array.from(processMap.entries()).map(([process, jobs]) => {
      const completed = jobs.filter(j => j.returned_date);
      
      const turnarounds = completed
        .filter(m => m.dispatch_date && m.returned_date)
        .map(m => differenceInDays(parseISO(m.returned_date!), parseISO(m.dispatch_date!)));
      
      const avgTurnaround = turnarounds.length > 0
        ? turnarounds.reduce((a, b) => a + b, 0) / turnarounds.length
        : 0;

      const totalSent = jobs.reduce((sum, j) => sum + (j.quantity_sent || 0), 0);
      const totalReceived = completed.reduce((sum, j) => sum + (j.quantity_returned || 0), 0);
      const lossPercent = totalSent > 0 ? ((totalSent - totalReceived) / totalSent) * 100 : 0;

      const onTimeJobs = completed.filter(m => {
        if (!m.expected_return_date || !m.returned_date) return false;
        return parseISO(m.returned_date) <= parseISO(m.expected_return_date);
      });

      return {
        process: PROCESS_LABELS[process] || process,
        totalJobs: jobs.length,
        avgTurnaroundDays: Math.round(avgTurnaround * 10) / 10,
        lossPercent: Math.round(lossPercent * 10) / 10,
        onTimeRate: completed.length > 0 ? Math.round((onTimeJobs.length / completed.length) * 100) : 0
      };
    }).sort((a, b) => b.totalJobs - a.totalJobs);
  }, [moves]);

  // Chart data for vendor comparison
  const vendorChartData = useMemo(() => {
    return vendorMetrics.slice(0, 8).map(v => ({
      name: v.partnerName.length > 12 ? v.partnerName.substring(0, 12) + '...' : v.partnerName,
      turnaround: v.avgTurnaroundDays,
      onTime: v.onTimeRate,
      loss: v.lossPercent
    }));
  }, [vendorMetrics]);

  // Pie chart for process distribution
  const processChartData = useMemo(() => {
    return processMetrics.map(p => ({
      name: p.process,
      value: p.totalJobs
    }));
  }, [processMetrics]);

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <Factory className="h-7 w-7" />
            External Processing Efficiency
          </h1>
          <p className="text-sm text-muted-foreground">
            Vendor performance • Turnaround • Loss tracking
          </p>
        </div>

        <Select value={period} onValueChange={(v) => setPeriod(v as PeriodType)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="daily">Today</SelectItem>
            <SelectItem value="weekly">Last 7 Days</SelectItem>
            <SelectItem value="monthly">This Month</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Package className="h-4 w-4" />
              Total Jobs
            </div>
            <div className="text-2xl font-bold mt-1">{summary.totalJobs}</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              Completed
            </div>
            <div className="text-2xl font-bold mt-1 text-green-600">{summary.completedJobs}</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Clock className="h-4 w-4 text-blue-600" />
              Pending
            </div>
            <div className="text-2xl font-bold mt-1 text-blue-600">{summary.pendingJobs}</div>
          </CardContent>
        </Card>

        <Card className={cn(summary.overdueJobs > 0 && "border-red-200 dark:border-red-800")}>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              Overdue
            </div>
            <div className="text-2xl font-bold mt-1 text-red-600">{summary.overdueJobs}</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Truck className="h-4 w-4" />
              Avg Turnaround
            </div>
            <div className="text-2xl font-bold mt-1">{summary.avgTurnaround}d</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <TrendingUp className="h-4 w-4 text-green-600" />
              On-Time Rate
            </div>
            <div className="text-2xl font-bold mt-1">{summary.onTimeRate}%</div>
          </CardContent>
        </Card>
      </div>

      {/* Loss Alert */}
      {parseFloat(summary.lossPercent) > 1 && (
        <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20">
          <CardContent className="py-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
              <AlertTriangle className="h-5 w-5" />
              <span className="font-medium">External Loss Alert</span>
              <span className="text-sm">
                {summary.lossPercent}% loss rate ({summary.totalSent - summary.totalReceived} pcs)
              </span>
            </div>
            <Badge variant="outline" className="bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200">
              Sent: {summary.totalSent} | Received: {summary.totalReceived}
            </Badge>
          </CardContent>
        </Card>
      )}

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Vendor Performance Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Vendor Performance Comparison</CardTitle>
          </CardHeader>
          <CardContent>
            {vendorChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={vendorChartData} layout="vertical">
                  <XAxis type="number" domain={[0, 100]} />
                  <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="onTime" name="On-Time %" fill="hsl(var(--chart-1))" />
                  <Bar dataKey="loss" name="Loss %" fill="hsl(var(--chart-3))" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                No data available
              </div>
            )}
          </CardContent>
        </Card>

        {/* Process Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Jobs by Process Type</CardTitle>
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
                    fill="#8884d8"
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
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
                No data available
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Vendor Details Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Factory className="h-5 w-5" />
            Vendor Efficiency Details
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vendor</TableHead>
                <TableHead className="text-center">Total Jobs</TableHead>
                <TableHead className="text-center">Completed</TableHead>
                <TableHead className="text-center">Overdue</TableHead>
                <TableHead className="text-center">Avg Turnaround</TableHead>
                <TableHead className="text-center">On-Time Rate</TableHead>
                <TableHead className="text-center">Loss %</TableHead>
                <TableHead className="text-right">Qty Sent</TableHead>
                <TableHead className="text-right">Qty Received</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : vendorMetrics.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                    No external processing data for this period
                  </TableCell>
                </TableRow>
              ) : (
                vendorMetrics.map((vendor) => (
                  <TableRow key={vendor.partnerId}>
                    <TableCell className="font-medium">{vendor.partnerName}</TableCell>
                    <TableCell className="text-center">{vendor.totalJobs}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary">{vendor.completedJobs}</Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      {vendor.overdueJobs > 0 ? (
                        <Badge variant="destructive">{vendor.overdueJobs}</Badge>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <span className={cn(
                        "font-mono",
                        vendor.avgTurnaroundDays > 7 && "text-amber-600",
                        vendor.avgTurnaroundDays > 14 && "text-red-600"
                      )}>
                        {vendor.avgTurnaroundDays}d
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-2">
                        <Progress value={vendor.onTimeRate} className="w-16 h-2" />
                        <span className={cn(
                          "text-sm font-medium",
                          vendor.onTimeRate >= 90 && "text-green-600",
                          vendor.onTimeRate < 70 && "text-red-600"
                        )}>
                          {vendor.onTimeRate}%
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge 
                        variant="outline" 
                        className={cn(
                          vendor.lossPercent > 2 && "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 border-red-200",
                          vendor.lossPercent > 0.5 && vendor.lossPercent <= 2 && "bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 border-amber-200"
                        )}
                      >
                        {vendor.lossPercent}%
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">{vendor.totalSent.toLocaleString()}</TableCell>
                    <TableCell className="text-right font-mono">{vendor.totalReceived.toLocaleString()}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Process Metrics Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Process Type Performance</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Process</TableHead>
                <TableHead className="text-center">Total Jobs</TableHead>
                <TableHead className="text-center">Avg Turnaround</TableHead>
                <TableHead className="text-center">On-Time Rate</TableHead>
                <TableHead className="text-center">Loss %</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {processMetrics.map((proc) => (
                <TableRow key={proc.process}>
                  <TableCell className="font-medium">{proc.process}</TableCell>
                  <TableCell className="text-center">{proc.totalJobs}</TableCell>
                  <TableCell className="text-center font-mono">{proc.avgTurnaroundDays}d</TableCell>
                  <TableCell className="text-center">
                    <Badge 
                      variant="outline"
                      className={cn(
                        proc.onTimeRate >= 90 && "bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300",
                        proc.onTimeRate < 70 && "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300"
                      )}
                    >
                      {proc.onTimeRate}%
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge 
                      variant="outline"
                      className={cn(
                        proc.lossPercent > 2 && "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300"
                      )}
                    >
                      {proc.lossPercent}%
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default ExternalEfficiency;
