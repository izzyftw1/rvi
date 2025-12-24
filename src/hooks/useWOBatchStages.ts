import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * WO Batch Stages Hook
 * 
 * Derives stage breakdown from:
 * 1. production_batches - for batches with actual batch_quantity
 * 2. wo_external_moves - for external processing quantities
 * 3. work_orders.quantity - fallback when batch_quantity is 0
 * 
 * This is the SINGLE SOURCE OF TRUTH for stage distribution.
 */

export interface WOBatchStageBreakdown {
  production: number;
  external: number;
  externalBreakdown: Record<string, number>; // by process type
  qc: number;
  packing: number;
  dispatched: number;
  totalActive: number;
  stageCount: number;
  isSplitFlow: boolean;
}

export interface WOBatchStagesData {
  stagesByWO: Record<string, WOBatchStageBreakdown>;
  loading: boolean;
  refresh: () => void;
}

interface BatchRecord {
  wo_id: string;
  batch_quantity: number;
  stage_type: string;
  external_process_type: string | null;
  ended_at: string | null;
  wo_quantity?: number; // from joined work_orders
}

interface ExternalMoveRecord {
  work_order_id: string;
  process: string;
  quantity_sent: number;
  quantity_returned: number;
  status: string;
}

const EMPTY_BREAKDOWN: WOBatchStageBreakdown = {
  production: 0,
  external: 0,
  externalBreakdown: {},
  qc: 0,
  packing: 0,
  dispatched: 0,
  totalActive: 0,
  stageCount: 0,
  isSplitFlow: false,
};

export function useWOBatchStages(woIds?: string[]): WOBatchStagesData {
  const [batches, setBatches] = useState<BatchRecord[]>([]);
  const [externalMoves, setExternalMoves] = useState<ExternalMoveRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      
      // Build base query for production_batches with work_orders join for fallback quantity
      let batchQuery = supabase
        .from('production_batches')
        .select(`
          wo_id, 
          batch_quantity, 
          stage_type, 
          external_process_type, 
          ended_at,
          work_orders!inner(quantity)
        `);
      
      let externalQuery = supabase
        .from('wo_external_moves')
        .select('work_order_id, process, quantity_sent, quantity_returned, status')
        .not('status', 'in', '("received_full","cancelled")');
      
      // If specific WO IDs provided, filter to those
      if (woIds && woIds.length > 0) {
        batchQuery = batchQuery.in('wo_id', woIds);
        externalQuery = externalQuery.in('work_order_id', woIds);
      }

      const [batchResult, externalResult] = await Promise.all([
        batchQuery,
        externalQuery
      ]);

      if (batchResult.error) throw batchResult.error;
      if (externalResult.error) throw externalResult.error;
      
      setBatches((batchResult.data || []).map((b: any) => ({
        wo_id: b.wo_id,
        batch_quantity: b.batch_quantity || 0,
        stage_type: b.stage_type || 'production',
        external_process_type: b.external_process_type,
        ended_at: b.ended_at,
        wo_quantity: b.work_orders?.quantity || 0,
      })));
      
      setExternalMoves((externalResult.data || []).map((m: any) => ({
        work_order_id: m.work_order_id,
        process: m.process || 'Unknown',
        quantity_sent: m.quantity_sent || 0,
        quantity_returned: m.quantity_returned || 0,
        status: m.status,
      })));
    } catch (error) {
      console.error('Error loading WO batch stages:', error);
    } finally {
      setLoading(false);
    }
  }, [woIds?.join(',')]);

  useEffect(() => {
    loadData();

    // Real-time subscription
    const channel = supabase
      .channel('wo-batch-stages-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'production_batches' },
        () => loadData()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'wo_external_moves' },
        () => loadData()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadData]);

  // Compute stage breakdown per WO
  const stagesByWO = useMemo<Record<string, WOBatchStageBreakdown>>(() => {
    const result: Record<string, WOBatchStageBreakdown> = {};
    
    // First, process external moves (these are the definitive source for external quantities)
    const externalByWO: Record<string, { total: number; byProcess: Record<string, number> }> = {};
    externalMoves.forEach(move => {
      const woId = move.work_order_id;
      if (!externalByWO[woId]) {
        externalByWO[woId] = { total: 0, byProcess: {} };
      }
      // External WIP = sent - returned
      const wip = move.quantity_sent - move.quantity_returned;
      if (wip > 0) {
        externalByWO[woId].total += wip;
        externalByWO[woId].byProcess[move.process] = 
          (externalByWO[woId].byProcess[move.process] || 0) + wip;
      }
    });
    
    // Now process batches
    batches.forEach(batch => {
      if (!result[batch.wo_id]) {
        result[batch.wo_id] = {
          production: 0,
          external: 0,
          externalBreakdown: {},
          qc: 0,
          packing: 0,
          dispatched: 0,
          totalActive: 0,
          stageCount: 0,
          isSplitFlow: false,
        };
      }
      
      const breakdown = result[batch.wo_id];
      // Use batch_quantity if set, otherwise fall back to WO quantity
      const qty = batch.batch_quantity > 0 ? batch.batch_quantity : batch.wo_quantity || 0;
      const isActive = !batch.ended_at;
      
      switch (batch.stage_type) {
        case 'production':
        case 'cutting':
          breakdown.production += qty;
          if (isActive) breakdown.totalActive += qty;
          break;
        case 'external':
          // External from batches - but prefer external moves data
          breakdown.external += qty;
          if (isActive) breakdown.totalActive += qty;
          const process = batch.external_process_type || 'Unknown';
          breakdown.externalBreakdown[process] = (breakdown.externalBreakdown[process] || 0) + qty;
          break;
        case 'qc':
          breakdown.qc += qty;
          if (isActive) breakdown.totalActive += qty;
          break;
        case 'packing':
          breakdown.packing += qty;
          if (isActive) breakdown.totalActive += qty;
          break;
        case 'dispatched':
        case 'dispatch':
          breakdown.dispatched += qty;
          break;
        default:
          breakdown.production += qty;
          if (isActive) breakdown.totalActive += qty;
      }
    });
    
    // Apply external moves data - this overrides/supplements batch-based external data
    Object.entries(externalByWO).forEach(([woId, externalData]) => {
      if (!result[woId]) {
        result[woId] = {
          production: 0,
          external: 0,
          externalBreakdown: {},
          qc: 0,
          packing: 0,
          dispatched: 0,
          totalActive: 0,
          stageCount: 0,
          isSplitFlow: false,
        };
      }
      // Use external moves as the source of truth for external WIP
      result[woId].external = externalData.total;
      result[woId].externalBreakdown = { ...externalData.byProcess };
      result[woId].totalActive += externalData.total;
    });
    
    // Calculate stage count and isSplitFlow for each WO
    Object.values(result).forEach(breakdown => {
      let activeStages = 0;
      if (breakdown.production > 0) activeStages++;
      if (breakdown.external > 0) activeStages++;
      if (breakdown.qc > 0) activeStages++;
      if (breakdown.packing > 0) activeStages++;
      
      breakdown.stageCount = activeStages;
      breakdown.isSplitFlow = activeStages > 1;
    });
    
    return result;
  }, [batches, externalMoves]);

  return {
    stagesByWO,
    loading,
    refresh: loadData,
  };
}

// Helper to get breakdown for a single WO
export function getEmptyBreakdown(): WOBatchStageBreakdown {
  return { ...EMPTY_BREAKDOWN, externalBreakdown: {} };
}
