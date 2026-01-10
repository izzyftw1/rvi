/**
 * Production Performance Metrics Hook
 * 
 * CONSOLIDATED SINGLE SOURCE OF TRUTH
 * Combines all production analytics from daily_production_logs + cnc_programmer_activity.
 * 
 * Supports:
 * - Machine Utilisation metrics
 * - Operator Efficiency metrics
 * - Setter Efficiency metrics (from cnc_programmer_activity)
 * - Downtime Analytics (loss analysis)
 * - Quality/Rejection analysis
 * - Financial impact calculations
 * - Advanced management reports
 * 
 * All calculations use standard formulas from the existing hooks.
 * NO DUPLICATE LOGIC - reuses patterns from useProductionLogMetrics and useSetterEfficiencyMetrics.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, parseISO, differenceInMinutes, differenceInHours } from "date-fns";
import { getCategoryForReason, type DowntimeCategory } from "@/config/downtimeConfig";

// ============= INTERFACES =============

export interface CapacityMetrics {
  totalMannedShifts: number;
  dayShifts: number;
  nightShifts: number;
  totalPaidCapacityMinutes: number;
  totalProductiveRuntimeMinutes: number;
  totalDowntimeMinutes: number;
  activePaidCapacityMinutes: number; // Paid capacity - downtime
  activeMachines: number;
  inactiveMachines: number;
  utilizationPercent: number;
  idleTimeMinutes: number;
}

export interface EfficiencyMetrics {
  globalActualOutput: number;
  globalTargetOutput: number;
  globalEfficiencyPercent: number;
  totalProduction: number;
  totalRejections: number;
  globalRejectionPercent: number;
}

export interface DowntimeLoss {
  reason: string;
  category: DowntimeCategory;
  minutes: number;
  hours: number;
  percentOfDowntime: number;
  percentOfCapacity: number;
  occurrences: number;
}

export interface DowntimeByMachine {
  machineId: string;
  machineName: string;
  totalMinutes: number;
  occurrences: number;
  topReason: string;
  trend: number;
}

export interface DowntimeByShift {
  shift: string;
  totalMinutes: number;
  percentOfTotal: number;
  topReason: string;
}

export interface DowntimeByCategory {
  category: DowntimeCategory;
  totalMinutes: number;
  hours: number;
  percentOfDowntime: number;
  occurrences: number;
}

export interface OperatorPerformance {
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
  rank: "high" | "medium" | "low";
}

export interface MachinePerformance {
  machineId: string;
  machineName: string;
  totalRuntime: number;
  totalDowntime: number;
  expectedRuntime: number;
  totalOutput: number;
  totalRejections: number;
  utilizationPercent: number;
  avgEfficiency: number;
  rank: "high" | "medium" | "low";
}

export interface ItemPerformance {
  itemCode: string;
  totalOutput: number;
  totalRejections: number;
  avgEfficiency: number;
  avgCycleTime: number;
  actualCycleTime: number;
  rank: "high" | "medium" | "low";
}

export interface RejectionAnalysis {
  reason: string;
  count: number;
  percent: number;
}

export interface RejectionByItem {
  itemCode: string;
  total: number;
  reasons: { reason: string; count: number }[];
}

export interface SetterPerformance {
  setterId: string;
  setterName: string;
  totalSetups: number;
  avgSetupDurationMinutes: number;
  avgApprovalDelayMinutes: number;
  repeatSetupCount: number;
  efficiencyScore: number;
  rank: "high" | "medium" | "low";
}

export interface SupervisorPerformance {
  supervisorId: string;
  supervisorName: string;
  totalLogs: number;
  avgEfficiency: number;
  totalOutput: number;
  totalRejections: number;
}

export interface ProcessPerformance {
  process: string;
  totalOutput: number;
  totalRejections: number;
  avgEfficiency: number;
  avgRuntime: number;
}

export interface RepeatOffender {
  id: string;
  name: string;
  type: "machine" | "item" | "operator";
  occurrences: number;
  totalMinutes?: number;
  topReason?: string;
  trend?: number;
}

export interface SetupLossAnalysis {
  totalSetupTimeMinutes: number;
  totalProductiveTimeMinutes: number;
  setupTimePercent: number;
  avgSetupDuration: number;
  changeoverCount: number;
  avgChangeoverTime: number;
}

export interface FinancialImpact {
  rejectionCostEstimate: number;
  downtimeCostEstimate: number;
  reworkCostEstimate: number;
  totalLossCost: number;
  currency: string;
}

export interface ProductionPerformanceMetrics {
  // Capacity & Utilisation (PROMPT 1)
  capacity: CapacityMetrics;
  efficiency: EfficiencyMetrics;
  
  // Downtime & Loss Analysis (PROMPT 2)
  downtimeLosses: DowntimeLoss[];
  downtimeByMachine: DowntimeByMachine[];
  downtimeByShift: DowntimeByShift[];
  downtimeByCategory: DowntimeByCategory[];
  
  // Efficiency Rankings (PROMPT 3)
  operators: OperatorPerformance[];
  machines: MachinePerformance[];
  items: ItemPerformance[];
  rejectionPareto: RejectionAnalysis[];
  rejectionByItem: RejectionByItem[];
  setters: SetterPerformance[];
  financialImpact: FinancialImpact;
  
  // Advanced Reports (PROMPT 4)
  shiftComparison: DowntimeByShift[];
  processesByProductivity: ProcessPerformance[];
  repeatDowntimeOffenders: RepeatOffender[];
  repeatRejectionOffenders: RepeatOffender[];
  setupLossAnalysis: SetupLossAnalysis;
  
  // Filters
  availableMachines: { id: string; name: string }[];
  availableOperators: { id: string; name: string }[];
  availableItems: string[];
  availableProcesses: string[];
  availableShifts: string[];
  
  // Meta
  logCount: number;
  dateRange: { start: string; end: string };
}

const DEFAULT_SHIFT_MINUTES = 690; // 11.5 hours
const HOURLY_COST_ESTIMATE = 500; // INR per hour for loss calculations
const REJECTION_COST_PER_PIECE = 50; // INR per rejected piece

export interface UseProductionPerformanceOptions {
  startDate?: string;
  endDate?: string;
  period?: "today" | "week" | "month" | "custom";
  machineId?: string;
  operatorId?: string;
  itemFilter?: string;
  processFilter?: string;
  shiftFilter?: string;
}

const emptyMetrics: ProductionPerformanceMetrics = {
  capacity: {
    totalMannedShifts: 0,
    dayShifts: 0,
    nightShifts: 0,
    totalPaidCapacityMinutes: 0,
    totalProductiveRuntimeMinutes: 0,
    totalDowntimeMinutes: 0,
    activePaidCapacityMinutes: 0,
    activeMachines: 0,
    inactiveMachines: 0,
    utilizationPercent: 0,
    idleTimeMinutes: 0,
  },
  efficiency: {
    globalActualOutput: 0,
    globalTargetOutput: 0,
    globalEfficiencyPercent: 0,
    totalProduction: 0,
    totalRejections: 0,
    globalRejectionPercent: 0,
  },
  downtimeLosses: [],
  downtimeByMachine: [],
  downtimeByShift: [],
  downtimeByCategory: [],
  operators: [],
  machines: [],
  items: [],
  rejectionPareto: [],
  rejectionByItem: [],
  setters: [],
  financialImpact: { rejectionCostEstimate: 0, downtimeCostEstimate: 0, reworkCostEstimate: 0, totalLossCost: 0, currency: "INR" },
  shiftComparison: [],
  processesByProductivity: [],
  repeatDowntimeOffenders: [],
  repeatRejectionOffenders: [],
  setupLossAnalysis: { totalSetupTimeMinutes: 0, totalProductiveTimeMinutes: 0, setupTimePercent: 0, avgSetupDuration: 0, changeoverCount: 0, avgChangeoverTime: 0 },
  availableMachines: [],
  availableOperators: [],
  availableItems: [],
  availableProcesses: [],
  availableShifts: [],
  logCount: 0,
  dateRange: { start: "", end: "" },
};

const REJECTION_FIELDS = [
  { field: "rejection_dent", label: "Dent" },
  { field: "rejection_dimension", label: "Dimension" },
  { field: "rejection_face_not_ok", label: "Face Not OK" },
  { field: "rejection_forging_mark", label: "Forging Mark" },
  { field: "rejection_lining", label: "Lining" },
  { field: "rejection_material_not_ok", label: "Material Not OK" },
  { field: "rejection_previous_setup_fault", label: "Previous Setup Fault" },
  { field: "rejection_scratch", label: "Scratch" },
  { field: "rejection_setting", label: "Setting" },
  { field: "rejection_tool_mark", label: "Tool Mark" },
];

export function useProductionPerformanceMetrics(options: UseProductionPerformanceOptions = {}) {
  const [metrics, setMetrics] = useState<ProductionPerformanceMetrics>(emptyMetrics);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Compute date range
  const dateRange = useMemo(() => {
    const today = new Date();
    switch (options.period) {
      case "today":
        const todayStr = format(today, "yyyy-MM-dd");
        return { start: todayStr, end: todayStr };
      case "week":
        return {
          start: format(startOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd"),
          end: format(endOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd"),
        };
      case "month":
        return {
          start: format(startOfMonth(today), "yyyy-MM-dd"),
          end: format(endOfMonth(today), "yyyy-MM-dd"),
        };
      case "custom":
      default:
        return {
          start: options.startDate || format(subDays(today, 6), "yyyy-MM-dd"),
          end: options.endDate || format(today, "yyyy-MM-dd"),
        };
    }
  }, [options.period, options.startDate, options.endDate]);

  const loadMetrics = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { start, end } = dateRange;

      // ============= FETCH PRODUCTION LOGS =============
      let logsQuery = supabase
        .from("daily_production_logs")
        .select(`
          id, log_date, shift,
          machine_id, operator_id, wo_id,
          actual_quantity, ok_quantity, target_quantity,
          total_rejection_quantity,
          actual_runtime_minutes, total_downtime_minutes,
          shift_start_time, shift_end_time,
          efficiency_percentage, downtime_events,
          party_code, operation_code, product_description,
          cycle_time_seconds, rework_quantity,
          setup_duration_minutes,
          rejection_dent, rejection_dimension, rejection_face_not_ok,
          rejection_forging_mark, rejection_lining, rejection_material_not_ok,
          rejection_previous_setup_fault, rejection_scratch, rejection_setting, rejection_tool_mark,
          machines:machine_id(id, machine_id, name),
          operator:operator_id(id, full_name)
        `)
        .gte("log_date", start)
        .lte("log_date", end)
        .order("log_date", { ascending: true });

      if (options.machineId) logsQuery = logsQuery.eq("machine_id", options.machineId);
      if (options.operatorId) logsQuery = logsQuery.eq("operator_id", options.operatorId);
      if (options.shiftFilter && options.shiftFilter !== "all") logsQuery = logsQuery.eq("shift", options.shiftFilter);

      const { data: logs, error: logsError } = await logsQuery;
      if (logsError) throw logsError;

      // ============= FETCH SETTER ACTIVITY =============
      let setterQuery = supabase
        .from("cnc_programmer_activity")
        .select(`
          id, programmer_id, machine_id, wo_id, item_code,
          activity_date, setup_type,
          setup_start_time, setup_end_time, setup_duration_minutes,
          first_piece_approval_time
        `)
        .gte("activity_date", start)
        .lte("activity_date", end)
        .order("activity_date", { ascending: true });

      if (options.machineId) setterQuery = setterQuery.eq("machine_id", options.machineId);

      const { data: setterData, error: setterError } = await setterQuery;
      if (setterError) console.warn("Setter data fetch failed:", setterError);

      // ============= FETCH REFERENCE DATA =============
      const [machinesRes, peopleRes] = await Promise.all([
        supabase.from("machines").select("id, machine_id, name").order("machine_id"),
        supabase.from("people").select("id, full_name").order("full_name"),
      ]);

      const machineMap = new Map((machinesRes.data || []).map(m => [m.id, `${m.machine_id} - ${m.name}`]));
      const peopleMap = new Map((peopleRes.data || []).map(p => [p.id, p.full_name]));

      if (!logs || logs.length === 0) {
        setMetrics({ ...emptyMetrics, dateRange });
        return;
      }

      // ============= APPLY ADDITIONAL FILTERS =============
      let filteredLogs = logs;
      if (options.processFilter && options.processFilter !== "all") {
        filteredLogs = filteredLogs.filter((l: any) => l.operation_code === options.processFilter);
      }
      if (options.itemFilter && options.itemFilter !== "all") {
        filteredLogs = filteredLogs.filter((l: any) => l.product_description?.includes(options.itemFilter));
      }

      // ============= EXTRACT FILTER OPTIONS =============
      const allMachineIds = [...new Set(logs.map((l: any) => l.machine_id))];
      const availableMachines = allMachineIds.map(id => ({
        id,
        name: machineMap.get(id) || id,
      }));

      const allOperatorIds = [...new Set(logs.map((l: any) => l.operator_id).filter(Boolean))];
      const availableOperators = allOperatorIds.map(id => ({
        id,
        name: peopleMap.get(id) || "Unknown",
      }));

      const availableItems = [...new Set(logs.map((l: any) => l.product_description).filter(Boolean))] as string[];
      const availableProcesses = [...new Set(logs.map((l: any) => l.operation_code).filter(Boolean))] as string[];
      const availableShifts = [...new Set(logs.map((l: any) => l.shift).filter(Boolean))] as string[];

      // ============= CAPACITY CALCULATIONS =============
      let dayShifts = 0;
      let nightShifts = 0;
      let totalPaidCapacity = 0;
      let totalProductiveRuntime = 0;
      let totalDowntime = 0;
      const activeMachineSet = new Set<string>();
      const allMachineSet = new Set<string>();

      let totalActual = 0;
      let totalTarget = 0;
      let totalOutput = 0;
      let totalRejections = 0;
      let totalRework = 0;
      let efficiencySum = 0;
      let efficiencyCount = 0;
      let totalSetupTime = 0;

      // Aggregation maps
      const operatorMap = new Map<string, OperatorPerformance>();
      const machineAggMap = new Map<string, MachinePerformance>();
      const itemMap = new Map<string, ItemPerformance>();
      const rejectionCounts: Record<string, number> = {};
      const rejectionByItemMap = new Map<string, { total: number; reasons: Map<string, number> }>();
      const downtimeReasonMap = new Map<string, { minutes: number; occurrences: number }>();
      const downtimeMachineMap = new Map<string, { name: string; minutes: number; occurrences: number; reasons: Map<string, number> }>();
      const downtimeShiftMap = new Map<string, { minutes: number; reasons: Map<string, number> }>();
      const processMap = new Map<string, ProcessPerformance>();

      filteredLogs.forEach((log: any) => {
        const shift = log.shift || "unknown";
        if (shift.toLowerCase() === "day") dayShifts++;
        else if (shift.toLowerCase() === "night") nightShifts++;

        // Calculate paid capacity from shift times
        let paidCapacity = DEFAULT_SHIFT_MINUTES;
        if (log.shift_start_time && log.shift_end_time) {
          const [startH, startM] = log.shift_start_time.split(":").map(Number);
          const [endH, endM] = log.shift_end_time.split(":").map(Number);
          let shiftMinutes = (endH * 60 + endM) - (startH * 60 + startM);
          if (shiftMinutes < 0) shiftMinutes += 24 * 60;
          paidCapacity = shiftMinutes;
        }
        totalPaidCapacity += paidCapacity;

        const runtime = log.actual_runtime_minutes ?? 0;
        const downtime = log.total_downtime_minutes ?? 0;
        const output = log.ok_quantity ?? log.actual_quantity ?? 0;
        const target = log.target_quantity ?? 0;
        const rejections = log.total_rejection_quantity ?? 0;
        const rework = log.rework_quantity ?? 0;
        const efficiency = log.efficiency_percentage ?? 0;
        const setupTime = log.setup_duration_minutes ?? 0;

        totalProductiveRuntime += runtime;
        totalDowntime += downtime;
        totalActual += log.actual_quantity ?? 0;
        totalTarget += target;
        totalOutput += output;
        totalRejections += rejections;
        totalRework += rework;
        totalSetupTime += setupTime;

        if (efficiency > 0) {
          efficiencySum += efficiency;
          efficiencyCount++;
        }

        allMachineSet.add(log.machine_id);
        if (runtime > 0) activeMachineSet.add(log.machine_id);

        // Operator aggregation
        const operatorId = log.operator_id;
        if (operatorId) {
          const existing = operatorMap.get(operatorId) || {
            operatorId,
            operatorName: (log.operator as any)?.full_name || peopleMap.get(operatorId) || "Unknown",
            totalRuntime: 0,
            totalActual: 0,
            totalTarget: 0,
            totalOk: 0,
            totalRejections: 0,
            efficiencyPercent: 0,
            scrapPercent: 0,
            logCount: 0,
            rank: "medium" as const,
          };
          existing.totalRuntime += runtime;
          existing.totalActual += log.actual_quantity ?? 0;
          existing.totalTarget += target;
          existing.totalOk += output;
          existing.totalRejections += rejections;
          existing.logCount++;
          operatorMap.set(operatorId, existing);
        }

        // Machine aggregation
        const machineId = log.machine_id;
        const machineInfo = log.machines as any;
        const existingMachine = machineAggMap.get(machineId) || {
          machineId,
          machineName: machineInfo ? `${machineInfo.machine_id} - ${machineInfo.name}` : machineMap.get(machineId) || machineId,
          totalRuntime: 0,
          totalDowntime: 0,
          expectedRuntime: 0,
          totalOutput: 0,
          totalRejections: 0,
          utilizationPercent: 0,
          avgEfficiency: 0,
          rank: "medium" as const,
        };
        existingMachine.totalRuntime += runtime;
        existingMachine.totalDowntime += downtime;
        existingMachine.expectedRuntime += paidCapacity;
        existingMachine.totalOutput += output;
        existingMachine.totalRejections += rejections;
        machineAggMap.set(machineId, existingMachine);

        // Item aggregation
        const itemCode = log.product_description || "Unknown";
        const existingItem = itemMap.get(itemCode) || {
          itemCode,
          totalOutput: 0,
          totalRejections: 0,
          avgEfficiency: 0,
          avgCycleTime: 0,
          actualCycleTime: 0,
          rank: "medium" as const,
        };
        existingItem.totalOutput += output;
        existingItem.totalRejections += rejections;
        if (log.cycle_time_seconds) {
          existingItem.avgCycleTime = log.cycle_time_seconds;
          if (runtime > 0 && output > 0) {
            existingItem.actualCycleTime = (runtime * 60) / output;
          }
        }
        itemMap.set(itemCode, existingItem);

        // Rejection breakdown
        REJECTION_FIELDS.forEach(({ field, label }) => {
          const count = (log as any)[field] ?? 0;
          if (count > 0) {
            rejectionCounts[label] = (rejectionCounts[label] || 0) + count;
            
            // By item
            const itemRej = rejectionByItemMap.get(itemCode) || { total: 0, reasons: new Map() };
            itemRej.total += count;
            itemRej.reasons.set(label, (itemRej.reasons.get(label) || 0) + count);
            rejectionByItemMap.set(itemCode, itemRej);
          }
        });

        // Downtime breakdown
        if (log.downtime_events && Array.isArray(log.downtime_events)) {
          log.downtime_events.forEach((event: any) => {
            const reason = event.reason || event.type || "Other";
            const minutes = event.duration_minutes || event.minutes || 0;
            
            // By reason
            const existing = downtimeReasonMap.get(reason) || { minutes: 0, occurrences: 0 };
            existing.minutes += minutes;
            existing.occurrences += 1;
            downtimeReasonMap.set(reason, existing);

            // By machine
            const machineEntry = downtimeMachineMap.get(machineId) || {
              name: existingMachine.machineName,
              minutes: 0,
              occurrences: 0,
              reasons: new Map(),
            };
            machineEntry.minutes += minutes;
            machineEntry.occurrences += 1;
            machineEntry.reasons.set(reason, (machineEntry.reasons.get(reason) || 0) + minutes);
            downtimeMachineMap.set(machineId, machineEntry);

            // By shift
            const shiftEntry = downtimeShiftMap.get(shift) || { minutes: 0, reasons: new Map() };
            shiftEntry.minutes += minutes;
            shiftEntry.reasons.set(reason, (shiftEntry.reasons.get(reason) || 0) + minutes);
            downtimeShiftMap.set(shift, shiftEntry);
          });
        }

        // Process aggregation
        const process = log.operation_code || "Unknown";
        const existingProcess = processMap.get(process) || {
          process,
          totalOutput: 0,
          totalRejections: 0,
          avgEfficiency: 0,
          avgRuntime: 0,
        };
        existingProcess.totalOutput += output;
        existingProcess.totalRejections += rejections;
        existingProcess.avgRuntime = (existingProcess.avgRuntime + runtime) / 2;
        processMap.set(process, existingProcess);
      });

      // ============= SETTER METRICS =============
      const setterAggMap = new Map<string, {
        id: string;
        name: string;
        setups: number;
        durations: number[];
        delays: number[];
        repeats: number;
      }>();

      if (setterData && setterData.length > 0) {
        const setupHistory = new Map<string, Date[]>();
        
        setterData.forEach((activity: any) => {
          const setterId = activity.programmer_id || "unknown";
          const existing = setterAggMap.get(setterId) || {
            id: setterId,
            name: peopleMap.get(setterId) || "Unknown Setter",
            setups: 0,
            durations: [],
            delays: [],
            repeats: 0,
          };

          existing.setups++;

          if (activity.setup_duration_minutes > 0) {
            existing.durations.push(activity.setup_duration_minutes);
          }

          if (activity.setup_end_time && activity.first_piece_approval_time) {
            const delay = differenceInMinutes(
              parseISO(activity.first_piece_approval_time),
              parseISO(activity.setup_end_time)
            );
            if (delay >= 0) existing.delays.push(delay);
          }

          // Repeat detection
          const itemKey = `${activity.item_code || "unknown"}-${activity.wo_id || "unknown"}`;
          const currentTime = activity.setup_start_time ? parseISO(activity.setup_start_time) : new Date();
          const history = setupHistory.get(itemKey) || [];
          
          for (const prev of history) {
            if (differenceInHours(currentTime, prev) <= 24 && differenceInHours(currentTime, prev) >= 0) {
              existing.repeats++;
              break;
            }
          }
          history.push(currentTime);
          setupHistory.set(itemKey, history);

          setterAggMap.set(setterId, existing);
        });
      }

      // ============= FINALIZE METRICS =============

      // Capacity
      const activePaidCapacity = totalPaidCapacity - totalDowntime;
      const idleTime = activePaidCapacity - totalProductiveRuntime;
      const utilizationPercent = totalPaidCapacity > 0 ? (totalProductiveRuntime / totalPaidCapacity) * 100 : 0;

      const capacity: CapacityMetrics = {
        totalMannedShifts: dayShifts + nightShifts,
        dayShifts,
        nightShifts,
        totalPaidCapacityMinutes: totalPaidCapacity,
        totalProductiveRuntimeMinutes: totalProductiveRuntime,
        totalDowntimeMinutes: totalDowntime,
        activePaidCapacityMinutes: activePaidCapacity,
        activeMachines: activeMachineSet.size,
        inactiveMachines: allMachineSet.size - activeMachineSet.size,
        utilizationPercent: Math.min(Math.round(utilizationPercent * 10) / 10, 100),
        idleTimeMinutes: Math.max(idleTime, 0),
      };

      // Efficiency
      const globalEfficiency = efficiencyCount > 0 ? efficiencySum / efficiencyCount : 0;
      const rejectionRate = totalOutput + totalRejections > 0 ? (totalRejections / (totalOutput + totalRejections)) * 100 : 0;

      const efficiency: EfficiencyMetrics = {
        globalActualOutput: totalActual,
        globalTargetOutput: totalTarget,
        globalEfficiencyPercent: Math.round(globalEfficiency * 10) / 10,
        totalProduction: totalOutput,
        totalRejections,
        globalRejectionPercent: Math.round(rejectionRate * 10) / 10,
      };

      // Downtime losses with Pareto
      const downtimeLosses: DowntimeLoss[] = Array.from(downtimeReasonMap.entries())
        .map(([reason, data]) => ({
          reason,
          category: getCategoryForReason(reason),
          minutes: data.minutes,
          hours: Math.round(data.minutes / 60 * 10) / 10,
          percentOfDowntime: totalDowntime > 0 ? Math.round((data.minutes / totalDowntime) * 100 * 10) / 10 : 0,
          percentOfCapacity: totalPaidCapacity > 0 ? Math.round((data.minutes / totalPaidCapacity) * 100 * 10) / 10 : 0,
          occurrences: data.occurrences,
        }))
        .sort((a, b) => b.minutes - a.minutes);

      // Downtime by category
      const categoryTotals = new Map<DowntimeCategory, { minutes: number; occurrences: number }>();
      downtimeLosses.forEach(d => {
        const existing = categoryTotals.get(d.category) || { minutes: 0, occurrences: 0 };
        existing.minutes += d.minutes;
        existing.occurrences += d.occurrences;
        categoryTotals.set(d.category, existing);
      });

      const downtimeByCategory: DowntimeByCategory[] = Array.from(categoryTotals.entries())
        .map(([category, data]) => ({
          category,
          totalMinutes: data.minutes,
          hours: Math.round(data.minutes / 60 * 10) / 10,
          percentOfDowntime: totalDowntime > 0 ? Math.round((data.minutes / totalDowntime) * 100 * 10) / 10 : 0,
          occurrences: data.occurrences,
        }))
        .sort((a, b) => b.totalMinutes - a.totalMinutes);

      // Downtime by machine
      const downtimeByMachine: DowntimeByMachine[] = Array.from(downtimeMachineMap.entries())
        .map(([machineId, data]) => {
          let topReason = "N/A";
          let maxMin = 0;
          data.reasons.forEach((min, reason) => {
            if (min > maxMin) { maxMin = min; topReason = reason; }
          });
          return {
            machineId,
            machineName: data.name,
            totalMinutes: data.minutes,
            occurrences: data.occurrences,
            topReason,
            trend: 0, // Would need previous period data
          };
        })
        .sort((a, b) => b.totalMinutes - a.totalMinutes);

      // Downtime by shift
      const downtimeByShift: DowntimeByShift[] = Array.from(downtimeShiftMap.entries())
        .map(([shift, data]) => {
          let topReason = "N/A";
          let maxMin = 0;
          data.reasons.forEach((min, reason) => {
            if (min > maxMin) { maxMin = min; topReason = reason; }
          });
          return {
            shift,
            totalMinutes: data.minutes,
            percentOfTotal: totalDowntime > 0 ? Math.round((data.minutes / totalDowntime) * 100 * 10) / 10 : 0,
            topReason,
          };
        })
        .sort((a, b) => b.totalMinutes - a.totalMinutes);

      // Operators with ranking
      const operators: OperatorPerformance[] = Array.from(operatorMap.values())
        .map(op => ({
          ...op,
          efficiencyPercent: op.totalTarget > 0 ? Math.round((op.totalOk / op.totalTarget) * 100 * 10) / 10 : 0,
          scrapPercent: op.totalActual > 0 ? Math.round((op.totalRejections / op.totalActual) * 100 * 10) / 10 : 0,
        }))
        .sort((a, b) => b.efficiencyPercent - a.efficiencyPercent)
        .map((op, idx, arr) => ({
          ...op,
          rank: idx < arr.length * 0.33 ? "high" as const : idx < arr.length * 0.66 ? "medium" as const : "low" as const,
        }));

      // Machines with ranking
      const machines: MachinePerformance[] = Array.from(machineAggMap.values())
        .map(m => ({
          ...m,
          utilizationPercent: m.expectedRuntime > 0 ? Math.round((m.totalRuntime / m.expectedRuntime) * 100 * 10) / 10 : 0,
          avgEfficiency: m.totalOutput > 0 ? Math.round(((m.totalOutput / (m.totalOutput + m.totalRejections)) * 100) * 10) / 10 : 0,
        }))
        .sort((a, b) => b.utilizationPercent - a.utilizationPercent)
        .map((m, idx, arr) => ({
          ...m,
          rank: idx < arr.length * 0.33 ? "high" as const : idx < arr.length * 0.66 ? "medium" as const : "low" as const,
        }));

      // Items with ranking
      const items: ItemPerformance[] = Array.from(itemMap.values())
        .map(i => ({
          ...i,
          avgEfficiency: i.totalOutput + i.totalRejections > 0 
            ? Math.round((i.totalOutput / (i.totalOutput + i.totalRejections)) * 100 * 10) / 10 
            : 100,
        }))
        .sort((a, b) => a.avgEfficiency - b.avgEfficiency) // Low efficiency first
        .map((i, idx, arr) => ({
          ...i,
          rank: i.avgEfficiency >= 95 ? "high" as const : i.avgEfficiency >= 85 ? "medium" as const : "low" as const,
        }));

      // Rejection Pareto
      const rejectionPareto: RejectionAnalysis[] = Object.entries(rejectionCounts)
        .map(([reason, count]) => ({
          reason,
          count,
          percent: totalRejections > 0 ? Math.round((count / totalRejections) * 100 * 10) / 10 : 0,
        }))
        .sort((a, b) => b.count - a.count);

      // Rejection by item
      const rejectionByItem: RejectionByItem[] = Array.from(rejectionByItemMap.entries())
        .map(([itemCode, data]) => ({
          itemCode,
          total: data.total,
          reasons: Array.from(data.reasons.entries())
            .map(([reason, count]) => ({ reason, count }))
            .sort((a, b) => b.count - a.count),
        }))
        .sort((a, b) => b.total - a.total);

      // Setters with ranking
      const setters: SetterPerformance[] = Array.from(setterAggMap.values())
        .map(s => {
          const avgDuration = s.durations.length > 0 
            ? Math.round(s.durations.reduce((a, b) => a + b, 0) / s.durations.length) 
            : 0;
          const avgDelay = s.delays.length > 0 
            ? Math.round(s.delays.reduce((a, b) => a + b, 0) / s.delays.length) 
            : 0;
          const repeatPenalty = s.setups > 0 ? (s.repeats / s.setups) * 10 : 0;
          const efficiencyScore = avgDuration + (avgDelay * 0.5) + repeatPenalty;
          
          return {
            setterId: s.id,
            setterName: s.name,
            totalSetups: s.setups,
            avgSetupDurationMinutes: avgDuration,
            avgApprovalDelayMinutes: avgDelay,
            repeatSetupCount: s.repeats,
            efficiencyScore: Math.round(efficiencyScore * 10) / 10,
            rank: "medium" as const,
          };
        })
        .sort((a, b) => a.efficiencyScore - b.efficiencyScore) // Lower is better
        .map((s, idx, arr) => ({
          ...s,
          rank: idx < arr.length * 0.33 ? "high" as const : idx < arr.length * 0.66 ? "medium" as const : "low" as const,
        }));

      // Financial impact
      const rejectionCost = totalRejections * REJECTION_COST_PER_PIECE;
      const downtimeCost = (totalDowntime / 60) * HOURLY_COST_ESTIMATE;
      const reworkCost = totalRework * (REJECTION_COST_PER_PIECE * 0.5);

      const financialImpact: FinancialImpact = {
        rejectionCostEstimate: Math.round(rejectionCost),
        downtimeCostEstimate: Math.round(downtimeCost),
        reworkCostEstimate: Math.round(reworkCost),
        totalLossCost: Math.round(rejectionCost + downtimeCost + reworkCost),
        currency: "INR",
      };

      // Processes by productivity
      const processesByProductivity: ProcessPerformance[] = Array.from(processMap.values())
        .map(p => ({
          ...p,
          avgEfficiency: p.totalOutput + p.totalRejections > 0
            ? Math.round((p.totalOutput / (p.totalOutput + p.totalRejections)) * 100 * 10) / 10
            : 100,
        }))
        .sort((a, b) => b.totalOutput - a.totalOutput);

      // Repeat offenders (machines with high downtime)
      const repeatDowntimeOffenders: RepeatOffender[] = downtimeByMachine
        .filter(m => m.occurrences >= 3)
        .slice(0, 5)
        .map(m => ({
          id: m.machineId,
          name: m.machineName,
          type: "machine" as const,
          occurrences: m.occurrences,
          totalMinutes: m.totalMinutes,
          topReason: m.topReason,
        }));

      // Repeat rejection offenders (items with high rejections)
      const repeatRejectionOffenders: RepeatOffender[] = rejectionByItem
        .filter(i => i.total >= 10)
        .slice(0, 5)
        .map(i => ({
          id: i.itemCode,
          name: i.itemCode,
          type: "item" as const,
          occurrences: i.reasons.length,
          topReason: i.reasons[0]?.reason,
        }));

      // Setup loss analysis
      const avgSetupDuration = setterData && setterData.length > 0
        ? Math.round(setterData.filter((s: any) => s.setup_duration_minutes > 0)
            .reduce((sum: number, s: any) => sum + (s.setup_duration_minutes || 0), 0) / setterData.length)
        : 0;

      const setupLossAnalysis: SetupLossAnalysis = {
        totalSetupTimeMinutes: totalSetupTime,
        totalProductiveTimeMinutes: totalProductiveRuntime,
        setupTimePercent: totalProductiveRuntime + totalSetupTime > 0
          ? Math.round((totalSetupTime / (totalProductiveRuntime + totalSetupTime)) * 100 * 10) / 10
          : 0,
        avgSetupDuration,
        changeoverCount: setterData?.length || 0,
        avgChangeoverTime: avgSetupDuration,
      };

      // Set final metrics
      setMetrics({
        capacity,
        efficiency,
        downtimeLosses,
        downtimeByMachine,
        downtimeByShift,
        downtimeByCategory,
        operators,
        machines,
        items,
        rejectionPareto,
        rejectionByItem,
        setters,
        financialImpact,
        shiftComparison: downtimeByShift,
        processesByProductivity,
        repeatDowntimeOffenders,
        repeatRejectionOffenders,
        setupLossAnalysis,
        availableMachines,
        availableOperators,
        availableItems,
        availableProcesses,
        availableShifts,
        logCount: filteredLogs.length,
        dateRange,
      });

    } catch (err: any) {
      console.error("Error loading production performance metrics:", err);
      setError(err.message || "Failed to load metrics");
      setMetrics({ ...emptyMetrics, dateRange });
    } finally {
      setLoading(false);
    }
  }, [dateRange, options.machineId, options.operatorId, options.itemFilter, options.processFilter, options.shiftFilter]);

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
