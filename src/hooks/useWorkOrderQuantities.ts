import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Derived Work Order Quantity Summary
 * 
 * Uses EXISTING data only - no new schema fields:
 * - ordered_qty: from work_orders.quantity
 * - produced_qty: SUM of production_batches.produced_qty
 * - qc_approved_qty: SUM of production_batches.qc_approved_qty
 * - packed_qty (released_qty): SUM of cartons.quantity
 * - dispatched_qty: SUM of dispatches.quantity
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

export function useWorkOrderQuantities(woId: string | undefined): UseWorkOrderQuantitiesResult {
  const [quantities, setQuantities] = useState<WorkOrderQuantities>({
    orderedQty: 0,
    producedQty: 0,
    qcApprovedQty: 0,
    qcRejectedQty: 0,
    packedQty: 0,
    dispatchedQty: 0,
    remainingQty: 0,
    pendingPackQty: 0,
    pendingDispatchQty: 0,
    completionPct: 0,
    isComplete: false
  });
  const [loading, setLoading] = useState(true);

  const loadQuantities = useCallback(async () => {
    if (!woId) {
      setLoading(false);
      return;
    }

    try {
      // Get ordered quantity from work order
      const { data: wo } = await supabase
        .from('work_orders')
        .select('quantity')
        .eq('id', woId)
        .single();

      const orderedQty = wo?.quantity || 0;

      // Get production batch totals
      const { data: batches } = await supabase
        .from('production_batches')
        .select('produced_qty, qc_approved_qty, qc_rejected_qty')
        .eq('wo_id', woId);

      const producedQty = batches?.reduce((sum, b) => sum + (b.produced_qty || 0), 0) || 0;
      const qcApprovedQty = batches?.reduce((sum, b) => sum + (b.qc_approved_qty || 0), 0) || 0;
      const qcRejectedQty = batches?.reduce((sum, b) => sum + (b.qc_rejected_qty || 0), 0) || 0;

      // Get packed quantity from cartons
      const { data: cartons } = await supabase
        .from('cartons')
        .select('quantity')
        .eq('wo_id', woId);

      const packedQty = cartons?.reduce((sum, c) => sum + (c.quantity || 0), 0) || 0;

      // Get dispatched quantity from dispatches
      const { data: dispatches } = await supabase
        .from('dispatches')
        .select('quantity')
        .eq('wo_id', woId);

      const dispatchedQty = dispatches?.reduce((sum, d) => sum + (d.quantity || 0), 0) || 0;

      // Derived calculations
      const remainingQty = Math.max(0, orderedQty - dispatchedQty);
      const pendingPackQty = Math.max(0, qcApprovedQty - packedQty);
      const pendingDispatchQty = Math.max(0, packedQty - dispatchedQty);
      const completionPct = orderedQty > 0 ? Math.min(100, (dispatchedQty / orderedQty) * 100) : 0;
      const isComplete = remainingQty === 0 && orderedQty > 0;

      setQuantities({
        orderedQty,
        producedQty,
        qcApprovedQty,
        qcRejectedQty,
        packedQty,
        dispatchedQty,
        remainingQty,
        pendingPackQty,
        pendingDispatchQty,
        completionPct,
        isComplete
      });
    } catch (error) {
      console.error('Error loading work order quantities:', error);
    } finally {
      setLoading(false);
    }
  }, [woId]);

  useEffect(() => {
    loadQuantities();

    if (!woId) return;

    // Subscribe to real-time updates
    const channel = supabase
      .channel(`wo_quantities_${woId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'production_batches', filter: `wo_id=eq.${woId}` }, loadQuantities)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cartons', filter: `wo_id=eq.${woId}` }, loadQuantities)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dispatches', filter: `wo_id=eq.${woId}` }, loadQuantities)
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
