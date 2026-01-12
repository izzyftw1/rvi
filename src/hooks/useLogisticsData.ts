import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { differenceInDays, startOfMonth, format } from "date-fns";

export interface CartonData {
  id: string;
  carton_id: string;
  wo_id: string;
  quantity: number;
  dispatched_qty: number;
  status: string;
  built_at: string;
  net_weight: number;
  gross_weight: number;
  dispatch_qc_batch_id: string | null;
  work_order?: {
    display_id: string;
    customer: string;
    item_code: string;
    net_weight_per_pc: number | null;
  };
  dispatch_qc_batch?: {
    status: string;
    qc_approved_quantity: number;
  };
}

export interface DispatchRecord {
  id: string;
  wo_id: string;
  quantity: number;
  dispatched_at: string;
  shipment_id: string | null;
  carton_id: string | null;
  work_order?: {
    display_id: string;
    customer: string;
    item_code: string;
  };
  shipment?: {
    ship_id: string;
    status: string | null;
  };
}

export interface FinishedGoodsItem {
  id: string;
  item_code: string;
  customer_name: string | null;
  quantity_available: number;
  quantity_reserved: number;
  created_at: string;
  unit_cost: number | null;
  currency: string | null;
}

export interface LogisticsFilters {
  dateRange: { from: Date | null; to: Date | null };
  customer: string;
  workOrder: string;
  itemCode: string;
  dispatchStatus: string;
}

export interface AgeingBucket {
  range: string;
  minDays: number;
  maxDays: number;
  quantity: number;
  cartonCount: number;
  value: number;
}

export interface PipelineCount {
  awaitingDispatchQC: number;
  readyForDispatch: number;
  partiallyDispatched: number;
  fullyDispatched: number;
}

export interface LogisticsMetrics {
  packedNotDispatched: { qty: number; cartons: number; value: number };
  dispatchedToday: { qty: number; cartons: number };
  dispatchedMTD: { qty: number };
  ageingExposure: { value: number; qty: number };
  inventoryByState: { packed: number; unpacked: number; reserved: number };
}

