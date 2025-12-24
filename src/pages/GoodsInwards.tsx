import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  Package, Search, Truck, Factory, ArrowRight, 
  Plus, RefreshCw, FileText, Calendar, Building2 
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { createExecutionRecord } from "@/hooks/useExecutionRecord";

type ReceiptType = 'supplier_to_factory' | 'partner_to_factory' | 'partner_to_partner' | 'partner_to_packing';

interface PendingMovement {
  id: string;
  batch_id: string;
  work_order_id: string;
  process_type: string;
  partner_id: string;
  partner_name: string;
  quantity_sent: number;
  quantity_returned: number;
  quantity_pending: number;
  unit: string;
  sent_date: string;
  expected_return_date: string | null;
  status: string;
  challan_no: string | null;
  work_order: {
    display_id: string;
    item_code: string;
    customer: string;
  };
  batch: {
    batch_number: number;
  };
}

interface MaterialReceipt {
  id: string;
  receipt_no: string;
  receipt_type: ReceiptType;
  receipt_date: string;
  source_supplier_name?: string;
  source_partner_name?: string;
  destination_partner_name?: string;
  quantity_received: number;
  quantity_rejected: number;
  quantity_ok: number;
  unit: string;
  process_type?: string;
  challan_no?: string;
  work_order_display_id?: string;
  item_code?: string;
  customer?: string;
  batch_number?: number;
  qc_status: string;
}

const RECEIPT_TYPE_CONFIG: Record<ReceiptType, { label: string; icon: any; color: string; description: string }> = {
  supplier_to_factory: { 
    label: 'Supplier → Factory', 
    icon: Package, 
    color: 'bg-blue-500',
    description: 'Raw material receipt from supplier'
  },
  partner_to_factory: { 
    label: 'Partner → Factory', 
    icon: Factory, 
    color: 'bg-emerald-500',
    description: 'Return from external processing partner'
  },
  partner_to_partner: { 
    label: 'Partner → Partner', 
    icon: ArrowRight, 
    color: 'bg-purple-500',
    description: 'Forward to another external partner'
  },
  partner_to_packing: { 
    label: 'Partner → Packing', 
    icon: Truck, 
    color: 'bg-amber-500',
    description: 'Direct to packing from partner'
  },
};

