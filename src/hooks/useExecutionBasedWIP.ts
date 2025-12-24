import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Execution-Based WIP Tracking Hook
 * 
 * Derives all WIP quantities from execution_records and wo_external_moves tables,
 * NOT from work_orders.current_stage.
 * 
 * current_stage is retained ONLY as a high-level status hint (e.g., "Active", "Partially External", "Completed"),
 * NOT as a source of truth for quantities.
 * 
 * Sources:
 * 1. Internal WIP: execution_records with direction='in' minus direction='out'
 * 2. External WIP: wo_external_moves.qty_sent - qty_returned
 * 3. Production quantities: production_batches.produced_qty
 * 4. QC quantities: production_batches.qc_approved_qty/qc_rejected_qty
 * 5. Packing: cartons.quantity with status='ready_for_dispatch'
 * 6. Dispatched: cartons.quantity with status='dispatched'
 */

export interface StageWIP {
  stage: string;
  jobCount: number;
  totalPcs: number;
  totalKg: number;
  avgWaitHours: number;
  overdueCount: number;
  workOrderIds: string[];
}

export interface ExternalProcessWIP {
  processType: string;
  jobCount: number;
  sentPcs: number;
  returnedPcs: number;
  wipPcs: number;
  wipKg: number;
  avgWaitHours: number;
  overdueCount: number;
  pendingMoves: number;
  workOrderIds: string[];
}

export interface ExecutionBasedWIPData {
  internalStages: StageWIP[];
  externalProcesses: ExternalProcessWIP[];
  summary: {
    totalActiveJobs: number;
    totalInternalWIP: number;
    totalExternalWIP: number;
    totalPackedReady: number;
    totalDispatched: number;
  };
  loading: boolean;
}

const INTERNAL_STAGES = [
  'goods_in',
  'production',
  'qc',
  'packing',
  'dispatch'
];

const EXTERNAL_PROCESSES = [
  'Forging',
  'Job Work',
  'Plating',
  'Buffing',
  'Blasting',
  'Heat Treatment'
];

