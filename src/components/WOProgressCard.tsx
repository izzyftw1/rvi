import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Package, TrendingUp, AlertTriangle, Clock, CheckCircle2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface WOProgressCardProps {
  woId: string;
  orderedQuantity: number;
}

interface ProgressData {
  totalProduced: number;      // qty_completed from work_orders (synced from logs)
  totalScrap: number;         // qty_rejected from work_orders (synced from logs)
  netCompleted: number;       // Same as totalProduced (ok_quantity)
  remaining: number;          // qty_remaining from work_orders (generated column)
  progressPercent: number;    // completion_pct from work_orders (generated column)
  completedToday: number;     // Today's ok_quantity from logs
  scrapToday: number;         // Today's rejections from logs
  avgRatePerHour: number;     // Average production rate from logs
  lastUpdated: string | null;
}

export function WOProgressCard({ woId, orderedQuantity }: WOProgressCardProps) {
  const [progress, setProgress] = useState<ProgressData>({
    totalProduced: 0,
    totalScrap: 0,
    netCompleted: 0,
    remaining: orderedQuantity,
    progressPercent: 0,
    completedToday: 0,
    scrapToday: 0,
    avgRatePerHour: 0,
    lastUpdated: null
  });
  const [loading, setLoading] = useState(true);
  const [animatedProgress, setAnimatedProgress] = useState(0);

  const loadProgress = useCallback(async () => {
    try {
      const today = new Date().toISOString().split('T')[0];

      // Get cached progress from work_orders (single source of truth)
      const { data: wo, error: woError } = await supabase
        .from('work_orders')
        .select('qty_completed, qty_rejected, qty_remaining, completion_pct, updated_at')
        .eq('id', woId)
        .single();

      if (woError) throw woError;

      // Get today's stats and avg rate from logs (for display only)
      const { data: todayLogs } = await supabase
        .from('daily_production_logs')
        .select('ok_quantity, total_rejection_quantity, actual_runtime_minutes, created_at')
        .eq('wo_id', woId)
        .eq('log_date', today);

      const { data: allLogs } = await supabase
        .from('daily_production_logs')
        .select('ok_quantity, actual_runtime_minutes, created_at')
        .eq('wo_id', woId)
        .order('created_at', { ascending: false })
        .limit(1);

      const completedToday = todayLogs?.reduce((sum, log) => sum + (log.ok_quantity || 0), 0) || 0;
      const scrapToday = todayLogs?.reduce((sum, log) => sum + (log.total_rejection_quantity || 0), 0) || 0;

      // Calculate avg rate from all logs
      const { data: runtimeData } = await supabase
        .from('daily_production_logs')
        .select('actual_runtime_minutes')
        .eq('wo_id', woId);

      const totalRuntimeMinutes = runtimeData?.reduce((sum, log) => sum + (log.actual_runtime_minutes || 0), 0) || 0;
      const totalRuntimeHours = totalRuntimeMinutes / 60;
      const avgRatePerHour = totalRuntimeHours > 0 ? (wo?.qty_completed || 0) / totalRuntimeHours : 0;

      setProgress({
        totalProduced: wo?.qty_completed || 0,
        totalScrap: wo?.qty_rejected || 0,
        netCompleted: wo?.qty_completed || 0,
        remaining: wo?.qty_remaining || orderedQuantity,
        progressPercent: Math.min(100, wo?.completion_pct || 0),
        completedToday,
        scrapToday,
        avgRatePerHour,
        lastUpdated: allLogs?.[0]?.created_at || wo?.updated_at || null
      });
    } catch (error) {
      console.error('Error loading production progress:', error);
    } finally {
      setLoading(false);
    }
  }, [woId, orderedQuantity]);

  useEffect(() => {
    loadProgress();

    // Real-time subscription for work_orders changes (triggered by production log sync)
    const channel = supabase
      .channel(`wo_progress_realtime_${woId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'work_orders',
          filter: `id=eq.${woId}`
        },
        () => {
          loadProgress();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [woId, loadProgress]);

  // Animate progress bar
  useEffect(() => {
    const timer = setTimeout(() => {
      setAnimatedProgress(progress.progressPercent);
    }, 100);
    return () => clearTimeout(timer);
  }, [progress.progressPercent]);

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const scrapRate = progress.totalProduced > 0 
    ? ((progress.totalScrap / (progress.totalProduced + progress.totalScrap)) * 100).toFixed(1)
    : '0';

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Production Progress
          </span>
          {progress.lastUpdated && (
            <span className="text-xs font-normal text-muted-foreground">
              Updated {new Date(progress.lastUpdated).toLocaleTimeString()}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Progress</span>
            <span className="font-semibold">{progress.progressPercent.toFixed(1)}%</span>
          </div>
          <Progress 
            value={animatedProgress} 
            className="h-3 transition-all duration-1000 ease-out" 
          />
        </div>

        {/* Main Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <TooltipProvider>
            {/* Target */}
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <Package className="h-4 w-4" />
                    Target
                  </div>
                  <div className="text-2xl font-bold">{orderedQuantity.toLocaleString()}</div>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Total ordered quantity</p>
              </TooltipContent>
            </Tooltip>

            {/* Completed */}
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <CheckCircle2 className="h-4 w-4" />
                    Completed
                  </div>
                  <div className="text-2xl font-bold text-green-600">
                    {progress.netCompleted.toLocaleString()}
                  </div>
                  {progress.completedToday > 0 && (
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      +{progress.completedToday} today
                    </div>
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <div className="space-y-1">
                  <p>Net completed (OK pieces): {progress.netCompleted.toLocaleString()}</p>
                  <p>Completed today: {progress.completedToday.toLocaleString()}</p>
                  <p>Avg rate: {progress.avgRatePerHour.toFixed(1)} pcs/hr</p>
                </div>
              </TooltipContent>
            </Tooltip>

            {/* Scrap */}
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <AlertTriangle className="h-4 w-4" />
                    Scrap
                  </div>
                  <div className="text-2xl font-bold">
                    <Badge variant={progress.totalScrap > 0 ? "destructive" : "secondary"}>
                      {progress.totalScrap.toLocaleString()}
                    </Badge>
                  </div>
                  {progress.scrapToday > 0 && (
                    <div className="text-xs text-red-500 flex items-center gap-1">
                      +{progress.scrapToday} today
                    </div>
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <div className="space-y-1">
                  <p>Total scrap: {progress.totalScrap.toLocaleString()} pcs</p>
                  <p>Scrap rate: {scrapRate}%</p>
                  <p>Scrap today: {progress.scrapToday} pcs</p>
                </div>
              </TooltipContent>
            </Tooltip>

            {/* Remaining */}
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="space-y-1">
                  <div className="text-muted-foreground text-sm">Remaining</div>
                  <div className="text-2xl font-bold text-blue-600">
                    {progress.remaining.toLocaleString()}
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Pieces yet to be produced</p>
                {progress.avgRatePerHour > 0 && progress.remaining > 0 && (
                  <p className="text-xs mt-1">
                    Est. {Math.ceil(progress.remaining / progress.avgRatePerHour)} hrs remaining
                  </p>
                )}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* Summary Footer */}
        <div className="pt-2 border-t flex justify-between items-center">
          <span className="text-sm text-muted-foreground">
            Synced from Production Logs
          </span>
          <span className="text-lg font-semibold">
            {progress.netCompleted.toLocaleString()} / {orderedQuantity.toLocaleString()}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
