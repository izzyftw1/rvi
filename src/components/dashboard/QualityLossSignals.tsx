/**
 * QualityLossSignals - Clean quality metrics widget
 * Production metrics from useProductionLogMetrics, NCR metrics from direct queries.
 */
import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle, TrendingDown, FileWarning, RefreshCw, Target,
  ArrowRight, Clock, Ban, Package
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { differenceInDays, parseISO, format } from "date-fns";
import { formatCount, formatDisplayValue, isEmpty } from "@/lib/displayUtils";
import { useProductionLogMetrics } from "@/hooks/useProductionLogMetrics";

interface Signal {
  label: string;
  value: number | string;
  subtext?: string;
  icon: React.ElementType;
  color: string;
  bg: string;
  severity: 'ok' | 'warning' | 'critical';
  link: string;
}

export const QualityLossSignals = () => {
  const navigate = useNavigate();
  const [ncrSignals, setNcrSignals] = useState<Signal[]>([]);
  const [firstPieceFails, setFirstPieceFails] = useState(0);
  const [ncrLoading, setNcrLoading] = useState(true);

  const today = format(new Date(), 'yyyy-MM-dd');
  const { metrics, loading: metricsLoading } = useProductionLogMetrics({ startDate: today, endDate: today, period: 'today' });

  const productionSignals = useMemo((): Signal[] => {
    if (!metrics) return [];
    const rate = Number.isFinite(metrics.rejectionRate) ? metrics.rejectionRate : 0;
    const total = metrics.totalOutput + (metrics.totalRejections || 0);
    return [
      {
        label: 'Rejection Rate', value: `${rate.toFixed(1)}%`,
        subtext: `${metrics.totalRejections || 0} of ${total} pcs`,
        icon: TrendingDown,
        color: rate > 5 ? 'text-destructive' : rate > 2 ? 'text-amber-600' : 'text-emerald-600',
        bg: rate > 5 ? 'bg-destructive/10' : rate > 2 ? 'bg-amber-500/10' : 'bg-emerald-500/10',
        severity: rate > 5 ? 'critical' : rate > 2 ? 'warning' : 'ok',
        link: '/quality-analytics'
      },
      {
        label: 'First-Piece Fails', value: firstPieceFails,
        subtext: 'today', icon: Target,
        color: firstPieceFails > 3 ? 'text-destructive' : firstPieceFails > 0 ? 'text-amber-600' : 'text-emerald-600',
        bg: firstPieceFails > 3 ? 'bg-destructive/10' : firstPieceFails > 0 ? 'bg-amber-500/10' : 'bg-emerald-500/10',
        severity: firstPieceFails > 3 ? 'critical' : firstPieceFails > 0 ? 'warning' : 'ok',
        link: '/quality?tab=first-piece'
      }
    ];
  }, [metrics, firstPieceFails]);

  useEffect(() => {
    const fetch = async () => {
      setNcrLoading(true);
      const todayDate = new Date();
      const sevenDaysAgo = new Date(); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      try {
        const [fpRes, ncrRes, woRes] = await Promise.all([
          supabase.from('qc_records').select('id').eq('qc_type', 'first_piece').eq('result', 'fail').gte('created_at', todayDate.toISOString().split('T')[0]),
          supabase.from('ncrs').select('id, work_order_id, status, created_at, quantity_affected, operation_type'),
          supabase.from('work_orders_restricted').select('id, status').in('status', ['in_progress', 'qc', 'packing', 'pending']),
        ]);

        setFirstPieceFails(fpRes.data?.length || 0);
        const activeWoIds = new Set((woRes.data || []).map(w => w.id));
        const allNcrs = ncrRes.data || [];

        // Blocking
        const blocking = allNcrs.filter(n => n.work_order_id && activeWoIds.has(n.work_order_id) && ['OPEN', 'ACTION_IN_PROGRESS'].includes(n.status || ''));
        const blockingPcs = blocking.reduce((s, n) => s + (n.quantity_affected || 0), 0);
        let blockingAge = 0;
        if (blocking.length > 0) {
          const oldest = blocking.reduce((o, n) => new Date(n.created_at || 0) < new Date(o.created_at || 0) ? n : o);
          blockingAge = oldest.created_at ? differenceInDays(todayDate, parseISO(oldest.created_at)) : 0;
        }

        // Over 7 days
        const over7 = allNcrs.filter(n => ['OPEN', 'ACTION_IN_PROGRESS', 'EFFECTIVENESS_PENDING'].includes(n.status || '') && n.created_at && new Date(n.created_at) < sevenDaysAgo);
        const over7Pcs = over7.reduce((s, n) => s + (n.quantity_affected || 0), 0);
        let over7Age = 0;
        if (over7.length > 0) {
          const oldest = over7.reduce((o, n) => new Date(n.created_at || 0) < new Date(o.created_at || 0) ? n : o);
          over7Age = oldest.created_at ? differenceInDays(todayDate, parseISO(oldest.created_at)) : 0;
        }

        // Repeats
        const active = allNcrs.filter(n => ['OPEN', 'ACTION_IN_PROGRESS', 'EFFECTIVENESS_PENDING'].includes(n.status || ''));
        const woCount = new Map<string, number>();
        active.forEach(n => { if (n.work_order_id) woCount.set(n.work_order_id, (woCount.get(n.work_order_id) || 0) + 1); });
        const repeats = Array.from(woCount.values()).filter(c => c >= 2).length;

        setNcrSignals([
          {
            label: 'NCRs Blocking Production', value: blocking.length,
            subtext: blockingAge > 0 ? `${blockingAge}d oldest · ${formatCount(blockingPcs)} pcs` : undefined,
            icon: Ban,
            color: blocking.length > 0 ? 'text-destructive' : 'text-emerald-600',
            bg: blocking.length > 0 ? 'bg-destructive/10' : 'bg-emerald-500/10',
            severity: blocking.length > 2 ? 'critical' : blocking.length > 0 ? 'warning' : 'ok',
            link: '/ncr?filter=blocking'
          },
          {
            label: 'NCRs Open >7 Days', value: over7.length,
            subtext: over7Age > 7 ? `${over7Age}d oldest · ${formatCount(over7Pcs)} pcs` : undefined,
            icon: Clock,
            color: over7.length > 3 ? 'text-destructive' : over7.length > 0 ? 'text-amber-600' : 'text-emerald-600',
            bg: over7.length > 3 ? 'bg-destructive/10' : over7.length > 0 ? 'bg-amber-500/10' : 'bg-emerald-500/10',
            severity: over7.length > 3 ? 'critical' : over7.length > 0 ? 'warning' : 'ok',
            link: '/ncr?filter=overdue'
          },
          {
            label: 'Repeat NCRs', value: repeats, icon: RefreshCw,
            color: repeats > 2 ? 'text-destructive' : repeats > 0 ? 'text-amber-600' : 'text-emerald-600',
            bg: repeats > 2 ? 'bg-destructive/10' : repeats > 0 ? 'bg-amber-500/10' : 'bg-emerald-500/10',
            severity: repeats > 2 ? 'critical' : repeats > 0 ? 'warning' : 'ok',
            link: '/ncr?filter=repeat'
          }
        ]);
      } catch (e) {
        console.error('Error fetching NCR data:', e);
      } finally {
        setNcrLoading(false);
      }
    };

    fetch();
    const ch = supabase.channel('quality-signals')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ncrs' }, () => fetch())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'qc_records' }, () => fetch())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const allSignals = [...productionSignals, ...ncrSignals];
  const criticalCount = allSignals.filter(s => s.severity === 'critical').length;
  const isLoading = metricsLoading || ncrLoading;

  const renderCard = (signal: Signal) => {
    const Icon = signal.icon;
    return (
      <button
        key={signal.label}
        className={cn("rounded-lg p-3 text-left transition-all hover:shadow-sm", signal.bg)}
        onClick={() => navigate(signal.link)}
      >
        <div className="flex items-center gap-1.5 mb-1">
          <Icon className={cn("h-3.5 w-3.5", signal.color)} />
          <span className="text-[11px] font-medium text-muted-foreground">{signal.label}</span>
        </div>
        <div className={cn("text-xl font-bold leading-none", signal.color)}>
          {typeof signal.value === 'number' ? formatDisplayValue(signal.value, { showZero: false }) : signal.value}
        </div>
        {signal.subtext && (
          <p className="text-[10px] text-muted-foreground mt-1">{signal.subtext}</p>
        )}
      </button>
    );
  };

  return (
    <Card>
      <CardHeader className="py-3 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <AlertTriangle className={cn("h-4 w-4", criticalCount > 0 ? "text-destructive" : "text-emerald-500")} />
            Quality & Loss Signals
            {criticalCount > 0 && <Badge variant="destructive" className="text-[10px]">{criticalCount} Critical</Badge>}
          </CardTitle>
          <button onClick={() => navigate('/quality/analytics')} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
            Analytics <ArrowRight className="h-3 w-3" />
          </button>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0 space-y-3">
        {isLoading ? (
          <div className="grid grid-cols-2 gap-2">{[1, 2, 3, 4].map(i => <div key={i} className="h-20 rounded-lg bg-muted animate-pulse" />)}</div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              {productionSignals.map(renderCard)}
            </div>
            <div>
              <div className="flex items-center gap-1.5 mb-1.5 px-1">
                <FileWarning className="h-3 w-3 text-muted-foreground" />
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">NCR Status</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {ncrSignals.map(renderCard)}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};
