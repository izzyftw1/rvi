import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { 
  Factory, 
  Package, 
  Truck, 
  CheckCircle2,
  AlertTriangle,
  ClipboardCheck,
  Wrench,
  Clock
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CriticalAlertsBar } from "@/components/dashboard/CriticalAlertsBar";
import { ExternalDashboard } from "@/components/dashboard/ExternalDashboard";
import { cn } from "@/lib/utils";

interface DashboardSummary {
  material_waiting_qc: number;
  maintenance_overdue: number;
  work_orders_delayed: number;
  qc_pending_approval: number;
  orders_in_pipeline: number;
  orders_in_production: number;
  external_wip_pcs: number;
  late_deliveries: number;
  due_today: number;
  on_time_rate_7d: number;
}

interface InternalFlowStage {
  stage_name: string;
  active_jobs: number;
  pcs_remaining: number;
  kg_remaining: number;
  avg_wait_hours: number;
}

const STAGE_LABELS: Record<string, string> = {
  goods_in: 'Goods In',
  cutting: 'Cutting',
  forging: 'Forging',
  production: 'Production',
  quality: 'Quality',
  packing: 'Packing',
  dispatch: 'Dispatch'
};

const STAGE_ICONS: Record<string, any> = {
  goods_in: Package,
  cutting: Factory,
  forging: Factory,
  production: Factory,
  quality: ClipboardCheck,
  packing: Package,
  dispatch: Truck
};

