import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ProductionBatch, BatchQCStatus } from "./useProductionBatch";

/**
 * Batch-Centric QC System
 * 
 * QC is now tracked at the batch level, not work order level:
 * - Material QC: Per batch when material is assigned
 * - First Piece QC: Per batch when production starts
 * - Final QC: Per batch before dispatch
 * - Post-External QC: Per batch after returning from external processing
 * 
 * Key principles:
 * - Each batch has independent QC status
 * - Previous QC approvals are NOT reused across batches
 * - External returns require fresh QC (post_external_qc_status)
 * - QC history is traceable per batch via qc_records.batch_id
 */

export interface BatchQCData {
  batchId: string;
  batchNumber: number;
  woId: string;
  woNumber?: string;
  customer?: string;
  itemCode?: string;
  batchQuantity: number;
  stageType: string;
  
  // QC statuses
  materialStatus: BatchQCStatus;
  firstPieceStatus: BatchQCStatus;
  finalStatus: BatchQCStatus;
  postExternalStatus: string | null;
  
  // Flags
  requiresQCOnReturn: boolean;
  productionAllowed: boolean;
  dispatchAllowed: boolean;
  
  // Timestamps
  materialApprovedAt: string | null;
  firstPieceApprovedAt: string | null;
  finalApprovedAt: string | null;
  externalSentAt: string | null;
  externalReturnedAt: string | null;
}

export interface QCRecord {
  id: string;
  qcId: string;
  batchId: string | null;
  woId: string;
  qcType: 'incoming' | 'first_piece' | 'in_process' | 'final' | 'post_external';
  result: string;
  inspectedQuantity: number;
  approvedBy: string | null;
  approvedAt: string | null;
  remarks: string | null;
  createdAt: string;
}

/**
 * Get all batches requiring QC for a work order
 */
export async function getBatchesRequiringQC(woId: string): Promise<BatchQCData[]> {
  if (!woId) return [];
  
  const { data: batches, error } = await supabase
    .from('production_batches')
    .select(`
      id, batch_number, wo_id, batch_quantity, stage_type,
      qc_material_status, qc_first_piece_status, qc_final_status,
      qc_material_approved_at, qc_first_piece_approved_at, qc_final_approved_at,
      production_allowed, dispatch_allowed,
      requires_qc_on_return, post_external_qc_status,
      external_sent_at, external_returned_at
    `)
    .eq('wo_id', woId)
    .is('ended_at', null)
    .order('batch_number', { ascending: true });
    
  if (error) {
    console.error('Error fetching batches for QC:', error);
    return [];
  }
  
  // Get work order info
  const { data: wo } = await supabase
    .from('work_orders')
    .select('wo_number, customer, item_code')
    .eq('id', woId)
    .single();
  
  return (batches || []).map(b => ({
    batchId: b.id,
    batchNumber: b.batch_number,
    woId: b.wo_id,
    woNumber: wo?.wo_number || undefined,
    customer: wo?.customer || undefined,
    itemCode: wo?.item_code || undefined,
    batchQuantity: b.batch_quantity || 0,
    stageType: b.stage_type || 'production',
    materialStatus: (b.qc_material_status || 'pending') as BatchQCStatus,
    firstPieceStatus: (b.qc_first_piece_status || 'pending') as BatchQCStatus,
    finalStatus: (b.qc_final_status || 'pending') as BatchQCStatus,
    postExternalStatus: b.post_external_qc_status,
    requiresQCOnReturn: b.requires_qc_on_return || false,
    productionAllowed: b.production_allowed || false,
    dispatchAllowed: b.dispatch_allowed || false,
    materialApprovedAt: b.qc_material_approved_at,
    firstPieceApprovedAt: b.qc_first_piece_approved_at,
    finalApprovedAt: b.qc_final_approved_at,
    externalSentAt: b.external_sent_at,
    externalReturnedAt: b.external_returned_at,
  }));
}

/**
 * Get batches pending specific QC type
 */
