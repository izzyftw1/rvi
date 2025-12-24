import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBatchQuantities, BatchQuantities } from "./useBatchQuantities";

/**
 * Derived Work Order Quantity Summary
 * 
 * DEPRECATED: Use useBatchQuantities instead for new code.
 * This hook is maintained for backwards compatibility.
 * 
 * All quantities derive from batch records:
 * - ordered_qty: from work_orders.quantity
 * - produced_qty: SUM of production_batches.produced_qty
 * - qc_approved_qty: SUM of production_batches.qc_approved_qty
 * - packed_qty (released_qty): SUM of cartons.quantity
 * - dispatched_qty: SUM of cartons with status='dispatched'
 * - remaining_qty: ordered_qty - dispatched_qty
 */

export interface WorkOrderQuantities {
  orderedQty: number;
  producedQty: number;
  qcApprovedQty: number;
  qcRejectedQty: number;
  packedQty: number; // This is "released_qty" - ready for dispatch
  dispatchedQty: number;
  remainingQty: number; // ordered - dispatched
  pendingPackQty: number; // qc_approved - packed
  pendingDispatchQty: number; // packed - dispatched
  completionPct: number; // based on dispatched
  isComplete: boolean; // remainingQty === 0
}

interface UseWorkOrderQuantitiesResult {
  quantities: WorkOrderQuantities;
  loading: boolean;
  refresh: () => Promise<void>;
}

/**
 * Hook for Work Order quantities - wraps useBatchQuantities for backwards compatibility
 */
export function useWorkOrderQuantities(woId: string | undefined): UseWorkOrderQuantitiesResult {
  const { quantities: bq, loading, refresh } = useBatchQuantities(woId);
  
  // Map BatchQuantities to WorkOrderQuantities format
  const quantities: WorkOrderQuantities = {
    orderedQty: bq.orderedQty,
    producedQty: bq.producedQty,
    qcApprovedQty: bq.qcApprovedQty,
    qcRejectedQty: bq.qcRejectedQty,
    packedQty: bq.packedQty,
    dispatchedQty: bq.dispatchedQty,
    remainingQty: Math.max(0, bq.orderedQty - bq.dispatchedQty),
    pendingPackQty: bq.remainingToPackQty,
    pendingDispatchQty: bq.remainingToDispatchQty,
    completionPct: bq.dispatchPct,
    isComplete: bq.isComplete,
  };

  return {
    quantities,
    loading,
    refresh
  };
}
