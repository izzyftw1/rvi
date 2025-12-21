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
  surplus_deficit_kg: number;
}

interface GroupedRequirements {
  material_grade: string;
  total_required_kg: number;
  total_inventory_kg: number;
  surplus_deficit_kg: number;
  wo_count: number;
  requirements: MaterialRequirement[];
}

interface SummaryMetrics {
  totalRequired: number;
  totalDeficit: number;
  pendingPOs: number;
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
    pendingPOs: 0,
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

    // Real-time subscription
    const channel = supabase
      .channel('material-requirements-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'material_requirements_v2'
        },
        () => {
          loadRequirements();
        }
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

      // Fetch inventory for each material grade
      const { data: invData, error: invError } = await supabase
        .from('material_lots')
        .select('material_size_mm, gross_weight, status')
        .in('status', ['received', 'in_use']);

      if (invError) throw invError;

      // Calculate inventory per material size
      const inventoryMap = new Map<string, number>();
      invData?.forEach(lot => {
        const key = lot.material_size_mm;
        inventoryMap.set(key, (inventoryMap.get(key) || 0) + (lot.gross_weight || 0));
      });

      // Process requirements with inventory data
      const processedReqs = (reqData || []).map(req => {
        const inventory_kg = inventoryMap.get(req.material_size_mm.toString()) || 0;
        const surplus_deficit_kg = inventory_kg - req.total_gross_kg;
        
        return {
          ...req,
          wo_number: req.work_orders?.wo_number || req.work_orders?.display_id || 'N/A',
          inventory_kg,
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

      // Calculate summary
      const totalRequired = processedReqs.reduce((sum, r) => sum + r.total_gross_kg, 0);
      const totalDeficit = processedReqs
        .filter(r => r.surplus_deficit_kg < 0)
        .reduce((sum, r) => sum + Math.abs(r.surplus_deficit_kg), 0);
      
      const { count: pendingPOs } = await supabase
        .from('raw_purchase_orders')
        .select('*', { count: 'exact', head: true })
        .in('status', ['draft', 'pending_approval']);

      setSummary({
        totalRequired,
        totalDeficit,
        pendingPOs: pendingPOs || 0,
        openWOs: processedReqs.length
      });

      // Group requirements by material grade
      groupRequirements(processedReqs);

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

  const groupRequirements = (reqs: MaterialRequirement[]) => {
    const grouped = new Map<string, GroupedRequirements>();

    reqs.forEach(req => {
      const key = req.material_grade;
      
      if (!grouped.has(key)) {
        grouped.set(key, {
          material_grade: key,
          total_required_kg: 0,
          total_inventory_kg: req.inventory_kg,
          surplus_deficit_kg: 0,
          wo_count: 0,
          requirements: []
        });
      }

      const group = grouped.get(key)!;
      group.total_required_kg += req.total_gross_kg;
      group.wo_count += 1;
      group.requirements.push(req);
    });

    // Calculate surplus/deficit for each group
    grouped.forEach((group, key) => {
      group.surplus_deficit_kg = group.total_inventory_kg - group.total_required_kg;
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
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Required (kg)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.totalRequired.toFixed(2)}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Deficit Materials (kg)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">{summary.totalDeficit.toFixed(2)}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Pending POs</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.pendingPOs}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Open WOs</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.openWOs}</div>
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
