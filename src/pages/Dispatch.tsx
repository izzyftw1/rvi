import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Truck, Package, Send, CheckCircle2, History, AlertTriangle, Info, Layers, FileCheck, FileDown, ExternalLink, Search, Filter, X, ChevronDown, ChevronUp, Users, Box, Calendar, Building2 } from "lucide-react";
import { PageHeader, PageContainer } from "@/components/ui/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Link } from "react-router-dom";
import { downloadCommercialInvoice, CommercialInvoiceData } from "@/lib/commercialInvoiceGenerator";
import { downloadPackingList, PackingListData, PackingListLineItem } from "@/lib/packingListGenerator";
import { ExportDocumentDialog, ExportDocumentFields } from "@/components/dispatch/ExportDocumentDialog";

/**
 * CANONICAL DISPATCH WORKFLOW
 * 
 * Dispatch operates ONLY on PACKED goods (cartons).
 * QC status is derived from dispatch_qc_batches (SSOT).
 * All quantities derive from: dispatches table.
 */

// Carton with dispatch QC info from dispatch_qc_batches (SSOT)
interface PackingBatch {
  id: string;
  carton_id: string;
  wo_id: string;
  production_batch_id: string | null;
  dispatch_qc_batch_id: string | null;
  quantity: number;
  dispatched_qty: number;
  available_qty: number;
  num_cartons: number | null;
  num_pallets: number | null;
  status: string;
  built_at: string;
  work_orders?: { 
    display_id: string; 
    item_code: string; 
    customer: string;
  } | null;
  production_batches?: {
    batch_number: number;
  } | null;
  dispatch_qc_batches?: {
    status: string;
    qc_approved_quantity: number;
    qc_date: string;
  } | null;
}

// Grouped by customer for better UX
interface CustomerGroup {
  customer: string;
  batches: PackingBatch[];
  totalQty: number;
  totalCartons: number;
}

interface Shipment {
  id: string;
  ship_id: string;
  customer: string | null;
  status: string;
  created_at: string;
  dispatches: {
    id: string;
    quantity: number;
    remarks: string | null;
    carton_id: string | null;
    cartons?: { carton_id: string; quantity?: number } | null;
    work_orders?: { display_id: string } | null;
  }[];
}

