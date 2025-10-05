import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Download, FileSpreadsheet } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface MaterialRequirement {
  material_size_mm: number;
  total_pcs: number;
  total_gross_weight_kg: number;
  total_net_weight_kg: number;
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
  const [customers, setCustomers] = useState<string[]>([]);
  const [session, setSession] = useState<any>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [debug, setDebug] = useState<{ approved: number; grouped: number; error: string }>({ approved: 0, grouped: 0, error: "" });

  useEffect(() => {
    // Check authentication
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        loadRequirements();
      } else {
        setLoading(false);
      }
      setSessionChecked(true);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setSessionChecked(true);
      if (session) {
        setLoading(true);
        loadRequirements();
      } else {
        setLoading(false);
      }
    });
    
    // Set up realtime subscription
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
          loadRequirements();
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
      // Fetch all sales orders
      const { data: salesOrdersRaw, error } = await supabase
        .from("sales_orders")
        .select("*")
        .eq("status", "approved");

      if (error) throw error;

      const salesOrders = salesOrdersRaw ?? [];

      // Extract unique customers
      const uniqueCustomers = [...new Set(salesOrders.map((so: any) => so.customer).filter(Boolean))];
      setCustomers(uniqueCustomers);

      // Group by material size
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

      // Fetch statuses from material_requirements table
      const { data: statusData, error: statusErr } = await supabase
        .from("material_requirements")
        .select("*");

      if (statusErr) throw statusErr;

      const statusMap = new Map((statusData ?? []).map((s: any) => [Number(s.material_size_mm), { status: s.status, id: s.id }]));

      // Apply statuses
      const requirementsArray = Array.from(grouped.values()).map((req) => ({
        ...req,
        status: statusMap.get(req.material_size_mm)?.status || "not_ordered",
        requirement_id: statusMap.get(req.material_size_mm)?.id
      }));

      setRequirements(requirementsArray);
      setDebug({ approved: salesOrders.length, grouped: requirementsArray.length, error: "" });
    } catch (err: any) {
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

  const exportToExcel = async () => {
    const data = filteredRequirements.map(req => ({
      "Raw Material Size (mm)": req.material_size_mm,
      "Total Pcs": req.total_pcs,
      "Total Gross Weight (kg)": req.total_gross_weight_kg.toFixed(2),
      "Total Net Weight (kg)": req.total_net_weight_kg.toFixed(2),
      "Linked Sales Orders": req.linked_sales_orders.map(so => so.so_id).join(", "),
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
      req.total_pcs.toString(),
      req.total_gross_weight_kg.toFixed(2),
      req.total_net_weight_kg.toFixed(2),
      req.linked_sales_orders.map(so => so.so_id).join(", "),
      req.status
    ]);

    (doc as any).autoTable({
      head: [["Size (mm)", "Total Pcs", "Gross Wt (kg)", "Net Wt (kg)", "Sales Orders", "Status"]],
      body: tableData,
      startY: 30,
    });

    doc.save("material_requirements.pdf");
  };

  const filteredRequirements = requirements.filter(req => {
    if (filterCustomer && !req.linked_sales_orders.some(so => so.customer === filterCustomer)) {
      return false;
    }
    if (filterStatus !== "all" && req.status !== filterStatus) {
      return false;
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
    <div className="min-h-screen bg-background p-6">
      <div className="flex items-center justify-between mb-6">
        <Button variant="ghost" onClick={() => navigate("/")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Dashboard
        </Button>
        <div className="flex gap-2">
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
          Approved orders: {debug.approved} • Groups: {debug.grouped}
        </p>
      )}

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Customer</label>
              <Select value={filterCustomer} onValueChange={setFilterCustomer}>
                <SelectTrigger>
                  <SelectValue placeholder="All Customers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Customers</SelectItem>
                  {customers.map(customer => (
                    <SelectItem key={customer} value={customer}>{customer}</SelectItem>
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
                  <SelectItem value="not_ordered">Not Ordered</SelectItem>
                  <SelectItem value="ordered">Ordered</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Due Date</label>
              <Input
                type="date"
                value={filterDueDate}
                onChange={(e) => setFilterDueDate(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Raw Material Size (mm)</TableHead>
                <TableHead>Total Pcs</TableHead>
                <TableHead>Total Gross Weight (kg)</TableHead>
                <TableHead>Total Net Weight (kg)</TableHead>
                <TableHead>Linked Sales Orders</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center">Loading...</TableCell>
                </TableRow>
              ) : filteredRequirements.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center">No material requirements found</TableCell>
                </TableRow>
              ) : (
                filteredRequirements.map((req) => (
                  <TableRow key={req.material_size_mm}>
                    <TableCell className="font-medium">{req.material_size_mm}</TableCell>
                    <TableCell>{req.total_pcs}</TableCell>
                    <TableCell>{req.total_gross_weight_kg.toFixed(2)}</TableCell>
                    <TableCell>{req.total_net_weight_kg.toFixed(2)}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {req.linked_sales_orders.map((so) => (
                          <Badge key={so.id} variant="outline" className="text-xs">
                            {so.so_id} ({so.pcs} pcs)
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={req.status === "ordered" ? "default" : "secondary"}>
                        {req.status === "ordered" ? "Ordered" : "Not Ordered"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={req.status}
                        onValueChange={(value) => updateStatus(req.material_size_mm, value, req.requirement_id)}
                      >
                        <SelectTrigger className="w-[140px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="not_ordered">Not Ordered</SelectItem>
                          <SelectItem value="ordered">Ordered</SelectItem>
                        </SelectContent>
                      </Select>
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
