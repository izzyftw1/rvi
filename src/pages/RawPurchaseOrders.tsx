import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { NavigationHeader } from "@/components/NavigationHeader";
import { useToast } from "@/hooks/use-toast";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle, Edit, PackagePlus, ArrowLeft, Download, Home } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { ReconciliationRow } from "@/components/ReconciliationRow";

interface RPO {
  id: string;
  rpo_no: string;
  status: string;
  supplier_id: string;
  created_by: string;
  approved_by: string | null;
  approved_at: string | null;
  so_id: string | null;
  wo_id: string | null;
  item_code: string;
  material_size_mm: string;
  alloy: string;
  qty_ordered_kg: number;
  rate_per_kg: number;
  amount_ordered: number;
  expected_delivery_date: string | null;
  remarks: string | null;
  created_at: string;
  updated_at: string;
  suppliers?: { name: string };
  work_orders?: { wo_id: string };
  sales_orders?: { so_id: string };
}

interface Supplier {
  id: string;
  name: string;
}

interface Reconciliation {
  id: string;
  rpo_id: string;
  reason: string;
  resolution: string;
  qty_delta_kg: number | null;
  rate_delta: number | null;
  amount_delta: number | null;
  resolution_ref: string | null;
  notes: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
}

interface Receipt {
  id: string;
  rpo_id: string;
  qty_received_kg: number;
  supplier_invoice_no: string | null;
  supplier_invoice_date: string | null;
  rate_on_invoice: number | null;
  received_date: string;
  lr_no: string | null;
  transporter: string | null;
  notes: string | null;
}

