import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertTriangle, Clock, Trash2, RefreshCw, TrendingDown, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

interface LossData {
  scrapPcs: number;
  reworkPcs: number;
  reworkHours: number;
  delayedPcs: number;
  delayedOrders: number;
  avgDelayDays: number;
}

export const LossImpactIndicator = () => {
  const navigate = useNavigate();
  const [lossData, setLossData] = useState<LossData>({
    scrapPcs: 0,
    reworkPcs: 0,
    reworkHours: 0,
    delayedPcs: 0,
    delayedOrders: 0,
    avgDelayDays: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLossData();
    
    const channel = supabase
      .channel('loss-impact-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_production_logs' }, () => loadLossData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_orders' }, () => loadLossData())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadLossData = async () => {
    try {
      const today = new Date();
      const sevenDaysAgo = new Date(today);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const todayStr = today.toISOString().split('T')[0];
      const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];

      // Fetch production logs for scrap and rework (last 7 days)
      const { data: productionLogs } = await supabase
        .from('daily_production_logs')
        .select('total_rejection_quantity, rework_quantity, cycle_time_seconds')
        .gte('log_date', sevenDaysAgoStr);

      // Fetch delayed work orders (past due date, not completed)
      const { data: delayedOrders } = await supabase
        .from('work_orders')
        .select('id, quantity, due_date')
        .lt('due_date', todayStr)
        .not('status', 'in', '("Completed","Shipped","Cancelled")');

      // Calculate scrap and rework
      let scrapPcs = 0;
      let reworkPcs = 0;
      let reworkHours = 0;

      if (productionLogs) {
        productionLogs.forEach(log => {
          scrapPcs += log.total_rejection_quantity || 0;
          reworkPcs += log.rework_quantity || 0;
          // Estimate rework time as 50% of cycle time per rework piece
          const cycleTimeHours = ((log.cycle_time_seconds || 30) / 3600) * 0.5;
          reworkHours += (log.rework_quantity || 0) * cycleTimeHours;
        });
      }

      // Calculate delayed metrics
      let delayedPcs = 0;
      let totalDelayDays = 0;

      if (delayedOrders) {
        delayedOrders.forEach(order => {
          delayedPcs += order.quantity || 0;
          if (order.due_date) {
            const dueDate = new Date(order.due_date);
            const daysDiff = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
            totalDelayDays += Math.max(0, daysDiff);
          }
        });
      }

      const avgDelayDays = delayedOrders?.length ? totalDelayDays / delayedOrders.length : 0;

      setLossData({
        scrapPcs,
        reworkPcs,
        reworkHours: Math.round(reworkHours * 10) / 10,
        delayedPcs,
        delayedOrders: delayedOrders?.length || 0,
        avgDelayDays: Math.round(avgDelayDays)
      });
    } catch (error) {
      console.error('Error loading loss data:', error);
    } finally {
      setLoading(false);
    }
  };

  const hasLosses = lossData.scrapPcs > 0 || lossData.reworkHours > 0 || lossData.delayedPcs > 0;

  if (loading) {
    return null;
  }

  if (!hasLosses) {
    return null; // Don't show if no losses
  }

  const lossItems = [
    {
      key: 'scrap',
      show: lossData.scrapPcs > 0,
      icon: Trash2,
      value: lossData.scrapPcs,
      label: 'Scrap',
      unit: 'pcs',
      sublabel: '7-day total',
      severity: lossData.scrapPcs > 100 ? 'high' : lossData.scrapPcs > 50 ? 'medium' : 'low',
      owner: 'Quality',
      onClick: () => navigate('/quality-analytics')
    },
    {
      key: 'rework',
      show: lossData.reworkHours > 0,
      icon: RefreshCw,
      value: lossData.reworkHours,
      label: 'Rework',
      unit: 'hrs',
      sublabel: `${lossData.reworkPcs} pcs affected`,
      severity: lossData.reworkHours > 20 ? 'high' : lossData.reworkHours > 10 ? 'medium' : 'low',
      owner: 'Production',
      onClick: () => navigate('/quality-analytics')
    },
    {
      key: 'delayed',
      show: lossData.delayedPcs > 0,
      icon: Clock,
      value: lossData.delayedPcs,
      label: 'Delayed',
      unit: 'pcs',
      sublabel: `${lossData.delayedOrders} orders • Avg ${lossData.avgDelayDays}d`,
      severity: lossData.avgDelayDays > 7 ? 'high' : lossData.avgDelayDays > 3 ? 'medium' : 'low',
      owner: 'Planning',
      onClick: () => navigate('/work-orders?filter=overdue')
    }
  ].filter(item => item.show);

  const getSeverityStyles = (severity: string) => {
    switch (severity) {
      case 'high':
        return {
          bg: 'bg-destructive/10',
          border: 'border-destructive/30',
          text: 'text-destructive',
          icon: 'text-destructive',
          pulse: true
        };
      case 'medium':
        return {
          bg: 'bg-amber-500/10',
          border: 'border-amber-500/30',
          text: 'text-amber-600 dark:text-amber-400',
          icon: 'text-amber-500',
          pulse: false
        };
      default:
        return {
          bg: 'bg-muted/50',
          border: 'border-border',
          text: 'text-muted-foreground',
          icon: 'text-muted-foreground',
          pulse: false
        };
    }
  };

  const worstSeverity = lossItems.reduce((worst, item) => {
    if (item.severity === 'high') return 'high';
    if (item.severity === 'medium' && worst !== 'high') return 'medium';
    return worst;
  }, 'low');

  return (
    <TooltipProvider>
      <Card className={cn(
        "border-l-4 transition-all",
        worstSeverity === 'high' && "border-l-destructive bg-destructive/5",
        worstSeverity === 'medium' && "border-l-amber-500 bg-amber-500/5",
        worstSeverity === 'low' && "border-l-muted-foreground"
      )}>
        <CardContent className="py-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <TrendingDown className={cn(
                "h-4 w-4",
                worstSeverity === 'high' ? "text-destructive" : 
                worstSeverity === 'medium' ? "text-amber-500" : "text-muted-foreground"
              )} />
              <h3 className="text-sm font-semibold">Loss Impact</h3>
              <Badge variant="outline" className="text-[9px] h-4">
                7-day
              </Badge>
            </div>
            {worstSeverity === 'high' && (
              <Badge variant="destructive" className="gap-1 text-[10px] animate-pulse">
                <AlertTriangle className="h-3 w-3" />
                Escalate
              </Badge>
            )}
          </div>

          <div className={cn(
            "grid gap-3",
            lossItems.length === 1 && "grid-cols-1",
            lossItems.length === 2 && "grid-cols-2",
            lossItems.length === 3 && "grid-cols-3"
          )}>
            {lossItems.map(item => {
              const styles = getSeverityStyles(item.severity);
              const Icon = item.icon;

              return (
                <Tooltip key={item.key}>
                  <TooltipTrigger asChild>
                    <div 
                      className={cn(
                        "flex flex-col items-center justify-center p-3 rounded-lg border cursor-pointer transition-all hover:shadow-md",
                        styles.bg,
                        styles.border,
                        styles.pulse && "animate-pulse"
                      )}
                      onClick={item.onClick}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Icon className={cn("h-4 w-4", styles.icon)} />
                        <span className={cn("text-2xl font-bold", styles.text)}>
                          {item.value.toLocaleString()}
                        </span>
                        <span className="text-xs text-muted-foreground">{item.unit}</span>
                      </div>
                      <p className={cn("text-xs font-medium", styles.text)}>{item.label}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{item.sublabel}</p>
                      <div className="flex items-center gap-1 mt-1.5 text-[9px] text-muted-foreground">
                        <User className="h-2.5 w-2.5" />
                        <span>{item.owner}</span>
                      </div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">Click to view details in {item.label === 'Delayed' ? 'Work Orders' : 'Quality Analytics'}</p>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
};