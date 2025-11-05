import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Package, 
  Factory, 
  ClipboardCheck, 
  Box, 
  Truck, 
  ArrowRight,
  Users,
  Sparkles,
  Wind,
  Hammer,
  Flame,
  AlertTriangle,
  Clock
} from "lucide-react";
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

    // Set up real-time subscriptions
    const channel = supabase
      .channel('kanban-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_orders' }, loadStageData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wo_external_moves' }, loadStageData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wo_external_receipts' }, loadStageData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'production_logs' }, loadStageData)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadStageData = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];

      // Fetch work orders
      const { data: wos } = await supabase
        .from('work_orders')
        .select('*');

      // Fetch external moves and receipts
      const { data: moves } = await supabase
        .from('wo_external_moves' as any)
        .select('*');

      const { data: receipts } = await supabase
        .from('wo_external_receipts' as any)
        .select('*');

      const workOrders = wos || [];
      const externalMoves: any[] = moves || [];
      const externalReceipts: any[] = receipts || [];

      const stagesData: StageData[] = [];

      // Helper function to calculate status
      const getStatus = (avgWait: number): 'normal' | 'warning' | 'bottleneck' => {
        if (avgWait > 48) return 'bottleneck';
        if (avgWait > 24) return 'warning';
        return 'normal';
      };

      // Internal Stages
      const internalStages = [
        { key: 'goods_in', label: 'Goods In', icon: Package, route: '/material-inwards' },
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

      // External Stages
      const externalStages = [
        { type: 'job_work', label: 'Job Work', icon: Users },
        { type: 'plating', label: 'Plating', icon: Sparkles },
        { type: 'buffing', label: 'Buffing', icon: Wind },
        { type: 'blasting', label: 'Blasting', icon: Hammer },
        { type: 'forging_ext', label: 'Forging (Ext)', icon: Flame }
      ];

      externalStages.forEach(({ type, label, icon }) => {
        const typeMoves = externalMoves.filter(m => m.process_type === type);
        const activeMoves = typeMoves.filter(m => m.status !== 'returned');
        
        const totalSent = typeMoves.reduce((sum, m) => sum + (m.qty_sent || 0), 0);
        const totalReceived = externalReceipts
          .filter(r => typeMoves.some(m => m.id === r.move_id))
          .reduce((sum, r) => sum + (r.qty_received || 0), 0);
        
        const totalWaitHours = activeMoves.reduce((sum, m) => {
          const waitTime = (Date.now() - new Date(m.dispatch_date || m.created_at).getTime()) / (1000 * 60 * 60);
          return sum + waitTime;
        }, 0);
        const avgWait = activeMoves.length > 0 ? totalWaitHours / activeMoves.length : 0;

        const overdueCount = activeMoves.filter(m => 
          m.expected_return_date && m.expected_return_date < today
        ).length;

        const expectedReturns = activeMoves
          .filter(m => m.expected_return_date)
          .map(m => m.expected_return_date)
          .sort()
          .slice(0, 3);

        stagesData.push({
          stage: label,
          icon,
          count: activeMoves.length,
          totalPcs: totalSent - totalReceived,
          totalKg: 0,
          avgWaitHours: avgWait,
          status: getStatus(avgWait),
          onClick: () => navigate('/logistics'),
          isExternal: true,
          breakdown: {
            activeJobs: activeMoves.length,
            pendingReturns: activeMoves.filter(m => m.status === 'sent').length,
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
                          <CardContent className="space-y-2">
                            <div className="text-center">
                              <p className="text-4xl font-bold text-primary">
                                <AnimatedNumber value={stage.count} />
                              </p>
                              <p className="text-xs text-muted-foreground">Work Orders</p>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-center pt-2 border-t">
                              <div>
                                <p className="text-lg font-semibold">
                                  <AnimatedNumber value={stage.totalPcs} />
                                </p>
                                <p className="text-xs text-muted-foreground">Pcs</p>
                              </div>
                              <div>
                                <p className="text-lg font-semibold">{stage.totalKg.toFixed(1)}</p>
                                <p className="text-xs text-muted-foreground">Kg</p>
                              </div>
                            </div>
                            <div className="text-center pt-2 border-t">
                              <p className="text-sm font-medium">{stage.avgWaitHours.toFixed(1)}h</p>
                              <p className="text-xs text-muted-foreground">Avg Wait</p>
                            </div>
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
                          <CardContent className="space-y-2">
                            <div className="text-center">
                              <p className="text-4xl font-bold text-amber-600">
                                <AnimatedNumber value={stage.count} />
                              </p>
                              <p className="text-xs text-muted-foreground">Active Moves</p>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-center pt-2 border-t">
                              <div>
                                <p className="text-lg font-semibold">
                                  <AnimatedNumber value={stage.totalPcs} />
                                </p>
                                <p className="text-xs text-muted-foreground">WIP Pcs</p>
                              </div>
                              <div>
                                <p className="text-lg font-semibold">
                                  {stage.breakdown?.pendingReturns || 0}
                                </p>
                                <p className="text-xs text-muted-foreground">Pending</p>
                              </div>
                            </div>
                            <div className="text-center pt-2 border-t">
                              <p className="text-sm font-medium">{stage.avgWaitHours.toFixed(1)}h</p>
                              <p className="text-xs text-muted-foreground">Avg Wait</p>
                            </div>
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
