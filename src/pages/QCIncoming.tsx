import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

import { PageHeader, PageContainer } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { QCStatusIndicator } from "@/components/qc/QCStatusIndicator";
import { QCSummaryStats, QCInfoAlert, QCActionRequired, QCHistory } from "@/components/qc/QCPageLayout";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckCircle2, Package, Clock, ArrowRight, Inbox } from "lucide-react";

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
      const { data: wos, error: woError } = await supabase
        .from("work_orders")
        .select(`
          id, wo_id, display_id, customer, item_code, sales_order,
          qc_material_status, qc_material_passed, qc_first_piece_status,
          material_size_mm, bom
        `)
        .order("created_at", { ascending: false });

      if (woError) throw woError;
      if (!wos) { setWorkOrders([]); return; }

      const enrichedWOs = await Promise.all(
        wos.map(async (wo) => {
          const { data: issues } = await supabase
            .from("wo_material_issues")
            .select("id, lot_id")
            .eq("wo_id", wo.id);

          const material_issued = (issues?.length || 0) > 0;
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
            const bom = wo.bom as any;
            const requiredAlloy = bom?.material_alloy || bom?.alloy;
            if (requiredAlloy && typeof requiredAlloy === 'string') {
              try {
                const { data: availableLots } = await supabase
                  .from("material_lots")
                  .select("qc_status, alloy");
                
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

  const pendingQC = workOrders.filter(wo => wo.qc_material_status === "pending" && wo.material_arrived);
  const passedQC = workOrders.filter(wo => wo.qc_material_status === "passed");
  const failedQC = workOrders.filter(wo => wo.qc_material_status === "failed" || wo.qc_material_status === "hold");
  const awaitingMaterial = workOrders.filter(wo => !wo.material_arrived);

  const renderTable = (data: WorkOrderQCStatus[], showAction = true) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>WO ID</TableHead>
          <TableHead>Customer</TableHead>
          <TableHead>Item Code</TableHead>
          <TableHead>Material</TableHead>
          <TableHead>Material QC</TableHead>
          <TableHead>First Piece</TableHead>
          {showAction && <TableHead></TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.length === 0 ? (
          <TableRow>
            <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
              <Inbox className="h-8 w-8 mx-auto mb-2 opacity-50" />
              No work orders in this category
            </TableCell>
          </TableRow>
        ) : (
          data.map((wo) => (
            <TableRow 
              key={wo.id}
              className="cursor-pointer hover:bg-muted/50"
              onClick={() => navigate(`/work-orders/${wo.id}?tab=qc`)}
            >
              <TableCell className="font-medium">{wo.display_id}</TableCell>
              <TableCell>{wo.customer}</TableCell>
              <TableCell>{wo.item_code}</TableCell>
              <TableCell>
                {wo.material_arrived ? (
                  <div className="flex items-center gap-1.5 text-sm">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>{wo.material_alloy || "Material"}</span>
                    <Badge variant="outline" className="text-xs ml-1">{wo.total_material_lots} lots</Badge>
                  </div>
                ) : (
                  <span className="text-sm text-muted-foreground">Awaiting</span>
                )}
              </TableCell>
              <TableCell>
                <QCStatusIndicator status={wo.qc_material_status as any} size="sm" />
              </TableCell>
              <TableCell>
                <QCStatusIndicator status={wo.qc_first_piece_status as any} size="sm" />
              </TableCell>
              {showAction && (
                <TableCell>
                  <div className="flex items-center gap-1 text-primary text-sm">
                    View <ArrowRight className="h-3.5 w-3.5" />
                  </div>
                </TableCell>
              )}
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <PageContainer>
          <div className="flex items-center justify-center h-64">
            <Clock className="w-6 h-6 animate-spin text-primary" />
          </div>
        </PageContainer>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <PageContainer>
        <div className="space-y-6">
          {/* Header */}
          <PageHeader
            title="Incoming Material QC"
            description="Material quality control status across work orders"
            icon={<Package className="h-6 w-6" />}
          />

          {/* Info */}
          <QCInfoAlert
            title="Material QC Actions are Work Order Based"
            description="Click any row to navigate to the work order and perform QC actions."
          />

          {/* Summary Stats */}
          <QCSummaryStats
            stats={[
              { label: 'Total Orders', value: workOrders.length, type: 'total' },
              { label: 'Pending QC', value: pendingQC.length, type: 'pending' },
              { label: 'Passed', value: passedQC.length, type: 'passed' },
              { label: 'Failed/Hold', value: failedQC.length, type: 'failed' },
              { label: 'Awaiting Material', value: awaitingMaterial.length, type: 'neutral' },
            ]}
          />

          {/* Action Required - Pending items */}
          {pendingQC.length > 0 && (
            <QCActionRequired
              title="Material QC Required"
              description="Work orders with material awaiting quality inspection"
              count={pendingQC.length}
            >
              {renderTable(pendingQC)}
            </QCActionRequired>
          )}

          {/* History - Tabbed view of all records */}
          <QCHistory
            title="All Work Orders"
            description="Complete material QC status by category"
          >
            <Tabs defaultValue="all" className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="all">All ({workOrders.length})</TabsTrigger>
                <TabsTrigger value="awaiting">Awaiting ({awaitingMaterial.length})</TabsTrigger>
                <TabsTrigger value="passed">Passed ({passedQC.length})</TabsTrigger>
                <TabsTrigger value="failed">Failed ({failedQC.length})</TabsTrigger>
              </TabsList>

              <TabsContent value="all" className="mt-4">
                {renderTable(workOrders)}
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
          </QCHistory>
        </div>
      </PageContainer>
    </div>
  );
}
