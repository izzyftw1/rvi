/**
 * ExecutiveRiskBar - Compact risk summary bar below the critical strip
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, Clock, ClipboardX, Wrench, Package, Truck, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface RiskMetrics {
  workOrdersDelayed: number;
  qcBlockingRelease: number;
  ncrsOverdue: number;
  maintenanceOverdue: number;
  materialWaitingQC: number;
  externalJobsDelayed: number;
}

export const ExecutiveRiskBar = () => {
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState<RiskMetrics>({
    workOrdersDelayed: 0, qcBlockingRelease: 0, ncrsOverdue: 0,
    maintenanceOverdue: 0, materialWaitingQC: 0, externalJobsDelayed: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRiskMetrics();
    const channel = supabase
      .channel('executive-risk-bar')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_orders' }, loadRiskMetrics)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ncrs' }, loadRiskMetrics)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wo_external_moves' }, loadRiskMetrics)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const loadRiskMetrics = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const [workOrders, qcRecords, ncrs, machines, materialLots, externalMoves] = await Promise.all([
        supabase.from('work_orders').select('id, status, due_date').neq('status', 'completed').neq('status', 'shipped'),
        supabase.from('qc_records').select('id, qc_type, result'),
        supabase.from('ncrs').select('id, status, created_at'),
        supabase.from('machines').select('id, status'),
        supabase.from('material_lots').select('id, qc_status'),
        supabase.from('wo_external_moves').select('id, expected_return_date, returned_date, status')
      ]);

      const delayedWOs = (workOrders.data || []).filter(wo => wo.due_date && new Date(wo.due_date) < new Date()).length;
      const qcBlocking = (qcRecords.data || []).filter(qc => qc.qc_type === 'final' && (qc.result === 'pending' || qc.result === 'fail')).length;
      const sevenDaysAgo = new Date(); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const overdueNCRs = (ncrs.data || []).filter(ncr => ncr.status === 'OPEN' && new Date(ncr.created_at) < sevenDaysAgo).length;
      const maintenanceOverdue = (machines.data || []).filter(m => m.status === 'active' && m.next_maintenance_date && m.next_maintenance_date < today).length;
      const materialWaiting = (materialLots.data || []).filter(lot => lot.qc_status === 'pending').length;
      const externalDelayed = (externalMoves.data || []).filter(move => move.expected_return_date && move.expected_return_date < today && !move.returned_date && move.status !== 'returned').length;

      setMetrics({ workOrdersDelayed: delayedWOs, qcBlockingRelease: qcBlocking, ncrsOverdue: overdueNCRs, maintenanceOverdue, materialWaitingQC: materialWaiting, externalJobsDelayed: externalDelayed });
      setLoading(false);
    } catch (error) {
      console.error('Error loading risk metrics:', error);
      setLoading(false);
    }
  };

  const riskItems = [
    { label: 'WO Delayed', value: metrics.workOrdersDelayed, icon: Clock, route: '/work-orders?status=delayed', critical: true },
    { label: 'QC Blocking', value: metrics.qcBlockingRelease, icon: ClipboardX, route: '/final-qc', critical: true },
    { label: 'NCR Overdue', value: metrics.ncrsOverdue, icon: AlertTriangle, route: '/ncr?status=open', critical: true },
    { label: 'Maintenance', value: metrics.maintenanceOverdue, icon: Wrench, route: '/machine-status', critical: false },
    { label: 'Material QC', value: metrics.materialWaitingQC, icon: Package, route: '/qc/incoming', critical: false },
    { label: 'External Delayed', value: metrics.externalJobsDelayed, icon: Truck, route: '/partners', critical: true },
  ];

  const totalRisks = Object.values(metrics).reduce((sum, val) => sum + val, 0);

  if (loading) {
    return (
      <div className="bg-muted/30 border-b border-border/50 px-4 py-1.5">
        <div className="container mx-auto flex items-center gap-3">
          <div className="h-4 w-16 bg-muted animate-pulse rounded" />
          {[1, 2, 3, 4].map(i => <div key={i} className="h-5 w-20 bg-muted animate-pulse rounded" />)}
        </div>
      </div>
    );
  }

  return (
    <div className={cn(
      "border-b px-4 py-1.5 transition-colors",
      totalRisks === 0 ? "bg-emerald-500/5 border-emerald-500/10" : "bg-muted/30 border-border/50"
    )}>
      <div className="container mx-auto flex items-center gap-3">
        <div className={cn(
          "flex items-center gap-1.5 text-xs font-semibold shrink-0 px-2 py-0.5 rounded-full",
          totalRisks === 0 ? "text-emerald-600 bg-emerald-500/10" : "text-muted-foreground bg-muted/50"
        )}>
          {totalRisks === 0 ? (
            <><CheckCircle2 className="h-3 w-3" /> All Clear</>
          ) : (
            <><AlertTriangle className="h-3 w-3" /> {totalRisks} Risks</>
          )}
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto">
          {riskItems.map((item) => {
            const hasRisk = item.value > 0;
            const isCritical = item.critical && hasRisk;
            return (
              <button
                key={item.label}
                onClick={() => hasRisk && navigate(item.route)}
                className={cn(
                  "flex items-center gap-1.5 px-2 py-0.5 rounded text-xs transition-all whitespace-nowrap",
                  !hasRisk && "opacity-30",
                  hasRisk && "cursor-pointer hover:bg-muted/80",
                  isCritical && "bg-destructive/10 text-destructive font-medium",
                  !isCritical && hasRisk && "bg-amber-500/10 text-amber-700 dark:text-amber-400 font-medium"
                )}
              >
                <item.icon className="h-3 w-3" />
                <span>{item.label}</span>
                <span className={cn(
                  "font-bold text-[10px] min-w-[16px] text-center px-1 rounded",
                  isCritical && "bg-destructive text-destructive-foreground",
                  !isCritical && hasRisk && "bg-amber-500 text-white",
                  !hasRisk && "bg-muted text-muted-foreground"
                )}>
                  {item.value}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
