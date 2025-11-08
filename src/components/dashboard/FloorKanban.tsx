import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useThrottledRealtime } from "@/hooks/useThrottledRealtime";
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
  Clock
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface StageData {
  stage: string;
  icon: React.ElementType;
  count: number;
  totalPcs: number;
  totalKg: number;
  avgWaitHours: number;
  status: 'normal' | 'warning' | 'bottleneck';
  onClick: () => void;
  isExternal?: boolean;
  breakdown?: {
    activeJobs: number;
    pendingReturns?: number;
    overdueCount?: number;
    expectedReturns?: string[];
  };
}

const AnimatedNumber = ({ value }: { value: number }) => {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    const duration = 1000;
    const steps = 20;
    const increment = value / steps;
    const stepDuration = duration / steps;

    let current = 0;
    const timer = setInterval(() => {
      current += increment;
      if (current >= value) {
        setDisplayValue(value);
        clearInterval(timer);
      } else {
        setDisplayValue(Math.floor(current));
      }
    }, stepDuration);

    return () => clearInterval(timer);
  }, [value]);

  return <span>{displayValue.toLocaleString()}</span>;
};

export const FloorKanban = () => {
  const navigate = useNavigate();
  const [stages, setStages] = useState<StageData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStageData();
  }, []);

  // Throttled realtime for Kanban - separate channel
  const loadStageDataCallback = useCallback(() => {
    loadStageData();
  }, []);

  useThrottledRealtime({
    channelName: 'dashboard-kanban',
    tables: ['work_orders', 'wo_external_moves', 'wo_external_receipts', 'production_logs'],
    onUpdate: loadStageDataCallback,
    throttleMs: 5000, // 5 seconds throttle
    cacheMs: 30000, // 30 seconds cache
  });

  const loadStageData = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];

      // Fetch work orders for internal stages
      const { data: wos } = await supabase
        .from('work_orders')
        .select('*');

      // Fetch external moves for external processing
      const { data: externalMoves } = await supabase
        .from('wo_external_moves')
        .select(`
          *,
          work_orders!inner(
            quantity,
            gross_weight_per_pc,
            item_code,
            customer
          )
        `)
        .in('status', ['sent', 'in_transit', 'partial']);

      const workOrders = wos || [];
      const moves: any[] = externalMoves || [];

      const stagesData: StageData[] = [];

      // Helper function to calculate status
      const getStatus = (avgWait: number): 'normal' | 'warning' | 'bottleneck' => {
        if (avgWait > 48) return 'bottleneck';
        if (avgWait > 24) return 'warning';
        return 'normal';
      };

      // Internal Stages
      const internalStages = [
        { key: 'goods_in', label: 'Goods In', icon: Package, route: '/materials/inwards' },
        { key: 'production', label: 'Production', icon: Factory, route: '/production-progress' },
        { key: 'qc', label: 'Quality Control', icon: ClipboardCheck, route: '/quality' },
        { key: 'packing', label: 'Packing', icon: Box, route: '/packing' },
        { key: 'dispatch', label: 'Dispatch', icon: Truck, route: '/dispatch' }
      ];

      internalStages.forEach(({ key, label, icon, route }) => {
        const stageWOs = workOrders.filter(wo => wo.current_stage === key);
        const totalWaitHours = stageWOs.reduce((sum, wo) => {
          const waitTime = (Date.now() - new Date(wo.updated_at).getTime()) / (1000 * 60 * 60);
          return sum + waitTime;
        }, 0);
        const avgWait = stageWOs.length > 0 ? totalWaitHours / stageWOs.length : 0;
        const overdueCount = stageWOs.filter(wo => wo.due_date < today && wo.status !== 'completed').length;

        stagesData.push({
          stage: label,
          icon,
          count: stageWOs.length,
          totalPcs: stageWOs.reduce((sum, wo) => sum + (wo.quantity || 0), 0),
          totalKg: stageWOs.reduce((sum, wo) => sum + ((wo.quantity || 0) * (wo.gross_weight_per_pc || 0) / 1000), 0),
          avgWaitHours: avgWait,
          status: getStatus(avgWait),
          onClick: () => navigate(route),
          isExternal: false,
          breakdown: {
            activeJobs: stageWOs.filter(wo => wo.status === 'in_progress').length,
            overdueCount
          }
        });
      });

      // External Processing Stages - fetch from both work_orders and wo_external_moves
      const externalStages = [
        { type: 'Job Work', label: 'Job Work', icon: Factory, woStage: 'job_work' },
        { type: 'Plating', label: 'Plating', icon: Sparkles, woStage: 'plating' },
        { type: 'Buffing', label: 'Buffing', icon: Wind, woStage: 'buffing' },
        { type: 'Blasting', label: 'Blasting', icon: Hammer, woStage: 'blasting' },
        { type: 'Forging', label: 'Forging (Ext)', icon: Flame, woStage: 'forging' }
      ];

      externalStages.forEach(({ type, label, icon, woStage }) => {
        // Get work orders with current_stage matching this process
        const stageWOs = workOrders.filter(wo => 
          wo.current_stage?.toLowerCase() === woStage.toLowerCase() ||
          wo.external_process_type?.toLowerCase() === type.toLowerCase()
        );
        
        // Filter external moves by process type and active status
        const typeMoves = moves.filter(m => 
          m.process?.toLowerCase() === type.toLowerCase() &&
          ['sent', 'in_transit', 'partial'].includes(m.status)
        );
        
        // Calculate WIP from external moves
        const totalSentPcs = typeMoves.reduce((sum, m) => sum + (m.quantity_sent || 0), 0);
        const totalReturnedPcs = typeMoves.reduce((sum, m) => sum + (m.quantity_returned || 0), 0);
        const wipPcsFromMoves = totalSentPcs - totalReturnedPcs;
        
        // Calculate WIP from work orders
        const wipPcsFromWOs = stageWOs.reduce((sum, wo) => sum + (wo.qty_external_wip || 0), 0);
        
        // Total WIP (combine both sources)
        const totalWipPcs = wipPcsFromMoves + wipPcsFromWOs;
        
        // Calculate weight from external moves
        const moveKg = typeMoves.reduce((sum, m) => {
          const woData = m.work_orders;
          const qtyInTransit = (m.quantity_sent || 0) - (m.quantity_returned || 0);
          const weightPerPc = woData?.gross_weight_per_pc || 0;
          return sum + (qtyInTransit * weightPerPc / 1000);
        }, 0);
        
        // Calculate weight from work orders
        const woKg = stageWOs.reduce((sum, wo) => {
          return sum + ((wo.qty_external_wip || 0) * (wo.gross_weight_per_pc || 0) / 1000);
        }, 0);
        
        const totalKg = moveKg + woKg;
        
        // Calculate average wait time
        const totalWaitHours = typeMoves.reduce((sum, m) => {
          const dispatchDate = m.dispatch_date || m.created_at;
          const waitTime = (Date.now() - new Date(dispatchDate).getTime()) / (1000 * 60 * 60);
          return sum + waitTime;
        }, 0);
        const avgWait = typeMoves.length > 0 ? totalWaitHours / typeMoves.length : 0;

        // Count overdue moves
        const overdueCount = typeMoves.filter(m => 
          m.expected_return_date && new Date(m.expected_return_date) < new Date(today)
        ).length;

        // Get expected return dates
        const expectedReturns = typeMoves
          .filter(m => m.expected_return_date)
          .map(m => m.expected_return_date)
          .sort()
          .slice(0, 3);

        // Total active jobs (unique count of work orders + external moves)
        const totalActiveJobs = stageWOs.length + typeMoves.length;

        stagesData.push({
          stage: label,
          icon,
          count: totalActiveJobs,
          totalPcs: totalWipPcs,
          totalKg: totalKg,
          avgWaitHours: avgWait,
          status: getStatus(avgWait),
          onClick: () => navigate(`/work-orders?stage=${woStage}`),
          isExternal: true,
          breakdown: {
            activeJobs: totalActiveJobs,
            pendingReturns: typeMoves.filter(m => m.status === 'sent').length,
            overdueCount,
            expectedReturns
          }
        });
      });

      setStages(stagesData);
      setLoading(false);
    } catch (error) {
      console.error('Error loading kanban data:', error);
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'bottleneck': return 'border-red-500 bg-red-50 dark:bg-red-950/30';
      case 'warning': return 'border-yellow-500 bg-yellow-50 dark:bg-yellow-950/30';
      default: return 'border-green-500 bg-green-50 dark:bg-green-950/30';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'bottleneck':
        return (
          <Badge variant="destructive" className="gap-1">
            <AlertTriangle className="h-3 w-3" />
            Bottleneck
          </Badge>
        );
      case 'warning':
        return (
          <Badge className="bg-yellow-500 text-white gap-1">
            <Clock className="h-3 w-3" />
            Warning
          </Badge>
        );
      default:
        return (
          <Badge className="bg-green-500 text-white">
            Normal
          </Badge>
        );
    }
  };

  if (loading) {
    return (
      <div className="mb-6">
        <h2 className="text-xl font-bold mb-4">Live Floor Status - Kanban View</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 lg:grid-cols-10 gap-4">
          {[...Array(10)].map((_, i) => (
            <div key={i} className="h-48 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  const internalStages = stages.filter(s => !s.isExternal);
  const externalStages = stages.filter(s => s.isExternal);

  return (
    <TooltipProvider>
      <div className="mb-6 space-y-6">
        <div>
          <h2 className="text-xl font-bold mb-4">Live Floor Status - Kanban View</h2>
          
          {/* Internal Stages */}
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-1 w-6 bg-gradient-to-r from-gray-400 to-gray-600 rounded" />
              <h3 className="text-sm font-semibold text-muted-foreground">Internal Flow</h3>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {internalStages.map((stage, idx) => {
                const StageIcon = stage.icon;
                return (
                  <div key={idx} className="relative">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Card 
                          className={cn(
                            "cursor-pointer hover:shadow-xl transition-all duration-300 border-l-4",
                            getStatusColor(stage.status)
                          )}
                          onClick={stage.onClick}
                        >
                          <CardHeader className="pb-3">
                            <div className="flex items-center justify-between">
                              <StageIcon className="h-5 w-5 text-primary" />
                              {getStatusBadge(stage.status)}
                            </div>
                            <CardTitle className="text-sm font-medium text-muted-foreground">
                              {stage.stage}
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-3">
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-xs text-muted-foreground">
                                <span>Active Jobs</span>
                                <span className="font-bold text-primary text-lg">
                                  <AnimatedNumber value={stage.count} />
                                </span>
                              </div>
                              {stage.totalPcs > 0 && (
                                <div className="flex items-center justify-between text-xs text-muted-foreground">
                                  <span>Pcs</span>
                                  <span className="font-semibold">
                                    <AnimatedNumber value={stage.totalPcs} />
                                  </span>
                                </div>
                              )}
                              {stage.totalKg > 0 && (
                                <div className="flex items-center justify-between text-xs text-muted-foreground">
                                  <span>Kg</span>
                                  <span className="font-semibold">{stage.totalKg.toFixed(1)}</span>
                                </div>
                              )}
                            </div>
                            {stage.count > 0 && (
                              <div className="space-y-1">
                                <Progress 
                                  value={(stage.breakdown?.activeJobs || 0) * 10} 
                                  className="h-1"
                                />
                                <p className="text-xs text-muted-foreground text-center">
                                  {stage.avgWaitHours.toFixed(1)}h avg wait
                                </p>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="w-64">
                        <div className="space-y-2">
                          <h4 className="font-semibold">{stage.stage} Details</h4>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div>
                              <p className="text-muted-foreground">Active Jobs:</p>
                              <p className="font-medium">{stage.breakdown?.activeJobs || 0}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Overdue:</p>
                              <p className="font-medium text-red-500">
                                {stage.breakdown?.overdueCount || 0}
                              </p>
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground mt-2">
                            Click to view {stage.stage.toLowerCase()} details
                          </p>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                    {idx < internalStages.length - 1 && (
                      <div className="hidden md:flex absolute right-0 top-1/2 transform translate-x-1/2 -translate-y-1/2 z-10">
                        <ArrowRight className="h-6 w-6 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* External Stages */}
          {externalStages.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="h-1 w-6 bg-gradient-to-r from-amber-400 to-amber-600 rounded" />
                <h3 className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                  External Processing
                </h3>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                {externalStages.map((stage, idx) => {
                  const StageIcon = stage.icon;
                  return (
                    <Tooltip key={idx}>
                      <TooltipTrigger asChild>
                        <Card 
                          className={cn(
                            "cursor-pointer hover:shadow-xl transition-all duration-300 border-l-4",
                            getStatusColor(stage.status)
                          )}
                          onClick={stage.onClick}
                        >
                          <CardHeader className="pb-3">
                            <div className="flex items-center justify-between">
                              <StageIcon className="h-5 w-5 text-amber-600" />
                              {getStatusBadge(stage.status)}
                            </div>
                            <CardTitle className="text-sm font-medium text-muted-foreground">
                              {stage.stage}
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-3">
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-xs text-muted-foreground">
                                <span>Active Jobs</span>
                                <span className="font-bold text-amber-600 text-lg">
                                  <AnimatedNumber value={stage.count} />
                                </span>
                              </div>
                              {stage.totalPcs > 0 && (
                                <div className="flex items-center justify-between text-xs text-muted-foreground">
                                  <span>Pcs</span>
                                  <span className="font-semibold">
                                    <AnimatedNumber value={stage.totalPcs} />
                                  </span>
                                </div>
                              )}
                              {stage.totalKg > 0 && (
                                <div className="flex items-center justify-between text-xs text-muted-foreground">
                                  <span>Kg</span>
                                  <span className="font-semibold">{stage.totalKg.toFixed(1)}</span>
                                </div>
                              )}
                            </div>
                            {stage.count > 0 && (
                              <div className="space-y-1">
                                <Progress 
                                  value={(stage.breakdown?.pendingReturns || 0) * 10} 
                                  className="h-1"
                                />
                                <p className="text-xs text-muted-foreground text-center">
                                  {stage.avgWaitHours.toFixed(1)}h avg wait
                                </p>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="w-64">
                        <div className="space-y-2">
                          <h4 className="font-semibold">{stage.stage} Details</h4>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div>
                              <p className="text-muted-foreground">Active Jobs:</p>
                              <p className="font-medium">{stage.breakdown?.activeJobs || 0}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Pending Returns:</p>
                              <p className="font-medium text-amber-600">
                                {stage.breakdown?.pendingReturns || 0}
                              </p>
                            </div>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-sm">Overdue:</p>
                            <p className="font-medium text-red-500">
                              {stage.breakdown?.overdueCount || 0} moves
                            </p>
                          </div>
                          {stage.breakdown?.expectedReturns && stage.breakdown.expectedReturns.length > 0 && (
                            <div className="mt-2">
                              <p className="text-xs text-muted-foreground">Expected Returns:</p>
                              <div className="space-y-1 mt-1">
                                {stage.breakdown.expectedReturns.map((date, i) => (
                                  <p key={i} className="text-xs font-medium">
                                    {new Date(date).toLocaleDateString()}
                                  </p>
                                ))}
                              </div>
                            </div>
                          )}
                          <p className="text-xs text-muted-foreground mt-2">
                            Click to view external processing details
                          </p>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
};
