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
    if (activeJobs === 0) return 'bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300 border-green-200';
    if (activeJobs <= 5) return 'bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 border-blue-200';
    if (activeJobs <= 10) return 'bg-yellow-50 dark:bg-yellow-950/30 text-yellow-700 dark:text-yellow-300 border-yellow-200';
    return 'bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 border-red-200';
  };

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Critical Alerts Bar */}
        <CriticalAlertsBar />

        {/* Header Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Card 
                  className="cursor-pointer hover:shadow-md transition-all hover:scale-105"
                  onClick={() => handleHeaderCardClick('/qc-incoming', 'status=pending')}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Material Waiting QC</p>
                        <p className="text-2xl font-bold">{summary?.material_waiting_qc || 0}</p>
                      </div>
                      <Package className="h-8 w-8 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>
              </TooltipTrigger>
              <TooltipContent>
                <p>Material lots pending QC approval</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Card 
                  className="cursor-pointer hover:shadow-md transition-all hover:scale-105"
                  onClick={() => handleHeaderCardClick('/maintenance', 'status=overdue')}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Maintenance Overdue</p>
                        <p className="text-2xl font-bold">{summary?.maintenance_overdue || 0}</p>
                      </div>
                      <Wrench className="h-8 w-8 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>
              </TooltipTrigger>
              <TooltipContent>
                <p>Active maintenance tasks not yet completed</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Card 
                  className="cursor-pointer hover:shadow-md transition-all hover:scale-105"
                  onClick={() => handleHeaderCardClick('/work-orders', 'status=delayed')}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Work Orders Delayed</p>
                        <p className="text-2xl font-bold">{summary?.work_orders_delayed || 0}</p>
                      </div>
                      <Clock className="h-8 w-8 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>
              </TooltipTrigger>
              <TooltipContent>
                <p>Work orders past their due date</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Card 
                  className="cursor-pointer hover:shadow-md transition-all hover:scale-105"
                  onClick={() => handleHeaderCardClick('/quality', 'status=pending')}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">QC Pending Approval</p>
                        <p className="text-2xl font-bold">{summary?.qc_pending_approval || 0}</p>
                      </div>
                      <ClipboardCheck className="h-8 w-8 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>
              </TooltipTrigger>
              <TooltipContent>
                <p>QC checks awaiting approval</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* Mid Summary - Status Cards */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          <Card className="cursor-pointer hover:shadow-md transition-all" onClick={() => handleHeaderCardClick('/work-orders', 'status=pending')}>
            <CardContent className="p-4 text-center">
              <div className="text-3xl font-bold text-green-600">{summary?.orders_in_pipeline || 0}</div>
              <p className="text-sm text-muted-foreground mt-1">Orders in Pipeline</p>
            </CardContent>
          </Card>

          <Card className="cursor-pointer hover:shadow-md transition-all" onClick={() => handleHeaderCardClick('/production-progress')}>
            <CardContent className="p-4 text-center">
              <div className="text-3xl font-bold text-blue-600">{summary?.orders_in_production || 0}</div>
              <p className="text-sm text-muted-foreground mt-1">Orders in Production</p>
            </CardContent>
          </Card>

          <Card className="cursor-pointer hover:shadow-md transition-all" onClick={() => handleHeaderCardClick('/logistics')}>
            <CardContent className="p-4 text-center">
              <div className="text-3xl font-bold text-purple-600">{summary?.external_wip_pcs || 0}</div>
              <p className="text-sm text-muted-foreground mt-1">External WIP pcs</p>
            </CardContent>
          </Card>

          <Card className="cursor-pointer hover:shadow-md transition-all" onClick={() => handleHeaderCardClick('/dispatch', 'status=late')}>
            <CardContent className="p-4 text-center">
              <div className="text-3xl font-bold text-red-600">{summary?.late_deliveries || 0}</div>
              <p className="text-sm text-muted-foreground mt-1">Late Deliveries</p>
            </CardContent>
          </Card>

          <Card className="cursor-pointer hover:shadow-md transition-all" onClick={() => handleHeaderCardClick('/work-orders', 'due=today')}>
            <CardContent className="p-4 text-center">
              <div className="text-3xl font-bold text-orange-600">{summary?.due_today || 0}</div>
              <p className="text-sm text-muted-foreground mt-1">Due Today</p>
            </CardContent>
          </Card>

          <Card className="cursor-pointer hover:shadow-md transition-all" onClick={() => handleHeaderCardClick('/reports')}>
            <CardContent className="p-4 text-center">
              <div className="text-3xl font-bold text-teal-600">{summary?.on_time_rate_7d || 100}%</div>
              <p className="text-sm text-muted-foreground mt-1">On-Time Rate 7d</p>
            </CardContent>
          </Card>
        </div>

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
