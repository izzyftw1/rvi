import { useState, useEffect, useMemo, useCallback, memo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { NavigationHeader } from "@/components/NavigationHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle2, XCircle, AlertTriangle, FileText, Package, Clock, TrendingUp, FlaskConical, Eye, ArrowRight, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface WorkOrderQCSummary {
  id: string;
  wo_id: string;
  display_id: string;
  customer: string;
  item_code: string;
  status: string;
  qc_material_status: string | null;
  qc_first_piece_status: string | null;
  pending_qc_count: number;
  passed_qc_count: number;
  failed_qc_count: number;
  last_qc_date: string | null;
  qc_type_needed: string | null;
}

const Quality = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [workOrderSummaries, setWorkOrderSummaries] = useState<WorkOrderQCSummary[]>([]);
  const [qcStats, setQcStats] = useState({
    total: 0,
    passed: 0,
    failed: 0,
    pending: 0,
    passRate: 0
  });

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      
      // Get active work orders with QC status
      const { data: workOrders, error: woError } = await supabase
        .from("work_orders")
        .select(`
          id,
          wo_id,
          display_id,
          customer,
          item_code,
          status,
          qc_material_status,
          qc_first_piece_status
        `)
        .in('status', ['pending', 'in_progress', 'qc', 'packing'])
        .order("created_at", { ascending: false })
        .limit(100);

      if (woError) throw woError;

      // Get QC records for stats
      const { data: qcRecords, error: qcError } = await supabase
        .from("qc_records")
        .select("id, result, wo_id, created_at, qc_type")
        .order("created_at", { ascending: false });

      if (qcError) throw qcError;

      // Calculate overall stats
      const total = qcRecords?.length || 0;
      const passed = qcRecords?.filter(r => r.result === 'pass').length || 0;
      const failed = qcRecords?.filter(r => r.result === 'fail').length || 0;
      const pending = qcRecords?.filter(r => r.result === 'pending').length || 0;
      const passRate = total > 0 ? Math.round((passed / total) * 100) : 0;

      setQcStats({ total, passed, failed, pending, passRate });

      // Group QC records by work order
      const qcByWo = new Map<string, { pending: number; passed: number; failed: number; lastDate: string | null; neededType: string | null }>();
      qcRecords?.forEach(qc => {
        const existing = qcByWo.get(qc.wo_id) || { pending: 0, passed: 0, failed: 0, lastDate: null, neededType: null };
        if (qc.result === 'pending') {
          existing.pending++;
          existing.neededType = qc.qc_type;
        }
        if (qc.result === 'pass') existing.passed++;
        if (qc.result === 'fail') existing.failed++;
        if (!existing.lastDate || new Date(qc.created_at) > new Date(existing.lastDate)) {
          existing.lastDate = qc.created_at;
        }
        qcByWo.set(qc.wo_id, existing);
      });

      // Enrich work orders with QC summary
      const summaries: WorkOrderQCSummary[] = (workOrders || []).map(wo => {
        const qcInfo = qcByWo.get(wo.id);
        return {
          id: wo.id,
          wo_id: wo.wo_id,
          display_id: wo.display_id || wo.wo_id,
          customer: wo.customer,
          item_code: wo.item_code,
          status: wo.status,
          qc_material_status: wo.qc_material_status,
          qc_first_piece_status: wo.qc_first_piece_status,
          pending_qc_count: qcInfo?.pending || 0,
          passed_qc_count: qcInfo?.passed || 0,
          failed_qc_count: qcInfo?.failed || 0,
          last_qc_date: qcInfo?.lastDate || null,
          qc_type_needed: qcInfo?.neededType || null
        };
      });

      // Sort: pending actions first, then by last QC date
      summaries.sort((a, b) => {
        if (a.pending_qc_count > 0 && b.pending_qc_count === 0) return -1;
        if (a.pending_qc_count === 0 && b.pending_qc_count > 0) return 1;
        return 0;
      });

      setWorkOrderSummaries(summaries);
    } catch (error: any) {
      console.error("Error loading QC data:", error);
      toast({
        variant: "destructive",
        title: "Error loading QC data",
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadData();

    const channel = supabase
      .channel("qc-dashboard-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "qc_records" }, loadData)
      .on("postgres_changes", { event: "*", schema: "public", table: "work_orders" }, loadData)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadData]);

  const workOrdersNeedingAction = useMemo(() => 
    workOrderSummaries.filter(wo => 
      wo.pending_qc_count > 0 || 
      wo.qc_material_status === 'pending' || 
      wo.qc_first_piece_status === 'pending'
    ), [workOrderSummaries]
  );

  const getQCStatusBadge = (status: string | null) => {
    if (!status) return <Badge variant="secondary">Not Started</Badge>;
    switch (status) {
      case 'passed':
      case 'pass':
        return <Badge className="bg-success text-success-foreground">Passed</Badge>;
      case 'failed':
      case 'fail':
        return <Badge variant="destructive">Failed</Badge>;
      case 'pending':
        return <Badge variant="outline" className="text-warning border-warning">Pending</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <NavigationHeader />
        <div className="max-w-7xl mx-auto p-4 space-y-6">
          <Skeleton className="h-10 w-64" />
          <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24" />)}
          </div>
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <NavigationHeader />
      
      <div className="max-w-7xl mx-auto p-4 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold">Quality Control Overview</h1>
          <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1">
            <TrendingUp className="h-3.5 w-3.5" />
            Read-only summary of quality metrics across all work orders
          </p>
        </div>

        {/* Info Alert */}
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>QC Actions are Work Order Based</AlertTitle>
          <AlertDescription>
            To perform QC inspections, navigate to the specific Work Order and use the QC actions available there. 
            This dashboard provides an overview of quality status across all orders.
          </AlertDescription>
        </Alert>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-gradient-to-br from-muted/30 to-muted/10">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Inspections</p>
                  <p className="text-2xl font-bold">{qcStats.total}</p>
                </div>
                <FileText className="h-8 w-8 text-muted-foreground/60" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-success/10 to-success/5 border-success/20">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Pass Rate</p>
                  <p className="text-2xl font-bold text-success">{qcStats.passRate}%</p>
                </div>
                <CheckCircle2 className="h-8 w-8 text-success/60" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-destructive/10 to-destructive/5 border-destructive/20">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Failed</p>
                  <p className="text-2xl font-bold text-destructive">{qcStats.failed}</p>
                </div>
                <XCircle className="h-8 w-8 text-destructive/60" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-warning/10 to-warning/5 border-warning/20">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Pending Action</p>
                  <p className="text-2xl font-bold text-warning">{qcStats.pending}</p>
                </div>
                <Clock className="h-8 w-8 text-warning/60" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Work Orders Needing QC Action */}
        {workOrdersNeedingAction.length > 0 && (
          <Card className="border-warning/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-warning" />
                Work Orders Requiring QC Action
              </CardTitle>
              <CardDescription>
                Click on a work order to navigate and perform the required QC inspection
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Work Order</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Item Code</TableHead>
                    <TableHead>Material QC</TableHead>
                    <TableHead>First Piece QC</TableHead>
                    <TableHead>Pending Checks</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {workOrdersNeedingAction.map((wo) => (
                    <TableRow 
                      key={wo.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => navigate(`/work-orders/${wo.id}?tab=qc`)}
                    >
                      <TableCell className="font-medium">{wo.display_id}</TableCell>
                      <TableCell>{wo.customer}</TableCell>
                      <TableCell>{wo.item_code}</TableCell>
                      <TableCell>{getQCStatusBadge(wo.qc_material_status)}</TableCell>
                      <TableCell>{getQCStatusBadge(wo.qc_first_piece_status)}</TableCell>
                      <TableCell>
                        {wo.pending_qc_count > 0 && (
                          <Badge variant="outline" className="text-warning border-warning">
                            {wo.pending_qc_count} pending
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-primary text-sm">
                          Go to WO <ArrowRight className="h-4 w-4" />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* All Work Orders QC Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              All Active Work Orders - QC Summary
            </CardTitle>
            <CardDescription>
              Overview of quality control status for all active work orders
            </CardDescription>
          </CardHeader>
          <CardContent>
            {workOrderSummaries.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <FlaskConical className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No active work orders found</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Work Order</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Item Code</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Material QC</TableHead>
                    <TableHead>First Piece</TableHead>
                    <TableHead className="text-center">Passed</TableHead>
                    <TableHead className="text-center">Failed</TableHead>
                    <TableHead>Last QC</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {workOrderSummaries.map((wo) => (
                    <TableRow 
                      key={wo.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => navigate(`/work-orders/${wo.id}?tab=qc`)}
                    >
                      <TableCell className="font-medium">{wo.display_id}</TableCell>
                      <TableCell>{wo.customer}</TableCell>
                      <TableCell>{wo.item_code}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="capitalize">{wo.status}</Badge>
                      </TableCell>
                      <TableCell>{getQCStatusBadge(wo.qc_material_status)}</TableCell>
                      <TableCell>{getQCStatusBadge(wo.qc_first_piece_status)}</TableCell>
                      <TableCell className="text-center">
                        {wo.passed_qc_count > 0 && (
                          <span className="text-success font-medium">{wo.passed_qc_count}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {wo.failed_qc_count > 0 && (
                          <span className="text-destructive font-medium">{wo.failed_qc_count}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {wo.last_qc_date 
                          ? new Date(wo.last_qc_date).toLocaleDateString()
                          : '-'
                        }
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-primary text-sm">
                          <Eye className="h-4 w-4" />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Quality;
