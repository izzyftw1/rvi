import { useState, useEffect } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { differenceInDays, parseISO, subDays } from "date-fns";
import { Download, TrendingUp } from "lucide-react";
import { downloadCSV, downloadPDF } from "@/lib/exportHelpers";
import { useToast } from "@/hooks/use-toast";

interface PartnerPerformance {
  partner_id: string;
  partner_name: string;
  total_moves: number;
  completed_moves: number;
  avg_turnaround_days: number;
  on_time_percentage: number;
  rejection_rate: number;
}

const PartnerPerformance = () => {
  const { toast } = useToast();
  const [dateRange, setDateRange] = useState<'90' | '180' | '365'>('90');
  const [performance, setPerformance] = useState<PartnerPerformance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPerformance();
  }, [dateRange]);

  const loadPerformance = async () => {
    try {
      setLoading(true);
      const days = parseInt(dateRange);
      const cutoffDate = subDays(new Date(), days);

      // Load all moves within date range
      const { data: movesData } = await supabase
        .from("wo_external_moves" as any)
        .select(`
          id,
          partner_id,
          dispatch_date,
          expected_return_date,
          status,
          qty_sent,
          return_qc_status
        `)
        .gte("dispatch_date", cutoffDate.toISOString());

      // Load receipts for these moves
      const moveIds = (movesData || []).map((m: any) => m.id);
      const { data: receiptsData } = await supabase
        .from("wo_external_receipts" as any)
        .select("move_id, receipt_date, qty_received")
        .in("move_id", moveIds);

      // Load partners
      const { data: partnersData } = await supabase
        .from("external_partners" as any)
        .select("id, name")
        .eq("active", true);

      const receiptsMap: Record<string, any[]> = {};
      (receiptsData || []).forEach((r: any) => {
        if (!receiptsMap[r.move_id]) receiptsMap[r.move_id] = [];
        receiptsMap[r.move_id].push(r);
      });

      const partnerStats: Record<string, PartnerPerformance> = {};

      (partnersData || []).forEach((partner: any) => {
        const partnerMoves = (movesData || []).filter((m: any) => m.partner_id === partner.id);
        const completedMoves = partnerMoves.filter((m: any) => m.status === 'received_full');

        // Calculate average turnaround
        let totalTurnaroundDays = 0;
        let turnaroundCount = 0;
        completedMoves.forEach((move: any) => {
          const receipts = receiptsMap[move.id] || [];
          if (receipts.length > 0) {
            const lastReceipt = receipts.sort((a, b) => 
              new Date(b.receipt_date).getTime() - new Date(a.receipt_date).getTime()
            )[0];
            const turnaround = differenceInDays(
              parseISO(lastReceipt.receipt_date),
              parseISO(move.dispatch_date)
            );
            totalTurnaroundDays += turnaround;
            turnaroundCount++;
          }
        });

        const avgTurnaround = turnaroundCount > 0 
          ? Math.round(totalTurnaroundDays / turnaroundCount)
          : 0;

        // Calculate on-time percentage
        const movesWithDueDate = partnerMoves.filter((m: any) => m.expected_return_date);
        const completedOnTime = completedMoves.filter((move: any) => {
          if (!move.expected_return_date) return false;
          const receipts = receiptsMap[move.id] || [];
          if (receipts.length === 0) return false;
          const lastReceipt = receipts.sort((a, b) => 
            new Date(b.receipt_date).getTime() - new Date(a.receipt_date).getTime()
          )[0];
          return parseISO(lastReceipt.receipt_date) <= parseISO(move.expected_return_date);
        });

        const onTimePercentage = movesWithDueDate.length > 0
          ? Math.round((completedOnTime.length / movesWithDueDate.length) * 100)
          : 0;

        // Calculate rejection rate (QC on return)
        const movesWithQC = completedMoves.filter((m: any) => m.return_qc_status && m.return_qc_status !== 'pending');
        const rejectedMoves = movesWithQC.filter((m: any) => m.return_qc_status === 'failed');
        const rejectionRate = movesWithQC.length > 0
          ? Math.round((rejectedMoves.length / movesWithQC.length) * 100)
          : 0;

        partnerStats[partner.id] = {
          partner_id: partner.id,
          partner_name: partner.name,
          total_moves: partnerMoves.length,
          completed_moves: completedMoves.length,
          avg_turnaround_days: avgTurnaround,
          on_time_percentage: onTimePercentage,
          rejection_rate: rejectionRate,
        };
      });

      setPerformance(Object.values(partnerStats).filter(p => p.total_moves > 0));
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

  const handleExportCSV = () => {
    const exportData = performance.map(p => ({
      'Partner': p.partner_name,
      'Total Moves': p.total_moves,
      'Completed': p.completed_moves,
      'Avg Turnaround (Days)': p.avg_turnaround_days,
      'On-Time %': p.on_time_percentage,
      'Rejection %': p.rejection_rate,
    }));
    downloadCSV(exportData, `partner_performance_${dateRange}d`);
    toast({ description: 'CSV export completed' });
  };

  const handleExportPDF = () => {
    const exportData = performance.map(p => ({
      partner: p.partner_name,
      moves: p.total_moves,
      completed: p.completed_moves,
      turnaround: p.avg_turnaround_days,
      onTime: p.on_time_percentage + '%',
      rejection: p.rejection_rate + '%',
    }));

    const columns = [
      { header: 'Partner', dataKey: 'partner' },
      { header: 'Moves', dataKey: 'moves' },
      { header: 'Completed', dataKey: 'completed' },
      { header: 'Avg Days', dataKey: 'turnaround' },
      { header: 'On-Time %', dataKey: 'onTime' },
      { header: 'Rejection %', dataKey: 'rejection' },
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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Partner Performance Report</h1>
            <p className="text-sm text-muted-foreground">
              External processing partner metrics and analytics
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
            <Button onClick={handleExportCSV} variant="outline">
              <Download className="h-4 w-4 mr-2" />
              CSV
            </Button>
            <Button onClick={handleExportPDF} variant="outline">
              <Download className="h-4 w-4 mr-2" />
              PDF
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Performance Metrics</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-center text-muted-foreground py-8">Loading...</p>
            ) : performance.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                No data available for selected period
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Partner</TableHead>
                    <TableHead className="text-right">Total Moves</TableHead>
                    <TableHead className="text-right">Completed</TableHead>
                    <TableHead className="text-right">Avg Turnaround</TableHead>
                    <TableHead className="text-right">On-Time %</TableHead>
                    <TableHead className="text-right">Rejection %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {performance.map((p) => (
                    <TableRow key={p.partner_id}>
                      <TableCell className="font-medium">{p.partner_name}</TableCell>
                      <TableCell className="text-right">{p.total_moves}</TableCell>
                      <TableCell className="text-right">{p.completed_moves}</TableCell>
                      <TableCell className="text-right">
                        {p.avg_turnaround_days} days
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge 
                          variant={p.on_time_percentage >= 80 ? "default" : p.on_time_percentage >= 60 ? "secondary" : "destructive"}
                        >
                          {p.on_time_percentage}%
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge 
                          variant={p.rejection_rate <= 5 ? "default" : p.rejection_rate <= 10 ? "secondary" : "destructive"}
                        >
                          {p.rejection_rate}%
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Summary Cards */}
        {!loading && performance.length > 0 && (
          <div className="grid grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Top Performer (On-Time)</CardTitle>
              </CardHeader>
              <CardContent>
                {(() => {
                  const top = [...performance].sort((a, b) => b.on_time_percentage - a.on_time_percentage)[0];
                  return (
                    <div>
                      <p className="text-lg font-bold">{top.partner_name}</p>
                      <p className="text-sm text-muted-foreground">{top.on_time_percentage}% on-time</p>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Fastest Turnaround</CardTitle>
              </CardHeader>
              <CardContent>
                {(() => {
                  const fastest = [...performance]
                    .filter(p => p.avg_turnaround_days > 0)
                    .sort((a, b) => a.avg_turnaround_days - b.avg_turnaround_days)[0];
                  return fastest ? (
                    <div>
                      <p className="text-lg font-bold">{fastest.partner_name}</p>
                      <p className="text-sm text-muted-foreground">{fastest.avg_turnaround_days} days avg</p>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">N/A</p>
                  );
                })()}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Best Quality</CardTitle>
              </CardHeader>
              <CardContent>
                {(() => {
                  const bestQuality = [...performance]
                    .filter(p => p.rejection_rate >= 0)
                    .sort((a, b) => a.rejection_rate - b.rejection_rate)[0];
                  return bestQuality ? (
                    <div>
                      <p className="text-lg font-bold">{bestQuality.partner_name}</p>
                      <p className="text-sm text-muted-foreground">{bestQuality.rejection_rate}% rejection</p>
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
