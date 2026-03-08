/**
 * ActionableBlockers - Top blocked items needing immediate action
 * Clean, scannable list with proper ₹ currency formatting.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Clock, Factory, ShieldAlert, Truck, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { parseISO, differenceInDays } from "date-fns";

interface BlockedItem {
  id: string;
  display_id: string;
  blockType: 'production' | 'quality' | 'external' | 'overdue';
  owner: string;
  reason: string;
  daysBlocked: number;
  estimatedImpact: string;
  route: string;
  urgency: 'critical' | 'high' | 'medium';
}

export const ActionableBlockers = () => {
  const navigate = useNavigate();
  const [blockers, setBlockers] = useState<BlockedItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadBlockedItems();
    const channel = supabase
      .channel('actionable-blockers')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_orders' }, loadBlockedItems)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'production_batches' }, loadBlockedItems)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const loadBlockedItems = async () => {
    try {
      const today = new Date();

      const [woResult, batchResult, extResult] = await Promise.all([
        supabase.from('work_orders_restricted')
          .select('id, display_id, due_date, qc_material_passed, qc_first_piece_passed, status, quantity, net_weight_per_pc')
          .neq('status', 'completed').neq('status', 'shipped')
          .order('due_date', { ascending: true }).limit(50),
        supabase.from('production_batches')
          .select('wo_id, stage_type').is('ended_at', null),
        supabase.from('external_movements')
          .select('work_order_id, expected_return_date, process_type').eq('status', 'sent'),
      ]);

      const batchesByWO = new Map<string, string[]>();
      batchResult.data?.forEach((b: any) => {
        const existing = batchesByWO.get(b.wo_id) || [];
        existing.push(b.stage_type);
        batchesByWO.set(b.wo_id, existing);
      });

      const extMap = new Map<string, { date: string; process: string }>();
      extResult.data?.forEach(m => {
        if (m.work_order_id && m.expected_return_date) {
          extMap.set(m.work_order_id, { date: m.expected_return_date, process: m.process_type });
        }
      });

      const items: BlockedItem[] = [];

      woResult.data?.forEach(wo => {
        const dueDate = wo.due_date ? parseISO(wo.due_date) : null;
        const daysUntilDue = dueDate ? differenceInDays(dueDate, today) : 999;
        const isOverdue = daysUntilDue < 0;
        const estValue = Math.round((wo.quantity ?? 0) * (wo.net_weight_per_pc ?? 0) * 50);
        const impactStr = estValue > 0 ? `~₹${estValue.toLocaleString('en-IN')} at risk` : '';

        if (isOverdue) {
          items.push({
            id: wo.id, display_id: wo.display_id || 'N/A', blockType: 'overdue',
            owner: 'Production', reason: `${Math.abs(daysUntilDue)}d past due`,
            daysBlocked: Math.abs(daysUntilDue), estimatedImpact: impactStr,
            route: `/work-orders/${wo.id}`, urgency: daysUntilDue < -3 ? 'critical' : 'high'
          });
        } else if ((batchesByWO.get(wo.id) || []).includes('external') || extMap.has(wo.id)) {
          const ext = extMap.get(wo.id);
          const extDaysLate = ext ? differenceInDays(today, parseISO(ext.date)) : 0;
          if (extDaysLate > 0 || daysUntilDue <= 7) {
            items.push({
              id: wo.id, display_id: wo.display_id || 'N/A', blockType: 'external',
              owner: 'Logistics', reason: `Waiting: ${ext?.process || 'External'}${extDaysLate > 0 ? ` (${extDaysLate}d late)` : ''}`,
              daysBlocked: Math.max(0, extDaysLate), estimatedImpact: daysUntilDue <= 3 ? 'Delivery at risk' : '',
              route: `/work-orders/${wo.id}`, urgency: extDaysLate > 2 ? 'critical' : 'high'
            });
          }
        } else if ((!wo.qc_material_passed || !wo.qc_first_piece_passed) && daysUntilDue <= 7) {
          items.push({
            id: wo.id, display_id: wo.display_id || 'N/A', blockType: 'quality',
            owner: 'Quality', reason: `Pending: ${!wo.qc_material_passed ? 'Material QC' : 'First Piece'}`,
            daysBlocked: 0, estimatedImpact: daysUntilDue <= 3 ? 'Delivery at risk' : `Due in ${daysUntilDue}d`,
            route: !wo.qc_material_passed ? '/qc/incoming' : '/quality?tab=first-piece',
            urgency: daysUntilDue <= 2 ? 'critical' : 'high'
          });
        }
      });

      items.sort((a, b) => {
        const order = { critical: 0, high: 1, medium: 2 };
        return order[a.urgency] !== order[b.urgency] ? order[a.urgency] - order[b.urgency] : b.daysBlocked - a.daysBlocked;
      });

      setBlockers(items.slice(0, 5));
      setLoading(false);
    } catch (error) {
      console.error('Error loading blocked items:', error);
      setLoading(false);
    }
  };

  const blockIcon = { production: Factory, quality: ShieldAlert, external: Truck, overdue: Clock };
  const blockBorder = { production: 'border-l-blue-500', quality: 'border-l-amber-500', external: 'border-l-violet-500', overdue: 'border-l-destructive' };

  const criticalCount = blockers.filter(b => b.urgency === 'critical').length;

  if (loading) {
    return <Card><CardContent className="p-4"><div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-14 rounded bg-muted animate-pulse" />)}</div></CardContent></Card>;
  }

  if (blockers.length === 0) {
    return (
      <Card className="bg-emerald-500/5 border-emerald-500/20">
        <CardContent className="p-5 text-center">
          <div className="flex items-center justify-center gap-2 text-emerald-600">
            <Clock className="h-4 w-4" />
            <span className="font-medium text-sm">No Immediate Actions Required</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">All work orders are on track.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="py-3 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <AlertTriangle className={cn("h-4 w-4", criticalCount > 0 ? "text-destructive" : "text-amber-500")} />
            Needs Your Decision
            {criticalCount > 0 && <Badge variant="destructive" className="text-[10px]">{criticalCount} Critical</Badge>}
          </CardTitle>
          <span className="text-xs text-muted-foreground">{blockers.length} blocked</span>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0 space-y-1.5">
        {blockers.map((item) => {
          const Icon = blockIcon[item.blockType];
          return (
            <div
              key={item.id}
              className={cn(
                "flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 cursor-pointer transition-colors border-l-4",
                blockBorder[item.blockType],
                item.urgency === 'critical' && "ring-1 ring-destructive/20"
              )}
              onClick={() => navigate(item.route)}
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <Icon className={cn("h-4 w-4 shrink-0", item.urgency === 'critical' ? "text-destructive" : "text-amber-500")} />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{item.display_id}</span>
                    <span className="text-[10px] text-muted-foreground px-1.5 py-0.5 bg-muted rounded">{item.owner}</span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{item.reason}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-2">
                {item.estimatedImpact && (
                  <span className={cn(
                    "text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap",
                    item.estimatedImpact.includes('risk') ? "bg-destructive/10 text-destructive" : "text-muted-foreground"
                  )}>
                    {item.estimatedImpact}
                  </span>
                )}
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
};
