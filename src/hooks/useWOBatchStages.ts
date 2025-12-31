import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * WO Batch Stages Hook - REFACTORED
 * 
 * SINGLE SOURCE OF TRUTH: production_batches
 * Uses: current_location_type, current_process, batch_quantity
 * 
 * NO DEPENDENCY on work_order.stage
 */

export interface WOBatchStageBreakdown {
  // Factory processes
  cutting: number;
  production: number;
  qc: number;
  packing: number;
  
  // External
  external: number;
  externalBreakdown: Record<string, number>; // by process type
  
  // Other locations
  transit: number;
  packed: number;
  dispatched: number;
  
  // Totals
  totalActive: number;
  stageCount: number;
  isSplitFlow: boolean;
  
  // Batch-level status rollup (calculated per batch, then aggregated)
  statusRollup: {
    late: number;         // batches past expected date
    qcPending: number;    // batches awaiting QC
    blocked: number;      // batches with blockers
    onTrack: number;      // batches progressing normally
  };
}

export interface WOBatchStagesData {
  stagesByWO: Record<string, WOBatchStageBreakdown>;
  loading: boolean;
  refresh: () => void;
}

interface BatchRecord {
  wo_id: string;
  batch_quantity: number;
  current_location_type: string;
  current_process: string | null;
  batch_status: string;
  ended_at: string | null;
  wo_quantity?: number;
  wo_due_date?: string | null;
  expected_return_date?: string | null;
  // MEDIUM PRIORITY 3 FIX: Add stage_type for consistency with useBatchDashboard
  stage_type?: string;
  external_partner_id?: string | null;
}

const EMPTY_BREAKDOWN: WOBatchStageBreakdown = {
  cutting: 0,
  production: 0,
  qc: 0,
  packing: 0,
  external: 0,
  externalBreakdown: {},
  transit: 0,
  packed: 0,
  dispatched: 0,
  totalActive: 0,
  stageCount: 0,
  isSplitFlow: false,
  statusRollup: {
    late: 0,
    qcPending: 0,
    blocked: 0,
    onTrack: 0,
  },
};

