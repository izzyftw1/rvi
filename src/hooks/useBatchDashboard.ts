import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * useBatchDashboard - Production Batches as Single Source of Truth
 * 
 * All quantities and locations derived from:
 * - production_batches.current_location_type
 * - production_batches.current_process
 * - production_batches.batch_quantity (with work_orders.quantity fallback)
 * - production_batches.unit
 * 
 * NO DEPENDENCY on work_order.stage
 * 
 * Supports viewing by:
 * - Quantity (pcs or kg)
 * - Batch count
 */

// Location types from database enum
export type BatchLocationType = 'factory' | 'external_partner' | 'transit' | 'packed' | 'dispatched';
export type BatchUnit = 'pcs' | 'kg';

export interface BatchRecord {
  id: string;
  wo_id: string;
  batch_number: number;
  batch_quantity: number;
  unit: BatchUnit;
  current_location_type: BatchLocationType;
  current_location_ref: string | null;
  current_process: string | null;
  batch_status: string;
  stage_entered_at: string | null;
  external_partner_id: string | null;
  // Joined data
  wo_quantity?: number;
  wo_display_id?: string;
  customer?: string;
  item_code?: string;
  partner_name?: string;
}

export interface LocationSummary {
  location: BatchLocationType;
  process: string;
  quantity: number;
  batchCount: number;
  inProgress: number;
  inQueue: number;
  partnerId?: string;
  partnerName?: string;
}

export interface DashboardSummary {
  // By location type
  factory: {
    total: number;
    batchCount: number;
    byProcess: Record<string, { quantity: number; batchCount: number }>;
  };
  external_partner: {
    total: number;
    batchCount: number;
    byProcess: Record<string, { quantity: number; batchCount: number; partnerName?: string }>;
    byPartner: Record<string, { quantity: number; batchCount: number; partnerName: string }>;
  };
  transit: {
    total: number;
    batchCount: number;
  };
  packed: {
    total: number;
    batchCount: number;
  };
  dispatched: {
    total: number;
    batchCount: number;
  };
  
  // Convenience totals
  totalQuantity: number;
  totalBatches: number;
  activeQuantity: number; // factory + external_partner + transit
  activeBatches: number;
}

