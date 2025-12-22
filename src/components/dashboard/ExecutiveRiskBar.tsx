import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { 
  AlertTriangle, 
  Clock, 
  ClipboardX, 
  Wrench, 
  Package, 
  Truck 
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

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
    workOrdersDelayed: 0,
    qcBlockingRelease: 0,
    ncrsOverdue: 0,
    maintenanceOverdue: 0,
    materialWaitingQC: 0,
    externalJobsDelayed: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRiskMetrics();

    const channel = supabase
      .channel('executive-risk-bar')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_orders' }, loadRiskMetrics)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'qc_records' }, loadRiskMetrics)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ncrs' }, loadRiskMetrics)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'maintenance_logs' }, loadRiskMetrics)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'material_lots' }, loadRiskMetrics)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wo_external_moves' }, loadRiskMetrics)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadRiskMetrics = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const [
        workOrders,
        qcRecords,
        ncrs,
        maintenanceLogs,
        machines,
        materialLots,
        externalMoves
      ] = await Promise.all([
        supabase.from('work_orders').select('id, status, due_date').neq('status', 'completed').neq('status', 'shipped'),
        supabase.from('qc_records').select('id, qc_type, result'),
        supabase.from('ncrs').select('id, status, created_at'),
        supabase.from('maintenance_logs').select('machine_id, created_at'),
        supabase.from('machines').select('id'),
        supabase.from('material_lots').select('id, qc_status'),
        supabase.from('wo_external_moves').select('id, expected_return_date, returned_date, status')
      ]);

      // Work Orders Delayed (past due date)
      const delayedWOs = (workOrders.data || []).filter(wo => {
        if (!wo.due_date) return false;
        return new Date(wo.due_date) < new Date();
      }).length;

      // QC Blocking Release (final QC pending or failed)
      const qcBlocking = (qcRecords.data || []).filter(qc => 
        qc.qc_type === 'final' && (qc.result === 'pending' || qc.result === 'fail')
      ).length;

      // NCRs Overdue (open NCRs older than 7 days)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const overdueNCRs = (ncrs.data || []).filter(ncr => 
        ncr.status === 'OPEN' && new Date(ncr.created_at) < sevenDaysAgo
      ).length;

      // Maintenance Overdue (machines without maintenance in 30 days)
      const recentMaintenance = new Set(
        (maintenanceLogs.data || [])
          .filter(m => new Date(m.created_at) > thirtyDaysAgo)
          .map(m => m.machine_id)
      );
      const maintenanceOverdue = (machines.data || []).filter(m => !recentMaintenance.has(m.id)).length;

      // Material Waiting QC
      const materialWaiting = (materialLots.data || []).filter(lot => lot.qc_status === 'pending').length;

      // External Jobs Delayed
      const externalDelayed = (externalMoves.data || []).filter(move => 
        move.expected_return_date && 
        move.expected_return_date < today && 
        !move.returned_date &&
        move.status !== 'returned'
      ).length;

      setMetrics({
        workOrdersDelayed: delayedWOs,
        qcBlockingRelease: qcBlocking,
        ncrsOverdue: overdueNCRs,
        maintenanceOverdue: maintenanceOverdue,
        materialWaitingQC: materialWaiting,
        externalJobsDelayed: externalDelayed
      });

      setLoading(false);
    } catch (error) {
      console.error('Error loading risk metrics:', error);
      setLoading(false);
    }
  };

  const riskItems = [
    {
      key: 'workOrdersDelayed',
      label: 'WO Delayed',
      value: metrics.workOrdersDelayed,
      icon: Clock,
      route: '/work-orders?status=delayed',
      severity: 'critical' as const,
      tooltip: 'Work orders past their due date',
      owner: 'Production'
    },
    {
      key: 'qcBlockingRelease',
      label: 'QC Blocking',
      value: metrics.qcBlockingRelease,
      icon: ClipboardX,
      route: '/final-qc',
      severity: 'critical' as const,
      tooltip: 'Final QC pending or failed, blocking release',
      owner: 'Quality'
    },
    {
      key: 'ncrsOverdue',
      label: 'NCR Overdue',
      value: metrics.ncrsOverdue,
      icon: AlertTriangle,
      route: '/ncr?status=open',
      severity: 'critical' as const,
      tooltip: 'Open NCRs older than 7 days',
      owner: 'Quality'
    },
    {
      key: 'maintenanceOverdue',
      label: 'Maintenance',
      value: metrics.maintenanceOverdue,
      icon: Wrench,
      route: '/machine-status',
      severity: 'warning' as const,
      tooltip: 'Machines without maintenance in 30 days',
      owner: 'Maintenance'
    },
    {
      key: 'materialWaitingQC',
      label: 'Material QC',
      value: metrics.materialWaitingQC,
      icon: Package,
      route: '/qc/incoming',
      severity: 'warning' as const,
      tooltip: 'Material lots pending QC approval',
      owner: 'Quality'
    },
    {
      key: 'externalJobsDelayed',
      label: 'External Delayed',
      value: metrics.externalJobsDelayed,
      icon: Truck,
      route: '/partners',
      severity: 'critical' as const,
      tooltip: 'External jobs past expected return date',
      owner: 'Logistics'
    }
  ];

  const totalRisks = Object.values(metrics).reduce((sum, val) => sum + val, 0);
  const hasCritical = metrics.workOrdersDelayed > 0 || metrics.qcBlockingRelease > 0 || 
                      metrics.ncrsOverdue > 0 || metrics.externalJobsDelayed > 0;

  if (loading) {
    return (
      <div className="bg-muted/50 border-b border-border px-4 py-2">
        <div className="container mx-auto flex items-center gap-4">
          <div className="h-4 w-20 bg-muted animate-pulse rounded" />
          <div className="flex-1 flex items-center gap-3">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="h-6 w-24 bg-muted animate-pulse rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn(
      "border-b px-4 py-2 transition-colors",
      totalRisks === 0 
        ? "bg-emerald-500/10 border-emerald-500/20" 
        : hasCritical 
          ? "bg-destructive/10 border-destructive/20" 
          : "bg-amber-500/10 border-amber-500/20"
    )}>
      <div className="container mx-auto flex items-center gap-4">
        {/* Risk Summary */}
        <div className={cn(
          "flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold",
          totalRisks === 0 
            ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"
            : hasCritical 
              ? "bg-destructive/20 text-destructive"
              : "bg-amber-500/20 text-amber-700 dark:text-amber-300"
        )}>
          {totalRisks === 0 ? (
            <>✓ All Clear</>
          ) : (
            <>
              <AlertTriangle className="h-3 w-3" />
              {totalRisks} Risk{totalRisks !== 1 ? 's' : ''}
            </>
          )}
        </div>

        {/* Risk Items */}
        <TooltipProvider>
          <div className="flex-1 flex items-center gap-2 overflow-x-auto">
            {riskItems.map((item) => {
              const hasRisk = item.value > 0;
              const isCritical = item.severity === 'critical' && hasRisk;
              const isWarning = item.severity === 'warning' && hasRisk;

              return (
                <Tooltip key={item.key}>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => hasRisk && navigate(item.route)}
                      className={cn(
                        "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all",
                        "hover:scale-105 active:scale-95",
                        !hasRisk && "opacity-40 cursor-default",
                        hasRisk && "cursor-pointer",
                        isCritical && "bg-destructive/20 text-destructive hover:bg-destructive/30",
                        isWarning && "bg-amber-500/20 text-amber-700 dark:text-amber-300 hover:bg-amber-500/30",
                        !hasRisk && "bg-muted/50 text-muted-foreground"
                      )}
                    >
                      <item.icon className={cn(
                        "h-3 w-3",
                        isCritical && "animate-pulse"
                      )} />
                      <span>{item.label}</span>
                      <span className={cn(
                        "px-1.5 py-0.5 rounded text-[10px] font-bold",
                        isCritical && "bg-destructive text-destructive-foreground",
                        isWarning && "bg-amber-500 text-white",
                        !hasRisk && "bg-muted text-muted-foreground"
                      )}>
                        {item.value}
                      </span>
                      {hasRisk && (
                        <span className="text-[9px] opacity-70 border-l border-current/20 pl-1.5 ml-0.5">
                          {item.owner}
                        </span>
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p>{item.tooltip}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">Owner: {item.owner}</p>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </TooltipProvider>
      </div>
    </div>
  );
};
