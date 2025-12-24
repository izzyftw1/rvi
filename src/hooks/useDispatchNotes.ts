import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "./useUserRole";

export interface DispatchNote {
  id: string;
  dispatch_note_no: string;
  work_order_id: string;
  sales_order_id: string | null;
  carton_id: string | null;
  shipment_id: string | null;
  dispatch_id: string | null;
  item_code: string;
  item_description: string | null;
  so_ordered_qty: number | null;
  packed_qty: number;
  dispatched_qty: number;
  rejected_qty: number | null;
  dispatch_date: string;
  unit_rate: number | null;
  currency: string | null;
  gross_weight_kg: number | null;
  net_weight_kg: number | null;
  invoiced: boolean;
  invoice_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  remarks: string | null;
}

interface UseDispatchNotesResult {
  dispatchNotes: DispatchNote[];
  loading: boolean;
  refresh: () => Promise<void>;
  createDispatchNote: (data: CreateDispatchNoteInput) => Promise<DispatchNote | null>;
  getUninvoicedNotes: () => DispatchNote[];
}

export interface CreateDispatchNoteInput {
  work_order_id: string;
  sales_order_id?: string | null;
  carton_id?: string | null;
  shipment_id?: string | null;
  dispatch_id?: string | null;
  item_code: string;
  item_description?: string | null;
  so_ordered_qty?: number | null;
  packed_qty: number;
  dispatched_qty: number;
  rejected_qty?: number | null;
  unit_rate?: number | null;
  currency?: string | null;
  gross_weight_kg?: number | null;
  net_weight_kg?: number | null;
  remarks?: string | null;
}

export function useDispatchNotes(workOrderId?: string): UseDispatchNotesResult {
  const [dispatchNotes, setDispatchNotes] = useState<DispatchNote[]>([]);
  const [loading, setLoading] = useState(true);

  const loadDispatchNotes = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("dispatch_notes")
        .select("*")
        .order("dispatch_date", { ascending: false });

      if (workOrderId) {
        query = query.eq("work_order_id", workOrderId);
      }

      const { data, error } = await query;

      if (error) throw error;
      setDispatchNotes((data || []) as DispatchNote[]);
    } catch (error) {
      console.error("Error loading dispatch notes:", error);
      setDispatchNotes([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDispatchNotes();
  }, [workOrderId]);

  const createDispatchNote = async (data: CreateDispatchNoteInput): Promise<DispatchNote | null> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();

      // Generate dispatch note number
      const { data: existing } = await supabase
        .from("dispatch_notes")
        .select("dispatch_note_no")
        .order("created_at", { ascending: false })
        .limit(1);

      let noteNo = "DN-0001";
      if (existing && existing.length > 0) {
        const lastNo = existing[0].dispatch_note_no;
        const numMatch = lastNo.match(/DN-(\d+)/);
        if (numMatch) {
          const lastNum = parseInt(numMatch[1]);
          noteNo = `DN-${String(lastNum + 1).padStart(4, "0")}`;
        }
      }

      const { data: newNote, error } = await supabase
        .from("dispatch_notes")
        .insert({
          dispatch_note_no: noteNo,
          work_order_id: data.work_order_id,
          sales_order_id: data.sales_order_id,
          carton_id: data.carton_id,
          shipment_id: data.shipment_id,
          dispatch_id: data.dispatch_id,
          item_code: data.item_code,
          item_description: data.item_description,
          so_ordered_qty: data.so_ordered_qty,
          packed_qty: data.packed_qty,
          dispatched_qty: data.dispatched_qty,
          rejected_qty: data.rejected_qty || 0,
          unit_rate: data.unit_rate,
          currency: data.currency || "USD",
          gross_weight_kg: data.gross_weight_kg,
          net_weight_kg: data.net_weight_kg,
          created_by: user?.id,
        })
        .select()
        .single();

      if (error) throw error;
      
      // Refresh list
      await loadDispatchNotes();
      
      return newNote as DispatchNote;
    } catch (error) {
      console.error("Error creating dispatch note:", error);
      return null;
    }
  };

  const getUninvoicedNotes = (): DispatchNote[] => {
    return dispatchNotes.filter(note => !note.invoiced && !note.invoice_id);
  };

  return {
    dispatchNotes,
    loading,
    refresh: loadDispatchNotes,
    createDispatchNote,
    getUninvoicedNotes,
  };
}

/**
 * Check if user can override invoice quantity
 * Only Finance Admin and Admin roles can override
 */
export function useCanOverrideInvoiceQty(): boolean {
  const { hasAnyRole, loading } = useUserRole();
  
  if (loading) return false;
  return hasAnyRole(['finance_admin', 'admin', 'super_admin']);
}

/**
 * Get uninvoiced dispatch notes for a shipment
 */
export async function getShipmentDispatchNotes(shipmentId: string): Promise<DispatchNote[]> {
  const { data, error } = await supabase
    .from("dispatch_notes")
    .select("*")
    .eq("shipment_id", shipmentId)
    .eq("invoiced", false)
    .order("dispatch_date", { ascending: true });

  if (error) {
    console.error("Error fetching shipment dispatch notes:", error);
    return [];
  }

  return (data || []) as DispatchNote[];
}

/**
 * Mark dispatch notes as invoiced
 */
export async function markDispatchNotesInvoiced(
  dispatchNoteIds: string[],
  invoiceId: string
): Promise<boolean> {
  const { error } = await supabase
    .from("dispatch_notes")
    .update({
      invoiced: true,
      invoice_id: invoiceId,
    })
    .in("id", dispatchNoteIds);

  if (error) {
    console.error("Error marking dispatch notes as invoiced:", error);
    return false;
  }

  return true;
}
