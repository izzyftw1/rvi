/**
 * Homepage Control Tower - Decision-First Dashboard
 * 
 * Design Principles:
 * 1. DECISION-FIRST: Prioritize actionable blockers over status metrics
 * 2. URGENCY: Critical items at top, sorted by days blocked and impact
 * 3. OWNERSHIP: Each blocked item shows responsible department
 * 4. IMPACT: Show financial/delivery risk indicators
 * 5. READ-ONLY: All cards drill down only, no data entry
 * 6. NO DUPLICATION: Internal/External modes don't double-count WIP
 * 
 * Layout Order (Internal Mode):
 * 1. Executive Risk Bar - Global alerts (always visible)
 * 2. Actionable Blockers - "Needs Your Decision" section
 * 3. Delivery Risk Panel - Upcoming deadline pressure
 * 4. Quality Loss Signals - Quality issues needing attention
 * 5. Today's Snapshot - Status context (secondary)
 * 6. Production Pipeline - Operational view (tertiary)
 * 
 * Data Sources:
 * - Internal WIP: internal_flow_summary_vw (work_orders by current_stage)
 * - External WIP: external_processing_summary_vw (wo_external_moves with status='sent')
 * - Blockers: work_orders with blocks, sorted by urgency
 * - Delivery Risk: work_orders with due_date in next 7 days
 * - Quality Signals: daily_production_logs, qc_records, ncrs
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Factory, ArrowDownUp, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ControlTowerHeader } from "@/components/dashboard/ControlTowerHeader";
import { ActionableBlockers } from "@/components/dashboard/ActionableBlockers";
import { ThresholdAlerts } from "@/components/dashboard/ThresholdAlerts";
import { InternalFlowPanel } from "@/components/dashboard/InternalFlowPanel";
import { ExternalFlowPanel } from "@/components/dashboard/ExternalFlowPanel";
import { ExecutiveRiskBar } from "@/components/dashboard/ExecutiveRiskBar";
import { ModeToggle, OperatingMode } from "@/components/dashboard/ModeToggle";
import { InternalSummaryStrip } from "@/components/dashboard/InternalSummaryStrip";
import { ExternalSummaryStrip } from "@/components/dashboard/ExternalSummaryStrip";
import { ExternalProcessingDetailDrawer } from "@/components/dashboard/ExternalProcessingDetailDrawer";
import { TodayFactorySnapshot } from "@/components/dashboard/TodayFactorySnapshot";
import { OverdueReturnsTable } from "@/components/dashboard/OverdueReturnsTable";
import { QualityLossSignals } from "@/components/dashboard/QualityLossSignals";
import { DeliveryRiskPanel } from "@/components/dashboard/DeliveryRiskPanel";
import { CriticalTodayStrip } from "@/components/dashboard/CriticalTodayStrip";
import { LossImpactIndicator } from "@/components/dashboard/LossImpactIndicator";
import { useDepartmentPermissions } from "@/hooks/useDepartmentPermissions";

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
  const { isBypassUser, userDepartmentType, loading: permissionsLoading } = useDepartmentPermissions();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [internalFlow, setInternalFlow] = useState<InternalFlowStage[]>([]);
  const [externalData, setExternalData] = useState<Record<string, ExternalProcessData>>({
    job_work: { pcs: 0, kg: 0, activeMoves: 0, overdue: 0 },
    plating: { pcs: 0, kg: 0, activeMoves: 0, overdue: 0 },
    buffing: { pcs: 0, kg: 0, activeMoves: 0, overdue: 0 },
    blasting: { pcs: 0, kg: 0, activeMoves: 0, overdue: 0 },
    forging_ext: { pcs: 0, kg: 0, activeMoves: 0, overdue: 0 },
    heat_treatment: { pcs: 0, kg: 0, activeMoves: 0, overdue: 0 }
    // Note: Cutting is internal, not external - tracked in internal flow
  });
  const [selectedProcess, setSelectedProcess] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeMode, setActiveMode] = useState<OperatingMode>("internal");

  // Department-based redirect mapping for non-admin users
  const departmentLandingPages: Record<string, string> = {
    production: '/work-orders',
    quality: '/quality',
    sales: '/sales',
    packing: '/packing',
    design: '/items',
  };

  // Redirect non-admin users to their department landing page
  useEffect(() => {
    if (permissionsLoading) return;
    
    // Only bypass users (admin, finance, super_admin) can see the main dashboard
    if (!isBypassUser && userDepartmentType) {
      const landingPage = departmentLandingPages[userDepartmentType] || '/work-orders';
      navigate(landingPage, { replace: true });
    }
  }, [permissionsLoading, isBypassUser, userDepartmentType, navigate]);

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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_production_logs' }, () => loadDashboardData())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const loadDashboardData = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      // Parallel queries for live summary data
      const [
        materialQcResult,
        maintenanceResult,
        delayedWoResult,
        qcPendingResult,
        pipelineResult,
        productionResult,
        lateDeliveriesResult,
        dueTodayResult,
        completedOnTimeResult,
        totalCompletedResult
      ] = await Promise.all([
        // Material waiting QC - raw_purchase_orders with incoming_qc_status = 'pending'
        supabase.from('raw_purchase_orders').select('id', { count: 'exact', head: true })
          .eq('incoming_qc_status', 'pending'),
        
        // Maintenance overdue - machines with next_maintenance_date < today
        supabase.from('machines').select('id', { count: 'exact', head: true })
          .lt('next_maintenance_date', today)
          .eq('status', 'active'),
        
        // Work orders delayed - status pending/in_progress and due_date < today
        supabase.from('work_orders').select('id', { count: 'exact', head: true })
          .in('status', ['pending', 'in_progress'])
          .lt('due_date', today),
        
        // QC pending approval - hourly_qc_checks with status 'pending'
        supabase.from('hourly_qc_checks').select('id', { count: 'exact', head: true })
          .eq('status', 'pending'),
        
        // Orders in pipeline - work_orders with status 'pending'
        supabase.from('work_orders').select('id', { count: 'exact', head: true })
          .eq('status', 'pending'),
        
        // Orders in production - work_orders with status 'in_progress'
        supabase.from('work_orders').select('id', { count: 'exact', head: true })
          .eq('status', 'in_progress'),
        
        // Late deliveries - dispatches where dispatched_at > work_order due_date (simplified: count overdue WOs that are completed)
        supabase.from('work_orders').select('id', { count: 'exact', head: true })
          .eq('status', 'completed')
          .lt('due_date', today),
        
        // Due today
        supabase.from('work_orders').select('id', { count: 'exact', head: true })
          .eq('due_date', today)
          .in('status', ['pending', 'in_progress']),
        
        // On-time rate calculation: completed on time in last 7 days
        supabase.from('work_orders').select('id', { count: 'exact', head: true })
          .eq('status', 'completed')
          .gte('updated_at', sevenDaysAgo)
          .gte('due_date', sevenDaysAgo),
        
        // Total completed in last 7 days
        supabase.from('work_orders').select('id', { count: 'exact', head: true })
          .eq('status', 'completed')
          .gte('updated_at', sevenDaysAgo)
      ]);

      // Calculate on-time rate
      const completedOnTime = completedOnTimeResult.count ?? 0;
      const totalCompleted = totalCompletedResult.count ?? 0;
      const onTimeRate = totalCompleted > 0 ? Math.round((completedOnTime / totalCompleted) * 100) : 100;

      setSummary({
        material_waiting_qc: materialQcResult.count ?? 0,
        maintenance_overdue: maintenanceResult.count ?? 0,
        work_orders_delayed: delayedWoResult.count ?? 0,
        qc_pending_approval: qcPendingResult.count ?? 0,
        orders_in_pipeline: pipelineResult.count ?? 0,
        orders_in_production: productionResult.count ?? 0,
        external_wip_pcs: 0, // Will be calculated from external data below
        late_deliveries: lateDeliveriesResult.count ?? 0,
        due_today: dueTodayResult.count ?? 0,
        on_time_rate_7d: onTimeRate
      });

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
          forging_ext: { pcs: 0, kg: 0, activeMoves: 0, overdue: 0 },
          heat_treatment: { pcs: 0, kg: 0, activeMoves: 0, overdue: 0 }
        };

        // Map process names from view to internal keys
        const processKeyMap: Record<string, string> = {
          'Job Work': 'job_work',
          'Plating': 'plating',
          'Buffing': 'buffing',
          'Blasting': 'blasting',
          'Forging': 'forging_ext',
          'Heat Treatment': 'heat_treatment'
        };

        extSummary.forEach((row: any) => {
          const processName = row.process_name as string;
          const processKey = processKeyMap[processName] || processName.toLowerCase().replace(/\s+/g, '_');
          if (extData[processKey]) {
            const kgTotal = row.kg_total ?? 0;
            extData[processKey] = {
              pcs: Math.round(row.pcs_total || 0),
              kg: parseFloat(Number(kgTotal).toFixed(1)),
              activeMoves: row.active_moves || 0,
              overdue: row.overdue || 0
            };
          }
        });

        setExternalData(extData);
        
        // Update external WIP in summary
        const totalExternalPcs = Object.values(extData).reduce((sum, p) => sum + p.pcs, 0);
        setSummary(prev => prev ? { ...prev, external_wip_pcs: totalExternalPcs } : prev);
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
      forging_ext: 'Forging',
      heat_treatment: 'Heat Treatment'
      // Cutting is internal - not listed here
    };
    return labels[key] || key;
  };

  // Calculate metrics with null-safety
  const criticalCount = (summary?.maintenance_overdue ?? 0) + (summary?.work_orders_delayed ?? 0) + (summary?.late_deliveries ?? 0);
  const warningCount = (summary?.material_waiting_qc ?? 0) + (summary?.qc_pending_approval ?? 0);
  const allClear = criticalCount === 0 && warningCount === 0;

  // Internal metrics with null-safety
  const internalJobCount = Array.isArray(internalFlow) 
    ? internalFlow.reduce((sum, s) => sum + (s?.active_jobs ?? 0), 0) 
    : 0;

  // External metrics with null-safety
  const externalOverdueTotal = Object.values(externalData ?? {}).reduce((sum, p) => sum + (p?.overdue ?? 0), 0);
  const externalActiveTotal = Object.values(externalData ?? {}).reduce((sum, p) => sum + (p?.activeMoves ?? 0), 0);
  const externalWipPcs = Object.values(externalData ?? {}).reduce((sum, p) => sum + (p?.pcs ?? 0), 0);

  // Show loading while checking permissions or data
  if (loading || permissionsLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Factory className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading Control Tower...</p>
        </div>
      </div>
    );
  }

  // Non-bypass users should be redirected - show nothing while redirect happens
  if (!isBypassUser) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Critical Today Strip - Only visible when issues exist */}
      <CriticalTodayStrip />
      
      {/* Executive Risk Bar - Global, always visible, unaffected by mode */}
      <ExecutiveRiskBar />
      
      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Control Tower Header */}
        <ControlTowerHeader 
          criticalCount={criticalCount} 
          warningCount={warningCount} 
          allClear={allClear} 
        />

        {/* Mode Toggle - Prominent, centered */}
        <ModeToggle
          activeMode={activeMode}
          onModeChange={setActiveMode}
          internalJobCount={internalJobCount}
          externalOverdueCount={externalOverdueTotal}
          externalActiveCount={externalActiveTotal}
        />

        {/* Mode-specific Content */}
        {activeMode === "internal" ? (
          <div className="space-y-4">
            {/* PRIMARY: Actionable Blockers - What needs decision NOW */}
            <ActionableBlockers />

            {/* THRESHOLD ALERTS: Performance issues needing attention */}
            <ThresholdAlerts />

            {/* SECONDARY: Delivery Risk - Upcoming pressure */}
            <DeliveryRiskPanel />

            {/* TERTIARY: Quality Signals - Issues to watch */}
            <QualityLossSignals />

            {/* LOSS IMPACT: Visual emphasis on losses */}
            <LossImpactIndicator />

            {/* CONTEXT: Today's Status (collapsed priority) */}
            <TodayFactorySnapshot />

            {/* REFERENCE: Production Pipeline */}
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
          </div>
        ) : (
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <ArrowDownUp className="h-5 w-5 text-primary" />
                    External Processing Status
                  </CardTitle>
                  <button
                    onClick={() => navigate('/partners')}
                    className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                  >
                    Full View <ExternalLink className="h-3 w-3" />
                  </button>
                </div>
              </CardHeader>
              <CardContent>
                <ExternalFlowPanel 
                  data={externalData} 
                  onProcessClick={handleProcessClick} 
                />
              </CardContent>
            </Card>

            {/* Overdue Returns Table - Primary action list for external follow-ups */}
            <OverdueReturnsTable selectedProcess={selectedProcess} />
          </div>
        )}

        {/* Mode-specific Summary Strip */}
        {activeMode === "internal" ? (
          <InternalSummaryStrip
            ordersInPipeline={summary?.orders_in_pipeline || 0}
            ordersInProduction={summary?.orders_in_production || 0}
            onTimeRate={summary?.on_time_rate_7d || 100}
          />
        ) : (
          <ExternalSummaryStrip
            totalActiveMoves={externalActiveTotal}
            totalWipPcs={externalWipPcs}
            overdueCount={externalOverdueTotal}
          />
        )}
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