const Index = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [internalFlow, setInternalFlow] = useState<InternalFlowStage[]>([]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setUser(session.user);
        loadDashboardData();
      } else {
        navigate("/auth");
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setUser(session.user);
        loadDashboardData();
      } else {
        navigate("/auth");
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [navigate]);

  useEffect(() => {
    if (!user) return;

    // Real-time subscriptions
    const channel = supabase
      .channel('dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_orders' }, () => loadDashboardData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wo_external_moves' }, () => loadDashboardData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'material_lots' }, () => loadDashboardData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hourly_qc_checks' }, () => loadDashboardData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'maintenance_logs' }, () => loadDashboardData())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const loadDashboardData = async () => {
    try {
      // Load summary data
      const { data: summaryData, error: summaryError } = await supabase
        .from('dashboard_summary_vw')
        .select('*')
        .single();

      if (!summaryError && summaryData) {
        setSummary(summaryData);
      }

      // Load internal flow data
      const { data: flowData, error: flowError } = await supabase
        .from('internal_flow_summary_vw')
        .select('*');

      if (!flowError && flowData) {
        setInternalFlow(flowData);
      }
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    }
  };

  const handleHeaderCardClick = (route: string, query?: string) => {
    navigate(query ? `${route}?${query}` : route);
  };

  const handleStageClick = (stageName: string) => {
    navigate(`/production-progress?stage=${stageName}`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Factory className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  const getStageBadgeColor = (activeJobs: number) => {
    if (activeJobs === 0) return 'bg-muted/50 text-muted-foreground border-transparent';
    if (activeJobs <= 5) return 'bg-primary/10 text-primary border-primary/20';
    if (activeJobs <= 10) return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20';
    return 'bg-destructive/10 text-destructive border-destructive/20';
  };

  // Helper to determine if a metric is "inactive" (zero or no concern)
  const isInactive = (value: number | undefined) => !value || value === 0;
  
  // Helper to get metric styling based on value
  const getMetricStyle = (value: number | undefined, isCritical = false) => {
    if (isInactive(value)) {
      return {
        textColor: 'text-muted-foreground',
        iconColor: 'text-muted-foreground/50',
        cardClass: 'opacity-60'
      };
    }
    if (isCritical && value && value > 0) {
      return {
        textColor: 'text-destructive',
        iconColor: 'text-destructive',
        cardClass: 'border-destructive/30 bg-destructive/5'
      };
    }
    return {
      textColor: 'text-foreground',
      iconColor: 'text-muted-foreground',
      cardClass: ''
    };
  };

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto px-4 py-6 space-y-8">
        {/* Critical Alerts Bar */}
        <CriticalAlertsBar />

        {/* SECTION 1: Risk / Alerts - Actionable items needing attention */}
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Risk & Alerts</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <TooltipProvider>
              {(() => {
                const style = getMetricStyle(summary?.material_waiting_qc);
                return (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Card 
                        className={cn("cursor-pointer hover:shadow-md transition-all", style.cardClass)}
                        onClick={() => handleHeaderCardClick('/qc/incoming')}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-xs text-muted-foreground">Material Waiting QC</p>
                              <p className={cn("text-2xl font-bold", style.textColor)}>{summary?.material_waiting_qc || 0}</p>
                            </div>
                            <Package className={cn("h-6 w-6", style.iconColor)} />
                          </div>
                        </CardContent>
                      </Card>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Material lots pending QC approval</p>
                    </TooltipContent>
                  </Tooltip>
                );
              })()}

              {(() => {
                const style = getMetricStyle(summary?.maintenance_overdue, true);
                return (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Card 
                        className={cn("cursor-pointer hover:shadow-md transition-all", style.cardClass)}
                        onClick={() => handleHeaderCardClick('/machine-status')}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-xs text-muted-foreground">Maintenance Overdue</p>
                              <p className={cn("text-2xl font-bold", style.textColor)}>{summary?.maintenance_overdue || 0}</p>
                            </div>
                            <Wrench className={cn("h-6 w-6", style.iconColor)} />
                          </div>
                        </CardContent>
                      </Card>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Active maintenance tasks not yet completed</p>
                    </TooltipContent>
                  </Tooltip>
                );
              })()}

              {(() => {
                const style = getMetricStyle(summary?.work_orders_delayed, true);
                return (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Card 
                        className={cn("cursor-pointer hover:shadow-md transition-all", style.cardClass)}
                        onClick={() => handleHeaderCardClick('/work-orders', 'status=delayed')}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-xs text-muted-foreground">Work Orders Delayed</p>
                              <p className={cn("text-2xl font-bold", style.textColor)}>{summary?.work_orders_delayed || 0}</p>
                            </div>
                            <AlertTriangle className={cn("h-6 w-6", style.iconColor)} />
                          </div>
                        </CardContent>
                      </Card>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Work orders past their due date</p>
                    </TooltipContent>
                  </Tooltip>
                );
              })()}

              {(() => {
                const style = getMetricStyle(summary?.qc_pending_approval);
                return (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Card 
                        className={cn("cursor-pointer hover:shadow-md transition-all", style.cardClass)}
                        onClick={() => handleHeaderCardClick('/quality', 'status=pending')}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-xs text-muted-foreground">QC Pending Approval</p>
                              <p className={cn("text-2xl font-bold", style.textColor)}>{summary?.qc_pending_approval || 0}</p>
                            </div>
                            <ClipboardCheck className={cn("h-6 w-6", style.iconColor)} />
                          </div>
                        </CardContent>
                      </Card>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>QC checks awaiting approval</p>
                    </TooltipContent>
                  </Tooltip>
                );
              })()}
            </TooltipProvider>
          </div>
        </section>

        {/* SECTION 2: Status - Current operational state */}
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Current Status</h2>
          <div className="grid grid-cols-3 md:grid-cols-3 gap-4">
            {(() => {
              const style = getMetricStyle(summary?.orders_in_pipeline);
              return (
                <Card className={cn("cursor-pointer hover:shadow-md transition-all", style.cardClass)} onClick={() => handleHeaderCardClick('/work-orders', 'status=pending')}>
                  <CardContent className="p-4 text-center">
                    <div className={cn("text-3xl font-bold", style.textColor)}>{summary?.orders_in_pipeline || 0}</div>
                    <p className="text-xs text-muted-foreground mt-1">Orders in Pipeline</p>
                  </CardContent>
                </Card>
              );
            })()}

            {(() => {
              const value = summary?.orders_in_production;
              const style = getMetricStyle(value);
              return (
                <Card className={cn("cursor-pointer hover:shadow-md transition-all", style.cardClass)} onClick={() => handleHeaderCardClick('/production-progress')}>
                  <CardContent className="p-4 text-center">
                    <div className={cn("text-3xl font-bold", value && value > 0 ? "text-primary" : style.textColor)}>{value || 0}</div>
                    <p className="text-xs text-muted-foreground mt-1">Orders in Production</p>
                  </CardContent>
                </Card>
              );
            })()}

            {(() => {
              const style = getMetricStyle(summary?.external_wip_pcs);
              return (
                <Card className={cn("cursor-pointer hover:shadow-md transition-all", style.cardClass)} onClick={() => handleHeaderCardClick('/partners')}>
                  <CardContent className="p-4 text-center">
                    <div className={cn("text-3xl font-bold", style.textColor)}>{summary?.external_wip_pcs || 0}</div>
                    <p className="text-xs text-muted-foreground mt-1">External WIP pcs</p>
                  </CardContent>
                </Card>
              );
            })()}
          </div>
        </section>

        {/* SECTION 3: Throughput - Delivery performance */}
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Throughput & Delivery</h2>
          <div className="grid grid-cols-3 md:grid-cols-3 gap-4">
            {(() => {
              const style = getMetricStyle(summary?.late_deliveries, true);
              return (
                <Card className={cn("cursor-pointer hover:shadow-md transition-all", style.cardClass)} onClick={() => handleHeaderCardClick('/logistics')}>
                  <CardContent className="p-4 text-center">
                    <div className={cn("text-3xl font-bold", style.textColor)}>{summary?.late_deliveries || 0}</div>
                    <p className="text-xs text-muted-foreground mt-1">Late Deliveries</p>
                  </CardContent>
                </Card>
              );
            })()}

            {(() => {
              const value = summary?.due_today;
              const style = getMetricStyle(value);
              return (
                <Card className={cn("cursor-pointer hover:shadow-md transition-all", style.cardClass)} onClick={() => handleHeaderCardClick('/work-orders', 'due=today')}>
                  <CardContent className="p-4 text-center">
                    <div className={cn("text-3xl font-bold", value && value > 0 ? "text-amber-600 dark:text-amber-400" : style.textColor)}>{value || 0}</div>
                    <p className="text-xs text-muted-foreground mt-1">Due Today</p>
                  </CardContent>
                </Card>
              );
            })()}

            {(() => {
              const rate = summary?.on_time_rate_7d || 100;
              const isGood = rate >= 90;
              return (
                <Card className="cursor-pointer hover:shadow-md transition-all" onClick={() => handleHeaderCardClick('/reports')}>
                  <CardContent className="p-4 text-center">
                    <div className={cn("text-3xl font-bold", isGood ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400")}>{rate}%</div>
                    <p className="text-xs text-muted-foreground mt-1">On-Time Rate 7d</p>
                  </CardContent>
                </Card>
              );
            })()}
          </div>
        </section>

        {/* Tabbed View */}
        <Tabs defaultValue="internal" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="internal">Internal Flow</TabsTrigger>
            <TabsTrigger value="external">External Processing</TabsTrigger>
          </TabsList>
          
          <TabsContent value="internal" className="space-y-6 mt-6">
            {/* Internal Flow Kanban */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
              {internalFlow.map((stage) => {
                const Icon = STAGE_ICONS[stage.stage_name];
                return (
                  <Card 
                    key={stage.stage_name}
                    className="cursor-pointer hover:shadow-lg transition-all hover:scale-105"
                    onClick={() => handleStageClick(stage.stage_name)}
                  >
                    <CardContent className="p-4">
                      <div className="flex flex-col items-center space-y-3">
                        <Icon className="h-8 w-8 text-primary" />
                        <h3 className="font-semibold text-center text-sm">{STAGE_LABELS[stage.stage_name]}</h3>
                        <Badge variant="outline" className={cn("font-mono text-lg px-3 py-1", getStageBadgeColor(stage.active_jobs))}>
                          {stage.active_jobs}
                        </Badge>
                        <div className="text-center space-y-1">
                          <p className="text-xs text-muted-foreground">
                            {Math.round(stage.pcs_remaining || 0)} pcs
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {(stage.kg_remaining || 0).toFixed(1)} kg
                          </p>
                          {stage.avg_wait_hours > 0 && (
                            <p className="text-xs text-orange-600 font-medium">
                              ~{Math.round(stage.avg_wait_hours)}h wait
                            </p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="external" className="mt-6">
            <ExternalDashboard />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Index;
