import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Download, FileSpreadsheet, ShoppingCart, Package, AlertTriangle, CheckCircle, Clock, TrendingUp, Layers } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight } from "lucide-react";
import { RPOModal } from "@/components/RPOModal";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Home } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface WorkOrderMaterial {
  wo_id: string;
  display_id: string;
  item_code: string;
  customer: string;
  customer_id: string | null;
  quantity: number;
  due_date: string;
  material_size_mm: string;
  material_grade: string;
  shape: string;
  alloy: string;
  gross_weight_per_pc: number;
  net_weight_per_pc: number;
  total_gross_kg: number;
  total_net_kg: number;
  current_stage: string;
  so_id: string | null;
  so_display_id: string | null;
  priority: number;
}

interface MaterialGroup {
  key: string;
  material_grade: string;
  shape: string;
  size_mm: string;
  alloy: string;
  total_required_kg: number;
  total_required_pcs: number;
  inventory_kg: number;
  issued_kg: number;
  surplus_deficit_kg: number;
  on_order_kg: number;
  pending_receipt_kg: number;
  work_orders: WorkOrderMaterial[];
  rpo_status: 'none' | 'draft' | 'pending_approval' | 'approved' | 'part_received' | 'closed';
  rpo_no: string | null;
  urgency: 'critical' | 'high' | 'medium' | 'low';
}

interface SummaryStats {
  totalRequiredKg: number;
  totalDeficitKg: number;
  totalOnOrderKg: number;
  totalInventoryKg: number;
  totalIssuedKg: number;
  openWoCount: number;
  criticalCount: number;
  pendingPoCount: number;
}

interface MasterGrade {
  id: string;
  name: string;
  category: string;
}

interface MasterShape {
  id: string;
  name: string;
}

interface MasterSize {
  id: string;
  size_value: number;
  display_label: string;
}

