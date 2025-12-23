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
 * 
 * NO MANUAL OVERRIDES: All data reflects what was logged.
 * Dashboards using this hook are read-only analytics views.
 */

import { useState, useEffect, useCallback } from "react";
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
  totalOutput: number;
  totalRejections: number;
  utilizationPercent: number;
  avgEfficiency: number;
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

export interface ProductionLogMetrics {
  // Summary KPIs
  totalOutput: number;
  totalTarget: number;
  overallEfficiency: number;
  totalRejections: number;
  rejectionRate: number;
  totalDowntimeMinutes: number;
  totalRuntimeMinutes: number;
  utilizationPercent: number;
  logCount: number;
  
  // Breakdowns
  dailyMetrics: DailyMetrics[];
  shiftMetrics: ShiftMetrics[];
  machineMetrics: MachineMetrics[];
  rejectionBreakdown: RejectionBreakdown[];
  downtimePareto: DowntimeBreakdown[];
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

interface UseProductionLogMetricsOptions {
  startDate?: string;
  endDate?: string;
  siteId?: string;
  machineId?: string;
  operatorId?: string;
  woId?: string;
  period?: 'today' | 'week' | 'month' | 'custom';
}

export function useProductionLogMetrics(options: UseProductionLogMetricsOptions = {}) {
  const [metrics, setMetrics] = useState<ProductionLogMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Compute date range based on period
  const getDateRange = useCallback(() => {
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
      const { start, end } = getDateRange();
      
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
          efficiency_percentage,
          downtime_events,
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
          machines:machine_id(machine_id, name)
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
        setMetrics({
          totalOutput: 0,
          totalTarget: 0,
          overallEfficiency: 0,
          totalRejections: 0,
          rejectionRate: 0,
          totalDowntimeMinutes: 0,
          totalRuntimeMinutes: 0,
          utilizationPercent: 0,
          logCount: 0,
          dailyMetrics: [],
          shiftMetrics: [],
          machineMetrics: [],
          rejectionBreakdown: [],
          downtimePareto: [],
        });
        return;
      }

      // Calculate summary metrics
      let totalOutput = 0;
      let totalTarget = 0;
      let totalRejections = 0;
      let totalDowntime = 0;
      let totalRuntime = 0;
      let efficiencySum = 0;
      let efficiencyCount = 0;

      // Maps for aggregations
      const dailyMap = new Map<string, DailyMetrics>();
      const shiftMap = new Map<string, ShiftMetrics>();
      const machineMap = new Map<string, MachineMetrics>();
      const rejectionCounts: Record<string, number> = {};
      const downtimeCounts: Record<string, number> = {};

      logs.forEach((log: any) => {
        const output = log.ok_quantity ?? log.actual_quantity ?? 0;
        const target = log.target_quantity ?? 0;
        const rejections = log.total_rejection_quantity ?? 0;
        const runtime = log.actual_runtime_minutes ?? 0;
        const downtime = log.total_downtime_minutes ?? 0;
        const efficiency = log.efficiency_percentage ?? 0;
        
        totalOutput += output;
        totalTarget += target;
        totalRejections += rejections;
        totalDowntime += downtime;
        totalRuntime += runtime;
        
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
        machine.totalOutput += output;
        machine.totalRejections += rejections;
        machine.logCount++;
        if (efficiency > 0) {
          machine.avgEfficiency = ((machine.avgEfficiency * (machine.logCount - 1)) + efficiency) / machine.logCount;
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

      // Calculate derived metrics
      const overallEfficiency = efficiencyCount > 0 ? efficiencySum / efficiencyCount : 0;
      const rejectionRate = totalOutput + totalRejections > 0 
        ? (totalRejections / (totalOutput + totalRejections)) * 100 
        : 0;
      
      // Calculate utilization (8 hour shift = 480 minutes per log)
      const expectedRuntime = logs.length * 480;
      const utilizationPercent = expectedRuntime > 0 
        ? (totalRuntime / expectedRuntime) * 100 
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
        utilizationPercent: m.logCount > 0 
          ? (m.totalRuntime / (m.logCount * 480)) * 100 
          : 0,
      }));

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

      setMetrics({
        totalOutput,
        totalTarget,
        overallEfficiency: Math.round(overallEfficiency * 10) / 10,
        totalRejections,
        rejectionRate: Math.round(rejectionRate * 10) / 10,
        totalDowntimeMinutes: totalDowntime,
        totalRuntimeMinutes: totalRuntime,
        utilizationPercent: Math.min(Math.round(utilizationPercent), 100),
        logCount: logs.length,
        dailyMetrics,
        shiftMetrics: Array.from(shiftMap.values()),
        machineMetrics: machineMetrics.sort((a, b) => b.totalOutput - a.totalOutput),
        rejectionBreakdown,
        downtimePareto,
      });
      
    } catch (err: any) {
      console.error('Error loading production log metrics:', err);
      setError(err.message || 'Failed to load metrics');
    } finally {
      setLoading(false);
    }
  }, [getDateRange, options.machineId, options.operatorId, options.woId]);

  useEffect(() => {
    loadMetrics();
  }, [loadMetrics]);

  return {
    metrics,
    loading,
    error,
    refresh: loadMetrics,
  };
}
