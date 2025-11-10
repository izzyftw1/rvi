import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useThrottledRealtime } from "@/hooks/useThrottledRealtime";
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
  }, []);

  // Throttled realtime for External heatmap - separate channel
  const loadExternalDataCallback = useCallback(() => {
    loadExternalData();
  }, []);

  useThrottledRealtime({
    channelName: 'dashboard-external-heatmap',
    tables: ['wo_external_moves', 'work_orders'],
    onUpdate: loadExternalDataCallback,
    throttleMs: 3000,
    cacheMs: 15000,
  });

  const loadExternalData = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];

      // Use the new SQL view for aggregated data
      const { data: summaryData, error: summaryError } = await supabase
        .from('external_processing_summary_vw')
        .select('*');

      if (summaryError) {
        console.error('Error loading external processing summary:', summaryError);
        setLoading(false);
        return;
      }

      // Initialize with zeros
      const data: HeatmapData = {
        job_work: { pcs: 0, kg: 0, activeMoves: 0, overdue: 0 },
        plating: { pcs: 0, kg: 0, activeMoves: 0, overdue: 0 },
        buffing: { pcs: 0, kg: 0, activeMoves: 0, overdue: 0 },
        blasting: { pcs: 0, kg: 0, activeMoves: 0, overdue: 0 },
        forging_ext: { pcs: 0, kg: 0, activeMoves: 0, overdue: 0 }
      };

      // Map summary data to heatmap structure
      summaryData?.forEach((row: any) => {
        const processKey = row.process_name as keyof HeatmapData;
        if (data[processKey]) {
          data[processKey] = {
            pcs: Math.round(row.pcs_total || 0),
            kg: parseFloat((row.kg_total || 0).toFixed(1)),
            activeMoves: row.active_moves || 0,
            overdue: row.overdue || 0
          };
        }
      });

      setHeatmapData(data);

      // Load overdue details for the table
      const { data: movesData, error: movesError } = await supabase
        .from('wo_external_moves')
        .select(`
          id,
          process,
          dispatch_date,
          expected_return_date,
          quantity_sent,
          quantity_returned,
          partner_id,
          work_order_id,
          work_orders!work_order_id(display_id, wo_number, gross_weight_per_pc),
          external_partners!partner_id(name)
        `)
        .lt('expected_return_date', today)
        .is('returned_date', null)
        .order('expected_return_date', { ascending: true })
        .limit(10);

      if (!movesError && movesData) {
        const overdueList: OverdueReturn[] = movesData.map((move: any) => {
          const pending = (move.quantity_sent || 0) - (move.quantity_returned || 0);
          const daysOverdue = Math.floor(
            (new Date().getTime() - new Date(move.expected_return_date).getTime()) / (1000 * 60 * 60 * 24)
          );

          return {
            id: move.id,
            wo_display_id: move.work_orders?.display_id || move.work_orders?.wo_number || 'N/A',
            process_type: move.process,
            partner_name: move.external_partners?.name || 'Unknown',
            dispatch_date: move.dispatch_date || '',
            expected_return_date: move.expected_return_date || '',
            pcs_pending: pending,
            days_overdue: daysOverdue
          };
        });

        setOverdueReturns(overdueList);
      }

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
