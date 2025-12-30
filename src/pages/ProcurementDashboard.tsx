import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { 
  PackagePlus, FileText, TrendingUp, Clock, CheckCircle, XCircle, 
  AlertTriangle, Search, ChevronDown, ChevronRight, Download,
  Truck, Package, Factory, BarChart3, ArrowRight, ExternalLink
} from "lucide-react";
import { format, differenceInDays, isPast, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";

// ============= TYPES =============
interface MaterialSummary {
  material_grade: string;
  alloy: string;
  shape: string;
  size_mm: number;
  // Quantities
  total_required_kg: number;
  total_ordered_kg: number;
  total_received_kg: number;
  total_issued_kg: number;
  // Computed
  deficit_kg: number;
  on_order_pending_kg: number;
  available_stock_kg: number;
  // Linked entities
  linked_wo_count: number;
  linked_po_count: number;
  pending_po_count: number;
  // Urgency
  earliest_due_date: string | null;
  urgency: 'critical' | 'high' | 'medium' | 'low';
}

interface PurchaseOrder {
  id: string;
  po_id: string;
  rpo_no?: string;
  material_grade: string;
  alloy: string;
  size_mm: number;
  qty_ordered_kg: number;
  qty_received_kg: number;
  rate_per_kg: number;
  total_value: number;
  status: string;
  supplier_name: string;
  expected_date: string | null;
  created_at: string;
  linked_wo_ids: string[];
}

interface InventoryLot {
  id: string;
  lot_id: string;
  heat_no: string;
  alloy: string;
  material_size_mm: number;
  net_weight: number;
  gross_weight: number;
  issued_weight: number;
  available_weight: number;
  status: string;
  supplier: string;
  received_date: string;
  qc_status: string;
}

interface WorkOrderRequirement {
  wo_id: string;
  wo_number: string;
  customer: string;
  item_code: string;
  quantity: number;
  material_grade: string;
  alloy: string;
  size_mm: number;
  required_kg: number;
  issued_kg: number;
  due_date: string;
  status: string;
}

// ============= COMPONENT =============
export default function ProcurementDashboard() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'orders' | 'inventory' | 'requirements'>('overview');
  
  // Data states
  const [materialSummaries, setMaterialSummaries] = useState<MaterialSummary[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [inventoryLots, setInventoryLots] = useState<InventoryLot[]>([]);
  const [workOrderRequirements, setWorkOrderRequirements] = useState<WorkOrderRequirement[]>([]);
  
  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [filterAlloy, setFilterAlloy] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterUrgency, setFilterUrgency] = useState("all");
  
  // Expanded groups
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // Unique filter values
  const alloys = useMemo(() => {
    const unique = new Set(materialSummaries.map(m => m.alloy).filter(Boolean));
    return Array.from(unique).sort();
  }, [materialSummaries]);

  useEffect(() => {
    loadAllData();

    const channel = supabase
      .channel('procurement-dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'raw_purchase_orders' }, loadAllData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'raw_material_po' }, loadAllData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'material_lots' }, loadAllData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wo_material_issues' }, loadAllData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_orders' }, loadAllData)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const loadAllData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadMaterialSummaries(),
        loadPurchaseOrders(),
        loadInventoryLots(),
        loadWorkOrderRequirements()
      ]);
    } catch (error: any) {
      toast({ variant: "destructive", description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const loadMaterialSummaries = async () => {
    // Get work orders that need material (goods_in or cutting stage)
    const { data: workOrders } = await supabase
      .from('work_orders')
      .select('id, wo_number, customer, item_code, quantity, material_size_mm, due_date, status, current_stage, gross_weight_per_pc, financial_snapshot')
      .in('current_stage', ['goods_in', 'cutting_queue', 'production_planning'])
      .not('status', 'eq', 'completed');

    // Get inventory lots
    const { data: inventory } = await supabase
      .from('material_lots')
      .select('alloy, material_size_mm, net_weight, gross_weight, status')
      .in('status', ['received', 'in_use', 'issued']);

    // Get raw purchase orders
    const { data: rpos } = await supabase
      .from('raw_purchase_orders')
      .select('alloy, material_size_mm, qty_ordered_kg, status');

    // Get material issues
    const { data: issues } = await supabase
      .from('wo_material_issues')
      .select('quantity_kg');

    // Group by material spec
    const summaryMap = new Map<string, MaterialSummary>();
    
    (workOrders || []).forEach((wo: any) => {
      // Extract alloy from financial_snapshot or material_size_mm
      const alloy = wo.financial_snapshot?.line_item?.alloy || 'Unknown';
      const sizeStr = wo.material_size_mm || '';
      const size = parseFloat(sizeStr.replace(/[^0-9.]/g, '')) || 0;
      const shape = sizeStr.includes('hex') ? 'Hexagon' : 
                    sizeStr.includes('sq') ? 'Square' : 'Round';
      
      const grossWeightPc = wo.gross_weight_per_pc || 0;
      const requiredKg = (wo.quantity * grossWeightPc) / 1000;
      
      const key = `${alloy}-${size}-${shape}`;
      const existing = summaryMap.get(key) || {
        material_grade: `${alloy} ${size}mm ${shape}`,
        alloy,
        shape,
        size_mm: size,
        total_required_kg: 0,
        total_ordered_kg: 0,
        total_received_kg: 0,
        total_issued_kg: 0,
        deficit_kg: 0,
        on_order_pending_kg: 0,
        available_stock_kg: 0,
        linked_wo_count: 0,
        linked_po_count: 0,
        pending_po_count: 0,
        earliest_due_date: null,
        urgency: 'low' as const
      };
      
      existing.total_required_kg += requiredKg;
      existing.linked_wo_count += 1;
      
      if (!existing.earliest_due_date || (wo.due_date && wo.due_date < existing.earliest_due_date)) {
        existing.earliest_due_date = wo.due_date;
      }
      
      summaryMap.set(key, existing);
    });

    // Add inventory data
    (inventory || []).forEach((lot: any) => {
      const alloy = lot.alloy || 'Unknown';
      const size = lot.material_size_mm || 0;
      const shape = 'Round'; // Default
      const key = `${alloy}-${size}-${shape}`;
      
      const existing = summaryMap.get(key);
      if (existing) {
        existing.total_received_kg += lot.net_weight || 0;
        existing.available_stock_kg += lot.net_weight || 0;
      }
    });

    // Add PO data
    (rpos || []).forEach((po: any) => {
      const alloy = po.alloy || 'Unknown';
      const size = parseFloat(po.material_size_mm?.replace(/[^0-9.]/g, '') || '0');
      const shape = 'Round';
      const key = `${alloy}-${size}-${shape}`;
      
      const existing = summaryMap.get(key);
      if (existing) {
        existing.total_ordered_kg += po.qty_ordered_kg || 0;
        existing.linked_po_count += 1;
        if (po.status !== 'completed' && po.status !== 'cancelled') {
          existing.pending_po_count += 1;
          existing.on_order_pending_kg += po.qty_ordered_kg || 0;
        }
      }
    });

    // Add issue data
    const totalIssued = (issues || []).reduce((sum, i) => sum + (i.quantity_kg || 0), 0);

    // Calculate deficits and urgency
    const summaries = Array.from(summaryMap.values()).map(s => {
      s.deficit_kg = Math.max(0, s.total_required_kg - s.available_stock_kg - s.on_order_pending_kg);
      
      // Calculate urgency
      if (s.deficit_kg > 0 && s.earliest_due_date) {
        const daysUntilDue = differenceInDays(parseISO(s.earliest_due_date), new Date());
        if (daysUntilDue < 0) s.urgency = 'critical';
        else if (daysUntilDue < 7) s.urgency = 'high';
        else if (daysUntilDue < 14) s.urgency = 'medium';
        else s.urgency = 'low';
      } else if (s.deficit_kg > 0) {
        s.urgency = 'medium';
      }
      
      return s;
    });

    // Sort by urgency
    summaries.sort((a, b) => {
      const urgencyOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
    });

    setMaterialSummaries(summaries);
  };

  const loadPurchaseOrders = async () => {
    const { data } = await supabase
      .from('raw_purchase_orders')
      .select(`*, suppliers(name)`)
      .order('created_at', { ascending: false });

    const mapped: PurchaseOrder[] = (data || []).map((po: any) => ({
      id: po.id,
      po_id: po.po_id || po.rpo_no,
      rpo_no: po.rpo_no,
      material_grade: `${po.alloy} ${po.material_size_mm}`,
      alloy: po.alloy,
      size_mm: parseFloat(po.material_size_mm?.replace(/[^0-9.]/g, '') || '0'),
      qty_ordered_kg: po.qty_ordered_kg || 0,
      qty_received_kg: po.qty_received_kg || 0,
      rate_per_kg: po.rate_per_kg || 0,
      total_value: po.amount_ordered || 0,
      status: po.status || 'draft',
      supplier_name: po.suppliers?.name || 'N/A',
      expected_date: po.expected_delivery_date,
      created_at: po.created_at,
      linked_wo_ids: po.linked_wo_ids || []
    }));

    setPurchaseOrders(mapped);
  };

  const loadInventoryLots = async () => {
    const { data } = await supabase
      .from('material_lots')
      .select('*')
      .order('received_date', { ascending: false });

    const mapped: InventoryLot[] = (data || []).map((lot: any) => {
      const issued = lot.issued_weight || 0;
      return {
        id: lot.id,
        lot_id: lot.lot_id,
        heat_no: lot.heat_no || 'N/A',
        alloy: lot.alloy || 'Unknown',
        material_size_mm: lot.material_size_mm || 0,
        net_weight: lot.net_weight || 0,
        gross_weight: lot.gross_weight || 0,
        issued_weight: issued,
        available_weight: Math.max(0, (lot.net_weight || 0) - issued),
        status: lot.status || 'received',
        supplier: lot.supplier || 'N/A',
        received_date: lot.received_date,
        qc_status: lot.qc_status || 'pending'
      };
    });

    setInventoryLots(mapped);
  };

  const loadWorkOrderRequirements = async () => {
    const { data } = await supabase
      .from('work_orders')
      .select('id, wo_number, customer, item_code, quantity, material_size_mm, due_date, status, current_stage, gross_weight_per_pc, financial_snapshot')
      .in('current_stage', ['goods_in', 'cutting_queue', 'production_planning', 'production'])
      .in('status', ['pending', 'in_progress', 'qc', 'packing'])
      .order('due_date', { ascending: true });

    const mapped: WorkOrderRequirement[] = (data || []).map((wo: any) => {
      const alloy = wo.financial_snapshot?.line_item?.alloy || 'Unknown';
      const sizeStr = wo.material_size_mm || '';
      const size = parseFloat(sizeStr.replace(/[^0-9.]/g, '')) || 0;
      const grossWeightPc = wo.gross_weight_per_pc || 0;
      const requiredKg = (wo.quantity * grossWeightPc) / 1000;

      return {
        wo_id: wo.id,
        wo_number: wo.wo_number,
        customer: wo.customer,
        item_code: wo.item_code,
        quantity: wo.quantity,
        material_grade: `${alloy} ${size}mm`,
        alloy,
        size_mm: size,
        required_kg: requiredKg,
        issued_kg: 0, // Would need to join with wo_material_issues
        due_date: wo.due_date,
        status: wo.status
      };
    });

    setWorkOrderRequirements(mapped);
  };

  // Filter logic
  const filteredSummaries = useMemo(() => {
    return materialSummaries.filter(s => {
      const matchesSearch = s.material_grade.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           s.alloy.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesAlloy = filterAlloy === 'all' || s.alloy === filterAlloy;
      const matchesUrgency = filterUrgency === 'all' || s.urgency === filterUrgency;
      return matchesSearch && matchesAlloy && matchesUrgency;
    });
  }, [materialSummaries, searchTerm, filterAlloy, filterUrgency]);

  const filteredOrders = useMemo(() => {
    return purchaseOrders.filter(po => {
      const matchesSearch = po.po_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           po.material_grade.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           po.supplier_name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesAlloy = filterAlloy === 'all' || po.alloy === filterAlloy;
      const matchesStatus = filterStatus === 'all' || po.status === filterStatus;
      return matchesSearch && matchesAlloy && matchesStatus;
    });
  }, [purchaseOrders, searchTerm, filterAlloy, filterStatus]);

  // Summary stats
  const summaryStats = useMemo(() => {
    const totalRequired = materialSummaries.reduce((s, m) => s + m.total_required_kg, 0);
    const totalDeficit = materialSummaries.reduce((s, m) => s + m.deficit_kg, 0);
    const totalOnOrder = materialSummaries.reduce((s, m) => s + m.on_order_pending_kg, 0);
    const totalStock = materialSummaries.reduce((s, m) => s + m.available_stock_kg, 0);
    const criticalCount = materialSummaries.filter(m => m.urgency === 'critical').length;
    const openPOValue = purchaseOrders
      .filter(po => po.status !== 'completed')
      .reduce((s, po) => s + po.total_value, 0);
    
    return { totalRequired, totalDeficit, totalOnOrder, totalStock, criticalCount, openPOValue };
  }, [materialSummaries, purchaseOrders]);

  const toggleGroup = (key: string) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setExpandedGroups(newExpanded);
  };

  const getUrgencyBadge = (urgency: string) => {
    const config = {
      critical: { label: 'Critical', className: 'bg-destructive text-destructive-foreground' },
      high: { label: 'High', className: 'bg-amber-500 text-white' },
      medium: { label: 'Medium', className: 'bg-blue-500 text-white' },
      low: { label: 'Low', className: 'bg-muted text-muted-foreground' }
    }[urgency] || { label: urgency, className: '' };
    
    return <Badge className={config.className}>{config.label}</Badge>;
  };

  const getStatusBadge = (status: string) => {
    const config = {
      draft: { label: 'Draft', className: 'bg-muted text-muted-foreground' },
      pending_approval: { label: 'Pending', className: 'bg-amber-500 text-white' },
      approved: { label: 'Approved', className: 'bg-blue-500 text-white' },
      part_received: { label: 'Partial', className: 'bg-indigo-500 text-white' },
      completed: { label: 'Complete', className: 'bg-success text-success-foreground' },
      cancelled: { label: 'Cancelled', className: 'bg-destructive/20 text-destructive' }
    }[status] || { label: status, className: '' };
    
    return <Badge variant="outline" className={config.className}>{config.label}</Badge>;
  };

  const exportToExcel = () => {
    const data = filteredSummaries.map(s => ({
      'Material': s.material_grade,
      'Alloy': s.alloy,
      'Size (mm)': s.size_mm,
      'Shape': s.shape,
      'Required (kg)': s.total_required_kg.toFixed(2),
      'On Order (kg)': s.on_order_pending_kg.toFixed(2),
      'In Stock (kg)': s.available_stock_kg.toFixed(2),
      'Deficit (kg)': s.deficit_kg.toFixed(2),
      'Linked WOs': s.linked_wo_count,
      'Open POs': s.pending_po_count,
      'Urgency': s.urgency,
      'Earliest Due': s.earliest_due_date ? format(parseISO(s.earliest_due_date), 'dd-MMM-yyyy') : 'N/A'
    }));
    
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Procurement Status');
    XLSX.writeFile(wb, `Procurement_Dashboard_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="text-center py-12">Loading procurement data...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Procurement Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              What do we need? What is ordered? What is received? What is issued?
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={exportToExcel}>
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
            <Button onClick={() => navigate('/raw-purchase-orders')}>
              <PackagePlus className="h-4 w-4 mr-2" />
              Create RPO
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <Package className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-2xl font-bold">{summaryStats.totalRequired.toFixed(0)} kg</p>
                  <p className="text-xs text-muted-foreground">Total Required</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className={summaryStats.totalDeficit > 0 ? 'border-destructive' : ''}>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className={cn("h-5 w-5", summaryStats.totalDeficit > 0 ? "text-destructive" : "text-muted-foreground")} />
                <div>
                  <p className={cn("text-2xl font-bold", summaryStats.totalDeficit > 0 && "text-destructive")}>
                    {summaryStats.totalDeficit.toFixed(0)} kg
                  </p>
                  <p className="text-xs text-muted-foreground">Deficit</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <Truck className="h-5 w-5 text-blue-500" />
                <div>
                  <p className="text-2xl font-bold text-blue-600">{summaryStats.totalOnOrder.toFixed(0)} kg</p>
                  <p className="text-xs text-muted-foreground">On Order</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <Factory className="h-5 w-5 text-success" />
                <div>
                  <p className="text-2xl font-bold text-success">{summaryStats.totalStock.toFixed(0)} kg</p>
                  <p className="text-xs text-muted-foreground">In Stock</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className={summaryStats.criticalCount > 0 ? 'border-destructive bg-destructive/5' : ''}>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className={cn("h-5 w-5", summaryStats.criticalCount > 0 ? "text-destructive" : "text-muted-foreground")} />
                <div>
                  <p className={cn("text-2xl font-bold", summaryStats.criticalCount > 0 && "text-destructive")}>
                    {summaryStats.criticalCount}
                  </p>
                  <p className="text-xs text-muted-foreground">Critical Items</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-2xl font-bold text-primary">
                    ₹{(summaryStats.openPOValue / 100000).toFixed(1)}L
                  </p>
                  <p className="text-xs text-muted-foreground">Open PO Value</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex flex-wrap gap-4 items-center">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search material, PO, supplier..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
              
              <Select value={filterAlloy} onValueChange={setFilterAlloy}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Alloy" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Alloys</SelectItem>
                  {alloys.map(a => (
                    <SelectItem key={a} value={a}>{a}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={filterUrgency} onValueChange={setFilterUrgency}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Urgency" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Urgency</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>

              {activeTab === 'orders' && (
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="part_received">Partial</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
          <TabsList>
            <TabsTrigger value="overview">Material Overview</TabsTrigger>
            <TabsTrigger value="orders">Purchase Orders ({purchaseOrders.length})</TabsTrigger>
            <TabsTrigger value="inventory">Inventory ({inventoryLots.length})</TabsTrigger>
            <TabsTrigger value="requirements">WO Requirements ({workOrderRequirements.length})</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Material Status by Grade</CardTitle>
                <CardDescription>
                  Overview of material needs, orders, and stock levels grouped by specification
                </CardDescription>
              </CardHeader>
              <CardContent>
                {filteredSummaries.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No material requirements found
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredSummaries.map((summary) => {
                      const key = `${summary.alloy}-${summary.size_mm}-${summary.shape}`;
                      const isExpanded = expandedGroups.has(key);
                      const fulfillmentPct = summary.total_required_kg > 0
                        ? Math.min(100, ((summary.available_stock_kg + summary.on_order_pending_kg) / summary.total_required_kg) * 100)
                        : 100;
                      
                      return (
                        <Collapsible key={key} open={isExpanded} onOpenChange={() => toggleGroup(key)}>
                          <CollapsibleTrigger asChild>
                            <div className={cn(
                              "flex items-center gap-4 p-3 rounded-lg cursor-pointer transition-colors",
                              summary.urgency === 'critical' && "bg-destructive/10 hover:bg-destructive/20",
                              summary.urgency === 'high' && "bg-amber-500/10 hover:bg-amber-500/20",
                              summary.urgency !== 'critical' && summary.urgency !== 'high' && "bg-muted/50 hover:bg-muted"
                            )}>
                              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                              
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium">{summary.material_grade}</span>
                                  {getUrgencyBadge(summary.urgency)}
                                </div>
                                <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                                  <span>{summary.linked_wo_count} WOs</span>
                                  <span>{summary.pending_po_count} open POs</span>
                                  {summary.earliest_due_date && (
                                    <span>Due: {format(parseISO(summary.earliest_due_date), 'dd-MMM')}</span>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center gap-6 text-sm">
                                <div className="text-right">
                                  <p className="font-medium">{summary.total_required_kg.toFixed(1)} kg</p>
                                  <p className="text-xs text-muted-foreground">Required</p>
                                </div>
                                <div className="text-right">
                                  <p className="font-medium text-blue-600">{summary.on_order_pending_kg.toFixed(1)} kg</p>
                                  <p className="text-xs text-muted-foreground">On Order</p>
                                </div>
                                <div className="text-right">
                                  <p className="font-medium text-success">{summary.available_stock_kg.toFixed(1)} kg</p>
                                  <p className="text-xs text-muted-foreground">In Stock</p>
                                </div>
                                <div className="text-right min-w-[80px]">
                                  <p className={cn(
                                    "font-medium",
                                    summary.deficit_kg > 0 ? "text-destructive" : "text-success"
                                  )}>
                                    {summary.deficit_kg > 0 ? `-${summary.deficit_kg.toFixed(1)}` : '✓'} kg
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {summary.deficit_kg > 0 ? 'Deficit' : 'Covered'}
                                  </p>
                                </div>
                                <div className="w-24">
                                  <Progress value={fulfillmentPct} className="h-2" />
                                  <p className="text-xs text-muted-foreground text-center mt-1">
                                    {fulfillmentPct.toFixed(0)}%
                                  </p>
                                </div>
                              </div>
                            </div>
                          </CollapsibleTrigger>
                          
                          <CollapsibleContent>
                            <div className="pl-8 pr-4 py-3 space-y-3 border-l-2 border-muted ml-2">
                              <div className="grid grid-cols-4 gap-4 text-sm">
                                <div>
                                  <p className="text-muted-foreground">Total Required</p>
                                  <p className="font-medium">{summary.total_required_kg.toFixed(2)} kg</p>
                                </div>
                                <div>
                                  <p className="text-muted-foreground">Total Ordered</p>
                                  <p className="font-medium">{summary.total_ordered_kg.toFixed(2)} kg</p>
                                </div>
                                <div>
                                  <p className="text-muted-foreground">Total Received</p>
                                  <p className="font-medium">{summary.total_received_kg.toFixed(2)} kg</p>
                                </div>
                                <div>
                                  <p className="text-muted-foreground">Total Issued</p>
                                  <p className="font-medium">{summary.total_issued_kg.toFixed(2)} kg</p>
                                </div>
                              </div>
                              
                              {summary.deficit_kg > 0 && (
                                <Button 
                                  size="sm" 
                                  onClick={() => navigate(`/raw-purchase-orders?alloy=${summary.alloy}&size=${summary.size_mm}`)}
                                >
                                  <PackagePlus className="h-4 w-4 mr-2" />
                                  Create RPO for {summary.deficit_kg.toFixed(1)} kg
                                </Button>
                              )}
                            </div>
                          </CollapsibleContent>
                        </Collapsible>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Purchase Orders Tab */}
          <TabsContent value="orders">
            <Card>
              <CardHeader>
                <CardTitle>Purchase Orders</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>PO No.</TableHead>
                      <TableHead>Supplier</TableHead>
                      <TableHead>Material</TableHead>
                      <TableHead className="text-right">Ordered (kg)</TableHead>
                      <TableHead className="text-right">Received (kg)</TableHead>
                      <TableHead className="text-right">Value</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Expected</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredOrders.map(po => (
                      <TableRow key={po.id}>
                        <TableCell className="font-medium">{po.rpo_no || po.po_id}</TableCell>
                        <TableCell>{po.supplier_name}</TableCell>
                        <TableCell>{po.material_grade}</TableCell>
                        <TableCell className="text-right">{po.qty_ordered_kg.toFixed(2)}</TableCell>
                        <TableCell className="text-right">{po.qty_received_kg.toFixed(2)}</TableCell>
                        <TableCell className="text-right">₹{po.total_value.toLocaleString('en-IN')}</TableCell>
                        <TableCell>{getStatusBadge(po.status)}</TableCell>
                        <TableCell>
                          {po.expected_date ? format(parseISO(po.expected_date), 'dd-MMM') : '—'}
                        </TableCell>
                        <TableCell>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => navigate(`/raw-purchase-orders?rpo_no=${po.rpo_no}`)}
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {filteredOrders.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                          No purchase orders found
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Inventory Tab */}
          <TabsContent value="inventory">
            <Card>
              <CardHeader>
                <CardTitle>Material Inventory</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Lot ID</TableHead>
                      <TableHead>Heat No.</TableHead>
                      <TableHead>Alloy</TableHead>
                      <TableHead>Size (mm)</TableHead>
                      <TableHead className="text-right">Gross (kg)</TableHead>
                      <TableHead className="text-right">Available (kg)</TableHead>
                      <TableHead>QC Status</TableHead>
                      <TableHead>Supplier</TableHead>
                      <TableHead>Received</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {inventoryLots.map(lot => (
                      <TableRow key={lot.id}>
                        <TableCell className="font-medium">{lot.lot_id}</TableCell>
                        <TableCell>{lot.heat_no}</TableCell>
                        <TableCell>{lot.alloy}</TableCell>
                        <TableCell>{lot.material_size_mm}</TableCell>
                        <TableCell className="text-right">{lot.gross_weight.toFixed(2)}</TableCell>
                        <TableCell className="text-right font-medium text-success">
                          {lot.available_weight.toFixed(2)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={lot.qc_status === 'approved' ? 'default' : 'secondary'}>
                            {lot.qc_status}
                          </Badge>
                        </TableCell>
                        <TableCell>{lot.supplier}</TableCell>
                        <TableCell>
                          {lot.received_date ? format(parseISO(lot.received_date), 'dd-MMM-yy') : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                    {inventoryLots.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                          No inventory lots found
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Requirements Tab */}
          <TabsContent value="requirements">
            <Card>
              <CardHeader>
                <CardTitle>Work Order Material Requirements</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>WO Number</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Item Code</TableHead>
                      <TableHead>Material</TableHead>
                      <TableHead className="text-right">Qty (pcs)</TableHead>
                      <TableHead className="text-right">Required (kg)</TableHead>
                      <TableHead className="text-right">Issued (kg)</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {workOrderRequirements.map(req => (
                      <TableRow key={req.wo_id}>
                        <TableCell className="font-medium">
                          <Button 
                            variant="link" 
                            className="p-0 h-auto"
                            onClick={() => navigate(`/work-orders/${req.wo_id}`)}
                          >
                            {req.wo_number}
                          </Button>
                        </TableCell>
                        <TableCell>{req.customer}</TableCell>
                        <TableCell>{req.item_code}</TableCell>
                        <TableCell>{req.material_grade}</TableCell>
                        <TableCell className="text-right">{req.quantity.toLocaleString()}</TableCell>
                        <TableCell className="text-right">{req.required_kg.toFixed(2)}</TableCell>
                        <TableCell className="text-right">
                          <span className={req.issued_kg >= req.required_kg ? 'text-success' : ''}>
                            {req.issued_kg.toFixed(2)}
                          </span>
                        </TableCell>
                        <TableCell>
                          {req.due_date ? format(parseISO(req.due_date), 'dd-MMM-yy') : '—'}
                        </TableCell>
                        <TableCell>{getStatusBadge(req.status)}</TableCell>
                      </TableRow>
                    ))}
                    {workOrderRequirements.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                          No work order requirements found
                        </TableCell>
                      </TableRow>
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
