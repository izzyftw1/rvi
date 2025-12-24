import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface ExternalBreakdown {
  process: string;
  quantity: number;
}

export interface WOBatchQuantities {
  ordered: number;
  inProduction: number;
  atExternal: number;
  externalBreakdown: ExternalBreakdown[];
  qcApproved: number;
  qcPending: number;
  qcRejected: number;
  packed: number;
  dispatched: number;
  remaining: number;
  progressPercent: number;
}

interface UseWOBatchQuantitiesResult {
  quantities: WOBatchQuantities;
  loading: boolean;
  refresh: () => Promise<void>;
}

/**
 * Hook to derive live quantity breakdowns from batch-level data
 */
export function useWOBatchQuantities(woId: string | undefined): UseWOBatchQuantitiesResult {
  const [quantities, setQuantities] = useState<WOBatchQuantities>({
    ordered: 0,
    inProduction: 0,
    atExternal: 0,
    externalBreakdown: [],
    qcApproved: 0,
    qcPending: 0,
    qcRejected: 0,
    packed: 0,
    dispatched: 0,
    remaining: 0,
    progressPercent: 0,
  });
  const [loading, setLoading] = useState(true);

  const loadQuantities = useCallback(async () => {
    if (!woId) {
      setLoading(false);
      return;
    }

    try {
      // Get work order ordered quantity
      const { data: wo } = await supabase
        .from("work_orders")
        .select("quantity")
        .eq("id", woId)
        .single();

      const orderedQty = wo?.quantity || 0;

      // Get all production batches for this WO
      const { data: batches } = await supabase
        .from("production_batches")
        .select(`
          id,
          batch_quantity,
          produced_qty,
          qc_approved_qty,
          qc_rejected_qty,
          dispatched_qty,
          stage_type,
          batch_status,
          external_process_type,
          qc_final_status
        `)
        .eq("wo_id", woId);

      // Get packed quantities from cartons
      const { data: cartons } = await supabase
        .from("cartons")
        .select("production_batch_id, quantity, dispatched_qty")
        .eq("wo_id", woId);

      // Calculate packed qty per batch
      const packedByBatch: Record<string, number> = {};
      (cartons || []).forEach(c => {
        if (c.production_batch_id) {
          packedByBatch[c.production_batch_id] = (packedByBatch[c.production_batch_id] || 0) + (c.quantity || 0);
        }
      });

      // Calculate dispatched qty from cartons
      const totalPackedQty = (cartons || []).reduce((sum, c) => sum + (c.quantity || 0), 0);
      const totalDispatchedFromCartons = (cartons || []).reduce((sum, c) => sum + (c.dispatched_qty || 0), 0);

      // Get dispatches for accurate dispatched count
      const { data: dispatches } = await supabase
        .from("dispatches")
        .select("quantity")
        .eq("wo_id", woId);

      const totalDispatched = (dispatches || []).reduce((sum, d) => sum + (d.quantity || 0), 0);

      // Calculate quantities from batches
      let inProduction = 0;
      let atExternal = 0;
      const externalMap: Record<string, number> = {};
      let qcApproved = 0;
      let qcPending = 0;
      let qcRejected = 0;

      (batches || []).forEach(batch => {
        const batchQty = batch.batch_quantity || batch.produced_qty || 0;

        if (batch.stage_type === 'external') {
          atExternal += batchQty;
          const processType = batch.external_process_type || 'Other';
          externalMap[processType] = (externalMap[processType] || 0) + batchQty;
        } else if (batch.stage_type === 'production' && batch.batch_status !== 'completed') {
          inProduction += batchQty;
        }

        qcApproved += batch.qc_approved_qty || 0;
        qcRejected += batch.qc_rejected_qty || 0;
        
        // QC pending = produced but not yet approved or rejected
        const produced = batch.produced_qty || 0;
        const inspected = (batch.qc_approved_qty || 0) + (batch.qc_rejected_qty || 0);
        qcPending += Math.max(0, produced - inspected);
      });

      const externalBreakdown: ExternalBreakdown[] = Object.entries(externalMap)
        .map(([process, quantity]) => ({ process, quantity }))
        .sort((a, b) => b.quantity - a.quantity);

      const remaining = Math.max(0, orderedQty - totalDispatched);
      const progressPercent = orderedQty > 0 ? Math.min(100, (totalDispatched / orderedQty) * 100) : 0;

      setQuantities({
        ordered: orderedQty,
        inProduction,
        atExternal,
        externalBreakdown,
        qcApproved,
        qcPending,
        qcRejected,
        packed: totalPackedQty,
        dispatched: totalDispatched,
        remaining,
        progressPercent,
      });
    } catch (error) {
      console.error("Error loading WO batch quantities:", error);
    } finally {
      setLoading(false);
    }
  }, [woId]);

  useEffect(() => {
    loadQuantities();

    if (!woId) return;

    // Subscribe to real-time updates
    const channel = supabase
      .channel(`wo_batch_quantities_${woId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "production_batches", filter: `wo_id=eq.${woId}` },
        () => loadQuantities()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cartons", filter: `wo_id=eq.${woId}` },
        () => loadQuantities()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "dispatches", filter: `wo_id=eq.${woId}` },
        () => loadQuantities()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [woId, loadQuantities]);

  return {
    quantities,
    loading,
    refresh: loadQuantities,
  };
}

/**
 * Fetch batch quantities for a single WO (non-hook version for lists)
 */
export async function getWOBatchQuantities(woId: string): Promise<WOBatchQuantities> {
  const { data: wo } = await supabase
    .from("work_orders")
    .select("quantity")
    .eq("id", woId)
    .single();

  const orderedQty = wo?.quantity || 0;

  const { data: batches } = await supabase
    .from("production_batches")
    .select(`
      id,
      batch_quantity,
      produced_qty,
      qc_approved_qty,
      qc_rejected_qty,
      dispatched_qty,
      stage_type,
      batch_status,
      external_process_type
    `)
    .eq("wo_id", woId);

  const { data: cartons } = await supabase
    .from("cartons")
    .select("quantity")
    .eq("wo_id", woId);

  const { data: dispatches } = await supabase
    .from("dispatches")
    .select("quantity")
    .eq("wo_id", woId);

  const totalPackedQty = (cartons || []).reduce((sum, c) => sum + (c.quantity || 0), 0);
  const totalDispatched = (dispatches || []).reduce((sum, d) => sum + (d.quantity || 0), 0);

  let inProduction = 0;
  let atExternal = 0;
  const externalMap: Record<string, number> = {};
  let qcApproved = 0;
  let qcPending = 0;
  let qcRejected = 0;

  (batches || []).forEach(batch => {
    const batchQty = batch.batch_quantity || batch.produced_qty || 0;

    if (batch.stage_type === 'external') {
      atExternal += batchQty;
      const processType = batch.external_process_type || 'Other';
      externalMap[processType] = (externalMap[processType] || 0) + batchQty;
    } else if (batch.stage_type === 'production' && batch.batch_status !== 'completed') {
      inProduction += batchQty;
    }

    qcApproved += batch.qc_approved_qty || 0;
    qcRejected += batch.qc_rejected_qty || 0;
    
    const produced = batch.produced_qty || 0;
    const inspected = (batch.qc_approved_qty || 0) + (batch.qc_rejected_qty || 0);
    qcPending += Math.max(0, produced - inspected);
  });

  const externalBreakdown: ExternalBreakdown[] = Object.entries(externalMap)
    .map(([process, quantity]) => ({ process, quantity }))
    .sort((a, b) => b.quantity - a.quantity);

  const remaining = Math.max(0, orderedQty - totalDispatched);
  const progressPercent = orderedQty > 0 ? Math.min(100, (totalDispatched / orderedQty) * 100) : 0;

  return {
    ordered: orderedQty,
    inProduction,
    atExternal,
    externalBreakdown,
    qcApproved,
    qcPending,
    qcRejected,
    packed: totalPackedQty,
    dispatched: totalDispatched,
    remaining,
    progressPercent,
  };
}
