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
  ArrowRight,
  Clock,
  Ban,
  Package
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { startOfWeek, format, differenceInDays, parseISO } from "date-fns";

interface QualitySignal {
  label: string;
  value: number | string;
  subtext?: string;
  ageIndicator?: string;
  impactedPcs?: number;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  severity: 'ok' | 'warning' | 'critical';
  link: string;
  isNcrMetric?: boolean;
}

export const QualityLossSignals = () => {
  const navigate = useNavigate();
  const [signals, setSignals] = useState<QualitySignal[]>([]);
  const [ncrSignals, setNcrSignals] = useState<QualitySignal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchQualityData = async () => {
      setLoading(true);
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];
      const weekStart = format(startOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd');
      const sevenDaysAgo = new Date(today);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      try {
        // 1. Rejection rate today - from daily_production_logs
        const { data: prodLogs } = await supabase
          .from('daily_production_logs')
          .select('actual_quantity, total_rejection_quantity, ok_quantity')
          .eq('log_date', todayStr);

        let totalProduced = 0;
        let totalRejected = 0;
        if (prodLogs) {
          prodLogs.forEach(log => {
            totalProduced += log.actual_quantity || 0;
            totalRejected += log.total_rejection_quantity || 0;
          });
        }
        const rejectionRate = totalProduced > 0 ? (totalRejected / totalProduced) * 100 : 0;

        // 2. First-piece failures today
        const { data: fpFailures } = await supabase
          .from('qc_records')
          .select('id')
          .eq('qc_type', 'first_piece')
          .eq('result', 'fail')
          .gte('created_at', todayStr);

        const firstPieceFailCount = fpFailures?.length || 0;

        // Fetch all NCR data at once for the new metrics
        const { data: allNcrs } = await supabase
          .from('ncrs')
          .select('id, work_order_id, status, created_at, quantity_affected, operation_type, ncr_type');

        // Get work orders to check for blocking status
        const { data: workOrders } = await supabase
          .from('work_orders')
          .select('id, status, quantity')
          .in('status', ['in_progress', 'qc', 'packing', 'pending']);

        const activeWoIds = new Set((workOrders || []).map(wo => wo.id));

        // === NCR Metrics ===
        
        // NCRs Blocking Production - Active NCRs linked to in-progress work orders
        const ncrsBlockingProduction = (allNcrs || []).filter(ncr => 
          ncr.work_order_id && 
          activeWoIds.has(ncr.work_order_id) &&
          ['OPEN', 'ACTION_IN_PROGRESS'].includes(ncr.status || '')
        );
        const blockingPcs = ncrsBlockingProduction.reduce((sum, ncr) => sum + (ncr.quantity_affected || 0), 0);
        let blockingOldestAge = 0;
        if (ncrsBlockingProduction.length > 0) {
          const oldestBlocking = ncrsBlockingProduction.reduce((oldest, ncr) => 
            new Date(ncr.created_at || 0) < new Date(oldest.created_at || 0) ? ncr : oldest
          );
          if (oldestBlocking.created_at) {
            blockingOldestAge = differenceInDays(today, parseISO(oldestBlocking.created_at));
          }
        }

        // NCRs Open > 7 Days
        const ncrsOver7Days = (allNcrs || []).filter(ncr => 
          ['OPEN', 'ACTION_IN_PROGRESS', 'EFFECTIVENESS_PENDING'].includes(ncr.status || '') &&
          ncr.created_at && new Date(ncr.created_at) < sevenDaysAgo
        );
        const over7DaysPcs = ncrsOver7Days.reduce((sum, ncr) => sum + (ncr.quantity_affected || 0), 0);
        let over7DaysOldestAge = 0;
        if (ncrsOver7Days.length > 0) {
          const oldestOver7 = ncrsOver7Days.reduce((oldest, ncr) => 
            new Date(ncr.created_at || 0) < new Date(oldest.created_at || 0) ? ncr : oldest
          );
          if (oldestOver7.created_at) {
            over7DaysOldestAge = differenceInDays(today, parseISO(oldestOver7.created_at));
          }
        }

        // Repeat NCRs (by Work Order or Operation Type)
        const activeNcrs = (allNcrs || []).filter(ncr => 
          ['OPEN', 'ACTION_IN_PROGRESS', 'EFFECTIVENESS_PENDING'].includes(ncr.status || '')
        );
        
        // Count by work_order_id (items with multiple NCRs)
        const woNcrCount = new Map<string, { count: number; pcs: number }>();
        activeNcrs.forEach(ncr => {
          if (ncr.work_order_id) {
            const current = woNcrCount.get(ncr.work_order_id) || { count: 0, pcs: 0 };
            woNcrCount.set(ncr.work_order_id, { 
              count: current.count + 1, 
              pcs: current.pcs + (ncr.quantity_affected || 0) 
            });
          }
        });
        
        // Count by operation_type (process)
        const processNcrCount = new Map<string, { count: number; pcs: number }>();
        activeNcrs.forEach(ncr => {
          if (ncr.operation_type) {
            const current = processNcrCount.get(ncr.operation_type) || { count: 0, pcs: 0 };
            processNcrCount.set(ncr.operation_type, { 
              count: current.count + 1, 
              pcs: current.pcs + (ncr.quantity_affected || 0) 
            });
          }
        });

        // WOs or processes with 2+ NCRs
        const repeatWOs = Array.from(woNcrCount.entries()).filter(([_, v]) => v.count >= 2);
        const repeatProcesses = Array.from(processNcrCount.entries()).filter(([_, v]) => v.count >= 2);
        const repeatCount = repeatWOs.length + repeatProcesses.length;
        const repeatPcs = [...repeatWOs, ...repeatProcesses].reduce((sum, [_, v]) => sum + v.pcs, 0);

        // Build quality signals (production metrics)
        const safeRejectionRate = Number.isFinite(rejectionRate) ? rejectionRate : 0;
        
        const qualitySignals: QualitySignal[] = [
          {
            label: 'Rejection Rate',
            value: `${safeRejectionRate.toFixed(1)}%`,
            subtext: `${totalRejected} of ${totalProduced} pcs`,
            icon: TrendingDown,
            color: safeRejectionRate > 5 ? 'text-destructive' : safeRejectionRate > 2 ? 'text-amber-600' : 'text-emerald-600',
            bgColor: safeRejectionRate > 5 ? 'bg-destructive/10' : safeRejectionRate > 2 ? 'bg-amber-500/10' : 'bg-emerald-500/10',
            severity: safeRejectionRate > 5 ? 'critical' : safeRejectionRate > 2 ? 'warning' : 'ok',
            link: '/quality-analytics'
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

        // Build NCR-specific signals
        const ncrMetrics: QualitySignal[] = [
          {
            label: 'NCRs Blocking Production',
            value: ncrsBlockingProduction.length,
            ageIndicator: blockingOldestAge > 0 ? `${blockingOldestAge}d oldest` : undefined,
            impactedPcs: blockingPcs,
            icon: Ban,
            color: ncrsBlockingProduction.length > 0 ? 'text-destructive' : 'text-emerald-600',
            bgColor: ncrsBlockingProduction.length > 0 ? 'bg-destructive/10' : 'bg-emerald-500/10',
            severity: ncrsBlockingProduction.length > 2 ? 'critical' : ncrsBlockingProduction.length > 0 ? 'warning' : 'ok',
            link: '/ncr-management?filter=blocking',
            isNcrMetric: true
          },
          {
            label: 'NCRs Open >7 Days',
            value: ncrsOver7Days.length,
            ageIndicator: over7DaysOldestAge > 7 ? `${over7DaysOldestAge}d oldest` : undefined,
            impactedPcs: over7DaysPcs,
            icon: Clock,
            color: ncrsOver7Days.length > 3 ? 'text-destructive' : ncrsOver7Days.length > 0 ? 'text-amber-600' : 'text-emerald-600',
            bgColor: ncrsOver7Days.length > 3 ? 'bg-destructive/10' : ncrsOver7Days.length > 0 ? 'bg-amber-500/10' : 'bg-emerald-500/10',
            severity: ncrsOver7Days.length > 3 ? 'critical' : ncrsOver7Days.length > 0 ? 'warning' : 'ok',
            link: '/ncr-management?filter=overdue',
            isNcrMetric: true
          },
          {
            label: 'Repeat NCRs',
            value: repeatCount,
            subtext: repeatWOs.length > 0 ? `${repeatWOs.length} WOs, ${repeatProcesses.length} processes` : undefined,
            impactedPcs: repeatPcs,
            icon: RefreshCw,
            color: repeatCount > 2 ? 'text-destructive' : repeatCount > 0 ? 'text-amber-600' : 'text-emerald-600',
            bgColor: repeatCount > 2 ? 'bg-destructive/10' : repeatCount > 0 ? 'bg-amber-500/10' : 'bg-emerald-500/10',
            severity: repeatCount > 2 ? 'critical' : repeatCount > 0 ? 'warning' : 'ok',
            link: '/ncr-management?filter=repeat',
            isNcrMetric: true
          }
        ];

        setSignals(qualitySignals);
        setNcrSignals(ncrMetrics);
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_orders' }, () => fetchQualityData())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const allSignals = [...signals, ...ncrSignals];
  const criticalCount = allSignals.filter(s => s.severity === 'critical').length;
  const warningCount = allSignals.filter(s => s.severity === 'warning').length;

  const renderSignalCard = (signal: QualitySignal) => {
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
        <div className="flex items-center gap-2 mb-1.5">
          <Icon className={cn("h-4 w-4", signal.color)} />
          <span className="text-xs font-medium text-muted-foreground truncate">
            {signal.label}
          </span>
        </div>
        <div className={cn("text-2xl font-bold", signal.color)}>
          {signal.value}
        </div>
        
        {/* Age indicator */}
        {signal.ageIndicator && (
          <div className="flex items-center gap-1 mt-1">
            <Clock className="h-3 w-3 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground">{signal.ageIndicator}</span>
          </div>
        )}
        
        {/* Impacted pieces */}
        {signal.impactedPcs !== undefined && signal.impactedPcs > 0 && (
          <div className="flex items-center gap-1 mt-0.5">
            <Package className="h-3 w-3 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground">{signal.impactedPcs.toLocaleString()} pcs affected</span>
          </div>
        )}
        
        {/* Subtext fallback */}
        {signal.subtext && !signal.ageIndicator && !signal.impactedPcs && (
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {signal.subtext}
          </p>
        )}
      </div>
    );
  };

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
      <CardContent className="px-4 pb-4 pt-0 space-y-4">
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="h-24 rounded-lg bg-muted animate-pulse" />
            ))}
          </div>
        ) : (
          <>
            {/* Production Quality Metrics */}
            <div className="grid grid-cols-2 gap-3">
              {signals.map(renderSignalCard)}
            </div>

            {/* NCR-Specific Metrics */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <FileWarning className="h-3 w-3 text-muted-foreground" />
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                  NCR Status
                </span>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {ncrSignals.map(renderSignalCard)}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};
