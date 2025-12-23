import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";

import { PageHeader, PageContainer } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TrendingUp, Eye, ArrowRight, Inbox, FlaskConical } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { QCStatusIndicator } from "@/components/qc/QCStatusIndicator";
import { QCSummaryStats, QCInfoAlert, QCActionRequired, QCHistory } from "@/components/qc/QCPageLayout";
import { EmptyState } from "@/components/ui/empty-state";

interface ProductionMetrics {
  runtime_minutes: number;
  actual_quantity: number;
  rejection_quantity: number;
  efficiency: number;
  machine_name: string;
  operator_name: string;
  shift: string;
}

interface WorkOrderQCSummary {
  id: string;
  wo_number: string;
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
  // Production metrics from Daily Production Log (read-only)
  production_metrics: ProductionMetrics | null;
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
      
      const { data: workOrders, error: woError } = await supabase
        .from("work_orders")
        .select(`
          id, wo_number, customer, item_code, status,
          qc_material_status, qc_first_piece_status
        `)
        .in('status', ['pending', 'in_progress', 'qc', 'packing'])
        .order("created_at", { ascending: false })
        .limit(100);

      if (woError) throw woError;

      const { data: qcRecords, error: qcError } = await supabase
        .from("qc_records")
        .select("id, result, wo_id, created_at, qc_type")
        .order("created_at", { ascending: false });

      if (qcError) throw qcError;

      // Fetch production metrics from daily_production_logs for all work orders
      const woIds = (workOrders || []).map(wo => wo.id);
      const { data: productionLogs } = await supabase
        .from("daily_production_logs")
        .select(`
          wo_id,
          actual_runtime_minutes,
          actual_quantity,
          total_rejection_quantity,
          efficiency_percentage,
          shift,
          machines:machine_id(name),
          operator:operator_id(full_name)
        `)
        .in("wo_id", woIds)
        .order("log_date", { ascending: false });

      // Map production metrics by wo_id (use latest log per WO)
      const productionByWo = new Map<string, ProductionMetrics>();
      productionLogs?.forEach(log => {
        if (!productionByWo.has(log.wo_id)) {
          productionByWo.set(log.wo_id, {
            runtime_minutes: log.actual_runtime_minutes || 0,
            actual_quantity: log.actual_quantity || 0,
            rejection_quantity: log.total_rejection_quantity || 0,
            efficiency: log.efficiency_percentage || 0,
            machine_name: (log.machines as any)?.name || "-",
            operator_name: (log.operator as any)?.full_name || "-",
            shift: log.shift || "-",
          });
        }
      });

      const total = qcRecords?.length || 0;
      const passed = qcRecords?.filter(r => r.result === 'pass').length || 0;
      const failed = qcRecords?.filter(r => r.result === 'fail').length || 0;
      const pending = qcRecords?.filter(r => r.result === 'pending').length || 0;
      const passRate = total > 0 ? Math.round((passed / total) * 100) : 0;

      setQcStats({ total, passed, failed, pending, passRate });

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

      const summaries: WorkOrderQCSummary[] = (workOrders || []).map(wo => {
        const qcInfo = qcByWo.get(wo.id);
        const prodMetrics = productionByWo.get(wo.id) || null;
        return {
          id: wo.id,
          wo_number: wo.wo_number,
          customer: wo.customer,
          item_code: wo.item_code,
          status: wo.status,
          qc_material_status: wo.qc_material_status,
          qc_first_piece_status: wo.qc_first_piece_status,
          pending_qc_count: qcInfo?.pending || 0,
          passed_qc_count: qcInfo?.passed || 0,
          failed_qc_count: qcInfo?.failed || 0,
          last_qc_date: qcInfo?.lastDate || null,
          qc_type_needed: qcInfo?.neededType || null,
          production_metrics: prodMetrics,
        };
      });

      summaries.sort((a, b) => {
        if (a.pending_qc_count > 0 && b.pending_qc_count === 0) return -1;
        if (a.pending_qc_count === 0 && b.pending_qc_count > 0) return 1;
        return 0;
      });

