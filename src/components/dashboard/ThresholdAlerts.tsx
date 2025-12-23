/**
 * ThresholdAlerts Component
 * 
 * Displays threshold-based production alerts:
 * - Operator efficiency below target
 * - Machine utilisation below target
 * - Repeated NCRs by operator or setup
 * 
 * Data sourced from:
 * - daily_production_logs (efficiency, utilisation)
 * - ncrs table (repeat NCRs)
 */

import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  TrendingDown, 
  Gauge, 
  AlertTriangle, 
  Users, 
  Cpu, 
  RepeatIcon,
  ArrowRight,
  Settings2,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format, subDays } from "date-fns";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

// Configurable thresholds (could be moved to settings table)
const THRESHOLDS = {
  operatorEfficiencyMin: 70, // % - alert if below
  machineUtilisationMin: 60, // % - alert if below
  repeatNcrThreshold: 2,     // NCRs by same operator/setup triggers alert
  lookbackDays: 7,           // Days to look back for metrics
};

interface ThresholdAlert {
  id: string;
  type: 'operator_efficiency' | 'machine_utilisation' | 'repeat_ncr';
  severity: 'critical' | 'warning';
  entity: string;
  entityId: string;
  value: number;
  threshold: number;
  detail: string;
  route: string;
}

export const ThresholdAlerts = () => {
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState<ThresholdAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    loadAlerts();

    const channel = supabase
      .channel('threshold-alerts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_production_logs' }, loadAlerts)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ncrs' }, loadAlerts)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadAlerts = async () => {
    try {
      setLoading(true);
      const today = new Date();
      const lookbackStart = format(subDays(today, THRESHOLDS.lookbackDays), 'yyyy-MM-dd');
      const todayStr = format(today, 'yyyy-MM-dd');

      const newAlerts: ThresholdAlert[] = [];

      // 1. Operator Efficiency Alerts
      const { data: operatorLogs } = await supabase
        .from('daily_production_logs')
        .select(`
          operator_id,
          efficiency_percentage,
          ok_quantity,
          target_quantity,
          operator:operator_id(full_name)
        `)
        .gte('log_date', lookbackStart)
        .lte('log_date', todayStr)
        .not('operator_id', 'is', null);

      if (operatorLogs) {
        // Aggregate by operator
        const operatorAgg = new Map<string, { name: string; totalOk: number; totalTarget: number; logCount: number }>();
        operatorLogs.forEach((log: any) => {
          const opId = log.operator_id;
          const opName = (log.operator as any)?.full_name || 'Unknown';
          const current = operatorAgg.get(opId) || { name: opName, totalOk: 0, totalTarget: 0, logCount: 0 };
          operatorAgg.set(opId, {
            name: opName,
            totalOk: current.totalOk + (log.ok_quantity || 0),
            totalTarget: current.totalTarget + (log.target_quantity || 0),
            logCount: current.logCount + 1,
          });
        });

        operatorAgg.forEach((data, opId) => {
          if (data.totalTarget > 0 && data.logCount >= 3) { // Need at least 3 logs for significance
            const efficiency = Math.round((data.totalOk / data.totalTarget) * 100);
            if (efficiency < THRESHOLDS.operatorEfficiencyMin) {
              newAlerts.push({
                id: `op_eff_${opId}`,
                type: 'operator_efficiency',
                severity: efficiency < THRESHOLDS.operatorEfficiencyMin - 15 ? 'critical' : 'warning',
                entity: data.name,
                entityId: opId,
                value: efficiency,
                threshold: THRESHOLDS.operatorEfficiencyMin,
                detail: `${efficiency}% efficiency (${THRESHOLDS.lookbackDays}d avg)`,
                route: '/operator-efficiency',
              });
            }
          }
        });
      }

      // 2. Machine Utilisation Alerts
      const { data: machineLogs } = await supabase
        .from('daily_production_logs')
        .select(`
          machine_id,
          actual_runtime_minutes,
          shift_start_time,
          shift_end_time,
          machines:machine_id(machine_id, name)
        `)
        .gte('log_date', lookbackStart)
        .lte('log_date', todayStr);

      if (machineLogs) {
        // Default shift duration = 690 minutes (11.5 hours)
        const DEFAULT_SHIFT = 690;

        const machineAgg = new Map<string, { name: string; totalRuntime: number; totalExpected: number; logCount: number }>();
        machineLogs.forEach((log: any) => {
          const mId = log.machine_id;
          const machineInfo = log.machines as any;
          const mName = machineInfo ? `${machineInfo.machine_id}` : 'Unknown';
          
          let expectedRuntime = DEFAULT_SHIFT;
          if (log.shift_start_time && log.shift_end_time) {
            const [startH, startM] = log.shift_start_time.split(':').map(Number);
            const [endH, endM] = log.shift_end_time.split(':').map(Number);
            let shiftMinutes = (endH * 60 + endM) - (startH * 60 + startM);
            if (shiftMinutes < 0) shiftMinutes += 24 * 60;
            expectedRuntime = shiftMinutes;
          }

          const current = machineAgg.get(mId) || { name: mName, totalRuntime: 0, totalExpected: 0, logCount: 0 };
          machineAgg.set(mId, {
            name: mName,
            totalRuntime: current.totalRuntime + (log.actual_runtime_minutes || 0),
            totalExpected: current.totalExpected + expectedRuntime,
            logCount: current.logCount + 1,
          });
        });

        machineAgg.forEach((data, mId) => {
          if (data.totalExpected > 0 && data.logCount >= 3) {
            const utilisation = Math.round((data.totalRuntime / data.totalExpected) * 100);
            if (utilisation < THRESHOLDS.machineUtilisationMin) {
              newAlerts.push({
                id: `mach_util_${mId}`,
                type: 'machine_utilisation',
                severity: utilisation < THRESHOLDS.machineUtilisationMin - 20 ? 'critical' : 'warning',
                entity: data.name,
                entityId: mId,
                value: utilisation,
                threshold: THRESHOLDS.machineUtilisationMin,
                detail: `${utilisation}% utilisation (${THRESHOLDS.lookbackDays}d avg)`,
                route: '/machine-utilisation',
              });
            }
          }
        });
      }

      // 3. Repeat NCRs (by operator or setup)
      const { data: ncrs } = await supabase
        .from('ncrs')
        .select(`
          id,
          ncr_number,
          work_order_id,
          responsible_person,
          created_at,
          status,
          operation_type,
          production_log_id
        `)
        .gte('created_at', `${lookbackStart}T00:00:00Z`)
        .in('status', ['OPEN', 'ACTION_IN_PROGRESS', 'EFFECTIVENESS_PENDING']);

      if (ncrs) {
        // Group by responsible_person (operator)
        const ncrByOperator = new Map<string, { count: number; ncrNumbers: string[] }>();
        ncrs.forEach((ncr: any) => {
          if (ncr.responsible_person) {
            const current = ncrByOperator.get(ncr.responsible_person) || { count: 0, ncrNumbers: [] };
            ncrByOperator.set(ncr.responsible_person, {
              count: current.count + 1,
              ncrNumbers: [...current.ncrNumbers, ncr.ncr_number],
            });
          }
        });

        // Get operator names
        const operatorIds = Array.from(ncrByOperator.keys());
        let operatorNames: Record<string, string> = {};
        if (operatorIds.length > 0) {
          const { data: people } = await supabase
            .from('people')
            .select('id, full_name')
            .in('id', operatorIds);
          people?.forEach((p: any) => {
            operatorNames[p.id] = p.full_name;
          });
        }

        ncrByOperator.forEach((data, opId) => {
          if (data.count >= THRESHOLDS.repeatNcrThreshold) {
            newAlerts.push({
              id: `repeat_ncr_op_${opId}`,
              type: 'repeat_ncr',
              severity: data.count >= 4 ? 'critical' : 'warning',
              entity: operatorNames[opId] || 'Unknown Operator',
              entityId: opId,
              value: data.count,
              threshold: THRESHOLDS.repeatNcrThreshold,
              detail: `${data.count} NCRs in ${THRESHOLDS.lookbackDays}d`,
              route: '/ncr-management',
            });
          }
        });

        // Group by operation_type (setup/process)
        const ncrByOperation = new Map<string, { count: number; ncrNumbers: string[] }>();
        ncrs.forEach((ncr: any) => {
          if (ncr.operation_type) {
            const current = ncrByOperation.get(ncr.operation_type) || { count: 0, ncrNumbers: [] };
            ncrByOperation.set(ncr.operation_type, {
              count: current.count + 1,
              ncrNumbers: [...current.ncrNumbers, ncr.ncr_number],
            });
          }
        });

        ncrByOperation.forEach((data, opType) => {
          if (data.count >= THRESHOLDS.repeatNcrThreshold) {
            newAlerts.push({
              id: `repeat_ncr_setup_${opType}`,
              type: 'repeat_ncr',
              severity: data.count >= 4 ? 'critical' : 'warning',
              entity: `${opType} Operation`,
              entityId: opType,
              value: data.count,
              threshold: THRESHOLDS.repeatNcrThreshold,
              detail: `${data.count} NCRs in ${THRESHOLDS.lookbackDays}d`,
              route: '/ncr-management',
            });
          }
        });
      }

      // Sort by severity (critical first), then by value distance from threshold
      newAlerts.sort((a, b) => {
        if (a.severity !== b.severity) {
          return a.severity === 'critical' ? -1 : 1;
        }
        // For efficiency/utilisation, lower is worse; for NCRs, higher is worse
        if (a.type === 'repeat_ncr') {
          return b.value - a.value;
        }
        return a.value - b.value;
      });

      setAlerts(newAlerts);
    } catch (error) {
      console.error('Error loading threshold alerts:', error);
    } finally {
      setLoading(false);
    }
  };

  const getAlertIcon = (type: string) => {
    switch (type) {
      case 'operator_efficiency': return Users;
      case 'machine_utilisation': return Cpu;
      case 'repeat_ncr': return RepeatIcon;
      default: return AlertTriangle;
    }
  };

  const getAlertColor = (type: string) => {
    switch (type) {
      case 'operator_efficiency': return 'border-l-orange-500';
      case 'machine_utilisation': return 'border-l-blue-500';
      case 'repeat_ncr': return 'border-l-purple-500';
      default: return 'border-l-muted';
    }
  };

  const criticalCount = alerts.filter(a => a.severity === 'critical').length;
  const warningCount = alerts.filter(a => a.severity === 'warning').length;

  if (loading) {
    return (
      <Card>
        <CardContent className="p-4">
          <div className="space-y-2">
            {[1, 2].map(i => (
              <div key={i} className="h-14 rounded bg-muted animate-pulse" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (alerts.length === 0) {
    return null; // Don't show card if no alerts
  }

  return (
    <Card>
      <Collapsible open={expanded} onOpenChange={setExpanded}>
        <CollapsibleTrigger asChild>
          <CardHeader className="py-3 px-4 cursor-pointer hover:bg-muted/30 transition-colors">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <Gauge className={cn(
                  "h-4 w-4",
                  criticalCount > 0 ? "text-destructive" : "text-amber-500"
                )} />
                Performance Alerts
                <div className="flex items-center gap-1.5 ml-2">
                  {criticalCount > 0 && (
                    <Badge variant="destructive" className="text-[10px] h-5">
                      {criticalCount} critical
                    </Badge>
                  )}
                  {warningCount > 0 && (
                    <Badge variant="secondary" className="text-[10px] h-5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
                      {warningCount} warning
                    </Badge>
                  )}
                </div>
              </CardTitle>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground">
                  {THRESHOLDS.lookbackDays}d lookback
                </span>
                {expanded ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="px-4 pb-4 pt-0 space-y-2">
            {alerts.slice(0, 6).map((alert) => {
              const Icon = getAlertIcon(alert.type);
              return (
                <div
                  key={alert.id}
                  className={cn(
                    "flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 cursor-pointer transition-all border-l-4",
                    getAlertColor(alert.type),
                    alert.severity === 'critical' && "ring-1 ring-destructive/30"
                  )}
                  onClick={() => navigate(alert.route)}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <Icon className={cn(
                      "h-4 w-4 flex-shrink-0",
                      alert.severity === 'critical' ? "text-destructive" : "text-amber-500"
                    )} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{alert.entity}</span>
                        <Badge 
                          variant="outline" 
                          className={cn(
                            "text-[9px] px-1.5 py-0",
                            alert.type === 'operator_efficiency' && "border-orange-300 text-orange-600",
                            alert.type === 'machine_utilisation' && "border-blue-300 text-blue-600",
                            alert.type === 'repeat_ncr' && "border-purple-300 text-purple-600"
                          )}
                        >
                          {alert.type === 'operator_efficiency' && <TrendingDown className="h-2 w-2 mr-1" />}
                          {alert.type === 'machine_utilisation' && <Gauge className="h-2 w-2 mr-1" />}
                          {alert.type === 'repeat_ncr' && <RepeatIcon className="h-2 w-2 mr-1" />}
                          {alert.type === 'operator_efficiency' && 'Efficiency'}
                          {alert.type === 'machine_utilisation' && 'Utilisation'}
                          {alert.type === 'repeat_ncr' && 'Repeat NCRs'}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{alert.detail}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={cn(
                      "text-[10px] px-2 py-0.5 rounded-full font-medium",
                      alert.severity === 'critical' ? "bg-destructive/10 text-destructive" : "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300"
                    )}>
                      {alert.type !== 'repeat_ncr' ? `< ${alert.threshold}%` : `≥ ${alert.threshold}`}
                    </span>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
              );
            })}

            {alerts.length > 6 && (
              <Button 
                variant="ghost" 
                size="sm" 
                className="w-full text-xs text-muted-foreground"
                onClick={() => navigate('/quality-analytics')}
              >
                View all {alerts.length} alerts
              </Button>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
};
