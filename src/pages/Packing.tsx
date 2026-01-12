import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { 
  Box, Package, History, Eye, Trash2, CheckCircle2, AlertTriangle, 
  Layers, ClipboardList, Clock, ArrowRight, Search, Filter, 
  LayoutGrid, ChevronDown, ChevronUp, PackageCheck
} from "lucide-react";
import { PageHeader, PageContainer, FormActions } from "@/components/ui/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { HistoricalDataDialog } from "@/components/HistoricalDataDialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format, differenceInDays } from "date-fns";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface DispatchQCBatchItem {
  id: string;
  work_order_id: string;
  production_batch_id: string | null;
  qc_batch_id: string;
  qc_approved_quantity: number;
  consumed_quantity: number;
  available_for_packing: number;
  qc_date: string;
  approved_by: string | null;
  status: string;
  remarks: string | null;
  wo_number: string;
  item_code: string;
  customer: string;
  wo_quantity: number;
  batch_number: number | null;
}

interface PackingWorkOrder {
  id: string;
  wo_number: string;
  item_code: string;
  customer: string;
  wo_quantity: number;
  production_complete: boolean;
  production_complete_qty: number;
  qc_approved_qty: number;
  packed_qty: number;
  available_for_packing: number;
  remaining_qty: number;
  status: 'ready' | 'blocked';
  blocking_reason: string | null;
}

interface PackingRecord {
  id: string;
  carton_id: string;
  wo_id: string;
  production_batch_id: string | null;
  quantity: number;
  num_cartons: number | null;
  num_pallets: number | null;
  status: string;
  built_at: string;
  work_orders?: { display_id: string; item_code: string; customer: string } | null;
  production_batches?: { batch_number: number } | null;
}

