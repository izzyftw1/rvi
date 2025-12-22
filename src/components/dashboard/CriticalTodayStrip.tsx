/**
 * CriticalTodayStrip - Top-priority alerts requiring immediate action
 * 
 * Only visible when count > 0 for any category.
 * Shows: NCRs blocking WOs, QC Holds > 24h, External overdue beyond SLA, Maintenance blocking production
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { 
  AlertTriangle, 
  FileWarning, 
  ShieldAlert, 
  Truck, 
  Wrench,
  Clock,
  User
} from "lucide-react";
import { cn } from "@/lib/utils";
import { differenceInHours, differenceInDays, parseISO } from "date-fns";

interface CriticalItem {
  key: string;
  label: string;
  count: number;
  oldestAge: string;
  icon: React.ElementType;
  route: string;
  owner: string;
}

export const CriticalTodayStrip = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState<CriticalItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCriticalItems();

    const channel = supabase
      .channel('critical-today-strip')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ncrs' }, loadCriticalItems)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'qc_records' }, loadCriticalItems)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wo_external_moves' }, loadCriticalItems)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'maintenance_logs' }, loadCriticalItems)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'machines' }, loadCriticalItems)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadCriticalItems = async () => {
    try {
      const now = new Date();
      const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const todayStr = now.toISOString().split('T')[0];

      const [ncrs, qcRecords, externalMoves, maintenanceLogs, machines, workOrders] = await Promise.all([
        // NCRs that are open and linked to work orders
        supabase
          .from('ncrs')
          .select('id, work_order_id, created_at, status')
          .in('status', ['OPEN', 'ACTION_IN_PROGRESS'])
          .not('work_order_id', 'is', null),
        
        // QC records pending for > 24 hours
        supabase
          .from('qc_records')
          .select('id, created_at, result, qc_type')
          .eq('result', 'pending')
          .lt('created_at', twentyFourHoursAgo.toISOString()),
        
        // External moves overdue beyond expected return date
        supabase
          .from('wo_external_moves')
          .select('id, expected_return_date, dispatch_date')
          .eq('status', 'sent')
          .lt('expected_return_date', todayStr),
        
        // Maintenance logs - get recent ones
        supabase
          .from('maintenance_logs')
          .select('machine_id, created_at, end_time')
          .is('end_time', null),
        
        // All machines with running status
        supabase
          .from('machines')
          .select('id, status, current_wo_id'),
        
        // Work orders in progress
        supabase
          .from('work_orders')
          .select('id, status')
          .eq('status', 'in_progress')
      ]);

      const criticalItems: CriticalItem[] = [];

      // 1. NCRs blocking Work Orders
      const blockingNcrs = ncrs.data || [];
      if (blockingNcrs.length > 0) {
        const oldestNcr = blockingNcrs.reduce((oldest, ncr) => 
          new Date(ncr.created_at) < new Date(oldest.created_at) ? ncr : oldest
        );
        const daysOld = differenceInDays(now, parseISO(oldestNcr.created_at));
        criticalItems.push({
          key: 'ncrs_blocking',
          label: 'NCRs Blocking WOs',
          count: blockingNcrs.length,
          oldestAge: daysOld > 0 ? `${daysOld}d old` : 'Today',
          icon: FileWarning,
          route: '/ncr-management?status=open',
          owner: 'Quality'
        });
      }

      // 2. QC Holds > 24 hours
      const staleQcHolds = qcRecords.data || [];
      if (staleQcHolds.length > 0) {
        const oldestQc = staleQcHolds.reduce((oldest, qc) => 
          new Date(qc.created_at) < new Date(oldest.created_at) ? qc : oldest
        );
        const hoursOld = differenceInHours(now, parseISO(oldestQc.created_at));
        const daysOld = Math.floor(hoursOld / 24);
        criticalItems.push({
          key: 'qc_holds',
          label: 'QC Holds >24h',
          count: staleQcHolds.length,
          oldestAge: daysOld > 0 ? `${daysOld}d ${hoursOld % 24}h` : `${hoursOld}h`,
          icon: ShieldAlert,
          route: '/quality?filter=pending',
          owner: 'Quality'
        });
      }

      // 3. External Jobs overdue beyond SLA
      const overdueExternal = externalMoves.data || [];
      if (overdueExternal.length > 0) {
        const oldestOverdue = overdueExternal.reduce((oldest, move) => {
          if (!move.expected_return_date || !oldest.expected_return_date) return oldest;
          return move.expected_return_date < oldest.expected_return_date ? move : oldest;
        });
        const daysOverdue = oldestOverdue.expected_return_date 
          ? differenceInDays(now, parseISO(oldestOverdue.expected_return_date))
          : 0;
        criticalItems.push({
          key: 'external_overdue',
          label: 'External Overdue',
          count: overdueExternal.length,
          oldestAge: `${daysOverdue}d late`,
          icon: Truck,
          route: '/partners?filter=overdue',
          owner: 'Logistics'
        });
      }

      // 4. Maintenance issues blocking production
      // Machines that are down (maintenance in progress with no end time) and have active WOs
      const activeMaintenanceMachines = new Set(
        (maintenanceLogs.data || []).map(m => m.machine_id)
      );
      const blockedByMaintenance = (machines.data || []).filter(m => 
        activeMaintenanceMachines.has(m.id) && m.current_wo_id
      );
      
      if (blockedByMaintenance.length > 0) {
        // Find oldest maintenance log for these machines
        const relevantLogs = (maintenanceLogs.data || []).filter(log => 
          blockedByMaintenance.some(m => m.id === log.machine_id)
        );
        let oldestAge = 'Today';
        if (relevantLogs.length > 0) {
          const oldestLog = relevantLogs.reduce((oldest, log) => 
            new Date(log.created_at) < new Date(oldest.created_at) ? log : oldest
          );
          const hoursDown = differenceInHours(now, parseISO(oldestLog.created_at));
          oldestAge = hoursDown >= 24 ? `${Math.floor(hoursDown / 24)}d ${hoursDown % 24}h` : `${hoursDown}h`;
        }
        
        criticalItems.push({
          key: 'maintenance_blocking',
          label: 'Maintenance Blocking',
          count: blockedByMaintenance.length,
          oldestAge,
          icon: Wrench,
          route: '/machine-status?filter=maintenance',
          owner: 'Maintenance'
        });
      }

      setItems(criticalItems);
      setLoading(false);
    } catch (error) {
      console.error('Error loading critical items:', error);
      setLoading(false);
    }
  };

  // Hide entirely when no critical items
  if (loading || items.length === 0) {
    return null;
  }

  const totalCount = items.reduce((sum, item) => sum + item.count, 0);

  return (
    <div className="bg-destructive/10 border-b border-destructive/30">
      <div className="container mx-auto px-4 py-2">
        <div className="flex items-center gap-4">
          {/* Header */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-destructive text-destructive-foreground text-xs font-bold animate-pulse">
            <AlertTriangle className="h-3 w-3" />
            CRITICAL TODAY
          </div>

          {/* Cards */}
          <div className="flex-1 flex items-center gap-3 overflow-x-auto">
            {items.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.key}
                  onClick={() => navigate(item.route)}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-lg transition-all",
                    "bg-background/80 hover:bg-background border border-destructive/30 hover:border-destructive/50",
                    "hover:scale-[1.02] active:scale-[0.98]"
                  )}
                >
                  <Icon className="h-4 w-4 text-destructive" />
                  <div className="text-left">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-destructive">{item.count}</span>
                      <span className="text-xs text-foreground">{item.label}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-2.5 w-2.5" />
                        {item.oldestAge}
                      </span>
                      <span className="flex items-center gap-1 border-l border-muted-foreground/30 pl-2">
                        <User className="h-2.5 w-2.5" />
                        {item.owner}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Total */}
          <div className="text-xs text-destructive font-medium px-2">
            {totalCount} issue{totalCount !== 1 ? 's' : ''}
          </div>
        </div>
      </div>
    </div>
  );
};
