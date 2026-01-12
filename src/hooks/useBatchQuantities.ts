import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Shared Batch Quantities Hook
 * 
 * SINGLE SOURCE OF TRUTH for all quantity-derived dashboards.
 * All quantities flow from specific canonical sources:
 * 
 * 1. Production: production_batches.produced_qty
 * 2. QC Approved: dispatch_qc_batches.qc_approved_quantity (CANONICAL)
 *    - Falls back to production_batches.qc_approved_qty for legacy data
 * 3. QC Rejected: production_batches.qc_rejected_qty
 * 4. Packing: cartons.quantity (packing batches)
 * 5. Dispatch: dispatches.quantity (CANONICAL - only source of shipped qty)
 * 
 * NO dashboard should calculate quantities independently.
 * Cartons.status is NOT used for dispatch tracking.
 */

export interface BatchQuantities {
  // From work_orders
  orderedQty: number;
  
  // From production_batches - PRODUCTION source
  producedQty: number;
  
  // From production_batches - QC source
  qcApprovedQty: number;
  qcRejectedQty: number;
  qcPendingQty: number;
  
  // From cartons - PACKING source
  packedQty: number;
  packingBatchCount: number;
  
  // From cartons with status='dispatched' - DISPATCH source
  dispatchedQty: number;
  dispatchedBatchCount: number;
  
  // Derived calculations
  remainingToProduceQty: number;
  remainingToPackQty: number;
  remainingToDispatchQty: number;
  
  // Completion tracking
  productionPct: number;
  qcPct: number;
  packingPct: number;
  dispatchPct: number;
  
  isComplete: boolean;
}

interface UseBatchQuantitiesResult {
  quantities: BatchQuantities;
  loading: boolean;
  refresh: () => Promise<void>;
}

const DEFAULT_QUANTITIES: BatchQuantities = {
  orderedQty: 0,
  producedQty: 0,
  qcApprovedQty: 0,
  qcRejectedQty: 0,
  qcPendingQty: 0,
  packedQty: 0,
  packingBatchCount: 0,
  dispatchedQty: 0,
  dispatchedBatchCount: 0,
  remainingToProduceQty: 0,
  remainingToPackQty: 0,
  remainingToDispatchQty: 0,
  productionPct: 0,
  qcPct: 0,
  packingPct: 0,
  dispatchPct: 0,
  isComplete: false,
};

/**
 * Hook for single Work Order batch quantities
 */
