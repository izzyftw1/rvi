import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Sparkles, 
  Wind, 
  Hammer, 
  Flame, 
  Factory,
  AlertTriangle,
  Calendar,
  Package
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface HeatmapData {
  job_work: { pcs: number; kg: number; activeMoves: number; overdue: number };
  plating: { pcs: number; kg: number; activeMoves: number; overdue: number };
  buffing: { pcs: number; kg: number; activeMoves: number; overdue: number };
  blasting: { pcs: number; kg: number; activeMoves: number; overdue: number };
  forging_ext: { pcs: number; kg: number; activeMoves: number; overdue: number };
}

interface OverdueReturn {
  id: string;
  wo_display_id: string;
  process_type: string;
  partner_name: string;
  dispatch_date: string;
  expected_return_date: string;
  pcs_pending: number;
  days_overdue: number;
}

const PROCESS_CONFIG = [
  { key: 'job_work' as const, label: 'Job Work', icon: Factory, color: 'text-blue-600' },
  { key: 'plating' as const, label: 'Plating', icon: Sparkles, color: 'text-purple-600' },
  { key: 'buffing' as const, label: 'Buffing', icon: Wind, color: 'text-cyan-600' },
  { key: 'blasting' as const, label: 'Blasting', icon: Hammer, color: 'text-orange-600' },
  { key: 'forging_ext' as const, label: 'Forging', icon: Flame, color: 'text-red-600' }
];

const METRICS = ['pcs', 'kg', 'activeMoves', 'overdue'] as const;
const METRIC_LABELS = {
  pcs: 'Pcs',
  kg: 'Kg',
  activeMoves: 'Active Moves',
  overdue: 'Overdue'
};

