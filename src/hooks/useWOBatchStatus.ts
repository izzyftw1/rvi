import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface WOBatchStatus {
  status: string;
  base_status: string;
  ordered_qty: number;
  produced_qty: number;
  qc_approved_qty: number;
  qc_rejected_qty: number;
  qc_pending_qty: number;
  dispatched_qty: number;
  remaining_qty: number;
  active_batches: number;
  has_pending_qc: boolean;
}

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  in_production: "In Production",
  in_qc: "In QC",
  packing: "Packing",
  partially_qc_approved: "Partially QC Approved",
  ready_to_dispatch: "Ready to Dispatch",
  partially_dispatched: "Partially Dispatched",
  awaiting_next_batch: "Awaiting Next Batch",
  fully_dispatched: "Fully Dispatched",
  closed: "Closed"
};

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  pending: { bg: "bg-gray-100", text: "text-gray-700", border: "border-gray-300" },
  in_production: { bg: "bg-blue-100", text: "text-blue-700", border: "border-blue-300" },
  in_qc: { bg: "bg-yellow-100", text: "text-yellow-700", border: "border-yellow-300" },
  packing: { bg: "bg-indigo-100", text: "text-indigo-700", border: "border-indigo-300" },
  partially_qc_approved: { bg: "bg-amber-100", text: "text-amber-700", border: "border-amber-300" },
  ready_to_dispatch: { bg: "bg-teal-100", text: "text-teal-700", border: "border-teal-300" },
  partially_dispatched: { bg: "bg-purple-100", text: "text-purple-700", border: "border-purple-300" },
  awaiting_next_batch: { bg: "bg-orange-100", text: "text-orange-700", border: "border-orange-300" },
  fully_dispatched: { bg: "bg-green-100", text: "text-green-700", border: "border-green-300" },
  closed: { bg: "bg-slate-100", text: "text-slate-700", border: "border-slate-300" }
};

export function getStatusLabel(status: string): string {
  return STATUS_LABELS[status] || status;
}

export function getStatusColors(status: string) {
  return STATUS_COLORS[status] || STATUS_COLORS.pending;
}

export function useWOBatchStatus(woId: string | undefined) {
  const [batchStatus, setBatchStatus] = useState<WOBatchStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    if (!woId) {
      setBatchStatus(null);
      setLoading(false);
      return;
    }

    try {
      const { data, error: rpcError } = await supabase.rpc("get_wo_batch_status", {
        p_wo_id: woId
      });

      if (rpcError) throw rpcError;

      setBatchStatus(data as unknown as WOBatchStatus);
    } catch (err: any) {
      console.error("Error loading WO batch status:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [woId]);

  useEffect(() => {
    loadStatus();

    if (!woId) return;

    // Subscribe to changes
    const channel = supabase
      .channel(`wo_batch_status_${woId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "production_batches", filter: `wo_id=eq.${woId}` },
        () => loadStatus()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "dispatches", filter: `wo_id=eq.${woId}` },
        () => loadStatus()
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "work_orders", filter: `id=eq.${woId}` },
        () => loadStatus()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [woId, loadStatus]);

  return { batchStatus, loading, error, refresh: loadStatus };
}
