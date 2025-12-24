import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ProductionBatch, BatchStageType, BatchStatus } from "./useProductionBatch";

/**
 * Batch Stage Tracking Hook
 * 
 * Provides stage-based queries for production batches.
 * production_batches is the single source of truth for:
 * - Stage location (cutting, production, external, qc, packing, dispatched)
 * - Quantity in each stage
 * - Internal vs External processing
 */

export interface StageSummary {
  stage: BatchStageType;
  totalBatches: number;
  totalQuantity: number;
  inQueue: number;
  inProgress: number;
  completed: number;
}

export interface BatchesByStage {
  cutting: ProductionBatch[];
  production: ProductionBatch[];
  external: ProductionBatch[];
  qc: ProductionBatch[];
  packing: ProductionBatch[];
  dispatched: ProductionBatch[];
}

/**
 * Get all batches for a work order grouped by stage
 */
export async function getBatchesByStageForWO(woId: string): Promise<BatchesByStage> {
  const empty: BatchesByStage = {
    cutting: [],
    production: [],
    external: [],
    qc: [],
    packing: [],
    dispatched: []
  };
  
  if (!woId) return empty;
  
  const { data, error } = await supabase
    .from('production_batches')
    .select('*')
    .eq('wo_id', woId)
    .order('batch_number', { ascending: true });
  
  if (error || !data) {
    console.error('Error fetching batches by stage:', error);
    return empty;
  }
  
  const batches = data as unknown as ProductionBatch[];
  
  return {
    cutting: batches.filter(b => b.stage_type === 'cutting'),
    production: batches.filter(b => b.stage_type === 'production'),
    external: batches.filter(b => b.stage_type === 'external'),
    qc: batches.filter(b => b.stage_type === 'qc'),
    packing: batches.filter(b => b.stage_type === 'packing'),
    dispatched: batches.filter(b => b.stage_type === 'dispatched')
  };
}

/**
 * Get stage summary for a work order
 */
export async function getWOStageSummary(woId: string): Promise<StageSummary[]> {
  if (!woId) return [];
  
  const batches = await getBatchesByStageForWO(woId);
  const stages: BatchStageType[] = ['cutting', 'production', 'external', 'qc', 'packing', 'dispatched'];
  
  return stages.map(stage => {
    const stageBatches = batches[stage];
    return {
      stage,
      totalBatches: stageBatches.length,
      totalQuantity: stageBatches.reduce((sum, b) => sum + (b.batch_quantity || 0), 0),
      inQueue: stageBatches.filter(b => b.batch_status === 'in_queue').length,
      inProgress: stageBatches.filter(b => b.batch_status === 'in_progress').length,
      completed: stageBatches.filter(b => b.batch_status === 'completed').length
    };
  });
}

/**
 * Get all active batches across all work orders for a specific stage
 */
export async function getActiveBatchesByStage(
  stageType: BatchStageType,
  status?: BatchStatus
): Promise<ProductionBatch[]> {
  let query = supabase
    .from('production_batches')
    .select('*')
    .eq('stage_type', stageType)
    .is('ended_at', null);
  
  if (status) {
    query = query.eq('batch_status', status);
  }
  
  const { data, error } = await query.order('stage_entered_at', { ascending: true });
  
  if (error) {
    console.error('Error fetching active batches by stage:', error);
    return [];
  }
  
  return (data as unknown as ProductionBatch[]) || [];
}

/**
 * Get external batches with process type details
 */
export async function getExternalBatches(processType?: string): Promise<ProductionBatch[]> {
  let query = supabase
    .from('production_batches')
    .select('*')
    .eq('stage_type', 'external')
    .is('ended_at', null);
  
  if (processType) {
    query = query.eq('external_process_type', processType);
  }
  
  const { data, error } = await query.order('stage_entered_at', { ascending: true });
  
  if (error) {
    console.error('Error fetching external batches:', error);
    return [];
  }
  
  return (data as unknown as ProductionBatch[]) || [];
}

/**
 * Move batch to a new stage
 */
