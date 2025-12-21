import { supabase } from "@/integrations/supabase/client";

export type OperationType = 'RAW_MATERIAL' | 'CNC' | 'QC' | 'EXTERNAL_PROCESS' | 'PACKING' | 'DISPATCH';
export type ExecutionDirection = 'IN' | 'OUT' | 'COMPLETE';

interface CreateExecutionRecordParams {
  workOrderId: string;
  operationType: OperationType;
  processName?: string;
  quantity: number;
  unit: 'pcs' | 'kg';
  direction: ExecutionDirection;
  relatedPartnerId?: string | null;
  relatedChallanId?: string | null;
}

/**
 * Creates an execution record for tracking material flow through the production process.
 * This is a lightweight logging layer that does not affect existing workflows.
 */
export async function createExecutionRecord({
  workOrderId,
  operationType,
  processName,
  quantity,
  unit,
  direction,
  relatedPartnerId,
  relatedChallanId,
}: CreateExecutionRecordParams): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    const { error } = await supabase
      .from("execution_records")
      .insert({
        work_order_id: workOrderId,
        operation_type: operationType,
        process_name: processName || null,
        quantity,
        unit,
        direction,
        related_partner_id: relatedPartnerId || null,
        related_challan_id: relatedChallanId || null,
        created_by: user?.id || null,
      });

    if (error) {
      // Log error but don't fail the main operation
      console.error("Failed to create execution record:", error);
    }
  } catch (err) {
    // Silently fail - execution tracking should never block main operations
    console.error("Error in createExecutionRecord:", err);
  }
}

/**
 * Hook for execution record tracking
 */
export function useExecutionRecord() {
  return {
    createExecutionRecord,
  };
}
