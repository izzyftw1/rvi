/**
 * Production Log Metrics Hook
 * 
 * SINGLE SOURCE OF TRUTH: All dashboard metrics MUST be derived from daily_production_logs.
 * 
 * This hook provides:
 * - Daily output (from actual_quantity / ok_quantity)
 * - Shift performance (from efficiency_percentage)
 * - Scrap/rejection trends (from total_rejection_quantity + breakdown fields)
 * - Downtime Pareto (from downtime_events + total_downtime_minutes)
 * - Machine utilisation (from actual_runtime_minutes)
 * - Operator efficiency (aggregated from production logs)
 * 
 * NO MANUAL OVERRIDES: All data reflects what was logged.
 * Dashboards using this hook are read-only analytics views.
 * 
 * FORMULAS:
 * - Gross Time = shift_end_time - shift_start_time
 * - Actual Runtime = Gross Time - total_downtime_minutes
 * - Target Qty = (Runtime × 60) ÷ cycle_time
 * - Efficiency % = (Actual Qty ÷ Target Qty) × 100
 * - Scrap % = (Rejections ÷ Total Produced) × 100
 * - Utilisation % = (Actual Runtime ÷ Expected Runtime) × 100
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";

export interface DailyMetrics {
  date: string;
  totalOutput: number;
  totalTarget: number;
  totalRejections: number;
  rejectionPercent: number;
  totalDowntimeMinutes: number;
  totalRuntimeMinutes: number;
  avgEfficiency: number;
  logCount: number;
}

export interface ShiftMetrics {
  shift: string;
  totalOutput: number;
  totalTarget: number;
  avgEfficiency: number;
  totalRejections: number;
  logCount: number;
}

export interface MachineMetrics {
  machineId: string;
  machineName: string;
  totalRuntime: number;
  totalDowntime: number;
  expectedRuntime: number;
  totalOutput: number;
  totalRejections: number;
  utilizationPercent: number;
  avgEfficiency: number;
  logCount: number;
}

export interface OperatorMetrics {
  operatorId: string;
  operatorName: string;
  totalRuntime: number;
  totalActual: number;
  totalTarget: number;
  totalOk: number;
  totalRejections: number;
  efficiencyPercent: number;
  scrapPercent: number;
  logCount: number;
}

export interface RejectionBreakdown {
  reason: string;
  count: number;
  percent: number;
}

export interface DowntimeBreakdown {
  reason: string;
  minutes: number;
  percent: number;
}

export interface ExternalDelayMetrics {
  overdueCount: number;
  pendingCount: number;
  totalSent: number;
  totalReturned: number;
}

export interface ProductionLogMetrics {
  // Summary KPIs
  totalOutput: number;
  totalTarget: number;
  overallEfficiency: number;
  totalRejections: number;
  rejectionRate: number;
  totalDowntimeMinutes: number;
  totalRuntimeMinutes: number;
  expectedRuntimeMinutes: number;
  utilizationPercent: number;
  logCount: number;
  
  // Breakdowns
  dailyMetrics: DailyMetrics[];
  shiftMetrics: ShiftMetrics[];
  machineMetrics: MachineMetrics[];
  operatorMetrics: OperatorMetrics[];
  rejectionBreakdown: RejectionBreakdown[];
  downtimePareto: DowntimeBreakdown[];
  externalDelays: ExternalDelayMetrics;
  
  // Filter lists (for UI dropdowns)
  availableProcesses: string[];
  availableCustomers: string[];
}

const REJECTION_FIELDS = [
  { field: 'rejection_dent', label: 'Dent' },
  { field: 'rejection_dimension', label: 'Dimension' },
  { field: 'rejection_face_not_ok', label: 'Face Not OK' },
  { field: 'rejection_forging_mark', label: 'Forging Mark' },
  { field: 'rejection_lining', label: 'Lining' },
  { field: 'rejection_material_not_ok', label: 'Material Not OK' },
  { field: 'rejection_previous_setup_fault', label: 'Previous Setup Fault' },
  { field: 'rejection_scratch', label: 'Scratch' },
  { field: 'rejection_setting', label: 'Setting' },
  { field: 'rejection_tool_mark', label: 'Tool Mark' },
];

// Default shift duration in minutes (11.5 hours = 690 minutes)
const DEFAULT_SHIFT_MINUTES = 690;

export interface UseProductionLogMetricsOptions {
  startDate?: string;
  endDate?: string;
  siteId?: string;
  machineId?: string;
  operatorId?: string;
  woId?: string;
  processFilter?: string;
  customerFilter?: string;
  period?: 'today' | 'week' | 'month' | 'custom';
}

const emptyMetrics: ProductionLogMetrics = {
  totalOutput: 0,
  totalTarget: 0,
  overallEfficiency: 0,
  totalRejections: 0,
  rejectionRate: 0,
  totalDowntimeMinutes: 0,
  totalRuntimeMinutes: 0,
  expectedRuntimeMinutes: 0,
  utilizationPercent: 0,
  logCount: 0,
  dailyMetrics: [],
  shiftMetrics: [],
  machineMetrics: [],
  operatorMetrics: [],
  rejectionBreakdown: [],
  downtimePareto: [],
  externalDelays: { overdueCount: 0, pendingCount: 0, totalSent: 0, totalReturned: 0 },
  availableProcesses: [],
  availableCustomers: [],
};

export function useProductionLogMetrics(options: UseProductionLogMetricsOptions = {}) {
  const [metrics, setMetrics] = useState<ProductionLogMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Compute date range based on period
  const dateRange = useMemo(() => {
    const today = new Date();
    
    switch (options.period) {
      case 'today':
        const todayStr = format(today, 'yyyy-MM-dd');
        return { start: todayStr, end: todayStr };
      case 'week':
        return {
          start: format(startOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
          end: format(endOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
        };
      case 'month':
        return {
          start: format(startOfMonth(today), 'yyyy-MM-dd'),
          end: format(endOfMonth(today), 'yyyy-MM-dd'),
        };
      case 'custom':
      default:
        return {
          start: options.startDate || format(today, 'yyyy-MM-dd'),
          end: options.endDate || format(today, 'yyyy-MM-dd'),
        };
    }
  }, [options.period, options.startDate, options.endDate]);

  const loadMetrics = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const { start, end } = dateRange;
      
      // Build query
      let query = supabase
        .from('daily_production_logs')
        .select(`
          id,
          log_date,
          shift,
          machine_id,
          operator_id,
          wo_id,
          actual_quantity,
          ok_quantity,
          target_quantity,
          total_rejection_quantity,
          actual_runtime_minutes,
          total_downtime_minutes,
          shift_start_time,
          shift_end_time,
          efficiency_percentage,
          downtime_events,
          party_code,
          operation_code,
          rejection_dent,
          rejection_dimension,
          rejection_face_not_ok,
          rejection_forging_mark,
          rejection_lining,
          rejection_material_not_ok,
          rejection_previous_setup_fault,
          rejection_scratch,
          rejection_setting,
          rejection_tool_mark,
          machines:machine_id(machine_id, name),
          operator:operator_id(full_name)
        `)
        .gte('log_date', start)
        .lte('log_date', end)
        .order('log_date', { ascending: true });

      if (options.machineId) {
        query = query.eq('machine_id', options.machineId);
      }
      if (options.operatorId) {
        query = query.eq('operator_id', options.operatorId);
      }
      if (options.woId) {
        query = query.eq('wo_id', options.woId);
      }

      const { data: logs, error: queryError } = await query;
      
      if (queryError) throw queryError;
      
      if (!logs || logs.length === 0) {
        setMetrics(emptyMetrics);
        return;
      }

      // Extract available filters before filtering
      const allProcesses = [...new Set(logs.map((l: any) => l.operation_code).filter(Boolean))] as string[];
      const allCustomers = [...new Set(logs.map((l: any) => l.party_code).filter(Boolean))] as string[];

      // Apply process/customer filters
      let filteredLogs = logs;
      if (options.processFilter && options.processFilter !== 'all') {
        filteredLogs = filteredLogs.filter((l: any) => l.operation_code === options.processFilter);
      }
      if (options.customerFilter && options.customerFilter !== 'all') {
        filteredLogs = filteredLogs.filter((l: any) => l.party_code === options.customerFilter);
      }

      if (filteredLogs.length === 0) {
        setMetrics({
          ...emptyMetrics,
          availableProcesses: allProcesses,
          availableCustomers: allCustomers,
        });
        return;
      }

      // Calculate summary metrics
      let totalOutput = 0;
      let totalTarget = 0;
      let totalRejections = 0;
      let totalDowntime = 0;
      let totalRuntime = 0;
      let totalExpectedRuntime = 0;
      let efficiencySum = 0;
      let efficiencyCount = 0;

      // Maps for aggregations
      const dailyMap = new Map<string, DailyMetrics>();
      const shiftMap = new Map<string, ShiftMetrics>();
      const machineMap = new Map<string, MachineMetrics>();
      const operatorMap = new Map<string, OperatorMetrics>();
      const rejectionCounts: Record<string, number> = {};
      const downtimeCounts: Record<string, number> = {};

      filteredLogs.forEach((log: any) => {
        const output = log.ok_quantity ?? log.actual_quantity ?? 0;
        const target = log.target_quantity ?? 0;
        const rejections = log.total_rejection_quantity ?? 0;
        const runtime = log.actual_runtime_minutes ?? 0;
        const downtime = log.total_downtime_minutes ?? 0;
        const efficiency = log.efficiency_percentage ?? 0;
        
        // Calculate expected runtime from shift times or use default
        let expectedRuntime = DEFAULT_SHIFT_MINUTES;
        if (log.shift_start_time && log.shift_end_time) {
          const [startH, startM] = log.shift_start_time.split(':').map(Number);
          const [endH, endM] = log.shift_end_time.split(':').map(Number);
          let shiftMinutes = (endH * 60 + endM) - (startH * 60 + startM);
          if (shiftMinutes < 0) shiftMinutes += 24 * 60; // Handle overnight
          expectedRuntime = shiftMinutes;
        }
        
        totalOutput += output;
        totalTarget += target;
        totalRejections += rejections;
        totalDowntime += downtime;
        totalRuntime += runtime;
        totalExpectedRuntime += expectedRuntime;
        
        if (efficiency > 0) {
          efficiencySum += efficiency;
          efficiencyCount++;
        }

        // Daily aggregation
        const date = log.log_date;
        if (!dailyMap.has(date)) {
          dailyMap.set(date, {
            date,
            totalOutput: 0,
            totalTarget: 0,
            totalRejections: 0,
            rejectionPercent: 0,
            totalDowntimeMinutes: 0,
            totalRuntimeMinutes: 0,
            avgEfficiency: 0,
            logCount: 0,
          });
        }
        const daily = dailyMap.get(date)!;
        daily.totalOutput += output;
        daily.totalTarget += target;
        daily.totalRejections += rejections;
        daily.totalDowntimeMinutes += downtime;
        daily.totalRuntimeMinutes += runtime;
        daily.logCount++;
        if (efficiency > 0) {
          daily.avgEfficiency = ((daily.avgEfficiency * (daily.logCount - 1)) + efficiency) / daily.logCount;
        }

        // Shift aggregation
        const shift = log.shift || 'Unknown';
        if (!shiftMap.has(shift)) {
          shiftMap.set(shift, {
            shift,
            totalOutput: 0,
            totalTarget: 0,
            avgEfficiency: 0,
            totalRejections: 0,
            logCount: 0,
          });
        }
        const shiftData = shiftMap.get(shift)!;
        shiftData.totalOutput += output;
        shiftData.totalTarget += target;
        shiftData.totalRejections += rejections;
        shiftData.logCount++;
        if (efficiency > 0) {
          shiftData.avgEfficiency = ((shiftData.avgEfficiency * (shiftData.logCount - 1)) + efficiency) / shiftData.logCount;
        }

        // Machine aggregation
        const machineId = log.machine_id;
        if (!machineMap.has(machineId)) {
          const machineInfo = log.machines as any;
          machineMap.set(machineId, {
            machineId,
            machineName: machineInfo ? `${machineInfo.machine_id} - ${machineInfo.name}` : machineId,
            totalRuntime: 0,
            totalDowntime: 0,
            expectedRuntime: 0,
            totalOutput: 0,
            totalRejections: 0,
            utilizationPercent: 0,
            avgEfficiency: 0,
            logCount: 0,
          });
        }
        const machine = machineMap.get(machineId)!;
        machine.totalRuntime += runtime;
        machine.totalDowntime += downtime;
        machine.expectedRuntime += expectedRuntime;
        machine.totalOutput += output;
        machine.totalRejections += rejections;
        machine.logCount++;
        if (efficiency > 0) {
          machine.avgEfficiency = ((machine.avgEfficiency * (machine.logCount - 1)) + efficiency) / machine.logCount;
        }

        // Operator aggregation
        const operatorId = log.operator_id;
        if (operatorId) {
          if (!operatorMap.has(operatorId)) {
            const operatorInfo = log.operator as any;
            operatorMap.set(operatorId, {
              operatorId,
              operatorName: operatorInfo?.full_name || 'Unknown',
              totalRuntime: 0,
              totalActual: 0,
              totalTarget: 0,
              totalOk: 0,
              totalRejections: 0,
              efficiencyPercent: 0,
              scrapPercent: 0,
              logCount: 0,
            });
          }
          const operator = operatorMap.get(operatorId)!;
          operator.totalRuntime += runtime;
          operator.totalActual += log.actual_quantity ?? 0;
          operator.totalTarget += target;
          operator.totalOk += log.ok_quantity ?? 0;
          operator.totalRejections += rejections;
          operator.logCount++;
        }

        // Rejection breakdown
        REJECTION_FIELDS.forEach(({ field, label }) => {
          const count = (log as any)[field] ?? 0;
          if (count > 0) {
            rejectionCounts[label] = (rejectionCounts[label] || 0) + count;
          }
        });

        // Downtime breakdown from downtime_events
        if (log.downtime_events && Array.isArray(log.downtime_events)) {
          log.downtime_events.forEach((event: any) => {
            const reason = event.reason || event.type || 'Other';
            const minutes = event.duration_minutes || event.minutes || 0;
            downtimeCounts[reason] = (downtimeCounts[reason] || 0) + minutes;
          });
        }
      });

      // Calculate derived metrics using standard formulas
      const overallEfficiency = efficiencyCount > 0 ? efficiencySum / efficiencyCount : 0;
      const rejectionRate = totalOutput + totalRejections > 0 
        ? (totalRejections / (totalOutput + totalRejections)) * 100 
        : 0;
      const utilizationPercent = totalExpectedRuntime > 0 
        ? (totalRuntime / totalExpectedRuntime) * 100 
        : 0;

      // Finalize daily metrics
      const dailyMetrics = Array.from(dailyMap.values()).map(d => ({
        ...d,
        rejectionPercent: d.totalOutput + d.totalRejections > 0
          ? (d.totalRejections / (d.totalOutput + d.totalRejections)) * 100
          : 0,
      }));

      // Finalize machine metrics with utilization
      const machineMetrics = Array.from(machineMap.values()).map(m => ({
        ...m,
        utilizationPercent: m.expectedRuntime > 0 
          ? Math.round((m.totalRuntime / m.expectedRuntime) * 100 * 100) / 100
          : 0,
      }));

      // Finalize operator metrics with efficiency and scrap
      const operatorMetrics = Array.from(operatorMap.values()).map(op => ({
        ...op,
        efficiencyPercent: op.totalTarget > 0
          ? Math.round((op.totalActual / op.totalTarget) * 100 * 10) / 10
          : 0,
        scrapPercent: op.totalActual > 0
          ? Math.round((op.totalRejections / op.totalActual) * 100 * 10) / 10
          : 0,
      })).sort((a, b) => b.efficiencyPercent - a.efficiencyPercent);

      // Create rejection breakdown sorted by count
      const rejectionBreakdown: RejectionBreakdown[] = Object.entries(rejectionCounts)
        .map(([reason, count]) => ({
          reason,
          count,
          percent: totalRejections > 0 ? (count / totalRejections) * 100 : 0,
        }))
        .sort((a, b) => b.count - a.count);

      // Create downtime Pareto sorted by minutes
      const downtimePareto: DowntimeBreakdown[] = Object.entries(downtimeCounts)
        .map(([reason, minutes]) => ({
          reason,
          minutes,
          percent: totalDowntime > 0 ? (minutes / totalDowntime) * 100 : 0,
        }))
        .sort((a, b) => b.minutes - a.minutes);

      // Load external delays if we have a date range
      let externalDelays: ExternalDelayMetrics = { overdueCount: 0, pendingCount: 0, totalSent: 0, totalReturned: 0 };
      try {
        const { data: externalData } = await supabase
          .from('wo_external_moves')
          .select('status, quantity_sent, quantity_returned, expected_return_date')
          .or(`dispatch_date.gte.${start},and(dispatch_date.lte.${end},or(returned_date.is.null,returned_date.gte.${start}))`);

        if (externalData) {
          const today = new Date();
          externalDelays = {
            overdueCount: externalData.filter(m => 
              m.status !== 'returned' && m.expected_return_date && new Date(m.expected_return_date) < today
            ).length,
            pendingCount: externalData.filter(m => m.status === 'sent').length,
            totalSent: externalData.reduce((sum, m) => sum + (m.quantity_sent || 0), 0),
            totalReturned: externalData.reduce((sum, m) => sum + (m.quantity_returned || 0), 0),
          };
        }
      } catch (e) {
        console.warn('Could not load external delays:', e);
      }

      setMetrics({
        totalOutput,
        totalTarget,
        overallEfficiency: Math.round(overallEfficiency * 10) / 10,
        totalRejections,
        rejectionRate: Math.round(rejectionRate * 10) / 10,
        totalDowntimeMinutes: totalDowntime,
        totalRuntimeMinutes: totalRuntime,
        expectedRuntimeMinutes: totalExpectedRuntime,
        utilizationPercent: Math.min(Math.round(utilizationPercent * 10) / 10, 100),
        logCount: filteredLogs.length,
        dailyMetrics,
        shiftMetrics: Array.from(shiftMap.values()),
        machineMetrics: machineMetrics.sort((a, b) => b.totalOutput - a.totalOutput),
        operatorMetrics,
        rejectionBreakdown,
        downtimePareto,
        externalDelays,
        availableProcesses: allProcesses,
        availableCustomers: allCustomers,
      });
      
    } catch (err: any) {
      console.error('Error loading production log metrics:', err);
      setError(err.message || 'Failed to load metrics');
    } finally {
      setLoading(false);
    }
  }, [dateRange, options.machineId, options.operatorId, options.woId, options.processFilter, options.customerFilter]);

  useEffect(() => {
    loadMetrics();
  }, [loadMetrics]);

  return {
    metrics,
    loading,
    error,
    refresh: loadMetrics,
    dateRange,
  };
}
