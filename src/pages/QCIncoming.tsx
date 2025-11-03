import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { NavigationHeader } from "@/components/NavigationHeader";
import { Badge } from "@/components/ui/badge";
import { QCGateStatusBadge } from "@/components/QCGateStatusBadge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle2, XCircle, Clock, Package, AlertCircle } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface WorkOrderQCStatus {
  id: string;
  wo_id: string;
  display_id: string;
  customer: string;
  item_code: string;
  sales_order: string;
  qc_material_status: string;
  qc_material_passed: boolean;
  qc_first_piece_status: string;
  material_arrived: boolean;
  material_issued: boolean;
  pending_material_lots: number;
  total_material_lots: number;
  material_alloy?: string;
}

export default function QCIncoming() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [workOrders, setWorkOrders] = useState<WorkOrderQCStatus[]>([]);

  useEffect(() => {
    loadWorkOrdersQCStatus();
  }, []);

  const loadWorkOrdersQCStatus = async () => {
    setLoading(true);
    try {
      // Fetch all work orders with material and QC status
      const { data: wos, error: woError } = await supabase
        .from("work_orders")
        .select(`
          id,
          wo_id,
          display_id,
          customer,
          item_code,
          sales_order,
          qc_material_status,
          qc_material_passed,
          qc_first_piece_status,
          material_size_mm,
          bom
        `)
        .order("created_at", { ascending: false });

      if (woError) throw woError;

      if (!wos) {
        setWorkOrders([]);
        return;
      }

      // For each work order, check material status
      const enrichedWOs = await Promise.all(
        wos.map(async (wo) => {
          // Check if material has been issued to this WO
          const { data: issues } = await supabase
            .from("wo_material_issues")
            .select("id, lot_id")
            .eq("wo_id", wo.id);

          const material_issued = (issues?.length || 0) > 0;

          // Get material lot details for issued material
          let pending_material_lots = 0;
          let total_material_lots = 0;
          let material_alloy = "";

          if (issues && issues.length > 0) {
            const lotIds = issues.map(i => i.lot_id);
            const { data: lots } = await supabase
              .from("material_lots")
              .select("qc_status, alloy")
              .in("id", lotIds);

            if (lots) {
              total_material_lots = lots.length;
              pending_material_lots = lots.filter(l => l.qc_status === "pending").length;
              material_alloy = lots[0]?.alloy || "";
            }
          } else {
            // Check if material exists in stock that matches the WO requirements
            const bom = wo.bom as any;
            const requiredAlloy = bom?.material_alloy || bom?.alloy;
            if (requiredAlloy && typeof requiredAlloy === 'string') {
              try {
                const lotsQuery = supabase
                  .from("material_lots")
                  .select("qc_status, alloy");
                
                const { data: availableLots } = await lotsQuery;
                
                const matchingLots = availableLots?.filter(
                  lot => lot.alloy === requiredAlloy
                ) || [];

                if (matchingLots.length > 0) {
                  total_material_lots = matchingLots.length;
                  pending_material_lots = matchingLots.filter(l => l.qc_status === "pending").length;
                  material_alloy = requiredAlloy;
                }
              } catch (err) {
                console.error("Error fetching lots:", err);
              }
            }
          }

          return {
            id: wo.id,
            wo_id: wo.wo_id,
            display_id: wo.display_id || wo.wo_id,
            customer: wo.customer,
            item_code: wo.item_code,
            sales_order: wo.sales_order || "-",
            qc_material_status: wo.qc_material_status || "pending",
            qc_material_passed: wo.qc_material_passed || false,
            qc_first_piece_status: wo.qc_first_piece_status || "pending",
            material_arrived: total_material_lots > 0,
            material_issued,
            pending_material_lots,
            total_material_lots,
            material_alloy,
          };
        })
      );

      setWorkOrders(enrichedWOs);
    } catch (error) {
      console.error("Error loading WO QC status:", error);
      toast({ variant: "destructive", description: "Failed to load QC status" });
    } finally {
      setLoading(false);
    }
  };

  const pendingQC = workOrders.filter(
    wo => wo.qc_material_status === "pending" && wo.material_arrived
  );
  const passedQC = workOrders.filter(wo => wo.qc_material_status === "passed");
  const failedQC = workOrders.filter(
    wo => wo.qc_material_status === "failed" || wo.qc_material_status === "hold"
  );
  const awaitingMaterial = workOrders.filter(wo => !wo.material_arrived);

  const renderTable = (data: WorkOrderQCStatus[]) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>WO ID</TableHead>
          <TableHead>Customer</TableHead>
          <TableHead>Item Code</TableHead>
          <TableHead>Sales Order</TableHead>
          <TableHead>Material Status</TableHead>
          <TableHead>Material QC</TableHead>
          <TableHead>First Piece QC</TableHead>
          <TableHead>Action</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.length === 0 ? (
          <TableRow>
            <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
              No work orders in this category
            </TableCell>
          </TableRow>
        ) : (
          data.map((wo) => (
            <TableRow 
              key={wo.id}
              className="cursor-pointer hover:bg-muted/50"
              onClick={() => navigate(`/work-orders/${wo.id}`)}
            >
              <TableCell className="font-medium">{wo.display_id}</TableCell>
              <TableCell>{wo.customer}</TableCell>
              <TableCell>{wo.item_code}</TableCell>
              <TableCell>{wo.sales_order}</TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  {wo.material_arrived ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-success" />
                      <span className="text-sm">
                        {wo.material_alloy || "Material"} ({wo.total_material_lots} lots)
                      </span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-4 h-4 text-warning" />
                      <span className="text-sm text-muted-foreground">Awaiting Material</span>
                    </>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <QCGateStatusBadge status={wo.qc_material_status as any} />
                {wo.pending_material_lots > 0 && (
                  <Badge variant="outline" className="ml-2">
                    {wo.pending_material_lots} pending
                  </Badge>
                )}
              </TableCell>
              <TableCell>
                <QCGateStatusBadge status={wo.qc_first_piece_status as any} />
              </TableCell>
              <TableCell>
                <Badge 
                  variant="outline" 
                  className="cursor-pointer hover:bg-primary hover:text-primary-foreground"
                >
                  View Details
                </Badge>
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <NavigationHeader 
          title="Incoming Material QC Dashboard" 
          subtitle="Comprehensive view of all work orders and their material QC status" 
        />
        <div className="p-6">
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <Clock className="w-8 h-8 animate-spin mx-auto mb-2 text-primary" />
              <p className="text-muted-foreground">Loading work orders...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <NavigationHeader 
        title="Incoming Material QC Dashboard" 
        subtitle="Comprehensive view of all work orders and their material QC status" 
      />
      
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Orders</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Package className="w-5 h-5 text-primary" />
                <span className="text-2xl font-bold">{workOrders.length}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Pending QC</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-warning" />
                <span className="text-2xl font-bold">{pendingQC.length}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Passed</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-success" />
                <span className="text-2xl font-bold">{passedQC.length}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Failed/Hold</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <XCircle className="w-5 h-5 text-destructive" />
                <span className="text-2xl font-bold">{failedQC.length}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Awaiting Material</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Package className="w-5 h-5 text-muted-foreground" />
                <span className="text-2xl font-bold">{awaitingMaterial.length}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Work Orders by QC Status</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="all" className="w-full">
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="all">
                  All Orders ({workOrders.length})
                </TabsTrigger>
                <TabsTrigger value="pending">
                  Pending QC ({pendingQC.length})
                </TabsTrigger>
                <TabsTrigger value="awaiting">
                  Awaiting Material ({awaitingMaterial.length})
                </TabsTrigger>
                <TabsTrigger value="passed">
                  Passed ({passedQC.length})
                </TabsTrigger>
                <TabsTrigger value="failed">
                  Failed/Hold ({failedQC.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="all" className="mt-4">
                {renderTable(workOrders)}
              </TabsContent>

              <TabsContent value="pending" className="mt-4">
                {renderTable(pendingQC)}
              </TabsContent>

              <TabsContent value="awaiting" className="mt-4">
                {renderTable(awaitingMaterial)}
              </TabsContent>

              <TabsContent value="passed" className="mt-4">
                {renderTable(passedQC)}
              </TabsContent>

              <TabsContent value="failed" className="mt-4">
                {renderTable(failedQC)}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}