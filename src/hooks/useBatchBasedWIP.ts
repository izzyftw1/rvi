import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Batch-Based WIP Hook
 * 
 * SINGLE SOURCE OF TRUTH: All stage counts, quantities, queues, and partner views
 * are derived from production_batches table.
 * 
 * Rules:
 * 1. Work Orders are planning containers only
 * 2. A Work Order may have multiple active batches in different stages simultaneously
 * 3. Do NOT infer stage from work_orders.current_stage
 * 4. All operational metrics come from production_batches
 */

export interface BatchStageMetrics {
  stage: string;
  batchCount: number;
  totalQuantity: number;
  inQueue: number;
  inProgress: number;
  completed: number;
  avgWaitHours: number;
  overdueCount: number;
}

export interface ExternalPartnerMetrics {
  partnerId: string;
  partnerName: string;
  processType: string;
  batchCount: number;
  totalQuantity: number;
  avgWaitHours: number;
  overdueCount: number;
}

export interface ExternalProcessMetrics {
  processType: string;
  batchCount: number;
  totalQuantity: number;
  partnerBreakdown: ExternalPartnerMetrics[];
  avgWaitHours: number;
  overdueCount: number;
}

export interface BatchBasedWIPData {
  // Internal stages - derived from production_batches.stage_type
  internalStages: BatchStageMetrics[];
  
  // External breakdown - derived from production_batches where stage_type='external'
  externalProcesses: ExternalProcessMetrics[];
  
  // Partner-level view - batches grouped by external_partner_id
  partnerMetrics: ExternalPartnerMetrics[];
  
  // Summary totals
  summary: {
    totalBatches: number;
    totalInternalWIP: number;
    totalExternalWIP: number;
    productionBatches: number;
    qcBatches: number;
    packingBatches: number;
    dispatchedBatches: number;
  };
  
  loading: boolean;
  refresh: () => void;
}

interface BatchRecord {
  id: string;
  wo_id: string;
  batch_number: number;
  batch_quantity: number;
  stage_type: string;
  batch_status: string;
  external_process_type: string | null;
  external_partner_id: string | null;
  stage_entered_at: string | null;
  ended_at: string | null;
  external_sent_at: string | null;
  work_order?: {
    due_date: string | null;
  };
  external_partner?: {
    id: string;
    name: string;
  } | null;
}

const INTERNAL_STAGES = ['cutting', 'production', 'qc', 'packing', 'dispatch'];