export async function moveBatchToStage(
  batchId: string,
  newStage: BatchStageType,
  options?: {
    externalProcessType?: string;
    externalPartnerId?: string;
    newStatus?: BatchStatus;
  }
): Promise<boolean> {
  const updateData: Record<string, unknown> = {
    stage_type: newStage,
    stage_entered_at: new Date().toISOString(),
    batch_status: options?.newStatus || 'in_queue'
  };
  
  if (newStage === 'external') {
    updateData.external_process_type = options?.externalProcessType || null;
    updateData.external_partner_id = options?.externalPartnerId || null;
  } else {
    updateData.external_process_type = null;
    updateData.external_partner_id = null;
  }
  
  const { error } = await supabase
    .from('production_batches')
    .update(updateData)
    .eq('id', batchId);
  
  if (error) {
    console.error('Error moving batch to stage:', error);
    return false;
  }
  
  return true;
}

/**
 * Update batch status within current stage
 */
export async function updateBatchStatus(
  batchId: string,
  newStatus: BatchStatus
): Promise<boolean> {
  const { error } = await supabase
    .from('production_batches')
    .update({ batch_status: newStatus })
    .eq('id', batchId);
  
  if (error) {
    console.error('Error updating batch status:', error);
    return false;
  }
  
  return true;
}

/**
 * Update batch quantity
 */
export async function updateBatchQuantity(
  batchId: string,
  quantity: number
): Promise<boolean> {
  const { error } = await supabase
    .from('production_batches')
    .update({ batch_quantity: quantity })
    .eq('id', batchId);
  
  if (error) {
    console.error('Error updating batch quantity:', error);
    return false;
  }
  
  return true;
}

/**
 * Hook for real-time batch stage tracking for a work order
 */
export function useBatchStageTracking(woId: string | undefined) {
  const [batchesByStage, setBatchesByStage] = useState<BatchesByStage>({
    cutting: [],
    production: [],
    external: [],
    qc: [],
    packing: [],
    dispatched: []
  });
  const [stageSummary, setStageSummary] = useState<StageSummary[]>([]);
  const [loading, setLoading] = useState(true);
  
  const loadData = useCallback(async () => {
    if (!woId) {
      setLoading(false);
      return;
    }
    
    setLoading(true);
    const [batches, summary] = await Promise.all([
      getBatchesByStageForWO(woId),
      getWOStageSummary(woId)
    ]);
    
    setBatchesByStage(batches);
    setStageSummary(summary);
    setLoading(false);
  }, [woId]);
  
  useEffect(() => {
    loadData();
    
    if (!woId) return;
    
    // Subscribe to real-time updates
    const channel = supabase
      .channel(`batch-stages-${woId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'production_batches',
          filter: `wo_id=eq.${woId}`
        },
        () => {
          loadData();
        }
      )
      .subscribe();
    
    return () => {
      supabase.removeChannel(channel);
    };
  }, [woId, loadData]);
  
  return {
    batchesByStage,
    stageSummary,
    loading,
    refresh: loadData,
    moveBatchToStage,
    updateBatchStatus,
    updateBatchQuantity
  };
}

/**
 * Hook for factory-wide stage overview
 */
export function useFactoryStageOverview() {
  const [stageData, setStageData] = useState<Record<BatchStageType, ProductionBatch[]>>({
    cutting: [],
    production: [],
    external: [],
    qc: [],
    packing: [],
    dispatched: []
  });
  const [loading, setLoading] = useState(true);
  
  const loadData = useCallback(async () => {
    setLoading(true);
    
    const stages: BatchStageType[] = ['cutting', 'production', 'external', 'qc', 'packing', 'dispatched'];
    const results = await Promise.all(
      stages.map(stage => getActiveBatchesByStage(stage))
    );
    
    setStageData({
      cutting: results[0],
      production: results[1],
      external: results[2],
      qc: results[3],
      packing: results[4],
      dispatched: results[5]
    });
    
    setLoading(false);
  }, []);
  
  useEffect(() => {
    loadData();
    
    // Subscribe to real-time updates
    const channel = supabase
      .channel('factory-stage-overview')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'production_batches'
        },
        () => {
          loadData();
        }
      )
      .subscribe();
    
    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadData]);
  
  const getStageTotals = useCallback(() => {
    return Object.entries(stageData).map(([stage, batches]) => ({
      stage: stage as BatchStageType,
      batchCount: batches.length,
      totalQuantity: batches.reduce((sum, b) => sum + (b.batch_quantity || 0), 0),
      inProgress: batches.filter(b => b.batch_status === 'in_progress').length
    }));
  }, [stageData]);
  
  return {
    stageData,
    loading,
    refresh: loadData,
    getStageTotals
  };
}
