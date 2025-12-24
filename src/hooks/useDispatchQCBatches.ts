import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Dispatch QC Batch - represents a batch of QC-approved quantity 
 * that is eligible for packing/dispatch.
 * 
 * This is the FINAL production step for that batch quantity only.
 * A Work Order can have multiple Dispatch QC batches over time.
 */
export interface DispatchQCBatch {
  id: string;
  work_order_id: string;
  production_batch_id: string | null;
  qc_batch_id: string;
  qc_approved_quantity: number;
  consumed_quantity: number;
  available_quantity: number; // Derived: approved - consumed
  qc_date: string;
  approved_by: string | null;
  status: string;
  remarks: string | null;
  created_at: string;
}

interface UseDispatchQCBatchesResult {
  batches: DispatchQCBatch[];
  loading: boolean;
  totalApproved: number;
  totalConsumed: number;
  totalAvailable: number;
  refresh: () => Promise<void>;
  createBatch: (quantity: number, productionBatchId?: string, remarks?: string) => Promise<DispatchQCBatch | null>;
}

/**
 * Hook to manage Dispatch QC batches for a Work Order
 */
export function useDispatchQCBatches(woId: string | undefined): UseDispatchQCBatchesResult {
  const [batches, setBatches] = useState<DispatchQCBatch[]>([]);
  const [loading, setLoading] = useState(true);

  const loadBatches = useCallback(async () => {
    if (!woId) {
      setBatches([]);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('dispatch_qc_batches')
        .select('*')
        .eq('work_order_id', woId)
        .order('qc_date', { ascending: false });

      if (error) throw error;

      const enriched: DispatchQCBatch[] = (data || []).map(b => ({
        ...b,
        available_quantity: b.qc_approved_quantity - b.consumed_quantity,
      }));

      setBatches(enriched);
    } catch (error) {
      console.error('Error loading dispatch QC batches:', error);
    } finally {
      setLoading(false);
    }
  }, [woId]);

  const createBatch = useCallback(async (
    quantity: number, 
    productionBatchId?: string, 
    remarks?: string
  ): Promise<DispatchQCBatch | null> => {
    if (!woId || quantity <= 0) return null;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from('dispatch_qc_batches')
        .insert([{
          work_order_id: woId,
          production_batch_id: productionBatchId || null,
          qc_approved_quantity: quantity,
          approved_by: user?.id,
          remarks: remarks || null,
        }] as any)
        .select()
        .single();

      if (error) throw error;

      await loadBatches();
      
      return {
        ...data,
        available_quantity: data.qc_approved_quantity - data.consumed_quantity,
      };
    } catch (error) {
      console.error('Error creating dispatch QC batch:', error);
      return null;
    }
  }, [woId, loadBatches]);

  useEffect(() => {
    loadBatches();

    if (!woId) return;

    const channel = supabase
      .channel(`dispatch_qc_${woId}`)
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'dispatch_qc_batches', 
        filter: `work_order_id=eq.${woId}` 
      }, loadBatches)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [woId, loadBatches]);

  // Calculate totals
  const totalApproved = batches.reduce((sum, b) => sum + b.qc_approved_quantity, 0);
  const totalConsumed = batches.reduce((sum, b) => sum + b.consumed_quantity, 0);
  const totalAvailable = batches.reduce((sum, b) => sum + b.available_quantity, 0);

  return {
    batches,
    loading,
    totalApproved,
    totalConsumed,
    totalAvailable,
    refresh: loadBatches,
    createBatch,
  };
}

/**
 * Get available Dispatch QC batches for packing (status not 'consumed')
 */
export async function getAvailableDispatchQCBatches(woId: string): Promise<DispatchQCBatch[]> {
  const { data, error } = await supabase
    .from('dispatch_qc_batches')
    .select('*')
    .eq('work_order_id', woId)
    .neq('status', 'consumed')
    .order('qc_date', { ascending: true });

  if (error) {
    console.error('Error fetching available dispatch QC batches:', error);
    return [];
  }

  return (data || []).map(b => ({
    ...b,
    available_quantity: b.qc_approved_quantity - b.consumed_quantity,
  }));
}

/**
 * Calculate remaining un-QC'd quantity for a Work Order
 */
export async function getRemainingUnQCdQuantity(woId: string): Promise<{
  orderedQty: number;
  producedQty: number;
  dispatchQCApprovedQty: number;
  remainingForQC: number;
}> {
  // Get ordered quantity
  const { data: wo } = await supabase
    .from('work_orders')
    .select('quantity')
    .eq('id', woId)
    .single();

  // Get produced quantity from production batches
  const { data: batches } = await supabase
    .from('production_batches')
    .select('produced_qty')
    .eq('wo_id', woId);

  // Get total dispatch QC approved
  const { data: qcBatches } = await supabase
    .from('dispatch_qc_batches')
    .select('qc_approved_quantity')
    .eq('work_order_id', woId);

  const orderedQty = wo?.quantity || 0;
  const producedQty = batches?.reduce((sum, b) => sum + (b.produced_qty || 0), 0) || 0;
  const dispatchQCApprovedQty = qcBatches?.reduce((sum, b) => sum + b.qc_approved_quantity, 0) || 0;
  const remainingForQC = Math.max(0, producedQty - dispatchQCApprovedQty);

  return {
    orderedQty,
    producedQty,
    dispatchQCApprovedQty,
    remainingForQC,
  };
}