export interface BatchDashboardData {
  batches: BatchRecord[];
  summary: DashboardSummary;
  locations: LocationSummary[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

const EMPTY_SUMMARY: DashboardSummary = {
  factory: { total: 0, batchCount: 0, byProcess: {} },
  external_partner: { total: 0, batchCount: 0, byProcess: {}, byPartner: {} },
  transit: { total: 0, batchCount: 0 },
  packed: { total: 0, batchCount: 0 },
  dispatched: { total: 0, batchCount: 0 },
  totalQuantity: 0,
  totalBatches: 0,
  activeQuantity: 0,
  activeBatches: 0,
};

export function useBatchDashboard(): BatchDashboardData {
  const [batches, setBatches] = useState<BatchRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch all active batches with joined data
      const { data, error: fetchError } = await supabase
        .from('production_batches')
        .select(`
          id,
          wo_id,
          batch_number,
          batch_quantity,
          current_location_type,
          current_location_ref,
          current_process,
          batch_status,
          stage_entered_at,
          external_partner_id,
          unit,
          work_orders!inner(
            quantity,
            display_id,
            customer,
            item_code
          ),
          external_partners(name)
        `)
        .is('ended_at', null); // Only active batches

      if (fetchError) throw fetchError;

      const records: BatchRecord[] = (data || []).map((b: any) => ({
        id: b.id,
        wo_id: b.wo_id,
        batch_number: b.batch_number,
        batch_quantity: b.batch_quantity || 0,
        unit: b.unit || 'pcs',
        current_location_type: b.current_location_type || 'factory',
        current_location_ref: b.current_location_ref,
        current_process: b.current_process,
        batch_status: b.batch_status || 'active',
        stage_entered_at: b.stage_entered_at,
        external_partner_id: b.external_partner_id,
        wo_quantity: b.work_orders?.quantity || 0,
        wo_display_id: b.work_orders?.display_id,
        customer: b.work_orders?.customer,
        item_code: b.work_orders?.item_code,
        partner_name: b.external_partners?.name,
      }));

      setBatches(records);
    } catch (err: any) {
      console.error('Error loading batch dashboard:', err);
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();

    // Real-time subscription to production_batches, external_movements, and gate_register
    const channel = supabase
      .channel('batch-dashboard-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'production_batches' },
        () => loadData()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'external_movements' },
        () => loadData()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'gate_register' },
        () => loadData()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadData]);

  // Compute summary from batches
  const summary = useMemo<DashboardSummary>(() => {
    const result: DashboardSummary = JSON.parse(JSON.stringify(EMPTY_SUMMARY));

    batches.forEach(batch => {
      // Use batch_quantity if set, otherwise fall back to WO quantity
      const qty = batch.batch_quantity > 0 ? batch.batch_quantity : batch.wo_quantity || 0;
      const locationType = batch.current_location_type || 'factory';
      const process = batch.current_process || 'unknown';
      const isActive = batch.batch_status === 'active' || batch.batch_status === 'in_progress';

      result.totalQuantity += qty;
      result.totalBatches += 1;

      switch (locationType) {
        case 'factory':
          result.factory.total += qty;
          result.factory.batchCount += 1;
          if (!result.factory.byProcess[process]) {
            result.factory.byProcess[process] = { quantity: 0, batchCount: 0 };
          }
          result.factory.byProcess[process].quantity += qty;
          result.factory.byProcess[process].batchCount += 1;
          if (isActive) {
            result.activeQuantity += qty;
            result.activeBatches += 1;
          }
          break;

        case 'external_partner':
          result.external_partner.total += qty;
          result.external_partner.batchCount += 1;
          
          // By process
          if (!result.external_partner.byProcess[process]) {
            result.external_partner.byProcess[process] = { quantity: 0, batchCount: 0 };
          }
          result.external_partner.byProcess[process].quantity += qty;
          result.external_partner.byProcess[process].batchCount += 1;
          
          // By partner
          const partnerId = batch.external_partner_id || batch.current_location_ref || 'unknown';
          const partnerName = batch.partner_name || 'Unknown Partner';
          if (!result.external_partner.byPartner[partnerId]) {
            result.external_partner.byPartner[partnerId] = { quantity: 0, batchCount: 0, partnerName };
          }
          result.external_partner.byPartner[partnerId].quantity += qty;
          result.external_partner.byPartner[partnerId].batchCount += 1;
          
          if (isActive) {
            result.activeQuantity += qty;
            result.activeBatches += 1;
          }
          break;

        case 'transit':
          result.transit.total += qty;
          result.transit.batchCount += 1;
          if (isActive) {
            result.activeQuantity += qty;
            result.activeBatches += 1;
          }
          break;

        case 'packed':
          result.packed.total += qty;
          result.packed.batchCount += 1;
          break;

        case 'dispatched':
          result.dispatched.total += qty;
          result.dispatched.batchCount += 1;
          break;
      }
    });

    return result;
  }, [batches]);

  // Flatten to location summaries for stage view
  const locations = useMemo<LocationSummary[]>(() => {
    const result: LocationSummary[] = [];

    // Factory processes
    Object.entries(summary.factory.byProcess).forEach(([process, data]) => {
      const processBatches = batches.filter(
        b => b.current_location_type === 'factory' && b.current_process === process
      );
      result.push({
        location: 'factory',
        process,
        quantity: data.quantity,
        batchCount: data.batchCount,
        inProgress: processBatches.filter(b => b.batch_status === 'active' || b.batch_status === 'in_progress').length,
        inQueue: processBatches.filter(b => b.batch_status === 'in_queue').length,
      });
    });

    // External partner processes
    Object.entries(summary.external_partner.byProcess).forEach(([process, data]) => {
      const processBatches = batches.filter(
        b => b.current_location_type === 'external_partner' && b.current_process === process
      );
      result.push({
        location: 'external_partner',
        process,
        quantity: data.quantity,
        batchCount: data.batchCount,
        inProgress: processBatches.length,
        inQueue: 0,
      });
    });

    // Transit
    if (summary.transit.batchCount > 0) {
      result.push({
        location: 'transit',
        process: 'in_transit',
        quantity: summary.transit.total,
        batchCount: summary.transit.batchCount,
        inProgress: summary.transit.batchCount,
        inQueue: 0,
      });
    }

    // Packed
    if (summary.packed.batchCount > 0) {
      result.push({
        location: 'packed',
        process: 'packed',
        quantity: summary.packed.total,
        batchCount: summary.packed.batchCount,
        inProgress: 0,
        inQueue: summary.packed.batchCount,
      });
    }

    // Dispatched
    if (summary.dispatched.batchCount > 0) {
      result.push({
        location: 'dispatched',
        process: 'dispatched',
        quantity: summary.dispatched.total,
        batchCount: summary.dispatched.batchCount,
        inProgress: 0,
        inQueue: 0,
      });
    }

    return result;
  }, [batches, summary]);

  return {
    batches,
    summary,
    locations,
    loading,
    error,
    refresh: loadData,
  };
}

// Helper to get batches for a specific location/process
export function filterBatchesByLocation(
  batches: BatchRecord[],
  location: BatchLocationType,
  process?: string
): BatchRecord[] {
  return batches.filter(b => {
    if (b.current_location_type !== location) return false;
    if (process && b.current_process !== process) return false;
    return true;
  });
}

// Helper to calculate total quantity from batches
export function sumBatchQuantity(batches: BatchRecord[]): number {
  return batches.reduce((sum, b) => {
    const qty = b.batch_quantity > 0 ? b.batch_quantity : b.wo_quantity || 0;
    return sum + qty;
  }, 0);
}
