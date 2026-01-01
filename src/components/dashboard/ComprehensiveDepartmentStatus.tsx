import { useNavigate } from "react-router-dom";
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
import { useBatchBasedWIP } from "@/hooks/useBatchBasedWIP";

/**
 * ComprehensiveDepartmentStatus - Batch-Based Implementation
 * 
 * All counts and metrics are derived from production_batches table,
 * NOT from work_orders.current_stage.
 * 
 * A Work Order may have multiple active batches in different stages simultaneously.
 */

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

// Map stage_type to display config
const STAGE_CONFIG: Record<string, { title: string; icon: LucideIcon; route: string }> = {
  'cutting': { title: 'Cutting', icon: Scissors, route: '/cutting' },
  'production': { title: 'CNC / Production', icon: Factory, route: '/production-progress' },
  'qc': { title: 'Quality Control', icon: ClipboardCheck, route: '/quality' },
  'packing': { title: 'Packing', icon: Box, route: '/packing' },
  'dispatch': { title: 'Dispatch', icon: Truck, route: '/dispatch' },
};

// Map external process types to icons
const EXTERNAL_PROCESS_CONFIG: Record<string, { icon: LucideIcon }> = {
  'job_work': { icon: Users },
  'plating': { icon: Sparkles },
  'buffing': { icon: Wind },
  'blasting': { icon: Hammer },
};

export const ComprehensiveDepartmentStatus = () => {
  const navigate = useNavigate();
  const { internalStages, externalProcesses, summary, loading } = useBatchBasedWIP();

  // Build metrics for internal stages from batch data
  const internalMetrics: DepartmentMetrics[] = internalStages.map(stage => {
    const config = STAGE_CONFIG[stage.stage] || { 
      title: stage.stage, 
      icon: Package, 
      route: '/work-orders' 
    };
    
    const completedCount = stage.completed;
    const progress = stage.batchCount > 0 
      ? Math.round((completedCount / stage.batchCount) * 100) 
      : 0;
    
    return {
      title: config.title,
      icon: config.icon,
      activeJobs: stage.batchCount,
      totalQtyPcs: stage.totalQuantity,
      totalQtyKg: 0, // Weight not tracked at batch level currently
      completedQtyPcs: 0, // Batch-level completion tracked via completed count
      completedQtyKg: 0,
      progressPercentage: progress,
      status: stage.overdueCount > 0 ? 'delayed' : stage.batchCount > 0 ? 'active' : 'done',
      onClick: () => navigate(config.route),
      isExternal: false
    };
  });

  // Add Goods In as first stage (batches not yet in production)
  // This represents WOs that have batches but none have started cutting yet
  const goodsInMetric: DepartmentMetrics = {
    title: 'Goods In',
    icon: Package,
    activeJobs: 0, // Will be calculated from WOs without any active batches
    totalQtyPcs: 0,
    totalQtyKg: 0,
    completedQtyPcs: 0,
    completedQtyKg: 0,
    progressPercentage: 0,
    status: 'done',
    onClick: () => navigate('/gate-register'),
    isExternal: false
  };

  // Build metrics for external processes from batch data
  const externalMetrics: DepartmentMetrics[] = externalProcesses.map(process => {
    const config = EXTERNAL_PROCESS_CONFIG[process.processType] || { icon: Users };
    const displayName = process.processType
      .split('_')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
    
    return {
      title: displayName,
      icon: config.icon,
      activeJobs: process.batchCount,
      totalQtyPcs: process.totalQuantity,
      totalQtyKg: 0,
      completedQtyPcs: 0,
      completedQtyKg: 0,
      progressPercentage: 0, // External progress tracked separately
      status: process.overdueCount > 0 ? 'delayed' : process.batchCount > 0 ? 'active' : 'done',
      onClick: () => navigate('/logistics'),
      isExternal: true
    };
  });

  // Calculate overall progress from batch summary
  const totalActive = summary.totalBatches;
  const totalCompleted = summary.dispatchedBatches;
  const overallProgress = totalActive + totalCompleted > 0 
    ? Math.round((totalCompleted / (totalActive + totalCompleted)) * 100) 
    : 0;

  // Count overdue from internal stages
  const overdueCount = internalStages.reduce((sum, s) => sum + s.overdueCount, 0);

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

  // Combine internal metrics
  const allInternalMetrics = [goodsInMetric, ...internalMetrics];

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
            <CardTitle className="text-sm font-medium text-muted-foreground">Overdue Batches</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-500">{overdueCount}</div>
            <p className="text-xs text-muted-foreground mt-2">Batches past WO due date</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">External WIP</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-amber-500">{summary.totalExternalWIP.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-2">Pieces at external partners</p>
          </CardContent>
        </Card>
      </div>

      {/* Internal Departments */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <div className="h-1 w-8 bg-gradient-to-r from-gray-400 to-gray-600 rounded" />
          <h3 className="text-lg font-bold text-gray-700 dark:text-gray-300">Internal Departments</h3>
          <span className="text-xs text-muted-foreground ml-2">
            ({summary.totalInternalWIP.toLocaleString()} pcs WIP)
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {allInternalMetrics.map((metric, idx) => {
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
                    <span className="text-xs text-muted-foreground">Active Batches</span>
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
            <span className="text-xs text-muted-foreground ml-2">
              ({summary.totalExternalWIP.toLocaleString()} pcs)
            </span>
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
                      <span className="text-xs text-muted-foreground">Active Batches</span>
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
      )}

      {/* Source indicator */}
      <p className="text-[10px] text-muted-foreground text-center">
        Source: production_batches (batch-level)
      </p>
    </div>
  );
};
