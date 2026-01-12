import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Truck, Package, Send, CheckCircle2, History, AlertTriangle, Info, Layers, ShieldAlert, FileCheck, XCircle, FileDown, ExternalLink, ClipboardList } from "lucide-react";
import { PageHeader, PageContainer } from "@/components/ui/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Link } from "react-router-dom";
import { downloadCommercialInvoice, CommercialInvoiceData } from "@/lib/commercialInvoiceGenerator";
import { downloadPackingList, PackingListData, PackingListLineItem } from "@/lib/packingListGenerator";

/**
 * CANONICAL DISPATCH WORKFLOW (Non-Negotiable)
 * 
 * Dispatch ONLY operates on PACKED goods (cartons/packing batches).
 * Dispatch MUST NOT source directly from:
 * - Finished Goods Inventory
 * - Production batches
 * 
 * Dispatch represents "goods leaving the building" - always from cartons.
 * All quantities derive from: dispatches table (SINGLE SOURCE OF TRUTH)
 */

// Dispatch QC status for a work order (informational only, not blocking)
interface DispatchQCStatus {
  hasQC: boolean;
  passed: boolean;
  hasPDF: boolean;
  pdfUrl?: string;
  inspectedAt?: string;
}

// Packing batch ready for dispatch - ONLY source for dispatch
interface PackingBatch {
  id: string;
  carton_id: string;
  wo_id: string;
  production_batch_id: string | null;
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
  dispatchQCStatus?: DispatchQCStatus;
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
  
  // Ready for dispatch packing batches - ONLY source
  const [readyBatches, setReadyBatches] = useState<PackingBatch[]>([]);
  const [selectedBatchIds, setSelectedBatchIds] = useState<Set<string>>(new Set());
  const [dispatchQuantities, setDispatchQuantities] = useState<Record<string, number>>({});
  
  // Shipment form
  const [shipmentId, setShipmentId] = useState("");
  const [remarks, setRemarks] = useState("");
  
  // Recent shipments
  const [recentShipments, setRecentShipments] = useState<Shipment[]>([]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUser(user));
    loadReadyBatches();
    loadRecentShipments();

    // Real-time subscriptions for live data updates
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
    // Get all cartons ready for dispatch
    const { data: cartonData } = await supabase
      .from("cartons")
      .select(`
        id, carton_id, wo_id, production_batch_id, quantity,
        num_cartons, num_pallets, status, built_at,
        work_orders(display_id, item_code, customer),
        production_batches(batch_number)
      `)
      .eq("status", "ready_for_dispatch")
      .order("built_at", { ascending: true });

    const cartons = (cartonData || []) as any[];
    
    // Get already dispatched quantities from dispatches table (CANONICAL SOURCE)
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

    // Calculate available quantity per carton: packed_qty - dispatched_qty
    const baseBatches: PackingBatch[] = cartons.map(batch => {
      const alreadyDispatched = dispatchedByCarton[batch.id] || 0;
      return {
        ...batch,
        dispatched_qty: alreadyDispatched,
        available_qty: Math.max(0, batch.quantity - alreadyDispatched),
      };
    }).filter(b => b.available_qty > 0);

    // Enrich with Dispatch QC status for display (informational only)
    const woIds = [...new Set(baseBatches.map(b => b.wo_id))];
    
    const { data: qcRecords } = await supabase
      .from("qc_records")
      .select("wo_id, qc_type, result, qc_date_time")
      .in("wo_id", woIds)
      .eq("qc_type", "final");

    const { data: qcReports } = await supabase
      .from("qc_final_reports")
      .select("work_order_id, file_url")
      .in("work_order_id", woIds);

    const qcStatusMap = new Map<string, DispatchQCStatus>();
    woIds.forEach(woId => {
      const qcRecord = (qcRecords || []).find(r => r.wo_id === woId);
      const qcReport = (qcReports || []).find(r => r.work_order_id === woId);
      
      qcStatusMap.set(woId, {
        hasQC: !!qcRecord,
        passed: qcRecord?.result === "pass",
        hasPDF: !!qcReport?.file_url,
        pdfUrl: qcReport?.file_url || undefined,
        inspectedAt: qcRecord?.qc_date_time || undefined,
      });
    });

