import { supabase } from "@/integrations/supabase/client";

/**
 * Hook to get or create a production batch for a work order.
 * 
 * Production batches are created automatically when:
 * - First production log for a WO (initial batch)
 * - Production resumes after a partial dispatch (post_dispatch)
 * - Production restarts after a gap (gap_restart, default 7 days)
 */

export interface ProductionBatch {
  id: string;
  wo_id: string;
  batch_number: number;
  trigger_reason: 'initial' | 'post_dispatch' | 'gap_restart';
  previous_batch_id: string | null;
  started_at: string;
  ended_at: string | null;
  created_at: string;
}

/**
 * Gets or creates the current active batch for a work order.
 * This is called automatically before creating a production log.
 * 
 * @param woId - The work order ID
 * @param gapThresholdDays - Number of days without logs to trigger a gap_restart (default: 7)
 * @returns The batch ID to use for the production log
 */
export async function getOrCreateBatch(
  woId: string,
  gapThresholdDays: number = 7
): Promise<string | null> {
  if (!woId) return null;
  
  try {
    const { data, error } = await supabase.rpc('get_or_create_production_batch', {
      p_wo_id: woId,
      p_gap_threshold_days: gapThresholdDays
    });
    
    if (error) {
      console.error('Error getting/creating production batch:', error);
      return null;
    }
    
    return data as string;
  } catch (err) {
    console.error('Failed to get/create production batch:', err);
    return null;
  }
}

/**
 * Gets all batches for a work order.
 */
export async function getWorkOrderBatches(woId: string): Promise<ProductionBatch[]> {
  if (!woId) return [];
  
  const { data, error } = await supabase
    .from('production_batches')
    .select('*')
    .eq('wo_id', woId)
    .order('batch_number', { ascending: true });
  
  if (error) {
    console.error('Error fetching production batches:', error);
    return [];
  }
  
  return (data as ProductionBatch[]) || [];
}

/**
 * Gets the current active batch for a work order (the one without an ended_at date).
 */
export async function getCurrentBatch(woId: string): Promise<ProductionBatch | null> {
  if (!woId) return null;
  
  const { data, error } = await supabase
    .from('production_batches')
    .select('*')
    .eq('wo_id', woId)
    .is('ended_at', null)
    .order('batch_number', { ascending: false })
    .limit(1)
    .maybeSingle();
  
  if (error) {
    console.error('Error fetching current batch:', error);
    return null;
  }
  
  return data as ProductionBatch | null;
}
