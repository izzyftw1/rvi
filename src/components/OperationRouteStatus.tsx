import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, Circle, AlertTriangle, Clock } from "lucide-react";
import type { OperationType } from "@/hooks/useExecutionRecord";

interface OperationRoute {
  id: string;
  sequence_number: number;
  operation_type: OperationType;
  process_name: string | null;
  is_external: boolean;
  is_mandatory: boolean;
}

interface ExecutionRecord {
  id: string;
  operation_type: OperationType;
  process_name: string | null;
  quantity: number;
  direction: string;
  out_of_sequence: boolean;
  created_at: string;
}

interface RouteStepStatus {
  route: OperationRoute;
  status: 'pending' | 'activity_detected' | 'out_of_sequence';
  executionCount: number;
  totalQuantity: number;
}

interface OperationRouteStatusProps {
  workOrderId: string;
  compact?: boolean;
}

const OPERATION_LABELS: Record<OperationType, string> = {
  'RAW_MATERIAL': 'Raw Material',
  'CNC': 'CNC / Machining',
  'QC': 'Quality Check',
  'EXTERNAL_PROCESS': 'External Process',
  'PACKING': 'Packing',
  'DISPATCH': 'Dispatch',
};

export function OperationRouteStatus({ workOrderId, compact = false }: OperationRouteStatusProps) {
  const [loading, setLoading] = useState(true);
  const [routeStatuses, setRouteStatuses] = useState<RouteStepStatus[]>([]);
  const [hasOutOfSequence, setHasOutOfSequence] = useState(false);

  useEffect(() => {
    loadRouteStatus();
    
    // Subscribe to execution_records changes
    const channel = supabase
      .channel(`route-status-${workOrderId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'execution_records', filter: `work_order_id=eq.${workOrderId}` },
        () => loadRouteStatus()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'operation_routes', filter: `work_order_id=eq.${workOrderId}` },
        () => loadRouteStatus()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [workOrderId]);

  const loadRouteStatus = async () => {
    try {
      // Load routes
      const { data: routes, error: routesError } = await supabase
        .from("operation_routes")
        .select("*")
        .eq("work_order_id", workOrderId)
        .order("sequence_number");

      if (routesError) throw routesError;

      // Load execution records
      const { data: executions, error: execError } = await supabase
        .from("execution_records")
        .select("*")
        .eq("work_order_id", workOrderId)
        .order("created_at");

      if (execError) throw execError;

      // Calculate status for each route step
      const statuses: RouteStepStatus[] = (routes || []).map((route: OperationRoute, index: number) => {
        // Find matching executions
        const matchingExecs = (executions || []).filter((exec: ExecutionRecord) => {
          const typeMatch = exec.operation_type === route.operation_type;
          const processMatch = !route.process_name || exec.process_name === route.process_name;
          return typeMatch && processMatch;
        });

        const executionCount = matchingExecs.length;
        const totalQuantity = matchingExecs.reduce((sum: number, e: ExecutionRecord) => sum + (e.quantity || 0), 0);

        // Check if this step has activity before previous mandatory steps
        let isOutOfSequence = false;
        if (executionCount > 0) {
          // Check all previous mandatory steps
          for (let i = 0; i < index; i++) {
            const prevRoute = routes[i] as OperationRoute;
            if (prevRoute.is_mandatory) {
              const prevExecs = (executions || []).filter((exec: ExecutionRecord) => {
                const typeMatch = exec.operation_type === prevRoute.operation_type;
                const processMatch = !prevRoute.process_name || exec.process_name === prevRoute.process_name;
                return typeMatch && processMatch;
              });
              if (prevExecs.length === 0) {
                isOutOfSequence = true;
                break;
              }
            }
          }
        }

        let status: 'pending' | 'activity_detected' | 'out_of_sequence' = 'pending';
        if (executionCount > 0) {
          status = isOutOfSequence ? 'out_of_sequence' : 'activity_detected';
        }

        return {
          route,
          status,
          executionCount,
          totalQuantity,
        };
      });

      setRouteStatuses(statuses);
      setHasOutOfSequence(statuses.some(s => s.status === 'out_of_sequence'));
    } catch (error) {
      console.error("Error loading route status:", error);
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

  if (routeStatuses.length === 0) {
    return null;
  }

  if (compact) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        {hasOutOfSequence && (
          <Badge variant="outline" className="border-amber-500 text-amber-600 bg-amber-50 dark:bg-amber-900/20">
            <AlertTriangle className="h-3 w-3 mr-1" />
            Out-of-sequence activity
          </Badge>
        )}
        <div className="flex items-center gap-1">
          {routeStatuses.map((rs) => (
            <div
              key={rs.route.id}
              className="relative group"
              title={`${OPERATION_LABELS[rs.route.operation_type]}${rs.route.process_name ? ` (${rs.route.process_name})` : ''}: ${rs.status.replace('_', ' ')}`}
            >
              {rs.status === 'pending' && (
                <Circle className="h-4 w-4 text-muted-foreground" />
              )}
              {rs.status === 'activity_detected' && (
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              )}
              {rs.status === 'out_of_sequence' && (
                <AlertTriangle className="h-4 w-4 text-amber-500" />
              )}
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
          <CardTitle className="text-base">Route Progress</CardTitle>
          {hasOutOfSequence && (
            <Badge variant="outline" className="border-amber-500 text-amber-600 bg-amber-50 dark:bg-amber-900/20">
              <AlertTriangle className="h-3 w-3 mr-1" />
              Out-of-sequence
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {routeStatuses.map((rs) => (
            <div
              key={rs.route.id}
              className={`flex items-center gap-3 p-2 rounded-lg border ${
                rs.status === 'out_of_sequence' 
                  ? 'border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/20' 
                  : rs.status === 'activity_detected'
                    ? 'border-green-300 bg-green-50 dark:border-green-700 dark:bg-green-900/20'
                    : 'border-muted'
              }`}
            >
              <div className="flex items-center justify-center w-6 h-6 rounded-full bg-muted text-xs font-medium">
                {rs.route.sequence_number}
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">
                    {OPERATION_LABELS[rs.route.operation_type]}
                  </span>
                  {rs.route.process_name && (
                    <span className="text-xs text-muted-foreground">
                      ({rs.route.process_name})
                    </span>
                  )}
                </div>
                {rs.executionCount > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {rs.executionCount} record{rs.executionCount !== 1 ? 's' : ''} • {rs.totalQuantity} total
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2">
                {rs.status === 'pending' && (
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    <span className="text-xs">Pending</span>
                  </div>
                )}
                {rs.status === 'activity_detected' && (
                  <div className="flex items-center gap-1 text-green-600">
                    <CheckCircle2 className="h-4 w-4" />
                    <span className="text-xs">Activity</span>
                  </div>
                )}
                {rs.status === 'out_of_sequence' && (
                  <div className="flex items-center gap-1 text-amber-600">
                    <AlertTriangle className="h-4 w-4" />
                    <span className="text-xs">Out of sequence</span>
                  </div>
                )}
                {!rs.route.is_mandatory && (
                  <Badge variant="outline" className="text-xs">Optional</Badge>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