    const enriched: PackingBatch[] = baseBatches.map(batch => ({
      ...batch,
      dispatchQCStatus: qcStatusMap.get(batch.wo_id) || { hasQC: false, passed: false, hasPDF: false },
    }));

    setReadyBatches(enriched);
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

  const handleSelectAllBatches = () => {
    if (selectedBatchIds.size === readyBatches.length) {
      setSelectedBatchIds(new Set());
      setDispatchQuantities({});
    } else {
      const allIds = new Set(readyBatches.map(b => b.id));
      const allQtys: Record<string, number> = {};
      readyBatches.forEach(b => { allQtys[b.id] = b.available_qty; });
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

  // Dispatch is QUANTITY-DRIVEN - no longer blocked by QC status
  // Ready for dispatch when: packed_qty - dispatched_qty > 0
  const canDispatch = (batch: PackingBatch): boolean => {
    return batch.available_qty > 0;
  };

  const getBlockReason = (batch: PackingBatch): string => {
    if (batch.available_qty <= 0) return "No quantity available for dispatch";
    return "";
  };

  // === Summary Calculation ===
  const getSelectedSummary = () => {
    const selected = readyBatches.filter(b => selectedBatchIds.has(b.id));
    const blockedBatches = selected.filter(b => !canDispatch(b));
    return {
      count: selected.length,
      totalQty: selected.reduce((sum, b) => sum + getDispatchQty(b), 0),
      totalCartons: selected.reduce((sum, b) => sum + (b.num_cartons || 0), 0),
      totalPallets: selected.reduce((sum, b) => sum + (b.num_pallets || 0), 0),
      hasPartial: selected.some(b => getDispatchQty(b) < b.available_qty),
      blockedCount: blockedBatches.length,
      blockedBatches,
    };
  };

  const notifyLogisticsTeam = async (shipId: string, batchCount: number, totalQty: number) => {
    try {
      // Find users in admin or packing departments (packing handles logistics)
      const { data: depts } = await supabase
        .from("departments")
        .select("id")
        .in("type", ["admin", "packing"]);
      
      const deptIds = depts?.map(d => d.id) || [];
      
      const { data: users } = deptIds.length > 0 ? await supabase
        .from("profiles")
        .select("id")
        .in("department_id", deptIds)
        .eq("is_active", true) : { data: null };

      if (users && users.length > 0) {
        const notifications = users.map(u => ({
          user_id: u.id,
          type: "dispatch_created",
          title: "New Dispatch Created",
          message: `Shipment ${shipId} created with ${batchCount} packing batch(es), ${totalQty} pcs total.`,
          entity_type: "shipment",
        }));

        await supabase.from("notifications").insert(notifications);
      }
    } catch (error) {
      console.error("Failed to send notifications:", error);
    }
  };

  const handleCreateShipment = async () => {
    const summary = getSelectedSummary();
    
    if (summary.count === 0) {
      toast({ variant: "destructive", description: "Please select at least one packing batch" });
      return;
    }

    const selectedBatches = readyBatches.filter(b => selectedBatchIds.has(b.id));
    
    // Validate quantity availability
    const blockedBatches = selectedBatches.filter(b => !canDispatch(b));
    if (blockedBatches.length > 0) {
      const reasons = blockedBatches.map(b => 
        `${b.work_orders?.display_id || b.carton_id}: ${getBlockReason(b)}`
      ).join(", ");
      toast({ 
        variant: "destructive", 
        title: "Dispatch Blocked",
        description: `Cannot dispatch - ${reasons}` 
      });
      return;
    }

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

      // 2. Get production batch IDs for dispatch records (FK requirement)
      const prodBatchIds = [...new Set(selectedBatches.map(b => b.production_batch_id).filter(Boolean))];
      let batchMap = new Map<string, string>();
      
      if (prodBatchIds.length > 0) {
        const { data: prodBatches } = await supabase
          .from("production_batches")
          .select("id, wo_id")
          .in("id", prodBatchIds);
        
        (prodBatches || []).forEach(pb => batchMap.set(pb.wo_id, pb.id));
      }

      // Fallback: get any production batch for WOs without direct link
      const woIdsWithoutBatch = selectedBatches
        .filter(b => !b.production_batch_id && !batchMap.has(b.wo_id))
        .map(b => b.wo_id);
      
      if (woIdsWithoutBatch.length > 0) {
        const { data: fallbackBatches } = await supabase
          .from("production_batches")
          .select("id, wo_id")
          .in("wo_id", woIdsWithoutBatch);
        
        (fallbackBatches || []).forEach(pb => {
          if (!batchMap.has(pb.wo_id)) batchMap.set(pb.wo_id, pb.id);
        });
      }

      // 3. Create dispatch records and dispatch notes - WRITE TO dispatches table (SSOT)
      for (const batch of selectedBatches) {
        const dispatchQty = getDispatchQty(batch);
        const isPartial = dispatchQty < batch.available_qty;
        const batchId = batch.production_batch_id || batchMap.get(batch.wo_id) || batch.wo_id;
        
        // Create dispatch record - CANONICAL WRITE PATH
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

        // Get WO and SO details for dispatch note
        const { data: woData } = await supabase
          .from("work_orders")
          .select("item_code, so_id, quantity, gross_weight_per_pc, net_weight_per_pc, financial_snapshot, customer")
          .eq("id", batch.wo_id)
          .single();

        // Get SO ordered qty for reference
        let soOrderedQty = null;
        if (woData?.so_id) {
          const { data: soData } = await supabase
            .from("sales_orders")
            .select("items")
            .eq("id", woData.so_id)
            .single();
          
          if (soData?.items && Array.isArray(soData.items)) {
            const matchingItem = (soData.items as any[]).find(
              (item: any) => item.item_code === woData.item_code
            );
            soOrderedQty = matchingItem?.quantity || woData.quantity;
          }
        }

        // Get unit rate from financial_snapshot
        const financialSnapshot = woData?.financial_snapshot as any;
        const unitRate = financialSnapshot?.line_item?.price_per_pc || 0;
        const currency = financialSnapshot?.currency || "USD";

        // Create dispatch note (source of truth for invoicing)
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
          so_ordered_qty: soOrderedQty,
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

      // 4. Notify
      await notifyLogisticsTeam(generatedShipId, summary.count, summary.totalQty);

      toast({
        title: "Dispatch Created",
        description: `${generatedShipId} with ${selectedBatchIds.size} packing batch(es), ${summary.totalQty} pcs dispatched.`,
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

  // Download invoice for a shipment
  const handleDownloadInvoice = async (shipment: Shipment) => {
    try {
      // Check if invoice exists for this shipment
      const { data: invoices } = await supabase
        .from("invoices")
        .select("*")
        .eq("shipment_id", shipment.id)
        .limit(1);

      if (invoices && invoices.length > 0) {
        const invoice = invoices[0] as any;
        
        // Get dispatch notes for line items
        const { data: dispatchNotes } = await supabase
          .from("dispatch_notes")
          .select("*")
          .eq("shipment_id", shipment.id);

        const lineItems = (dispatchNotes || []).map((dn, idx) => ({
          srNo: idx + 1,
          itemCode: dn.item_code,
          description: dn.item_description || dn.item_code,
          quantity: dn.dispatched_qty,
          rate: dn.unit_rate || 0,
          total: (dn.dispatched_qty * (dn.unit_rate || 0)),
        }));

        const invoiceData: CommercialInvoiceData = {
          invoiceNo: invoice.invoice_no,
          invoiceDate: new Date(invoice.invoice_date).toLocaleDateString('en-GB'),
          dispatchDate: invoice.dispatch_date ? new Date(invoice.dispatch_date).toLocaleDateString('en-GB') : new Date(shipment.created_at).toLocaleDateString('en-GB'),
          poNumber: invoice.po_number,
          poDate: invoice.po_date ? new Date(invoice.po_date).toLocaleDateString('en-GB') : undefined,
          customer: {
            name: invoice.customer_name || shipment.customer || 'Customer',
            address: invoice.customer_address || '',
            contact: invoice.customer_contact,
            email: invoice.customer_email,
            gst: invoice.customer_gst,
          },
          isExport: invoice.is_export || false,
          portOfLoading: invoice.port_of_loading,
          portOfDischarge: invoice.port_of_discharge,
          incoterm: invoice.incoterm,
          countryOfOrigin: invoice.country_of_origin || 'INDIA',
          lineItems,
          currency: invoice.currency || 'INR',
          subtotal: invoice.subtotal || 0,
          gstPercent: invoice.gst_percent,
          gstAmount: invoice.gst_amount,
          totalAmount: invoice.total_amount || 0,
          dueDate: invoice.due_date ? new Date(invoice.due_date).toLocaleDateString('en-GB') : '',
        };

        downloadCommercialInvoice(invoiceData);
        toast({ description: `Downloaded invoice ${invoice.invoice_no}` });
      } else {
        toast({ 
          variant: "destructive", 
          description: "No invoice found for this shipment. Create an invoice first from Finance > Invoices." 
        });
      }
    } catch (error: any) {
      toast({ variant: "destructive", description: error.message });
    }
  };

  // Download packing list for a shipment
  const handleDownloadPackingList = async (shipment: Shipment) => {
    try {
      // Get cartons data for this shipment
      const { data: dispatches } = await supabase
        .from("dispatches")
        .select(`
          id, quantity, carton_id, wo_id,
          cartons(id, carton_id, quantity, num_cartons, net_weight, gross_weight),
          work_orders(display_id, item_code, customer, customer_id, so_id)
        `)
        .eq("shipment_id", shipment.id);

      if (!dispatches || dispatches.length === 0) {
        toast({ variant: "destructive", description: "No dispatch data found for this shipment." });
        return;
      }

      // Get invoice reference if exists
      const { data: invoice } = await supabase
        .from("invoices")
        .select("invoice_no, po_number, po_date, is_export, port_of_loading, port_of_discharge, customer_address, customer_contact, customer_email")
        .eq("shipment_id", shipment.id)
        .limit(1)
        .single();

      // Get customer details
      const woWithCustomer = dispatches.find(d => (d.work_orders as any)?.customer_id);
      let customerDetails = {
        name: shipment.customer || 'Customer',
        address: invoice?.customer_address || '',
        contact: invoice?.customer_contact,
        email: invoice?.customer_email,
      };

      if (woWithCustomer && (woWithCustomer.work_orders as any)?.customer_id) {
        const { data: customer } = await supabase
          .from("customer_master")
          .select("customer_name, address_line_1, city, state, country, pincode, primary_contact_name, primary_contact_email, is_export_customer")
          .eq("id", (woWithCustomer.work_orders as any).customer_id)
          .single();

        if (customer) {
          customerDetails = {
            name: customer.customer_name,
            address: [customer.address_line_1, customer.city, customer.state, customer.pincode, customer.country].filter(Boolean).join(', '),
            contact: customer.primary_contact_name || undefined,
            email: customer.primary_contact_email || undefined,
          };
        }
      }

      // Build line items from dispatches
      const lineItems: PackingListLineItem[] = [];
      let totalCartons = 0;
      let totalQuantity = 0;
      let totalNetWeight = 0;
      let totalGrossWeight = 0;

      dispatches.forEach((dispatch, idx) => {
        const carton = dispatch.cartons as any;
        const wo = dispatch.work_orders as any;
        
        const numCartons = carton?.num_cartons || 1;
        const qtyPerCarton = carton ? Math.floor(carton.quantity / numCartons) : dispatch.quantity;
        const netWeight = carton?.net_weight || 0;
        const grossWeight = carton?.gross_weight || 0;

        lineItems.push({
          srNo: idx + 1,
          itemCode: wo?.item_code || 'N/A',
          description: wo?.display_id || `WO-${dispatch.wo_id?.slice(0, 8)}`,
          cartonNos: carton?.carton_id || `CTN-${idx + 1}`,
          quantityPerCarton: qtyPerCarton,
          totalQty: dispatch.quantity,
          netWeightKg: netWeight,
          grossWeightKg: grossWeight,
        });

        totalCartons += numCartons;
        totalQuantity += dispatch.quantity;
        totalNetWeight += netWeight;
        totalGrossWeight += grossWeight;
      });

      const isExport = invoice?.is_export || false;

      const packingListData: PackingListData = {
        packingListNo: `PL-${shipment.ship_id}`,
        date: new Date(shipment.created_at).toLocaleDateString('en-GB'),
        dispatchRef: shipment.ship_id,
        invoiceRef: invoice?.invoice_no,
        poNumber: invoice?.po_number,
        poDate: invoice?.po_date ? new Date(invoice.po_date).toLocaleDateString('en-GB') : undefined,
        customer: customerDetails,
        isExport,
        portOfLoading: isExport ? invoice?.port_of_loading : undefined,
        portOfDischarge: isExport ? invoice?.port_of_discharge : undefined,
        countryOfOrigin: 'INDIA',
        lineItems,
        totalCartons,
        totalQuantity,
        totalNetWeight,
        totalGrossWeight,
        kindOfPackages: 'CARTONS',
        marksNos: 'AS MARKED',
      };

      downloadPackingList(packingListData);
      toast({ description: `Downloaded packing list for ${shipment.ship_id}` });
    } catch (error: any) {
      toast({ variant: "destructive", description: error.message });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <PageContainer maxWidth="xl">
        <div className="space-y-6">
          <PageHeader
            title="Dispatch"
            description="Create shipments from packed batches only"
            icon={<Truck className="h-6 w-6" />}
          />

          {/* Info Banner - Canonical Workflow */}
          <div className="flex items-start gap-3 p-4 rounded-lg border bg-muted/30">
            <Info className="h-5 w-5 text-blue-500 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium">Dispatch operates on PACKED goods only.</p>
              <p className="text-muted-foreground">
                All items must be packed first (via Packing page) before dispatch. 
                Finished Goods Inventory must also go through Packing before dispatch.
              </p>
            </div>
          </div>

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
              {/* Packing Batches Ready for Dispatch */}
              {readyBatches.length === 0 ? (
                <Card>
                  <CardContent className="py-12">
                    <div className="flex flex-col items-center justify-center text-center">
                      <AlertTriangle className="h-12 w-12 text-amber-500 mb-4" />
                      <h3 className="text-lg font-semibold mb-2">No Packed Items Ready for Dispatch</h3>
                      <p className="text-muted-foreground max-w-md mb-4">
                        Items must be packed before they can be dispatched. 
                        Complete the packing process first.
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
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          <Layers className="h-5 w-5" />
                          Packed Items Ready for Dispatch
                        </CardTitle>
                        <CardDescription>
                          Select packed batches to include in a shipment. Partial quantities are supported.
                        </CardDescription>
                      </div>
                      <Button variant="outline" size="sm" onClick={handleSelectAllBatches}>
                        {selectedBatchIds.size === readyBatches.length ? "Deselect All" : "Select All"}
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12"></TableHead>
                          <TableHead>Packing Batch</TableHead>
                          <TableHead>Source Batch</TableHead>
                          <TableHead>Work Order</TableHead>
                          <TableHead>Dispatch QC</TableHead>
                          <TableHead className="text-right">Available</TableHead>
                          <TableHead className="text-right">Dispatch Qty</TableHead>
                          <TableHead>Packed At</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {readyBatches.map((batch) => {
                          const isSelected = selectedBatchIds.has(batch.id);
                          const dispatchQty = getDispatchQty(batch);
                          const isPartial = isSelected && dispatchQty < batch.available_qty;
                          const isBlocked = !canDispatch(batch);
                          const blockReason = getBlockReason(batch);
                          
                          return (
                            <TableRow 
                              key={batch.id}
                              className={`${isSelected ? "bg-primary/5" : ""} ${isBlocked && isSelected ? "bg-destructive/5" : ""}`}
                            >
                              <TableCell>
                                <Checkbox
                                  checked={isSelected}
                                  onCheckedChange={() => handleToggleBatch(batch.id)}
                                />
                              </TableCell>
                              <TableCell>
                                <div>
                                  <p className="font-mono font-medium">{batch.carton_id}</p>
                                  {isPartial && (
                                    <Badge variant="outline" className="text-xs mt-1">Partial</Badge>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                {batch.production_batches 
                                  ? <span className="font-mono">Batch #{batch.production_batches.batch_number}</span>
                                  : <span className="text-muted-foreground">—</span>
                                }
                              </TableCell>
                              <TableCell>
                                <div>
                                  <p className="font-medium">{batch.work_orders?.display_id || "—"}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {batch.work_orders?.item_code} • {batch.work_orders?.customer}
                                  </p>
                                </div>
                              </TableCell>
                              <TableCell>
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      {batch.dispatchQCStatus?.hasQC && batch.dispatchQCStatus?.passed && batch.dispatchQCStatus?.hasPDF ? (
                                        <Badge className="bg-green-500/10 text-green-600 border-green-500/20 gap-1">
                                          <FileCheck className="h-3 w-3" />
                                          Approved
                                        </Badge>
                                      ) : batch.dispatchQCStatus?.hasQC && batch.dispatchQCStatus?.passed ? (
                                        <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20 gap-1">
                                          <AlertTriangle className="h-3 w-3" />
                                          No PDF
                                        </Badge>
                                      ) : batch.dispatchQCStatus?.hasQC ? (
                                        <Badge className="bg-red-500/10 text-red-600 border-red-500/20 gap-1">
                                          <XCircle className="h-3 w-3" />
                                          Failed
                                        </Badge>
                                      ) : (
                                        <Badge variant="outline" className="gap-1 text-muted-foreground">
                                          <ShieldAlert className="h-3 w-3" />
                                          Pending
                                        </Badge>
                                      )}
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      {isBlocked ? (
                                        <div className="flex flex-col gap-1">
                                          <span className="font-medium text-red-500">Dispatch blocked</span>
                                          <span>{blockReason}</span>
                                        </div>
                                      ) : (
                                        <span>Dispatch QC status (informational)</span>
                                      )}
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              </TableCell>
                              <TableCell className="text-right font-medium">{batch.available_qty}</TableCell>
                              <TableCell className="text-right">
                                {isSelected ? (
                                  <Input
                                    type="number"
                                    min="1"
                                    max={batch.available_qty}
                                    value={dispatchQty}
                                    onChange={(e) => handleBatchQtyChange(batch.id, parseInt(e.target.value) || 1, batch.available_qty)}
                                    className="w-20 text-right ml-auto"
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
                  </CardContent>
                </Card>
              )}

              {/* Selected Summary & Shipment Creation */}
              {summary.count > 0 && (
                <Card className="border-primary/30 bg-primary/5">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <CheckCircle2 className="h-5 w-5 text-primary" />
                      Create Shipment
                    </CardTitle>
                    <CardDescription>
                      Review selection and create shipment for logistics
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Summary Stats */}
                    <div className="grid grid-cols-4 gap-4">
                      <div className="text-center p-3 rounded-lg bg-background border">
                        <p className="text-2xl font-bold text-primary">{summary.count}</p>
                        <p className="text-xs text-muted-foreground">Packing Batches</p>
                      </div>
                      <div className="text-center p-3 rounded-lg bg-background border">
                        <p className="text-2xl font-bold">{summary.totalQty}</p>
                        <p className="text-xs text-muted-foreground">Total Pieces</p>
                      </div>
                      <div className="text-center p-3 rounded-lg bg-background border">
                        <p className="text-2xl font-bold">{summary.totalCartons}</p>
                        <p className="text-xs text-muted-foreground">Cartons</p>
                      </div>
                      <div className="text-center p-3 rounded-lg bg-background border">
                        <p className="text-2xl font-bold">{summary.totalPallets}</p>
                        <p className="text-xs text-muted-foreground">Pallets</p>
                      </div>
                    </div>

                    {summary.blockedCount > 0 && (
                      <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                        <ShieldAlert className="h-4 w-4 text-destructive mt-0.5" />
                        <div className="text-sm">
                          <p className="font-medium text-destructive">
                            {summary.blockedCount} batch(es) blocked from dispatch
                          </p>
                          <ul className="text-muted-foreground mt-1 space-y-1">
                            {summary.blockedBatches.map(b => (
                              <li key={b.id} className="flex items-center gap-2">
                                <span>{b.work_orders?.display_id || b.carton_id}:</span>
                                <span className="text-destructive">{getBlockReason(b)}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    )}

                    {summary.hasPartial && (
                      <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                        <Info className="h-4 w-4 text-amber-600" />
                        <p className="text-sm text-amber-700">
                          Some items have partial quantities. Remaining will stay available for future dispatch.
                        </p>
                      </div>
                    )}

                    {/* Shipment Form */}
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="shipmentId">Shipment ID (optional)</Label>
                        <Input
                          id="shipmentId"
                          value={shipmentId}
                          onChange={(e) => setShipmentId(e.target.value)}
                          placeholder="Auto-generated if empty"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="remarks">Remarks</Label>
                        <Input
                          id="remarks"
                          value={remarks}
                          onChange={(e) => setRemarks(e.target.value)}
                          placeholder="Optional notes"
                        />
                      </div>
                    </div>

                    <Button 
                      onClick={handleCreateShipment} 
                      className="w-full" 
                      disabled={loading || summary.blockedCount > 0}
                    >
                      {loading ? "Creating..." : `Create Shipment (${summary.totalQty} pcs)`}
                    </Button>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* History Tab - Derives from dispatches table */}
            <TabsContent value="history" className="space-y-4 mt-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <History className="h-5 w-5" />
                    Recent Shipments
                  </CardTitle>
                  <CardDescription>
                    All dispatch history (derived from dispatches table)
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {recentShipments.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No shipments found
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Shipment ID</TableHead>
                          <TableHead>Customer</TableHead>
                          <TableHead>Items</TableHead>
                          <TableHead className="text-right">Total Qty</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Created</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {recentShipments.map((shipment) => {
                          const totalQty = shipment.dispatches.reduce((sum, d) => sum + d.quantity, 0);
                          return (
                            <TableRow key={shipment.id}>
                              <TableCell className="font-mono font-medium">
                                {shipment.ship_id}
                              </TableCell>
                              <TableCell>{shipment.customer || "—"}</TableCell>
                              <TableCell>
                                <Badge variant="outline">{shipment.dispatches.length} items</Badge>
                              </TableCell>
                              <TableCell className="text-right font-medium">{totalQty}</TableCell>
                              <TableCell>{getStatusBadge(shipment.status)}</TableCell>
                              <TableCell className="text-muted-foreground text-sm">
                                {new Date(shipment.created_at).toLocaleDateString()}
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button 
                                          variant="ghost" 
                                          size="icon"
                                          onClick={() => handleDownloadPackingList(shipment)}
                                        >
                                          <ClipboardList className="h-4 w-4" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>Download Packing List</TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button 
                                          variant="ghost" 
                                          size="icon"
                                          onClick={() => handleDownloadInvoice(shipment)}
                                        >
                                          <FileDown className="h-4 w-4" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>Download Invoice</TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Link to={`/logistics?shipment=${shipment.id}`}>
                                          <Button variant="ghost" size="icon">
                                            <ExternalLink className="h-4 w-4" />
                                          </Button>
                                        </Link>
                                      </TooltipTrigger>
                                      <TooltipContent>View Details</TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </PageContainer>
    </div>
  );
}
