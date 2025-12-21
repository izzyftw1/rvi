import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { AlertCircle, Package, ShoppingCart, TrendingUp, TrendingDown, DollarSign, Download, Calendar } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { MaterialDetailModal } from "@/components/inventory/MaterialDetailModal";
import { RawMaterialPOModal } from "@/components/procurement/RawMaterialPOModal";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface InventoryStatus {
  id: string;
  material_name: string;
  alloy: string;
  shape_type: string;
  size_mm: number;
  density: number;
  total_required_kg: number;
  total_on_order_kg: number;
  total_received_kg: number;
  total_inventory_kg: number;
  committed_kg: number;
  available_kg: number;
  deficit_kg: number;
  open_po_value: number;
  open_po_count: number;
  overdue_po_count: number;
  pending_qc_count: number;
  last_grn_date: string | null;
  recent_grn_count: number;
  status: 'deficit' | 'low_stock' | 'available';
}

interface SummaryMetrics {
  totalStock: number;
  onOrder: number;
  committed: number;
  available: number;
  deficit: number;
  openPOValue: number;
}

interface AlertItem {
  type: 'deficit' | 'overdue' | 'qc_pending';
  message: string;
  severity: 'error' | 'warning';
}

export default function InventoryProcurementControlCenter() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [inventory, setInventory] = useState<InventoryStatus[]>([]);
  const [summary, setSummary] = useState<SummaryMetrics>({
    totalStock: 0,
    onOrder: 0,
    committed: 0,
    available: 0,
    deficit: 0,
    openPOValue: 0
  });
  const [alerts, setAlerts] = useState<AlertItem[]>([]);

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [filterMaterial, setFilterMaterial] = useState("all");
  const [filterAlloy, setFilterAlloy] = useState("all");
  const [filterShape, setFilterShape] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  // Modal states
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [poModalOpen, setPoModalOpen] = useState(false);
  const [selectedMaterial, setSelectedMaterial] = useState<InventoryStatus | null>(null);

  // Pagination
  const [page, setPage] = useState(1);
  const itemsPerPage = 25;

  // Unique filter values
  const [materials, setMaterials] = useState<string[]>([]);
  const [alloys, setAlloys] = useState<string[]>([]);
  const [shapes, setShapes] = useState<string[]>([]);

  useEffect(() => {
    loadInventoryStatus();

    // Real-time subscriptions
    const channel = supabase
      .channel('inventory-control-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'material_requirements_v2' }, () => loadInventoryStatus())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'raw_material_po' }, () => loadInventoryStatus())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'grn_receipts' }, () => loadInventoryStatus())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'material_lots' }, () => loadInventoryStatus())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadInventoryStatus = async () => {
    setLoading(true);

    try {
      const { data, error } = await supabase
        .from('inventory_procurement_status')
        .select('*')
        .order('deficit_kg', { ascending: false });

      if (error) throw error;

      const inventoryData = data || [];
      setInventory(inventoryData as InventoryStatus[]);

      // Extract unique values
      const uniqueMaterials = [...new Set(inventoryData.map(i => i.material_name))];
      const uniqueAlloys = [...new Set(inventoryData.map(i => i.alloy))];
      const uniqueShapes = [...new Set(inventoryData.map(i => i.shape_type))];

      setMaterials(uniqueMaterials.sort());
      setAlloys(uniqueAlloys.sort());
      setShapes(uniqueShapes.sort());

      // Calculate summary
      const totalStock = inventoryData.reduce((sum, i) => sum + i.total_inventory_kg, 0);
      const onOrder = inventoryData.reduce((sum, i) => sum + i.total_on_order_kg, 0);
      const committed = inventoryData.reduce((sum, i) => sum + i.committed_kg, 0);
      const available = inventoryData.reduce((sum, i) => sum + i.available_kg, 0);
      const deficit = inventoryData.reduce((sum, i) => sum + i.deficit_kg, 0);
      const openPOValue = inventoryData.reduce((sum, i) => sum + i.open_po_value, 0);

      setSummary({ totalStock, onOrder, committed, available, deficit, openPOValue });

      // Generate alerts
      const newAlerts: AlertItem[] = [];
      
      inventoryData.forEach(item => {
        if (item.deficit_kg > 100) {
          newAlerts.push({
            type: 'deficit',
            message: `Critical deficit: ${item.material_name} (${item.alloy}) - ${item.deficit_kg.toFixed(2)} kg short`,
            severity: 'error'
          });
        }
        
        if (item.overdue_po_count > 0) {
          newAlerts.push({
            type: 'overdue',
            message: `${item.overdue_po_count} overdue PO(s) for ${item.material_name}`,
            severity: 'warning'
          });
        }
        
        if (item.pending_qc_count > 0) {
          newAlerts.push({
            type: 'qc_pending',
            message: `${item.pending_qc_count} lot(s) pending QC for ${item.material_name}`,
            severity: 'warning'
          });
        }
      });

      setAlerts(newAlerts.slice(0, 5));

    } catch (error: any) {
      toast({
        title: "Error Loading Inventory",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const filteredInventory = inventory.filter(item => {
    const matchesSearch = 
      item.material_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.alloy.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesMaterial = filterMaterial === "all" || item.material_name === filterMaterial;
    const matchesAlloy = filterAlloy === "all" || item.alloy === filterAlloy;
    const matchesShape = filterShape === "all" || item.shape_type === filterShape;
    const matchesStatus = filterStatus === "all" || item.status === filterStatus;

    return matchesSearch && matchesMaterial && matchesAlloy && matchesShape && matchesStatus;
  });

  const paginatedInventory = filteredInventory.slice((page - 1) * itemsPerPage, page * itemsPerPage);
  const totalPages = Math.ceil(filteredInventory.length / itemsPerPage);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'deficit': return 'bg-destructive text-destructive-foreground';
      case 'low_stock': return 'bg-yellow-500 text-yellow-50';
      case 'available': return 'bg-success text-success-foreground';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getRowClassName = (status: string) => {
    switch (status) {
      case 'deficit': return 'bg-destructive/10 hover:bg-destructive/20';
      case 'low_stock': return 'bg-yellow-500/10 hover:bg-yellow-500/20';
      case 'available': return 'hover:bg-muted/50';
      default: return 'hover:bg-muted/50';
    }
  };

  const handleRowClick = (item: InventoryStatus) => {
    setSelectedMaterial(item);
    setDetailModalOpen(true);
  };

  const handleCreatePO = (item: InventoryStatus) => {
    setSelectedMaterial(item);
    setPoModalOpen(true);
  };

  const exportToExcel = () => {
    toast({
      title: "Export Started",
      description: "Downloading inventory report..."
    });
    // Implementation would use xlsx library
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="p-6">
          <div className="text-center">Loading inventory data...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="p-6 space-y-6">
        {/* Alerts Banner */}
        {alerts.length > 0 && (
          <div className="space-y-2">
            {alerts.map((alert, idx) => (
              <Alert key={idx} variant={alert.severity === 'error' ? 'destructive' : 'default'}>
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>{alert.type === 'deficit' ? 'Material Deficit' : alert.type === 'overdue' ? 'Overdue PO' : 'QC Pending'}</AlertTitle>
                <AlertDescription>{alert.message}</AlertDescription>
              </Alert>
            ))}
          </div>
        )}

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Package className="w-4 h-4" />
                Total Stock
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.totalStock.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">kg</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <ShoppingCart className="w-4 h-4" />
                On Order
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">{summary.onOrder.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">kg</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <TrendingDown className="w-4 h-4" />
                Committed
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.committed.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">kg</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                Available
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-success">{summary.available.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">kg</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                Deficit
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">{summary.deficit.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">kg</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <DollarSign className="w-4 h-4" />
                Open PO Value
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">
                ₹{summary.openPOValue.toLocaleString('en-IN')}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filter Bar */}
        <Card className="sticky top-0 z-10 shadow-md">
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
              <Input
                placeholder="Search material or alloy..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="md:col-span-2"
              />
              
              <Select value={filterMaterial} onValueChange={setFilterMaterial}>
                <SelectTrigger>
                  <SelectValue placeholder="Material" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Materials</SelectItem>
                  {materials.map(mat => (
                    <SelectItem key={mat} value={mat}>{mat}</SelectItem>
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

              <Select value={filterShape} onValueChange={setFilterShape}>
                <SelectTrigger>
                  <SelectValue placeholder="Shape" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Shapes</SelectItem>
                  {shapes.map(shape => (
                    <SelectItem key={shape} value={shape}>{shape}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button onClick={exportToExcel} variant="outline">
                <Download className="w-4 h-4 mr-2" />
                Export
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Live Heatmap Table */}
        <Card>
          <CardHeader>
            <CardTitle>Live Material Status Heatmap</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader className="sticky top-0 bg-background">
                  <TableRow>
                    <TableHead>Material Grade</TableHead>
                    <TableHead>Alloy</TableHead>
                    <TableHead>Shape</TableHead>
                    <TableHead className="text-right">Stock (kg)</TableHead>
                    <TableHead className="text-right">On Order (kg)</TableHead>
                    <TableHead className="text-right">Committed (kg)</TableHead>
                    <TableHead className="text-right">Available (kg)</TableHead>
                    <TableHead className="text-right">Deficit (kg)</TableHead>
                    <TableHead>Last GRN</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedInventory.map(item => (
                    <TooltipProvider key={item.id}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <TableRow 
                            className={`${getRowClassName(item.status)} cursor-pointer transition-colors`}
                            onClick={() => handleRowClick(item)}
                          >
                            <TableCell className="font-medium">{item.material_name}</TableCell>
                            <TableCell>{item.alloy}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{item.shape_type}</Badge>
                            </TableCell>
                            <TableCell className="text-right">{item.total_inventory_kg.toFixed(2)}</TableCell>
                            <TableCell className="text-right">{item.total_on_order_kg.toFixed(2)}</TableCell>
                            <TableCell className="text-right">{item.committed_kg.toFixed(2)}</TableCell>
                            <TableCell className="text-right font-semibold">
                              {item.available_kg >= 0 ? '+' : ''}{item.available_kg.toFixed(2)}
                            </TableCell>
                            <TableCell className="text-right">
                              {item.deficit_kg > 0 ? (
                                <span className="text-destructive font-semibold">{item.deficit_kg.toFixed(2)}</span>
                              ) : (
                                '-'
                              )}
                            </TableCell>
                            <TableCell>
                              {item.last_grn_date ? (
                                <div className="text-sm">
                                  <Calendar className="w-3 h-3 inline mr-1" />
                                  {new Date(item.last_grn_date).toLocaleDateString()}
                                </div>
                              ) : (
                                <span className="text-muted-foreground text-sm">No GRN</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge className={getStatusColor(item.status)}>
                                {item.status.replace('_', ' ').toUpperCase()}
                              </Badge>
                            </TableCell>
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              {item.deficit_kg > 0 && (
                                <Button 
                                  size="sm" 
                                  onClick={() => handleCreatePO(item)}
                                >
                                  Create PO
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-sm">
                          <div className="space-y-1 text-xs">
                            <p><strong>Open POs:</strong> {item.open_po_count}</p>
                            <p><strong>Overdue:</strong> {item.overdue_po_count}</p>
                            <p><strong>Pending QC:</strong> {item.pending_qc_count}</p>
                            <p><strong>Recent GRNs (30d):</strong> {item.recent_grn_count}</p>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ))}
                  {paginatedInventory.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={11} className="text-center text-muted-foreground py-8">
                        No inventory data found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <div className="text-sm text-muted-foreground">
                  Showing {((page - 1) * itemsPerPage) + 1} - {Math.min(page * itemsPerPage, filteredInventory.length)} of {filteredInventory.length}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Material Detail Modal */}
      {selectedMaterial && (
        <MaterialDetailModal
          open={detailModalOpen}
          onClose={() => {
            setDetailModalOpen(false);
            setSelectedMaterial(null);
          }}
          materialGrade={selectedMaterial.material_name}
          alloy={selectedMaterial.alloy}
        />
      )}

      {/* PO Creation Modal */}
      {selectedMaterial && (
        <RawMaterialPOModal
          open={poModalOpen}
          onClose={() => {
            setPoModalOpen(false);
            setSelectedMaterial(null);
          }}
          materialGrade={selectedMaterial.material_name}
          alloy={selectedMaterial.alloy}
          deficitKg={selectedMaterial.deficit_kg}
          linkedWOIds={[]}
          linkedRequirementIds={[]}
          onSuccess={() => {
            loadInventoryStatus();
            toast({
              title: "PO Created",
              description: `Purchase order created for ${selectedMaterial.material_name}`
            });
          }}
        />
      )}
    </div>
  );
}
