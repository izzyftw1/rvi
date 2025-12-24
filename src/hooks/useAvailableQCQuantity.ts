import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Hook to calculate available quantity for QC inspection
 * 
 * Available for QC = produced_qty - qc_approved_qty - qc_rejected_qty
 * 
 * This uses existing batch data - no new schema required
 */

export interface AvailableQCData {
  batchId: string | null;
  batchNumber: number;
  producedQty: number;
  qcApprovedQty: number;
  qcRejectedQty: number;
  availableForQC: number;
  qcFinalStatus: string;
}

interface UseAvailableQCQuantityResult {
  batches: AvailableQCData[];
  totalAvailableForQC: number;
  loading: boolean;
  refresh: () => Promise<void>;
}

export function useAvailableQCQuantity(woId: string | undefined): UseAvailableQCQuantityResult {
  const [batches, setBatches] = useState<AvailableQCData[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!woId) {
      setLoading(false);
      return;
    }

    try {
      // Get all production batches for this work order
      const { data, error } = await supabase
        .from('production_batches')
        .select('id, batch_number, produced_qty, qc_approved_qty, qc_rejected_qty, qc_final_status')
        .eq('wo_id', woId)
        .order('batch_number', { ascending: true });

      if (error) throw error;

      const batchData: AvailableQCData[] = (data || []).map(b => {
        const produced = b.produced_qty || 0;
        const approved = b.qc_approved_qty || 0;
        const rejected = b.qc_rejected_qty || 0;
        const available = Math.max(0, produced - approved - rejected);

        return {
          batchId: b.id,
          batchNumber: b.batch_number,
          producedQty: produced,
          qcApprovedQty: approved,
          qcRejectedQty: rejected,
          availableForQC: available,
          qcFinalStatus: b.qc_final_status || 'pending'
        };
      });

      setBatches(batchData);
    } catch (error) {
      console.error('Error loading available QC quantity:', error);
    } finally {
      setLoading(false);
    }
  }, [woId]);

  useEffect(() => {
    loadData();

    if (!woId) return;

    // Subscribe to real-time updates
    const channel = supabase
      .channel(`available_qc_${woId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'production_batches', filter: `wo_id=eq.${woId}` },
        loadData
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'qc_records', filter: `wo_id=eq.${woId}` },
        loadData
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [woId, loadData]);

  const totalAvailableForQC = batches.reduce((sum, b) => sum + b.availableForQC, 0);

  return {
    batches,
    totalAvailableForQC,
    loading,
    refresh: loadData
  };
}
