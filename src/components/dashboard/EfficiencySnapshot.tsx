import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { 
  TrendingUp, 
  CheckCircle, 
  Factory, 
  AlertTriangle 
} from "lucide-react";
import { cn } from "@/lib/utils";

interface EfficiencyMetric {
  label: string;
  value: string | number;
  unit?: string;
  icon: React.ElementType;
  progress?: number;
  status: 'good' | 'warning' | 'critical';
}

export const EfficiencySnapshot = () => {
  const [metrics, setMetrics] = useState<EfficiencyMetric[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadEfficiencyMetrics();

    const channel = supabase
      .channel('efficiency-metrics')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_orders' }, loadEfficiencyMetrics)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'qc_records' }, loadEfficiencyMetrics)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadEfficiencyMetrics = async () => {
    try {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const today = new Date().toISOString().split('T')[0];

      const [workOrders, qcRecords, externalMoves, externalReceipts] = await Promise.all([
        supabase.from('work_orders').select('*'),
        supabase.from('qc_records').select('*'),
        supabase.from('wo_external_moves' as any).select('*'),
        supabase.from('wo_external_receipts' as any).select('*')
      ]);

      const wos = workOrders.data || [];
      const qc = qcRecords.data || [];
      const moves: any[] = externalMoves.data || [];
      const receipts: any[] = externalReceipts.data || [];

      // Avg Turnaround Time (days)
      const completedWOs = wos.filter(wo => wo.status === 'completed');
      let avgTurnaround = 0;
      if (completedWOs.length > 0) {
        const totalDays = completedWOs.reduce((sum, wo) => {
          const start = new Date(wo.created_at);
          const end = new Date(wo.updated_at);
          const days = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
          return sum + days;
        }, 0);
        avgTurnaround = totalDays / completedWOs.length;
      }

      // QC Pass Rate
      const totalQC = qc.filter(q => q.result !== 'pending').length;
      const passedQC = qc.filter(q => q.result === 'pass').length;
      const qcPassRate = totalQC > 0 ? (passedQC / totalQC) * 100 : 0;

      // Total External Work Pending
      const externalPending = moves.reduce((sum, move) => {
        const received = receipts
          .filter(r => r.move_id === move.id)
          .reduce((s, r) => s + (r.qty_received || 0), 0);
        return sum + ((move.qty_sent || 0) - received);
      }, 0);

      // Most Delayed Stage This Week
      const stageDelays: Record<string, number> = {};
      wos.forEach(wo => {
        if (wo.status !== 'completed') {
          const waitTime = (Date.now() - new Date(wo.updated_at).getTime()) / (1000 * 60 * 60);
          const stage = wo.current_stage || 'unknown';
          stageDelays[stage] = (stageDelays[stage] || 0) + waitTime;
        }
      });

      let mostDelayedStage = 'None';
      let maxDelay = 0;
      Object.entries(stageDelays).forEach(([stage, delay]) => {
        if (delay > maxDelay) {
          maxDelay = delay;
          mostDelayedStage = stage;
        }
      });

      const safeAvgTurnaround = Number.isFinite(avgTurnaround) ? avgTurnaround : 0;
      const safeQcPassRate = Number.isFinite(qcPassRate) ? qcPassRate : 0;
      
      const metricsData: EfficiencyMetric[] = [
        {
          label: 'Avg Turnaround',
          value: safeAvgTurnaround.toFixed(1),
          unit: 'days',
          icon: TrendingUp,
          status: safeAvgTurnaround <= 7 ? 'good' : safeAvgTurnaround <= 14 ? 'warning' : 'critical'
        },
        {
          label: 'QC Pass Rate',
          value: safeQcPassRate.toFixed(1),
          unit: '%',
          icon: CheckCircle,
          progress: safeQcPassRate,
          status: safeQcPassRate >= 90 ? 'good' : safeQcPassRate >= 75 ? 'warning' : 'critical'
        },
        {
          label: 'External WIP',
          value: externalPending,
          unit: 'pcs',
          icon: Factory,
          status: externalPending <= 1000 ? 'good' : externalPending <= 2000 ? 'warning' : 'critical'
        },
        {
          label: 'Most Delayed Stage',
          value: mostDelayedStage.replace('_', ' ').toUpperCase(),
          icon: AlertTriangle,
          status: maxDelay <= 24 ? 'good' : maxDelay <= 48 ? 'warning' : 'critical'
        }
      ];

      setMetrics(metricsData);
      setLoading(false);
    } catch (error) {
      console.error('Error loading efficiency metrics:', error);
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'good': return 'text-green-600';
      case 'warning': return 'text-yellow-600';
      case 'critical': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-32 bg-muted animate-pulse rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-xl font-bold mb-4">Efficiency Snapshot</h2>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {metrics.map((metric, idx) => {
          const Icon = metric.icon;
          return (
            <Card key={idx}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {metric.label}
                  </CardTitle>
                  <Icon className={cn("h-5 w-5", getStatusColor(metric.status))} />
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-1 mb-2">
                  <p className={cn("text-3xl font-bold", getStatusColor(metric.status))}>
                    {metric.value}
                  </p>
                  {metric.unit && (
                    <p className="text-sm text-muted-foreground">{metric.unit}</p>
                  )}
                </div>
                {metric.progress !== undefined && (
                  <Progress value={metric.progress} className="h-2" />
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};
