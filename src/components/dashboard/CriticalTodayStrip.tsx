/**
 * CriticalTodayStrip - Compact top alert bar
 * Only visible when critical items exist. Single clean row.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, FileWarning, ShieldAlert, Truck, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { differenceInHours, differenceInDays, parseISO } from "date-fns";

interface CriticalItem {
  key: string;
  label: string;
  count: number;
  age: string;
  icon: React.ElementType;
  route: string;
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
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const loadCriticalItems = async () => {
    try {
      const now = new Date();
      const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const todayStr = now.toISOString().split('T')[0];

      const [ncrs, qcRecords, externalMoves] = await Promise.all([
        supabase.from('ncrs').select('id, work_order_id, created_at, status')
          .in('status', ['OPEN', 'ACTION_IN_PROGRESS']).not('work_order_id', 'is', null),
        supabase.from('qc_records').select('id, created_at, result')
          .eq('result', 'pending').lt('created_at', twentyFourHoursAgo.toISOString()),
        supabase.from('wo_external_moves').select('id, expected_return_date')
          .eq('status', 'sent').lt('expected_return_date', todayStr),
      ]);

      const criticalItems: CriticalItem[] = [];

      const blockingNcrs = ncrs.data || [];
      if (blockingNcrs.length > 0) {
        const oldest = blockingNcrs.reduce((o, n) => new Date(n.created_at) < new Date(o.created_at) ? n : o);
        const days = differenceInDays(now, parseISO(oldest.created_at));
        criticalItems.push({
          key: 'ncrs', label: 'NCRs Blocking WOs', count: blockingNcrs.length,
          age: days > 0 ? `${days}d` : '<1d', icon: FileWarning, route: '/ncr?status=open'
        });
      }

      const staleQc = qcRecords.data || [];
      if (staleQc.length > 0) {
        const oldest = staleQc.reduce((o, q) => new Date(q.created_at) < new Date(o.created_at) ? q : o);
        const hours = differenceInHours(now, parseISO(oldest.created_at));
        criticalItems.push({
          key: 'qc', label: 'QC Holds >24h', count: staleQc.length,
          age: hours >= 24 ? `${Math.floor(hours / 24)}d` : `${hours}h`, icon: ShieldAlert, route: '/quality?filter=pending'
        });
      }

      const overdueExt = externalMoves.data || [];
      if (overdueExt.length > 0) {
        const oldest = overdueExt.reduce((o, m) => 
          (m.expected_return_date && o.expected_return_date && m.expected_return_date < o.expected_return_date) ? m : o
        );
        const days = oldest.expected_return_date ? differenceInDays(now, parseISO(oldest.expected_return_date)) : 0;
        criticalItems.push({
          key: 'external', label: 'External Overdue', count: overdueExt.length,
          age: `${days}d`, icon: Truck, route: '/partners?filter=overdue'
        });
      }

      setItems(criticalItems);
      setLoading(false);
    } catch (error) {
      console.error('Error loading critical items:', error);
      setLoading(false);
    }
  };

  if (loading || items.length === 0) return null;

  const totalCount = items.reduce((sum, item) => sum + item.count, 0);

  return (
    <div className="bg-destructive/5 border-b border-destructive/20">
      <div className="container mx-auto px-4 py-1.5">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-destructive text-xs font-semibold shrink-0">
            <AlertTriangle className="h-3.5 w-3.5" />
            <span>{totalCount} Critical</span>
          </div>

          <div className="h-3 w-px bg-destructive/20" />

          <div className="flex items-center gap-2 overflow-x-auto">
            {items.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.key}
                  onClick={() => navigate(item.route)}
                  className="flex items-center gap-2 px-2.5 py-1 rounded-md text-xs bg-destructive/10 hover:bg-destructive/15 transition-colors whitespace-nowrap"
                >
                  <Icon className="h-3.5 w-3.5 text-destructive" />
                  <span className="font-medium text-foreground">{item.count}</span>
                  <span className="text-muted-foreground">{item.label}</span>
                  <span className="text-[10px] text-destructive/70 flex items-center gap-0.5">
                    <Clock className="h-2.5 w-2.5" />
                    {item.age}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
