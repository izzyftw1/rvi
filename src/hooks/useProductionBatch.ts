import { supabase } from "@/integrations/supabase/client";

/**
 * Production Batch Management
 * 
 * Production batches are created automatically when:
 * - First production log for a WO (initial batch)
 * - Production resumes after a partial dispatch (post_dispatch)
 * - Production restarts after a gap (gap_restart, default 7 days)
 * 
 * Each batch has its own QC gates:
 * - Material QC
 * - First Piece QC
 * - Final QC
 */

export type BatchQCStatus = 'pending' | 'passed' | 'failed' | 'waived';
export type BatchStageType = 'cutting' | 'production' | 'external' | 'qc' | 'packing' | 'dispatched';
export type BatchStatus = 'in_queue' | 'in_progress' | 'completed';

export interface ProductionBatch {
  id: string;
  wo_id: string;
  batch_number: number;
  trigger_reason: 'initial' | 'post_dispatch' | 'gap_restart';
  previous_batch_id: string | null;
  started_at: string;
  ended_at: string | null;
  created_at: string;
  // Stage tracking - single source of truth
  batch_quantity: number;
  stage_type: BatchStageType;
  external_process_type: string | null;
  batch_status: BatchStatus;
  stage_entered_at: string | null;
  external_partner_id: string | null;
  // Quantity tracking
  produced_qty: number;
  qc_approved_qty: number;
  qc_rejected_qty: number;
  qc_pending_qty: number; // computed: produced - approved - rejected
  // Batch-level QC status
  qc_material_status: BatchQCStatus;
  qc_material_approved_by: string | null;
  qc_material_approved_at: string | null;
  qc_first_piece_status: BatchQCStatus;
  qc_first_piece_approved_by: string | null;
  qc_first_piece_approved_at: string | null;
  qc_final_status: BatchQCStatus;
  qc_final_approved_by: string | null;
  qc_final_approved_at: string | null;
  production_allowed: boolean;
  dispatch_allowed: boolean;
}

/**
 * Gets or creates the current active batch for a work order.
 * This is called automatically before creating a production log.
 * 
 * @param woId - The work order ID
 * @param gapThresholdDays - Number of days without logs to trigger a gap_restart (default: 7)
 * @returns The batch ID to use for the production log
 */
export async function getOrCreateBatch(
  woId: string,
  gapThresholdDays: number = 7
): Promise<string | null> {
  if (!woId) return null;
  
  try {
    const { data, error } = await supabase.rpc('get_or_create_production_batch', {
      p_wo_id: woId,
      p_gap_threshold_days: gapThresholdDays
    });
    
    if (error) {
      console.error('Error getting/creating production batch:', error);
      return null;
    }
    
    return data as string;
  } catch (err) {
    console.error('Failed to get/create production batch:', err);
    return null;
  }
}

/**
 * Gets all batches for a work order.
 */
export async function getWorkOrderBatches(woId: string): Promise<ProductionBatch[]> {
  if (!woId) return [];
  
  const { data, error } = await supabase
    .from('production_batches')
    .select('*')
    .eq('wo_id', woId)
    .order('batch_number', { ascending: true });
  
  if (error) {
    console.error('Error fetching production batches:', error);
    return [];
  }
  
  return (data as unknown as ProductionBatch[]) || [];
}

/**
 * Gets the current active batch for a work order (the one without an ended_at date).
 */
export async function getCurrentBatch(woId: string): Promise<ProductionBatch | null> {
  if (!woId) return null;
  
  const { data, error } = await supabase
    .from('production_batches')
    .select('*')
    .eq('wo_id', woId)
    .is('ended_at', null)
    .order('batch_number', { ascending: false })
    .limit(1)
    .maybeSingle();
  
  if (error) {
    console.error('Error fetching current batch:', error);
    return null;
  }
  
  return data as unknown as ProductionBatch | null;
}

/**
 * Gets the current batch for QC operations using the database function.
 */
export async function getCurrentBatchForQC(woId: string): Promise<string | null> {
  if (!woId) return null;
  
  try {
    const { data, error } = await supabase.rpc('get_current_batch_for_qc', {
      p_wo_id: woId
    });
    
    if (error) {
      console.error('Error getting batch for QC:', error);
      return null;
    }
    
    return data as string;
  } catch (err) {
    console.error('Failed to get batch for QC:', err);
    return null;
  }
}

