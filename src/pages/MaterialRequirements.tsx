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

interface MaterialRequirement {
  material_size_mm: number;
  total_pcs: number;
  total_gross_weight_kg: number;
  total_net_weight_kg: number;
  inventory_pcs: number;
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
  status: string;
  requirement_id?: string;
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
    
    // Set up realtime subscriptions for both sales_orders and material_lots
    const channel = supabase
      .channel('material-requirements-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'sales_orders'
        },
        () => {
          setTimeout(() => loadRequirements(), 0);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'material_lots'
        },
        () => {
          setTimeout(() => loadRequirements(), 0);
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, []);

  const loadRequirements = async () => {
    setLoading(true);

    try {
      // Fetch all approved sales orders
      const { data: salesOrdersRaw, error } = await supabase
        .from("sales_orders")
        .select("*")
        .eq("status", "approved");

      if (error) throw error;

      const salesOrders = salesOrdersRaw ?? [];

      // Fetch all material lots with inventory
      const { data: materialLotsRaw, error: lotsError } = await supabase
        .from("material_lots")
        .select("*")
        .in("status", ["received", "in_use"]);

      if (lotsError) throw lotsError;

      const materialLots = materialLotsRaw ?? [];

      // Extract unique customers and suppliers
      const uniqueCustomers = [...new Set(salesOrders.map((so: any) => so.customer).filter(Boolean))];
      const uniqueSuppliers = [...new Set(materialLots.map((lot: any) => lot.supplier).filter(Boolean))];
      setCustomers(uniqueCustomers);
      setSuppliers(uniqueSuppliers);

      // Group requirements by material size
      const grouped = new Map<number, MaterialRequirement>();

      for (const so of salesOrders as any[]) {
        const size = (so as any).material_rod_forging_size_mm;
        if (!size) continue;

        const items = Array.isArray(so.items) ? so.items : [];
        const totalPcs = items.reduce((sum: number, item: any) => sum + (Number(item.quantity) || 0), 0);

        if (!grouped.has(size)) {
          grouped.set(size, {
            material_size_mm: Number(size),
            total_pcs: 0,
            total_gross_weight_kg: 0,
            total_net_weight_kg: 0,
            inventory_pcs: 0,
            inventory_gross_kg: 0,
            inventory_net_kg: 0,
            surplus_deficit_kg: 0,
            last_gi_reference: null,
            last_gi_date: null,
            linked_sales_orders: [],
            status: "not_ordered"
          });
        }

        const req = grouped.get(size)!;
        req.total_pcs += totalPcs;
        req.total_gross_weight_kg += (totalPcs * Number(so.gross_weight_per_pc_grams || 0)) / 1000;
        req.total_net_weight_kg += (totalPcs * Number(so.net_weight_per_pc_grams || 0)) / 1000;
        req.linked_sales_orders.push({
          so_id: so.so_id,
          customer: so.customer,
          pcs: totalPcs,
          id: so.id
        });
      }

      // Add inventory data from material lots
      const inventoryBySize = new Map<number, { gross: number; net: number; lastLot: any }>();
      
      console.log('[MaterialReq] Processing', materialLots.length, 'material lots');
      
      for (const lot of materialLots as any[]) {
        const size = Number(lot.material_size_mm);
        console.log('[MaterialReq] Lot', lot.lot_id, 'size:', size, 'gross:', lot.gross_weight, 'net:', lot.net_weight);
        if (!size) continue;

        if (!inventoryBySize.has(size)) {
          inventoryBySize.set(size, { gross: 0, net: 0, lastLot: lot });
        }

        const inv = inventoryBySize.get(size)!;
        inv.gross += Number(lot.gross_weight || 0);
        inv.net += Number(lot.net_weight || 0);
        
        // Track most recent lot
        if (new Date(lot.received_date_time) > new Date(inv.lastLot.received_date_time)) {
          inv.lastLot = lot;
        }

        // Add to grouped if size exists in inventory but not in requirements
        if (!grouped.has(size)) {
          grouped.set(size, {
            material_size_mm: size,
            total_pcs: 0,
            total_gross_weight_kg: 0,
            total_net_weight_kg: 0,
            inventory_pcs: 0,
            inventory_gross_kg: 0,
            inventory_net_kg: 0,
            surplus_deficit_kg: 0,
            last_gi_reference: null,
            last_gi_date: null,
            linked_sales_orders: [],
            status: "not_ordered"
          });
        }
      }

      // Merge inventory into requirements - SYNC BY GROSS WEIGHT
      for (const [size, req] of grouped.entries()) {
        const inv = inventoryBySize.get(size);
        if (inv) {
          req.inventory_gross_kg = inv.gross;
          req.inventory_net_kg = inv.net;
          // Calculate surplus/deficit based on GROSS WEIGHT
          req.surplus_deficit_kg = inv.gross - req.total_gross_weight_kg;
          req.last_gi_reference = inv.lastLot.lot_id;
          req.last_gi_date = new Date(inv.lastLot.received_date_time).toLocaleDateString();
        } else {
          // No inventory - deficit equals requirement
          req.surplus_deficit_kg = -req.total_gross_weight_kg;
        }
      }

      // Fetch statuses from material_requirements table
      const { data: statusData, error: statusErr } = await supabase
        .from("material_requirements")
        .select("*");

      if (statusErr) throw statusErr;

      const statusMap = new Map((statusData ?? []).map((s: any) => [Number(s.material_size_mm), { status: s.status, id: s.id }]));

      // Apply statuses and calculate final status
      const requirementsArray = Array.from(grouped.values()).map((req) => ({
        ...req,
        status: req.surplus_deficit_kg >= 0 ? "covered" : "shortfall",
        requirement_id: statusMap.get(req.material_size_mm)?.id
      }));

      setRequirements(requirementsArray);
      setDebug({ 
        approved: salesOrders.length, 
        grouped: requirementsArray.length,
        inventory: materialLots.length,
        error: "" 
      });
    } catch (err: any) {
      setDebug({ approved: 0, grouped: 0, inventory: 0, error: err?.message || String(err) });
      toast({ variant: "destructive", description: `Failed to load dashboard: ${err?.message || err}` });
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (materialSize: number, newStatus: string, requirementId?: string) => {
    if (requirementId) {
      // Update existing
      const { error } = await supabase
        .from("material_requirements")
        .update({ status: newStatus })
        .eq("id", requirementId);

      if (error) {
        toast({ variant: "destructive", description: "Failed to update status" });
        return;
      }
    } else {
      // Create new
      const { error } = await supabase
        .from("material_requirements")
        .insert({ material_size_mm: materialSize, status: newStatus });

      if (error) {
        toast({ variant: "destructive", description: "Failed to update status" });
        return;
      }
    }

    toast({ description: "Status updated successfully" });
    loadRequirements();
  };

  const handlePlaceOrder = async (materialSize: string, requiredQty: number, relatedSOs: string[]) => {
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      // Generate PO number: P-YYYYMMDD-###
      const today = new Date();
      const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
      
      const { data: existingPOs } = await supabase
        .from("purchase_orders")
        .select("po_id")
        .like("po_id", `P-${dateStr}-%`)
        .order("created_at", { ascending: false })
        .limit(1);
      
      const lastNum = existingPOs?.[0]?.po_id?.split('-')[2] || "000";
      const newNum = String(parseInt(lastNum) + 1).padStart(3, '0');
      const newPOId = `P-${dateStr}-${newNum}`;

      // Get full SO data for linked orders
      const { data: linkedSOData } = await supabase
        .from("sales_orders")
        .select("id, so_id, customer, po_number")
        .in("so_id", relatedSOs);

      const linkedSalesOrders = linkedSOData?.map(so => ({
        id: so.id,
        so_id: so.so_id,
        customer: so.customer,
        po_number: so.po_number
      })) || [];

      // Create draft PO with all required fields
      const { error } = await supabase
        .from("purchase_orders")
        .insert({
          po_id: newPOId,
          material_size_mm: materialSize,
          quantity_kg: Math.abs(requiredQty), // Ensure positive quantity
          linked_sales_orders: linkedSalesOrders,
          material_spec: {
            size_mm: materialSize,
            type: "raw_material"
          },
          status: "draft",
          created_by: user.id,
          so_id: linkedSalesOrders[0]?.id || null // Link to first SO for backward compatibility
        });

      if (error) throw error;

      toast({ 
        description: "Purchase order draft created successfully",
        title: `PO ${newPOId} Created`
      });

      // Navigate to Purchase page after a short delay
      setTimeout(() => navigate("/purchase"), 1500);
    } catch (error: any) {
      console.error("Error creating draft PO:", error);
      toast({ 
        variant: "destructive", 
        title: "Failed to Create Purchase Order",
        description: error?.message || "An error occurred while creating the draft PO"
      });
    }
  };

  const exportToExcel = async () => {
    const data = filteredRequirements.map(req => ({
      "Raw Material Size (mm)": req.material_size_mm,
      "Requirement Gross (kg)": req.total_gross_weight_kg.toFixed(2),
      "Requirement Net (kg)": req.total_net_weight_kg.toFixed(2),
      "Requirement (pcs)": req.total_pcs,
      "Inventory Gross (kg)": req.inventory_gross_kg.toFixed(2),
      "Inventory Net (kg)": req.inventory_net_kg.toFixed(2),
      "Surplus/Deficit (kg)": req.surplus_deficit_kg.toFixed(2),
      "Linked Sales Orders": req.linked_sales_orders.map(so => so.so_id).join(", "),
      "Last GI Reference": req.last_gi_reference || "N/A",
      "Last GI Date": req.last_gi_date || "N/A",
      "Status": req.status
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

    const doc = new jsPDF();
    
    doc.setFontSize(18);
    doc.text("Raw Material Requirements", 14, 20);
    
    const tableData = filteredRequirements.map(req => [
      req.material_size_mm.toString(),
      `${req.total_gross_weight_kg.toFixed(2)} kg (${req.total_pcs} pcs)`,
      `${req.inventory_gross_kg.toFixed(2)} kg`,
      `${req.surplus_deficit_kg >= 0 ? '+' : ''}${req.surplus_deficit_kg.toFixed(2)} kg`,
      req.linked_sales_orders.map(so => so.so_id).join(", "),
      req.last_gi_reference || "N/A",
      req.status === "covered" ? "Covered" : "Shortfall"
    ]);

    (doc as any).autoTable({
      head: [["Size (mm)", "Requirement", "Inventory", "Surplus/Deficit", "Sales Orders", "Last GI", "Status"]],
      body: tableData,
      startY: 30,
    });

    doc.save("material_requirements.pdf");
  };

  const filteredRequirements = requirements.filter(req => {
    if (filterSize && filterSize !== "all" && req.material_size_mm.toString() !== filterSize) {
      return false;
    }
    if (filterCustomer && filterCustomer !== "all" && !req.linked_sales_orders.some(so => so.customer === filterCustomer)) {
      return false;
    }
    if (filterStatus !== "all") {
      if (filterStatus === "covered" && req.status !== "covered") return false;
      if (filterStatus === "shortfall" && req.status !== "shortfall") return false;
    }
    // Note: supplier and date filters intentionally not applied to keep view responsive
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
                <TableHead>Size (mm)</TableHead>
                <TableHead>Requirement</TableHead>
                <TableHead>Inventory Available</TableHead>
                <TableHead>Surplus/Deficit</TableHead>
                <TableHead>Linked Sales Orders</TableHead>
                <TableHead>Last GI Ref</TableHead>
                <TableHead>Status</TableHead>
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
                filteredRequirements.map((req) => (
                  <TableRow key={req.material_size_mm} className={req.status === "shortfall" ? "bg-destructive/5" : "bg-green-50/50 dark:bg-green-950/20"}>
                    <TableCell className="font-bold">{req.material_size_mm}</TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <div className="font-medium">{req.total_gross_weight_kg.toFixed(2)} kg</div>
                        <div className="text-xs text-muted-foreground">{req.total_pcs} pcs • {req.total_net_weight_kg.toFixed(2)} kg net</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <div className="font-medium">{req.inventory_gross_kg.toFixed(2)} kg</div>
                        <div className="text-xs text-muted-foreground">{req.inventory_net_kg.toFixed(2)} kg net</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className={`text-sm font-bold ${req.surplus_deficit_kg >= 0 ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}>
                        {req.surplus_deficit_kg >= 0 ? '+' : ''}{req.surplus_deficit_kg.toFixed(2)} kg
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {req.linked_sales_orders.map((so) => (
                          <Badge key={so.id} variant="outline" className="text-xs">
                            {so.so_id}
                          </Badge>
                        ))}
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
                    <Badge 
                        variant={req.status === "covered" ? "default" : "destructive"}
                        className={req.status === "covered" ? "bg-green-600 hover:bg-green-700" : ""}
                      >
                        {req.status === "covered" ? "✓ Covered" : "⚠ Shortfall"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {req.surplus_deficit_kg < 0 && (
                        <Button 
                          size="sm" 
                          onClick={() => handlePlaceOrder(
                            req.material_size_mm.toString(), 
                            Math.abs(req.surplus_deficit_kg), 
                            req.linked_sales_orders.map(so => so.so_id)
                          )}
                        >
                          Place Order
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
    </div>
  );
}
