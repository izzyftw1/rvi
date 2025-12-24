import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * WO Batch Stages Hook
 * 
 * Fetches batch stage breakdown for work orders from production_batches table.
 * Returns quantities per stage for each work order.
 * 
 * This is the SINGLE SOURCE OF TRUTH for stage distribution.
 * Do NOT infer stage from work_orders.current_stage.
 */

export interface WOBatchStageBreakdown {
  production: number;
  external: number;
  externalBreakdown: Record<string, number>; // by process type
  qc: number;
  packing: number;
  dispatched: number;
  totalActive: number;
  stageCount: number; // number of distinct active stages (for "Split Flow" detection)
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
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      
      let query = supabase
        .from('production_batches')
        .select('wo_id, batch_quantity, stage_type, external_process_type, ended_at');
      
      // If specific WO IDs provided, filter to those
      if (woIds && woIds.length > 0) {
        query = query.in('wo_id', woIds);
      }

      const { data, error } = await query;

      if (error) throw error;
      
      setBatches((data || []).map((b: any) => ({
        wo_id: b.wo_id,
        batch_quantity: b.batch_quantity || 0,
        stage_type: b.stage_type || 'production',
        external_process_type: b.external_process_type,
        ended_at: b.ended_at,
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
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadData]);

  // Compute stage breakdown per WO
  const stagesByWO = useMemo<Record<string, WOBatchStageBreakdown>>(() => {
    const result: Record<string, WOBatchStageBreakdown> = {};
    
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
      const qty = batch.batch_quantity;
      const isActive = !batch.ended_at;
      
      switch (batch.stage_type) {
        case 'production':
        case 'cutting':
          breakdown.production += qty;
          if (isActive) breakdown.totalActive += qty;
          break;
        case 'external':
          breakdown.external += qty;
          if (isActive) breakdown.totalActive += qty;
          // Track by process type
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
          // Treat unknown as production
          breakdown.production += qty;
          if (isActive) breakdown.totalActive += qty;
      }
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
  }, [batches]);

  return {
    stagesByWO,
    loading,
    refresh: loadData,
  };
}

// Helper to get breakdown for a single WO (can be used inline)
export function getEmptyBreakdown(): WOBatchStageBreakdown {
  return { ...EMPTY_BREAKDOWN, externalBreakdown: {} };
}