export async function getBatchesPendingQC(
  qcType: 'material' | 'first_piece' | 'final' | 'post_external'
): Promise<BatchQCData[]> {
  let query = supabase
    .from('production_batches')
    .select(`
      id, batch_number, wo_id, batch_quantity, stage_type,
      qc_material_status, qc_first_piece_status, qc_final_status,
      qc_material_approved_at, qc_first_piece_approved_at, qc_final_approved_at,
      production_allowed, dispatch_allowed,
      requires_qc_on_return, post_external_qc_status,
      external_sent_at, external_returned_at,
      work_orders!inner(wo_number, customer, item_code)
    `)
    .is('ended_at', null);
  
  switch (qcType) {
    case 'material':
      query = query.eq('qc_material_status', 'pending');
      break;
    case 'first_piece':
      query = query.eq('qc_first_piece_status', 'pending');
      break;
    case 'final':
      query = query.eq('qc_final_status', 'pending');
      break;
    case 'post_external':
      query = query
        .eq('requires_qc_on_return', true)
        .eq('post_external_qc_status', 'pending');
      break;
  }
  
  const { data: batches, error } = await query.order('created_at', { ascending: false });
  
  if (error) {
    console.error('Error fetching pending QC batches:', error);
    return [];
  }
  
  return (batches || []).map((b: any) => ({
    batchId: b.id,
    batchNumber: b.batch_number,
    woId: b.wo_id,
    woNumber: b.work_orders?.wo_number || undefined,
    customer: b.work_orders?.customer || undefined,
    itemCode: b.work_orders?.item_code || undefined,
    batchQuantity: b.batch_quantity || 0,
    stageType: b.stage_type || 'production',
    materialStatus: (b.qc_material_status || 'pending') as BatchQCStatus,
    firstPieceStatus: (b.qc_first_piece_status || 'pending') as BatchQCStatus,
    finalStatus: (b.qc_final_status || 'pending') as BatchQCStatus,
    postExternalStatus: b.post_external_qc_status,
    requiresQCOnReturn: b.requires_qc_on_return || false,
    productionAllowed: b.production_allowed || false,
    dispatchAllowed: b.dispatch_allowed || false,
    materialApprovedAt: b.qc_material_approved_at,
    firstPieceApprovedAt: b.qc_first_piece_approved_at,
    finalApprovedAt: b.qc_final_approved_at,
    externalSentAt: b.external_sent_at,
    externalReturnedAt: b.external_returned_at,
  }));
}

/**
 * Submit batch-level QC approval
 */
