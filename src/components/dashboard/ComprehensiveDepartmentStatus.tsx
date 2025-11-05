import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  Package, 
  Scissors, 
  Flame, 
  Factory, 
  ClipboardCheck, 
  Box, 
  Truck,
  Users,
  Sparkles,
  Wind,
  Hammer,
  LucideIcon
} from "lucide-react";
import { cn } from "@/lib/utils";

interface DepartmentMetrics {
  title: string;
  icon: LucideIcon;
  activeJobs: number;
  totalQtyPcs: number;
  totalQtyKg: number;
  completedQtyPcs: number;
  completedQtyKg: number;
  progressPercentage: number;
  status: 'pending' | 'active' | 'done' | 'delayed';
  onClick: () => void;
  isExternal?: boolean;
}

export const ComprehensiveDepartmentStatus = () => {
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState<DepartmentMetrics[]>([]);
  const [loading, setLoading] = useState(true);
  const [overallProgress, setOverallProgress] = useState(0);
  const [overdueCount, setOverdueCount] = useState(0);
  const [externalWIP, setExternalWIP] = useState({ pcs: 0, kg: 0 });

  useEffect(() => {
    loadAllMetrics();

    // Set up real-time subscriptions
    const channel = supabase
      .channel('department-metrics')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_orders' }, loadAllMetrics)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cutting_records' }, loadAllMetrics)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'forging_records' }, loadAllMetrics)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wo_external_moves' }, loadAllMetrics)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wo_external_receipts' }, loadAllMetrics)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'production_logs' }, loadAllMetrics)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'qc_records' }, loadAllMetrics)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadAllMetrics = async () => {
    try {
      setLoading(true);

      // Fetch all necessary data
      const [
        workOrders,
        cuttingRecords,
        forgingRecords,
        externalMoves,
        externalReceipts,
        productionLogs,
        qcRecords
      ] = await Promise.all([
        supabase.from('work_orders').select('*'),
        supabase.from('cutting_records').select('*'),
        supabase.from('forging_records').select('*'),
        supabase.from('wo_external_moves' as any).select('*'),
        supabase.from('wo_external_receipts' as any).select('*'),
        supabase.from('production_logs').select('*'),
        supabase.from('qc_records').select('*')
      ]);

      const wos = workOrders.data || [];
      const cutting = cuttingRecords.data || [];
      const forging = forgingRecords.data || [];
      const moves: any[] = externalMoves.data || [];
      const receipts: any[] = externalReceipts.data || [];
      const prodLogs = productionLogs.data || [];
      const qc = qcRecords.data || [];

      // Calculate overall progress
      const totalQty = wos.reduce((sum, wo) => sum + (wo.quantity || 0), 0);
      const completedQty = prodLogs.reduce((sum, log) => sum + (log.quantity_completed || 0) - (log.quantity_scrap || 0), 0);
      const overallProg = totalQty > 0 ? Math.round((completedQty / totalQty) * 100) : 0;
      setOverallProgress(overallProg);

      // Calculate overdue count
      const today = new Date().toISOString().split('T')[0];
      const overdue = wos.filter(wo => wo.due_date < today && wo.status !== 'completed').length;
      setOverdueCount(overdue);

      // Calculate external WIP
      const externalWIPPcs = moves.reduce((sum, move) => {
        const received = receipts
          .filter(r => r.move_id === move.id)
          .reduce((s, r) => s + (r.qty_received || 0), 0);
        return sum + (move.qty_sent || 0) - received;
      }, 0);
      setExternalWIP({ pcs: externalWIPPcs, kg: 0 }); // TODO: Add kg calculation if needed

      // Build metrics for each department
      const departmentMetrics: DepartmentMetrics[] = [];

      // 1. Goods In
      const goodsInWOs = wos.filter(wo => wo.current_stage === 'goods_in');
      departmentMetrics.push({
        title: "Goods In",
        icon: Package,
        activeJobs: goodsInWOs.length,
        totalQtyPcs: goodsInWOs.reduce((sum, wo) => sum + (wo.quantity || 0), 0),
        totalQtyKg: goodsInWOs.reduce((sum, wo) => sum + ((wo.quantity || 0) * (wo.gross_weight_per_pc || 0) / 1000), 0),
        completedQtyPcs: 0,
        completedQtyKg: 0,
        progressPercentage: 0,
        status: goodsInWOs.length > 0 ? 'active' : 'done',
        onClick: () => navigate('/material-inwards'),
        isExternal: false
      });

      // 2. Cutting
      const cuttingActive = cutting.filter(c => c.status !== 'completed');
      const cuttingTotal = cutting.reduce((sum, c) => sum + (c.qty_required || 0), 0);
      const cuttingDone = cutting.reduce((sum, c) => sum + (c.qty_cut || 0), 0);
      departmentMetrics.push({
        title: "Cutting",
        icon: Scissors,
        activeJobs: cuttingActive.length,
        totalQtyPcs: cuttingTotal,
        totalQtyKg: 0,
        completedQtyPcs: cuttingDone,
        completedQtyKg: 0,
        progressPercentage: cuttingTotal > 0 ? Math.round((cuttingDone / cuttingTotal) * 100) : 0,
        status: cuttingActive.length > 0 ? 'active' : 'done',
        onClick: () => navigate('/cutting'),
        isExternal: false
      });

      // 3. Forging
      const forgingActive = forging.filter(f => f.status !== 'completed');
      const forgingTotal = forging.reduce((sum, f) => sum + (f.qty_required || 0), 0);
      const forgingDone = forging.reduce((sum, f) => sum + (f.qty_forged || 0), 0);
      departmentMetrics.push({
        title: "Forging",
        icon: Flame,
        activeJobs: forgingActive.length,
        totalQtyPcs: forgingTotal,
        totalQtyKg: 0,
        completedQtyPcs: forgingDone,
        completedQtyKg: 0,
        progressPercentage: forgingTotal > 0 ? Math.round((forgingDone / forgingTotal) * 100) : 0,
        status: forgingActive.length > 0 ? 'active' : 'done',
        onClick: () => navigate('/forging'),
        isExternal: false
      });

      // 4. CNC / Production
      const productionWOs = wos.filter(wo => wo.current_stage === 'production');
      const productionTotal = productionWOs.reduce((sum, wo) => sum + (wo.quantity || 0), 0);
      const productionCompleted = prodLogs
        .filter(log => productionWOs.some(wo => wo.id === log.wo_id))
        .reduce((sum, log) => sum + (log.quantity_completed || 0) - (log.quantity_scrap || 0), 0);
      departmentMetrics.push({
        title: "CNC / Production",
        icon: Factory,
        activeJobs: productionWOs.length,
        totalQtyPcs: productionTotal,
        totalQtyKg: productionWOs.reduce((sum, wo) => sum + ((wo.quantity || 0) * (wo.gross_weight_per_pc || 0) / 1000), 0),
        completedQtyPcs: productionCompleted,
        completedQtyKg: 0,
        progressPercentage: productionTotal > 0 ? Math.round((productionCompleted / productionTotal) * 100) : 0,
        status: productionWOs.length > 0 ? 'active' : 'done',
        onClick: () => navigate('/production-progress'),
        isExternal: false
      });

      // 5. QC
      const qcWOs = wos.filter(wo => wo.current_stage === 'qc');
      const qcPending = qc.filter(q => q.result === 'pending');
      const qcPassed = qc.filter(q => q.result === 'pass');
      departmentMetrics.push({
        title: "Quality Control",
        icon: ClipboardCheck,
        activeJobs: qcWOs.length,
        totalQtyPcs: qcWOs.reduce((sum, wo) => sum + (wo.quantity || 0), 0),
        totalQtyKg: qcWOs.reduce((sum, wo) => sum + ((wo.quantity || 0) * (wo.gross_weight_per_pc || 0) / 1000), 0),
        completedQtyPcs: qcPassed.length,
        completedQtyKg: 0,
        progressPercentage: (qcPending.length + qcPassed.length) > 0 ? Math.round((qcPassed.length / (qcPending.length + qcPassed.length)) * 100) : 0,
        status: qcWOs.length > 0 ? 'active' : 'done',
        onClick: () => navigate('/quality'),
        isExternal: false
      });

      // 6. Packing
      const packingWOs = wos.filter(wo => wo.current_stage === 'packing');
      departmentMetrics.push({
        title: "Packing",
        icon: Box,
        activeJobs: packingWOs.length,
        totalQtyPcs: packingWOs.reduce((sum, wo) => sum + (wo.quantity || 0), 0),
        totalQtyKg: packingWOs.reduce((sum, wo) => sum + ((wo.quantity || 0) * (wo.gross_weight_per_pc || 0) / 1000), 0),
        completedQtyPcs: 0,
        completedQtyKg: 0,
        progressPercentage: 0,
        status: packingWOs.length > 0 ? 'active' : 'done',
        onClick: () => navigate('/packing'),
        isExternal: false
      });

      // 7. Dispatch
      const dispatchWOs = wos.filter(wo => wo.current_stage === 'dispatch');
      departmentMetrics.push({
        title: "Dispatch",
        icon: Truck,
        activeJobs: dispatchWOs.length,
        totalQtyPcs: dispatchWOs.reduce((sum, wo) => sum + (wo.quantity || 0), 0),
        totalQtyKg: dispatchWOs.reduce((sum, wo) => sum + ((wo.quantity || 0) * (wo.gross_weight_per_pc || 0) / 1000), 0),
        completedQtyPcs: 0,
        completedQtyKg: 0,
        progressPercentage: 0,
        status: dispatchWOs.length > 0 ? 'active' : 'done',
        onClick: () => navigate('/dispatch'),
        isExternal: false
      });

      // External Processes
      const externalProcessTypes = ['job_work', 'plating', 'buffing', 'blasting'];
      
      externalProcessTypes.forEach(processType => {
        const processIcon = processType === 'job_work' ? Users :
                          processType === 'plating' ? Sparkles :
                          processType === 'buffing' ? Wind : Hammer;
        
        const processMoves = moves.filter(m => m.process_type === processType);
        const totalSent = processMoves.reduce((sum, m) => sum + (m.qty_sent || 0), 0);
        const totalReceived = receipts
          .filter(r => processMoves.some(m => m.id === r.move_id))
          .reduce((sum, r) => sum + (r.qty_received || 0), 0);
        
        departmentMetrics.push({
          title: processType.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
          icon: processIcon,
          activeJobs: processMoves.filter(m => m.status !== 'returned').length,
          totalQtyPcs: totalSent,
          totalQtyKg: 0,
          completedQtyPcs: totalReceived,
          completedQtyKg: 0,
          progressPercentage: totalSent > 0 ? Math.round((totalReceived / totalSent) * 100) : 0,
          status: processMoves.filter(m => m.status !== 'returned').length > 0 ? 'active' : 'done',
          onClick: () => navigate('/logistics'),
          isExternal: true
        });
      });

      setMetrics(departmentMetrics);
      setLoading(false);
    } catch (error) {
      console.error('Error loading department metrics:', error);
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'done': return 'bg-green-500/10 border-green-500';
      case 'active': return 'bg-blue-500/10 border-blue-500';
      case 'delayed': return 'bg-red-500/10 border-red-500';
      default: return 'bg-gray-500/10 border-gray-500';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'done': return <Badge className="bg-green-500 text-white">Done</Badge>;
      case 'active': return <Badge className="bg-blue-500 text-white">Active</Badge>;
      case 'delayed': return <Badge variant="destructive">Delayed</Badge>;
      default: return <Badge variant="secondary">Pending</Badge>;
    }
  };

  const internalMetrics = metrics.filter(m => !m.isExternal);
  const externalMetrics = metrics.filter(m => m.isExternal);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">Department Status</h2>
          <div className="h-8 w-32 bg-muted animate-pulse rounded" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-48 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Overall Metrics Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Overall Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{overallProgress}%</div>
            <Progress value={overallProgress} className="mt-2" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Overdue Orders</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-500">{overdueCount}</div>
            <p className="text-xs text-muted-foreground mt-2">Work orders past due date</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">External WIP</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-amber-500">{externalWIP.pcs}</div>
            <p className="text-xs text-muted-foreground mt-2">Pieces at external partners</p>
          </CardContent>
        </Card>
      </div>

      {/* Internal Departments */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <div className="h-1 w-8 bg-gradient-to-r from-gray-400 to-gray-600 rounded" />
          <h3 className="text-lg font-bold text-gray-700 dark:text-gray-300">Internal Departments</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {internalMetrics.map((metric, idx) => {
            const Icon = metric.icon;
            return (
              <Card
                key={idx}
                className={cn(
                  "cursor-pointer hover:shadow-lg transition-all border-l-4",
                  getStatusColor(metric.status)
                )}
                onClick={metric.onClick}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <Icon className="h-5 w-5 text-primary" />
                    {getStatusBadge(metric.status)}
                  </div>
                  <CardTitle className="text-sm font-medium">{metric.title}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">Active Jobs</span>
                    <span className="text-lg font-bold">{metric.activeJobs}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-center pt-2 border-t">
                    <div>
                      <p className="text-base font-semibold">{metric.totalQtyPcs.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">Pcs</p>
                    </div>
                    <div>
                      <p className="text-base font-semibold">{metric.totalQtyKg.toFixed(1)}</p>
                      <p className="text-xs text-muted-foreground">Kg</p>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Progress</span>
                      <span className="font-medium">{metric.progressPercentage}%</span>
                    </div>
                    <Progress value={metric.progressPercentage} className="h-2" />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* External Processes */}
      {externalMetrics.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <div className="h-1 w-8 bg-gradient-to-r from-amber-400 to-amber-600 rounded" />
            <h3 className="text-lg font-bold text-amber-700 dark:text-amber-400">External Processes</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {externalMetrics.map((metric, idx) => {
              const Icon = metric.icon;
              return (
                <Card
                  key={idx}
                  className={cn(
                    "cursor-pointer hover:shadow-lg transition-all border-l-4",
                    getStatusColor(metric.status)
                  )}
                  onClick={metric.onClick}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <Icon className="h-5 w-5 text-amber-600" />
                      {getStatusBadge(metric.status)}
                    </div>
                    <CardTitle className="text-sm font-medium">{metric.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-muted-foreground">Active Jobs</span>
                      <span className="text-lg font-bold">{metric.activeJobs}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-center pt-2 border-t">
                      <div>
                        <p className="text-base font-semibold">{metric.totalQtyPcs.toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground">Sent</p>
                      </div>
                      <div>
                        <p className="text-base font-semibold">{metric.completedQtyPcs.toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground">Received</p>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Return Rate</span>
                        <span className="font-medium">{metric.progressPercentage}%</span>
                      </div>
                      <Progress value={metric.progressPercentage} className="h-2" />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