export function useBatchQuantities(woId: string | undefined): UseBatchQuantitiesResult {
  const [quantities, setQuantities] = useState<BatchQuantities>(DEFAULT_QUANTITIES);
  const [loading, setLoading] = useState(true);

  const loadQuantities = useCallback(async () => {
    if (!woId) {
      setQuantities(DEFAULT_QUANTITIES);
      setLoading(false);
      return;
    }

    try {
      // 1. Get ordered quantity from work order
      const { data: wo } = await supabase
        .from('work_orders')
        .select('quantity')
        .eq('id', woId)
        .single();

      const orderedQty = wo?.quantity || 0;

      // 2. Get PRODUCTION quantities from production_batches
      const { data: batches } = await supabase
        .from('production_batches')
        .select('produced_qty, qc_approved_qty, qc_rejected_qty')
        .eq('wo_id', woId);

      const producedQty = batches?.reduce((sum, b) => sum + (b.produced_qty || 0), 0) || 0;
      // Keep legacy QC from production_batches for display
      const legacyQcApproved = batches?.reduce((sum, b) => sum + (b.qc_approved_qty || 0), 0) || 0;
      const qcRejectedQty = batches?.reduce((sum, b) => sum + (b.qc_rejected_qty || 0), 0) || 0;

      // 3. Get QC APPROVED from dispatch_qc_batches (NEW CANONICAL SOURCE)
      const { data: dispatchQcBatches } = await supabase
        .from('dispatch_qc_batches')
        .select('qc_approved_quantity, rejected_quantity')
        .eq('work_order_id', woId);
      
      // Use dispatch_qc_batches as canonical source; fallback to legacy if none
      const dispatchQcApproved = dispatchQcBatches?.reduce((sum, b) => sum + (b.qc_approved_quantity || 0), 0) || 0;
      const qcApprovedQty = dispatchQcApproved > 0 ? dispatchQcApproved : legacyQcApproved;
      const qcPendingQty = Math.max(0, producedQty - qcApprovedQty - qcRejectedQty);

      // 4. Get PACKING quantities from cartons (packing batches)
      const { data: cartons } = await supabase
        .from('cartons')
        .select('id, quantity')
        .eq('wo_id', woId);

      const allCartons = cartons || [];
      const packedQty = allCartons.reduce((sum, c) => sum + (c.quantity || 0), 0);
      const packingBatchCount = allCartons.length;

      // 5. Get DISPATCH quantities from dispatches table (CANONICAL SOURCE)
      const { data: dispatches } = await supabase
        .from('dispatches')
        .select('id, quantity')
        .eq('wo_id', woId);

      const allDispatches = dispatches || [];
      const dispatchedQty = allDispatches.reduce((sum, d) => sum + (d.quantity || 0), 0);
      const dispatchedBatchCount = allDispatches.length;

      // 6. Calculate derived quantities
      const remainingToProduceQty = Math.max(0, orderedQty - producedQty);
      const remainingToPackQty = Math.max(0, qcApprovedQty - packedQty);
      const remainingToDispatchQty = Math.max(0, packedQty - dispatchedQty);

      // 7. Calculate percentages
      const productionPct = orderedQty > 0 ? Math.min(100, (producedQty / orderedQty) * 100) : 0;
      const qcPct = producedQty > 0 ? Math.min(100, (qcApprovedQty / producedQty) * 100) : 0;
      const packingPct = qcApprovedQty > 0 ? Math.min(100, (packedQty / qcApprovedQty) * 100) : 0;
      const dispatchPct = orderedQty > 0 ? Math.min(100, (dispatchedQty / orderedQty) * 100) : 0;

      const isComplete = dispatchedQty >= orderedQty && orderedQty > 0;

      setQuantities({
        orderedQty,
        producedQty,
        qcApprovedQty,
        qcRejectedQty,
        qcPendingQty,
        packedQty,
        packingBatchCount,
        dispatchedQty,
        dispatchedBatchCount,
        remainingToProduceQty,
        remainingToPackQty,
        remainingToDispatchQty,
        productionPct,
        qcPct,
        packingPct,
        dispatchPct,
        isComplete,
      });
    } catch (error) {
      console.error('Error loading batch quantities:', error);
    } finally {
      setLoading(false);
    }
  }, [woId]);

  useEffect(() => {
    loadQuantities();

    if (!woId) return;

    // Subscribe to real-time updates on all source tables
    const channel = supabase
      .channel(`batch_quantities_${woId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_orders', filter: `id=eq.${woId}` }, loadQuantities)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'production_batches', filter: `wo_id=eq.${woId}` }, loadQuantities)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cartons', filter: `wo_id=eq.${woId}` }, loadQuantities)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dispatches', filter: `wo_id=eq.${woId}` }, loadQuantities)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dispatch_qc_batches', filter: `work_order_id=eq.${woId}` }, loadQuantities)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [woId, loadQuantities]);

  return {
    quantities,
    loading,
    refresh: loadQuantities
  };
}

/**
 * Fetch batch quantities for multiple work orders (for dashboards)
 */
export async function fetchBatchQuantitiesMultiple(woIds: string[]): Promise<Map<string, BatchQuantities>> {
  const result = new Map<string, BatchQuantities>();

  if (woIds.length === 0) return result;

  const chunkArray = <T,>(arr: T[], size: number): T[][] => {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
    return chunks;
  };

  // Keep chunk small to avoid PostgREST URL length limits (400 errors) when using .in(...)
  const CHUNK_SIZE = 10;
  const chunks = chunkArray(woIds, CHUNK_SIZE);

  try {
    // 1) Work orders
    const woResults = await Promise.all(
      chunks.map((ids) =>
        supabase
          .from("work_orders")
          .select("id, quantity")
          .in("id", ids)
      )
    );
    const workOrders = woResults.flatMap((r) => r.data || []);

    // 2) Production batches
    const batchResults = await Promise.all(
      chunks.map((ids) =>
        supabase
          .from("production_batches")
          .select("wo_id, produced_qty, qc_approved_qty, qc_rejected_qty")
          .in("wo_id", ids)
      )
    );
    const batches = batchResults.flatMap((r) => r.data || []);

    // 3) Dispatch QC batches (CANONICAL SOURCE for QC approved)
    const dispatchQcResults = await Promise.all(
      chunks.map((ids) =>
        supabase
          .from("dispatch_qc_batches")
          .select("work_order_id, qc_approved_quantity, rejected_quantity")
          .in("work_order_id", ids)
      )
    );
    const dispatchQcBatches = dispatchQcResults.flatMap((r) => r.data || []);

    // 4) Cartons
    const cartonResults = await Promise.all(
      chunks.map((ids) =>
        supabase
          .from("cartons")
          .select("wo_id, quantity")
          .in("wo_id", ids)
      )
    );
    const cartons = cartonResults.flatMap((r) => r.data || []);

    // 5) Dispatches (CANONICAL SOURCE for dispatched qty)
    const dispatchResults = await Promise.all(
      chunks.map((ids) =>
        supabase
          .from("dispatches")
          .select("wo_id, quantity")
          .in("wo_id", ids)
      )
    );
    const dispatches = dispatchResults.flatMap((r) => r.data || []);

    // Aggregate by work order
    const orderedMap = new Map<string, number>();
    (workOrders || []).forEach((wo) => orderedMap.set(wo.id, wo.quantity || 0));

    const batchAgg = new Map<string, { produced: number; legacyApproved: number; rejected: number }>();
    (batches || []).forEach((b) => {
      const existing = batchAgg.get(b.wo_id) || { produced: 0, legacyApproved: 0, rejected: 0 };
      existing.produced += b.produced_qty || 0;
      existing.legacyApproved += b.qc_approved_qty || 0;
      existing.rejected += b.qc_rejected_qty || 0;
      batchAgg.set(b.wo_id, existing);
    });

    // Dispatch QC batches aggregation
    const dispatchQcAgg = new Map<string, number>();
    (dispatchQcBatches || []).forEach((b) => {
      const existing = dispatchQcAgg.get(b.work_order_id) || 0;
      dispatchQcAgg.set(b.work_order_id, existing + (b.qc_approved_quantity || 0));
    });

    const cartonAgg = new Map<string, { packed: number; packCount: number }>();
    (cartons || []).forEach((c) => {
      const existing = cartonAgg.get(c.wo_id) || { packed: 0, packCount: 0 };
      existing.packed += c.quantity || 0;
      existing.packCount += 1;
      cartonAgg.set(c.wo_id, existing);
    });

    // Dispatches aggregation (CANONICAL SOURCE)
    const dispatchAgg = new Map<string, { dispatched: number; dispatchCount: number }>();
    (dispatches || []).forEach((d) => {
      const existing = dispatchAgg.get(d.wo_id) || { dispatched: 0, dispatchCount: 0 };
      existing.dispatched += d.quantity || 0;
      existing.dispatchCount += 1;
      dispatchAgg.set(d.wo_id, existing);
    });

    // Build quantities for each WO
    woIds.forEach((woId) => {
      const orderedQty = orderedMap.get(woId) || 0;
      const batch = batchAgg.get(woId) || { produced: 0, legacyApproved: 0, rejected: 0 };
      const carton = cartonAgg.get(woId) || { packed: 0, packCount: 0 };
      const dispatch = dispatchAgg.get(woId) || { dispatched: 0, dispatchCount: 0 };

      const producedQty = batch.produced;
      // Use dispatch_qc_batches as canonical; fallback to legacy
      const dispatchQcApproved = dispatchQcAgg.get(woId) || 0;
      const qcApprovedQty = dispatchQcApproved > 0 ? dispatchQcApproved : batch.legacyApproved;
      const qcRejectedQty = batch.rejected;
      const qcPendingQty = Math.max(0, producedQty - qcApprovedQty - qcRejectedQty);
      const packedQty = carton.packed;
      const dispatchedQty = dispatch.dispatched;

      result.set(woId, {
        orderedQty,
        producedQty,
        qcApprovedQty,
        qcRejectedQty,
        qcPendingQty,
        packedQty,
        packingBatchCount: carton.packCount,
        dispatchedQty,
        dispatchedBatchCount: dispatch.dispatchCount,
        remainingToProduceQty: Math.max(0, orderedQty - producedQty),
        remainingToPackQty: Math.max(0, qcApprovedQty - packedQty),
        remainingToDispatchQty: Math.max(0, packedQty - dispatchedQty),
        productionPct: orderedQty > 0 ? Math.min(100, (producedQty / orderedQty) * 100) : 0,
        qcPct: producedQty > 0 ? Math.min(100, (qcApprovedQty / producedQty) * 100) : 0,
        packingPct: qcApprovedQty > 0 ? Math.min(100, (packedQty / qcApprovedQty) * 100) : 0,
        dispatchPct: orderedQty > 0 ? Math.min(100, (dispatchedQty / orderedQty) * 100) : 0,
        isComplete: dispatchedQty >= orderedQty && orderedQty > 0,
      });
    });
  } catch (error) {
    console.error("Error fetching batch quantities:", error);
  }

  return result;
}