const Packing = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [dispatchQCBatches, setDispatchQCBatches] = useState<DispatchQCBatchItem[]>([]);
  const [packingWorkOrders, setPackingWorkOrders] = useState<PackingWorkOrder[]>([]);
  const [packingHistory, setPackingHistory] = useState<PackingRecord[]>([]);
  const [activeTab, setActiveTab] = useState("overview");
  
  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [customerFilter, setCustomerFilter] = useState<string>("all");
  const [expandedCustomers, setExpandedCustomers] = useState<Set<string>>(new Set());
  
  // Counter stats
  const [awaitingProductionCount, setAwaitingProductionCount] = useState(0);
  const [awaitingDispatchQCCount, setAwaitingDispatchQCCount] = useState(0);
  
  // Form state
  const [selectedBatchId, setSelectedBatchId] = useState<string>("");
  const [selectedBatch, setSelectedBatch] = useState<DispatchQCBatchItem | null>(null);
  const [form, setForm] = useState({
    quantity: "",
    piecesPerCarton: "",
    numCartons: "",
    numPallets: "",
    netWeight: "",
    grossWeight: "",
  });

  // View dialog
  const [viewOpen, setViewOpen] = useState(false);
  const [viewData, setViewData] = useState<any>(null);

  useEffect(() => {
    loadDispatchQCBatches();
    loadPackingWorkOrders();
    loadPackingHistory();
    loadAwaitingCounts();

    const channel = supabase
      .channel('packing-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dispatch_qc_batches' }, () => {
        loadDispatchQCBatches();
        loadPackingWorkOrders();
        loadAwaitingCounts();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cartons' }, () => {
        loadDispatchQCBatches();
        loadPackingWorkOrders();
        loadPackingHistory();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_orders' }, () => {
        loadDispatchQCBatches();
        loadPackingWorkOrders();
        loadAwaitingCounts();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (selectedBatchId) {
      const batch = dispatchQCBatches.find(b => b.id === selectedBatchId);
      setSelectedBatch(batch || null);
    } else {
      setSelectedBatch(null);
    }
  }, [selectedBatchId, dispatchQCBatches]);

  // Group work orders by customer for better UX
  const groupedWorkOrders = useMemo(() => {
    const filtered = packingWorkOrders.filter(wo => {
      const matchesSearch = !searchTerm || 
        wo.wo_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
        wo.item_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        wo.customer.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCustomer = customerFilter === "all" || wo.customer === customerFilter;
      return matchesSearch && matchesCustomer;
    });

    const grouped = filtered.reduce((acc, wo) => {
      const key = wo.customer || "Unknown";
      if (!acc[key]) acc[key] = [];
      acc[key].push(wo);
      return acc;
    }, {} as Record<string, PackingWorkOrder[]>);

    return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b));
  }, [packingWorkOrders, searchTerm, customerFilter]);

  const uniqueCustomers = useMemo(() => {
    return [...new Set(packingWorkOrders.map(wo => wo.customer))].sort();
  }, [packingWorkOrders]);

  // Metrics
  const metrics = useMemo(() => {
    const readyWOs = packingWorkOrders.filter(wo => wo.status === 'ready');
    const totalAvailable = readyWOs.reduce((sum, wo) => sum + wo.available_for_packing, 0);
    const totalPacked = packingHistory.reduce((sum, r) => sum + r.quantity, 0);
    const todayPacked = packingHistory
      .filter(r => differenceInDays(new Date(), new Date(r.built_at)) === 0)
      .reduce((sum, r) => sum + r.quantity, 0);
    
    return { readyCount: readyWOs.length, totalAvailable, totalPacked, todayPacked };
  }, [packingWorkOrders, packingHistory]);

  const loadDispatchQCBatches = async () => {
    const { data, error } = await supabase
      .from("dispatch_qc_batches")
      .select(`
        id, work_order_id, production_batch_id, qc_batch_id,
        qc_approved_quantity, consumed_quantity, qc_date, approved_by, status, remarks,
        work_orders!inner(display_id, item_code, customer, quantity),
        production_batches(batch_number)
      `)
      .neq("status", "consumed")
      .order("qc_date", { ascending: false });

    if (error) {
      console.error("Error loading dispatch QC batches:", error);
      return;
    }

    const enriched: DispatchQCBatchItem[] = (data || [])
      .map(b => {
        const wo = b.work_orders as any;
        const prodBatch = b.production_batches as any;
        const availableForPacking = Math.max(0, b.qc_approved_quantity - b.consumed_quantity);
      
        return {
          id: b.id,
          work_order_id: b.work_order_id,
          production_batch_id: b.production_batch_id,
          qc_batch_id: b.qc_batch_id,
          qc_approved_quantity: b.qc_approved_quantity,
          consumed_quantity: b.consumed_quantity,
          available_for_packing: availableForPacking,
          qc_date: b.qc_date,
          approved_by: b.approved_by,
          status: b.status,
          remarks: b.remarks,
          wo_number: wo?.display_id || "",
          item_code: wo?.item_code || "",
          customer: wo?.customer || "",
          wo_quantity: wo?.quantity || 0,
          batch_number: prodBatch?.batch_number || null,
        };
      }).filter(b => b.available_for_packing > 0);

    setDispatchQCBatches(enriched);
  };

  const loadPackingWorkOrders = async () => {
    const { data: qcBatchData, error: qcError } = await supabase
      .from("dispatch_qc_batches")
      .select(`
        id, work_order_id, qc_approved_quantity, consumed_quantity, status,
        work_orders!inner(id, display_id, item_code, customer, quantity)
      `)
      .neq("status", "consumed");

    if (qcError) {
      console.error("Error loading dispatch QC batches for packing overview:", qcError);
      return;
    }

    const woMap = new Map<string, { wo: any; qcApproved: number; consumed: number }>();
    (qcBatchData || []).forEach(b => {
      const wo = b.work_orders as any;
      if (!wo) return;
      
      const existing = woMap.get(wo.id);
      if (existing) {
        existing.qcApproved += b.qc_approved_quantity || 0;
        existing.consumed += b.consumed_quantity || 0;
      } else {
        woMap.set(wo.id, {
          wo,
          qcApproved: b.qc_approved_quantity || 0,
          consumed: b.consumed_quantity || 0,
        });
      }
    });

    const woIds = Array.from(woMap.keys());
    if (woIds.length === 0) {
      setPackingWorkOrders([]);
      return;
    }

    const { data: cartonData } = await supabase
      .from("cartons")
      .select("wo_id, quantity")
      .in("wo_id", woIds);

    const packedQtyMap: Record<string, number> = {};
    (cartonData || []).forEach(c => {
      packedQtyMap[c.wo_id] = (packedQtyMap[c.wo_id] || 0) + c.quantity;
    });

    const workOrders: PackingWorkOrder[] = Array.from(woMap.values()).map(({ wo, qcApproved, consumed }) => {
      const packedQty = packedQtyMap[wo.id] || 0;
      const usedQty = Math.max(consumed, packedQty);
      const availableForPacking = Math.max(0, qcApproved - usedQty);
      const remainingQty = wo.quantity - packedQty;

      let status: 'ready' | 'blocked' = 'ready';
      let blockingReason: string | null = null;

      if (availableForPacking === 0) {
        status = 'blocked';
        blockingReason = 'Fully packed';
      }

      return {
        id: wo.id,
        wo_number: wo.display_id || '',
        item_code: wo.item_code || '',
        customer: wo.customer || '',
        wo_quantity: wo.quantity || 0,
        production_complete: true,
        production_complete_qty: qcApproved,
        qc_approved_qty: qcApproved,
        packed_qty: packedQty,
        available_for_packing: availableForPacking,
        remaining_qty: remainingQty,
        status,
        blocking_reason: blockingReason,
      };
    }).sort((a, b) => {
      if (a.status !== b.status) return a.status === 'ready' ? -1 : 1;
      return b.available_for_packing - a.available_for_packing;
    });

    setPackingWorkOrders(workOrders);
  };

  const loadAwaitingCounts = async () => {
    const { data: activeWOs } = await supabase
      .from("work_orders")
      .select("id, quantity")
      .in("status", ["in_progress", "pending"]);

    const activeWOIds = (activeWOs || []).map(w => w.id);
    
    if (activeWOIds.length === 0) {
      setAwaitingProductionCount(0);
      setAwaitingDispatchQCCount(0);
      return;
    }

    const { data: qcBatches } = await supabase
      .from("dispatch_qc_batches")
      .select("work_order_id, qc_approved_quantity")
      .in("work_order_id", activeWOIds);

    const qcByWO: Record<string, number> = {};
    (qcBatches || []).forEach(b => {
      qcByWO[b.work_order_id] = (qcByWO[b.work_order_id] || 0) + b.qc_approved_quantity;
    });

    const { data: prodBatches } = await supabase
      .from("production_batches")
      .select("wo_id, produced_qty, production_complete")
      .in("wo_id", activeWOIds);

    const prodByWO: Record<string, { produced: number; complete: boolean }> = {};
    (prodBatches || []).forEach(b => {
      const existing = prodByWO[b.wo_id] || { produced: 0, complete: false };
      prodByWO[b.wo_id] = {
        produced: existing.produced + (b.produced_qty || 0),
        complete: existing.complete || b.production_complete || false,
      };
    });

    let awaitingProd = 0;
    let awaitingQC = 0;

    (activeWOs || []).forEach(wo => {
      const qcApproved = qcByWO[wo.id] || 0;
      const prod = prodByWO[wo.id] || { produced: 0, complete: false };
      
      if (prod.produced === 0 && qcApproved === 0) awaitingProd++;
      else if (prod.produced > 0 && qcApproved === 0) awaitingQC++;
      else if (prod.complete && prod.produced > qcApproved) awaitingQC++;
    });

    setAwaitingProductionCount(awaitingProd);
    setAwaitingDispatchQCCount(awaitingQC);
  };

  const loadPackingHistory = async () => {
    const { data } = await supabase
      .from("cartons")
      .select(`
        id, carton_id, wo_id, production_batch_id,
        quantity, num_cartons, num_pallets, status, built_at,
        work_orders(display_id, item_code, customer),
        production_batches(batch_number)
      `)
      .order("built_at", { ascending: false })
      .limit(100);

    setPackingHistory((data as unknown as PackingRecord[]) || []);
  };

  const handleRowClick = (woId: string) => {
    const batchesForWO = dispatchQCBatches.filter(b => b.work_order_id === woId);
    if (batchesForWO.length > 0) {
      setSelectedBatchId(batchesForWO[0].id);
    }
    setActiveTab("create");
  };

  const toggleCustomerExpanded = (customer: string) => {
    setExpandedCustomers(prev => {
      const next = new Set(prev);
      if (next.has(customer)) next.delete(customer);
      else next.add(customer);
      return next;
    });
  };

  const handleCreatePackingBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBatch) return;

    const qty = parseInt(form.quantity);
    const piecesPerCarton = form.piecesPerCarton ? parseInt(form.piecesPerCarton) : null;
    const numCartons = form.numCartons ? parseInt(form.numCartons) : null;
    const numPallets = form.numPallets ? parseInt(form.numPallets) : null;
    const netWeight = form.netWeight ? parseFloat(form.netWeight) : 0;
    const grossWeight = form.grossWeight ? parseFloat(form.grossWeight) : 0;

    if (!qty || qty <= 0) {
      toast({ variant: "destructive", description: "Please enter a valid quantity" });
      return;
    }

    if (qty > selectedBatch.available_for_packing) {
      toast({ 
        variant: "destructive", 
        description: `Cannot pack ${qty} pcs. Only ${selectedBatch.available_for_packing} pcs available.` 
      });
      return;
    }

    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const batchId = `PKB-${selectedBatch.wo_number}-${selectedBatch.qc_batch_id.slice(-6)}-${Date.now().toString().slice(-6)}`;

      const { data: issues } = await supabase
        .from("wo_material_issues")
        .select("material_lots(heat_no)")
        .eq("wo_id", selectedBatch.work_order_id);

      const heatNos = (issues || [])
        .map((i: any) => i?.material_lots?.heat_no)
        .filter(Boolean);

      const { error: cartonError } = await supabase.from("cartons").insert({
        carton_id: batchId,
        wo_id: selectedBatch.work_order_id,
        dispatch_qc_batch_id: selectedBatch.id,
        production_batch_id: selectedBatch.production_batch_id,
        quantity: qty,
        pieces_per_carton: piecesPerCarton,
        num_cartons: numCartons,
        num_pallets: numPallets,
        net_weight: netWeight,
        gross_weight: grossWeight,
        heat_nos: heatNos.length > 0 ? heatNos : [],
        status: "ready_for_dispatch",
        built_by: user?.id,
      });

      if (cartonError) throw cartonError;

      const newConsumedQty = selectedBatch.consumed_quantity + qty;
      const newStatus = newConsumedQty >= selectedBatch.qc_approved_quantity ? "consumed" : "active";
      
      const { error: updateError } = await supabase
        .from("dispatch_qc_batches")
        .update({ consumed_quantity: newConsumedQty, status: newStatus })
        .eq("id", selectedBatch.id);

      if (updateError) throw updateError;

      toast({
        title: "Packing Complete",
        description: `${batchId} created with ${qty} pcs.`,
      });

      setForm({ quantity: "", piecesPerCarton: "", numCartons: "", numPallets: "", netWeight: "", grossWeight: "" });
      setSelectedBatchId("");
      loadDispatchQCBatches();
      loadPackingWorkOrders();
      loadPackingHistory();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Failed to create packing batch", description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, cartonId: string) => {
    if (!confirm(`Delete packing record ${cartonId}?`)) return;

    try {
      const { error } = await supabase.from("cartons").delete().eq("id", id);
      if (error) throw error;
      toast({ description: `${cartonId} deleted` });
      loadDispatchQCBatches();
      loadPackingWorkOrders();
      loadPackingHistory();
    } catch (error: any) {
      toast({ variant: "destructive", description: error.message });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "ready_for_dispatch":
        return <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30">Ready</Badge>;
      case "dispatched":
        return <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30">Dispatched</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <PageContainer maxWidth="2xl">
        <div className="space-y-6">
          <PageHeader
            title="Packing Station"
            description="Pack QC-approved quantities for dispatch"
            icon={<PackageCheck className="h-6 w-6" />}
          />

          {/* KPI Banner */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="bg-gradient-to-br from-green-50 to-green-100/50 dark:from-green-950/30 dark:to-green-900/20 border-green-200 dark:border-green-800">
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-green-600 dark:text-green-400 uppercase tracking-wide">Ready to Pack</p>
                    <p className="text-2xl font-bold text-green-700 dark:text-green-300">{metrics.readyCount}</p>
                  </div>
                  <CheckCircle2 className="h-8 w-8 text-green-500/40" />
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-950/30 dark:to-blue-900/20 border-blue-200 dark:border-blue-800">
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wide">Available Qty</p>
                    <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">{metrics.totalAvailable.toLocaleString()}</p>
                  </div>
                  <Package className="h-8 w-8 text-blue-500/40" />
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-gradient-to-br from-amber-50 to-amber-100/50 dark:from-amber-950/30 dark:to-amber-900/20 border-amber-200 dark:border-amber-800">
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-amber-600 dark:text-amber-400 uppercase tracking-wide">Awaiting QC</p>
                    <p className="text-2xl font-bold text-amber-700 dark:text-amber-300">{awaitingDispatchQCCount}</p>
                  </div>
                  <Clock className="h-8 w-8 text-amber-500/40" />
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-gradient-to-br from-purple-50 to-purple-100/50 dark:from-purple-950/30 dark:to-purple-900/20 border-purple-200 dark:border-purple-800">
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-purple-600 dark:text-purple-400 uppercase tracking-wide">Packed Today</p>
                    <p className="text-2xl font-bold text-purple-700 dark:text-purple-300">{metrics.todayPacked.toLocaleString()}</p>
                  </div>
                  <LayoutGrid className="h-8 w-8 text-purple-500/40" />
                </div>
              </CardContent>
            </Card>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-3 h-12">
              <TabsTrigger value="overview" className="gap-2">
                <ClipboardList className="h-4 w-4" />
                Ready for Packing
              </TabsTrigger>
              <TabsTrigger value="create" className="gap-2">
                <Package className="h-4 w-4" />
                Create Batch
              </TabsTrigger>
              <TabsTrigger value="history" className="gap-2">
                <History className="h-4 w-4" />
                History
              </TabsTrigger>
            </TabsList>

            {/* OVERVIEW TAB - Ready for Packing */}
            <TabsContent value="overview" className="space-y-4 mt-4">
              {/* Filters */}
              <div className="flex flex-wrap gap-3">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search WO, item, customer..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Select value={customerFilter} onValueChange={setCustomerFilter}>
                  <SelectTrigger className="w-[180px]">
                    <Filter className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Customer" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Customers</SelectItem>
                    {uniqueCustomers.map(c => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Grouped by Customer */}
              <ScrollArea className="h-[calc(100vh-380px)]">
                <div className="space-y-3">
                  {groupedWorkOrders.length === 0 ? (
                    <Card>
                      <CardContent className="py-12 text-center">
                        <Package className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                        <p className="text-muted-foreground">No work orders ready for packing</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          Work orders need Dispatch QC approval first
                        </p>
                      </CardContent>
                    </Card>
                  ) : (
                    groupedWorkOrders.map(([customer, wos]) => {
                      const isExpanded = expandedCustomers.has(customer);
                      const readyCount = wos.filter(wo => wo.status === 'ready').length;
                      const totalAvailable = wos.reduce((sum, wo) => sum + wo.available_for_packing, 0);

                      return (
                        <Collapsible key={customer} open={isExpanded} onOpenChange={() => toggleCustomerExpanded(customer)}>
                          <Card>
                            <CollapsibleTrigger className="w-full">
                              <CardHeader className="py-3 px-4">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                    <CardTitle className="text-base font-semibold">{customer}</CardTitle>
                                    <Badge variant="outline" className="font-mono">
                                      {wos.length} WO{wos.length > 1 ? 's' : ''}
                                    </Badge>
                                  </div>
                                  <div className="flex items-center gap-4 text-sm">
                                    {readyCount > 0 && (
                                      <span className="text-green-600 font-medium">{readyCount} ready</span>
                                    )}
                                    <span className="text-muted-foreground">
                                      {totalAvailable.toLocaleString()} pcs available
                                    </span>
                                  </div>
                                </div>
                              </CardHeader>
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                              <CardContent className="pt-0 pb-4">
                                <Table>
                                  <TableHeader>
                                    <TableRow className="hover:bg-transparent">
                                      <TableHead className="w-[140px]">Work Order</TableHead>
                                      <TableHead>Item Code</TableHead>
                                      <TableHead className="text-right">Ordered</TableHead>
                                      <TableHead className="text-right">QC Approved</TableHead>
                                      <TableHead className="text-right">Packed</TableHead>
                                      <TableHead className="text-right">Available</TableHead>
                                      <TableHead className="w-[100px]">Status</TableHead>
                                      <TableHead className="w-[60px]"></TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {wos.map(wo => (
                                      <TableRow 
                                        key={wo.id} 
                                        className={wo.status === 'ready' ? 'cursor-pointer hover:bg-muted/50' : 'opacity-60'}
                                        onClick={() => wo.status === 'ready' && handleRowClick(wo.id)}
                                      >
                                        <TableCell className="font-mono text-sm font-medium">{wo.wo_number}</TableCell>
                                        <TableCell className="text-sm">{wo.item_code}</TableCell>
                                        <TableCell className="text-right text-muted-foreground">{wo.wo_quantity.toLocaleString()}</TableCell>
                                        <TableCell className="text-right text-green-600 font-medium">
                                          {wo.qc_approved_qty.toLocaleString()}
                                        </TableCell>
                                        <TableCell className="text-right text-muted-foreground">
                                          {wo.packed_qty > 0 ? wo.packed_qty.toLocaleString() : '—'}
                                        </TableCell>
                                        <TableCell className="text-right font-semibold text-primary">
                                          {wo.available_for_packing > 0 ? wo.available_for_packing.toLocaleString() : '—'}
                                        </TableCell>
                                        <TableCell>
                                          {wo.status === 'ready' ? (
                                            <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 gap-1">
                                              <CheckCircle2 className="h-3 w-3" />
                                              Ready
                                            </Badge>
                                          ) : (
                                            <Badge variant="secondary" className="text-xs">
                                              {wo.blocking_reason}
                                            </Badge>
                                          )}
                                        </TableCell>
                                        <TableCell>
                                          {wo.status === 'ready' && (
                                            <Button variant="ghost" size="icon" className="h-7 w-7">
                                              <ArrowRight className="h-4 w-4" />
                                            </Button>
                                          )}
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </CardContent>
                            </CollapsibleContent>
                          </Card>
                        </Collapsible>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            {/* CREATE TAB */}
            <TabsContent value="create" className="space-y-4 mt-4">
              {dispatchQCBatches.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <AlertTriangle className="h-12 w-12 mx-auto text-amber-500 mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No Batches Ready for Packing</h3>
                    <p className="text-muted-foreground max-w-md mx-auto">
                      Batches need Dispatch QC approval with available quantity before packing.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-6 lg:grid-cols-2">
                  {/* Batch Selection & Form */}
                  <Card>
                    <CardHeader className="pb-4">
                      <CardTitle className="flex items-center gap-2">
                        <Layers className="h-5 w-5" />
                        Select & Pack
                      </CardTitle>
                      <CardDescription>Choose a Dispatch QC batch and enter packing details</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <Select value={selectedBatchId} onValueChange={setSelectedBatchId}>
                        <SelectTrigger className="h-12">
                          <SelectValue placeholder="Select a batch to pack..." />
                        </SelectTrigger>
                        <SelectContent>
                          {dispatchQCBatches.map(batch => (
                            <SelectItem key={batch.id} value={batch.id}>
                              <div className="flex items-center gap-3">
                                <span className="font-mono font-medium">{batch.wo_number}</span>
                                <span className="text-muted-foreground">|</span>
                                <span className="text-sm">{batch.item_code}</span>
                                <Badge variant="outline" className="ml-auto">
                                  {batch.available_for_packing} pcs
                                </Badge>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {selectedBatch && (
                        <form onSubmit={handleCreatePackingBatch} className="space-y-4 pt-4 border-t">
                          <div className="grid grid-cols-3 gap-3 p-3 rounded-lg bg-muted/50 text-center">
                            <div>
                              <p className="text-xs text-muted-foreground">QC Approved</p>
                              <p className="text-lg font-bold">{selectedBatch.qc_approved_quantity}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Packed</p>
                              <p className="text-lg font-bold text-blue-600">{selectedBatch.consumed_quantity}</p>
                            </div>
                            <div className="bg-green-100 dark:bg-green-900/30 rounded-md py-1">
                              <p className="text-xs text-green-600">Available</p>
                              <p className="text-lg font-bold text-green-600">{selectedBatch.available_for_packing}</p>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <Label>Quantity to Pack *</Label>
                            <Input
                              type="number"
                              min="1"
                              max={selectedBatch.available_for_packing}
                              value={form.quantity}
                              onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                              placeholder={`Max: ${selectedBatch.available_for_packing}`}
                              className="h-12 text-lg"
                              required
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-2">
                              <Label>Pcs/Carton</Label>
                              <Input
                                type="number"
                                min="1"
                                value={form.piecesPerCarton}
                                onChange={(e) => setForm({ ...form, piecesPerCarton: e.target.value })}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label># Cartons</Label>
                              <Input
                                type="number"
                                min="1"
                                value={form.numCartons}
                                onChange={(e) => setForm({ ...form, numCartons: e.target.value })}
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-3 gap-3">
                            <div className="space-y-2">
                              <Label>Net Wt (kg)</Label>
                              <Input
                                type="number"
                                step="0.01"
                                value={form.netWeight}
                                onChange={(e) => setForm({ ...form, netWeight: e.target.value })}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Gross Wt (kg)</Label>
                              <Input
                                type="number"
                                step="0.01"
                                value={form.grossWeight}
                                onChange={(e) => setForm({ ...form, grossWeight: e.target.value })}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Pallets</Label>
                              <Input
                                type="number"
                                min="0"
                                value={form.numPallets}
                                onChange={(e) => setForm({ ...form, numPallets: e.target.value })}
                              />
                            </div>
                          </div>

                          <Button type="submit" disabled={loading} className="w-full h-12 text-base gap-2">
                            <CheckCircle2 className="h-5 w-5" />
                            Complete Packing
                          </Button>
                        </form>
                      )}
                    </CardContent>
                  </Card>

                  {/* Context Panel */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Batch Details</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {selectedBatch ? (
                        <div className="space-y-6">
                          <div className="grid grid-cols-2 gap-4">
                            <div className="p-3 rounded-lg bg-muted/50">
                              <p className="text-xs text-muted-foreground uppercase">Work Order</p>
                              <p className="font-mono font-semibold">{selectedBatch.wo_number}</p>
                            </div>
                            <div className="p-3 rounded-lg bg-muted/50">
                              <p className="text-xs text-muted-foreground uppercase">QC Batch</p>
                              <p className="font-mono text-sm">{selectedBatch.qc_batch_id}</p>
                            </div>
                            <div className="p-3 rounded-lg bg-muted/50">
                              <p className="text-xs text-muted-foreground uppercase">Item Code</p>
                              <p className="font-semibold">{selectedBatch.item_code}</p>
                            </div>
                            <div className="p-3 rounded-lg bg-muted/50">
                              <p className="text-xs text-muted-foreground uppercase">Customer</p>
                              <p className="font-semibold">{selectedBatch.customer}</p>
                            </div>
                          </div>

                          <div className="p-4 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800">
                            <div className="flex items-center gap-2 text-green-700 dark:text-green-400 mb-2">
                              <CheckCircle2 className="h-4 w-4" />
                              <span className="text-sm font-medium">Dispatch QC Approved</span>
                            </div>
                            <p className="text-xs text-green-600 dark:text-green-500">
                              Approved on {format(new Date(selectedBatch.qc_date), "MMM dd, yyyy 'at' HH:mm")}
                            </p>
                          </div>

                          {selectedBatch.remarks && (
                            <div className="p-3 rounded-lg bg-muted/50">
                              <p className="text-xs text-muted-foreground uppercase mb-1">QC Remarks</p>
                              <p className="text-sm">{selectedBatch.remarks}</p>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                          <Package className="h-12 w-12 mb-4 opacity-50" />
                          <p>Select a batch to view details</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              )}
            </TabsContent>

            {/* HISTORY TAB */}
            <TabsContent value="history" className="space-y-4 mt-4">
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle>Packing History</CardTitle>
                    <Badge variant="outline">{packingHistory.length} records</Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <ScrollArea className="h-[calc(100vh-340px)]">
                    {packingHistory.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                        <History className="h-12 w-12 mb-4 opacity-50" />
                        <p>No packing history yet</p>
                      </div>
                    ) : (
                      <Table>
                        <TableHeader className="sticky top-0 bg-card z-10">
                          <TableRow>
                            <TableHead>Packing ID</TableHead>
                            <TableHead>Work Order</TableHead>
                            <TableHead>Item</TableHead>
                            <TableHead>Customer</TableHead>
                            <TableHead className="text-right">Qty</TableHead>
                            <TableHead className="text-center">Cartons</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Packed</TableHead>
                            <TableHead className="w-[80px]"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {packingHistory.map(record => (
                            <TableRow key={record.id}>
                              <TableCell className="font-mono text-xs">{record.carton_id}</TableCell>
                              <TableCell className="font-mono text-sm">{record.work_orders?.display_id || "—"}</TableCell>
                              <TableCell className="text-sm">{record.work_orders?.item_code || "—"}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {(record.work_orders as any)?.customer || "—"}
                              </TableCell>
                              <TableCell className="text-right font-semibold">{record.quantity.toLocaleString()}</TableCell>
                              <TableCell className="text-center">{record.num_cartons || "—"}</TableCell>
                              <TableCell>{getStatusBadge(record.status)}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {format(new Date(record.built_at), "MMM dd, HH:mm")}
                              </TableCell>
                              <TableCell>
                                <div className="flex justify-end gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => { setViewData(record); setViewOpen(true); }}
                                  >
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                  {record.status !== "dispatched" && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 text-destructive hover:text-destructive"
                                      onClick={() => handleDelete(record.id, record.carton_id)}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </ScrollArea>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        <HistoricalDataDialog
          open={viewOpen}
          onOpenChange={setViewOpen}
          type="carton"
          data={viewData}
        />
      </PageContainer>
    </div>
  );
};

export default Packing;
