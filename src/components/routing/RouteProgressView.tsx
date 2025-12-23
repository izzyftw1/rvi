import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  Loader2, CheckCircle2, Circle, AlertTriangle, Clock, 
  TrendingDown, AlertOctagon, Timer
} from "lucide-react";
import { formatCount, formatPercent } from "@/lib/displayUtils";

interface RouteProgress {
  route_id: string;
  work_order_id: string;
  sequence_number: number;
  operation_type: string;
  process_name: string | null;
  is_external: boolean;
  is_mandatory: boolean;
  planned_quantity: number;
  actual_ok_qty: number;
  total_rejections: number;
  total_downtime_mins: number;
  total_runtime_mins: number;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  last_activity_date: string | null;
  log_count: number;
  bottleneck_type: string | null;
  progress_pct: number;
}

interface RouteProgressViewProps {
  workOrderId: string;
  compact?: boolean;
}

const OPERATION_LABELS: Record<string, string> = {
  'RAW_MATERIAL': 'Raw Material',
  'CNC': 'CNC / Machining',
  'QC': 'Quality Check',
  'EXTERNAL_PROCESS': 'External Process',
  'PACKING': 'Packing',
  'DISPATCH': 'Dispatch',
};

const BOTTLENECK_CONFIG = {
  quality_issue: {
    icon: AlertOctagon,
    label: 'Quality Issue',
    color: 'text-destructive',
    bg: 'bg-destructive/10',
    border: 'border-destructive/50',
    description: 'High rejection rate (>10%)',
  },
  downtime_issue: {
    icon: Timer,
    label: 'Downtime Issue',
    color: 'text-amber-600',
    bg: 'bg-amber-50 dark:bg-amber-900/20',
    border: 'border-amber-500/50',
    description: 'High downtime (>30%)',
  },
  slow_progress: {
    icon: TrendingDown,
    label: 'Slow Progress',
    color: 'text-orange-600',
    bg: 'bg-orange-50 dark:bg-orange-900/20',
    border: 'border-orange-500/50',
    description: 'Behind schedule',
  },
};

export function RouteProgressView({ workOrderId, compact = false }: RouteProgressViewProps) {
  const [loading, setLoading] = useState(true);
  const [routeProgress, setRouteProgress] = useState<RouteProgress[]>([]);
  const [hasBottleneck, setHasBottleneck] = useState(false);

  useEffect(() => {
    loadRouteProgress();
    
    // Subscribe to changes
    const channel = supabase
      .channel(`route-progress-${workOrderId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'daily_production_logs', filter: `wo_id=eq.${workOrderId}` },
        () => loadRouteProgress()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'operation_routes', filter: `work_order_id=eq.${workOrderId}` },
        () => loadRouteProgress()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [workOrderId]);

  const loadRouteProgress = async () => {
    try {
      const { data, error } = await supabase
        .from("operation_route_progress_vw")
        .select("*")
        .eq("work_order_id", workOrderId)
        .order("sequence_number");

      if (error) throw error;
      
      setRouteProgress((data || []) as RouteProgress[]);
      setHasBottleneck((data || []).some((r: RouteProgress) => r.bottleneck_type !== null));
    } catch (error) {
      console.error("Error loading route progress:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (routeProgress.length === 0) {
    return null;
  }

  const getStatusIcon = (status: string, bottleneck: string | null) => {
    if (bottleneck) {
      const config = BOTTLENECK_CONFIG[bottleneck as keyof typeof BOTTLENECK_CONFIG];
      const Icon = config?.icon || AlertTriangle;
      return <Icon className={`h-4 w-4 ${config?.color || 'text-amber-500'}`} />;
    }
    
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'in_progress':
        return <Clock className="h-4 w-4 text-blue-500" />;
      default:
        return <Circle className="h-4 w-4 text-muted-foreground" />;
    }
  };

  if (compact) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        {hasBottleneck && (
          <Badge variant="outline" className="border-amber-500 text-amber-600 bg-amber-50 dark:bg-amber-900/20">
            <AlertTriangle className="h-3 w-3 mr-1" />
            Bottleneck detected
          </Badge>
        )}
        <div className="flex items-center gap-1">
          {routeProgress.map((rp) => (
            <div
              key={rp.route_id}
              className="relative group cursor-pointer"
              title={`${OPERATION_LABELS[rp.operation_type] || rp.operation_type}: ${rp.progress_pct}% - ${rp.actual_ok_qty}/${rp.planned_quantity} pcs`}
            >
              {getStatusIcon(rp.status, rp.bottleneck_type)}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Route Progress - Planned vs Actual</CardTitle>
          {hasBottleneck && (
            <Badge variant="outline" className="border-amber-500 text-amber-600 bg-amber-50 dark:bg-amber-900/20">
              <AlertTriangle className="h-3 w-3 mr-1" />
              Bottleneck
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {routeProgress.map((rp) => {
            const bottleneckConfig = rp.bottleneck_type 
              ? BOTTLENECK_CONFIG[rp.bottleneck_type] 
              : null;
            
            return (
              <div
                key={rp.route_id}
                className={`p-3 rounded-lg border ${
                  bottleneckConfig 
                    ? `${bottleneckConfig.bg} ${bottleneckConfig.border}` 
                    : rp.status === 'completed'
                      ? 'border-green-300 bg-green-50 dark:border-green-700 dark:bg-green-900/20'
                      : rp.status === 'in_progress'
                        ? 'border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-900/20'
                        : 'border-muted'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-background text-sm font-semibold border">
                    {rp.sequence_number}
                  </div>
                  
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">
                          {OPERATION_LABELS[rp.operation_type] || rp.operation_type}
                        </span>
                        {rp.process_name && (
                          <span className="text-muted-foreground text-sm">
                            ({rp.process_name})
                          </span>
                        )}
                        {rp.is_external && (
                          <Badge variant="outline" className="text-xs">External</Badge>
                        )}
                        {!rp.is_mandatory && (
                          <Badge variant="secondary" className="text-xs">Optional</Badge>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-2">
                        {getStatusIcon(rp.status, rp.bottleneck_type)}
                        <span className="text-sm font-medium capitalize">
                          {rp.status.replace('_', ' ')}
                        </span>
                      </div>
                    </div>
                    
                    {/* Progress bar with planned vs actual */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>
                          Actual: {formatCount(rp.actual_ok_qty)} / Planned: {formatCount(rp.planned_quantity)} pcs
                        </span>
                        <span>{formatPercent(rp.progress_pct / 100)}</span>
                      </div>
                      <Progress 
                        value={Math.min(rp.progress_pct, 100)} 
                        className="h-2"
                      />
                    </div>
                    
                    {/* Bottleneck indicator */}
                    {bottleneckConfig && (
                      <div className={`flex items-center gap-2 text-xs ${bottleneckConfig.color}`}>
                        <bottleneckConfig.icon className="h-3 w-3" />
                        <span className="font-medium">{bottleneckConfig.label}:</span>
                        <span>{bottleneckConfig.description}</span>
                      </div>
                    )}
                    
                    {/* Stats row */}
                    {(rp.total_rejections > 0 || rp.total_downtime_mins > 0) && (
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        {rp.total_rejections > 0 && (
                          <span className="text-destructive">
                            Rejections: {formatCount(rp.total_rejections)}
                          </span>
                        )}
                        {rp.total_downtime_mins > 0 && (
                          <span className="text-amber-600">
                            Downtime: {rp.total_downtime_mins} min
                          </span>
                        )}
                        {rp.log_count > 0 && (
                          <span>
                            {rp.log_count} log{rp.log_count !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
