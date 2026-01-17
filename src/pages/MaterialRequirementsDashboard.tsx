import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { ChevronDown, ChevronRight, Plus, Package, AlertCircle, CheckCircle, Clock } from "lucide-react";
import { RawMaterialPOModal } from "@/components/procurement/RawMaterialPOModal";

interface MaterialRequirement {
  id: string;
  wo_id: string;
  so_id: string;
  material_grade: string;
  material_size_mm: number;
  alloy: string;
  qty_pcs: number;
  gross_wt_pc: number;
  net_wt_pc: number;
  total_gross_kg: number;
  total_net_kg: number;
  status: 'pending' | 'ordered' | 'partial' | 'fulfilled';
  customer: string;
  customer_id: string;
  due_date: string;
  wo_number?: string;
  inventory_kg: number;
  on_order_kg: number;
  surplus_deficit_kg: number;
}

interface GroupedRequirements {
  material_grade: string;
  alloy: string;
  total_required_kg: number;
  total_inventory_kg: number;
  total_on_order_kg: number;
  surplus_deficit_kg: number;
  wo_count: number;
  requirements: MaterialRequirement[];
  rpo_no: string | null;
}

interface SummaryMetrics {
  totalRequired: number;
  totalDeficit: number;
  onOrder: number;
  inInventory: number;
  issuedToWOs: number;
  criticalItems: number;
  openWOs: number;
}