export function useBatchBasedWIP(): BatchBasedWIPData {
  const [batches, setBatches] = useState<BatchRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      
      // Fetch all active batches with related work order and partner info
      const { data, error } = await supabase
        .from('production_batches')
        .select(`
          id,
          wo_id,
          batch_number,
          batch_quantity,
          stage_type,
          batch_status,
          external_process_type,
          external_partner_id,
          stage_entered_at,
          ended_at,
          external_sent_at,
          work_orders!production_batches_wo_id_fkey (
            due_date
          ),
          external_partners!production_batches_external_partner_id_fkey (
            id,
            name
          )
        `)
        .is('ended_at', null); // Only active batches

      if (error) throw error;
      
      // Map the data to our interface
      const mappedBatches: BatchRecord[] = (data || []).map((b: any) => ({
        id: b.id,
        wo_id: b.wo_id,
        batch_number: b.batch_number,
        batch_quantity: b.batch_quantity || 0,
        stage_type: b.stage_type || 'production',
        batch_status: b.batch_status || 'in_queue',
        external_process_type: b.external_process_type,
        external_partner_id: b.external_partner_id,
        stage_entered_at: b.stage_entered_at,
        ended_at: b.ended_at,
        external_sent_at: b.external_sent_at,
        work_order: b.work_orders,
        external_partner: b.external_partners
      }));
      
      setBatches(mappedBatches);
    } catch (error) {
      console.error('Error loading batch-based WIP:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();

    // Real-time subscription to production_batches
    const channel = supabase
      .channel('batch-based-wip-realtime')
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

  // Calculate internal stage metrics
  const internalStages = useMemo<BatchStageMetrics[]>(() => {
    const today = new Date();
    
    return INTERNAL_STAGES.map(stage => {
      const stageBatches = batches.filter(b => b.stage_type === stage);
      
      const totalQuantity = stageBatches.reduce((sum, b) => sum + b.batch_quantity, 0);
      const batchCount = stageBatches.length;
      const inQueue = stageBatches.filter(b => b.batch_status === 'in_queue').length;
      const inProgress = stageBatches.filter(b => b.batch_status === 'in_progress').length;
      const completed = stageBatches.filter(b => b.batch_status === 'completed').length;
      
      // Calculate avg wait time
      let totalWaitHours = 0;
      stageBatches.forEach(b => {
        if (b.stage_entered_at) {
          const enteredAt = new Date(b.stage_entered_at);
          totalWaitHours += (today.getTime() - enteredAt.getTime()) / (1000 * 60 * 60);
        }
      });
      
      // Count overdue based on work order due date
      const overdueCount = stageBatches.filter(b => {
        if (b.work_order?.due_date) {
          return new Date(b.work_order.due_date) < today;
        }
        return false;
      }).length;
      
      return {
        stage,
        batchCount,
        totalQuantity,
        inQueue,
        inProgress,
        completed,
        avgWaitHours: batchCount > 0 ? totalWaitHours / batchCount : 0,
        overdueCount
      };
    });
  }, [batches]);

  // Calculate external process metrics (from batches where stage_type='external')
  const externalProcesses = useMemo<ExternalProcessMetrics[]>(() => {
    const today = new Date();
    const externalBatches = batches.filter(b => b.stage_type === 'external');
    
    // Group by process type
    const processMap = new Map<string, BatchRecord[]>();
    externalBatches.forEach(b => {
      const process = b.external_process_type || 'Unknown';
      const existing = processMap.get(process) || [];
      existing.push(b);
      processMap.set(process, existing);
    });
    
    return Array.from(processMap.entries()).map(([processType, processBatches]) => {
      const batchCount = processBatches.length;
      const totalQuantity = processBatches.reduce((sum, b) => sum + b.batch_quantity, 0);
      
      // Calculate avg wait time
      let totalWaitHours = 0;
      processBatches.forEach(b => {
        const sentAt = b.external_sent_at || b.stage_entered_at;
        if (sentAt) {
          totalWaitHours += (today.getTime() - new Date(sentAt).getTime()) / (1000 * 60 * 60);
        }
      });
      
      // Count overdue
      const overdueCount = processBatches.filter(b => {
        if (b.work_order?.due_date) {
          return new Date(b.work_order.due_date) < today;
        }
        return false;
      }).length;
      
      // Partner breakdown within this process
      const partnerMap = new Map<string, BatchRecord[]>();
      processBatches.forEach(b => {
        const partnerId = b.external_partner_id || 'unknown';
        const existing = partnerMap.get(partnerId) || [];
        existing.push(b);
        partnerMap.set(partnerId, existing);
      });
      
      const partnerBreakdown: ExternalPartnerMetrics[] = Array.from(partnerMap.entries()).map(([partnerId, partnerBatches]) => {
        const partnerName = partnerBatches[0]?.external_partner?.name || 'Unknown Partner';
        const partnerBatchCount = partnerBatches.length;
        const partnerTotalQty = partnerBatches.reduce((sum, b) => sum + b.batch_quantity, 0);
        
        let partnerWaitHours = 0;
        partnerBatches.forEach(b => {
          const sentAt = b.external_sent_at || b.stage_entered_at;
          if (sentAt) {
            partnerWaitHours += (today.getTime() - new Date(sentAt).getTime()) / (1000 * 60 * 60);
          }
        });
        
        const partnerOverdue = partnerBatches.filter(b => {
          if (b.work_order?.due_date) {
            return new Date(b.work_order.due_date) < today;
          }
          return false;
        }).length;
        
        return {
          partnerId,
          partnerName,
          processType,
          batchCount: partnerBatchCount,
          totalQuantity: partnerTotalQty,
          avgWaitHours: partnerBatchCount > 0 ? partnerWaitHours / partnerBatchCount : 0,
          overdueCount: partnerOverdue
        };
      });
      
      return {
        processType,
        batchCount,
        totalQuantity,
        partnerBreakdown,
        avgWaitHours: batchCount > 0 ? totalWaitHours / batchCount : 0,
        overdueCount
      };
    });
  }, [batches]);

  // Calculate partner-level metrics (all external batches grouped by partner)
  const partnerMetrics = useMemo<ExternalPartnerMetrics[]>(() => {
    const today = new Date();
    const externalBatches = batches.filter(b => b.stage_type === 'external');
    
    const partnerMap = new Map<string, BatchRecord[]>();
    externalBatches.forEach(b => {
      const partnerId = b.external_partner_id || 'unknown';
      const existing = partnerMap.get(partnerId) || [];
      existing.push(b);
      partnerMap.set(partnerId, existing);
    });
    
    return Array.from(partnerMap.entries()).map(([partnerId, partnerBatches]) => {
      const partnerName = partnerBatches[0]?.external_partner?.name || 'Unknown Partner';
      const processType = partnerBatches[0]?.external_process_type || 'Unknown';
      const batchCount = partnerBatches.length;
      const totalQuantity = partnerBatches.reduce((sum, b) => sum + b.batch_quantity, 0);
      
      let totalWaitHours = 0;
      partnerBatches.forEach(b => {
        const sentAt = b.external_sent_at || b.stage_entered_at;
        if (sentAt) {
          totalWaitHours += (today.getTime() - new Date(sentAt).getTime()) / (1000 * 60 * 60);
        }
      });
      
      const overdueCount = partnerBatches.filter(b => {
        if (b.work_order?.due_date) {
          return new Date(b.work_order.due_date) < today;
        }
        return false;
      }).length;
      
      return {
        partnerId,
        partnerName,
        processType,
        batchCount,
        totalQuantity,
        avgWaitHours: batchCount > 0 ? totalWaitHours / batchCount : 0,
        overdueCount
      };
    }).sort((a, b) => b.overdueCount - a.overdueCount || b.totalQuantity - a.totalQuantity);
  }, [batches]);

  // Calculate summary
  const summary = useMemo(() => {
    const totalBatches = batches.length;
    const externalBatches = batches.filter(b => b.stage_type === 'external');
    const internalBatches = batches.filter(b => b.stage_type !== 'external' && b.stage_type !== 'dispatched');
    
    return {
      totalBatches,
      totalInternalWIP: internalBatches.reduce((sum, b) => sum + b.batch_quantity, 0),
      totalExternalWIP: externalBatches.reduce((sum, b) => sum + b.batch_quantity, 0),
      productionBatches: batches.filter(b => b.stage_type === 'production').length,
      qcBatches: batches.filter(b => b.stage_type === 'qc').length,
      packingBatches: batches.filter(b => b.stage_type === 'packing').length,
      dispatchedBatches: batches.filter(b => b.stage_type === 'dispatched').length
    };
  }, [batches]);

  return {
    internalStages,
    externalProcesses,
    partnerMetrics,
    summary,
    loading,
    refresh: loadData
  };
}