export default function MaterialRequirements() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [workOrders, setWorkOrders] = useState<WorkOrderMaterial[]>([]);
  const [inventoryData, setInventoryData] = useState<Map<string, number>>(new Map());
  const [issuedData, setIssuedData] = useState<Map<string, number>>(new Map());
  const [rpoData, setRpoData] = useState<any[]>([]);
  
  // Master data
  const [masterGrades, setMasterGrades] = useState<MasterGrade[]>([]);
  const [masterShapes, setMasterShapes] = useState<MasterShape[]>([]);
  const [masterSizes, setMasterSizes] = useState<MasterSize[]>([]);
  
  // Filters
  const [filterGrade, setFilterGrade] = useState("all");
  const [filterShape, setFilterShape] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterCustomer, setFilterCustomer] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [viewMode, setViewMode] = useState<"grouped" | "detailed">("grouped");
  
  // Expanded groups
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  
  // RPO Modal
  const [rpoModalOpen, setRpoModalOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<MaterialGroup | null>(null);

  // Session
  const [session, setSession] = useState<any>(null);
  const [sessionChecked, setSessionChecked] = useState(false);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setSessionChecked(true);
      if (nextSession) loadAllData();
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setSessionChecked(true);
      if (session) loadAllData();
    });

    // Realtime subscription
    const channel = supabase
      .channel('material-requirements-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_orders' }, loadAllData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_lots' }, loadAllData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'raw_purchase_orders' }, loadAllData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wo_material_issues' }, loadAllData)
      .subscribe();

    return () => {
      subscription.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, []);

  const loadAllData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadMasterData(),
        loadWorkOrders(),
        loadInventory(),
        loadIssuedMaterials(),
        loadRPOs()
      ]);
    } catch (error: any) {
      toast({ variant: "destructive", description: `Failed to load data: ${error.message}` });
    } finally {
      setLoading(false);
    }
  };

  const loadMasterData = async () => {
    const [gradesRes, shapesRes, sizesRes] = await Promise.all([
      supabase.from('material_grades').select('id, name, category').order('name'),
      supabase.from('cross_section_shapes').select('id, name').order('name'),
      supabase.from('nominal_sizes').select('id, size_value, display_label').order('size_value')
    ]);
    
    if (gradesRes.data) setMasterGrades(gradesRes.data);
    if (shapesRes.data) setMasterShapes(shapesRes.data);
    if (sizesRes.data) setMasterSizes(sizesRes.data);
  };

  const loadWorkOrders = async () => {
    // Get WOs that need material (goods_in stage, not yet in production)
    const { data, error } = await supabase
      .from('work_orders')
      .select('id, display_id, item_code, customer, customer_id, quantity, due_date, material_size_mm, gross_weight_per_pc, net_weight_per_pc, current_stage, so_id, priority, financial_snapshot')
      .in('current_stage', ['goods_in', 'cutting'] as any)
      .order('due_date', { ascending: true });

    if (error) throw error;

    const processed = (data || []).map(wo => {
      // Extract material info from various sources
      const financialSnapshot = wo.financial_snapshot as any;
      const lineItem = financialSnapshot?.line_item || {};
      
      // Parse material_size_mm to extract shape and size
      const sizeStr = wo.material_size_mm || '';
      const { shape, size } = parseSize(sizeStr);
      
      // Get alloy from financial snapshot or material grade
      const alloy = lineItem?.alloy || extractAlloy(sizeStr) || '';
      const grade = lineItem?.material_grade || `${size}mm ${shape}`.trim();

      return {
        wo_id: wo.id,
        display_id: wo.display_id || wo.id.slice(0, 8),
        item_code: wo.item_code || '',
        customer: wo.customer || '',
        customer_id: wo.customer_id,
        quantity: wo.quantity || 0,
        due_date: wo.due_date,
        material_size_mm: sizeStr,
        material_grade: grade,
        shape: shape,
        alloy: alloy,
        gross_weight_per_pc: wo.gross_weight_per_pc || 0,
        net_weight_per_pc: wo.net_weight_per_pc || 0,
        total_gross_kg: ((wo.quantity || 0) * (wo.gross_weight_per_pc || 0)) / 1000,
        total_net_kg: ((wo.quantity || 0) * (wo.net_weight_per_pc || 0)) / 1000,
        current_stage: wo.current_stage || 'goods_in',
        so_id: wo.so_id,
        so_display_id: null, // Will be fetched separately if needed
        priority: wo.priority || 3
      };
    });

    setWorkOrders(processed);
  };

  const parseSize = (sizeStr: string): { shape: string; size: string } => {
    if (!sizeStr) return { shape: '', size: '' };
    
    const normalized = sizeStr.toUpperCase().trim();
    
    // Extract shape
    let shape = 'ROUND';
    if (normalized.includes('HEX')) shape = 'HEX';
    else if (normalized.includes('SQUARE') || normalized.includes('SQ')) shape = 'SQUARE';
    else if (normalized.includes('FLAT')) shape = 'FLAT';
    else if (normalized.includes('TUBE') || normalized.includes('HOLLOW')) shape = 'TUBE';
    else if (normalized.includes('PIPE')) shape = 'PIPE';
    else if (normalized.includes('RECT')) shape = 'RECTANGLE';
    
    // Extract size number
    const numMatch = normalized.match(/(\d+(?:\.\d+)?)/);
    const size = numMatch ? numMatch[1] : '';
    
    return { shape, size };
  };

  const extractAlloy = (sizeStr: string): string => {
    if (!sizeStr) return '';
    const upper = sizeStr.toUpperCase();
    
    // Common alloy patterns
    const alloyPatterns = ['CW614N', 'CW617N', 'CW602N', 'C36000', 'C38500', 'SS304', 'SS316', 'SS316L'];
    for (const pattern of alloyPatterns) {
      if (upper.includes(pattern)) return pattern;
    }
    return '';
  };

  const loadInventory = async () => {
    const { data, error } = await supabase
      .from('inventory_lots')
      .select('material_size_mm, alloy, qty_kg');

    if (error) throw error;

    const inventoryMap = new Map<string, number>();
    (data || []).forEach(lot => {
      const key = normalizeKey(lot.material_size_mm || '', lot.alloy || '');
      const qtyValue = lot.qty_kg ? parseFloat(String(lot.qty_kg)) : 0;
      inventoryMap.set(key, (inventoryMap.get(key) || 0) + qtyValue);
    });

    setInventoryData(inventoryMap);
  };

  const loadIssuedMaterials = async () => {
    const { data, error } = await supabase
      .from('wo_material_issues')
      .select('wo_id, quantity_kg');

    if (error) throw error;

    const issuedMap = new Map<string, number>();
    (data || []).forEach(issue => {
      const qtyValue = issue.quantity_kg ? parseFloat(String(issue.quantity_kg)) : 0;
      issuedMap.set(issue.wo_id, (issuedMap.get(issue.wo_id) || 0) + qtyValue);
    });

    setIssuedData(issuedMap);
  };

  const loadRPOs = async () => {
    const { data, error } = await supabase
      .from('raw_purchase_orders')
      .select('*')
      .in('status', ['pending_approval', 'approved', 'part_received']);

    if (error) throw error;
    setRpoData(data || []);
  };

  const normalizeKey = (size: string, alloy: string): string => {
    const { shape, size: sizeNum } = parseSize(size || '');
    return `${sizeNum}-${shape}-${(alloy || '').toUpperCase()}`.replace(/\s+/g, '');
  };

  // Compute grouped materials
  const groupedMaterials = useMemo((): MaterialGroup[] => {
    const groups = new Map<string, MaterialGroup>();

    workOrders.forEach(wo => {
      const key = `${wo.shape}-${parseSize(wo.material_size_mm).size}-${wo.alloy}`;
      
      if (!groups.has(key)) {
        const invKey = normalizeKey(wo.material_size_mm, wo.alloy);
        const inventoryKg = inventoryData.get(invKey) || 0;
        
        // Find related RPO
        const relatedRPO = rpoData.find(rpo => {
          const rpoKey = normalizeKey(rpo.material_size_mm, rpo.alloy);
          return rpoKey === invKey;
        });

        groups.set(key, {
          key,
          material_grade: wo.material_grade,
          shape: wo.shape,
          size_mm: parseSize(wo.material_size_mm).size,
          alloy: wo.alloy,
          total_required_kg: 0,
          total_required_pcs: 0,
          inventory_kg: inventoryKg,
          issued_kg: 0,
          surplus_deficit_kg: inventoryKg,
          on_order_kg: relatedRPO ? parseFloat(relatedRPO.qty_ordered_kg || 0) : 0,
          pending_receipt_kg: 0,
          work_orders: [],
          rpo_status: relatedRPO?.status || 'none',
          rpo_no: relatedRPO?.rpo_no || null,
          urgency: 'low'
        });
      }

      const group = groups.get(key)!;
      group.total_required_kg += wo.total_gross_kg;
      group.total_required_pcs += wo.quantity;
      group.issued_kg += issuedData.get(wo.wo_id) || 0;
      group.work_orders.push(wo);
    });

    // Calculate surplus/deficit and urgency
    groups.forEach((group, key) => {
      group.surplus_deficit_kg = group.inventory_kg + group.on_order_kg - group.total_required_kg;
      
      // Calculate urgency based on deficit and due dates
      const hasDeficit = group.surplus_deficit_kg < 0;
      const earliestDue = Math.min(...group.work_orders.map(wo => new Date(wo.due_date).getTime()));
      const daysUntilDue = Math.ceil((earliestDue - Date.now()) / (1000 * 60 * 60 * 24));
      
      if (hasDeficit && daysUntilDue <= 7) group.urgency = 'critical';
      else if (hasDeficit && daysUntilDue <= 14) group.urgency = 'high';
      else if (hasDeficit) group.urgency = 'medium';
      else group.urgency = 'low';

      groups.set(key, group);
    });

    return Array.from(groups.values()).sort((a, b) => {
      const urgencyOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
    });
  }, [workOrders, inventoryData, issuedData, rpoData]);

  // Filter groups
  const filteredGroups = useMemo(() => {
    return groupedMaterials.filter(group => {
      if (filterGrade !== "all" && !group.alloy.toUpperCase().includes(filterGrade.toUpperCase())) return false;
      if (filterShape !== "all" && group.shape !== filterShape) return false;
      if (filterStatus === "deficit" && group.surplus_deficit_kg >= 0) return false;
      if (filterStatus === "covered" && group.surplus_deficit_kg < 0) return false;
      if (filterCustomer !== "all" && !group.work_orders.some(wo => wo.customer === filterCustomer)) return false;
      if (searchTerm && !group.material_grade.toLowerCase().includes(searchTerm.toLowerCase()) &&
          !group.alloy.toLowerCase().includes(searchTerm.toLowerCase())) return false;
      return true;
    });
  }, [groupedMaterials, filterGrade, filterShape, filterStatus, filterCustomer, searchTerm]);

  // Summary stats
  const summaryStats = useMemo((): SummaryStats => {
    return filteredGroups.reduce((acc, group) => ({
      totalRequiredKg: acc.totalRequiredKg + group.total_required_kg,
      totalDeficitKg: acc.totalDeficitKg + (group.surplus_deficit_kg < 0 ? Math.abs(group.surplus_deficit_kg) : 0),
      totalOnOrderKg: acc.totalOnOrderKg + group.on_order_kg,
      totalInventoryKg: acc.totalInventoryKg + group.inventory_kg,
      totalIssuedKg: acc.totalIssuedKg + group.issued_kg,
      openWoCount: acc.openWoCount + group.work_orders.length,
      criticalCount: acc.criticalCount + (group.urgency === 'critical' ? 1 : 0),
      pendingPoCount: acc.pendingPoCount + (group.rpo_status !== 'none' && group.rpo_status !== 'closed' ? 1 : 0)
    }), {
      totalRequiredKg: 0,
      totalDeficitKg: 0,
      totalOnOrderKg: 0,
      totalInventoryKg: 0,
      totalIssuedKg: 0,
      openWoCount: 0,
      criticalCount: 0,
      pendingPoCount: 0
    });
  }, [filteredGroups]);

  // Get unique customers for filter
  const uniqueCustomers = useMemo(() => {
    return [...new Set(workOrders.map(wo => wo.customer).filter(Boolean))].sort();
  }, [workOrders]);

  const toggleGroup = (key: string) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(key)) newExpanded.delete(key);
    else newExpanded.add(key);
    setExpandedGroups(newExpanded);
  };

  const handlePlaceOrder = (group: MaterialGroup) => {
    setSelectedGroup(group);
    setRpoModalOpen(true);
  };

  const getUrgencyBadge = (urgency: string) => {
    switch (urgency) {
      case 'critical':
        return <Badge variant="destructive"><AlertTriangle className="w-3 h-3 mr-1" />Critical</Badge>;
      case 'high':
        return <Badge className="bg-orange-500 text-white"><Clock className="w-3 h-3 mr-1" />High</Badge>;
      case 'medium':
        return <Badge variant="secondary"><TrendingUp className="w-3 h-3 mr-1" />Medium</Badge>;
      default:
        return <Badge variant="outline"><CheckCircle className="w-3 h-3 mr-1" />OK</Badge>;
    }
  };

  const getStatusBadge = (status: string, rpoNo: string | null) => {
    switch (status) {
      case 'draft':
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 dark:bg-blue-950">{rpoNo}</Badge>;
      case 'pending_approval':
        return <Badge className="bg-amber-500 text-white">{rpoNo}</Badge>;
      case 'approved':
        return <Badge className="bg-green-600 text-white">{rpoNo}</Badge>;
      case 'part_received':
        return <Badge className="bg-purple-600 text-white">{rpoNo}</Badge>;
      default:
        return <Badge variant="outline">No PO</Badge>;
    }
  };

  const exportToExcel = async () => {
    const data = filteredGroups.flatMap(group => 
      group.work_orders.map(wo => ({
        "Material Grade": group.material_grade,
        "Shape": group.shape,
        "Size (mm)": group.size_mm,
        "Alloy": group.alloy,
        "WO Number": wo.display_id,
        "Item Code": wo.item_code,
        "Customer": wo.customer,
        "Qty (pcs)": wo.quantity,
        "Gross Wt (kg)": wo.total_gross_kg.toFixed(2),
        "Net Wt (kg)": wo.total_net_kg.toFixed(2),
        "Due Date": wo.due_date,
        "Inventory (kg)": group.inventory_kg.toFixed(2),
        "On Order (kg)": group.on_order_kg.toFixed(2),
        "Surplus/Deficit (kg)": group.surplus_deficit_kg.toFixed(2),
        "RPO Status": group.rpo_status,
        "RPO No": group.rpo_no || '',
        "Urgency": group.urgency
      }))
    );

    const XLSX = await import("xlsx");
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Material Requirements");
    XLSX.writeFile(wb, `Material_Requirements_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  if (!sessionChecked) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent" />
          <p className="mt-4 text-muted-foreground">Checking session...</p>
        </div>
      </div>
    );
  }

  if (sessionChecked && !session) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>Login Required</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">Please log in to view Material Requirements.</p>
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
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent" />
          <p className="mt-4 text-muted-foreground">Loading material requirements...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="p-6">
        {/* Breadcrumb */}
        <Breadcrumb className="mb-6">
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/" className="flex items-center gap-1">
                <Home className="h-4 w-4" />Home
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Material Requirements</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold">Material Requirements Dashboard</h1>
            <p className="text-muted-foreground mt-1">
              Single source of truth for material planning • {summaryStats.openWoCount} Work Orders
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={exportToExcel}>
              <FileSpreadsheet className="w-4 h-4 mr-2" />Export Excel
            </Button>
            <Button onClick={() => navigate('/purchase/raw-po')}>
              <Package className="w-4 h-4 mr-2" />View All RPOs
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-6">
          <Card className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900 border-blue-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-blue-700 dark:text-blue-300">Total Required</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-900 dark:text-blue-100">{summaryStats.totalRequiredKg.toFixed(0)} kg</div>
            </CardContent>
          </Card>

          <Card className={`border-2 ${summaryStats.totalDeficitKg > 0 ? 'bg-red-50 dark:bg-red-950 border-red-300' : 'bg-green-50 dark:bg-green-950 border-green-300'}`}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Total Deficit</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${summaryStats.totalDeficitKg > 0 ? 'text-red-600' : 'text-green-600'}`}>
                {summaryStats.totalDeficitKg.toFixed(0)} kg
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">On Order</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">{summaryStats.totalOnOrderKg.toFixed(0)} kg</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">In Inventory</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{summaryStats.totalInventoryKg.toFixed(0)} kg</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Issued to WOs</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summaryStats.totalIssuedKg.toFixed(0)} kg</div>
            </CardContent>
          </Card>

          <Card className={summaryStats.criticalCount > 0 ? 'bg-red-50 dark:bg-red-950 border-red-300' : ''}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Critical Items</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${summaryStats.criticalCount > 0 ? 'text-red-600' : ''}`}>
                {summaryStats.criticalCount}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Layers className="w-4 h-4" />Filters
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <Input
                placeholder="Search grade, alloy..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              
              <Select value={filterGrade} onValueChange={setFilterGrade}>
                <SelectTrigger>
                  <SelectValue placeholder="All Grades" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Grades</SelectItem>
                  {masterGrades.map(g => (
                    <SelectItem key={g.id} value={g.name}>{g.name} ({g.category})</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={filterShape} onValueChange={setFilterShape}>
                <SelectTrigger>
                  <SelectValue placeholder="All Shapes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Shapes</SelectItem>
                  {masterShapes.map(s => (
                    <SelectItem key={s.id} value={s.name.toUpperCase()}>{s.name.toUpperCase()}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="deficit">⚠️ Deficit Only</SelectItem>
                  <SelectItem value="covered">✓ Covered Only</SelectItem>
                </SelectContent>
              </Select>

              <Select value={filterCustomer} onValueChange={setFilterCustomer}>
                <SelectTrigger>
                  <SelectValue placeholder="All Customers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Customers</SelectItem>
                  {uniqueCustomers.map(c => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={viewMode} onValueChange={(v) => setViewMode(v as any)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="grouped">Grouped View</SelectItem>
                  <SelectItem value="detailed">Detailed View</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Main Content */}
        <Card>
          <CardContent className="p-0">
            {filteredGroups.length === 0 ? (
              <div className="text-center py-12">
                <Package className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-lg font-medium">No material requirements found</p>
                <p className="text-muted-foreground mb-4">Work orders in goods_in stage will appear here</p>
                <Button onClick={() => navigate('/work-orders')} variant="outline">View Work Orders</Button>
              </div>
            ) : viewMode === "grouped" ? (
              <div className="divide-y">
                {filteredGroups.map(group => (
                  <Collapsible
                    key={group.key}
                    open={expandedGroups.has(group.key)}
                    onOpenChange={() => toggleGroup(group.key)}
                  >
                    <CollapsibleTrigger className="w-full">
                      <div className={`flex items-center justify-between p-4 hover:bg-muted/50 transition-colors ${group.surplus_deficit_kg < 0 ? 'bg-red-50/50 dark:bg-red-950/30' : ''}`}>
                        <div className="flex items-center gap-4">
                          {expandedGroups.has(group.key) ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                          <div className="text-left">
                            <div className="font-semibold flex items-center gap-2">
                              {group.size_mm}mm {group.shape}
                              {group.alloy && <Badge variant="outline">{group.alloy}</Badge>}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {group.work_orders.length} WOs • {group.total_required_pcs.toLocaleString()} pcs
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-6">
                          <div className="text-right">
                            <div className="text-sm text-muted-foreground">Required</div>
                            <div className="font-semibold">{group.total_required_kg.toFixed(1)} kg</div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm text-muted-foreground">Inventory</div>
                            <div className="font-semibold text-green-600">{group.inventory_kg.toFixed(1)} kg</div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm text-muted-foreground">On Order</div>
                            <div className="font-semibold text-blue-600">{group.on_order_kg.toFixed(1)} kg</div>
                          </div>
                          <div className="text-right min-w-[100px]">
                            <div className="text-sm text-muted-foreground">Balance</div>
                            <Badge variant={group.surplus_deficit_kg >= 0 ? "default" : "destructive"} className={group.surplus_deficit_kg >= 0 ? "bg-green-600" : ""}>
                              {group.surplus_deficit_kg >= 0 ? '+' : ''}{group.surplus_deficit_kg.toFixed(1)} kg
                            </Badge>
                          </div>
                          <div className="min-w-[80px]">{getUrgencyBadge(group.urgency)}</div>
                          <div className="min-w-[100px]">{getStatusBadge(group.rpo_status, group.rpo_no)}</div>
                        </div>
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="border-t bg-muted/30">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>WO Number</TableHead>
                              <TableHead>Item Code</TableHead>
                              <TableHead>Customer</TableHead>
                              <TableHead className="text-right">Qty (pcs)</TableHead>
                              <TableHead className="text-right">Gross Wt (kg)</TableHead>
                              <TableHead className="text-right">Net Wt (kg)</TableHead>
                              <TableHead>Due Date</TableHead>
                              <TableHead>SO Reference</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {group.work_orders.map(wo => (
                              <TableRow key={wo.wo_id} className="hover:bg-muted/50">
                                <TableCell>
                                  <Button variant="link" className="p-0 h-auto" onClick={() => navigate(`/work-orders/${wo.wo_id}`)}>
                                    {wo.display_id}
                                  </Button>
                                </TableCell>
                                <TableCell className="font-medium">{wo.item_code}</TableCell>
                                <TableCell>{wo.customer}</TableCell>
                                <TableCell className="text-right">{wo.quantity.toLocaleString()}</TableCell>
                                <TableCell className="text-right">{wo.total_gross_kg.toFixed(2)}</TableCell>
                                <TableCell className="text-right">{wo.total_net_kg.toFixed(2)}</TableCell>
                                <TableCell>{new Date(wo.due_date).toLocaleDateString()}</TableCell>
                                <TableCell>
                                  {wo.so_display_id ? (
                                    <Badge variant="outline" className="cursor-pointer" onClick={() => navigate(`/sales`)}>
                                      {wo.so_display_id}
                                    </Badge>
                                  ) : '-'}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                        <div className="p-4 flex justify-end border-t">
                          {group.surplus_deficit_kg < 0 && group.rpo_status === 'none' && (
                            <Button onClick={() => handlePlaceOrder(group)}>
                              <ShoppingCart className="w-4 h-4 mr-2" />
                              Create RPO ({Math.abs(group.surplus_deficit_kg).toFixed(1)} kg deficit)
                            </Button>
                          )}
                          {group.rpo_no && (
                            <Button variant="outline" onClick={() => navigate(`/purchase/raw-po?rpo_no=${group.rpo_no}`)}>
                              View {group.rpo_no}
                            </Button>
                          )}
                        </div>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                ))}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Material</TableHead>
                    <TableHead>Shape</TableHead>
                    <TableHead>Alloy</TableHead>
                    <TableHead>WO Count</TableHead>
                    <TableHead className="text-right">Required (kg)</TableHead>
                    <TableHead className="text-right">Inventory (kg)</TableHead>
                    <TableHead className="text-right">On Order (kg)</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead>Urgency</TableHead>
                    <TableHead>PO Status</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredGroups.map(group => (
                    <TableRow key={group.key} className={group.surplus_deficit_kg < 0 ? 'bg-red-50/50 dark:bg-red-950/30' : ''}>
                      <TableCell className="font-medium">{group.size_mm}mm</TableCell>
                      <TableCell>{group.shape}</TableCell>
                      <TableCell>{group.alloy || '-'}</TableCell>
                      <TableCell>{group.work_orders.length}</TableCell>
                      <TableCell className="text-right">{group.total_required_kg.toFixed(1)}</TableCell>
                      <TableCell className="text-right text-green-600">{group.inventory_kg.toFixed(1)}</TableCell>
                      <TableCell className="text-right text-blue-600">{group.on_order_kg.toFixed(1)}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant={group.surplus_deficit_kg >= 0 ? "default" : "destructive"} className={group.surplus_deficit_kg >= 0 ? "bg-green-600" : ""}>
                          {group.surplus_deficit_kg >= 0 ? '+' : ''}{group.surplus_deficit_kg.toFixed(1)}
                        </Badge>
                      </TableCell>
                      <TableCell>{getUrgencyBadge(group.urgency)}</TableCell>
                      <TableCell>{getStatusBadge(group.rpo_status, group.rpo_no)}</TableCell>
                      <TableCell>
                        {group.surplus_deficit_kg < 0 && group.rpo_status === 'none' && (
                          <Button size="sm" onClick={() => handlePlaceOrder(group)}>
                            <ShoppingCart className="w-3 h-3 mr-1" />Order
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* RPO Modal */}
      {selectedGroup && (
        <RPOModal
          open={rpoModalOpen}
          onClose={() => {
            setRpoModalOpen(false);
            setSelectedGroup(null);
          }}
          materialSize={`${selectedGroup.size_mm} ${selectedGroup.shape}`}
          suggestedAlloy={selectedGroup.alloy}
          deficitKg={Math.abs(selectedGroup.surplus_deficit_kg)}
          linkedWorkOrders={selectedGroup.work_orders.map(wo => ({
            wo_number: wo.display_id,
            id: wo.wo_id,
            item_code: wo.item_code,
            customer: wo.customer,
            quantity: wo.quantity
          }))}
          linkedSalesOrders={selectedGroup.work_orders
            .filter(wo => wo.so_display_id)
            .map(wo => ({
              so_id: wo.so_display_id!,
              customer: wo.customer,
              pcs: wo.quantity,
              id: wo.so_id!
            }))}
          onSuccess={() => {
            loadAllData();
            toast({ title: "Success", description: "RPO created successfully" });
          }}
        />
      )}
    </div>
  );
}
