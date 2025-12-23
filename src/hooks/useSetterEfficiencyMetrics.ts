/**
 * useSetterEfficiencyMetrics Hook
 * 
 * DEDICATED SETTER ANALYTICS - Completely separate from production metrics.
 * 
 * Data Sources:
 * - cnc_programmer_activity (primary source for setup data)
 * - work_orders (reference only - item, WO number)
 * - people (setter names)
 * 
 * Metrics:
 * 1. Setup duration - from setup_start_time → setup_end_time
 * 2. First-off approval delay - time between setup_end_time and first_piece_approval_time
 * 3. Repeat setup faults - same item/WO setups within defined window
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { differenceInMinutes, differenceInHours, parseISO, startOfDay, endOfDay } from "date-fns";

export interface SetterMetrics {
  setterId: string;
  setterName: string;
  totalSetups: number;
  avgSetupDurationMinutes: number;
  totalSetupDurationMinutes: number;
  minSetupDurationMinutes: number;
  maxSetupDurationMinutes: number;
  // First-off approval delay
  avgApprovalDelayMinutes: number;
  maxApprovalDelayMinutes: number;
  setupsWithApprovalData: number;
  // Repeat setup faults
  repeatSetupCount: number;
  repeatSetupItems: string[];
  // Derived efficiency
  efficiencyScore: number; // Lower is better (avg setup time + avg delay penalty)
}

export interface SetupRecord {
  id: string;
  setterId: string;
  setterName: string;
  activityDate: string;
  machineId: string;
  machineName: string;
  woId: string | null;
  woDisplayId: string | null;
  itemCode: string | null;
  setupType: string;
  setupStartTime: string | null;
  setupEndTime: string | null;
  setupDurationMinutes: number;
  firstPieceApprovalTime: string | null;
  approvalDelayMinutes: number | null;
  isRepeatSetup: boolean;
}

export interface SetterEfficiencyMetrics {
  setterMetrics: SetterMetrics[];
  setupRecords: SetupRecord[];
  summary: {
    totalSetups: number;
    avgSetupDuration: number;
    avgApprovalDelay: number;
    totalRepeatSetups: number;
    setterCount: number;
    bestPerformer: string | null;
    worstPerformer: string | null;
  };
  loading: boolean;
  error: string | null;
}

interface UseSetterEfficiencyMetricsParams {
  startDate: string;
  endDate: string;
  setterId?: string;
  machineId?: string;
  repeatWindowHours?: number; // Window to detect repeat setups (default 24h)
}

export function useSetterEfficiencyMetrics({
  startDate,
  endDate,
  setterId,
  machineId,
  repeatWindowHours = 24,
}: UseSetterEfficiencyMetricsParams): SetterEfficiencyMetrics & { refresh: () => void } {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rawData, setRawData] = useState<any[]>([]);
  const [people, setPeople] = useState<Map<string, string>>(new Map());
  const [machines, setMachines] = useState<Map<string, string>>(new Map());
  const [workOrders, setWorkOrders] = useState<Map<string, { displayId: string; itemCode: string }>>(new Map());

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Build query for cnc_programmer_activity
      let query = supabase
        .from("cnc_programmer_activity")
        .select(`
          id,
          programmer_id,
          machine_id,
          wo_id,
          item_code,
          activity_date,
          setup_type,
          setup_start_time,
          setup_end_time,
          setup_duration_minutes,
          first_piece_approval_time,
          created_at
        `)
        .gte("activity_date", startDate)
        .lte("activity_date", endDate)
        .order("activity_date", { ascending: true })
        .order("setup_start_time", { ascending: true });

      if (setterId) {
        query = query.eq("programmer_id", setterId);
      }
      if (machineId) {
        query = query.eq("machine_id", machineId);
      }

      const { data: activityData, error: activityError } = await query;

      if (activityError) throw activityError;

      // Fetch people for setter names
      const setterIds = [...new Set((activityData || []).map(a => a.programmer_id).filter(Boolean))];
      if (setterIds.length > 0) {
        const { data: peopleData } = await supabase
          .from("people")
          .select("id, full_name")
          .in("id", setterIds);
        
        const peopleMap = new Map((peopleData || []).map(p => [p.id, p.full_name]));
        setPeople(peopleMap);
      }

      // Fetch machines for machine names
      const machineIds = [...new Set((activityData || []).map(a => a.machine_id).filter(Boolean))];
      if (machineIds.length > 0) {
        const { data: machinesData } = await supabase
          .from("machines")
          .select("id, machine_id, name")
          .in("id", machineIds);
        
        const machinesMap = new Map((machinesData || []).map(m => [m.id, m.name || m.machine_id]));
        setMachines(machinesMap);
      }

      // Fetch work orders for display IDs (reference only)
      const woIds = [...new Set((activityData || []).map(a => a.wo_id).filter(Boolean))];
      if (woIds.length > 0) {
        const { data: woData } = await supabase
          .from("work_orders")
          .select("id, display_id, item_code")
          .in("id", woIds);
        
        const woMap = new Map((woData || []).map(wo => [wo.id, { displayId: wo.display_id || wo.id, itemCode: wo.item_code }]));
        setWorkOrders(woMap);
      }

      setRawData(activityData || []);
    } catch (err: any) {
      console.error("Error fetching setter efficiency data:", err);
      setError(err.message || "Failed to load setter efficiency data");
      setRawData([]);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, setterId, machineId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Process raw data into metrics
  const processedData = useMemo(() => {
    if (rawData.length === 0) {
      return {
        setterMetrics: [],
        setupRecords: [],
        summary: {
          totalSetups: 0,
          avgSetupDuration: 0,
          avgApprovalDelay: 0,
          totalRepeatSetups: 0,
          setterCount: 0,
          bestPerformer: null,
          worstPerformer: null,
        },
      };
    }

    // Track setups by item+wo for repeat detection
    const setupHistory: Map<string, { timestamp: Date; setterId: string }[]> = new Map();
    
    // Process each activity record into SetupRecord
    const setupRecords: SetupRecord[] = rawData.map(activity => {
      const setterId = activity.programmer_id || "unknown";
      const setterName = people.get(setterId) || "Unknown Setter";
      const woInfo = activity.wo_id ? workOrders.get(activity.wo_id) : null;
      
      // Calculate setup duration
      let setupDurationMinutes = activity.setup_duration_minutes || 0;
      if (!setupDurationMinutes && activity.setup_start_time && activity.setup_end_time) {
        setupDurationMinutes = differenceInMinutes(
          parseISO(activity.setup_end_time),
          parseISO(activity.setup_start_time)
        );
      }

      // Calculate approval delay
      let approvalDelayMinutes: number | null = null;
      if (activity.setup_end_time && activity.first_piece_approval_time) {
        approvalDelayMinutes = differenceInMinutes(
          parseISO(activity.first_piece_approval_time),
          parseISO(activity.setup_end_time)
        );
        // Cap negative values (shouldn't happen but defensive)
        if (approvalDelayMinutes < 0) approvalDelayMinutes = 0;
      }

      // Detect repeat setups
      const itemKey = `${activity.item_code || 'unknown'}-${activity.wo_id || 'unknown'}`;
      const currentTimestamp = activity.setup_start_time 
        ? parseISO(activity.setup_start_time) 
        : parseISO(activity.activity_date);
      
      let isRepeatSetup = false;
      const existingSetups = setupHistory.get(itemKey) || [];
      
      // Check if there's a previous setup within the window
      for (const prev of existingSetups) {
        const hoursDiff = differenceInHours(currentTimestamp, prev.timestamp);
        if (hoursDiff <= repeatWindowHours && hoursDiff >= 0) {
          isRepeatSetup = true;
          break;
        }
      }
      
      // Add to history
      existingSetups.push({ timestamp: currentTimestamp, setterId });
      setupHistory.set(itemKey, existingSetups);

      return {
        id: activity.id,
        setterId,
        setterName,
        activityDate: activity.activity_date,
        machineId: activity.machine_id,
        machineName: machines.get(activity.machine_id) || "Unknown Machine",
        woId: activity.wo_id,
        woDisplayId: woInfo?.displayId || null,
        itemCode: activity.item_code || woInfo?.itemCode || null,
        setupType: activity.setup_type || "standard",
        setupStartTime: activity.setup_start_time,
        setupEndTime: activity.setup_end_time,
        setupDurationMinutes,
        firstPieceApprovalTime: activity.first_piece_approval_time,
        approvalDelayMinutes,
        isRepeatSetup,
      };
    });

    // Aggregate by setter
    const setterGroups = new Map<string, SetupRecord[]>();
    for (const record of setupRecords) {
      const existing = setterGroups.get(record.setterId) || [];
      existing.push(record);
      setterGroups.set(record.setterId, existing);
    }

    const setterMetrics: SetterMetrics[] = Array.from(setterGroups.entries()).map(([setterId, records]) => {
      const setterName = records[0]?.setterName || "Unknown";
      const totalSetups = records.length;
      
      // Setup duration stats
      const durations = records.map(r => r.setupDurationMinutes).filter(d => d > 0);
      const totalSetupDurationMinutes = durations.reduce((sum, d) => sum + d, 0);
      const avgSetupDurationMinutes = durations.length > 0 
        ? Math.round(totalSetupDurationMinutes / durations.length) 
        : 0;
      const minSetupDurationMinutes = durations.length > 0 ? Math.min(...durations) : 0;
      const maxSetupDurationMinutes = durations.length > 0 ? Math.max(...durations) : 0;

      // Approval delay stats
      const delays = records
        .map(r => r.approvalDelayMinutes)
        .filter((d): d is number => d !== null && d >= 0);
      const setupsWithApprovalData = delays.length;
      const avgApprovalDelayMinutes = delays.length > 0 
        ? Math.round(delays.reduce((sum, d) => sum + d, 0) / delays.length) 
        : 0;
      const maxApprovalDelayMinutes = delays.length > 0 ? Math.max(...delays) : 0;

      // Repeat setups
      const repeatRecords = records.filter(r => r.isRepeatSetup);
      const repeatSetupCount = repeatRecords.length;
      const repeatSetupItems = [...new Set(repeatRecords.map(r => r.itemCode).filter(Boolean))] as string[];

      // Efficiency score (lower is better): avg setup time + (avg delay * 0.5) + (repeat % * 10)
      const repeatPenalty = totalSetups > 0 ? (repeatSetupCount / totalSetups) * 10 : 0;
      const efficiencyScore = avgSetupDurationMinutes + (avgApprovalDelayMinutes * 0.5) + repeatPenalty;

      return {
        setterId,
        setterName,
        totalSetups,
        avgSetupDurationMinutes,
        totalSetupDurationMinutes,
        minSetupDurationMinutes,
        maxSetupDurationMinutes,
        avgApprovalDelayMinutes,
        maxApprovalDelayMinutes,
        setupsWithApprovalData,
        repeatSetupCount,
        repeatSetupItems,
        efficiencyScore: Math.round(efficiencyScore * 10) / 10,
      };
    });

    // Sort by efficiency score (lower is better)
    setterMetrics.sort((a, b) => a.efficiencyScore - b.efficiencyScore);

    // Summary
    const totalSetups = setupRecords.length;
    const allDurations = setupRecords.map(r => r.setupDurationMinutes).filter(d => d > 0);
    const allDelays = setupRecords
      .map(r => r.approvalDelayMinutes)
      .filter((d): d is number => d !== null && d >= 0);
    const totalRepeatSetups = setupRecords.filter(r => r.isRepeatSetup).length;

    const summary = {
      totalSetups,
      avgSetupDuration: allDurations.length > 0 
        ? Math.round(allDurations.reduce((sum, d) => sum + d, 0) / allDurations.length) 
        : 0,
      avgApprovalDelay: allDelays.length > 0 
        ? Math.round(allDelays.reduce((sum, d) => sum + d, 0) / allDelays.length) 
        : 0,
      totalRepeatSetups,
      setterCount: setterMetrics.length,
      bestPerformer: setterMetrics.length > 0 ? setterMetrics[0].setterName : null,
      worstPerformer: setterMetrics.length > 0 ? setterMetrics[setterMetrics.length - 1].setterName : null,
    };

    return { setterMetrics, setupRecords, summary };
  }, [rawData, people, machines, workOrders, repeatWindowHours]);

  return {
    ...processedData,
    loading,
    error,
    refresh: fetchData,
  };
}