export function useLogisticsData(filters: LogisticsFilters) {
  const [cartons, setCartons] = useState<CartonData[]>([]);
  const [dispatches, setDispatches] = useState<DispatchRecord[]>([]);
  const [finishedGoods, setFinishedGoods] = useState<FinishedGoodsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<{ id: string; customer_name: string }[]>([]);
  const [workOrders, setWorkOrders] = useState<{ id: string; display_id: string }[]>([]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);

      // Load cartons with work order and dispatch QC info
      const { data: cartonsData } = await supabase
        .from("cartons")
        .select(`
          id, carton_id, wo_id, quantity, dispatched_qty, status, built_at, net_weight, gross_weight, dispatch_qc_batch_id
        `)
        .order("built_at", { ascending: false });

      // Get unique WO IDs
      const woIds = [...new Set((cartonsData || []).map(c => c.wo_id))];
      
      // Load work orders
      const { data: woData } = await supabase
        .from("work_orders")
        .select("id, display_id, customer, item_code, net_weight_per_pc")
        .in("id", woIds.length > 0 ? woIds : ['00000000-0000-0000-0000-000000000000']);

      const woMap = Object.fromEntries((woData || []).map(wo => [wo.id, wo]));

      // Load dispatch QC batches
      const qcBatchIds = [...new Set((cartonsData || []).filter(c => c.dispatch_qc_batch_id).map(c => c.dispatch_qc_batch_id))];
      const { data: qcBatchData } = await supabase
        .from("dispatch_qc_batches")
        .select("id, status, qc_approved_quantity")
        .in("id", qcBatchIds.length > 0 ? qcBatchIds : ['00000000-0000-0000-0000-000000000000']);

      const qcBatchMap = Object.fromEntries((qcBatchData || []).map(qc => [qc.id, qc]));

      // Enrich cartons
      const enrichedCartons = (cartonsData || []).map(c => ({
        ...c,
        work_order: woMap[c.wo_id],
        dispatch_qc_batch: c.dispatch_qc_batch_id ? qcBatchMap[c.dispatch_qc_batch_id] : undefined,
      })) as CartonData[];

      setCartons(enrichedCartons);

      // Load dispatches
      let dispatchQuery = supabase
        .from("dispatches")
        .select("id, wo_id, quantity, dispatched_at, shipment_id, carton_id")
        .order("dispatched_at", { ascending: false });

      if (filters.dateRange.from) {
        dispatchQuery = dispatchQuery.gte("dispatched_at", filters.dateRange.from.toISOString());
      }
      if (filters.dateRange.to) {
        dispatchQuery = dispatchQuery.lte("dispatched_at", filters.dateRange.to.toISOString());
      }

      const { data: dispatchData } = await dispatchQuery;

      // Get WO info for dispatches
      const dispatchWoIds = [...new Set((dispatchData || []).map(d => d.wo_id))];
      const { data: dispatchWoData } = await supabase
        .from("work_orders")
        .select("id, display_id, customer, item_code")
        .in("id", dispatchWoIds.length > 0 ? dispatchWoIds : ['00000000-0000-0000-0000-000000000000']);

      const dispatchWoMap = Object.fromEntries((dispatchWoData || []).map(wo => [wo.id, wo]));

      // Get shipment info
      const shipmentIds = [...new Set((dispatchData || []).filter(d => d.shipment_id).map(d => d.shipment_id))];
      const { data: shipmentData } = await supabase
        .from("shipments")
        .select("id, ship_id, status")
        .in("id", shipmentIds.length > 0 ? shipmentIds : ['00000000-0000-0000-0000-000000000000']);

      const shipmentMap = Object.fromEntries((shipmentData || []).map(s => [s.id, s]));

      const enrichedDispatches = (dispatchData || []).map(d => ({
        ...d,
        work_order: dispatchWoMap[d.wo_id],
        shipment: d.shipment_id ? shipmentMap[d.shipment_id] : undefined,
      })) as DispatchRecord[];

      setDispatches(enrichedDispatches);

      // Load finished goods inventory
      const { data: fgData } = await supabase
        .from("finished_goods_inventory")
        .select("id, item_code, customer_name, quantity_available, quantity_reserved, created_at, unit_cost, currency")
        .gt("quantity_available", 0)
        .order("created_at", { ascending: false });

      setFinishedGoods(fgData || []);

      // Load customers for filter
      const { data: customerData } = await supabase
        .from("customer_master")
        .select("id, customer_name")
        .order("customer_name");
      setCustomers(customerData || []);

      // Load work orders for filter
      const { data: woFilterData } = await supabase
        .from("work_orders")
        .select("id, display_id")
        .in("status", ["pending", "in_progress", "packing", "qc"])
        .order("created_at", { ascending: false })
        .limit(100);
      setWorkOrders(woFilterData || []);

    } catch (error) {
      console.error("Error loading logistics data:", error);
    } finally {
      setLoading(false);
    }
  }, [filters.dateRange.from, filters.dateRange.to]);

  useEffect(() => {
    loadData();

    const channel = supabase
      .channel('logistics_control_tower')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cartons' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dispatches' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dispatch_qc_batches' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'finished_goods_inventory' }, loadData)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadData]);

  // Apply filters
  const filteredCartons = useMemo(() => {
    return cartons.filter(c => {
      if (filters.customer && c.work_order?.customer !== filters.customer) return false;
      if (filters.workOrder && c.wo_id !== filters.workOrder) return false;
      if (filters.itemCode && !c.work_order?.item_code?.toLowerCase().includes(filters.itemCode.toLowerCase())) return false;
      if (filters.dispatchStatus === "packed" && c.status !== "packed") return false;
      if (filters.dispatchStatus === "dispatched" && c.status !== "dispatched") return false;
      if (filters.dispatchStatus === "partial" && !(c.dispatched_qty > 0 && c.dispatched_qty < c.quantity)) return false;
      return true;
    });
  }, [cartons, filters]);

  const filteredDispatches = useMemo(() => {
    return dispatches.filter(d => {
      if (filters.customer && d.work_order?.customer !== filters.customer) return false;
      if (filters.workOrder && d.wo_id !== filters.workOrder) return false;
      if (filters.itemCode && !d.work_order?.item_code?.toLowerCase().includes(filters.itemCode.toLowerCase())) return false;
      return true;
    });
  }, [dispatches, filters]);

  // Calculate metrics
  const metrics = useMemo<LogisticsMetrics>(() => {
    const today = new Date();
    const monthStart = startOfMonth(today);
    
    const packedCartons = cartons.filter(c => c.status === "packed" || (c.status !== "dispatched" && c.dispatched_qty < c.quantity));
    const packedQty = packedCartons.reduce((sum, c) => sum + (c.quantity - (c.dispatched_qty || 0)), 0);
    // Use net_weight as proxy for value since unit_rate doesn't exist
    const packedValue = packedCartons.reduce((sum, c) => {
      const remainingQty = c.quantity - (c.dispatched_qty || 0);
      const weightPerPc = c.work_order?.net_weight_per_pc || 0;
      return sum + (remainingQty * weightPerPc);
    }, 0);

    const todayDispatches = dispatches.filter(d => 
      format(new Date(d.dispatched_at), 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd')
    );
    const mtdDispatches = dispatches.filter(d => new Date(d.dispatched_at) >= monthStart);

    // Ageing exposure (>15 days old packed goods)
    const ageingCartons = packedCartons.filter(c => differenceInDays(today, new Date(c.built_at)) > 15);
    const ageingValue = ageingCartons.reduce((sum, c) => {
      const remainingQty = c.quantity - (c.dispatched_qty || 0);
      const weightPerPc = c.work_order?.net_weight_per_pc || 0;
      return sum + (remainingQty * weightPerPc);
    }, 0);
    const ageingQty = ageingCartons.reduce((sum, c) => sum + (c.quantity - (c.dispatched_qty || 0)), 0);

    // Inventory by state
    const packedTotal = cartons.filter(c => c.status === "packed").reduce((sum, c) => sum + c.quantity, 0);
    const fgUnpacked = finishedGoods.reduce((sum, f) => sum + f.quantity_available, 0);
    const fgReserved = finishedGoods.reduce((sum, f) => sum + f.quantity_reserved, 0);

    return {
      packedNotDispatched: { qty: packedQty, cartons: packedCartons.length, value: packedValue },
      dispatchedToday: { qty: todayDispatches.reduce((sum, d) => sum + d.quantity, 0), cartons: todayDispatches.length },
      dispatchedMTD: { qty: mtdDispatches.reduce((sum, d) => sum + d.quantity, 0) },
      ageingExposure: { value: ageingValue, qty: ageingQty },
      inventoryByState: { packed: packedTotal, unpacked: fgUnpacked, reserved: fgReserved },
    };
  }, [cartons, dispatches, finishedGoods]);

  // Pipeline counts
  const pipeline = useMemo<PipelineCount>(() => {
    const awaitingQC = cartons.filter(c => 
      c.status === "packed" && 
      (!c.dispatch_qc_batch || !["approved", "partially_consumed", "consumed"].includes(c.dispatch_qc_batch.status))
    ).length;

    const ready = cartons.filter(c => 
      c.status === "packed" && 
      c.dispatch_qc_batch && 
      ["approved", "partially_consumed", "consumed"].includes(c.dispatch_qc_batch.status) &&
      c.dispatched_qty < c.quantity
    ).length;

    const partial = cartons.filter(c => 
      c.dispatched_qty > 0 && c.dispatched_qty < c.quantity
    ).length;

    const full = cartons.filter(c => c.status === "dispatched" || c.dispatched_qty >= c.quantity).length;

    return {
      awaitingDispatchQC: awaitingQC,
      readyForDispatch: ready,
      partiallyDispatched: partial,
      fullyDispatched: full,
    };
  }, [cartons]);

  // Ageing buckets
  const ageingBuckets = useMemo<AgeingBucket[]>(() => {
    const today = new Date();
    const packedCartons = cartons.filter(c => c.status === "packed" || (c.dispatched_qty < c.quantity));

    const buckets: AgeingBucket[] = [
      { range: "0-7 days", minDays: 0, maxDays: 7, quantity: 0, cartonCount: 0, value: 0 },
      { range: "8-15 days", minDays: 8, maxDays: 15, quantity: 0, cartonCount: 0, value: 0 },
      { range: "16-30 days", minDays: 16, maxDays: 30, quantity: 0, cartonCount: 0, value: 0 },
      { range: "30+ days", minDays: 31, maxDays: 9999, quantity: 0, cartonCount: 0, value: 0 },
    ];

    packedCartons.forEach(c => {
      const age = differenceInDays(today, new Date(c.built_at));
      const remainingQty = c.quantity - (c.dispatched_qty || 0);
      const weightPerPc = c.work_order?.net_weight_per_pc || 0;
      const value = remainingQty * weightPerPc;

      const bucket = buckets.find(b => age >= b.minDays && age <= b.maxDays);
      if (bucket) {
        bucket.quantity += remainingQty;
        bucket.cartonCount += 1;
        bucket.value += value;
      }
    });

    return buckets;
  }, [cartons]);

  return {
    cartons: filteredCartons,
    dispatches: filteredDispatches,
    finishedGoods,
    loading,
    metrics,
    pipeline,
    ageingBuckets,
    customers,
    workOrders,
    refresh: loadData,
  };
}
