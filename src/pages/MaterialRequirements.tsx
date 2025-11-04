import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Download, FileSpreadsheet, ShoppingCart } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { NavigationHeader } from "@/components/NavigationHeader";
import { RPOModal } from "@/components/RPOModal";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Home } from "lucide-react";

interface MaterialRequirement {
  material_size_mm: string;
  alloy: string;
  total_pcs: number;
  total_gross_weight_kg: number;
  total_net_weight_kg: number;
  inventory_gross_kg: number;
  inventory_net_kg: number;
  surplus_deficit_kg: number;
  last_gi_reference: string | null;
  last_gi_date: string | null;
  linked_sales_orders: Array<{
    so_id: string;
    customer: string;
    pcs: number;
    id: string;
  }>;
  linked_work_orders: Array<{
    wo_id: string;
    id: string;
    item_code: string;
  }>;
  procurement_status: "none" | "draft" | "pending_approval" | "approved" | "part_received";
  rpo_no?: string | null;
}

export default function MaterialRequirements() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [requirements, setRequirements] = useState<MaterialRequirement[]>([]);
  const [filterCustomer, setFilterCustomer] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterDueDate, setFilterDueDate] = useState("");
  const [filterSupplier, setFilterSupplier] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterSize, setFilterSize] = useState<string>("");
  const [customers, setCustomers] = useState<string[]>([]);
  const [suppliers, setSuppliers] = useState<string[]>([]);
  const [session, setSession] = useState<any>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [debug, setDebug] = useState<{ approved: number; grouped: number; inventory: number; error: string }>({ approved: 0, grouped: 0, inventory: 0, error: "" });
  const [rpoModalOpen, setRpoModalOpen] = useState(false);
  const [selectedRequirement, setSelectedRequirement] = useState<MaterialRequirement | null>(null);

  // Normalize and format material size values like "20 hex" / "hex 20" / "20" → "20 HEX" or "20 mm"
  const normalizeSize = (raw: any): string => {
    if (!raw) return "";
    const s = String(raw).trim();
    // Extract numeric and textual parts regardless of order
    const numMatch = s.match(/\d+(?:\.\d+)?/);
    const textMatch = s.match(/[a-zA-Z]+/g);
    const num = numMatch ? numMatch[0] : "";
    const text = textMatch ? textMatch.join(" ").toUpperCase() : "";
    if (num && text) return `${num} ${text}`;
    if (num) return `${num} mm`;
    return s.toUpperCase();
  };

  useEffect(() => {
    // Auth: set up listener FIRST, then check existing session
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setSessionChecked(true);
      if (nextSession) {
        setLoading(true);
        // Defer data load to avoid doing async work inside the callback
        setTimeout(() => {
          loadRequirements();
        }, 0);
      } else {
        setLoading(false);
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setSessionChecked(true);
      if (session) {
        setLoading(true);
        loadRequirements();
      } else {
        setLoading(false);
      }
    });
    
    // Set up realtime subscriptions
    const channel = supabase
      .channel('material-requirements-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_orders' }, () => {
        console.log('Work orders updated - refreshing requirements');
        loadRequirements();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales_orders' }, () => {
        console.log('Sales orders updated - refreshing requirements');
        loadRequirements();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_lots' }, () => {
        console.log('Inventory lots updated - refreshing requirements');
        loadRequirements();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'raw_purchase_orders' }, () => {
        console.log('Raw purchase orders updated - refreshing requirements');
        loadRequirements();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'suppliers' }, () => {
        console.log('Suppliers updated - refreshing requirements');
        loadRequirements();
      })
      .subscribe((status) => {
        console.log('Material Requirements realtime subscription status:', status);
      });

    return () => {
      subscription.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, []);

  const loadRequirements = async () => {
    setLoading(true);
    try {
      // Fetch WOs that haven't started production (goods_in stage only)
      const { data: workOrders, error: woError } = await supabase
        .from("work_orders")
        .select("id, wo_id, item_code, quantity, gross_weight_per_pc, net_weight_per_pc, material_size_mm, sales_order, current_stage, financial_snapshot")
        .eq("current_stage", "goods_in");

      if (woError) throw woError;

      // Fetch related SOs
      const soIds = [...new Set(workOrders?.map(wo => wo.sales_order).filter(Boolean))];
      
      // Filter out invalid UUIDs (must be valid UUID format)
      const validSoIds = soIds.filter(id => {
        if (!id) return false;
        // UUID format: 8-4-4-4-12 hexadecimal characters
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        return uuidRegex.test(id);
      });
      
      let salesOrders = [];
      if (validSoIds.length > 0) {
        const { data, error: soError } = await supabase
          .from("sales_orders")
          .select("id, so_id, customer")
          .in("id", validSoIds);

        if (soError) throw soError;
        salesOrders = data || [];
      }

      // Fetch inventory from inventory_lots
      const { data: inventoryLots, error: invError } = await supabase
        .from("inventory_lots")
        .select("*");

      if (invError) throw invError;

      // Fetch all RPOs
      const { data: rpos, error: rpoError } = await supabase
        .from("raw_purchase_orders")
        .select("*")
        .in("status", ["draft", "pending_approval", "approved", "part_received"]);

      if (rpoError) throw rpoError;

      // Group by size/alloy
      const grouped = new Map<string, MaterialRequirement>();

      // Process WOs for requirements (only if no approved RPO exists)
      for (const wo of workOrders || []) {
        const size = normalizeSize(wo.material_size_mm);
        const alloy = (wo.financial_snapshot as any)?.line_item?.alloy || "";
        const key = `${size}-${alloy}`;

        // Check if approved RPO exists for this WO
        const hasApprovedRPO = rpos?.some(
          rpo => rpo.wo_id === wo.id && rpo.status === "approved"
        );

        if (hasApprovedRPO) continue; // Skip this WO

        if (!grouped.has(key)) {
          grouped.set(key, {
            material_size_mm: size,
            alloy,
            total_pcs: 0,
            total_gross_weight_kg: 0,
            total_net_weight_kg: 0,
            inventory_gross_kg: 0,
            inventory_net_kg: 0,
            surplus_deficit_kg: 0,
            last_gi_reference: null,
            last_gi_date: null,
            linked_sales_orders: [],
            linked_work_orders: [],
            procurement_status: "none"
          });
        }

        const req = grouped.get(key)!;
        req.total_pcs += wo.quantity;
        req.total_gross_weight_kg += (wo.quantity * (wo.gross_weight_per_pc || 0)) / 1000;
        req.total_net_weight_kg += (wo.quantity * (wo.net_weight_per_pc || 0)) / 1000;

        req.linked_work_orders.push({
          wo_id: wo.wo_id,
          id: wo.id,
          item_code: wo.item_code
        });

        // Find related SO
        const relatedSO = salesOrders?.find(so => so.id === wo.sales_order);
        if (relatedSO && !req.linked_sales_orders.find(s => s.id === relatedSO.id)) {
          req.linked_sales_orders.push({
            so_id: relatedSO.so_id,
            customer: relatedSO.customer,
            pcs: 0,
            id: relatedSO.id
          });
        }
      }

      // Add inventory data
      for (const lot of inventoryLots || []) {
        const size = normalizeSize(lot.material_size_mm);
        const alloy = lot.alloy || "";
        const key = `${size}-${alloy}`;

        if (!grouped.has(key)) {
          grouped.set(key, {
            material_size_mm: size,
            alloy,
            total_pcs: 0,
            total_gross_weight_kg: 0,
            total_net_weight_kg: 0,
            inventory_gross_kg: 0,
            inventory_net_kg: 0,
            surplus_deficit_kg: 0,
            last_gi_reference: lot.lot_id,
            last_gi_date: new Date(lot.received_date).toLocaleDateString(),
            linked_sales_orders: [],
            linked_work_orders: [],
            procurement_status: "none"
          });
        }

        const req = grouped.get(key)!;
        req.inventory_gross_kg += Number(lot.qty_kg || 0);
        req.last_gi_reference = lot.lot_id;
        req.last_gi_date = new Date(lot.received_date).toLocaleDateString();
      }

      // Calculate surplus/deficit and procurement status
      for (const [key, req] of grouped.entries()) {
        req.surplus_deficit_kg = req.inventory_gross_kg - req.total_gross_weight_kg;

        // Find RPO for this size/alloy
        const relatedRPO = rpos?.find(
          rpo => normalizeSize(rpo.material_size_mm) === req.material_size_mm && 
                 (rpo.alloy === req.alloy || (!rpo.alloy && !req.alloy))
        );

        if (relatedRPO) {
          if (relatedRPO.status === "draft") {
            req.procurement_status = "draft";
          } else if (relatedRPO.status === "pending_approval") {
            req.procurement_status = "pending_approval";
          } else if (relatedRPO.status === "approved") {
            req.procurement_status = "approved";
          } else if (relatedRPO.status === "part_received") {
            req.procurement_status = "part_received";
          }
          req.rpo_no = relatedRPO.rpo_no;
        }
      }

      const requirementsArray = Array.from(grouped.values());
      setRequirements(requirementsArray);
      setDebug({
        approved: workOrders?.length || 0,
        grouped: requirementsArray.length,
        inventory: inventoryLots?.length || 0,
        error: ""
      });
    } catch (err: any) {
      setDebug({ approved: 0, grouped: 0, inventory: 0, error: err?.message || String(err) });
      toast({ variant: "destructive", description: `Failed to load: ${err?.message || err}` });
    } finally {
      setLoading(false);
    }
  };

  const handlePlaceOrder = (req: MaterialRequirement) => {
    setSelectedRequirement(req);
    setRpoModalOpen(true);
  };

  const checkExistingRPO = (req: MaterialRequirement): { hasDraft: boolean; rpoNo: string | null } => {
    // Check if a draft or pending_approval RPO exists for the same size/alloy with matching WO
    const existingRPO = requirements.find(r => 
      r.material_size_mm === req.material_size_mm && 
      r.alloy === req.alloy &&
      (r.procurement_status === 'draft' || r.procurement_status === 'pending_approval') &&
      r.linked_work_orders.some(wo => req.linked_work_orders.some(rwo => rwo.id === wo.id))
    );
    
    return {
      hasDraft: !!existingRPO,
      rpoNo: existingRPO?.rpo_no || null
    };
  };

  const exportToExcel = async () => {
    const data = filteredRequirements.map(req => ({
      "Raw Material Size (mm)": req.material_size_mm,
      "Alloy": req.alloy,
      "Requirement Gross (kg)": req.total_gross_weight_kg.toFixed(2),
      "Requirement Net (kg)": req.total_net_weight_kg.toFixed(2),
      "Requirement (pcs)": req.total_pcs,
      "Inventory Gross (kg)": req.inventory_gross_kg.toFixed(2),
      "Inventory Net (kg)": req.inventory_net_kg.toFixed(2),
      "Surplus/Deficit (kg)": req.surplus_deficit_kg.toFixed(2),
      "Linked Sales Orders": req.linked_sales_orders.map(so => so.so_id).join(", "),
      "Linked Work Orders": req.linked_work_orders.map(wo => wo.wo_id).join(", "),
      "Last GI Reference": req.last_gi_reference || "N/A",
      "Last GI Date": req.last_gi_date || "N/A",
      "Procurement Status": req.procurement_status,
      "RPO No": req.rpo_no || "N/A"
    }));

    const XLSX = await import("xlsx");
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Material Requirements");
    XLSX.writeFile(wb, "material_requirements.xlsx");
  };

  const exportToPDF = async () => {
    const { default: jsPDF } = await import("jspdf");
    await import("jspdf-autotable");

    const doc = new jsPDF("landscape");
    
    doc.setFontSize(18);
    doc.text("Raw Material Requirements", 14, 20);
    
    const tableData = filteredRequirements.map(req => [
      req.material_size_mm,
      req.alloy || "N/A",
      `${req.total_gross_weight_kg.toFixed(2)} kg (${req.total_pcs} pcs)`,
      `${req.inventory_gross_kg.toFixed(2)} kg`,
      `${req.surplus_deficit_kg >= 0 ? '+' : ''}${req.surplus_deficit_kg.toFixed(2)} kg`,
      req.linked_work_orders.map(wo => wo.wo_id).join(", "),
      req.procurement_status,
      req.rpo_no || "N/A"
    ]);

    (doc as any).autoTable({
      head: [["Size", "Alloy", "Requirement", "Inventory", "Surplus/Deficit", "Work Orders", "Status", "RPO"]],
      body: tableData,
      startY: 30,
    });

    doc.save("material_requirements.pdf");
  };

  const filteredRequirements = requirements.filter(req => {
    if (filterSize && filterSize !== "all" && req.material_size_mm !== filterSize) {
      return false;
    }
    if (filterCustomer && filterCustomer !== "all" && !req.linked_sales_orders.some(so => so.customer === filterCustomer)) {
      return false;
    }
    if (filterStatus !== "all") {
      if (filterStatus === "covered" && req.surplus_deficit_kg < 0) return false;
      if (filterStatus === "shortfall" && req.surplus_deficit_kg >= 0) return false;
    }
    return true;
  });

  if (sessionChecked && !session) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>Login Required</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Please log in to view the Raw Material Requirements dashboard.
            </p>
            <Button onClick={() => navigate('/auth')}>Go to Login</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!sessionChecked) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]" role="status">
            <span className="!absolute !-m-px !h-px !w-px !overflow-hidden !whitespace-nowrap !border-0 !p-0 ![clip:rect(0,0,0,0)]">Loading...</span>
          </div>
          <p className="mt-4 text-muted-foreground">Checking session...</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]" role="status">
            <span className="!absolute !-m-px !h-px !w-px !overflow-hidden !whitespace-nowrap !border-0 !p-0 ![clip:rect(0,0,0,0)]">Loading...</span>
          </div>
          <p className="mt-4 text-muted-foreground">Loading material requirements...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <NavigationHeader title="Raw Material Requirements Dashboard" subtitle="Material planning and procurement tracking" />
      
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
              <BreadcrumbPage>Material Requirements</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>
      
      <div className="p-6">
        <div className="flex justify-end gap-2 mb-6">
          <Button onClick={exportToExcel} variant="outline">
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            Export Excel
          </Button>
          <Button onClick={exportToPDF} variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Export PDF
          </Button>
        </div>
      </div>

      <h1 className="text-3xl font-bold mb-2">Raw Material Requirements Dashboard</h1>
      {debug.error ? (
        <div className="mb-4 text-sm text-destructive">Error: {debug.error}</div>
      ) : (
        <p className="mb-4 text-sm text-muted-foreground">
          Approved orders: {debug.approved} • Groups: {debug.grouped} • Inventory lots: {debug.inventory}
        </p>
      )}

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Material Size</label>
              <Select value={filterSize} onValueChange={setFilterSize}>
                <SelectTrigger>
                  <SelectValue placeholder="All Sizes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sizes</SelectItem>
                  {[...new Set(requirements.map(r => r.material_size_mm))].filter(Boolean).map(size => (
                    <SelectItem key={size} value={size.toString()}>{size} mm</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Customer</label>
              <Select value={filterCustomer} onValueChange={setFilterCustomer}>
                <SelectTrigger>
                  <SelectValue placeholder="All Customers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Customers</SelectItem>
                  {customers.filter(c => c && c.trim()).map(customer => (
                    <SelectItem key={customer} value={customer}>{customer}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Supplier</label>
              <Select value={filterSupplier} onValueChange={setFilterSupplier}>
                <SelectTrigger>
                  <SelectValue placeholder="All Suppliers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Suppliers</SelectItem>
                  {suppliers.filter(s => s && s.trim()).map(supplier => (
                    <SelectItem key={supplier} value={supplier}>{supplier}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Status</label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="covered">✓ Covered</SelectItem>
                  <SelectItem value="shortfall">⚠ Shortfall</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Date Range</label>
              <div className="flex gap-2">
                <Input
                  type="date"
                  value={filterDateFrom}
                  onChange={(e) => setFilterDateFrom(e.target.value)}
                  placeholder="From"
                  className="text-xs"
                />
                <Input
                  type="date"
                  value={filterDateTo}
                  onChange={(e) => setFilterDateTo(e.target.value)}
                  placeholder="To"
                  className="text-xs"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Size (mm) / Alloy</TableHead>
                <TableHead>Requirement (kg)</TableHead>
                <TableHead>Inventory (kg)</TableHead>
                <TableHead>Surplus/Deficit</TableHead>
                <TableHead>Linked SO/WO</TableHead>
                <TableHead>Last GI Ref</TableHead>
                <TableHead>Procurement Status</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center">Loading...</TableCell>
                </TableRow>
              ) : filteredRequirements.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center">No Data Available</TableCell>
                </TableRow>
              ) : (
                filteredRequirements.map((req, idx) => (
                  <TableRow key={`${req.material_size_mm}-${req.alloy}-${idx}`} className={req.surplus_deficit_kg < 0 ? "bg-destructive/5" : "bg-green-50/50 dark:bg-green-950/20"}>
                    <TableCell>
                      <div className="font-bold">{req.material_size_mm}</div>
                      {req.alloy && <div className="text-xs text-muted-foreground">{req.alloy}</div>}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <div className="font-medium">{req.total_gross_weight_kg.toFixed(2)} kg</div>
                        <div className="text-xs text-muted-foreground">{req.total_pcs} pcs</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <div className="font-medium">{req.inventory_gross_kg.toFixed(2)} kg</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={req.surplus_deficit_kg >= 0 ? "default" : "destructive"} className={req.surplus_deficit_kg >= 0 ? "bg-green-600" : ""}>
                        {req.surplus_deficit_kg >= 0 ? '+' : ''}{req.surplus_deficit_kg.toFixed(2)} kg
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <div className="flex flex-wrap gap-1">
                          {req.linked_sales_orders.map((so) => (
                            <Badge key={so.id} variant="outline" className="text-xs cursor-pointer hover:bg-accent" onClick={() => navigate(`/sales?so_id=${so.so_id}`)}>
                              {so.so_id}
                            </Badge>
                          ))}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {req.linked_work_orders.map((wo) => (
                            <Badge key={wo.id} variant="secondary" className="text-xs cursor-pointer hover:bg-secondary/80" onClick={() => navigate(`/work-order/${wo.id}`)}>
                              {wo.wo_id}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-xs">
                        {req.last_gi_reference ? (
                          <>
                            <div className="font-medium">{req.last_gi_reference}</div>
                            <div className="text-muted-foreground">{req.last_gi_date}</div>
                          </>
                        ) : (
                          <span className="text-muted-foreground">No GI</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {req.procurement_status === "none" ? (
                        <Badge variant="outline">None</Badge>
                      ) : req.procurement_status === "draft" ? (
                        <Badge variant="secondary" className="bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                          Draft RPO: {req.rpo_no}
                        </Badge>
                      ) : req.procurement_status === "pending_approval" ? (
                        <Badge variant="secondary" className="bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                          Pending: {req.rpo_no}
                        </Badge>
                      ) : req.procurement_status === "approved" ? (
                        <Badge variant="default" className="bg-green-600">
                          Approved: {req.rpo_no}
                        </Badge>
                      ) : req.procurement_status === "part_received" ? (
                        <Badge variant="default" className="bg-purple-600">
                          Part Received: {req.rpo_no}
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      {(() => {
                        const { hasDraft, rpoNo } = checkExistingRPO(req);
                        if (hasDraft && rpoNo) {
                          return (
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="cursor-pointer" onClick={() => navigate(`/purchase/rpo?tab=${req.procurement_status === 'draft' ? 'draft' : 'pending_approval'}`)}>
                                {req.procurement_status === 'draft' ? 'Draft RPO' : 'RPO PA'}
                              </Badge>
                              <Button 
                                onClick={() => navigate(`/purchase/rpo?tab=${req.procurement_status === 'draft' ? 'draft' : 'pending_approval'}`)}
                                size="sm"
                                variant="outline"
                              >
                                View {rpoNo}
                              </Button>
                            </div>
                          );
                        }
                        if (req.surplus_deficit_kg < 0 && req.procurement_status === "none") {
                          return (
                            <Button 
                              size="sm" 
                              onClick={() => handlePlaceOrder(req)}
                            >
                              <ShoppingCart className="mr-2 h-4 w-4" />
                              Place Order
                            </Button>
                          );
                        }
                        return null;
                      })()}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          {filteredRequirements.length === 0 && (
            <div className="text-center py-12">
              <p className="text-muted-foreground mb-4">No material requirements found</p>
              <Button onClick={() => navigate('/work-orders/new')} variant="outline">
                Create Work Order
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Total Material Sizes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{filteredRequirements.length}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Total Pieces</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">
              {filteredRequirements.reduce((sum, req) => sum + req.total_pcs, 0)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Total Gross Weight (kg)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">
              {filteredRequirements.reduce((sum, req) => sum + req.total_gross_weight_kg, 0).toFixed(2)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* RPO Modal */}
      {selectedRequirement && (
        <RPOModal
          open={rpoModalOpen}
          onClose={() => {
            setRpoModalOpen(false);
            setSelectedRequirement(null);
          }}
          materialSize={selectedRequirement.material_size_mm}
          deficitKg={Math.abs(selectedRequirement.surplus_deficit_kg)}
          linkedWorkOrders={selectedRequirement.linked_work_orders}
          linkedSalesOrders={selectedRequirement.linked_sales_orders}
          onSuccess={() => {
            loadRequirements();
            toast({ title: "Success", description: "RPO created successfully" });
          }}
        />
      )}
    </div>
  );
}
