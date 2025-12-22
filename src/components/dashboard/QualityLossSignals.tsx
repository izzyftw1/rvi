import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  AlertTriangle, 
  TrendingDown, 
  FileWarning, 
  RefreshCw, 
  Target,
  ArrowRight
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { startOfWeek, format } from "date-fns";

interface QualitySignal {
  label: string;
  value: number | string;
  subtext?: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  severity: 'ok' | 'warning' | 'critical';
  link: string;
}

export const QualityLossSignals = () => {
  const navigate = useNavigate();
  const [signals, setSignals] = useState<QualitySignal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchQualityData = async () => {
      setLoading(true);
      const today = new Date().toISOString().split('T')[0];
      const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');

      try {
        // 1. Rejection rate today - from daily_production_logs
        const { data: prodLogs } = await supabase
          .from('daily_production_logs')
          .select('actual_quantity, total_rejection_quantity, ok_quantity')
          .eq('log_date', today);

        let totalProduced = 0;
        let totalRejected = 0;
        if (prodLogs) {
          prodLogs.forEach(log => {
            totalProduced += log.actual_quantity || 0;
            totalRejected += log.total_rejection_quantity || 0;
          });
        }
        const rejectionRate = totalProduced > 0 ? (totalRejected / totalProduced) * 100 : 0;

        // 2. NCRs opened this week
        const { data: ncrsThisWeek } = await supabase
          .from('ncrs')
          .select('id, work_order_id, status')
          .gte('created_at', weekStart);

        const ncrsOpenedCount = ncrsThisWeek?.length || 0;

        // 3. Repeat NCRs - work orders with multiple active NCRs
        const { data: activeNcrs } = await supabase
          .from('ncrs')
          .select('id, work_order_id')
          .in('status', ['OPEN', 'ACTION_IN_PROGRESS', 'EFFECTIVENESS_PENDING']);

        // Count work orders with multiple NCRs
        const woNcrCount = new Map<string, number>();
        activeNcrs?.forEach(ncr => {
          if (ncr.work_order_id) {
            woNcrCount.set(ncr.work_order_id, (woNcrCount.get(ncr.work_order_id) || 0) + 1);
          }
        });
        const repeatNcrCount = Array.from(woNcrCount.values()).filter(count => count > 1).length;

        // 4. First-piece failures today - from qc_records with stage 'first_piece' and result 'fail'
        const { data: fpFailures } = await supabase
          .from('qc_records')
          .select('id')
          .eq('qc_type', 'first_piece')
          .eq('result', 'fail')
          .gte('created_at', today);

        const firstPieceFailCount = fpFailures?.length || 0;

        // Build signals array
        const qualitySignals: QualitySignal[] = [
          {
            label: 'Rejection Rate',
            value: `${rejectionRate.toFixed(1)}%`,
            subtext: `${totalRejected} of ${totalProduced} pcs`,
            icon: TrendingDown,
            color: rejectionRate > 5 ? 'text-destructive' : rejectionRate > 2 ? 'text-amber-600' : 'text-emerald-600',
            bgColor: rejectionRate > 5 ? 'bg-destructive/10' : rejectionRate > 2 ? 'bg-amber-500/10' : 'bg-emerald-500/10',
            severity: rejectionRate > 5 ? 'critical' : rejectionRate > 2 ? 'warning' : 'ok',
            link: '/quality-analytics'
          },
          {
            label: 'NCRs This Week',
            value: ncrsOpenedCount,
            subtext: 'opened since Monday',
            icon: FileWarning,
            color: ncrsOpenedCount > 5 ? 'text-destructive' : ncrsOpenedCount > 2 ? 'text-amber-600' : 'text-emerald-600',
            bgColor: ncrsOpenedCount > 5 ? 'bg-destructive/10' : ncrsOpenedCount > 2 ? 'bg-amber-500/10' : 'bg-emerald-500/10',
            severity: ncrsOpenedCount > 5 ? 'critical' : ncrsOpenedCount > 2 ? 'warning' : 'ok',
            link: '/ncr-management'
          },
          {
            label: 'Repeat NCRs',
            value: repeatNcrCount,
            subtext: 'items with multiple NCRs',
            icon: RefreshCw,
            color: repeatNcrCount > 2 ? 'text-destructive' : repeatNcrCount > 0 ? 'text-amber-600' : 'text-emerald-600',
            bgColor: repeatNcrCount > 2 ? 'bg-destructive/10' : repeatNcrCount > 0 ? 'bg-amber-500/10' : 'bg-emerald-500/10',
            severity: repeatNcrCount > 2 ? 'critical' : repeatNcrCount > 0 ? 'warning' : 'ok',
            link: '/ncr-management?filter=repeat'
          },
          {
            label: 'First-Piece Fails',
            value: firstPieceFailCount,
            subtext: 'today',
            icon: Target,
            color: firstPieceFailCount > 3 ? 'text-destructive' : firstPieceFailCount > 0 ? 'text-amber-600' : 'text-emerald-600',
            bgColor: firstPieceFailCount > 3 ? 'bg-destructive/10' : firstPieceFailCount > 0 ? 'bg-amber-500/10' : 'bg-emerald-500/10',
            severity: firstPieceFailCount > 3 ? 'critical' : firstPieceFailCount > 0 ? 'warning' : 'ok',
            link: '/quality?tab=first-piece'
          }
        ];

        setSignals(qualitySignals);
      } catch (error) {
        console.error('Error fetching quality signals:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchQualityData();

    // Set up realtime subscriptions
    const channel = supabase
      .channel('quality-signals-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_production_logs' }, () => fetchQualityData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ncrs' }, () => fetchQualityData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'qc_records' }, () => fetchQualityData())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const criticalCount = signals.filter(s => s.severity === 'critical').length;
  const warningCount = signals.filter(s => s.severity === 'warning').length;

  return (
    <Card>
      <CardHeader className="py-3 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <AlertTriangle className={cn(
              "h-4 w-4",
              criticalCount > 0 ? "text-destructive" : warningCount > 0 ? "text-amber-500" : "text-emerald-500"
            )} />
            Quality & Loss Signals
            {criticalCount > 0 && (
              <Badge variant="destructive" className="text-[10px]">
                {criticalCount} Critical
              </Badge>
            )}
            {warningCount > 0 && criticalCount === 0 && (
              <Badge className="bg-amber-500 hover:bg-amber-600 text-[10px]">
                {warningCount} Warning
              </Badge>
            )}
          </CardTitle>
          <button
            onClick={() => navigate('/quality-analytics')}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            Analytics <ArrowRight className="h-3 w-3" />
          </button>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-20 rounded-lg bg-muted animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {signals.map((signal) => {
              const Icon = signal.icon;
              return (
                <div
                  key={signal.label}
                  className={cn(
                    "rounded-lg p-3 cursor-pointer transition-all hover:scale-[1.02] hover:shadow-md",
                    signal.bgColor,
                    signal.severity === 'critical' && "ring-1 ring-destructive/30"
                  )}
                  onClick={() => navigate(signal.link)}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Icon className={cn("h-4 w-4", signal.color)} />
                    <span className="text-xs font-medium text-muted-foreground">
                      {signal.label}
                    </span>
                  </div>
                  <div className={cn("text-2xl font-bold", signal.color)}>
                    {signal.value}
                  </div>
                  {signal.subtext && (
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {signal.subtext}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
