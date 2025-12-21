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

interface OperationRoute {
  id: string;
  sequence_number: number;
  operation_type: OperationType;
  process_name: string | null;
  is_mandatory: boolean;
}

/**
 * Check if an operation is out of sequence based on the defined route
 */
async function checkOutOfSequence(
  workOrderId: string,
  operationType: OperationType,
  processName?: string
): Promise<{ outOfSequence: boolean; routeStepId: string | null }> {
  try {
    // Load the operation routes for this work order
    const { data: routes, error: routesError } = await supabase
      .from("operation_routes")
      .select("*")
      .eq("work_order_id", workOrderId)
      .order("sequence_number");

    if (routesError || !routes || routes.length === 0) {
      return { outOfSequence: false, routeStepId: null };
    }

    // Find the current operation in the route
    const currentRouteStep = routes.find((r: OperationRoute) => {
      const typeMatch = r.operation_type === operationType;
      const processMatch = !r.process_name || r.process_name === processName;
      return typeMatch && processMatch;
    });

    if (!currentRouteStep) {
      // Operation not in route - not out of sequence
      return { outOfSequence: false, routeStepId: null };
    }

    // Get all mandatory previous steps
    const previousMandatorySteps = routes.filter((r: OperationRoute) => 
      r.sequence_number < currentRouteStep.sequence_number && r.is_mandatory
    );

    if (previousMandatorySteps.length === 0) {
      return { outOfSequence: false, routeStepId: currentRouteStep.id };
    }

    // Load existing execution records for this work order
    const { data: executions, error: execError } = await supabase
      .from("execution_records")
      .select("operation_type, process_name")
      .eq("work_order_id", workOrderId);

    if (execError) {
      return { outOfSequence: false, routeStepId: currentRouteStep.id };
    }

    // Check if all previous mandatory steps have executions
    for (const prevStep of previousMandatorySteps) {
      const hasExecution = (executions || []).some((exec: any) => {
        const typeMatch = exec.operation_type === prevStep.operation_type;
        const processMatch = !prevStep.process_name || exec.process_name === prevStep.process_name;
        return typeMatch && processMatch;
      });

      if (!hasExecution) {
        // Found a mandatory previous step without execution
        return { outOfSequence: true, routeStepId: currentRouteStep.id };
      }
    }

    return { outOfSequence: false, routeStepId: currentRouteStep.id };
  } catch (error) {
    console.error("Error checking out of sequence:", error);
    return { outOfSequence: false, routeStepId: null };
  }
}

/**
 * Creates an execution record for tracking material flow through the production process.
 * This is a lightweight logging layer that does not affect existing workflows.
 * Automatically detects out-of-sequence operations and flags them.
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
    
    // Check if this operation is out of sequence
    const { outOfSequence, routeStepId } = await checkOutOfSequence(
      workOrderId,
      operationType,
      processName
    );
    
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
        out_of_sequence: outOfSequence,
        route_step_id: routeStepId,
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