      setWorkOrderSummaries(summaries);
    } catch (error: any) {
      console.error("Error loading QC data:", error);
      toast({ variant: "destructive", title: "Error loading QC data", description: error.message });
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

    return () => { supabase.removeChannel(channel); };
  }, [loadData]);

  const workOrdersNeedingAction = useMemo(() => 
    workOrderSummaries.filter(wo => 
      wo.pending_qc_count > 0 || 
      wo.qc_material_status === 'pending' || 
      wo.qc_first_piece_status === 'pending'
    ), [workOrderSummaries]
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <PageContainer maxWidth="2xl">
          <div className="space-y-6">
            <Skeleton className="h-10 w-64" />
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-20" />)}
            </div>
            <Skeleton className="h-64" />
          </div>
        </PageContainer>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <PageContainer maxWidth="2xl">
        <div className="space-y-6">
          {/* Header */}
          <PageHeader
            title="Quality Control Overview"
            description="Quality metrics and inspection status across all work orders"
            icon={<TrendingUp className="h-6 w-6" />}
          />

          {/* Info */}
          <QCInfoAlert
            title="QC Actions are Work Order Based"
            description="Navigate to the specific Work Order to perform QC inspections. This dashboard provides an overview."
          />

          {/* Summary Stats */}
          <QCSummaryStats
            stats={[
              { label: 'Total Inspections', value: qcStats.total, type: 'total' },
              { label: 'Pass Rate', value: qcStats.passRate, type: 'passed' },
              { label: 'Failed', value: qcStats.failed, type: 'failed' },
              { label: 'Pending', value: qcStats.pending, type: 'pending' },
            ]}
          />

          {/* Action Required */}
          {workOrdersNeedingAction.length > 0 && (
            <QCActionRequired
              title="Work Orders Requiring QC"
              description="Click on a work order to navigate and perform the required inspection"
              count={workOrdersNeedingAction.length}
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Work Order</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Item Code</TableHead>
                    <TableHead>Material QC</TableHead>
                    <TableHead>First Piece</TableHead>
                    <TableHead>Pending</TableHead>
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
                      <TableCell className="font-medium">{wo.wo_number}</TableCell>
                      <TableCell>{wo.customer}</TableCell>
                      <TableCell>{wo.item_code}</TableCell>
                      <TableCell><QCStatusIndicator status={wo.qc_material_status as any} size="sm" /></TableCell>
                      <TableCell><QCStatusIndicator status={wo.qc_first_piece_status as any} size="sm" /></TableCell>
                      <TableCell>
                        {wo.pending_qc_count > 0 && (
                          <Badge variant="outline" className="text-amber-600 border-amber-300 text-xs">
                            {wo.pending_qc_count}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-primary text-sm">
                          Go <ArrowRight className="h-3.5 w-3.5" />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </QCActionRequired>
          )}

          {/* History - All Work Orders */}
          <QCHistory
            title="All Active Work Orders"
            description="Overview of quality control status"
          >
            {workOrderSummaries.length === 0 ? (
              <EmptyState
                icon="quality"
                title="No Active Work Orders"
                description="Work orders requiring quality inspection will appear here. Create a work order and complete Material QC or First Piece QC to see them in this list."
                hint="QC records are created during production when inspections are performed."
                size="md"
              />
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
                    <TableHead className="text-right text-xs">Prod Qty</TableHead>
                    <TableHead className="text-right text-xs">Rej Qty</TableHead>
                    <TableHead className="text-right text-xs">Eff %</TableHead>
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
                      <TableCell className="font-medium">{wo.wo_number}</TableCell>
                      <TableCell>{wo.customer}</TableCell>
                      <TableCell>{wo.item_code}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="capitalize text-xs">{wo.status}</Badge>
                      </TableCell>
                      <TableCell><QCStatusIndicator status={wo.qc_material_status as any} size="sm" /></TableCell>
                      <TableCell><QCStatusIndicator status={wo.qc_first_piece_status as any} size="sm" /></TableCell>
                      <TableCell className="text-center">
                        {wo.passed_qc_count > 0 && (
                          <span className="text-emerald-600 font-medium">{wo.passed_qc_count}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {wo.failed_qc_count > 0 && (
                          <span className="text-destructive font-medium">{wo.failed_qc_count}</span>
                        )}
                      </TableCell>
                      {/* Production metrics from Daily Production Log - Read Only */}
                      <TableCell className="text-right text-sm">
                        {wo.production_metrics?.actual_quantity ?? '-'}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {wo.production_metrics?.rejection_quantity ? (
                          <span className="text-destructive">{wo.production_metrics.rejection_quantity}</span>
                        ) : '-'}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {wo.production_metrics?.efficiency ? (
                          <span className={wo.production_metrics.efficiency >= 100 ? 'text-emerald-600' : 'text-amber-600'}>
                            {wo.production_metrics.efficiency.toFixed(1)}%
                          </span>
                        ) : '-'}
                      </TableCell>
                      <TableCell>
                        <Eye className="h-4 w-4 text-primary" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </QCHistory>
        </div>
      </PageContainer>
    </div>
  );
};

export default Quality;
