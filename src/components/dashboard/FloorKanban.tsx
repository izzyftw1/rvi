import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Package, 
  Factory, 
  ClipboardCheck, 
  Box, 
  Truck, 
  ArrowRight,
  Sparkles,
  Wind,
  Hammer,
  Flame,
  AlertTriangle,
  Clock,
  Wrench,
  Scissors
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useBatchDashboard, BatchLocationType } from "@/hooks/useBatchDashboard";

/**
 * FloorKanban - Live factory floor status
 * 
 * SINGLE SOURCE OF TRUTH: production_batches
 * Uses: current_location_type, current_process
 * 
 * NO DEPENDENCY on work_order.stage
 */

const STAGE_ICONS: Record<string, React.ElementType> = {
  cutting: Scissors,
  production: Factory,
  qc: ClipboardCheck,
  packing: Box,
  external: Truck,
  transit: Truck,
  packed: Package,
  dispatched: Truck
};

const STAGE_ROUTES: Record<string, string> = {
  cutting: '/work-orders?stage=cutting',
  production: '/production-progress',
  qc: '/quality',
  packing: '/packing',
  external: '/work-orders?type=external',
  transit: '/logistics',
  packed: '/dispatch',
  dispatched: '/dispatch'
};

const STAGE_LABELS: Record<string, string> = {
  cutting: 'Cutting',
  production: 'Production',
  qc: 'Quality Control',
  packing: 'Packing',
  external: 'External',
  transit: 'In Transit',
  packed: 'Packed',
  dispatched: 'Dispatched'
};

const EXTERNAL_ICONS: Record<string, React.ElementType> = {
  'forging': Flame,
  'job_work': Wrench,
  'plating': Sparkles,
  'buffing': Wind,
  'blasting': Hammer,
  'heat_treatment': Flame
};

const AnimatedNumber = ({ value }: { value: number }) => {
  return <span>{value.toLocaleString()}</span>;
};

export const FloorKanban = () => {
  const navigate = useNavigate();
  const { summary, batches, loading } = useBatchDashboard();

  // Transform summary into stage cards
  const internalStages = [
    {
      key: 'cutting',
      quantity: summary.factory.byProcess['cutting']?.quantity || 0,
      batchCount: summary.factory.byProcess['cutting']?.batchCount || 0,
    },
    {
      key: 'production',
      quantity: summary.factory.byProcess['production']?.quantity || 0,
      batchCount: summary.factory.byProcess['production']?.batchCount || 0,
    },
    {
      key: 'qc',
      quantity: (summary.factory.byProcess['qc']?.quantity || 0) + 
                (summary.factory.byProcess['post_external_qc']?.quantity || 0),
      batchCount: (summary.factory.byProcess['qc']?.batchCount || 0) + 
                  (summary.factory.byProcess['post_external_qc']?.batchCount || 0),
    },
    {
      key: 'packing',
      quantity: summary.packed.total,
      batchCount: summary.packed.batchCount,
    },
  ];

  // External processes from external_partner location
  const externalProcesses = Object.entries(summary.external_partner.byProcess).map(([process, data]) => ({
    processType: process,
    quantity: data.quantity,
    batchCount: data.batchCount,
  }));

  const getStatusColor = (batchCount: number) => {
    if (batchCount === 0) return 'border-muted';
    if (batchCount > 10) return 'border-amber-500 bg-amber-50 dark:bg-amber-950/30';
    return 'border-green-500 bg-green-50 dark:bg-green-950/30';
  };

  if (loading) {
    return (
      <div className="mb-6">
        <h2 className="text-xl font-bold mb-4">Live Floor Status</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-36 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="mb-6 space-y-6">
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold">Live Floor Status</h2>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span>Total Batches: <strong className="text-foreground">{summary.totalBatches}</strong></span>
              <span>Factory: <strong className="text-foreground">{summary.factory.total.toLocaleString()}</strong> pcs</span>
              <span>External: <strong className="text-amber-600">{summary.external_partner.total.toLocaleString()}</strong> pcs</span>
            </div>
          </div>
          
          {/* Internal Stages */}
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-1 w-6 bg-gradient-to-r from-gray-400 to-gray-600 rounded" />
              <h3 className="text-sm font-semibold text-muted-foreground">Internal Flow</h3>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {internalStages.map((stage, idx) => {
                const StageIcon = STAGE_ICONS[stage.key] || Package;
                const route = STAGE_ROUTES[stage.key] || '/production-progress';
                const label = STAGE_LABELS[stage.key] || stage.key;
                const hasData = stage.batchCount > 0;
                
                return (
                  <div key={stage.key} className="relative">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Card 
                          className={cn(
                            "cursor-pointer hover:shadow-xl transition-all duration-300 border-l-4",
                            getStatusColor(stage.batchCount),
                            !hasData && "opacity-60"
                          )}
                          onClick={() => navigate(route)}
                        >
                          <CardHeader className="pb-2">
                            <div className="flex items-center justify-between">
                              <StageIcon className={cn(
                                "h-5 w-5",
                                hasData ? "text-primary" : "text-muted-foreground"
                              )} />
                              <Badge variant="outline" className="text-xs">
                                {stage.batchCount} batches
                              </Badge>
                            </div>
                            <CardTitle className="text-sm font-medium text-muted-foreground">
                              {label}
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="text-2xl font-bold">
                              <AnimatedNumber value={stage.quantity} />
                            </div>
                            <p className="text-xs text-muted-foreground">pcs</p>
                          </CardContent>
                        </Card>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        <p>Click to view {label.toLowerCase()} details</p>
                      </TooltipContent>
                    </Tooltip>
                    {idx < internalStages.length - 1 && (
                      <div className="hidden md:flex absolute right-0 top-1/2 transform translate-x-1/2 -translate-y-1/2 z-10">
                        <ArrowRight className="h-5 w-5 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* External Stages */}
          {externalProcesses.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="h-1 w-6 bg-gradient-to-r from-amber-400 to-amber-600 rounded" />
                <h3 className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                  External Processing
                </h3>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {externalProcesses.map((proc) => {
                  const ProcessIcon = EXTERNAL_ICONS[proc.processType.toLowerCase()] || Factory;
                  
                  return (
                    <Tooltip key={proc.processType}>
                      <TooltipTrigger asChild>
                        <Card 
                          className={cn(
                            "cursor-pointer hover:shadow-xl transition-all duration-300 border-l-4",
                            "border-amber-500 bg-amber-50 dark:bg-amber-950/30"
                          )}
                          onClick={() => navigate(`/work-orders?external=${proc.processType.toLowerCase()}`)}
                        >
                          <CardHeader className="pb-2">
                            <div className="flex items-center justify-between">
                              <ProcessIcon className="h-5 w-5 text-amber-600" />
                              <Badge variant="outline" className="text-xs">
                                {proc.batchCount}
                              </Badge>
                            </div>
                            <CardTitle className="text-sm font-medium text-muted-foreground capitalize">
                              {proc.processType}
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="text-2xl font-bold text-amber-700 dark:text-amber-400">
                              <AnimatedNumber value={proc.quantity} />
                            </div>
                            <p className="text-xs text-muted-foreground">pcs</p>
                          </CardContent>
                        </Card>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">
                        <p>{proc.batchCount} batches at {proc.processType}</p>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Source indicator */}
        <p className="text-[10px] text-muted-foreground italic text-right">
          Source: production_batches (current_location_type, current_process)
        </p>
      </div>
    </TooltipProvider>
  );
};
