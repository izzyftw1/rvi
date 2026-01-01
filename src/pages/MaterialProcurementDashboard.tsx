import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { NavigationHeader } from "@/components/NavigationHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { 
  Package, TrendingUp, AlertTriangle, CheckCircle2, Plus, Home, 
  Truck, Clock, FileText, ExternalLink, ArrowRight, RefreshCw,
  PackagePlus, Receipt, BarChart3, AlertCircle
} from "lucide-react";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { format, differenceInDays, isPast, parseISO } from "date-fns";
import { cn } from "@/lib/utils";

interface DashboardMetrics {
  openRPOValue: number;
  qtyOnOrder: number;
  qtyReceived: number;
  receiptsThisMonth: number;
  pendingApprovalCount: number;
  overdueCount: number;
  variancesOpen: number;
  inventoryKg: number;
}

interface RPOItem {
  id: string;
  rpo_no: string;
  status: string;
  procurement_type: string;
  material_size_mm: string;
  alloy: string;
  qty_ordered_kg: number;
  qty_received_kg: number;
  rate_per_kg: number;
  amount_ordered: number;
  expected_delivery_date: string | null;
  supplier_name: string;
  created_at: string;
  days_until_due: number | null;
  is_overdue: boolean;
  overstock_reason: string | null;
}

interface MaterialSummary {
  key: string;
  material_size_mm: string;
  alloy: string;
  required_kg: number;
  on_order_kg: number;
  inventory_kg: number;
  balance_kg: number;
  wo_count: number;
  rpo_count: number;
  urgency: 'critical' | 'high' | 'medium' | 'low';
}

interface SupplierPerformance {
  supplier_id: string;
  supplier_name: string;
  total_rpos: number;
  total_value: number;
  on_time_count: number;
  on_time_percent: number;
  avg_lead_days: number;
}