export const ExternalDashboard = () => {
  const navigate = useNavigate();
  const [heatmapData, setHeatmapData] = useState<HeatmapData>({
    job_work: { pcs: 0, kg: 0, activeMoves: 0, overdue: 0 },
    plating: { pcs: 0, kg: 0, activeMoves: 0, overdue: 0 },
    buffing: { pcs: 0, kg: 0, activeMoves: 0, overdue: 0 },
    blasting: { pcs: 0, kg: 0, activeMoves: 0, overdue: 0 },
    forging_ext: { pcs: 0, kg: 0, activeMoves: 0, overdue: 0 }
  });
  const [overdueReturns, setOverdueReturns] = useState<OverdueReturn[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadExternalData();

    const channel = supabase
      .channel('external-dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wo_external_moves' }, loadExternalData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wo_external_receipts' }, loadExternalData)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadExternalData = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];

      // Fetch external moves and receipts
      const [movesResult, receiptsResult, workOrdersResult] = await Promise.all([
        supabase.from('wo_external_moves' as any).select('*'),
        supabase.from('wo_external_receipts' as any).select('*'),
        supabase.from('work_orders').select('id, display_id, wo_id, gross_weight_per_pc')
      ]);

      const moves: any[] = movesResult.data || [];
      const receipts: any[] = receiptsResult.data || [];
      const workOrders: any[] = workOrdersResult.data || [];

      // Build heatmap data
      const data: HeatmapData = {
        job_work: { pcs: 0, kg: 0, activeMoves: 0, overdue: 0 },
        plating: { pcs: 0, kg: 0, activeMoves: 0, overdue: 0 },
        buffing: { pcs: 0, kg: 0, activeMoves: 0, overdue: 0 },
        blasting: { pcs: 0, kg: 0, activeMoves: 0, overdue: 0 },
        forging_ext: { pcs: 0, kg: 0, activeMoves: 0, overdue: 0 }
      };

      const overdueList: OverdueReturn[] = [];

      PROCESS_CONFIG.forEach(({ key }) => {
        const processMoves = moves.filter(m => m.process_type === key);
        
        processMoves.forEach(move => {
          const moveReceipts = receipts.filter(r => r.move_id === move.id);
          const totalReceived = moveReceipts.reduce((sum, r) => sum + (r.qty_received || 0), 0);
          const pending = (move.qty_sent || 0) - totalReceived;

          if (pending > 0 || !move.returned_date) {
            const wo = workOrders.find(w => w.id === move.wo_id);
            const weightPerPc = wo?.gross_weight_per_pc || 0;

            data[key].pcs += pending;
            data[key].kg += (pending * weightPerPc) / 1000;
            data[key].activeMoves += 1;

            // Check if overdue
            if (move.expected_return_date && move.expected_return_date < today && !move.returned_date) {
              data[key].overdue += 1;

              const daysOverdue = Math.floor(
                (new Date().getTime() - new Date(move.expected_return_date).getTime()) / (1000 * 60 * 60 * 24)
              );

              overdueList.push({
                id: move.id,
                wo_display_id: wo?.display_id || wo?.wo_id || 'N/A',
                process_type: key,
                partner_name: move.partner_name || 'Unknown',
                dispatch_date: move.dispatch_date || move.created_at,
                expected_return_date: move.expected_return_date,
                pcs_pending: pending,
                days_overdue: daysOverdue
              });
            }
          }
        });
      });

      setHeatmapData(data);
      setOverdueReturns(overdueList.sort((a, b) => b.days_overdue - a.days_overdue).slice(0, 10));
      setLoading(false);
    } catch (error) {
      console.error('Error loading external data:', error);
      setLoading(false);
    }
  };

  const getCellColor = (metric: typeof METRICS[number], value: number) => {
    if (metric === 'overdue') {
      if (value === 0) return 'bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300';
      if (value <= 2) return 'bg-yellow-50 dark:bg-yellow-950/30 text-yellow-700 dark:text-yellow-300';
      return 'bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300';
    }
    
    if (value === 0) return 'bg-muted text-muted-foreground';
    if (value < 100) return 'bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300';
    if (value < 500) return 'bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300';
    return 'bg-purple-50 dark:bg-purple-950/30 text-purple-700 dark:text-purple-300';
  };

  const handleCellClick = (processType: string, metric: typeof METRICS[number]) => {
    // Navigate to logistics/external processing page with filters
    navigate(`/logistics?process=${processType}&filter=${metric}`);
  };

  const getProcessLabel = (key: string) => {
    return PROCESS_CONFIG.find(p => p.key === key)?.label || key;
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>External Processing Dashboard</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-96 bg-muted animate-pulse rounded" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Heatmap */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            External Processing Heatmap
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <div className="inline-block min-w-full">
              <div className="grid grid-cols-6 gap-2">
                {/* Header row */}
                <div className="font-semibold text-sm p-3"></div>
                {PROCESS_CONFIG.map(({ key, label, icon: Icon, color }) => (
                  <div key={key} className="font-semibold text-sm p-3 text-center">
                    <div className="flex flex-col items-center gap-1">
                      <Icon className={cn("h-4 w-4", color)} />
                      <span>{label}</span>
                    </div>
                  </div>
                ))}

                {/* Data rows */}
                {METRICS.map(metric => (
                  <>
                    <div key={`label-${metric}`} className="font-semibold text-sm p-3 flex items-center">
                      {METRIC_LABELS[metric]}
                    </div>
                    {PROCESS_CONFIG.map(({ key }) => {
                      const value = heatmapData[key][metric];
                      const displayValue = metric === 'kg' ? value.toFixed(1) : value;
                      
                      return (
                        <div
                          key={`${key}-${metric}`}
                          className={cn(
                            "p-4 rounded-lg cursor-pointer hover:shadow-md transition-all text-center font-bold text-lg",
                            getCellColor(metric, value)
                          )}
                          onClick={() => handleCellClick(key, metric)}
                        >
                          {displayValue}
                        </div>
                      );
                    })}
                  </>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Overdue Returns Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              Overdue Returns
            </CardTitle>
            {overdueReturns.length > 0 && (
              <Badge variant="destructive">
                {overdueReturns.length} overdue
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {overdueReturns.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Package className="h-12 w-12 mx-auto mb-2 text-green-500" />
              <p>No overdue returns! All on track.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>WO</TableHead>
                  <TableHead>Process</TableHead>
                  <TableHead>Partner</TableHead>
                  <TableHead>Sent</TableHead>
                  <TableHead>Expected Return</TableHead>
                  <TableHead className="text-right">Pcs Pending</TableHead>
                  <TableHead className="text-right">Days Overdue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overdueReturns.map((item) => (
                  <TableRow 
                    key={item.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => navigate('/logistics')}
                  >
                    <TableCell className="font-medium">{item.wo_display_id}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{getProcessLabel(item.process_type)}</Badge>
                    </TableCell>
                    <TableCell>{item.partner_name}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        {new Date(item.dispatch_date).toLocaleDateString()}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        {new Date(item.expected_return_date).toLocaleDateString()}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-semibold">{item.pcs_pending}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant="destructive">{item.days_overdue}d</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
