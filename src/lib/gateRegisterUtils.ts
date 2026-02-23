import { supabase } from "@/integrations/supabase/client";

/**
 * Shared utility to create gate_register entries from any page.
 * Ensures all movement pages use the exact same format as GateRegister.tsx.
 */

export interface CreateGateEntryParams {
  direction: 'IN' | 'OUT';
  material_type: 'raw_material' | 'external_process' | 'finished_goods' | 'scrap' | 'other';
  gross_weight_kg: number;
  net_weight_kg?: number | null;
  tare_weight_kg?: number;
  estimated_pcs?: number | null;
  item_name?: string | null;
  rod_section_size?: string | null;
  material_grade?: string | null;
  alloy?: string | null;
  heat_no?: string | null;
  supplier_id?: string | null;
  supplier_name?: string | null;
  party_code?: string | null;
  customer_id?: string | null;
  partner_id?: string | null;
  process_type?: string | null;
  work_order_id?: string | null;
  rpo_id?: string | null;
  challan_no?: string | null;
  dc_number?: string | null;
  vehicle_no?: string | null;
  transporter?: string | null;
  qc_required?: boolean;
  remarks?: string | null;
  created_by?: string | null;
}

export async function createGateEntry(params: CreateGateEntryParams): Promise<{ id: string; gate_entry_no: string } | null> {
  try {
    const gateEntryNo = `G${params.direction === 'IN' ? 'IN' : 'OUT'}-${Date.now()}`;
    const effectiveNetWeight = params.net_weight_kg ?? params.gross_weight_kg;

    const insertPayload: Record<string, any> = {
      direction: params.direction,
      material_type: params.material_type,
      gate_entry_no: gateEntryNo,
      gross_weight_kg: params.gross_weight_kg,
      tare_weight_kg: params.tare_weight_kg ?? 0,
      net_weight_kg: effectiveNetWeight,
      status: 'completed',
      estimated_pcs: params.estimated_pcs ?? null,
      item_name: params.item_name ?? null,
      rod_section_size: params.rod_section_size ?? null,
      material_grade: params.material_grade ?? null,
      alloy: params.alloy ?? null,
      heat_no: params.heat_no ?? null,
      supplier_id: params.supplier_id ?? null,
      supplier_name: params.supplier_name ?? null,
      party_code: params.party_code ?? null,
      customer_id: params.customer_id ?? null,
      partner_id: params.partner_id ?? null,
      process_type: params.process_type ?? null,
      work_order_id: params.work_order_id ?? null,
      rpo_id: params.rpo_id ?? null,
      challan_no: params.challan_no ?? null,
      dc_number: params.dc_number ?? null,
      vehicle_no: params.vehicle_no ?? null,
      transporter: params.transporter ?? null,
      qc_required: params.qc_required ?? false,
      qc_status: params.qc_required ? 'pending' : 'not_required',
      remarks: params.remarks ?? null,
      created_by: params.created_by ?? null,
    };

    const { data, error } = await (supabase as any)
      .from("gate_register")
      .insert(insertPayload)
      .select("id, gate_entry_no")
      .single();

    if (error) {
      console.error("[GateRegister] Failed to create gate entry:", error);
      return null;
    }

    return data;
  } catch (err) {
    console.error("[GateRegister] Error creating gate entry:", err);
    return null;
  }
}