export function useWOBatchStages(woIds?: string[]): WOBatchStagesData {
  const [batches, setBatches] = useState<BatchRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      
      // MEDIUM PRIORITY 3 FIX: Align query with useBatchDashboard fields
      let query = supabase
        .from('production_batches')
        .select(`
          wo_id, 
          batch_quantity, 
          current_location_type,
          current_process,
          batch_status,
          ended_at,
          stage_type,
          external_partner_id,
          work_orders!inner(quantity, due_date)
        `);
      
      if (woIds && woIds.length > 0) {
        query = query.in('wo_id', woIds);
      }

      const { data, error } = await query;

      if (error) throw error;
      
      // Fetch expected_return_date from wo_external_moves for external batches
      const externalBatchWoIds = (data || [])
        .filter((b: any) => b.current_location_type === 'external_partner' || b.stage_type === 'external')
        .map((b: any) => b.wo_id);
      
      let expectedReturnDates: Record<string, string> = {};
      if (externalBatchWoIds.length > 0) {
        const { data: movesData } = await supabase
          .from('wo_external_moves')
          .select('work_order_id, expected_return_date')
          .in('work_order_id', externalBatchWoIds)
          .in('status', ['sent', 'in_transit', 'partial']);
        
        (movesData || []).forEach((m: any) => {
          if (m.expected_return_date) {
            if (!expectedReturnDates[m.work_order_id] || 
                m.expected_return_date < expectedReturnDates[m.work_order_id]) {
              expectedReturnDates[m.work_order_id] = m.expected_return_date;
            }
          }
        });
      }
      
      setBatches((data || []).map((b: any) => ({
        wo_id: b.wo_id,
        batch_quantity: b.batch_quantity || 0,
        current_location_type: b.current_location_type || 'factory',
        current_process: b.current_process,
        batch_status: b.batch_status || 'active',
        ended_at: b.ended_at,
        wo_quantity: b.work_orders?.quantity || 0,
        wo_due_date: b.work_orders?.due_date || null,
        expected_return_date: expectedReturnDates[b.wo_id] || null,
        stage_type: b.stage_type,
        external_partner_id: b.external_partner_id,
      })));
    } catch (error) {
      console.error('Error loading WO batch stages:', error);
    } finally {
      setLoading(false);
    }
  }, [woIds?.join(',')]);

  useEffect(() => {
    loadData();

    const channel = supabase
      .channel('wo-batch-stages-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'production_batches' },
        () => loadData()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadData]);

  // Compute stage breakdown per WO from production_batches
  const stagesByWO = useMemo<Record<string, WOBatchStageBreakdown>>(() => {
    const result: Record<string, WOBatchStageBreakdown> = {};
    const today = new Date();
    
    batches.forEach(batch => {
      if (!result[batch.wo_id]) {
        result[batch.wo_id] = {
          cutting: 0,
          production: 0,
          qc: 0,
          packing: 0,
          external: 0,
          externalBreakdown: {},
          transit: 0,
          packed: 0,
          dispatched: 0,
          totalActive: 0,
          stageCount: 0,
          isSplitFlow: false,
          statusRollup: {
            late: 0,
            qcPending: 0,
            blocked: 0,
            onTrack: 0,
          },
        };
      }
      
      const breakdown = result[batch.wo_id];
      const qty = batch.batch_quantity > 0 ? batch.batch_quantity : batch.wo_quantity || 0;
      const isActive = !batch.ended_at && batch.batch_status !== 'completed';
      const locationType = batch.current_location_type;
      const process = batch.current_process || 'unknown';
      
      switch (locationType) {
        case 'factory':
          // Map process to stage
          if (process === 'cutting') {
            breakdown.cutting += qty;
          } else if (process === 'production') {
            breakdown.production += qty;
          } else if (process === 'qc' || process === 'post_external_qc') {
            breakdown.qc += qty;
          } else if (process === 'packing') {
            breakdown.packing += qty;
          } else {
            // Default to production for unknown factory processes
            breakdown.production += qty;
          }
          if (isActive) breakdown.totalActive += qty;
          break;
          
        case 'external_partner':
          breakdown.external += qty;
          breakdown.externalBreakdown[process] = (breakdown.externalBreakdown[process] || 0) + qty;
          if (isActive) breakdown.totalActive += qty;
          break;
          
        case 'transit':
          breakdown.transit += qty;
          if (isActive) breakdown.totalActive += qty;
          break;
          
        case 'packed':
          breakdown.packed += qty;
          break;
          
        case 'dispatched':
          breakdown.dispatched += qty;
          break;
          
        default:
          // Default to production
          breakdown.production += qty;
          if (isActive) breakdown.totalActive += qty;
      }
      
      // Calculate batch-level status and roll up
      if (isActive) {
        // Check if batch is late - use expected_return_date for external, WO due date otherwise
        const isExternal = locationType === 'external_partner' || batch.stage_type === 'external';
        let isLate = false;
        
        if (isExternal && batch.expected_return_date) {
          isLate = new Date(batch.expected_return_date) < today;
        } else if (batch.wo_due_date) {
          isLate = new Date(batch.wo_due_date) < today;
        }
        
        if (isLate) {
          breakdown.statusRollup.late++;
        }
        // Check if batch is awaiting QC
        if (process === 'qc' || process === 'post_external_qc') {
          breakdown.statusRollup.qcPending++;
        }
        // Check if batch is blocked
        if (batch.batch_status === 'blocked') {
          breakdown.statusRollup.blocked++;
        }
        // Otherwise on track
        if (batch.batch_status !== 'blocked' && !isLate &&
            process !== 'qc' && process !== 'post_external_qc') {
          breakdown.statusRollup.onTrack++;
        }
      }
    });
    
    // Calculate stage count and isSplitFlow for each WO
    Object.values(result).forEach(breakdown => {
      let activeStages = 0;
      if (breakdown.cutting > 0) activeStages++;
      if (breakdown.production > 0) activeStages++;
      if (breakdown.qc > 0) activeStages++;
      if (breakdown.packing > 0) activeStages++;
      if (breakdown.external > 0) activeStages++;
      if (breakdown.transit > 0) activeStages++;
      
      breakdown.stageCount = activeStages;
      breakdown.isSplitFlow = activeStages > 1;
    });
    
    return result;
  }, [batches]);

  return {
    stagesByWO,
    loading,
    refresh: loadData,
  };
}

export function getEmptyBreakdown(): WOBatchStageBreakdown {
  return { 
    ...EMPTY_BREAKDOWN, 
    externalBreakdown: {},
    statusRollup: { late: 0, qcPending: 0, blocked: 0, onTrack: 0 },
  };
}