export default function MaterialProcurementDashboard() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>("overview");
  
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    openRPOValue: 0,
    qtyOnOrder: 0,
    qtyReceived: 0,
    receiptsThisMonth: 0,
    pendingApprovalCount: 0,
    overdueCount: 0,
    variancesOpen: 0,
    inventoryKg: 0
  });
  
  const [rpos, setRpos] = useState<RPOItem[]>([]);
  const [materialSummaries, setMaterialSummaries] = useState<MaterialSummary[]>([]);
  const [supplierPerf, setSupplierPerf] = useState<SupplierPerformance[]>([]);

  useEffect(() => {
    loadDashboardData();
    
    // Realtime subscriptions
    const channel = supabase
      .channel('procurement-dashboard-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'raw_purchase_orders' }, loadDashboardData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'raw_po_receipts' }, loadDashboardData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_lots' }, loadDashboardData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gate_register' }, loadDashboardData)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadMetrics(),
        loadRPOs(),
        loadMaterialSummaries(),
        loadSupplierPerformance()
      ]);
    } catch (error: any) {
      console.error("Error loading dashboard:", error);
      toast({ variant: "destructive", description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const loadMetrics = async () => {
    // Load RPOs
    const { data: rpoData } = await supabase
      .from("raw_purchase_orders")
      .select("status, qty_ordered_kg, amount_ordered, expected_delivery_date")
      .neq("status", "cancelled");

    // Load receipts this month
    const firstDayOfMonth = new Date();
    firstDayOfMonth.setDate(1);
    const { data: receipts } = await supabase
      .from("raw_po_receipts")
      .select("qty_received_kg")
      .gte("received_date", firstDayOfMonth.toISOString().split('T')[0]);

    // Load inventory
    const { data: inventory } = await supabase
      .from("inventory_lots")
      .select("qty_kg");

    // Load variances
    const { data: variances } = await supabase
      .from("raw_po_reconciliations")
      .select("id")
      .eq("resolution", "pending");

    // Calculate metrics
    const today = new Date();
    let openValue = 0;
    let qtyOnOrder = 0;
    let qtyReceived = 0;
    let pendingApproval = 0;
    let overdue = 0;

    (rpoData || []).forEach((rpo: any) => {
      if (['approved', 'part_received'].includes(rpo.status)) {
        openValue += rpo.amount_ordered || 0;
        qtyOnOrder += rpo.qty_ordered_kg || 0;
        
        if (rpo.expected_delivery_date && isPast(parseISO(rpo.expected_delivery_date))) {
          overdue++;
        }
      }
      if (rpo.status === 'pending_approval') {
        pendingApproval++;
      }
      if (['part_received', 'received', 'closed'].includes(rpo.status)) {
        qtyReceived += rpo.qty_ordered_kg || 0;
      }
    });

    const receiptsThisMonth = (receipts || []).reduce((sum, r) => sum + (r.qty_received_kg || 0), 0);
    const inventoryKg = (inventory || []).reduce((sum, i) => sum + (i.qty_kg || 0), 0);

    setMetrics({
      openRPOValue: openValue,
      qtyOnOrder,
      qtyReceived,
      receiptsThisMonth,
      pendingApprovalCount: pendingApproval,
      overdueCount: overdue,
      variancesOpen: variances?.length || 0,
      inventoryKg
    });
  };

  const loadRPOs = async () => {
    const { data } = await supabase
      .from("raw_purchase_orders")
      .select(`
        id, rpo_no, status, procurement_type, material_size_mm, alloy,
        qty_ordered_kg, rate_per_kg, amount_ordered, expected_delivery_date,
        created_at, overstock_reason,
        suppliers(name),
        raw_po_receipts(qty_received_kg)
      `)
      .neq("status", "cancelled")
      .order("created_at", { ascending: false })
      .limit(100);

    const today = new Date();
    const mapped: RPOItem[] = (data || []).map((rpo: any) => {
      const qtyReceived = (rpo.raw_po_receipts || []).reduce((sum: number, r: any) => sum + (r.qty_received_kg || 0), 0);
      const expectedDate = rpo.expected_delivery_date ? parseISO(rpo.expected_delivery_date) : null;
      const daysUntilDue = expectedDate ? differenceInDays(expectedDate, today) : null;
      const isOverdue = expectedDate ? isPast(expectedDate) && !['received', 'closed'].includes(rpo.status) : false;

      return {
        id: rpo.id,
        rpo_no: rpo.rpo_no,
        status: rpo.status,
        procurement_type: rpo.procurement_type || 'sales_linked',
        material_size_mm: rpo.material_size_mm || '',
        alloy: rpo.alloy || '',
        qty_ordered_kg: rpo.qty_ordered_kg || 0,
        qty_received_kg: qtyReceived,
        rate_per_kg: rpo.rate_per_kg || 0,
        amount_ordered: rpo.amount_ordered || 0,
        expected_delivery_date: rpo.expected_delivery_date,
        supplier_name: rpo.suppliers?.name || 'N/A',
        created_at: rpo.created_at,
        days_until_due: daysUntilDue,
        is_overdue: isOverdue,
        overstock_reason: rpo.overstock_reason
      };
    });

    setRpos(mapped);
  };

  const loadMaterialSummaries = async () => {
    // Get work orders needing material
    const { data: workOrders } = await supabase
      .from("work_orders")
      .select("material_size_mm, gross_weight_per_pc, quantity, financial_snapshot")
      .in("current_stage", ["goods_in", "cutting", "cutting_queue"])
      .neq("status", "completed");

    // Get RPOs
    const { data: rpoData } = await supabase
      .from("raw_purchase_orders")
      .select("material_size_mm, alloy, qty_ordered_kg, status")
      .in("status", ["approved", "part_received"]);

    // Get inventory
    const { data: inventory } = await supabase
      .from("inventory_lots")
      .select("material_size_mm, alloy, qty_kg");

    // Build summaries
    const summaryMap = new Map<string, MaterialSummary>();

    // Add WO requirements
    (workOrders || []).forEach((wo: any) => {
      const sizeStr = wo.material_size_mm || '';
      const alloy = wo.financial_snapshot?.line_item?.alloy || '';
      if (!sizeStr) return;
      
      const key = `${sizeStr}-${alloy}`.toUpperCase();
      const requiredKg = ((wo.quantity || 0) * (wo.gross_weight_per_pc || 0)) / 1000;

      const existing = summaryMap.get(key) || {
        key,
        material_size_mm: sizeStr,
        alloy,
        required_kg: 0,
        on_order_kg: 0,
        inventory_kg: 0,
        balance_kg: 0,
        wo_count: 0,
        rpo_count: 0,
        urgency: 'low' as const
      };

      existing.required_kg += requiredKg;
      existing.wo_count += 1;
      summaryMap.set(key, existing);
    });

    // Add RPO on-order
    (rpoData || []).forEach((rpo: any) => {
      const key = `${rpo.material_size_mm || ''}-${rpo.alloy || ''}`.toUpperCase();
      const existing = summaryMap.get(key);
      if (existing) {
        existing.on_order_kg += rpo.qty_ordered_kg || 0;
        existing.rpo_count += 1;
      }
    });

    // Add inventory
    (inventory || []).forEach((inv: any) => {
      const key = `${inv.material_size_mm || ''}-${inv.alloy || ''}`.toUpperCase();
      const existing = summaryMap.get(key);
      if (existing) {
        existing.inventory_kg += inv.qty_kg || 0;
      }
    });

    // Calculate balance and urgency
    const summaries = Array.from(summaryMap.values()).map(s => {
      s.balance_kg = s.inventory_kg + s.on_order_kg - s.required_kg;
      
      if (s.balance_kg < -100) s.urgency = 'critical';
      else if (s.balance_kg < 0) s.urgency = 'high';
      else if (s.balance_kg < 50) s.urgency = 'medium';
      else s.urgency = 'low';

      return s;
    });

    // Sort by urgency
    summaries.sort((a, b) => {
      const order = { critical: 0, high: 1, medium: 2, low: 3 };
      return order[a.urgency] - order[b.urgency];
    });

    setMaterialSummaries(summaries);
  };

  const loadSupplierPerformance = async () => {
    const { data } = await supabase
      .from("raw_purchase_orders")
      .select(`
        supplier_id, amount_ordered, expected_delivery_date, created_at,
        suppliers(name),
        raw_po_receipts(received_date)
      `)
      .in("status", ["closed", "part_received"] as const);

    const perfMap = new Map<string, SupplierPerformance>();

    (data || []).forEach((rpo: any) => {
      if (!rpo.supplier_id) return;

      const existing = perfMap.get(rpo.supplier_id) || {
        supplier_id: rpo.supplier_id,
        supplier_name: rpo.suppliers?.name || 'Unknown',
        total_rpos: 0,
        total_value: 0,
        on_time_count: 0,
        on_time_percent: 0,
        avg_lead_days: 0
      };

      existing.total_rpos += 1;
      existing.total_value += rpo.amount_ordered || 0;

      // Check on-time
      if (rpo.raw_po_receipts?.length > 0 && rpo.expected_delivery_date) {
        const firstReceipt = rpo.raw_po_receipts[0];
        if (firstReceipt.received_date <= rpo.expected_delivery_date) {
          existing.on_time_count += 1;
        }
        
        // Calculate lead days
        const leadDays = differenceInDays(
          parseISO(firstReceipt.received_date),
          parseISO(rpo.created_at)
        );
        existing.avg_lead_days = (existing.avg_lead_days + leadDays) / 2;
      }

      perfMap.set(rpo.supplier_id, existing);
    });

    // Calculate on-time percent
    const perfs = Array.from(perfMap.values()).map(p => ({
      ...p,
      on_time_percent: p.total_rpos > 0 ? (p.on_time_count / p.total_rpos) * 100 : 0
    }));

    perfs.sort((a, b) => b.total_value - a.total_value);
    setSupplierPerf(perfs);
  };

  const getStatusBadge = (status: string) => {
    const config: Record<string, { label: string; className: string }> = {
      pending_approval: { label: 'Pending Approval', className: 'bg-amber-500 text-white' },
      approved: { label: 'Approved', className: 'bg-blue-500 text-white' },
      part_received: { label: 'Part Received', className: 'bg-indigo-500 text-white' },
      received: { label: 'Received', className: 'bg-green-600 text-white' },
      closed: { label: 'Closed', className: 'bg-muted text-muted-foreground' }
    };
    const c = config[status] || { label: status, className: '' };
    return <Badge className={c.className}>{c.label}</Badge>;
  };

  const getUrgencyBadge = (urgency: string) => {
    const config: Record<string, { label: string; className: string }> = {
      critical: { label: 'Critical', className: 'bg-destructive text-destructive-foreground' },
      high: { label: 'High', className: 'bg-amber-500 text-white' },
      medium: { label: 'Medium', className: 'bg-blue-500 text-white' },
      low: { label: 'OK', className: 'bg-green-600 text-white' }
    };
    const c = config[urgency] || { label: urgency, className: '' };
    return <Badge className={c.className}>{c.label}</Badge>;
  };

  // Filtered lists
  const pendingRPOs = rpos.filter(r => r.status === 'pending_approval');
  const activeRPOs = rpos.filter(r => ['approved', 'part_received'].includes(r.status));
  const overdueRPOs = rpos.filter(r => r.is_overdue);

  return (
    <div className="min-h-screen bg-background">
      <NavigationHeader 
        title="Procurement Dashboard" 
        subtitle="Raw material procurement & inventory overview" 
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
              <BreadcrumbPage>Procurement Dashboard</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      <div className="p-6 space-y-6">
        {/* Quick Actions */}
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => navigate('/raw-purchase-orders')} className="gap-2">
            <FileText className="h-4 w-4" />
            View All RPOs
          </Button>
          <Button variant="outline" onClick={() => navigate('/material-requirements')} className="gap-2">
            <PackagePlus className="h-4 w-4" />
            Material Requirements
          </Button>
          <Button variant="outline" onClick={() => navigate('/gate-register')} className="gap-2">
            <Receipt className="h-4 w-4" />
            Gate Register
          </Button>
          <Button variant="outline" onClick={() => navigate('/qc-incoming')} className="gap-2">
            <CheckCircle2 className="h-4 w-4" />
            Incoming QC
          </Button>
          <Button variant="ghost" size="icon" onClick={loadDashboardData} disabled={loading}>
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
        </div>

        {/* Metrics Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">Open RPO Value</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold">₹{(metrics.openRPOValue / 100000).toFixed(1)}L</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">On Order</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold">{metrics.qtyOnOrder.toFixed(0)} kg</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">Inventory</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold text-green-600">{metrics.inventoryKg.toFixed(0)} kg</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">Receipts MTD</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold">{metrics.receiptsThisMonth.toFixed(0)} kg</div>
            </CardContent>
          </Card>

          <Card className={cn(metrics.pendingApprovalCount > 0 && "border-amber-500")}>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">Pending Approval</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={cn("text-xl font-bold", metrics.pendingApprovalCount > 0 && "text-amber-600")}>
                {metrics.pendingApprovalCount}
              </div>
            </CardContent>
          </Card>

          <Card className={cn(metrics.overdueCount > 0 && "border-destructive")}>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">Overdue</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={cn("text-xl font-bold", metrics.overdueCount > 0 && "text-destructive")}>
                {metrics.overdueCount}
              </div>
            </CardContent>
          </Card>

          <Card className={cn(metrics.variancesOpen > 0 && "border-amber-500")}>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">Variances</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={cn("text-xl font-bold", metrics.variancesOpen > 0 && "text-amber-600")}>
                {metrics.variancesOpen}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">Active RPOs</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold">{activeRPOs.length}</div>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="pending" className="gap-1">
              Pending Approval
              {pendingRPOs.length > 0 && (
                <Badge variant="secondary" className="ml-1">{pendingRPOs.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="active">Active Orders</TabsTrigger>
            <TabsTrigger value="deficits">Material Status</TabsTrigger>
            <TabsTrigger value="suppliers">Suppliers</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            {/* Alerts Section */}
            {(overdueRPOs.length > 0 || metrics.variancesOpen > 0) && (
              <Card className="border-destructive/50 bg-destructive/5">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-destructive">
                    <AlertTriangle className="h-5 w-5" />
                    Attention Required
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {overdueRPOs.length > 0 && (
                    <div className="flex items-center justify-between p-3 bg-background rounded-lg">
                      <div>
                        <p className="font-medium">{overdueRPOs.length} Overdue Deliveries</p>
                        <p className="text-sm text-muted-foreground">Expected delivery date has passed</p>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => setActiveTab('active')}>
                        View <ArrowRight className="ml-1 h-4 w-4" />
                      </Button>
                    </div>
                  )}
                  {metrics.variancesOpen > 0 && (
                    <div className="flex items-center justify-between p-3 bg-background rounded-lg">
                      <div>
                        <p className="font-medium">{metrics.variancesOpen} Open Variances</p>
                        <p className="text-sm text-muted-foreground">Quantity or rate discrepancies pending resolution</p>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => navigate('/reconciliation-report')}>
                        View <ArrowRight className="ml-1 h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Recent RPOs */}
            <Card>
              <CardHeader>
                <CardTitle>Recent Purchase Orders</CardTitle>
                <CardDescription>Latest 10 raw material purchase orders</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>RPO #</TableHead>
                      <TableHead>Material</TableHead>
                      <TableHead>Supplier</TableHead>
                      <TableHead className="text-right">Qty (kg)</TableHead>
                      <TableHead className="text-right">Value</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Due</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rpos.slice(0, 10).map((rpo) => (
                      <TableRow 
                        key={rpo.id} 
                        className={cn("cursor-pointer hover:bg-muted/50", rpo.is_overdue && "bg-destructive/5")}
                        onClick={() => navigate('/raw-purchase-orders')}
                      >
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            {rpo.rpo_no}
                            {rpo.procurement_type === 'overstock' && (
                              <Badge variant="outline" className="text-xs">Overstock</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{rpo.material_size_mm}</p>
                            <p className="text-xs text-muted-foreground">{rpo.alloy}</p>
                          </div>
                        </TableCell>
                        <TableCell>{rpo.supplier_name}</TableCell>
                        <TableCell className="text-right">
                          <div>
                            <p>{rpo.qty_ordered_kg.toFixed(0)}</p>
                            {rpo.qty_received_kg > 0 && (
                              <p className="text-xs text-green-600">Rcvd: {rpo.qty_received_kg.toFixed(0)}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">₹{rpo.amount_ordered.toLocaleString()}</TableCell>
                        <TableCell>{getStatusBadge(rpo.status)}</TableCell>
                        <TableCell>
                          {rpo.expected_delivery_date ? (
                            <div className={cn(rpo.is_overdue && "text-destructive font-medium")}>
                              {format(parseISO(rpo.expected_delivery_date), 'dd MMM')}
                              {rpo.is_overdue && <AlertCircle className="inline ml-1 h-3 w-3" />}
                            </div>
                          ) : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Pending Approval Tab */}
          <TabsContent value="pending">
            <Card>
              <CardHeader>
                <CardTitle>Pending Approval</CardTitle>
                <CardDescription>RPOs awaiting approval</CardDescription>
              </CardHeader>
              <CardContent>
                {pendingRPOs.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <CheckCircle2 className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No pending approvals</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>RPO #</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Material</TableHead>
                        <TableHead>Supplier</TableHead>
                        <TableHead className="text-right">Qty (kg)</TableHead>
                        <TableHead className="text-right">Rate</TableHead>
                        <TableHead className="text-right">Value</TableHead>
                        <TableHead>Created</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pendingRPOs.map((rpo) => (
                        <TableRow key={rpo.id}>
                          <TableCell className="font-medium">{rpo.rpo_no}</TableCell>
                          <TableCell>
                            <Badge variant={rpo.procurement_type === 'overstock' ? 'secondary' : 'outline'}>
                              {rpo.procurement_type === 'overstock' ? 'Overstock' : 'Sales-linked'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {rpo.material_size_mm} {rpo.alloy}
                          </TableCell>
                          <TableCell>{rpo.supplier_name}</TableCell>
                          <TableCell className="text-right">{rpo.qty_ordered_kg.toFixed(0)}</TableCell>
                          <TableCell className="text-right">₹{rpo.rate_per_kg.toFixed(2)}</TableCell>
                          <TableCell className="text-right">₹{rpo.amount_ordered.toLocaleString()}</TableCell>
                          <TableCell>{format(parseISO(rpo.created_at), 'dd MMM yyyy')}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
                <div className="mt-4">
                  <Button onClick={() => navigate('/raw-purchase-orders')}>
                    Go to RPO Management <ArrowRight className="ml-1 h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Active Orders Tab */}
          <TabsContent value="active">
            <Card>
              <CardHeader>
                <CardTitle>Active Orders</CardTitle>
                <CardDescription>Approved and part-received orders awaiting delivery</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>RPO #</TableHead>
                      <TableHead>Material</TableHead>
                      <TableHead>Supplier</TableHead>
                      <TableHead className="text-right">Ordered</TableHead>
                      <TableHead className="text-right">Received</TableHead>
                      <TableHead>Progress</TableHead>
                      <TableHead>Due</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activeRPOs.map((rpo) => {
                      const progress = rpo.qty_ordered_kg > 0 
                        ? (rpo.qty_received_kg / rpo.qty_ordered_kg) * 100 
                        : 0;
                      return (
                        <TableRow key={rpo.id} className={cn(rpo.is_overdue && "bg-destructive/5")}>
                          <TableCell className="font-medium">{rpo.rpo_no}</TableCell>
                          <TableCell>{rpo.material_size_mm} {rpo.alloy}</TableCell>
                          <TableCell>{rpo.supplier_name}</TableCell>
                          <TableCell className="text-right">{rpo.qty_ordered_kg.toFixed(0)} kg</TableCell>
                          <TableCell className="text-right">{rpo.qty_received_kg.toFixed(0)} kg</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Progress value={progress} className="w-20 h-2" />
                              <span className="text-xs">{progress.toFixed(0)}%</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            {rpo.expected_delivery_date ? (
                              <div className={cn("flex items-center gap-1", rpo.is_overdue && "text-destructive font-medium")}>
                                {format(parseISO(rpo.expected_delivery_date), 'dd MMM')}
                                {rpo.is_overdue && <AlertTriangle className="h-3 w-3" />}
                              </div>
                            ) : '—'}
                          </TableCell>
                          <TableCell>{getStatusBadge(rpo.status)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Material Status Tab */}
          <TabsContent value="deficits">
            <Card>
              <CardHeader>
                <CardTitle>Material Status</CardTitle>
                <CardDescription>Requirements vs inventory and on-order quantities</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Material</TableHead>
                      <TableHead>Alloy</TableHead>
                      <TableHead className="text-right">Required</TableHead>
                      <TableHead className="text-right">Inventory</TableHead>
                      <TableHead className="text-right">On Order</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {materialSummaries.map((m) => (
                      <TableRow key={m.key}>
                        <TableCell className="font-medium">{m.material_size_mm}</TableCell>
                        <TableCell>{m.alloy || '—'}</TableCell>
                        <TableCell className="text-right">{m.required_kg.toFixed(0)} kg</TableCell>
                        <TableCell className="text-right text-green-600">{m.inventory_kg.toFixed(0)} kg</TableCell>
                        <TableCell className="text-right text-blue-600">{m.on_order_kg.toFixed(0)} kg</TableCell>
                        <TableCell className={cn("text-right font-medium", m.balance_kg < 0 ? "text-destructive" : "text-green-600")}>
                          {m.balance_kg >= 0 ? '+' : ''}{m.balance_kg.toFixed(0)} kg
                        </TableCell>
                        <TableCell>{getUrgencyBadge(m.urgency)}</TableCell>
                        <TableCell>
                          {m.balance_kg < 0 && (
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => navigate(`/material-requirements`)}
                            >
                              <Plus className="mr-1 h-3 w-3" />
                              Order
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Suppliers Tab */}
          <TabsContent value="suppliers">
            <Card>
              <CardHeader>
                <CardTitle>Supplier Performance</CardTitle>
                <CardDescription>Delivery and value metrics by supplier</CardDescription>
              </CardHeader>
              <CardContent>
                {supplierPerf.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Truck className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No supplier data available</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Supplier</TableHead>
                        <TableHead className="text-right">Total Orders</TableHead>
                        <TableHead className="text-right">Total Value</TableHead>
                        <TableHead className="text-right">On-Time %</TableHead>
                        <TableHead className="text-right">Avg Lead Days</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {supplierPerf.map((perf) => (
                        <TableRow key={perf.supplier_id}>
                          <TableCell className="font-medium">{perf.supplier_name}</TableCell>
                          <TableCell className="text-right">{perf.total_rpos}</TableCell>
                          <TableCell className="text-right">₹{perf.total_value.toLocaleString()}</TableCell>
                          <TableCell className="text-right">
                            <Badge variant={perf.on_time_percent >= 80 ? "default" : "destructive"}>
                              {perf.on_time_percent.toFixed(0)}%
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">{perf.avg_lead_days.toFixed(0)} days</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
