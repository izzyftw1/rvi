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
  orderedQuantity: number; // From work order
}

interface ProgressData {
  totalProduced: number;      // Sum of ok_quantity from all logs
  totalScrap: number;         // Sum of total_rejection_quantity from all logs
  netCompleted: number;       // totalProduced (ok_quantity is already net of rejections)
  remaining: number;          // orderedQuantity - netCompleted
  progressPercent: number;    // (netCompleted / orderedQuantity) * 100
  completedToday: number;     // Today's ok_quantity
  scrapToday: number;         // Today's rejections
  avgRatePerHour: number;     // Average production rate
  lastUpdated: string | null; // Last log timestamp
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

      // Get ALL production logs for this work order
      const { data: allLogs, error } = await supabase
        .from('daily_production_logs')
        .select(`
          log_date,
          ok_quantity,
          actual_quantity,
          total_rejection_quantity,
          actual_runtime_minutes,
          created_at
        `)
        .eq('wo_id', woId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Calculate totals from production logs
      // ok_quantity = pieces that passed (actual - rejections)
      // total_rejection_quantity = scrap
      const totalProduced = allLogs?.reduce((sum, log) => sum + (log.ok_quantity || 0), 0) || 0;
      const totalScrap = allLogs?.reduce((sum, log) => sum + (log.total_rejection_quantity || 0), 0) || 0;
      
      // Net completed is the ok_quantity (already excludes rejections)
      const netCompleted = totalProduced;
      const remaining = Math.max(0, orderedQuantity - netCompleted);
      const progressPercent = orderedQuantity > 0 ? (netCompleted / orderedQuantity) * 100 : 0;

      // Today's stats
      const todayLogs = allLogs?.filter(log => log.log_date === today) || [];
      const completedToday = todayLogs.reduce((sum, log) => sum + (log.ok_quantity || 0), 0);
      const scrapToday = todayLogs.reduce((sum, log) => sum + (log.total_rejection_quantity || 0), 0);

      // Calculate average rate per hour
      const totalRuntimeMinutes = allLogs?.reduce((sum, log) => sum + (log.actual_runtime_minutes || 0), 0) || 0;
      const totalRuntimeHours = totalRuntimeMinutes / 60;
      const avgRatePerHour = totalRuntimeHours > 0 ? totalProduced / totalRuntimeHours : 0;

      // Last updated timestamp
      const lastUpdated = allLogs?.[0]?.created_at || null;

      setProgress({
        totalProduced,
        totalScrap,
        netCompleted,
        remaining,
        progressPercent: Math.min(100, progressPercent), // Cap at 100%
        completedToday,
        scrapToday,
        avgRatePerHour,
        lastUpdated
      });
    } catch (error) {
      console.error('Error loading production progress:', error);
    } finally {
      setLoading(false);
    }
  }, [woId, orderedQuantity]);

  useEffect(() => {
    loadProgress();

    // Real-time subscription for production log changes
    const channel = supabase
      .channel(`wo_progress_realtime_${woId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'daily_production_logs',
          filter: `wo_id=eq.${woId}`
        },
        () => {
          // Reload progress when any production log changes
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
            Net Completed = OK Pieces (Scrap Deducted)
          </span>
          <span className="text-lg font-semibold">
            {progress.netCompleted.toLocaleString()} / {orderedQuantity.toLocaleString()}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