export default function RawPurchaseOrders() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [rpos, setRpos] = useState<RPO[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selectedTab, setSelectedTab] = useState("draft");
  const [selectedRPO, setSelectedRPO] = useState<RPO | null>(null);
  const [detailView, setDetailView] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [reconciliations, setReconciliations] = useState<Reconciliation[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [detailTab, setDetailTab] = useState("overview");

  // Master data for dropdowns
  const [materialGrades, setMaterialGrades] = useState<{id: string; name: string; category: string | null}[]>([]);
  const [nominalSizes, setNominalSizes] = useState<{id: string; size_value: number; display_label: string | null}[]>([]);
  const [crossSectionShapes, setCrossSectionShapes] = useState<{id: string; name: string}[]>([]);

  // Edit form state
  const [editForm, setEditForm] = useState({
    supplier_id: "",
    item_code: "",
    material_size_mm: "",
    cross_section_shape: "",
    alloy: "",
    qty_ordered_kg: "",
    rate_per_kg: "",
    expected_delivery_date: "",
    remarks: ""
  });

  useEffect(() => {
    loadData();

    // Realtime subscription
    const channel = supabase
      .channel('raw-po-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'raw_purchase_orders' }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'raw_po_receipts' }, () => loadData())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // If we open via deep-link (?rpo_no=...), wait until list loads then open detail
  useEffect(() => {
    const rpoNo = searchParams.get("rpo_no");
    if (rpoNo && rpos.length > 0) {
      loadRPODetail(rpoNo);
    }
  }, [searchParams, rpos]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load RPOs with relations
      const { data: rposData, error: rpoError } = await supabase
        .from("raw_purchase_orders")
        .select(`
          *,
          suppliers(name),
          work_orders(wo_id),
          sales_orders(so_id)
        `)
        .order("created_at", { ascending: false });

      if (rpoError) throw rpoError;

      // Load suppliers
      const { data: suppliersData, error: supError } = await supabase
        .from("suppliers")
        .select("id, name")
        .order("name");

      if (supError) throw supError;

      // Load master data for dropdowns
      const [gradesRes, sizesRes, shapesRes] = await Promise.all([
        supabase.from("material_grades").select("id, name, category").order("name"),
        supabase.from("nominal_sizes").select("id, size_value, display_label").order("size_value"),
        supabase.from("cross_section_shapes").select("id, name").order("name")
      ]);

      setRpos(rposData || []);
      setSuppliers(suppliersData || []);
      setMaterialGrades(gradesRes.data || []);
      setNominalSizes(sizesRes.data || []);
      setCrossSectionShapes(shapesRes.data || []);
    } catch (error: any) {
      console.error("Error loading data:", error);
      toast({ variant: "destructive", description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const loadRPODetail = async (rpoNo: string) => {
    const rpo = rpos.find(r => r.rpo_no === rpoNo);
    if (rpo) {
      setSelectedRPO(rpo);
      setDetailView(true);
      populateEditForm(rpo);
      await loadReconciliationsAndReceipts(rpo.id);
    }
  };

  const loadReconciliationsAndReceipts = async (rpoId: string) => {
    try {
      const { data: recons, error: recError } = await supabase
        .from("raw_po_reconciliations")
        .select("*")
        .eq("rpo_id", rpoId)
        .order("created_at", { ascending: false });

      const { data: recs, error: recpError } = await supabase
        .from("raw_po_receipts")
        .select("*")
        .eq("rpo_id", rpoId)
        .order("received_date", { ascending: false });

      if (recError) throw recError;
      if (recpError) throw recpError;

      setReconciliations(recons || []);
      setReceipts(recs || []);
    } catch (error: any) {
      console.error("Error loading reconciliations/receipts:", error);
    }
  };

  const populateEditForm = (rpo: RPO) => {
    setEditForm({
      supplier_id: rpo.supplier_id || "",
      item_code: rpo.item_code || "",
      material_size_mm: rpo.material_size_mm || "",
      cross_section_shape: "", // RPO doesn't store shape separately, extracted from size string
      alloy: rpo.alloy || "",
      qty_ordered_kg: rpo.qty_ordered_kg?.toString() || "",
      rate_per_kg: rpo.rate_per_kg?.toString() || "",
      expected_delivery_date: rpo.expected_delivery_date || "",
      remarks: rpo.remarks || ""
    });
  };

  const handleApprove = async (rpo: RPO) => {
    // Validation
    if (!rpo.supplier_id) {
      toast({ variant: "destructive", description: "Cannot approve: Supplier is required" });
      return;
    }
    if (!rpo.rate_per_kg || rpo.rate_per_kg <= 0) {
      toast({ variant: "destructive", description: "Cannot approve: Rate per kg must be greater than 0" });
      return;
    }
    if (!rpo.qty_ordered_kg || rpo.qty_ordered_kg <= 0) {
      toast({ variant: "destructive", description: "Cannot approve: Quantity must be greater than 0" });
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("raw_purchase_orders")
        .update({
          status: "approved",
          approved_by: user.id,
          approved_at: new Date().toISOString()
        })
        .eq("id", rpo.id);

      if (error) throw error;

      toast({ title: "Success", description: `RPO ${rpo.rpo_no} approved` });
      loadData();
      if (selectedRPO?.id === rpo.id) {
        setDetailView(false);
        setSelectedRPO(null);
      }
    } catch (error: any) {
      console.error("Error approving RPO:", error);
      toast({ variant: "destructive", description: error.message });
    }
  };

  const handleSaveEdit = async () => {
    if (!selectedRPO) return;

    // Validation
    if (!editForm.supplier_id) {
      toast({ variant: "destructive", description: "Supplier is required" });
      return;
    }
    if (!editForm.rate_per_kg || parseFloat(editForm.rate_per_kg) <= 0) {
      toast({ variant: "destructive", description: "Rate per kg must be greater than 0" });
      return;
    }
    if (!editForm.qty_ordered_kg || parseFloat(editForm.qty_ordered_kg) <= 0) {
      toast({ variant: "destructive", description: "Quantity must be greater than 0" });
      return;
    }

    try {
      const qty = parseFloat(editForm.qty_ordered_kg);
      const rate = parseFloat(editForm.rate_per_kg);

      const { error } = await supabase
        .from("raw_purchase_orders")
        .update({
          supplier_id: editForm.supplier_id,
          item_code: editForm.item_code,
          material_size_mm: editForm.material_size_mm,
          alloy: editForm.alloy,
          qty_ordered_kg: qty,
          rate_per_kg: rate,
          amount_ordered: qty * rate,
          expected_delivery_date: editForm.expected_delivery_date || null,
          remarks: editForm.remarks
        })
        .eq("id", selectedRPO.id);

      if (error) throw error;

      toast({ title: "Success", description: "RPO updated successfully" });
      setEditMode(false);
      loadData();
      // Refresh detail view
      const { data: updated } = await supabase
        .from("raw_purchase_orders")
        .select(`*, suppliers(name), work_orders(wo_id), sales_orders(so_id)`)
        .eq("id", selectedRPO.id)
        .single();
      
      if (updated) {
        setSelectedRPO(updated);
        populateEditForm(updated);
      }
    } catch (error: any) {
      console.error("Error updating RPO:", error);
      toast({ variant: "destructive", description: error.message });
    }
  };

  const handleReceiveMaterial = (rpo: RPO) => {
    // Navigate to Material Inwards with pre-filled data
    navigate(`/material-inwards?rpo_id=${rpo.id}&rpo_no=${rpo.rpo_no}`);
  };

  const handleMarkResolved = async (reconId: string, resolution: string, resolutionRef: string, notes: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Validate resolution type
      const validResolutions = ["pending", "credit_note", "debit_note", "price_adjustment"];
      if (!validResolutions.includes(resolution)) {
        throw new Error("Invalid resolution type");
      }

      const { error } = await supabase
        .from("raw_po_reconciliations")
        .update({
          resolution: resolution as "pending" | "credit_note" | "debit_note" | "price_adjustment",
          resolution_ref: resolutionRef || null,
          notes: notes || null,
          resolved_by: user.id,
          resolved_at: new Date().toISOString()
        })
        .eq("id", reconId);

      if (error) throw error;

      toast({ title: "Success", description: "Reconciliation marked as resolved" });
      if (selectedRPO) {
        await loadReconciliationsAndReceipts(selectedRPO.id);
      }
    } catch (error: any) {
      console.error("Error resolving reconciliation:", error);
      toast({ variant: "destructive", description: error.message });
    }
  };

  const exportReconciliationPDF = () => {
    if (!selectedRPO) return;

    const doc = new jsPDF();
    let yPos = 20;

    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("Purchase Order Reconciliation Report", 105, yPos, { align: "center" });
    yPos += 10;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`RPO No: ${selectedRPO.rpo_no}`, 20, yPos);
    yPos += 6;
    doc.text(`Supplier: ${selectedRPO.suppliers?.name || "N/A"}`, 20, yPos);
    yPos += 6;
    doc.text(`Item: ${selectedRPO.item_code} - ${selectedRPO.alloy} - ${selectedRPO.material_size_mm}mm`, 20, yPos);
    yPos += 10;

    // Summary section
    doc.setFont("helvetica", "bold");
    doc.text("Order Summary:", 20, yPos);
    yPos += 6;
    doc.setFont("helvetica", "normal");

    const totalReceived = receipts.reduce((sum, r) => sum + r.qty_received_kg, 0);
    const totalInvoiced = receipts.reduce((sum, r) => sum + (r.qty_received_kg * (r.rate_on_invoice || 0)), 0);

    doc.text(`Ordered Qty: ${selectedRPO.qty_ordered_kg.toFixed(3)} kg @ ₹${selectedRPO.rate_per_kg.toFixed(2)}/kg = ₹${selectedRPO.amount_ordered.toFixed(2)}`, 20, yPos);
    yPos += 6;
    doc.text(`Received Qty: ${totalReceived.toFixed(3)} kg`, 20, yPos);
    yPos += 6;
    doc.text(`Invoiced Amount: ₹${totalInvoiced.toFixed(2)}`, 20, yPos);
    yPos += 10;

    // Receipts table
    if (receipts.length > 0) {
      const receiptData = receipts.map(r => [
        r.received_date,
        r.qty_received_kg.toFixed(3),
        r.rate_on_invoice?.toFixed(2) || "N/A",
        (r.qty_received_kg * (r.rate_on_invoice || 0)).toFixed(2),
        r.supplier_invoice_no || "N/A"
      ]);

      autoTable(doc, {
        startY: yPos,
        head: [["Date", "Qty (kg)", "Rate", "Amount", "Invoice No"]],
        body: receiptData,
        theme: "grid",
        headStyles: { fillColor: [66, 66, 66] },
      });

      yPos = (doc as any).lastAutoTable.finalY + 10;
    }

    // Variances table
    if (reconciliations.length > 0) {
      doc.setFont("helvetica", "bold");
      doc.text("Variances:", 20, yPos);
      yPos += 6;

      const varianceData = reconciliations.map(r => [
        r.reason.replace(/_/g, " ").toUpperCase(),
        r.qty_delta_kg?.toFixed(3) || "N/A",
        r.rate_delta?.toFixed(2) || "N/A",
        r.amount_delta?.toFixed(2) || "N/A",
        r.resolution.replace(/_/g, " ").toUpperCase(),
        r.resolution_ref || "-"
      ]);

      autoTable(doc, {
        startY: yPos,
        head: [["Type", "Qty Δ (kg)", "Rate Δ", "Amount Δ", "Resolution", "Ref"]],
        body: varianceData,
        theme: "grid",
        headStyles: { fillColor: [66, 66, 66] },
      });
    }

    doc.save(`RPO_${selectedRPO.rpo_no}_Reconciliation.pdf`);
  };

  const filteredRPOs = rpos.filter(rpo => rpo.status === selectedTab);

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: any; className?: string }> = {
      draft: { variant: "outline" },
      pending_approval: { variant: "secondary", className: "bg-amber-100 text-amber-700 dark:bg-amber-950" },
      approved: { variant: "default", className: "bg-green-600" },
      part_received: { variant: "default", className: "bg-blue-600" },
      closed: { variant: "default", className: "bg-gray-600" },
      cancelled: { variant: "destructive" }
    };

    const config = variants[status] || { variant: "outline" };
    return (
      <Badge variant={config.variant} className={config.className}>
        {status.replace(/_/g, " ").toUpperCase()}
      </Badge>
    );
  };

  if (detailView && selectedRPO) {
    return (
      <div className="min-h-screen bg-background">
        <NavigationHeader 
          title={`RPO: ${selectedRPO.rpo_no}`} 
          subtitle={`Status: ${selectedRPO.status}`}
        />
        
        <div className="p-6 pb-0">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/" className="flex items-center gap-1">
                  <Home className="h-4 w-4" />
                  Home
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink onClick={() => { setDetailView(false); setSelectedRPO(null); setEditMode(false); }} className="cursor-pointer">
                  Raw Purchase Orders
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{selectedRPO.rpo_no}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>

        <div className="p-6">
          <Button variant="ghost" onClick={() => { setDetailView(false); setSelectedRPO(null); setEditMode(false); }} className="mb-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to List
          </Button>

          {/* Header with WO/SO Context */}
          <Card className="mb-6">
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-2xl">{selectedRPO.rpo_no}</CardTitle>
                  <div className="flex gap-4 mt-2 text-sm text-muted-foreground">
                    {selectedRPO.work_orders && (
                      <div>WO: <Badge variant="secondary">{selectedRPO.work_orders.wo_id}</Badge></div>
                    )}
                    {selectedRPO.sales_orders && (
                      <div>SO: <Badge variant="outline">{selectedRPO.sales_orders.so_id}</Badge></div>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  {selectedRPO.status === "draft" && !editMode && (
                    <Button variant="outline" onClick={() => setEditMode(true)}>
                      <Edit className="mr-2 h-4 w-4" />
                      Edit
                    </Button>
                  )}
                  {selectedRPO.status === "pending_approval" && (
                    <Button onClick={() => handleApprove(selectedRPO)}>
                      <CheckCircle className="mr-2 h-4 w-4" />
                      Approve
                    </Button>
                  )}
                  {selectedRPO.status === "approved" && (
                    <Button onClick={() => handleReceiveMaterial(selectedRPO)}>
                      <PackagePlus className="mr-2 h-4 w-4" />
                      Receive Material
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground">Supplier</Label>
                  {editMode ? (
                    <Select value={editForm.supplier_id} onValueChange={(v) => setEditForm({...editForm, supplier_id: v})}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {suppliers.map(s => (
                          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="font-medium">{selectedRPO.suppliers?.name || "N/A"}</p>
                  )}
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Item Code</Label>
                  {editMode ? (
                    <Input value={editForm.item_code} onChange={(e) => setEditForm({...editForm, item_code: e.target.value})} />
                  ) : (
                    <p className="font-medium">{selectedRPO.item_code}</p>
                  )}
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Size (mm)</Label>
                  {editMode ? (
                    <Select value={editForm.material_size_mm} onValueChange={(v) => setEditForm({...editForm, material_size_mm: v})}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select size" />
                      </SelectTrigger>
                      <SelectContent>
                        {nominalSizes.map(s => (
                          <SelectItem key={s.id} value={s.display_label || `${s.size_value}mm`}>
                            {s.display_label || `${s.size_value} mm`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="font-medium">{selectedRPO.material_size_mm}</p>
                  )}
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Material Grade</Label>
                  {editMode ? (
                    <Select value={editForm.alloy} onValueChange={(v) => setEditForm({...editForm, alloy: v})}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select grade" />
                      </SelectTrigger>
                      <SelectContent>
                        {materialGrades.map(g => (
                          <SelectItem key={g.id} value={g.name}>
                            {g.name} {g.category ? `(${g.category})` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="font-medium">{selectedRPO.alloy}</p>
                  )}
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Qty Ordered (kg)</Label>
                  {editMode ? (
                    <Input type="number" step="0.001" value={editForm.qty_ordered_kg} onChange={(e) => setEditForm({...editForm, qty_ordered_kg: e.target.value})} />
                  ) : (
                    <p className="font-medium">{selectedRPO.qty_ordered_kg.toFixed(3)}</p>
                  )}
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Rate per kg</Label>
                  {editMode && selectedRPO.status === "draft" ? (
                    <Input type="number" step="0.01" value={editForm.rate_per_kg} onChange={(e) => setEditForm({...editForm, rate_per_kg: e.target.value})} />
                  ) : (
                    <>
                      <p className="font-medium">₹{selectedRPO.rate_per_kg.toFixed(2)}</p>
                      {selectedRPO.status !== "draft" && <p className="text-xs text-muted-foreground">🔒 Frozen on approval</p>}
                    </>
                  )}
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Total Amount</Label>
                  <p className="font-medium">₹{selectedRPO.amount_ordered.toFixed(2)}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Expected Delivery</Label>
                  {editMode ? (
                    <Input type="date" value={editForm.expected_delivery_date} onChange={(e) => setEditForm({...editForm, expected_delivery_date: e.target.value})} />
                  ) : (
                    <p className="font-medium">{selectedRPO.expected_delivery_date ? new Date(selectedRPO.expected_delivery_date).toLocaleDateString() : "N/A"}</p>
                  )}
                </div>
              </div>

              {editMode ? (
                <div className="mt-4">
                  <Label className="text-xs text-muted-foreground">Remarks</Label>
                  <Textarea value={editForm.remarks} onChange={(e) => setEditForm({...editForm, remarks: e.target.value})} rows={3} />
                  <div className="flex gap-2 mt-4">
                    <Button onClick={handleSaveEdit}>Save Changes</Button>
                    <Button variant="outline" onClick={() => { setEditMode(false); populateEditForm(selectedRPO); }}>Cancel</Button>
                  </div>
                </div>
              ) : selectedRPO.remarks && (
                <div className="mt-4">
                  <Label className="text-xs text-muted-foreground">Remarks</Label>
                  <p className="text-sm">{selectedRPO.remarks}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Tabs for Overview/Reconciliation */}
          <Tabs value={detailTab} onValueChange={setDetailTab}>
            <TabsList className="mb-4">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="reconciliation">
                Reconciliation
                {reconciliations.filter(r => r.resolution === "pending").length > 0 && (
                  <Badge variant="destructive" className="ml-2">
                    {reconciliations.filter(r => r.resolution === "pending").length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview">
              {/* Timeline */}
              <Card>
                <CardHeader>
                  <CardTitle>Timeline</CardTitle>
                </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full bg-blue-600"></div>
                    <div className="w-0.5 h-full bg-border"></div>
                  </div>
                  <div className="pb-4">
                    <p className="font-medium">Created</p>
                    <p className="text-sm text-muted-foreground">{new Date(selectedRPO.created_at).toLocaleString()}</p>
                  </div>
                </div>

                {selectedRPO.status !== "draft" && (
                  <div className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div className="w-3 h-3 rounded-full bg-amber-600"></div>
                      <div className="w-0.5 h-full bg-border"></div>
                    </div>
                    <div className="pb-4">
                      <p className="font-medium">Submitted for Approval</p>
                      <p className="text-sm text-muted-foreground">{new Date(selectedRPO.updated_at).toLocaleString()}</p>
                    </div>
                  </div>
                )}

                {selectedRPO.approved_at && (
                  <div className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div className="w-3 h-3 rounded-full bg-green-600"></div>
                      {(selectedRPO.status === "part_received" || selectedRPO.status === "closed") && <div className="w-0.5 h-full bg-border"></div>}
                    </div>
                    <div className="pb-4">
                      <p className="font-medium">Approved</p>
                      <p className="text-sm text-muted-foreground">{new Date(selectedRPO.approved_at).toLocaleString()}</p>
                    </div>
                  </div>
                )}

                {/* Receipts timeline */}
                {receipts.map((receipt, idx) => (
                  <div key={receipt.id} className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div className="w-3 h-3 rounded-full bg-purple-600"></div>
                      {idx < receipts.length - 1 && <div className="w-0.5 h-full bg-border"></div>}
                    </div>
                    <div className="pb-4">
                      <p className="font-medium">Material Received</p>
                      <p className="text-sm text-muted-foreground">
                        {new Date(receipt.received_date).toLocaleDateString()} - {receipt.qty_received_kg.toFixed(3)} kg
                        {receipt.supplier_invoice_no && ` (Invoice: ${receipt.supplier_invoice_no})`}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
            </TabsContent>

            <TabsContent value="reconciliation">
              <div className="space-y-4">
                {/* Reconciliation Banner */}
                {reconciliations.filter(r => r.resolution === "pending").length > 0 && (
                  <Card className="border-amber-600 bg-amber-50 dark:bg-amber-950">
                    <CardContent className="p-4">
                      <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                        ⚠️ {reconciliations.filter(r => r.resolution === "pending").length} outstanding variance(s) require resolution
                      </p>
                    </CardContent>
                  </Card>
                )}

                {/* Export Button */}
                <div className="flex justify-end">
                  <Button variant="outline" onClick={exportReconciliationPDF}>
                    <Download className="mr-2 h-4 w-4" />
                    Export PDF
                  </Button>
                </div>

                {/* Reconciliations Table */}
                <Card>
                  <CardHeader>
                    <CardTitle>Variances</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {reconciliations.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-8">No variances recorded</p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Type</TableHead>
                            <TableHead>Qty Δ (kg)</TableHead>
                            <TableHead>Rate Δ</TableHead>
                            <TableHead>Amount Δ</TableHead>
                            <TableHead>Resolution</TableHead>
                            <TableHead>Ref</TableHead>
                            <TableHead>Notes</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {reconciliations.map((recon) => (
                            <ReconciliationRow 
                              key={recon.id} 
                              reconciliation={recon} 
                              onMarkResolved={handleMarkResolved} 
                            />
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <NavigationHeader title="Raw Purchase Orders" subtitle="Manage raw material procurement" />
      
      <div className="p-6 pb-0">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/" className="flex items-center gap-1">
                <Home className="h-4 w-4" />
                Home
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Raw Purchase Orders</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      <div className="p-6">
        <Tabs value={selectedTab} onValueChange={setSelectedTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="draft">Draft</TabsTrigger>
            <TabsTrigger value="pending_approval">Pending Approval</TabsTrigger>
            <TabsTrigger value="approved">Approved</TabsTrigger>
            <TabsTrigger value="part_received">Part Received</TabsTrigger>
            <TabsTrigger value="closed">Closed</TabsTrigger>
            <TabsTrigger value="cancelled">Cancelled</TabsTrigger>
          </TabsList>

          <TabsContent value={selectedTab}>
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>RPO No</TableHead>
                      <TableHead>WO</TableHead>
                      <TableHead>Item Code</TableHead>
                      <TableHead>Size (mm)</TableHead>
                      <TableHead>Material Grade</TableHead>
                      <TableHead>Supplier</TableHead>
                      <TableHead>Qty Ordered (kg)</TableHead>
                      <TableHead>Rate</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Expected Date</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={11} className="text-center">Loading...</TableCell>
                      </TableRow>
                    ) : filteredRPOs.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={11} className="text-center text-muted-foreground">
                          No {selectedTab.replace(/_/g, " ")} RPOs found
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredRPOs.map((rpo) => (
                        <TableRow key={rpo.id} className="cursor-pointer hover:bg-accent" onClick={() => { setSelectedRPO(rpo); setDetailView(true); populateEditForm(rpo); }}>
                          <TableCell className="font-medium">{rpo.rpo_no}</TableCell>
                          <TableCell>
                            {rpo.work_orders ? (
                              <Badge variant="secondary">{rpo.work_orders.wo_id}</Badge>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell>{rpo.item_code}</TableCell>
                          <TableCell>{rpo.material_size_mm}</TableCell>
                          <TableCell>{rpo.alloy}</TableCell>
                          <TableCell>{rpo.suppliers?.name || "N/A"}</TableCell>
                          <TableCell>{rpo.qty_ordered_kg.toFixed(3)}</TableCell>
                          <TableCell>₹{rpo.rate_per_kg.toFixed(2)}</TableCell>
                          <TableCell>₹{rpo.amount_ordered.toFixed(2)}</TableCell>
                          <TableCell>
                            {rpo.expected_delivery_date 
                              ? new Date(rpo.expected_delivery_date).toLocaleDateString() 
                              : <span className="text-muted-foreground">-</span>
                            }
                          </TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            {selectedTab === "pending_approval" && (
                              <Button size="sm" onClick={() => handleApprove(rpo)}>
                                Approve
                              </Button>
                            )}
                            {selectedTab === "approved" && (
                              <Button size="sm" variant="outline" onClick={() => handleReceiveMaterial(rpo)}>
                                Receive
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