export default function Dispatch() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<any>(null);
  
  // Ready for dispatch packing batches
  const [readyBatches, setReadyBatches] = useState<PackingBatch[]>([]);
  const [selectedBatchIds, setSelectedBatchIds] = useState<Set<string>>(new Set());
  const [dispatchQuantities, setDispatchQuantities] = useState<Record<string, number>>({});
  
  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCustomer, setFilterCustomer] = useState<string>("all");
  const [filterItem, setFilterItem] = useState<string>("all");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  
  // Shipment form
  const [shipmentId, setShipmentId] = useState("");
  const [remarks, setRemarks] = useState("");
  
  // Recent shipments
  const [recentShipments, setRecentShipments] = useState<Shipment[]>([]);
  
  // Export document dialog state
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportDocType, setExportDocType] = useState<'invoice' | 'packing-list'>('invoice');
  const [pendingShipment, setPendingShipment] = useState<Shipment | null>(null);
  const [pendingExportData, setPendingExportData] = useState<{
    dispatchNotes: any[];
    customer: any;
    currency: string;
    // Auto-populated packing details from cartons
    totalCartons: number;
    totalGrossWeight: number;
    totalNetWeight: number;
  } | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUser(user));
    loadReadyBatches();
    loadRecentShipments();

    const channel = supabase
      .channel('dispatch-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cartons' }, () => {
        loadReadyBatches();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dispatches' }, () => {
        loadReadyBatches();
        loadRecentShipments();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shipments' }, () => {
        loadRecentShipments();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadReadyBatches = async () => {
    // Get all cartons ready for dispatch WITH dispatch_qc_batches join (SSOT for QC status)
    const { data: cartonData } = await supabase
      .from("cartons")
      .select(`
        id, carton_id, wo_id, production_batch_id, dispatch_qc_batch_id, quantity,
        num_cartons, num_pallets, status, built_at,
        work_orders(display_id, item_code, customer),
        production_batches:production_batch_id(batch_number),
        dispatch_qc_batches:dispatch_qc_batch_id(status, qc_approved_quantity, qc_date)
      `)
      .eq("status", "ready_for_dispatch")
      .order("built_at", { ascending: true });

    const cartons = (cartonData || []) as any[];
    
    // Get already dispatched quantities from dispatches table
    const cartonIds = cartons.map(c => c.id);
    let dispatchedByCarton: Record<string, number> = {};
    
    if (cartonIds.length > 0) {
      const { data: dispatchData } = await supabase
        .from("dispatches")
        .select("carton_id, quantity")
        .in("carton_id", cartonIds);
      
      (dispatchData || []).forEach(d => {
        if (d.carton_id) {
          dispatchedByCarton[d.carton_id] = (dispatchedByCarton[d.carton_id] || 0) + d.quantity;
        }
      });
    }

    // Calculate available quantity per carton
    const baseBatches: PackingBatch[] = cartons.map(batch => {
      const alreadyDispatched = dispatchedByCarton[batch.id] || 0;
      return {
        ...batch,
        dispatched_qty: alreadyDispatched,
        available_qty: Math.max(0, batch.quantity - alreadyDispatched),
      };
    }).filter(b => b.available_qty > 0);

    setReadyBatches(baseBatches);
    
    // Auto-expand all groups initially
    const customers = [...new Set(baseBatches.map(b => b.work_orders?.customer || "Unknown"))];
    setExpandedGroups(new Set(customers));
  };

  const loadRecentShipments = async () => {
    const { data } = await supabase
      .from("shipments")
      .select(`
        id, ship_id, customer, status, created_at,
        dispatches(id, quantity, remarks, carton_id, cartons(carton_id, quantity), work_orders(display_id))
      `)
      .order("created_at", { ascending: false })
      .limit(20);

    setRecentShipments((data as unknown as Shipment[]) || []);
  };

  // Get unique values for filters
  const uniqueCustomers = useMemo(() => 
    [...new Set(readyBatches.map(b => b.work_orders?.customer).filter(Boolean))] as string[]
  , [readyBatches]);

  const uniqueItems = useMemo(() => 
    [...new Set(readyBatches.map(b => b.work_orders?.item_code).filter(Boolean))] as string[]
  , [readyBatches]);

  // Filtered and grouped batches
  const filteredBatches = useMemo(() => {
    return readyBatches.filter(batch => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matches = 
          batch.carton_id.toLowerCase().includes(query) ||
          batch.work_orders?.display_id?.toLowerCase().includes(query) ||
          batch.work_orders?.item_code?.toLowerCase().includes(query) ||
          batch.work_orders?.customer?.toLowerCase().includes(query);
        if (!matches) return false;
      }
      
      // Customer filter
      if (filterCustomer !== "all" && batch.work_orders?.customer !== filterCustomer) {
        return false;
      }
      
      // Item filter
      if (filterItem !== "all" && batch.work_orders?.item_code !== filterItem) {
        return false;
      }
      
      return true;
    });
  }, [readyBatches, searchQuery, filterCustomer, filterItem]);

  // Group by customer
  const customerGroups = useMemo((): CustomerGroup[] => {
    const groups: Record<string, PackingBatch[]> = {};
    
    filteredBatches.forEach(batch => {
      const customer = batch.work_orders?.customer || "Unknown";
      if (!groups[customer]) groups[customer] = [];
      groups[customer].push(batch);
    });

    return Object.entries(groups).map(([customer, batches]) => ({
      customer,
      batches,
      totalQty: batches.reduce((sum, b) => sum + b.available_qty, 0),
      totalCartons: batches.reduce((sum, b) => sum + (b.num_cartons || 0), 0),
    })).sort((a, b) => b.totalQty - a.totalQty);
  }, [filteredBatches]);

  // === Batch Handlers ===
  const handleToggleBatch = (batchId: string) => {
    const newSelected = new Set(selectedBatchIds);
    if (newSelected.has(batchId)) {
      newSelected.delete(batchId);
      const newQtys = { ...dispatchQuantities };
      delete newQtys[batchId];
      setDispatchQuantities(newQtys);
    } else {
      newSelected.add(batchId);
      const batch = readyBatches.find(b => b.id === batchId);
      if (batch) {
        setDispatchQuantities({ ...dispatchQuantities, [batchId]: batch.available_qty });
      }
    }
    setSelectedBatchIds(newSelected);
  };

  const handleSelectAllInGroup = (customer: string) => {
    const group = customerGroups.find(g => g.customer === customer);
    if (!group) return;
    
    const groupBatchIds = group.batches.map(b => b.id);
    const allSelected = groupBatchIds.every(id => selectedBatchIds.has(id));
    
    const newSelected = new Set(selectedBatchIds);
    const newQtys = { ...dispatchQuantities };
    
    if (allSelected) {
      // Deselect all in group
      groupBatchIds.forEach(id => {
        newSelected.delete(id);
        delete newQtys[id];
      });
    } else {
      // Select all in group
      groupBatchIds.forEach(id => {
        newSelected.add(id);
        const batch = group.batches.find(b => b.id === id);
        if (batch) newQtys[id] = batch.available_qty;
      });
    }
    
    setSelectedBatchIds(newSelected);
    setDispatchQuantities(newQtys);
  };

  const handleSelectAll = () => {
    if (selectedBatchIds.size === filteredBatches.length) {
      setSelectedBatchIds(new Set());
      setDispatchQuantities({});
    } else {
      const allIds = new Set(filteredBatches.map(b => b.id));
      const allQtys: Record<string, number> = {};
      filteredBatches.forEach(b => { allQtys[b.id] = b.available_qty; });
      setSelectedBatchIds(allIds);
      setDispatchQuantities(allQtys);
    }
  };

  const handleBatchQtyChange = (batchId: string, qty: number, maxQty: number) => {
    const validQty = Math.max(1, Math.min(qty, maxQty));
    setDispatchQuantities({ ...dispatchQuantities, [batchId]: validQty });
  };

  const getDispatchQty = (batch: PackingBatch) => {
    return dispatchQuantities[batch.id] || batch.available_qty;
  };

  const toggleGroup = (customer: string) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(customer)) {
      newExpanded.delete(customer);
    } else {
      newExpanded.add(customer);
    }
    setExpandedGroups(newExpanded);
  };

  const clearFilters = () => {
    setSearchQuery("");
    setFilterCustomer("all");
    setFilterItem("all");
  };

  // QC Status badge from dispatch_qc_batches (SSOT)
  const getQCStatusBadge = (batch: PackingBatch) => {
    const dqb = batch.dispatch_qc_batches;
    
    // If linked to dispatch_qc_batches, use that status
    if (dqb) {
      const status = dqb.status;
      // approved, partially_consumed, consumed are all valid QC-passed states
      if (status === 'approved' || status === 'partially_consumed' || status === 'consumed') {
        return (
          <Badge className="bg-green-500/10 text-green-600 border-green-500/20 gap-1">
            <FileCheck className="h-3 w-3" />
            Approved
          </Badge>
        );
      }
    }
    
    // If carton exists with ready_for_dispatch status, it has passed QC by definition
    // (packing only creates cartons from approved dispatch_qc_batches)
    if (batch.dispatch_qc_batch_id) {
      return (
        <Badge className="bg-green-500/10 text-green-600 border-green-500/20 gap-1">
          <FileCheck className="h-3 w-3" />
          Approved
        </Badge>
      );
    }
    
    // Legacy cartons without dispatch_qc_batch_id - treat as approved if packed
    return (
      <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20 gap-1">
        <AlertTriangle className="h-3 w-3" />
        Legacy
      </Badge>
    );
  };

  // === Summary Calculation ===
  const getSelectedSummary = () => {
    const selected = readyBatches.filter(b => selectedBatchIds.has(b.id));
    return {
      count: selected.length,
      totalQty: selected.reduce((sum, b) => sum + getDispatchQty(b), 0),
      totalCartons: selected.reduce((sum, b) => sum + (b.num_cartons || 0), 0),
      totalPallets: selected.reduce((sum, b) => sum + (b.num_pallets || 0), 0),
      hasPartial: selected.some(b => getDispatchQty(b) < b.available_qty),
      customers: [...new Set(selected.map(b => b.work_orders?.customer).filter(Boolean))],
    };
  };

  const handleCreateShipment = async () => {
    const summary = getSelectedSummary();
    
    if (summary.count === 0) {
      toast({ variant: "destructive", description: "Please select at least one packing batch" });
      return;
    }

    const selectedBatches = readyBatches.filter(b => selectedBatchIds.has(b.id));
    const generatedShipId = shipmentId.trim() || `SHIP-${Date.now().toString().slice(-8)}`;
    const primaryCustomer = selectedBatches[0]?.work_orders?.customer || "Unknown";

    setLoading(true);
    try {
      // 1. Create shipment
      const { data: shipmentData, error: shipmentError } = await supabase
        .from("shipments")
        .insert({
          ship_id: generatedShipId,
          customer: primaryCustomer,
          status: "dispatched",
        })
        .select()
        .single();

      if (shipmentError) throw shipmentError;

      // 2. Get production batch for FK requirement
      const woIds = [...new Set(selectedBatches.map(b => b.wo_id))];
      const { data: prodBatches } = await supabase
        .from("production_batches")
        .select("id, wo_id")
        .in("wo_id", woIds);
      
      const batchMap = new Map<string, string>();
      (prodBatches || []).forEach(pb => batchMap.set(pb.wo_id, pb.id));

      // 3. Create dispatch records
      for (const batch of selectedBatches) {
        const dispatchQty = getDispatchQty(batch);
        const isPartial = dispatchQty < batch.available_qty;
        const batchId = batch.production_batch_id || batchMap.get(batch.wo_id) || batch.wo_id;
        
        const { data: dispatchData, error: dispatchError } = await supabase
          .from("dispatches")
          .insert({
            wo_id: batch.wo_id,
            batch_id: batchId,
            carton_id: batch.id,
            quantity: dispatchQty,
            shipment_id: shipmentData.id,
            dispatched_by: user?.id,
            remarks: isPartial 
              ? `Partial dispatch: ${dispatchQty}/${batch.available_qty}${remarks ? ` | ${remarks}` : ""}`
              : remarks || null,
          })
          .select()
          .single();

        if (dispatchError) throw dispatchError;

        // Create dispatch note
        const { data: woData } = await supabase
          .from("work_orders")
          .select("item_code, so_id, quantity, gross_weight_per_pc, net_weight_per_pc, financial_snapshot, customer")
          .eq("id", batch.wo_id)
          .single();

        const financialSnapshot = woData?.financial_snapshot as any;
        const unitRate = financialSnapshot?.line_item?.price_per_pc || 0;
        const currency = financialSnapshot?.currency || "USD";

        const { data: existingNotes } = await supabase
          .from("dispatch_notes")
          .select("dispatch_note_no")
          .order("created_at", { ascending: false })
          .limit(1);

        let noteNo = "DN-0001";
        if (existingNotes && existingNotes.length > 0) {
          const lastNo = existingNotes[0].dispatch_note_no;
          const numMatch = lastNo.match(/DN-(\d+)/);
          if (numMatch) {
            const lastNum = parseInt(numMatch[1]);
            noteNo = `DN-${String(lastNum + 1).padStart(4, "0")}`;
          }
        }

        await supabase.from("dispatch_notes").insert({
          dispatch_note_no: noteNo,
          work_order_id: batch.wo_id,
          sales_order_id: woData?.so_id,
          carton_id: batch.id,
          shipment_id: shipmentData.id,
          dispatch_id: dispatchData.id,
          item_code: woData?.item_code || batch.work_orders?.item_code || "N/A",
          item_description: `${woData?.item_code || batch.work_orders?.item_code} - ${batch.work_orders?.customer || woData?.customer}`,
          packed_qty: batch.quantity,
          dispatched_qty: dispatchQty,
          rejected_qty: 0,
          unit_rate: unitRate,
          currency: currency,
          gross_weight_kg: woData?.gross_weight_per_pc ? (dispatchQty * woData.gross_weight_per_pc / 1000) : null,
          net_weight_kg: woData?.net_weight_per_pc ? (dispatchQty * woData.net_weight_per_pc / 1000) : null,
          created_by: user?.id,
          remarks: isPartial ? `Partial dispatch: ${dispatchQty}/${batch.available_qty}` : null,
        });
      }

      toast({
        title: "Dispatch Created",
        description: `${generatedShipId} with ${selectedBatchIds.size} batch(es), ${summary.totalQty} pcs dispatched.`,
      });

      // Reset form
      setSelectedBatchIds(new Set());
      setDispatchQuantities({});
      setShipmentId("");
      setRemarks("");
      loadReadyBatches();
      loadRecentShipments();
    } catch (error: any) {
      toast({ variant: "destructive", description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const summary = getSelectedSummary();

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "dispatched":
        return <Badge className="bg-green-500/10 text-green-600 border-green-500/20">Dispatched</Badge>;
      case "in_transit":
        return <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/20">In Transit</Badge>;
      case "delivered":
        return <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">Delivered</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  // Download functions - now show dialog to collect missing export fields
  const handleDownloadInvoice = async (shipment: Shipment) => {
    try {
      // Try to get dispatch notes first
      const { data: dispatchNotes } = await supabase
        .from("dispatch_notes")
        .select(`*, 
          work_orders(so_id, financial_snapshot, customer, po_number, po_date),
          sales_orders:sales_order_id(customer_id, customer_master(customer_name, address_line_1, city, state, pincode, country, primary_contact_name, primary_contact_email, gst_number))
        `)
        .eq("shipment_id", shipment.id);

      // If no dispatch notes, build data from dispatches + cartons
      if (!dispatchNotes || dispatchNotes.length === 0) {
        // Fallback: Get data directly from dispatches and cartons
        const { data: dispatches } = await supabase
          .from("dispatches")
          .select(`
            id, quantity, wo_id, carton_id,
            cartons(num_cartons, gross_weight, net_weight, quantity),
            work_orders(display_id, item_code, customer, so_id, financial_snapshot, po_number, po_date)
          `)
          .eq("shipment_id", shipment.id);

        if (!dispatches || dispatches.length === 0) {
          toast({ variant: "destructive", description: "No dispatch data found for this shipment" });
          return;
        }

        // Get customer info from SO
        const firstDispatch = dispatches[0] as any;
        const soId = firstDispatch.work_orders?.so_id;
        let customer = null;
        
        if (soId) {
          const { data: soData } = await supabase
            .from("sales_orders")
            .select("customer_master(customer_name, address_line_1, city, state, pincode, country, primary_contact_name, primary_contact_email, gst_number)")
            .eq("id", soId)
            .single();
          customer = (soData as any)?.customer_master;
        }

        const financialSnapshot = firstDispatch.work_orders?.financial_snapshot;
        const currency = financialSnapshot?.currency || "USD";

        // Calculate totals from cartons
        const totalCartons = dispatches.reduce((sum, d: any) => sum + (d.cartons?.num_cartons || 1), 0);
        const totalGrossWeight = dispatches.reduce((sum, d: any) => sum + (d.cartons?.gross_weight || 0), 0);
        const totalNetWeight = dispatches.reduce((sum, d: any) => sum + (d.cartons?.net_weight || 0), 0);

        // Build synthetic dispatch notes from dispatches
        const syntheticNotes = dispatches.map((d: any) => ({
          item_code: d.work_orders?.item_code || 'N/A',
          item_description: d.work_orders?.item_code || 'N/A',
          dispatched_qty: d.quantity,
          unit_rate: financialSnapshot?.line_item?.price_per_pc || 0,
          currency: currency,
          gross_weight_kg: (d.cartons?.gross_weight || 0) * (d.quantity / (d.cartons?.quantity || d.quantity)),
          net_weight_kg: (d.cartons?.net_weight || 0) * (d.quantity / (d.cartons?.quantity || d.quantity)),
          work_orders: d.work_orders,
        }));

        setPendingShipment(shipment);
        setPendingExportData({ 
          dispatchNotes: syntheticNotes, 
          customer: customer || { customer_name: shipment.customer }, 
          currency,
          totalCartons,
          totalGrossWeight,
          totalNetWeight,
        });
        setExportDocType('invoice');
        setExportDialogOpen(true);
        return;
      }

      // Get customer details and currency from first dispatch note
      const firstNote = dispatchNotes[0];
      const financialSnapshot = (firstNote.work_orders as any)?.financial_snapshot;
      const currency = firstNote.currency || financialSnapshot?.currency || "USD";
      const customer = (firstNote.sales_orders as any)?.customer_master;

      // Get carton data for auto-populating packing details
      const cartonIds = dispatchNotes.map(dn => dn.carton_id).filter(Boolean);
      let totalCartons = dispatchNotes.length;
      let totalGrossWeight = dispatchNotes.reduce((sum, dn) => sum + (dn.gross_weight_kg || 0), 0);
      let totalNetWeight = dispatchNotes.reduce((sum, dn) => sum + (dn.net_weight_kg || 0), 0);

      if (cartonIds.length > 0) {
        const { data: cartons } = await supabase
          .from("cartons")
          .select("id, num_cartons, gross_weight, net_weight")
          .in("id", cartonIds);
        
        if (cartons && cartons.length > 0) {
          totalCartons = cartons.reduce((sum, c) => sum + (c.num_cartons || 1), 0);
          // Only override if dispatch_notes don't have weights
          if (totalGrossWeight === 0) {
            totalGrossWeight = cartons.reduce((sum, c) => sum + (c.gross_weight || 0), 0);
          }
          if (totalNetWeight === 0) {
            totalNetWeight = cartons.reduce((sum, c) => sum + (c.net_weight || 0), 0);
          }
        }
      }

      // Store pending data and show dialog
      setPendingShipment(shipment);
      setPendingExportData({ 
        dispatchNotes, 
        customer, 
        currency,
        totalCartons,
        totalGrossWeight,
        totalNetWeight,
      });
      setExportDocType('invoice');
      setExportDialogOpen(true);
    } catch (error: any) {
      toast({ variant: "destructive", description: error.message });
    }
  };

  const handleDownloadPackingList = async (shipment: Shipment) => {
    try {
      // Try to get dispatch notes first
      const { data: dispatchNotes } = await supabase
        .from("dispatch_notes")
        .select(`*, 
          sales_orders:sales_order_id(customer_id, customer_master(customer_name, address_line_1, city, state, pincode, country, primary_contact_name, primary_contact_email, gst_number))
        `)
        .eq("shipment_id", shipment.id);

      // If no dispatch notes, build data from dispatches + cartons
      if (!dispatchNotes || dispatchNotes.length === 0) {
        const { data: dispatches } = await supabase
          .from("dispatches")
          .select(`
            id, quantity, wo_id, carton_id,
            cartons(num_cartons, gross_weight, net_weight, quantity),
            work_orders(display_id, item_code, customer, so_id)
          `)
          .eq("shipment_id", shipment.id);

        if (!dispatches || dispatches.length === 0) {
          toast({ variant: "destructive", description: "No dispatch data found for this shipment" });
          return;
        }

        const firstDispatch = dispatches[0] as any;
        const soId = firstDispatch.work_orders?.so_id;
        let customer = null;
        
        if (soId) {
          const { data: soData } = await supabase
            .from("sales_orders")
            .select("customer_master(customer_name, address_line_1, city, state, pincode, country, primary_contact_name, primary_contact_email, gst_number)")
            .eq("id", soId)
            .single();
          customer = (soData as any)?.customer_master;
        }

        const totalCartons = dispatches.reduce((sum, d: any) => sum + (d.cartons?.num_cartons || 1), 0);
        const totalGrossWeight = dispatches.reduce((sum, d: any) => sum + (d.cartons?.gross_weight || 0), 0);
        const totalNetWeight = dispatches.reduce((sum, d: any) => sum + (d.cartons?.net_weight || 0), 0);

        const syntheticNotes = dispatches.map((d: any) => ({
          item_code: d.work_orders?.item_code || 'N/A',
          item_description: d.work_orders?.item_code || 'N/A',
          dispatched_qty: d.quantity,
          gross_weight_kg: (d.cartons?.gross_weight || 0) * (d.quantity / (d.cartons?.quantity || d.quantity)),
          net_weight_kg: (d.cartons?.net_weight || 0) * (d.quantity / (d.cartons?.quantity || d.quantity)),
          num_cartons: d.cartons?.num_cartons || 1,
        }));

        setPendingShipment(shipment);
        setPendingExportData({ 
          dispatchNotes: syntheticNotes, 
          customer: customer || { customer_name: shipment.customer }, 
          currency: 'USD',
          totalCartons,
          totalGrossWeight,
          totalNetWeight,
        });
        setExportDocType('packing-list');
        setExportDialogOpen(true);
        return;
      }

      const customer = (dispatchNotes[0].sales_orders as any)?.customer_master;

      // Get carton data for auto-populating packing details
      const cartonIds = dispatchNotes.map(dn => dn.carton_id).filter(Boolean);
      let totalCartons = dispatchNotes.length;
      let totalGrossWeight = dispatchNotes.reduce((sum, dn) => sum + (dn.gross_weight_kg || 0), 0);
      let totalNetWeight = dispatchNotes.reduce((sum, dn) => sum + (dn.net_weight_kg || 0), 0);

      if (cartonIds.length > 0) {
        const { data: cartons } = await supabase
          .from("cartons")
          .select("id, num_cartons, gross_weight, net_weight")
          .in("id", cartonIds);
        
        if (cartons && cartons.length > 0) {
          totalCartons = cartons.reduce((sum, c) => sum + (c.num_cartons || 1), 0);
          if (totalGrossWeight === 0) {
            totalGrossWeight = cartons.reduce((sum, c) => sum + (c.gross_weight || 0), 0);
          }
          if (totalNetWeight === 0) {
            totalNetWeight = cartons.reduce((sum, c) => sum + (c.net_weight || 0), 0);
          }
        }
      }

      // Store pending data and show dialog
      setPendingShipment(shipment);
      setPendingExportData({ 
        dispatchNotes, 
        customer, 
        currency: 'USD',
        totalCartons,
        totalGrossWeight,
        totalNetWeight,
      });
      setExportDocType('packing-list');
      setExportDialogOpen(true);
    } catch (error: any) {
      toast({ variant: "destructive", description: error.message });
    }
  };

  // Handle export dialog confirm - generate PDF with user-provided fields
  const handleExportDialogConfirm = (fields: ExportDocumentFields) => {
    if (!pendingShipment || !pendingExportData) return;

    const { dispatchNotes, customer, currency, totalCartons, totalGrossWeight, totalNetWeight } = pendingExportData;

    if (exportDocType === 'invoice') {
      const financialSnapshot = (dispatchNotes[0].work_orders as any)?.financial_snapshot;
      const poNumber = (dispatchNotes[0].work_orders as any)?.po_number;
      const poDate = (dispatchNotes[0].work_orders as any)?.po_date;
      
      const lineItems = dispatchNotes.map((dn, idx) => ({
        srNo: idx + 1,
        itemCode: dn.item_code,
        description: dn.item_description || dn.item_code,
        hsCode: '',
        quantity: dn.dispatched_qty,
        unit: 'Pcs',
        rate: dn.unit_rate || 0,
        rateBasis: 'Per PCS',
        total: (dn.dispatched_qty * (dn.unit_rate || 0)),
      }));

      const invoiceData: CommercialInvoiceData = {
        invoiceNo: `INV-${pendingShipment.ship_id}`,
        invoiceDate: new Date(pendingShipment.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
        poNumber: poNumber || undefined,
        poDate: poDate ? new Date(poDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : undefined,
        consignee: {
          name: customer?.customer_name || pendingShipment.customer || "Unknown",
          addressLine1: customer?.address_line_1 || '',
          city: customer?.city || '',
          state: customer?.state || '',
          postalCode: customer?.pincode || '',
          country: customer?.country || 'USA',
          contact: customer?.primary_contact_name || '',
          email: customer?.primary_contact_email || '',
          gst: customer?.gst_number || '',
        },
        notifyPartySameAsConsignee: true,
        preCarriageBy: fields.preCarriageBy || 'N.A.',
        placeOfReceipt: fields.placeOfReceipt || 'N.A.',
        countryOfOrigin: 'INDIA',
        finalDestination: customer?.country || 'USA',
        portOfLoading: fields.portOfLoading,
        vesselFlightNo: fields.vesselFlightNo,
        portOfDischarge: fields.portOfDischarge,
        termsOfPayment: fields.termsOfPayment,
        blNumber: fields.blNumber || undefined,
        blDate: fields.blDate ? new Date(fields.blDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : undefined,
        kindOfPackages: fields.kindOfPackages,
        numberOfPackages: totalCartons || fields.numberOfPackages,
        grossWeightKg: totalGrossWeight || dispatchNotes.reduce((sum, dn) => sum + (dn.gross_weight_kg || 0), 0),
        netWeightKg: totalNetWeight || dispatchNotes.reduce((sum, dn) => sum + (dn.net_weight_kg || 0), 0),
        lineItems,
        currency,
        totalQuantity: lineItems.reduce((sum, item) => sum + item.quantity, 0),
        totalAmount: lineItems.reduce((sum, item) => sum + item.total, 0),
      };

      downloadCommercialInvoice(invoiceData);
      toast({ title: "Invoice Generated", description: `Commercial Invoice ${invoiceData.invoiceNo} downloaded.` });
    } else {
      // Packing List
      const lineItems: PackingListLineItem[] = dispatchNotes.map((dn, idx) => ({
        cartonRange: `${idx + 1}`,
        totalBoxes: (dn as any).num_cartons || 1,
        piecesPerCarton: dn.dispatched_qty,
        itemName: dn.item_description || dn.item_code,
        itemCode: dn.item_code || "N/A",
        totalPieces: dn.dispatched_qty,
        grossWeightKg: dn.gross_weight_kg || 0,
      }));

      const packingListData: PackingListData = {
        packingListNo: `PL-${pendingShipment.ship_id}`,
        date: new Date(pendingShipment.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
        consignee: {
          name: customer?.customer_name || pendingShipment.customer || "Unknown",
          addressLine1: customer?.address_line_1 || '',
          city: customer?.city || '',
          state: customer?.state || '',
          postalCode: customer?.pincode || '',
          country: customer?.country || 'USA',
        },
        notifyPartySameAsConsignee: true,
        portOfLoading: fields.portOfLoading,
        vesselFlightNo: fields.vesselFlightNo,
        portOfDischarge: fields.portOfDischarge,
        finalDestination: customer?.country || 'USA',
        termsOfPayment: fields.termsOfPayment,
        blNumber: fields.blNumber || undefined,
        blDate: fields.blDate ? new Date(fields.blDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : undefined,
        kindOfPackages: fields.kindOfPackages,
        lineItems,
        totalBoxes: totalCartons || fields.numberOfPackages || dispatchNotes.length,
        totalQuantity: lineItems.reduce((sum, item) => sum + item.totalPieces, 0),
        totalGrossWeight: totalGrossWeight || lineItems.reduce((sum, item) => sum + item.grossWeightKg, 0),
      };

      downloadPackingList(packingListData);
      toast({ title: "Packing List Generated", description: `Packing List ${packingListData.packingListNo} downloaded.` });
    }

    // Clear pending state
    setPendingShipment(null);
    setPendingExportData(null);
  };

  const hasActiveFilters = searchQuery || filterCustomer !== "all" || filterItem !== "all";

  return (
    <PageContainer>
      <PageHeader
        title="Dispatch"
        description="Create shipments from QC-approved packed batches"
        icon={<Truck className="h-6 w-6" />}
      />

      <Tabs defaultValue="dispatch" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="dispatch">
            <Send className="h-4 w-4 mr-2" />
            Create Dispatch
          </TabsTrigger>
          <TabsTrigger value="history">
            <History className="h-4 w-4 mr-2" />
            Dispatch History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dispatch" className="space-y-4 mt-6">
          {/* Stats Overview */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950/30 dark:to-blue-900/20 border-blue-200 dark:border-blue-800">
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <Package className="h-8 w-8 text-blue-600" />
                  <div>
                    <p className="text-2xl font-bold text-blue-700 dark:text-blue-400">{readyBatches.length}</p>
                    <p className="text-sm text-blue-600/80">Ready Batches</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-950/30 dark:to-emerald-900/20 border-emerald-200 dark:border-emerald-800">
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <Box className="h-8 w-8 text-emerald-600" />
                  <div>
                    <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">
                      {readyBatches.reduce((sum, b) => sum + b.available_qty, 0).toLocaleString()}
                    </p>
                    <p className="text-sm text-emerald-600/80">Total Pieces</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-950/30 dark:to-amber-900/20 border-amber-200 dark:border-amber-800">
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <Users className="h-8 w-8 text-amber-600" />
                  <div>
                    <p className="text-2xl font-bold text-amber-700 dark:text-amber-400">{uniqueCustomers.length}</p>
                    <p className="text-sm text-amber-600/80">Customers</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-950/30 dark:to-purple-900/20 border-purple-200 dark:border-purple-800">
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-8 w-8 text-purple-600" />
                  <div>
                    <p className="text-2xl font-bold text-purple-700 dark:text-purple-400">{summary.count}</p>
                    <p className="text-sm text-purple-600/80">Selected</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {readyBatches.length === 0 ? (
            <Card>
              <CardContent className="py-12">
                <div className="flex flex-col items-center justify-center text-center">
                  <AlertTriangle className="h-12 w-12 text-amber-500 mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No Packed Items Ready for Dispatch</h3>
                  <p className="text-muted-foreground max-w-md mb-4">
                    Items must be packed before they can be dispatched.
                  </p>
                  <Link to="/packing">
                    <Button variant="outline">
                      <Package className="h-4 w-4 mr-2" />
                      Go to Packing
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Filters & Search */}
              <Card>
                <CardContent className="py-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="relative flex-1 min-w-[200px]">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search by batch ID, WO, item, customer..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                    <Select value={filterCustomer} onValueChange={setFilterCustomer}>
                      <SelectTrigger className="w-[180px]">
                        <Building2 className="h-4 w-4 mr-2" />
                        <SelectValue placeholder="Customer" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Customers</SelectItem>
                        {uniqueCustomers.map(c => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={filterItem} onValueChange={setFilterItem}>
                      <SelectTrigger className="w-[180px]">
                        <Package className="h-4 w-4 mr-2" />
                        <SelectValue placeholder="Item" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Items</SelectItem>
                        {uniqueItems.map(i => (
                          <SelectItem key={i} value={i}>{i}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {hasActiveFilters && (
                      <Button variant="ghost" size="sm" onClick={clearFilters}>
                        <X className="h-4 w-4 mr-1" />
                        Clear
                      </Button>
                    )}
                    <div className="ml-auto flex gap-2">
                      <Button variant="outline" size="sm" onClick={handleSelectAll}>
                        {selectedBatchIds.size === filteredBatches.length ? "Deselect All" : "Select All"}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Grouped Batches by Customer */}
              <div className="space-y-3">
                {customerGroups.map(group => {
                  const isExpanded = expandedGroups.has(group.customer);
                  const groupBatchIds = group.batches.map(b => b.id);
                  const selectedInGroup = groupBatchIds.filter(id => selectedBatchIds.has(id)).length;
                  const allSelectedInGroup = selectedInGroup === groupBatchIds.length;

                  return (
                    <Card key={group.customer} className="overflow-hidden">
                      <Collapsible open={isExpanded} onOpenChange={() => toggleGroup(group.customer)}>
                        <CollapsibleTrigger asChild>
                          <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50 transition-colors">
                            <div className="flex items-center gap-4">
                              <Checkbox
                                checked={allSelectedInGroup}
                                onCheckedChange={() => handleSelectAllInGroup(group.customer)}
                                onClick={(e) => e.stopPropagation()}
                              />
                              <div className="flex items-center gap-2">
                                <Building2 className="h-5 w-5 text-muted-foreground" />
                                <span className="font-semibold text-lg">{group.customer}</span>
                              </div>
                              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                <span>{group.batches.length} batch{group.batches.length > 1 ? "es" : ""}</span>
                                <span className="font-medium text-foreground">{group.totalQty.toLocaleString()} pcs</span>
                                {selectedInGroup > 0 && (
                                  <Badge variant="secondary">{selectedInGroup} selected</Badge>
                                )}
                              </div>
                            </div>
                            {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                          </div>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <Table>
                            <TableHeader>
                              <TableRow className="bg-muted/30">
                                <TableHead className="w-12"></TableHead>
                                <TableHead>Batch ID</TableHead>
                                <TableHead>Work Order</TableHead>
                                <TableHead>Item</TableHead>
                                <TableHead>QC Status</TableHead>
                                <TableHead className="text-right">Available</TableHead>
                                <TableHead className="text-right">Dispatch Qty</TableHead>
                                <TableHead>Packed</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {group.batches.map(batch => {
                                const isSelected = selectedBatchIds.has(batch.id);
                                const dispatchQty = getDispatchQty(batch);
                                
                                return (
                                  <TableRow 
                                    key={batch.id}
                                    className={isSelected ? "bg-primary/5" : ""}
                                  >
                                    <TableCell>
                                      <Checkbox
                                        checked={isSelected}
                                        onCheckedChange={() => handleToggleBatch(batch.id)}
                                      />
                                    </TableCell>
                                    <TableCell className="font-mono text-sm">{batch.carton_id}</TableCell>
                                    <TableCell>
                                      <Link to={`/work-orders/${batch.wo_id}`} className="text-primary hover:underline">
                                        {batch.work_orders?.display_id || "—"}
                                      </Link>
                                    </TableCell>
                                    <TableCell>{batch.work_orders?.item_code}</TableCell>
                                    <TableCell>{getQCStatusBadge(batch)}</TableCell>
                                    <TableCell className="text-right font-medium">{batch.available_qty.toLocaleString()}</TableCell>
                                    <TableCell className="text-right">
                                      {isSelected ? (
                                        <Input
                                          type="number"
                                          min="1"
                                          max={batch.available_qty}
                                          value={dispatchQty}
                                          onChange={(e) => handleBatchQtyChange(batch.id, parseInt(e.target.value) || 1, batch.available_qty)}
                                          className="w-24 text-right ml-auto"
                                        />
                                      ) : (
                                        <span className="text-muted-foreground">—</span>
                                      )}
                                    </TableCell>
                                    <TableCell className="text-muted-foreground text-sm">
                                      {new Date(batch.built_at).toLocaleDateString()}
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </CollapsibleContent>
                      </Collapsible>
                    </Card>
                  );
                })}
              </div>
            </>
          )}

          {/* Create Shipment Panel */}
          {summary.count > 0 && (
            <Card className="border-primary/30 bg-gradient-to-r from-primary/5 to-primary/10 sticky bottom-4">
              <CardContent className="py-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-5 w-5 text-primary" />
                      <span className="font-semibold">Create Shipment</span>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <div className="text-center">
                        <p className="text-2xl font-bold text-primary">{summary.count}</p>
                        <p className="text-muted-foreground">Batches</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-bold text-primary">{summary.totalQty.toLocaleString()}</p>
                        <p className="text-muted-foreground">Pieces</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-bold text-primary">{summary.totalCartons}</p>
                        <p className="text-muted-foreground">Cartons</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Input
                      placeholder="Shipment ID (auto)"
                      value={shipmentId}
                      onChange={(e) => setShipmentId(e.target.value)}
                      className="w-40"
                    />
                    <Input
                      placeholder="Remarks"
                      value={remarks}
                      onChange={(e) => setRemarks(e.target.value)}
                      className="w-48"
                    />
                    <Button onClick={handleCreateShipment} disabled={loading} size="lg">
                      <Send className="h-4 w-4 mr-2" />
                      Create Shipment ({summary.totalQty.toLocaleString()} pcs)
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="history" className="space-y-4 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Recent Shipments</CardTitle>
              <CardDescription>View and manage dispatched shipments</CardDescription>
            </CardHeader>
            <CardContent>
              {recentShipments.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Truck className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No shipments yet</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Shipment ID</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Items</TableHead>
                      <TableHead className="text-right">Total Qty</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentShipments.map(shipment => (
                      <TableRow key={shipment.id}>
                        <TableCell className="font-mono font-medium">{shipment.ship_id}</TableCell>
                        <TableCell>{shipment.customer}</TableCell>
                        <TableCell>{getStatusBadge(shipment.status)}</TableCell>
                        <TableCell className="text-right">{shipment.dispatches?.length || 0}</TableCell>
                        <TableCell className="text-right">
                          {(shipment.dispatches || []).reduce((sum, d) => sum + (d.quantity || 0), 0).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {new Date(shipment.created_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="sm" onClick={() => handleDownloadInvoice(shipment)}>
                                    <FileDown className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Download Invoice</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="sm" onClick={() => handleDownloadPackingList(shipment)}>
                                    <Package className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Download Packing List</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                            <Link to={`/logistics?shipment=${shipment.id}`}>
                              <Button variant="ghost" size="sm">
                                <ExternalLink className="h-4 w-4" />
                              </Button>
                            </Link>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Export Document Dialog - collects missing shipping fields, packing details are auto-populated */}
      <ExportDocumentDialog
        open={exportDialogOpen}
        onOpenChange={setExportDialogOpen}
        documentType={exportDocType}
        packingData={pendingExportData ? {
          totalCartons: pendingExportData.totalCartons,
          totalGrossWeight: pendingExportData.totalGrossWeight,
          totalNetWeight: pendingExportData.totalNetWeight,
          totalQuantity: pendingExportData.dispatchNotes?.reduce((sum, dn) => sum + (dn.dispatched_qty || 0), 0),
        } : undefined}
        onConfirm={handleExportDialogConfirm}
      />
    </PageContainer>
  );
}
