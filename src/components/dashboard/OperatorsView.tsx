/**
 * OperatorsView - Live Operator Efficiency Snapshot
 * 
 * Shows:
 * - Live efficiency snapshot
 * - Active vs idle operators
 * 
 * All values derived from Production Logs.
 */
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import {
  Users,
  UserCheck,
  UserX,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  Clock,
  Target
} from "lucide-react";
import { cn } from "@/lib/utils";

interface OperatorData {
  id: string;
  name: string;
  isActive: boolean;
  okQuantity: number;
  targetQuantity: number;
  rejectionQuantity: number;
  efficiencyPct: number;
  runtimeMinutes: number;
  logsToday: number;
}

interface OperatorsViewProps {
  productionLogs: any[];
  operators: any[];
}

export const OperatorsView = ({ productionLogs, operators }: OperatorsViewProps) => {
  const navigate = useNavigate();

  const today = new Date().toISOString().split('T')[0];

  // Aggregate today's logs per operator
  const operatorData = useMemo<OperatorData[]>(() => {
    const logsByOperator = new Map<string, {
      okQty: number;
      targetQty: number;
      rejectionQty: number;
      runtime: number;
      logs: number;
    }>();

    productionLogs
      .filter(log => log.log_date === today && log.operator_id)
      .forEach(log => {
        const existing = logsByOperator.get(log.operator_id) || {
          okQty: 0,
          targetQty: 0,
          rejectionQty: 0,
          runtime: 0,
          logs: 0,
        };
        existing.okQty += log.ok_quantity || 0;
        existing.targetQty += log.target_quantity || 0;
        existing.rejectionQty += log.total_rejection_quantity || 0;
        existing.runtime += log.actual_runtime_minutes || 0;
        existing.logs++;
        logsByOperator.set(log.operator_id, existing);
      });

    // Build operator data with names
    const operatorMap = new Map(operators.map(o => [o.id, o.full_name || o.name || 'Unknown']));

    const activeOperatorIds = new Set(logsByOperator.keys());

    // All operators with their data
    const allOperators: OperatorData[] = operators.map(op => {
      const logs = logsByOperator.get(op.id);
      const isActive = activeOperatorIds.has(op.id);

      const okQuantity = logs?.okQty || 0;
      const targetQuantity = logs?.targetQty || 0;
      const rejectionQuantity = logs?.rejectionQty || 0;
      const efficiencyPct = targetQuantity > 0 ? (okQuantity / targetQuantity) * 100 : 0;

      return {
        id: op.id,
        name: op.full_name || op.name || 'Unknown',
        isActive,
        okQuantity,
        targetQuantity,
        rejectionQuantity,
        efficiencyPct,
        runtimeMinutes: logs?.runtime || 0,
        logsToday: logs?.logs || 0,
      };
    });

    // Sort: active first, then by efficiency
    return allOperators.sort((a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      return b.efficiencyPct - a.efficiencyPct;
    });
  }, [productionLogs, operators, today]);

  const summary = useMemo(() => {
    const active = operatorData.filter(o => o.isActive).length;
    const idle = operatorData.filter(o => !o.isActive).length;
    const totalOk = operatorData.reduce((sum, o) => sum + o.okQuantity, 0);
    const totalTarget = operatorData.reduce((sum, o) => sum + o.targetQuantity, 0);
    const avgEfficiency = totalTarget > 0 ? (totalOk / totalTarget) * 100 : 0;
    const totalRejection = operatorData.reduce((sum, o) => sum + o.rejectionQuantity, 0);
    const scrapPct = (totalOk + totalRejection) > 0 
      ? (totalRejection / (totalOk + totalRejection)) * 100 
      : 0;

    return { active, idle, total: operatorData.length, avgEfficiency, totalOk, totalTarget, scrapPct };
  }, [operatorData]);

  const formatMinutes = (mins: number) => {
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    const remaining = mins % 60;
    return `${hours}h ${remaining}m`;
  };

  return (
    <div className="space-y-4">
      {/* Summary Strip */}
      <div className="flex flex-wrap gap-4 text-sm">
        <div className="flex items-center gap-2">
          <UserCheck className="h-4 w-4 text-green-500" />
          <span className="font-medium text-green-600">{summary.active}</span>
          <span className="text-muted-foreground">active</span>
        </div>
        <div className="flex items-center gap-2">
          <UserX className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">{summary.idle}</span>
          <span className="text-muted-foreground">idle</span>
        </div>
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          <span className="font-medium">{Math.round(summary.avgEfficiency)}%</span>
          <span className="text-muted-foreground">avg efficiency</span>
        </div>
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-muted-foreground" />
          <span className="text-muted-foreground">
            {summary.totalOk.toLocaleString()} / {summary.totalTarget.toLocaleString()} pcs
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto gap-1"
          onClick={() => navigate('/production-performance')}
        >
          Full Report
          <ArrowRight className="h-3 w-3" />
        </Button>
      </div>

      {/* Operator Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {operatorData.slice(0, 12).map((operator) => {
          const isLowEfficiency = operator.isActive && operator.efficiencyPct < 80;
          const isHighEfficiency = operator.efficiencyPct >= 100;

          return (
            <Card
              key={operator.id}
              className={cn(
                "transition-all",
                !operator.isActive && "opacity-60",
                isLowEfficiency && "border-l-4 border-l-amber-500",
                isHighEfficiency && "border-l-4 border-l-green-500"
              )}
            >
              <CardContent className="p-3 space-y-2">
                {/* Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {operator.isActive ? (
                      <UserCheck className="h-4 w-4 text-green-500" />
                    ) : (
                      <UserX className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span className="font-medium text-sm truncate max-w-[120px]">
                      {operator.name}
                    </span>
                  </div>
                  <Badge variant={operator.isActive ? "default" : "secondary"}>
                    {operator.isActive ? 'Active' : 'Idle'}
                  </Badge>
                </div>

                {operator.isActive ? (
                  <>
                    {/* Efficiency */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Efficiency</span>
                        <span className={cn(
                          "font-medium",
                          operator.efficiencyPct >= 100 && "text-green-600",
                          operator.efficiencyPct < 80 && "text-amber-600",
                          operator.efficiencyPct < 60 && "text-destructive"
                        )}>
                          {Math.round(operator.efficiencyPct)}%
                        </span>
                      </div>
                      <Progress
                        value={Math.min(operator.efficiencyPct, 100)}
                        className={cn(
                          "h-2",
                          operator.efficiencyPct >= 100 && "[&>div]:bg-green-500",
                          operator.efficiencyPct < 80 && "[&>div]:bg-amber-500",
                          operator.efficiencyPct < 60 && "[&>div]:bg-destructive"
                        )}
                      />
                    </div>

                    {/* Stats */}
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Output</span>
                      <span>
                        <span className="text-green-600 font-medium">
                          {operator.okQuantity.toLocaleString()}
                        </span>
                        <span className="text-muted-foreground"> / {operator.targetQuantity.toLocaleString()}</span>
                      </span>
                    </div>

                    {operator.rejectionQuantity > 0 && (
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Rejections</span>
                        <span className="text-destructive font-medium">
                          {operator.rejectionQuantity.toLocaleString()}
                        </span>
                      </div>
                    )}

                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {formatMinutes(operator.runtimeMinutes)} runtime • {operator.logsToday} logs
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground py-2">
                    No production logged today
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {operatorData.length > 12 && (
        <div className="text-center">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/production-performance')}
          >
            View all {operatorData.length} operators
            <ArrowRight className="h-3 w-3 ml-1" />
          </Button>
        </div>
      )}

      {operatorData.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Users className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>No operator data available</p>
          <p className="text-xs mt-1">Production logs will populate this view</p>
        </div>
      )}

      {/* Read-only indicator */}
      <p className="text-[10px] text-muted-foreground italic text-right">
        Values derived from today's production logs (read-only)
      </p>
    </div>
  );
};
