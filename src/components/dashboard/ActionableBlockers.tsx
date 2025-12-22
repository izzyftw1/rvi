/**
 * ActionableBlockers - Decision-First Component
 * 
 * Shows the top blocked items that need immediate action, with:
 * - Owner department
 * - Impact indicator (days overdue, financial risk)
 * - Single-click navigation to resolve
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  AlertTriangle, 
  Clock, 
  Factory, 
  ShieldAlert, 
  Truck,
  ArrowRight,
  User,
  DollarSign
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow, parseISO, differenceInDays } from "date-fns";

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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wo_external_moves' }, loadBlockedItems)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'qc_records' }, loadBlockedItems)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadBlockedItems = async () => {
    try {
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];

      // Fetch work orders with potential blocks
      const { data: workOrders } = await supabase
        .from('work_orders')
        .select('id, display_id, due_date, current_stage, qc_material_passed, qc_first_piece_passed, status, customer, quantity, net_weight_per_pc')
        .neq('status', 'completed')
        .neq('status', 'shipped')
        .order('due_date', { ascending: true })
        .limit(50);

      // Fetch external moves with pending status
      const { data: externalMoves } = await supabase
        .from('wo_external_moves')
        .select('work_order_id, expected_return_date, process')
        .eq('status', 'sent');

      const externalPendingMap = new Map<string, { date: string; process: string }>();
      externalMoves?.forEach(m => {
        if (m.work_order_id && m.expected_return_date) {
          externalPendingMap.set(m.work_order_id, { 
            date: m.expected_return_date, 
            process: m.process 
          });
        }
      });

      const items: BlockedItem[] = [];

      workOrders?.forEach(wo => {
        const dueDate = wo.due_date ? parseISO(wo.due_date) : null;
        const daysUntilDue = dueDate ? differenceInDays(dueDate, today) : 999;
        const isOverdue = daysUntilDue < 0;
        const estValue = ((wo.quantity ?? 0) * (wo.net_weight_per_pc ?? 0) * 0.5).toFixed(0); // Rough estimate

        // Overdue orders
        if (isOverdue) {
          items.push({
            id: wo.id,
            display_id: wo.display_id || 'N/A',
            blockType: 'overdue',
            owner: 'Production',
            reason: `${Math.abs(daysUntilDue)} day${Math.abs(daysUntilDue) !== 1 ? 's' : ''} past due`,
            daysBlocked: Math.abs(daysUntilDue),
            estimatedImpact: `~$${estValue} at risk`,
            route: `/work-orders/${wo.id}`,
            urgency: daysUntilDue < -3 ? 'critical' : 'high'
          });
        }
        // External processing blocks
        else if (externalPendingMap.has(wo.id)) {
          const ext = externalPendingMap.get(wo.id)!;
          const extDue = parseISO(ext.date);
          const extDaysLate = differenceInDays(today, extDue);
          if (extDaysLate > 0 || daysUntilDue <= 7) {
            items.push({
              id: wo.id,
              display_id: wo.display_id || 'N/A',
              blockType: 'external',
              owner: 'Logistics',
              reason: `Waiting: ${ext.process}${extDaysLate > 0 ? ` (${extDaysLate}d late)` : ''}`,
              daysBlocked: Math.max(0, extDaysLate),
              estimatedImpact: daysUntilDue <= 3 ? 'Delivery at risk' : 'Monitor',
              route: `/work-orders/${wo.id}`,
              urgency: extDaysLate > 2 ? 'critical' : daysUntilDue <= 3 ? 'high' : 'medium'
            });
          }
        }
        // Quality blocks
        else if (!wo.qc_material_passed || !wo.qc_first_piece_passed) {
          if (daysUntilDue <= 7) {
            const qcType = !wo.qc_material_passed ? 'Material QC' : 'First Piece';
            items.push({
              id: wo.id,
              display_id: wo.display_id || 'N/A',
              blockType: 'quality',
              owner: 'Quality',
              reason: `Pending: ${qcType}`,
              daysBlocked: 0,
              estimatedImpact: daysUntilDue <= 3 ? 'Delivery at risk' : `Due in ${daysUntilDue}d`,
              route: !wo.qc_material_passed ? '/qc/incoming' : '/quality?tab=first-piece',
              urgency: daysUntilDue <= 2 ? 'critical' : daysUntilDue <= 5 ? 'high' : 'medium'
            });
          }
        }
        // Production blocks (early stages with tight deadline)
        else if (['goods_in', 'cutting', 'forging'].includes(wo.current_stage || '') && daysUntilDue <= 5) {
          items.push({
            id: wo.id,
            display_id: wo.display_id || 'N/A',
            blockType: 'production',
            owner: 'Production',
            reason: `At ${wo.current_stage?.replace('_', ' ')} stage`,
            daysBlocked: 0,
            estimatedImpact: `Due in ${daysUntilDue}d`,
            route: `/work-orders/${wo.id}`,
            urgency: daysUntilDue <= 2 ? 'critical' : 'high'
          });
        }
      });

      // Sort by urgency, then by days blocked
      items.sort((a, b) => {
        const urgencyOrder = { critical: 0, high: 1, medium: 2 };
        if (urgencyOrder[a.urgency] !== urgencyOrder[b.urgency]) {
          return urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
        }
        return b.daysBlocked - a.daysBlocked;
      });

      setBlockers(items.slice(0, 6));
      setLoading(false);
    } catch (error) {
      console.error('Error loading blocked items:', error);
      setLoading(false);
    }
  };

  const getBlockIcon = (type: string) => {
    switch (type) {
      case 'production': return Factory;
      case 'quality': return ShieldAlert;
      case 'external': return Truck;
      case 'overdue': return Clock;
      default: return AlertTriangle;
    }
  };

  const getBlockStyles = (type: string, urgency: string) => {
    const base = urgency === 'critical' ? 'ring-1 ring-destructive/40' : '';
    switch (type) {
      case 'production': return `${base} border-l-4 border-l-blue-500`;
      case 'quality': return `${base} border-l-4 border-l-amber-500`;
      case 'external': return `${base} border-l-4 border-l-purple-500`;
      case 'overdue': return `${base} border-l-4 border-l-destructive`;
      default: return base;
    }
  };

  const criticalCount = blockers.filter(b => b.urgency === 'critical').length;

  if (loading) {
    return (
      <Card>
        <CardContent className="p-4">
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-16 rounded bg-muted animate-pulse" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (blockers.length === 0) {
    return (
      <Card className="bg-emerald-500/5 border-emerald-500/20">
        <CardContent className="p-6 text-center">
          <div className="flex items-center justify-center gap-2 text-emerald-600 mb-2">
            <Clock className="h-5 w-5" />
            <span className="font-semibold">No Immediate Actions Required</span>
          </div>
          <p className="text-sm text-muted-foreground">
            All work orders are on track. Check the pipeline below for upcoming work.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="py-3 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <AlertTriangle className={cn(
              "h-4 w-4",
              criticalCount > 0 ? "text-destructive animate-pulse" : "text-amber-500"
            )} />
            Needs Your Decision
            {criticalCount > 0 && (
              <Badge variant="destructive" className="text-[10px]">
                {criticalCount} Critical
              </Badge>
            )}
          </CardTitle>
          <span className="text-xs text-muted-foreground">
            {blockers.length} item{blockers.length !== 1 ? 's' : ''} blocked
          </span>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0 space-y-2">
        {blockers.map((item) => {
          const Icon = getBlockIcon(item.blockType);
          return (
            <div
              key={item.id}
              className={cn(
                "flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 cursor-pointer transition-all",
                getBlockStyles(item.blockType, item.urgency)
              )}
              onClick={() => navigate(item.route)}
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <Icon className={cn(
                  "h-4 w-4 flex-shrink-0",
                  item.urgency === 'critical' ? "text-destructive" : 
                  item.urgency === 'high' ? "text-amber-500" : "text-muted-foreground"
                )} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{item.display_id}</span>
                    <Badge variant="outline" className="text-[9px] px-1.5 py-0">
                      <User className="h-2 w-2 mr-1" />
                      {item.owner}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{item.reason}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className={cn(
                  "text-[10px] px-2 py-0.5 rounded-full",
                  item.estimatedImpact.includes('risk') ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"
                )}>
                  {item.estimatedImpact}
                </span>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
};
