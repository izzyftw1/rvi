import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { NavigationHeader } from "@/components/NavigationHeader";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { PackagePlus, FileText, TrendingUp, Clock, CheckCircle, XCircle } from "lucide-react";
import { GRNModal } from "@/components/procurement/GRNModal";

interface ProcurementOrder {
  id: string;
  po_id: string;
  material_grade: string;
  alloy: string;
  qty_kg: number;
  rate_per_kg: number;
  total_value: number;
  status: 'pending' | 'partially_received' | 'completed' | 'cancelled';
  expected_date: string;
  linked_wo_ids: string[];
  suppliers?: { name: string };
  created_at: string;
}

interface SummaryMetrics {
  totalOrdered: number;
  totalReceived: number;
  openPOValue: number;
  deficitRemaining: number;
}

export default function ProcurementDashboard() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<ProcurementOrder[]>([]);
  const [summary, setSummary] = useState<SummaryMetrics>({
    totalOrdered: 0,
    totalReceived: 0,
    openPOValue: 0,
    deficitRemaining: 0
  });

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [filterMaterialGrade, setFilterMaterialGrade] = useState("all");
  const [filterSupplier, setFilterSupplier] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  // GRN Modal
  const [grnModalOpen, setGrnModalOpen] = useState(false);
  const [selectedPOId, setSelectedPOId] = useState<string>("");

  // Unique filter values
  const [materialGrades, setMaterialGrades] = useState<string[]>([]);
  const [suppliers, setSuppliers] = useState<string[]>([]);

  useEffect(() => {
    loadOrders();

    // Real-time subscription
    const channel = supabase
      .channel('procurement-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'raw_material_po'
        },
        () => {
          loadOrders();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'grn_receipts'
        },
        () => {
          loadOrders();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadOrders = async () => {
    setLoading(true);

    try {
      const { data: ordersData, error: ordersError } = await supabase
        .from('raw_material_po')
        .select(`
          *,
          suppliers(name)
        `)
        .order('created_at', { ascending: false });

      if (ordersError) throw ordersError;

      setOrders((ordersData || []) as ProcurementOrder[]);

      // Extract unique values
      const uniqueGrades = [...new Set(ordersData?.map(o => o.material_grade) || [])];
      const uniqueSuppliers = [...new Set(ordersData?.map(o => o.suppliers?.name).filter(Boolean) as string[])];

      setMaterialGrades(uniqueGrades.sort());
      setSuppliers(uniqueSuppliers.sort());

      // Calculate summary
      const totalOrdered = ordersData?.reduce((sum, o) => sum + o.qty_kg, 0) || 0;
      const openPOValue = ordersData
        ?.filter(o => o.status !== 'completed' && o.status !== 'cancelled')
        .reduce((sum, o) => sum + o.total_value, 0) || 0;

      // Get received quantities
      const { data: grnData } = await supabase
        .from('grn_receipts')
        .select('received_qty_kg');

      const totalReceived = grnData?.reduce((sum, g) => sum + g.received_qty_kg, 0) || 0;

      // Get material requirements deficit
      const { data: reqData } = await supabase
        .from('material_requirements_v2')
        .select('total_gross_kg');

      const totalRequired = reqData?.reduce((sum, r) => sum + r.total_gross_kg, 0) || 0;
      const deficitRemaining = Math.max(0, totalRequired - totalReceived);

      setSummary({
        totalOrdered,
        totalReceived,
        openPOValue,
        deficitRemaining
      });

    } catch (error: any) {
      toast({
        title: "Error Loading Orders",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const filteredOrders = orders.filter(order => {
    const matchesSearch = 
      order.po_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.material_grade.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.suppliers?.name.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesMaterialGrade = filterMaterialGrade === "all" || order.material_grade === filterMaterialGrade;
    const matchesSupplier = filterSupplier === "all" || order.suppliers?.name === filterSupplier;
    const matchesStatus = filterStatus === "all" || order.status === filterStatus;

    return matchesSearch && matchesMaterialGrade && matchesSupplier && matchesStatus;
  });

  const getStatusBadge = (status: string) => {
    const config = {
      pending: { icon: Clock, className: "bg-yellow-500 text-yellow-50", label: "Pending" },
      partially_received: { icon: TrendingUp, className: "bg-blue-500 text-blue-50", label: "Partially Received" },
      completed: { icon: CheckCircle, className: "bg-success text-success-foreground", label: "Completed" },
      cancelled: { icon: XCircle, className: "bg-muted text-muted-foreground", label: "Cancelled" }
    }[status] || { icon: Clock, className: "", label: status };

    const Icon = config.icon;
    return (
      <Badge className={config.className}>
        <Icon className="w-3 h-3 mr-1" />
        {config.label}
      </Badge>
    );
  };

  const handleReceiveGoods = (poId: string) => {
    setSelectedPOId(poId);
    setGrnModalOpen(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <NavigationHeader title="Procurement Dashboard" />
        <div className="p-6">
          <div className="text-center">Loading procurement orders...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <NavigationHeader title="Raw Material Procurement Dashboard" />
      
      <div className="p-6 space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Ordered (kg)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.totalOrdered.toFixed(2)}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Received (kg)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-success">{summary.totalReceived.toFixed(2)}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Open PO Value</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">
                ₹{summary.openPOValue.toLocaleString('en-IN')}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Deficit Remaining (kg)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">{summary.deficitRemaining.toFixed(2)}</div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Filters</CardTitle>
              <Button onClick={() => setGrnModalOpen(true)}>
                <PackagePlus className="w-4 h-4 mr-2" />
                Receive Goods (GRN)
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Input
                placeholder="Search PO, Material, Supplier..."
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

              <Select value={filterSupplier} onValueChange={setFilterSupplier}>
                <SelectTrigger>
                  <SelectValue placeholder="Supplier" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Suppliers</SelectItem>
                  {suppliers.map(supplier => (
                    <SelectItem key={supplier} value={supplier}>{supplier}</SelectItem>
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
                  <SelectItem value="partially_received">Partially Received</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Orders Table */}
        <Card>
          <CardHeader>
            <CardTitle>Purchase Orders</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>PO ID</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Material Grade</TableHead>
                  <TableHead className="text-right">Qty (kg)</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Expected Date</TableHead>
                  <TableHead>Linked WOs</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOrders.map(order => (
                  <TableRow key={order.id} className="hover:bg-muted/50">
                    <TableCell className="font-medium">{order.po_id}</TableCell>
                    <TableCell>{order.suppliers?.name || 'N/A'}</TableCell>
                    <TableCell>{order.material_grade}</TableCell>
                    <TableCell className="text-right">{order.qty_kg.toFixed(3)}</TableCell>
                    <TableCell className="text-right">
                      ₹{order.total_value.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell>{getStatusBadge(order.status)}</TableCell>
                    <TableCell>{new Date(order.expected_date).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{order.linked_wo_ids.length} WOs</Badge>
                    </TableCell>
                    <TableCell>
                      {order.status !== 'completed' && order.status !== 'cancelled' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleReceiveGoods(order.id)}
                        >
                          <FileText className="w-4 h-4 mr-1" />
                          Receive
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {filteredOrders.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                      No purchase orders found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* GRN Modal */}
      <GRNModal
        open={grnModalOpen}
        onClose={() => {
          setGrnModalOpen(false);
          setSelectedPOId("");
        }}
        preselectedPOId={selectedPOId}
        onSuccess={() => {
          loadOrders();
          toast({
            title: "GRN Created",
            description: "Material received and inventory updated successfully."
          });
        }}
      />
    </div>
  );
}
