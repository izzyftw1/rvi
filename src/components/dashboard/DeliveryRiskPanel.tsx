import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  Calendar, 
  AlertTriangle, 
  Factory, 
  ShieldAlert, 
  ExternalLink as ExternalLinkIcon,
  Clock,
  TrendingUp,
  ArrowRight,
  User
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { addDays, format, parseISO } from "date-fns";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface DeliveryRisk {
  due3Days: number;
  due7Days: number;
  blockedByProduction: number;
  blockedByQuality: number;
  blockedByExternal: number;
  externalPendingWOs: Set<string>; // Track WO IDs to avoid double counting
}

interface BlockedOrder {
  id: string;
  display_id: string;
  due_date: string;
  blockReason: 'production' | 'quality' | 'external';
  owner: string;
}

export const DeliveryRiskPanel = () => {
  const navigate = useNavigate();
  const [risk, setRisk] = useState<DeliveryRisk>({
    due3Days: 0,
    due7Days: 0,
    blockedByProduction: 0,
    blockedByQuality: 0,
    blockedByExternal: 0,
    externalPendingWOs: new Set()
  });
  const [blockedOrders, setBlockedOrders] = useState<BlockedOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDeliveryRisk = async () => {
      setLoading(true);
      const today = new Date();
      const in3Days = format(addDays(today, 3), 'yyyy-MM-dd');
      const in7Days = format(addDays(today, 7), 'yyyy-MM-dd');
      const todayStr = format(today, 'yyyy-MM-dd');

      try {
        // Fetch work orders due in the next 7 days that are not completed
        const { data: upcomingOrders } = await supabase
          .from('work_orders')
          .select('id, display_id, due_date, current_stage, qc_material_passed, qc_first_piece_passed, status')
          .gte('due_date', todayStr)
          .lte('due_date', in7Days)
          .neq('status', 'completed')
          .neq('status', 'shipped');

        // Fetch external moves that are pending for these work orders
        const { data: externalMoves } = await supabase
          .from('wo_external_moves')
          .select('work_order_id')
          .eq('status', 'sent');

        const externalPendingWOs = new Set<string>(
          externalMoves?.map(m => m.work_order_id) || []
        );

        // Categorize orders
        let due3Days = 0;
        let due7Days = 0;
        let blockedByProduction = 0;
        let blockedByQuality = 0;
        let blockedByExternal = 0;
        const blocked: BlockedOrder[] = [];

        upcomingOrders?.forEach(order => {
          const dueDate = order.due_date;
          
          // Count by due window
          if (dueDate <= in3Days) {
            due3Days++;
          }
          due7Days++; // All are within 7 days

          // Determine blocking reason (prioritized)
          // External processing blocks take priority (tracked separately)
          if (externalPendingWOs.has(order.id)) {
            blockedByExternal++;
            blocked.push({
              id: order.id,
              display_id: order.display_id || 'N/A',
              due_date: dueDate,
              blockReason: 'external',
              owner: 'Logistics'
            });
          }
          // Quality blocks
          else if (!order.qc_material_passed || !order.qc_first_piece_passed) {
            blockedByQuality++;
            blocked.push({
              id: order.id,
              display_id: order.display_id || 'N/A',
              due_date: dueDate,
              blockReason: 'quality',
              owner: 'Quality'
            });
          }
          // Production blocks (early stages)
          else if (['goods_in', 'cutting', 'forging', 'production'].includes(order.current_stage || '')) {
            blockedByProduction++;
            blocked.push({
              id: order.id,
              display_id: order.display_id || 'N/A',
              due_date: dueDate,
              blockReason: 'production',
              owner: 'Production'
            });
          }
        });

        setRisk({
          due3Days,
          due7Days,
          blockedByProduction,
          blockedByQuality,
          blockedByExternal,
          externalPendingWOs
        });

        // Sort by due date and take top 5
        setBlockedOrders(
          blocked
            .sort((a, b) => a.due_date.localeCompare(b.due_date))
            .slice(0, 5)
        );
      } catch (error) {
        console.error('Error fetching delivery risk:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchDeliveryRisk();

    // Realtime subscription
    const channel = supabase
      .channel('delivery-risk-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_orders' }, () => fetchDeliveryRisk())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wo_external_moves' }, () => fetchDeliveryRisk())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const totalBlocked = risk.blockedByProduction + risk.blockedByQuality + risk.blockedByExternal;
  const riskLevel = risk.due3Days > 5 || totalBlocked > 3 ? 'critical' : 
                    risk.due3Days > 2 || totalBlocked > 1 ? 'warning' : 'ok';

  const getBlockIcon = (reason: string) => {
    switch (reason) {
      case 'production': return Factory;
      case 'quality': return ShieldAlert;
      case 'external': return ExternalLinkIcon;
      default: return Clock;
    }
  };

  const getBlockColor = (reason: string) => {
    switch (reason) {
      case 'production': return 'text-blue-600 bg-blue-100 dark:bg-blue-900/30';
      case 'quality': return 'text-amber-600 bg-amber-100 dark:bg-amber-900/30';
      case 'external': return 'text-purple-600 bg-purple-100 dark:bg-purple-900/30';
      default: return 'text-muted-foreground bg-muted';
    }
  };

  return (
    <TooltipProvider>
      <Card className={cn(
        riskLevel === 'critical' && "ring-1 ring-destructive/30",
        riskLevel === 'warning' && "ring-1 ring-amber-500/30"
      )}>
        <CardHeader className="py-3 px-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className={cn(
                "h-4 w-4",
                riskLevel === 'critical' ? "text-destructive" :
                riskLevel === 'warning' ? "text-amber-500" : "text-emerald-500"
              )} />
              Delivery Risk Outlook
              {riskLevel === 'critical' && (
                <Badge variant="destructive" className="text-[10px] animate-pulse">
                  At Risk
                </Badge>
              )}
            </CardTitle>
            <button
              onClick={() => navigate('/work-orders?view=upcoming')}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              All Orders <ArrowRight className="h-3 w-3" />
            </button>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0">
          {loading ? (
            <div className="h-32 flex items-center justify-center">
              <Clock className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-4">
              {/* Due date windows */}
              <div className="grid grid-cols-2 gap-3">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div 
                      className={cn(
                        "rounded-lg p-3 cursor-pointer transition-all hover:scale-[1.02]",
                        risk.due3Days > 3 ? "bg-destructive/10" : 
                        risk.due3Days > 0 ? "bg-amber-500/10" : "bg-muted/50"
                      )}
                      onClick={() => navigate('/work-orders?due=3days')}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Calendar className={cn(
                          "h-4 w-4",
                          risk.due3Days > 3 ? "text-destructive" : 
                          risk.due3Days > 0 ? "text-amber-600" : "text-muted-foreground"
                        )} />
                        <span className="text-xs text-muted-foreground">Due in 3 Days</span>
                      </div>
                      <div className={cn(
                        "text-2xl font-bold",
                        risk.due3Days > 3 ? "text-destructive" : 
                        risk.due3Days > 0 ? "text-amber-600" : "text-muted-foreground"
                      )}>
                        {risk.due3Days}
                      </div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>Orders due within 72 hours</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <div 
                      className="rounded-lg p-3 bg-muted/50 cursor-pointer transition-all hover:scale-[1.02]"
                      onClick={() => navigate('/work-orders?due=7days')}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">Due in 7 Days</span>
                      </div>
                      <div className="text-2xl font-bold text-foreground">
                        {risk.due7Days}
                      </div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>Orders due within 1 week</TooltipContent>
                </Tooltip>
              </div>

              {/* Blocking reasons breakdown */}
              {totalBlocked > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      Blocked Orders ({totalBlocked})
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-3 gap-2">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div 
                          className={cn(
                            "rounded p-2 text-center cursor-pointer transition-all hover:scale-105",
                            risk.blockedByProduction > 0 
                              ? "bg-blue-500/10" 
                              : "bg-muted/30 opacity-50"
                          )}
                          onClick={() => navigate('/work-orders?blocked=production')}
                        >
                          <Factory className={cn(
                            "h-3 w-3 mx-auto mb-1",
                            risk.blockedByProduction > 0 ? "text-blue-600" : "text-muted-foreground"
                          )} />
                          <div className={cn(
                            "text-lg font-bold",
                            risk.blockedByProduction > 0 ? "text-blue-600" : "text-muted-foreground"
                          )}>
                            {risk.blockedByProduction}
                          </div>
                          <p className="text-[9px] text-muted-foreground">Production</p>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>{risk.blockedByProduction} orders blocked by production</TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div 
                          className={cn(
                            "rounded p-2 text-center cursor-pointer transition-all hover:scale-105",
                            risk.blockedByQuality > 0 
                              ? "bg-amber-500/10" 
                              : "bg-muted/30 opacity-50"
                          )}
                          onClick={() => navigate('/work-orders?blocked=quality')}
                        >
                          <ShieldAlert className={cn(
                            "h-3 w-3 mx-auto mb-1",
                            risk.blockedByQuality > 0 ? "text-amber-600" : "text-muted-foreground"
                          )} />
                          <div className={cn(
                            "text-lg font-bold",
                            risk.blockedByQuality > 0 ? "text-amber-600" : "text-muted-foreground"
                          )}>
                            {risk.blockedByQuality}
                          </div>
                          <p className="text-[9px] text-muted-foreground">Quality</p>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>{risk.blockedByQuality} orders blocked by quality</TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div 
                          className={cn(
                            "rounded p-2 text-center cursor-pointer transition-all hover:scale-105",
                            risk.blockedByExternal > 0 
                              ? "bg-purple-500/10" 
                              : "bg-muted/30 opacity-50"
                          )}
                          onClick={() => navigate('/work-orders?blocked=external')}
                        >
                          <ExternalLinkIcon className={cn(
                            "h-3 w-3 mx-auto mb-1",
                            risk.blockedByExternal > 0 ? "text-purple-600" : "text-muted-foreground"
                          )} />
                          <div className={cn(
                            "text-lg font-bold",
                            risk.blockedByExternal > 0 ? "text-purple-600" : "text-muted-foreground"
                          )}>
                            {risk.blockedByExternal}
                          </div>
                          <p className="text-[9px] text-muted-foreground">External</p>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>{risk.blockedByExternal} orders blocked by external processing</TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              )}

              {/* Top at-risk orders */}
              {blockedOrders.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                    Priority Follow-up
                  </p>
                  {blockedOrders.slice(0, 3).map(order => {
                    const BlockIcon = getBlockIcon(order.blockReason);
                    return (
                      <div
                        key={order.id}
                        className="flex items-center justify-between py-1.5 px-2 rounded bg-muted/30 hover:bg-muted/50 cursor-pointer transition-colors"
                        onClick={() => navigate(`/work-orders/${order.id}`)}
                      >
                        <div className="flex items-center gap-2">
                          <div className={cn(
                            "p-1 rounded",
                            getBlockColor(order.blockReason)
                          )}>
                            <BlockIcon className="h-3 w-3" />
                          </div>
                          <span className="text-xs font-medium">{order.display_id}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[9px] capitalize">
                            {order.blockReason}
                          </Badge>
                          <span className="text-[9px] text-muted-foreground flex items-center gap-0.5">
                            <User className="h-2 w-2" />
                            {order.owner}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {format(parseISO(order.due_date), 'dd MMM')}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* All clear state */}
              {risk.due7Days === 0 && (
                <div className="text-center py-4">
                  <Calendar className="h-8 w-8 mx-auto mb-2 text-emerald-500" />
                  <p className="text-sm text-muted-foreground">No orders due in the next 7 days</p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </TooltipProvider>
  );
};