export default function GoodsInwards() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'receive' | 'ledger'>('receive');
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<any>(null);

  // Pending movements for receipt
  const [pendingMovements, setPendingMovements] = useState<PendingMovement[]>([]);
  const [selectedMovement, setSelectedMovement] = useState<PendingMovement | null>(null);
  const [movementSearch, setMovementSearch] = useState("");

  // External partners for forwarding
  const [partners, setPartners] = useState<{ id: string; name: string; process_type: string }[]>([]);

  // Receipt form state
  const [receiptDialogOpen, setReceiptDialogOpen] = useState(false);
  const [receiptType, setReceiptType] = useState<ReceiptType>('partner_to_factory');
  const [formData, setFormData] = useState({
    quantity_received: "",
    quantity_rejected: "",
    challan_no: "",
    dc_number: "",
    remarks: "",
    requires_qc: true,
    destination_partner_id: "",
    process_type: "",
  });

  // Receipt ledger
  const [receipts, setReceipts] = useState<MaterialReceipt[]>([]);
  const [receiptFilter, setReceiptFilter] = useState<ReceiptType | 'all'>('all');

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
    };
    getUser();
    loadPendingMovements();
    loadPartners();
    loadReceipts();

    // Realtime subscriptions
    const channel = supabase
      .channel('goods-inwards-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'external_movements' }, () => loadPendingMovements())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'material_receipts' }, () => loadReceipts())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadPendingMovements = async () => {
    try {
      const { data, error } = await supabase
        .from("external_movements")
        .select(`
          id, batch_id, work_order_id, process_type, partner_id, 
          quantity_sent, quantity_returned, unit, sent_date, 
          expected_return_date, status, challan_no,
          external_partners!partner_id(name),
          work_orders!work_order_id(display_id, item_code, customer),
          production_batches!batch_id(batch_number)
        `)
        .in("status", ["sent", "in_transit", "at_partner", "partially_returned"])
        .order("expected_return_date", { ascending: true, nullsFirst: false });

      if (error) throw error;

      const movements: PendingMovement[] = (data || []).map((m: any) => ({
        id: m.id,
        batch_id: m.batch_id,
        work_order_id: m.work_order_id,
        process_type: m.process_type,
        partner_id: m.partner_id,
        partner_name: m.external_partners?.name || 'Unknown',
        quantity_sent: m.quantity_sent,
        quantity_returned: m.quantity_returned || 0,
        quantity_pending: m.quantity_sent - (m.quantity_returned || 0),
        unit: m.unit || 'pcs',
        sent_date: m.sent_date,
        expected_return_date: m.expected_return_date,
        status: m.status,
        challan_no: m.challan_no,
        work_order: m.work_orders || { display_id: 'N/A', item_code: '', customer: '' },
        batch: m.production_batches || { batch_number: 1 },
      }));

      setPendingMovements(movements);
    } catch (error: any) {
      console.error("Error loading movements:", error);
      toast({ variant: "destructive", description: error.message });
    }
  };

  const loadPartners = async () => {
    try {
      const { data, error } = await supabase
        .from("external_partners")
        .select("id, name, process_type")
        .eq("is_active", true)
        .order("name");

      if (error) throw error;
      setPartners(data || []);
    } catch (error: any) {
      console.error("Error loading partners:", error);
    }
  };

  const loadReceipts = async () => {
    try {
      const { data, error } = await supabase
        .from("material_receipts")
        .select(`
          id, receipt_no, receipt_type, receipt_date,
          quantity_received, quantity_rejected, quantity_ok, unit,
          process_type, challan_no, qc_status,
          suppliers:source_supplier_id(name),
          source_partner:source_partner_id(name),
          dest_partner:destination_partner_id(name),
          work_orders:work_order_id(display_id, item_code, customer),
          production_batches:batch_id(batch_number)
        `)
        .order("receipt_date", { ascending: false })
        .limit(100);

      if (error) throw error;

      const mappedReceipts: MaterialReceipt[] = (data || []).map((r: any) => ({
        id: r.id,
        receipt_no: r.receipt_no,
        receipt_type: r.receipt_type,
        receipt_date: r.receipt_date,
        source_supplier_name: r.suppliers?.name,
        source_partner_name: r.source_partner?.name,
        destination_partner_name: r.dest_partner?.name,
        quantity_received: r.quantity_received,
        quantity_rejected: r.quantity_rejected || 0,
        quantity_ok: r.quantity_ok,
        unit: r.unit || 'pcs',
        process_type: r.process_type,
        challan_no: r.challan_no,
        work_order_display_id: r.work_orders?.display_id,
        item_code: r.work_orders?.item_code,
        customer: r.work_orders?.customer,
        batch_number: r.production_batches?.batch_number,
        qc_status: r.qc_status || 'pending',
      }));

      setReceipts(mappedReceipts);
    } catch (error: any) {
      console.error("Error loading receipts:", error);
    }
  };

  const filteredMovements = useMemo(() => {
    if (!movementSearch) return pendingMovements;
    const search = movementSearch.toLowerCase();
    return pendingMovements.filter(m =>
      m.work_order.display_id.toLowerCase().includes(search) ||
      m.partner_name.toLowerCase().includes(search) ||
      m.process_type.toLowerCase().includes(search) ||
      m.challan_no?.toLowerCase().includes(search)
    );
  }, [pendingMovements, movementSearch]);

  const filteredReceipts = useMemo(() => {
    if (receiptFilter === 'all') return receipts;
    return receipts.filter(r => r.receipt_type === receiptFilter);
  }, [receipts, receiptFilter]);

  const handleSelectMovement = (movement: PendingMovement) => {
    setSelectedMovement(movement);
    setFormData({
      quantity_received: movement.quantity_pending.toString(),
      quantity_rejected: "0",
      challan_no: movement.challan_no || "",
      dc_number: "",
      remarks: "",
      requires_qc: true,
      destination_partner_id: "",
      process_type: movement.process_type,
    });
    setReceiptType('partner_to_factory');
    setReceiptDialogOpen(true);
  };

  const handleSubmitReceipt = async () => {
    if (!selectedMovement) return;
    setLoading(true);

    try {
      const qtyReceived = parseInt(formData.quantity_received) || 0;
      const qtyRejected = parseInt(formData.quantity_rejected) || 0;

      if (qtyReceived <= 0) {
        toast({ variant: "destructive", description: "Quantity must be greater than 0" });
        setLoading(false);
        return;
      }

      if (qtyReceived > selectedMovement.quantity_pending) {
        toast({ variant: "destructive", description: `Cannot receive more than pending quantity (${selectedMovement.quantity_pending})` });
        setLoading(false);
        return;
      }

      if (receiptType === 'partner_to_partner' && !formData.destination_partner_id) {
        toast({ variant: "destructive", description: "Please select destination partner" });
        setLoading(false);
        return;
      }

      // Generate receipt number
      const { data: receiptNo, error: seqError } = await supabase
        .rpc('generate_receipt_number', { receipt_type: receiptType });

      if (seqError) throw seqError;

      // Create material receipt
      const { error: insertError } = await supabase
        .from("material_receipts")
        .insert({
          receipt_no: receiptNo,
          receipt_type: receiptType,
          receipt_date: new Date().toISOString(),
          source_partner_id: selectedMovement.partner_id,
          destination_partner_id: receiptType === 'partner_to_partner' ? formData.destination_partner_id : null,
          batch_id: selectedMovement.batch_id,
          work_order_id: selectedMovement.work_order_id,
          external_movement_id: selectedMovement.id,
          quantity_received: qtyReceived,
          quantity_rejected: qtyRejected,
          unit: selectedMovement.unit as any,
          challan_no: formData.challan_no || null,
          dc_number: formData.dc_number || null,
          process_type: formData.process_type || selectedMovement.process_type,
          requires_qc: formData.requires_qc,
          qc_status: formData.requires_qc ? 'pending' : 'not_required',
          received_by: user?.id,
          remarks: formData.remarks || null,
        });

      if (insertError) throw insertError;

      // Create execution record
      await createExecutionRecord({
        workOrderId: selectedMovement.work_order_id,
        operationType: 'EXTERNAL_PROCESS',
        processName: selectedMovement.process_type,
        quantity: qtyReceived,
        unit: selectedMovement.unit as 'pcs' | 'kg',
        direction: 'IN',
        relatedPartnerId: selectedMovement.partner_id,
        relatedChallanId: selectedMovement.id,
      });

      toast({ 
        title: "Receipt Recorded", 
        description: `${receiptNo}: ${qtyReceived} ${selectedMovement.unit} received from ${selectedMovement.partner_name}` 
      });

      setReceiptDialogOpen(false);
      setSelectedMovement(null);
      loadPendingMovements();
      loadReceipts();
    } catch (error: any) {
      console.error("Error creating receipt:", error);
      toast({ variant: "destructive", description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const getReceiptTypeBadge = (type: ReceiptType) => {
    const config = RECEIPT_TYPE_CONFIG[type];
    return (
      <Badge variant="outline" className={cn("text-xs", config.color, "text-white border-0")}>
        {config.label}
      </Badge>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Goods Inwards</h1>
            <p className="text-sm text-muted-foreground">
              Material receipt ledger - track all incoming goods
            </p>
          </div>
          <Button onClick={() => navigate("/materials/inwards")} variant="outline">
            <Package className="h-4 w-4 mr-2" />
            Supplier Receipts
          </Button>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="receive" className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Receive Material
            </TabsTrigger>
            <TabsTrigger value="ledger" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Receipt Ledger
            </TabsTrigger>
          </TabsList>

          {/* Receive Material Tab */}
          <TabsContent value="receive" className="space-y-4">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Object.entries(RECEIPT_TYPE_CONFIG).slice(1).map(([key, config]) => {
                const count = pendingMovements.length;
                const Icon = config.icon;
                return (
                  <Card key={key} className="cursor-pointer hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3">
                        <div className={cn("p-2 rounded-lg", config.color)}>
                          <Icon className="h-5 w-5 text-white" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">{config.label.split(' → ')[0]}</p>
                          <p className="text-xs text-muted-foreground">{config.description}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Pending Movements */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Pending Returns</CardTitle>
                    <CardDescription>Material awaiting receipt from external partners</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search..."
                        value={movementSearch}
                        onChange={(e) => setMovementSearch(e.target.value)}
                        className="pl-9 w-64"
                      />
                    </div>
                    <Button variant="ghost" size="icon" onClick={loadPendingMovements}>
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {filteredMovements.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Package className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No pending returns</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Work Order</TableHead>
                        <TableHead>Partner</TableHead>
                        <TableHead>Process</TableHead>
                        <TableHead>Sent</TableHead>
                        <TableHead>Pending</TableHead>
                        <TableHead>Expected</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredMovements.map((movement) => {
                        const isOverdue = movement.expected_return_date && 
                          new Date(movement.expected_return_date) < new Date();
                        return (
                          <TableRow key={movement.id} className={isOverdue ? "bg-destructive/5" : ""}>
                            <TableCell>
                              <div>
                                <p className="font-medium">{movement.work_order.display_id}</p>
                                <p className="text-xs text-muted-foreground">{movement.work_order.item_code}</p>
                              </div>
                            </TableCell>
                            <TableCell>{movement.partner_name}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{movement.process_type}</Badge>
                            </TableCell>
                            <TableCell>{movement.quantity_sent} {movement.unit}</TableCell>
                            <TableCell>
                              <span className={cn(
                                "font-medium",
                                movement.quantity_pending > 0 ? "text-amber-600" : "text-green-600"
                              )}>
                                {movement.quantity_pending} {movement.unit}
                              </span>
                            </TableCell>
                            <TableCell>
                              {movement.expected_return_date ? (
                                <span className={isOverdue ? "text-destructive font-medium" : ""}>
                                  {format(parseISO(movement.expected_return_date), "MMM d")}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge variant={movement.status === 'partially_returned' ? 'secondary' : 'outline'}>
                                {movement.status.replace('_', ' ')}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button 
                                size="sm" 
                                onClick={() => handleSelectMovement(movement)}
                                disabled={movement.quantity_pending === 0}
                              >
                                Receive
                              </Button>
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

          {/* Receipt Ledger Tab */}
          <TabsContent value="ledger" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Receipt Ledger</CardTitle>
                    <CardDescription>All material receipts history</CardDescription>
                  </div>
                  <Select value={receiptFilter} onValueChange={(v) => setReceiptFilter(v as any)}>
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder="Filter by type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      {Object.entries(RECEIPT_TYPE_CONFIG).map(([key, config]) => (
                        <SelectItem key={key} value={key}>{config.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                {filteredReceipts.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No receipts found</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Receipt #</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead>Work Order</TableHead>
                        <TableHead>Qty OK</TableHead>
                        <TableHead>Rejected</TableHead>
                        <TableHead>QC</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredReceipts.map((receipt) => (
                        <TableRow key={receipt.id}>
                          <TableCell className="font-mono text-sm">{receipt.receipt_no}</TableCell>
                          <TableCell>
                            {format(parseISO(receipt.receipt_date), "MMM d, HH:mm")}
                          </TableCell>
                          <TableCell>{getReceiptTypeBadge(receipt.receipt_type)}</TableCell>
                          <TableCell>
                            {receipt.source_supplier_name || receipt.source_partner_name || '—'}
                            {receipt.destination_partner_name && (
                              <span className="text-muted-foreground"> → {receipt.destination_partner_name}</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium">{receipt.work_order_display_id || '—'}</p>
                              {receipt.item_code && (
                                <p className="text-xs text-muted-foreground">{receipt.item_code}</p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-green-600 font-medium">
                            {receipt.quantity_ok} {receipt.unit}
                          </TableCell>
                          <TableCell>
                            {receipt.quantity_rejected > 0 ? (
                              <span className="text-destructive">{receipt.quantity_rejected}</span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant={
                              receipt.qc_status === 'approved' ? 'default' :
                              receipt.qc_status === 'rejected' ? 'destructive' :
                              receipt.qc_status === 'not_required' ? 'secondary' :
                              'outline'
                            }>
                              {receipt.qc_status}
                            </Badge>
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

        {/* Receipt Dialog */}
        <Dialog open={receiptDialogOpen} onOpenChange={setReceiptDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Record Material Receipt</DialogTitle>
            </DialogHeader>

            {selectedMovement && (
              <div className="space-y-4">
                {/* Movement Summary */}
                <div className="p-3 bg-muted rounded-lg">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">Work Order:</span>
                      <span className="ml-2 font-medium">{selectedMovement.work_order.display_id}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Partner:</span>
                      <span className="ml-2 font-medium">{selectedMovement.partner_name}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Process:</span>
                      <span className="ml-2">{selectedMovement.process_type}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Pending:</span>
                      <span className="ml-2 font-medium text-amber-600">
                        {selectedMovement.quantity_pending} {selectedMovement.unit}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Receipt Type Selection */}
                <div className="space-y-2">
                  <Label>Receipt Type</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {(['partner_to_factory', 'partner_to_partner', 'partner_to_packing'] as ReceiptType[]).map((type) => {
                      const config = RECEIPT_TYPE_CONFIG[type];
                      const Icon = config.icon;
                      return (
                        <button
                          key={type}
                          type="button"
                          onClick={() => setReceiptType(type)}
                          className={cn(
                            "flex items-center gap-2 p-3 rounded-lg border transition-all text-left",
                            receiptType === type
                              ? "border-primary bg-primary/5"
                              : "border-border hover:border-primary/50"
                          )}
                        >
                          <Icon className={cn("h-4 w-4", receiptType === type ? "text-primary" : "text-muted-foreground")} />
                          <div>
                            <p className="text-sm font-medium">{config.label}</p>
                            <p className="text-xs text-muted-foreground">{config.description}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Destination Partner (for forwarding) */}
                {receiptType === 'partner_to_partner' && (
                  <div className="space-y-2">
                    <Label>Destination Partner *</Label>
                    <Select
                      value={formData.destination_partner_id}
                      onValueChange={(v) => setFormData({ ...formData, destination_partner_id: v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select partner" />
                      </SelectTrigger>
                      <SelectContent>
                        {partners
                          .filter(p => p.id !== selectedMovement.partner_id)
                          .map((partner) => (
                            <SelectItem key={partner.id} value={partner.id}>
                              {partner.name} ({partner.process_type})
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Quantity */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Quantity Received *</Label>
                    <Input
                      type="number"
                      value={formData.quantity_received}
                      onChange={(e) => setFormData({ ...formData, quantity_received: e.target.value })}
                      max={selectedMovement.quantity_pending}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Quantity Rejected</Label>
                    <Input
                      type="number"
                      value={formData.quantity_rejected}
                      onChange={(e) => setFormData({ ...formData, quantity_rejected: e.target.value })}
                    />
                  </div>
                </div>

                {/* Challan / DC */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Challan No</Label>
                    <Input
                      value={formData.challan_no}
                      onChange={(e) => setFormData({ ...formData, challan_no: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>DC Number</Label>
                    <Input
                      value={formData.dc_number}
                      onChange={(e) => setFormData({ ...formData, dc_number: e.target.value })}
                    />
                  </div>
                </div>

                {/* QC Required */}
                {receiptType !== 'partner_to_partner' && (
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="requires_qc"
                      checked={formData.requires_qc}
                      onCheckedChange={(checked) => setFormData({ ...formData, requires_qc: !!checked })}
                    />
                    <Label htmlFor="requires_qc" className="text-sm">
                      Requires QC inspection before production
                    </Label>
                  </div>
                )}

                {/* Remarks */}
                <div className="space-y-2">
                  <Label>Remarks</Label>
                  <Textarea
                    value={formData.remarks}
                    onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                    rows={2}
                  />
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setReceiptDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSubmitReceipt} disabled={loading}>
                {loading ? "Saving..." : "Record Receipt"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