/**
 * Checks if production is allowed for a batch (material + first piece QC passed).
 */
export function isBatchProductionAllowed(batch: ProductionBatch | null): boolean {
  if (!batch) return false;
  return batch.production_allowed || (
    ['passed', 'waived'].includes(batch.qc_material_status) &&
    ['passed', 'waived'].includes(batch.qc_first_piece_status)
  );
}

/**
 * Checks if dispatch is allowed for a batch (all QC gates passed).
 */
export function isBatchDispatchAllowed(batch: ProductionBatch | null): boolean {
  if (!batch) return false;
  return batch.dispatch_allowed || (
    ['passed', 'waived'].includes(batch.qc_material_status) &&
    ['passed', 'waived'].includes(batch.qc_first_piece_status) &&
    ['passed', 'waived'].includes(batch.qc_final_status)
  );
}

/**
 * Gets batch QC summary for display.
 */
export function getBatchQCSummary(batch: ProductionBatch | null): {
  material: BatchQCStatus;
  firstPiece: BatchQCStatus;
  final: BatchQCStatus;
  productionAllowed: boolean;
  dispatchAllowed: boolean;
  producedQty: number;
  approvedQty: number;
  rejectedQty: number;
  pendingQty: number;
} {
  if (!batch) {
    return {
      material: 'pending',
      firstPiece: 'pending',
      final: 'pending',
      productionAllowed: false,
      dispatchAllowed: false,
      producedQty: 0,
      approvedQty: 0,
      rejectedQty: 0,
      pendingQty: 0
    };
  }
  
  return {
    material: batch.qc_material_status,
    firstPiece: batch.qc_first_piece_status,
    final: batch.qc_final_status,
    productionAllowed: isBatchProductionAllowed(batch),
    dispatchAllowed: isBatchDispatchAllowed(batch),
    producedQty: batch.produced_qty || 0,
    approvedQty: batch.qc_approved_qty || 0,
    rejectedQty: batch.qc_rejected_qty || 0,
    pendingQty: batch.qc_pending_qty || 0
  };
}

/**
 * Gets batch quantity summary for display.
 */
export function getBatchQuantitySummary(batch: ProductionBatch | null): {
  produced: number;
  approved: number;
  rejected: number;
  pending: number;
  approvalRate: number; // percentage
} {
  if (!batch || batch.produced_qty === 0) {
    return {
      produced: 0,
      approved: 0,
      rejected: 0,
      pending: 0,
      approvalRate: 0
    };
  }
  
  const produced = batch.produced_qty || 0;
  const approved = batch.qc_approved_qty || 0;
  const rejected = batch.qc_rejected_qty || 0;
  const pending = produced - approved - rejected;
  const approvalRate = produced > 0 ? Math.round((approved / produced) * 100) : 0;
  
  return {
    produced,
    approved,
    rejected,
    pending,
    approvalRate
  };
}

/**
 * Checks the overall production status for a work order.
 * Returns whether all batches are complete and if WO can be marked complete.
 */
export async function checkWOProductionStatus(woId: string): Promise<{
  allBatchesComplete: boolean;
  totalProduced: number;
  orderedQty: number;
  canMarkWOComplete: boolean;
  activeBatchId: string | null;
} | null> {
  if (!woId) return null;
  
  try {
    const { data, error } = await supabase.rpc('check_wo_production_status', {
      p_wo_id: woId
    });
    
    if (error) {
      console.error('Error checking WO production status:', error);
      return null;
    }
    
    const result = data?.[0];
    if (!result) return null;
    
    return {
      allBatchesComplete: result.all_batches_complete ?? false,
      totalProduced: result.total_produced ?? 0,
      orderedQty: result.ordered_qty ?? 0,
      canMarkWOComplete: result.can_mark_wo_complete ?? false,
      activeBatchId: result.active_batch_id ?? null,
    };
  } catch (err) {
    console.error('Failed to check WO production status:', err);
    return null;
  }
}

/**
 * Gets the current active (open) batch for production logging.
 * This will create a new batch if the previous one is closed/complete and there's remaining qty.
 */
export async function getActiveBatchForProduction(woId: string): Promise<string | null> {
  // This just calls the updated DB function which handles all the logic
  return getOrCreateBatch(woId);
}
