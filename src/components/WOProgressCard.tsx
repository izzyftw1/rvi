import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Package, TrendingUp, AlertTriangle, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface WOProgressCardProps {
  woId: string;
  targetQuantity: number;
  completedQuantity: number;
  scrapQuantity: number;
  progressPercentage: number;
  remainingQuantity: number;
}

interface ProductionStats {
  completedToday: number;
  avgRatePerHour: number;
  scrapReasons: { reason: string; count: number }[];
}

export function WOProgressCard({
  woId,
  targetQuantity,
  completedQuantity,
  scrapQuantity,
  progressPercentage,
  remainingQuantity,
}: WOProgressCardProps) {
  const netCompleted = completedQuantity - scrapQuantity;
  const [stats, setStats] = useState<ProductionStats>({
    completedToday: 0,
    avgRatePerHour: 0,
    scrapReasons: []
  });
  const [animatedProgress, setAnimatedProgress] = useState(0);

  useEffect(() => {
    loadProductionStats();
    
    // Animate progress bar
    const timer = setTimeout(() => {
      setAnimatedProgress(progressPercentage);
    }, 100);

    // Real-time subscription for production logs
    const channel = supabase
      .channel('production_progress')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'production_logs',
          filter: `wo_id=eq.${woId}`
        },
        () => {
          loadProductionStats();
        }
      )
      .subscribe();

    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [woId, progressPercentage]);

  const loadProductionStats = async () => {
    try {
      // Get today's production
      const today = new Date().toISOString().split('T')[0];
      const { data: todayLogs } = await supabase
        .from('production_logs')
        .select('quantity_completed, quantity_scrap, remarks, log_timestamp')
        .eq('wo_id', woId)
        .gte('log_timestamp', today);

      const completedToday = todayLogs?.reduce((sum, log) => sum + (log.quantity_completed || 0), 0) || 0;
      
      // Calculate average rate (pieces per hour)
      const hoursWorked = todayLogs?.reduce((sum, log) => {
        return sum + ((log as any).planned_minutes || 60) / 60;
      }, 0) || 1;
      const avgRatePerHour = completedToday / hoursWorked;

      // Aggregate scrap reasons from remarks
      const scrapMap = new Map<string, number>();
      todayLogs?.forEach(log => {
        if (log.quantity_scrap && log.remarks) {
          const current = scrapMap.get(log.remarks) || 0;
          scrapMap.set(log.remarks, current + log.quantity_scrap);
        }
      });

      const scrapReasons = Array.from(scrapMap.entries())
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      setStats({ completedToday, avgRatePerHour, scrapReasons });
    } catch (error) {
      console.error('Error loading production stats:', error);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          Production Progress
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Progress</span>
            <span className="font-semibold">{progressPercentage.toFixed(1)}%</span>
          </div>
          <Progress 
            value={animatedProgress} 
            className="h-3 transition-all duration-1000 ease-out" 
          />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <Package className="h-4 w-4" />
                    Target
                  </div>
                  <div className="text-2xl font-bold">{targetQuantity.toLocaleString()}</div>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Total quantity required</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <div className="space-y-1">
                  <div className="text-muted-foreground text-sm">Completed</div>
                  <div className="text-2xl font-bold text-green-600">
                    {completedQuantity.toLocaleString()}
                  </div>
                  {stats.completedToday > 0 && (
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      +{stats.completedToday} today
                    </div>
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <div className="space-y-1">
                  <p>Total completed: {completedQuantity.toLocaleString()}</p>
                  <p>Completed today: {stats.completedToday.toLocaleString()}</p>
                  <p>Avg rate: {stats.avgRatePerHour.toFixed(1)} pcs/hr</p>
                </div>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <AlertTriangle className="h-4 w-4" />
                    Scrap
                  </div>
                  <div className="text-2xl font-bold">
                    <Badge variant="destructive">{scrapQuantity.toLocaleString()}</Badge>
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <div className="space-y-1">
                  <p className="font-semibold">Top Scrap Reasons:</p>
                  {stats.scrapReasons.length > 0 ? (
                    stats.scrapReasons.map((sr, i) => (
                      <p key={i} className="text-xs">
                        {sr.reason}: {sr.count} pcs
                      </p>
                    ))
                  ) : (
                    <p className="text-xs text-muted-foreground">No scrap data</p>
                  )}
                </div>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <div className="space-y-1">
                  <div className="text-muted-foreground text-sm">Remaining</div>
                  <div className="text-2xl font-bold text-blue-600">
                    {remainingQuantity.toLocaleString()}
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Pieces yet to be produced</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        <div className="pt-2 border-t">
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Net Completed (after scrap)</span>
            <span className="text-lg font-semibold">{netCompleted.toLocaleString()} pcs</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
