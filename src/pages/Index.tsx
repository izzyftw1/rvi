import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Factory, ArrowDownUp, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ControlTowerHeader } from "@/components/dashboard/ControlTowerHeader";
import { InternalFlowPanel } from "@/components/dashboard/InternalFlowPanel";
import { ExternalFlowPanel } from "@/components/dashboard/ExternalFlowPanel";
import { QuickActionCards } from "@/components/dashboard/QuickActionCards";
import { ExecutiveRiskBar } from "@/components/dashboard/ExecutiveRiskBar";
import { ExternalProcessingDetailDrawer } from "@/components/dashboard/ExternalProcessingDetailDrawer";

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

interface ExternalProcessData {
  pcs: number;
  kg: number;
  activeMoves: number;
  overdue: number;
}

const Index = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [internalFlow, setInternalFlow] = useState<InternalFlowStage[]>([]);
  const [externalData, setExternalData] = useState<Record<string, ExternalProcessData>>({
    job_work: { pcs: 0, kg: 0, activeMoves: 0, overdue: 0 },
    plating: { pcs: 0, kg: 0, activeMoves: 0, overdue: 0 },
    buffing: { pcs: 0, kg: 0, activeMoves: 0, overdue: 0 },
    blasting: { pcs: 0, kg: 0, activeMoves: 0, overdue: 0 },
    forging_ext: { pcs: 0, kg: 0, activeMoves: 0, overdue: 0 }
  });
  const [selectedProcess, setSelectedProcess] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("internal");

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

    const channel = supabase
      .channel('control-tower-realtime')
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

      // Load external processing data
      const { data: extSummary, error: extError } = await supabase
        .from('external_processing_summary_vw')
        .select('*');

      if (!extError && extSummary) {
        const extData: Record<string, ExternalProcessData> = {
          job_work: { pcs: 0, kg: 0, activeMoves: 0, overdue: 0 },
          plating: { pcs: 0, kg: 0, activeMoves: 0, overdue: 0 },
          buffing: { pcs: 0, kg: 0, activeMoves: 0, overdue: 0 },
          blasting: { pcs: 0, kg: 0, activeMoves: 0, overdue: 0 },
          forging_ext: { pcs: 0, kg: 0, activeMoves: 0, overdue: 0 }
        };

        extSummary.forEach((row: any) => {
          const processKey = row.process_name as string;
          if (extData[processKey]) {
            extData[processKey] = {
              pcs: Math.round(row.pcs_total || 0),
              kg: parseFloat((row.kg_total || 0).toFixed(1)),
              activeMoves: row.active_moves || 0,
              overdue: row.overdue || 0
            };
          }
        });

        setExternalData(extData);
      }
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    }
  };

  const handleProcessClick = (process: string) => {
    setSelectedProcess(process);
    setDrawerOpen(true);
  };

  const getProcessLabel = (key: string) => {
    const labels: Record<string, string> = {
      job_work: 'Job Work',
      plating: 'Plating',
      buffing: 'Buffing',
      blasting: 'Blasting',
      forging_ext: 'Forging'
    };
    return labels[key] || key;
  };

  // Calculate alert counts
  const criticalCount = (summary?.maintenance_overdue || 0) + (summary?.work_orders_delayed || 0) + (summary?.late_deliveries || 0);
  const warningCount = (summary?.material_waiting_qc || 0) + (summary?.qc_pending_approval || 0);
  const allClear = criticalCount === 0 && warningCount === 0;

  // Calculate external overdue total
  const externalOverdueTotal = Object.values(externalData).reduce((sum, p) => sum + (p.overdue || 0), 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Factory className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading Control Tower...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Executive Risk Bar - Global, always visible */}
      <ExecutiveRiskBar />
      
      <main className="container mx-auto px-4 py-6 space-y-6">
        <ControlTowerHeader 
          criticalCount={criticalCount} 
          warningCount={warningCount} 
          allClear={allClear} 
        />

        {/* Quick Action Cards - Always visible for rapid decision making */}
        <QuickActionCards 
          metrics={{
            materialWaitingQC: summary?.material_waiting_qc || 0,
            maintenanceOverdue: summary?.maintenance_overdue || 0,
            workOrdersDelayed: summary?.work_orders_delayed || 0,
            qcPendingApproval: summary?.qc_pending_approval || 0,
            lateDeliveries: summary?.late_deliveries || 0,
            dueToday: summary?.due_today || 0,
            ordersInProduction: summary?.orders_in_production || 0,
            externalWipPcs: summary?.external_wip_pcs || 0
          }}
        />

        {/* Operating Mode Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 h-12">
            <TabsTrigger 
              value="internal" 
              className="text-sm font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              <Factory className="h-4 w-4 mr-2" />
              Internal Flow
              {internalFlow.reduce((sum, s) => sum + s.active_jobs, 0) > 0 && (
                <span className="ml-2 bg-primary-foreground/20 px-1.5 py-0.5 rounded text-[10px]">
                  {internalFlow.reduce((sum, s) => sum + s.active_jobs, 0)}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger 
              value="external"
              className="text-sm font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              <ArrowDownUp className="h-4 w-4 mr-2" />
              External Processing
              {externalOverdueTotal > 0 && (
                <span className="ml-2 bg-destructive px-1.5 py-0.5 rounded text-[10px] text-destructive-foreground">
                  {externalOverdueTotal} overdue
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="internal" className="mt-6">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Factory className="h-5 w-5 text-primary" />
                    Production Pipeline
                  </CardTitle>
                  <button
                    onClick={() => navigate('/production-progress')}
                    className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                  >
                    Full View <ExternalLink className="h-3 w-3" />
                  </button>
                </div>
              </CardHeader>
              <CardContent>
                <InternalFlowPanel stages={internalFlow} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="external" className="mt-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <ArrowDownUp className="h-5 w-5 text-primary" />
                  External Processing Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ExternalFlowPanel 
                  data={externalData} 
                  onProcessClick={handleProcessClick} 
                />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Key Status Summary - Bottom strip */}
        <div className="grid grid-cols-3 gap-4 pt-4 border-t border-border/50">
          <div 
            className="text-center cursor-pointer hover:opacity-80 transition-opacity"
            onClick={() => navigate('/work-orders?status=pending')}
          >
            <div className="text-3xl font-bold text-foreground">{summary?.orders_in_pipeline || 0}</div>
            <p className="text-xs text-muted-foreground">Orders in Pipeline</p>
          </div>
          <div 
            className="text-center cursor-pointer hover:opacity-80 transition-opacity"
            onClick={() => navigate('/production-progress')}
          >
            <div className="text-3xl font-bold text-primary">{summary?.orders_in_production || 0}</div>
            <p className="text-xs text-muted-foreground">In Production</p>
          </div>
          <div 
            className="text-center cursor-pointer hover:opacity-80 transition-opacity"
            onClick={() => navigate('/partners')}
          >
            <div className="text-3xl font-bold text-foreground">{(summary?.external_wip_pcs || 0).toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">External WIP pcs</p>
          </div>
        </div>
      </main>

      {/* External Processing Detail Drawer */}
      <ExternalProcessingDetailDrawer
        processType={selectedProcess}
        processLabel={getProcessLabel(selectedProcess || '')}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
    </div>
  );
};

export default Index;