export default function MaterialRequirementsDashboard() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [requirements, setRequirements] = useState<MaterialRequirement[]>([]);
  const [groupedRequirements, setGroupedRequirements] = useState<GroupedRequirements[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [summary, setSummary] = useState<SummaryMetrics>({
    totalRequired: 0,
    totalDeficit: 0,
    onOrder: 0,
    inInventory: 0,
    issuedToWOs: 0,
    criticalItems: 0,
    openWOs: 0
  });

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [filterMaterialGrade, setFilterMaterialGrade] = useState("all");
  const [filterAlloy, setFilterAlloy] = useState("all");
  const [filterCustomer, setFilterCustomer] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  // RPO Modal
  const [rpoModalOpen, setRpoModalOpen] = useState(false);
  const [selectedRequirement, setSelectedRequirement] = useState<MaterialRequirement | null>(null);

  // Unique filter values
  const [materialGrades, setMaterialGrades] = useState<string[]>([]);
  const [alloys, setAlloys] = useState<string[]>([]);
  const [customers, setCustomers] = useState<string[]>([]);

  useEffect(() => {
    loadRequirements();

    // Real-time subscription to ALL tables that affect material status
    const channel = supabase
      .channel('material-requirements-comprehensive')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'material_requirements_v2' },
        () => loadRequirements()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'material_lots' },
        () => loadRequirements()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'inventory_lots' },
        () => loadRequirements()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'raw_purchase_orders' },
        () => loadRequirements()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'raw_po_receipts' },
        () => loadRequirements()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'gate_register' },
        () => loadRequirements()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadRequirements = async () => {
    setLoading(true);

    try {
      // Fetch material requirements
      const { data: reqData, error: reqError } = await supabase
        .from('material_requirements_v2')
        .select(`
          *,
          work_orders!wo_id(wo_number, display_id)
        `)
        .order('due_date', { ascending: true });

      if (reqError) throw reqError;

      // Fetch inventory for each material grade - normalize size format
      const { data: invData, error: invError } = await supabase
        .from('material_lots')
        .select('material_size_mm, alloy, gross_weight, status')
        .in('status', ['received', 'in_use']);

      if (invError) throw invError;

      // Fetch On Order from approved/part_received RPOs
      const { data: rpoData, error: rpoError } = await supabase
        .from('raw_purchase_orders')
        .select('id, rpo_no, material_size_mm, alloy, qty_ordered_kg, status')
        .in('status', ['approved', 'part_received']);

      if (rpoError) throw rpoError;

      // Fetch receipt amounts to calculate remaining on order
      const { data: receiptData, error: receiptError } = await supabase
        .from('raw_po_receipts')
        .select('rpo_id, qty_received_kg');

      if (receiptError) throw receiptError;

      // Calculate received amounts per RPO
      const receivedMap = new Map<string, number>();
      receiptData?.forEach(r => {
        receivedMap.set(r.rpo_id, (receivedMap.get(r.rpo_id) || 0) + (r.qty_received_kg || 0));
      });

      // Calculate on order per alloy (remaining qty = ordered - received)
      const onOrderMap = new Map<string, { qty: number; rpoNo: string | null }>();
      rpoData?.forEach(rpo => {
        const received = receivedMap.get(rpo.id) || 0;
        const remaining = (rpo.qty_ordered_kg || 0) - received;
        if (remaining > 0) {
          const key = rpo.alloy?.toLowerCase() || '';
          const existing = onOrderMap.get(key) || { qty: 0, rpoNo: null };
          onOrderMap.set(key, { 
            qty: existing.qty + remaining,
            rpoNo: rpo.rpo_no || existing.rpoNo
          });
        }
      });

      // Calculate inventory per alloy (normalize by extracting numeric size)
      const inventoryMap = new Map<string, number>();
      invData?.forEach(lot => {
        // Use alloy as key for matching (more reliable than size)
        const key = lot.alloy?.toLowerCase() || '';
        inventoryMap.set(key, (inventoryMap.get(key) || 0) + (lot.gross_weight || 0));
      });

      // Also create size-based inventory map with normalized key
      const inventorySizeMap = new Map<string, number>();
      invData?.forEach(lot => {
        // Extract numeric size from strings like "22 mm", "22", "22 MM HEX"
        const sizeMatch = lot.material_size_mm?.match(/(\d+(?:\.\d+)?)/);
        const numericSize = sizeMatch ? sizeMatch[1] : lot.material_size_mm;
        if (numericSize) {
          inventorySizeMap.set(numericSize, (inventorySizeMap.get(numericSize) || 0) + (lot.gross_weight || 0));
        }
      });

      // Process requirements with inventory and on-order data
      const processedReqs = (reqData || []).map(req => {
        // Try matching by alloy first, then by size
        const alloyKey = req.alloy?.toLowerCase() || '';
        const sizeKey = req.material_size_mm?.toString() || '';
        
        const inventory_kg = inventoryMap.get(alloyKey) || inventorySizeMap.get(sizeKey) || 0;
        const onOrderInfo = onOrderMap.get(alloyKey) || { qty: 0, rpoNo: null };
        const on_order_kg = onOrderInfo.qty;
        const surplus_deficit_kg = (inventory_kg + on_order_kg) - req.total_gross_kg;
        
        return {
          ...req,
          wo_number: req.work_orders?.wo_number || req.work_orders?.display_id || 'N/A',
          inventory_kg,
          on_order_kg,
          surplus_deficit_kg
        } as MaterialRequirement;
      });

      setRequirements(processedReqs);

      // Extract unique values for filters
      const uniqueGrades = [...new Set(processedReqs.map(r => r.material_grade))];
      const uniqueAlloys = [...new Set(processedReqs.map(r => r.alloy))];
      const uniqueCustomers = [...new Set(processedReqs.map(r => r.customer))];

      setMaterialGrades(uniqueGrades.sort());
      setAlloys(uniqueAlloys.sort());
      setCustomers(uniqueCustomers.sort());

      // Calculate total inventory
      const totalInventory = invData?.reduce((sum, lot) => sum + (lot.gross_weight || 0), 0) || 0;

      // Calculate summary metrics
      const totalRequired = processedReqs.reduce((sum, r) => sum + r.total_gross_kg, 0);
      const totalOnOrder = processedReqs.reduce((sum, r) => sum + r.on_order_kg, 0);
      const totalDeficit = processedReqs
        .filter(r => r.surplus_deficit_kg < 0)
        .reduce((sum, r) => sum + Math.abs(r.surplus_deficit_kg), 0);
      const criticalItems = processedReqs.filter(r => r.surplus_deficit_kg < 0 && r.inventory_kg === 0 && r.on_order_kg === 0).length;

      setSummary({
        totalRequired,
        totalDeficit,
        onOrder: totalOnOrder,
        inInventory: totalInventory,
        issuedToWOs: 0, // Not tracked currently
        criticalItems,
        openWOs: processedReqs.length
      });

      // Group requirements by material grade + alloy
      groupRequirements(processedReqs, onOrderMap);

    } catch (error: any) {
      toast({
        title: "Error Loading Requirements",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const groupRequirements = (reqs: MaterialRequirement[], onOrderMap: Map<string, { qty: number; rpoNo: string | null }>) => {
    const grouped = new Map<string, GroupedRequirements>();

    reqs.forEach(req => {
      const key = req.material_grade;
      const alloyKey = req.alloy?.toLowerCase() || '';
      const onOrderInfo = onOrderMap.get(alloyKey) || { qty: 0, rpoNo: null };
      
      if (!grouped.has(key)) {
        grouped.set(key, {
          material_grade: key,
          alloy: req.alloy,
          total_required_kg: 0,
          total_inventory_kg: req.inventory_kg,
          total_on_order_kg: onOrderInfo.qty,
          surplus_deficit_kg: 0,
          wo_count: 0,
          requirements: [],
          rpo_no: onOrderInfo.rpoNo
        });
      }

      const group = grouped.get(key)!;
      group.total_required_kg += req.total_gross_kg;
      group.wo_count += 1;
      group.requirements.push(req);
    });

    // Calculate surplus/deficit for each group
    grouped.forEach((group, key) => {
      group.surplus_deficit_kg = (group.total_inventory_kg + group.total_on_order_kg) - group.total_required_kg;
      grouped.set(key, group);
    });

    setGroupedRequirements(Array.from(grouped.values()));
  };

  const filteredRequirements = requirements.filter(req => {
    const matchesSearch = 
      req.wo_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      req.customer.toLowerCase().includes(searchTerm.toLowerCase()) ||
      req.material_grade.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesMaterialGrade = filterMaterialGrade === "all" || req.material_grade === filterMaterialGrade;
    const matchesAlloy = filterAlloy === "all" || req.alloy === filterAlloy;
    const matchesCustomer = filterCustomer === "all" || req.customer === filterCustomer;
    const matchesStatus = filterStatus === "all" || req.status === filterStatus;

    return matchesSearch && matchesMaterialGrade && matchesAlloy && matchesCustomer && matchesStatus;
  });

  const toggleGroup = (materialGrade: string) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(materialGrade)) {
      newExpanded.delete(materialGrade);
    } else {
      newExpanded.add(materialGrade);
    }
    setExpandedGroups(newExpanded);
  };

  const handlePlaceOrder = (requirement: MaterialRequirement) => {
    setSelectedRequirement(requirement);
    setRpoModalOpen(true);
  };

  const getStatusBadge = (status: string, surplusDeficit: number) => {
    if (status === 'fulfilled' || surplusDeficit >= 0) {
      return <Badge className="bg-success text-success-foreground"><CheckCircle className="w-3 h-3 mr-1" />In Stock</Badge>;
    } else if (status === 'ordered') {
      return <Badge className="bg-primary text-primary-foreground"><Clock className="w-3 h-3 mr-1" />On Order</Badge>;
    } else {
      return <Badge variant="destructive"><AlertCircle className="w-3 h-3 mr-1" />Deficit</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="p-6">
          <div className="text-center">Loading requirements...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="p-6 space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Required</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.totalRequired.toFixed(0)} kg</div>
            </CardContent>
          </Card>

          <Card className="bg-destructive/10 border-destructive/30">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-destructive">Total Deficit</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">{summary.totalDeficit.toFixed(0)} kg</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">On Order</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">{summary.onOrder.toFixed(0)} kg</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">In Inventory</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-success">{summary.inInventory.toFixed(0)} kg</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Issued to WOs</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.issuedToWOs.toFixed(0)} kg</div>
            </CardContent>
          </Card>

          <Card className="bg-destructive/5 border-destructive/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-destructive">Critical Items</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">{summary.criticalItems}</div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle>Filters</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <Input
                placeholder="Search WO, Customer, Material..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              
              <Select value={filterMaterialGrade} onValueChange={setFilterMaterialGrade}>
                <SelectTrigger>
                  <SelectValue placeholder="Material Grade" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Grades</SelectItem>
                  {materialGrades.map(grade => (
                    <SelectItem key={grade} value={grade}>{grade}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={filterAlloy} onValueChange={setFilterAlloy}>
                <SelectTrigger>
                  <SelectValue placeholder="Alloy" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Alloys</SelectItem>
                  {alloys.map(alloy => (
                    <SelectItem key={alloy} value={alloy}>{alloy}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={filterCustomer} onValueChange={setFilterCustomer}>
                <SelectTrigger>
                  <SelectValue placeholder="Customer" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Customers</SelectItem>
                  {customers.map(customer => (
                    <SelectItem key={customer} value={customer}>{customer}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="ordered">Ordered</SelectItem>
                  <SelectItem value="partial">Partial</SelectItem>
                  <SelectItem value="fulfilled">Fulfilled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Grouped Requirements */}
        <Card>
          <CardHeader>
            <CardTitle>Material Requirements by Grade</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {groupedRequirements
              .filter(group => 
                filterMaterialGrade === "all" || group.material_grade === filterMaterialGrade
              )
              .map(group => (
                <Collapsible
                  key={group.material_grade}
                  open={expandedGroups.has(group.material_grade)}
                  onOpenChange={() => toggleGroup(group.material_grade)}
                >
                  <CollapsibleTrigger className="w-full">
                    <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg hover:bg-muted transition-colors">
                      <div className="flex items-center gap-3">
                        {expandedGroups.has(group.material_grade) ? (
                          <ChevronDown className="w-5 h-5" />
                        ) : (
                          <ChevronRight className="w-5 h-5" />
                        )}
                        <Package className="w-5 h-5 text-muted-foreground" />
                        <div className="text-left">
                          <div className="font-semibold">{group.material_grade}</div>
                          <div className="text-sm text-muted-foreground">{group.wo_count} active WOs</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-6">
                        <div className="text-right">
                          <div className="text-sm text-muted-foreground">Required</div>
                          <div className="font-semibold">{group.total_required_kg.toFixed(2)} kg</div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm text-muted-foreground">Inventory</div>
                          <div className="font-semibold">{group.total_inventory_kg.toFixed(2)} kg</div>
                        </div>
                        <div className="text-right min-w-[120px]">
                          <div className="text-sm text-muted-foreground">Surplus/Deficit</div>
                          <Badge variant={group.surplus_deficit_kg >= 0 ? "default" : "destructive"}>
                            {group.surplus_deficit_kg >= 0 ? '+' : ''}{group.surplus_deficit_kg.toFixed(2)} kg
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="mt-2 border rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>WO ID</TableHead>
                            <TableHead>Customer</TableHead>
                            <TableHead>Alloy</TableHead>
                            <TableHead className="text-right">Qty (pcs)</TableHead>
                            <TableHead className="text-right">Net Wt (kg)</TableHead>
                            <TableHead className="text-right">Gross Wt (kg)</TableHead>
                            <TableHead className="text-right">Inventory (kg)</TableHead>
                            <TableHead className="text-right">Surplus/Deficit</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Action</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {group.requirements
                            .filter(req => 
                              filteredRequirements.some(fr => fr.id === req.id)
                            )
                            .map(req => (
                              <TableRow key={req.id} className="hover:bg-muted/50">
                                <TableCell className="font-medium">{req.wo_number}</TableCell>
                                <TableCell>{req.customer}</TableCell>
                                <TableCell>{req.alloy}</TableCell>
                                <TableCell className="text-right">{req.qty_pcs}</TableCell>
                                <TableCell className="text-right">{req.total_net_kg.toFixed(3)}</TableCell>
                                <TableCell className="text-right">{req.total_gross_kg.toFixed(3)}</TableCell>
                                <TableCell className="text-right">{req.inventory_kg.toFixed(3)}</TableCell>
                                <TableCell className="text-right">
                                  <Badge variant={req.surplus_deficit_kg >= 0 ? "default" : "destructive"}>
                                    {req.surplus_deficit_kg >= 0 ? '+' : ''}{req.surplus_deficit_kg.toFixed(3)} kg
                                  </Badge>
                                </TableCell>
                                <TableCell>{getStatusBadge(req.status, req.surplus_deficit_kg)}</TableCell>
                                <TableCell>
                                  {req.surplus_deficit_kg < 0 && req.status === 'pending' && (
                                    <Button
                                      size="sm"
                                      onClick={() => handlePlaceOrder(req)}
                                    >
                                      <Plus className="w-4 h-4 mr-1" />
                                      Place Order
                                    </Button>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              ))}
          </CardContent>
        </Card>
      </div>

      {/* Raw Material PO Modal */}
      {selectedRequirement && (
        <RawMaterialPOModal
          open={rpoModalOpen}
          onClose={() => {
            setRpoModalOpen(false);
            setSelectedRequirement(null);
          }}
          materialGrade={selectedRequirement.material_grade}
          alloy={selectedRequirement.alloy}
          deficitKg={Math.abs(selectedRequirement.surplus_deficit_kg)}
          linkedWOIds={[selectedRequirement.wo_id]}
          linkedRequirementIds={[selectedRequirement.id]}
          onSuccess={() => {
            loadRequirements();
            toast({
              title: "Purchase Order Created",
              description: "Material requirement has been ordered successfully."
            });
          }}
        />
      )}
    </div>
  );
}
