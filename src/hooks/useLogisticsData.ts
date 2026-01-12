import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { differenceInDays, startOfMonth, format, startOfDay, endOfDay } from "date-fns";

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
  carton_id: string;
  item_code: string;
  customer: string | null;
  quantity: number;
  dispatched_qty: number;
  built_at: string;
  net_weight: number;
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
  inventoryByState: { packed: number; dispatched: number; reserved: number };
}

export function useLogisticsData(filters: LogisticsFilters) {
  const [cartons, setCartons] = useState<CartonData[]>([]);
  const [dispatches, setDispatches] = useState<DispatchRecord[]>([]);
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
      const { data: dispatchData } = await supabase
        .from("dispatches")
        .select("id, wo_id, quantity, dispatched_at, shipment_id, carton_id")
        .order("dispatched_at", { ascending: false });

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
  }, []);

  useEffect(() => {
    loadData();

    const channel = supabase
      .channel('logistics_control_tower')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cartons' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dispatches' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dispatch_qc_batches' }, loadData)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadData]);

  // Apply filters to cartons - this is the FILTERED dataset used everywhere
  const filteredCartons = useMemo(() => {
    return cartons.filter(c => {
      // Date filter on built_at
      if (filters.dateRange.from) {
        const builtDate = new Date(c.built_at);
        if (builtDate < startOfDay(filters.dateRange.from)) return false;
      }
      if (filters.dateRange.to) {
        const builtDate = new Date(c.built_at);
        if (builtDate > endOfDay(filters.dateRange.to)) return false;
      }
      // Customer filter
      if (filters.customer && c.work_order?.customer !== filters.customer) return false;
      // Work order filter
      if (filters.workOrder && c.wo_id !== filters.workOrder) return false;
      // Item code filter
      if (filters.itemCode && !c.work_order?.item_code?.toLowerCase().includes(filters.itemCode.toLowerCase())) return false;
      // Dispatch status filter
      if (filters.dispatchStatus === "packed" && c.status !== "packed") return false;
      if (filters.dispatchStatus === "dispatched" && c.status !== "dispatched") return false;
      if (filters.dispatchStatus === "partial" && !(c.dispatched_qty > 0 && c.dispatched_qty < c.quantity)) return false;
      return true;
    });
  }, [cartons, filters]);

  // Apply filters to dispatches
  const filteredDispatches = useMemo(() => {
    return dispatches.filter(d => {
      // Date filter on dispatched_at
      if (filters.dateRange.from) {
        const dispatchDate = new Date(d.dispatched_at);
        if (dispatchDate < startOfDay(filters.dateRange.from)) return false;
      }
      if (filters.dateRange.to) {
        const dispatchDate = new Date(d.dispatched_at);
        if (dispatchDate > endOfDay(filters.dateRange.to)) return false;
      }
      // Customer filter
      if (filters.customer && d.work_order?.customer !== filters.customer) return false;
      // Work order filter
      if (filters.workOrder && d.wo_id !== filters.workOrder) return false;
      // Item code filter
      if (filters.itemCode && !d.work_order?.item_code?.toLowerCase().includes(filters.itemCode.toLowerCase())) return false;
      return true;
    });
  }, [dispatches, filters]);

  // Calculate metrics FROM FILTERED DATA
  const metrics = useMemo<LogisticsMetrics>(() => {
    const today = new Date();
    const monthStart = startOfMonth(today);
    const todayStr = format(today, 'yyyy-MM-dd');
    
    // Packed cartons from filtered data
    const packedCartons = filteredCartons.filter(c => c.status === "packed" || (c.status !== "dispatched" && c.dispatched_qty < c.quantity));
    const packedQty = packedCartons.reduce((sum, c) => sum + (c.quantity - (c.dispatched_qty || 0)), 0);
    const packedValue = packedCartons.reduce((sum, c) => {
      const remainingQty = c.quantity - (c.dispatched_qty || 0);
      const weightPerPc = c.work_order?.net_weight_per_pc || 0;
      return sum + (remainingQty * weightPerPc);
    }, 0);

    // Dispatched today from filtered data
    const todayDispatches = filteredDispatches.filter(d => 
      format(new Date(d.dispatched_at), 'yyyy-MM-dd') === todayStr
    );
    // MTD from filtered data
    const mtdDispatches = filteredDispatches.filter(d => new Date(d.dispatched_at) >= monthStart);

    // Ageing exposure (>15 days old packed goods) from filtered data
    const ageingCartons = packedCartons.filter(c => differenceInDays(today, new Date(c.built_at)) > 15);
    const ageingValue = ageingCartons.reduce((sum, c) => {
      const remainingQty = c.quantity - (c.dispatched_qty || 0);
      const weightPerPc = c.work_order?.net_weight_per_pc || 0;
      return sum + (remainingQty * weightPerPc);
    }, 0);
    const ageingQty = ageingCartons.reduce((sum, c) => sum + (c.quantity - (c.dispatched_qty || 0)), 0);

    // Inventory by state from filtered data
    const packedTotal = filteredCartons.filter(c => c.status === "packed").reduce((sum, c) => sum + c.quantity, 0);
    const dispatchedTotal = filteredCartons.filter(c => c.status === "dispatched").reduce((sum, c) => sum + c.quantity, 0);

    return {
      packedNotDispatched: { qty: packedQty, cartons: packedCartons.length, value: packedValue },
      dispatchedToday: { qty: todayDispatches.reduce((sum, d) => sum + d.quantity, 0), cartons: todayDispatches.length },
      dispatchedMTD: { qty: mtdDispatches.reduce((sum, d) => sum + d.quantity, 0) },
      ageingExposure: { value: ageingValue, qty: ageingQty },
      inventoryByState: { packed: packedTotal, dispatched: dispatchedTotal, reserved: 0 },
    };
  }, [filteredCartons, filteredDispatches]);

  // Pipeline counts FROM FILTERED DATA
  const pipeline = useMemo<PipelineCount>(() => {
    const awaitingQC = filteredCartons.filter(c => 
      c.status === "packed" && 
      (!c.dispatch_qc_batch || !["approved", "partially_consumed", "consumed"].includes(c.dispatch_qc_batch.status))
    ).length;

    const ready = filteredCartons.filter(c => 
      c.status === "packed" && 
      c.dispatch_qc_batch && 
      ["approved", "partially_consumed", "consumed"].includes(c.dispatch_qc_batch.status) &&
      c.dispatched_qty < c.quantity
    ).length;

    const partial = filteredCartons.filter(c => 
      c.dispatched_qty > 0 && c.dispatched_qty < c.quantity
    ).length;

    const full = filteredCartons.filter(c => c.status === "dispatched" || c.dispatched_qty >= c.quantity).length;

    return {
      awaitingDispatchQC: awaitingQC,
      readyForDispatch: ready,
      partiallyDispatched: partial,
      fullyDispatched: full,
    };
  }, [filteredCartons]);

  // Ageing buckets FROM FILTERED DATA
  const ageingBuckets = useMemo<AgeingBucket[]>(() => {
    const today = new Date();
    const packedCartons = filteredCartons.filter(c => c.status === "packed" || (c.dispatched_qty < c.quantity));

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
  }, [filteredCartons]);

  // Finished goods from filtered cartons
  const finishedGoods = useMemo<FinishedGoodsItem[]>(() => {
    return filteredCartons
      .filter(c => c.status === "packed" || (c.dispatched_qty < c.quantity))
      .map(c => ({
        id: c.id,
        carton_id: c.carton_id,
        item_code: c.work_order?.item_code || "Unknown",
        customer: c.work_order?.customer || null,
        quantity: c.quantity,
        dispatched_qty: c.dispatched_qty || 0,
        built_at: c.built_at,
        net_weight: c.net_weight,
      }));
  }, [filteredCartons]);

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
    totalCartons: cartons.length,
    totalDispatches: dispatches.length,
  };
}