export async function submitBatchQC(
  batchId: string,
  qcType: 'material' | 'first_piece' | 'final' | 'post_external',
  result: 'pass' | 'fail' | 'waived',
  options?: {
    remarks?: string;
    inspectedQuantity?: number;
    waiveReason?: string;
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'User not authenticated' };
    }
    
    // Get batch info
    const { data: batch, error: batchError } = await supabase
      .from('production_batches')
      .select('wo_id, batch_quantity')
      .eq('id', batchId)
      .single();
      
    if (batchError || !batch) {
      return { success: false, error: 'Batch not found' };
    }
    
    const status = result === 'pass' ? 'passed' : result === 'waived' ? 'waived' : 'failed';
    const now = new Date().toISOString();
    
    // Update batch QC status based on type
    let updateData: Record<string, any> = {};
    let qcRecordType: string = qcType;
    
    switch (qcType) {
      case 'material':
        updateData = {
          qc_material_status: status,
          qc_material_approved_by: user.id,
          qc_material_approved_at: now,
        };
        qcRecordType = 'incoming';
        break;
      case 'first_piece':
        updateData = {
          qc_first_piece_status: status,
          qc_first_piece_approved_by: user.id,
          qc_first_piece_approved_at: now,
        };
        break;
      case 'final':
        updateData = {
          qc_final_status: status,
          qc_final_approved_by: user.id,
          qc_final_approved_at: now,
        };
        // When Final QC passes/waives, set qc_approved_qty = produced_qty - qc_rejected_qty
        if (['passed', 'waived'].includes(status)) {
          const { data: batchQty } = await supabase
            .from('production_batches')
            .select('produced_qty, qc_rejected_qty')
            .eq('id', batchId)
            .single();
          if (batchQty) {
            updateData.qc_approved_qty = Math.max(0, (batchQty.produced_qty || 0) - (batchQty.qc_rejected_qty || 0));
          }
        }
        break;
      case 'post_external':
        updateData = {
          post_external_qc_status: status,
          // Clear the requires_qc_on_return flag once QC is done
          requires_qc_on_return: false,
        };
        break;
    }
    
    // Calculate production_allowed and dispatch_allowed
    const { data: currentBatch } = await supabase
      .from('production_batches')
      .select('qc_material_status, qc_first_piece_status, qc_final_status')
      .eq('id', batchId)
      .single();
    
    const materialOk = qcType === 'material' 
      ? ['passed', 'waived'].includes(status)
      : ['passed', 'waived'].includes(currentBatch?.qc_material_status || '');
    const firstPieceOk = qcType === 'first_piece'
      ? ['passed', 'waived'].includes(status)
      : ['passed', 'waived'].includes(currentBatch?.qc_first_piece_status || '');
    const finalOk = qcType === 'final'
      ? ['passed', 'waived'].includes(status)
      : ['passed', 'waived'].includes(currentBatch?.qc_final_status || '');
    
    updateData.production_allowed = materialOk && firstPieceOk;
    updateData.dispatch_allowed = materialOk && firstPieceOk && finalOk;
    
    // Update batch
    const { error: updateError } = await supabase
      .from('production_batches')
      .update(updateData)
      .eq('id', batchId);
      
    if (updateError) {
      return { success: false, error: updateError.message };
    }
    
    // Create QC record for traceability
    const qcId = `QC-${qcType.toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
    // Map result to database enum (waived stored as pass with waive_reason)
    const dbResult = result === 'waived' ? 'pass' : result;
    const { error: recordError } = await supabase
      .from('qc_records')
      .insert([{
        qc_id: qcId,
        wo_id: batch.wo_id,
        batch_id: batchId,
        qc_type: qcRecordType as any, // Cast for new enum values not yet in types.ts
        result: dbResult as any, // Cast for enum compatibility
        inspected_quantity: options?.inspectedQuantity || batch.batch_quantity,
        approved_by: user.id,
        approved_at: now,
        remarks: options?.remarks,
        waive_reason: result === 'waived' ? (options?.waiveReason || options?.remarks) : null,
        qc_date_time: now,
      }]);
      
    if (recordError) {
      console.error('Error creating QC record:', recordError);
      // Don't fail - batch was updated successfully
    }
    
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Get QC history for a specific batch
 */
export async function getBatchQCHistory(batchId: string): Promise<QCRecord[]> {
  const { data, error } = await supabase
    .from('qc_records')
    .select('*')
    .eq('batch_id', batchId)
    .order('created_at', { ascending: false });
    
  if (error) {
    console.error('Error fetching batch QC history:', error);
    return [];
  }
  
  return (data || []).map(r => ({
    id: r.id,
    qcId: r.qc_id,
    batchId: r.batch_id,
    woId: r.wo_id,
    qcType: r.qc_type as any,
    result: r.result,
    inspectedQuantity: r.inspected_quantity || 0,
    approvedBy: r.approved_by,
    approvedAt: r.approved_at,
    remarks: r.remarks,
    createdAt: r.created_at,
  }));
}

/**
 * React hook for batch-level QC operations
 */
export function useBatchQC(woId: string | undefined) {
  const [batches, setBatches] = useState<BatchQCData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const loadBatches = useCallback(async () => {
    if (!woId) {
      setBatches([]);
      setLoading(false);
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      const data = await getBatchesRequiringQC(woId);
      setBatches(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [woId]);
  
  useEffect(() => {
    loadBatches();
    
    // Subscribe to realtime updates
    if (!woId) return;
    
    const channel = supabase
      .channel(`batch-qc-${woId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'production_batches',
          filter: `wo_id=eq.${woId}`,
        },
        () => {
          loadBatches();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'qc_records',
        },
        () => {
          loadBatches();
        }
      )
      .subscribe();
      
    return () => {
      supabase.removeChannel(channel);
    };
  }, [woId, loadBatches]);
  
  const submitQC = useCallback(async (
    batchId: string,
    qcType: 'material' | 'first_piece' | 'final' | 'post_external',
    result: 'pass' | 'fail' | 'waived',
    options?: { remarks?: string; inspectedQuantity?: number; waiveReason?: string }
  ) => {
    const response = await submitBatchQC(batchId, qcType, result, options);
    if (response.success) {
      await loadBatches();
    }
    return response;
  }, [loadBatches]);
  
  // Summary calculations
  const summary = {
    totalBatches: batches.length,
    pendingMaterial: batches.filter(b => b.materialStatus === 'pending').length,
    pendingFirstPiece: batches.filter(b => b.firstPieceStatus === 'pending').length,
    pendingFinal: batches.filter(b => b.finalStatus === 'pending').length,
    pendingPostExternal: batches.filter(b => b.requiresQCOnReturn && b.postExternalStatus === 'pending').length,
    productionReady: batches.filter(b => b.productionAllowed).length,
    dispatchReady: batches.filter(b => b.dispatchAllowed).length,
  };
  
  return {
    batches,
    loading,
    error,
    refresh: loadBatches,
    submitQC,
    summary,
  };
}

/**
 * Hook for factory-wide QC overview
 */
export function useQCOverview() {
  const [overview, setOverview] = useState({
    pendingMaterial: [] as BatchQCData[],
    pendingFirstPiece: [] as BatchQCData[],
    pendingFinal: [] as BatchQCData[],
    pendingPostExternal: [] as BatchQCData[],
  });
  const [loading, setLoading] = useState(true);
  
  const loadOverview = useCallback(async () => {
    setLoading(true);
    
    const [material, firstPiece, final, postExternal] = await Promise.all([
      getBatchesPendingQC('material'),
      getBatchesPendingQC('first_piece'),
      getBatchesPendingQC('final'),
      getBatchesPendingQC('post_external'),
    ]);
    
    setOverview({
      pendingMaterial: material,
      pendingFirstPiece: firstPiece,
      pendingFinal: final,
      pendingPostExternal: postExternal,
    });
    
    setLoading(false);
  }, []);
  
  useEffect(() => {
    loadOverview();
    
    // Subscribe to updates
    const channel = supabase
      .channel('qc-overview')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'production_batches',
        },
        () => {
          loadOverview();
        }
      )
      .subscribe();
      
    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadOverview]);
  
  return {
    ...overview,
    loading,
    refresh: loadOverview,
    totalPending: 
      overview.pendingMaterial.length + 
      overview.pendingFirstPiece.length + 
      overview.pendingFinal.length +
      overview.pendingPostExternal.length,
  };
}