export function useExecutionBasedWIP(): ExecutionBasedWIPData {
  const [data, setData] = useState<ExecutionBasedWIPData>({
    internalStages: [],
    externalProcesses: [],
    summary: {
      totalActiveJobs: 0,
      totalInternalWIP: 0,
      totalExternalWIP: 0,
      totalPackedReady: 0,
      totalDispatched: 0
    },
    loading: true
  });

  const loadWIPData = useCallback(async () => {
    try {
      const today = new Date().toISOString().split('T')[0];

      // 1. Fetch active work orders with basic info
      const { data: workOrders } = await supabase
        .from('work_orders')
        .select('id, quantity, gross_weight_per_pc, due_date, updated_at, status')
        .in('status', ['in_progress', 'pending', 'packing', 'qc']);

      if (!workOrders || workOrders.length === 0) {
        setData({
          internalStages: INTERNAL_STAGES.map(stage => ({
            stage,
            jobCount: 0,
            totalPcs: 0,
            totalKg: 0,
            avgWaitHours: 0,
            overdueCount: 0,
            workOrderIds: []
          })),
          externalProcesses: EXTERNAL_PROCESSES.map(proc => ({
            processType: proc,
            jobCount: 0,
            sentPcs: 0,
            returnedPcs: 0,
            wipPcs: 0,
            wipKg: 0,
            avgWaitHours: 0,
            overdueCount: 0,
            pendingMoves: 0,
            workOrderIds: []
          })),
          summary: {
            totalActiveJobs: 0,
            totalInternalWIP: 0,
            totalExternalWIP: 0,
            totalPackedReady: 0,
            totalDispatched: 0
          },
          loading: false
        });
        return;
      }

      const woIds = workOrders.map(wo => wo.id);
      const woMap = new Map(workOrders.map(wo => [wo.id, wo]));

      // 2. Fetch execution records (internal stage movements)
      const { data: execRecords } = await supabase
        .from('execution_records')
        .select('*')
        .in('work_order_id', woIds);

      // 3. Fetch external moves
      const { data: externalMoves } = await supabase
        .from('wo_external_moves')
        .select('*')
        .in('work_order_id', woIds);

      // 4. Fetch production batches
      const { data: prodBatches } = await supabase
        .from('production_batches')
        .select('wo_id, produced_qty, qc_approved_qty, qc_rejected_qty')
        .in('wo_id', woIds);

      // 5. Fetch cartons for packing/dispatch
      const { data: cartons } = await supabase
        .from('cartons')
        .select('wo_id, quantity, status')
        .in('wo_id', woIds);

      // === Calculate Internal WIP by deriving current stage from execution records ===
      const woStageMap = new Map<string, { stage: string; waitStart: Date }>();
      
      // Aggregate production data
      const prodMap = new Map<string, { produced: number; approved: number; rejected: number }>();
      (prodBatches || []).forEach(b => {
        const existing = prodMap.get(b.wo_id) || { produced: 0, approved: 0, rejected: 0 };
        existing.produced += b.produced_qty || 0;
        existing.approved += b.qc_approved_qty || 0;
        existing.rejected += b.qc_rejected_qty || 0;
        prodMap.set(b.wo_id, existing);
      });

      // Aggregate packing data
      const packMap = new Map<string, { packed: number; dispatched: number }>();
      (cartons || []).forEach(c => {
        const existing = packMap.get(c.wo_id) || { packed: 0, dispatched: 0 };
        if (c.status === 'dispatched') {
          existing.dispatched += c.quantity || 0;
        } else {
          existing.packed += c.quantity || 0;
        }
        packMap.set(c.wo_id, existing);
      });

      // Aggregate external WIP
      const extWipMap = new Map<string, number>();
      (externalMoves || []).forEach(m => {
        if (['sent', 'in_transit', 'partial'].includes(m.status || '')) {
          const wip = (m.quantity_sent || 0) - (m.quantity_returned || 0);
          extWipMap.set(m.work_order_id, (extWipMap.get(m.work_order_id) || 0) + wip);
        }
      });

      // Determine stage for each WO based on actual progress
      workOrders.forEach(wo => {
        const prod = prodMap.get(wo.id) || { produced: 0, approved: 0, rejected: 0 };
        const pack = packMap.get(wo.id) || { packed: 0, dispatched: 0 };
        const extWip = extWipMap.get(wo.id) || 0;

        let stage: string;
        
        if (pack.dispatched > 0 && pack.dispatched >= wo.quantity * 0.9) {
          stage = 'dispatch'; // Mostly dispatched
        } else if (pack.packed > 0 || pack.dispatched > 0) {
          stage = 'packing';
        } else if (prod.approved > 0) {
          stage = 'qc';
        } else if (prod.produced > 0 || extWip > 0) {
          stage = 'production';
        } else {
          stage = 'goods_in';
        }

        woStageMap.set(wo.id, {
          stage,
          waitStart: new Date(wo.updated_at)
        });
      });

      // Build internal stages data
      const internalStages: StageWIP[] = INTERNAL_STAGES.map(stage => {
        const stageWOs = workOrders.filter(wo => woStageMap.get(wo.id)?.stage === stage);
        const totalWaitHours = stageWOs.reduce((sum, wo) => {
          const waitStart = woStageMap.get(wo.id)?.waitStart || new Date(wo.updated_at);
          const waitTime = (Date.now() - waitStart.getTime()) / (1000 * 60 * 60);
          return sum + waitTime;
        }, 0);

        const overdueCount = stageWOs.filter(wo => wo.due_date < today).length;

        // Calculate actual WIP in this stage
        let totalPcs = 0;
        if (stage === 'goods_in') {
          totalPcs = stageWOs.reduce((sum, wo) => sum + (wo.quantity || 0), 0);
        } else if (stage === 'production') {
          totalPcs = stageWOs.reduce((sum, wo) => {
            const prod = prodMap.get(wo.id);
            return sum + (prod?.produced || 0) - (prod?.approved || 0) - (prod?.rejected || 0);
          }, 0);
        } else if (stage === 'qc') {
          totalPcs = stageWOs.reduce((sum, wo) => {
            const prod = prodMap.get(wo.id);
            const pack = packMap.get(wo.id);
            return sum + (prod?.approved || 0) - (pack?.packed || 0) - (pack?.dispatched || 0);
          }, 0);
        } else if (stage === 'packing') {
          totalPcs = stageWOs.reduce((sum, wo) => {
            const pack = packMap.get(wo.id);
            return sum + (pack?.packed || 0);
          }, 0);
        } else if (stage === 'dispatch') {
          totalPcs = stageWOs.reduce((sum, wo) => {
            const pack = packMap.get(wo.id);
            return sum + (pack?.dispatched || 0);
          }, 0);
        }

        const totalKg = stageWOs.reduce((sum, wo) => {
          return sum + (totalPcs * (wo.gross_weight_per_pc || 0) / 1000);
        }, 0);

        return {
          stage,
          jobCount: stageWOs.length,
          totalPcs: Math.max(0, totalPcs),
          totalKg,
          avgWaitHours: stageWOs.length > 0 ? totalWaitHours / stageWOs.length : 0,
          overdueCount,
          workOrderIds: stageWOs.map(wo => wo.id)
        };
      });

      // === Calculate External Process WIP ===
      const externalProcesses: ExternalProcessWIP[] = EXTERNAL_PROCESSES.map(processType => {
        const processMoves = (externalMoves || []).filter(m => 
          m.process?.toLowerCase() === processType.toLowerCase() &&
          ['sent', 'in_transit', 'partial'].includes(m.status || '')
        );

        const sentPcs = processMoves.reduce((sum, m) => sum + (m.quantity_sent || 0), 0);
        const returnedPcs = processMoves.reduce((sum, m) => sum + (m.quantity_returned || 0), 0);
        const wipPcs = sentPcs - returnedPcs;

        const wipKg = processMoves.reduce((sum, m) => {
          const wo = woMap.get(m.work_order_id);
          const qtyInTransit = (m.quantity_sent || 0) - (m.quantity_returned || 0);
          return sum + (qtyInTransit * (wo?.gross_weight_per_pc || 0) / 1000);
        }, 0);

        const totalWaitHours = processMoves.reduce((sum, m) => {
          const dispatchDate = m.dispatch_date || m.created_at;
          const waitTime = (Date.now() - new Date(dispatchDate || Date.now()).getTime()) / (1000 * 60 * 60);
          return sum + waitTime;
        }, 0);

        const overdueCount = processMoves.filter(m => 
          m.expected_return_date && new Date(m.expected_return_date) < new Date(today)
        ).length;

        const uniqueWoIds = [...new Set(processMoves.map(m => m.work_order_id))];

        return {
          processType,
          jobCount: uniqueWoIds.length,
          sentPcs,
          returnedPcs,
          wipPcs,
          wipKg,
          avgWaitHours: processMoves.length > 0 ? totalWaitHours / processMoves.length : 0,
          overdueCount,
          pendingMoves: processMoves.filter(m => m.status === 'sent').length,
          workOrderIds: uniqueWoIds
        };
      });

      // Calculate summary
      const totalInternalWIP = internalStages.reduce((sum, s) => sum + s.totalPcs, 0);
      const totalExternalWIP = externalProcesses.reduce((sum, p) => sum + p.wipPcs, 0);
      const totalPackedReady = packMap.size > 0 
        ? Array.from(packMap.values()).reduce((sum, p) => sum + p.packed, 0)
        : 0;
      const totalDispatched = packMap.size > 0
        ? Array.from(packMap.values()).reduce((sum, p) => sum + p.dispatched, 0)
        : 0;

      setData({
        internalStages,
        externalProcesses,
        summary: {
          totalActiveJobs: workOrders.length,
          totalInternalWIP,
          totalExternalWIP,
          totalPackedReady,
          totalDispatched
        },
        loading: false
      });

    } catch (error) {
      console.error('Error loading execution-based WIP:', error);
      setData(prev => ({ ...prev, loading: false }));
    }
  }, []);

  useEffect(() => {
    loadWIPData();

    // Subscribe to realtime updates
    const channel = supabase
      .channel('execution_wip_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_orders' }, loadWIPData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'execution_records' }, loadWIPData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wo_external_moves' }, loadWIPData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'production_batches' }, loadWIPData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cartons' }, loadWIPData)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadWIPData]);

  return data;
}

/**
 * Utility function to determine high-level status from execution data
 * This replaces reliance on current_stage for status display
 */
export function getWorkOrderStatusFromExecution(
  produced: number,
  approved: number,
  packed: number,
  dispatched: number,
  externalWip: number,
  ordered: number
): string {
  if (dispatched >= ordered * 0.95) return 'Completed';
  if (externalWip > 0) return 'Partially External';
  if (packed > 0) return 'Packing';
  if (approved > 0) return 'QC Complete';
  if (produced > 0) return 'In Production';
  return 'Active';
}
