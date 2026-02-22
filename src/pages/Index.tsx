/**
 * Homepage - Executive Factory Overview
 * 
 * Design Principles:
 * 1. CLARITY: 5 KPIs at top, then actionable items, then details on demand
 * 2. UNIFIED: No mode toggle — internal + external shown together
 * 3. PROGRESSIVE DISCLOSURE: Summary → Actions → Details (collapsible)
 * 4. FINANCIAL FRAMING: Business impact emphasized
 * 5. READ-ONLY: All cards drill down only, no data entry
 * 
 * Layout:
 * 1. Risk Bar (compact, always visible)
 * 2. Executive KPI Hero (5 numbers)
 * 3. Needs Your Decision (top action list)
 * 4. Two-column: Delivery Risk + External SLA
 * 5. Two-column: Production Pipeline + Quality Signals
 * 6. Collapsible: Performance Alerts, Loss Impact, Factory Snapshot
 */
import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Factory, ArrowDownUp, ExternalLink, ChevronDown, ChevronUp, BarChart3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ExecutiveKPIHero } from "@/components/dashboard/ExecutiveKPIHero";
import { ActionableBlockers } from "@/components/dashboard/ActionableBlockers";
import { ThresholdAlerts } from "@/components/dashboard/ThresholdAlerts";
import { InternalFlowPanel } from "@/components/dashboard/InternalFlowPanel";
import { ExternalFlowPanel } from "@/components/dashboard/ExternalFlowPanel";
import { ExecutiveRiskBar } from "@/components/dashboard/ExecutiveRiskBar";
import { TodayFactorySnapshot } from "@/components/dashboard/TodayFactorySnapshot";
import { OverdueReturnsTable } from "@/components/dashboard/OverdueReturnsTable";
import { QualityLossSignals } from "@/components/dashboard/QualityLossSignals";
import { DeliveryRiskPanel } from "@/components/dashboard/DeliveryRiskPanel";
import { CriticalTodayStrip } from "@/components/dashboard/CriticalTodayStrip";
import { LossImpactIndicator } from "@/components/dashboard/LossImpactIndicator";
import { ExternalProcessingDetailDrawer } from "@/components/dashboard/ExternalProcessingDetailDrawer";
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
  active_orders: number;
  rejection_rate: number;
  blocked_count: number;
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
  const [externalData, setExternalData] = useState<Record<string, ExternalProcessData>>({
    job_work: { pcs: 0, kg: 0, activeMoves: 0, overdue: 0 },
    plating: { pcs: 0, kg: 0, activeMoves: 0, overdue: 0 },
    buffing: { pcs: 0, kg: 0, activeMoves: 0, overdue: 0 },
    blasting: { pcs: 0, kg: 0, activeMoves: 0, overdue: 0 },
    forging_ext: { pcs: 0, kg: 0, activeMoves: 0, overdue: 0 },
    heat_treatment: { pcs: 0, kg: 0, activeMoves: 0, overdue: 0 }
  });
  const [selectedProcess, setSelectedProcess] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

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
        totalCompletedResult,
        activeOrdersResult,
        todayLogsResult,
        blockedResult,
      ] = await Promise.all([
        supabase.from('raw_purchase_orders').select('id', { count: 'exact', head: true })
          .eq('incoming_qc_status', 'pending'),
        supabase.from('machines').select('id', { count: 'exact', head: true })
          .lt('next_maintenance_date', today).eq('status', 'active'),
        supabase.from('work_orders').select('id', { count: 'exact', head: true })
          .in('status', ['pending', 'in_progress']).lt('due_date', today),
        supabase.from('hourly_qc_checks').select('id', { count: 'exact', head: true })
          .eq('status', 'pending'),
        supabase.from('work_orders').select('id', { count: 'exact', head: true })
          .eq('status', 'pending'),
        supabase.from('work_orders').select('id', { count: 'exact', head: true })
          .eq('status', 'in_progress'),
        supabase.from('work_orders').select('id', { count: 'exact', head: true })
          .eq('status', 'completed').lt('due_date', today),
        supabase.from('work_orders').select('id', { count: 'exact', head: true })
          .eq('due_date', today).in('status', ['pending', 'in_progress']),
        supabase.from('work_orders').select('id', { count: 'exact', head: true })
          .eq('status', 'completed').gte('updated_at', sevenDaysAgo).gte('due_date', sevenDaysAgo),
        supabase.from('work_orders').select('id', { count: 'exact', head: true })
          .eq('status', 'completed').gte('updated_at', sevenDaysAgo),
        // Active orders (not completed/shipped)
        supabase.from('work_orders').select('id', { count: 'exact', head: true })
          .not('status', 'in', '("completed","shipped","cancelled")'),
        // Today's rejection data
        supabase.from('daily_production_logs')
          .select('actual_quantity, total_rejection_quantity')
          .eq('log_date', today),
        // Blocked orders (delayed + QC blocked)
        supabase.from('work_orders').select('id', { count: 'exact', head: true })
          .in('status', ['pending', 'in_progress']).lt('due_date', today),
      ]);

      // Calculate on-time rate
      const completedOnTime = completedOnTimeResult.count ?? 0;
      const totalCompleted = totalCompletedResult.count ?? 0;
      const onTimeRate = totalCompleted > 0 ? Math.round((completedOnTime / totalCompleted) * 100) : 100;

      // Calculate rejection rate from today's logs
      const logs = todayLogsResult.data || [];
      const totalProduced = logs.reduce((sum, l) => sum + (l.actual_quantity || 0), 0);
      const totalRejected = logs.reduce((sum, l) => sum + (l.total_rejection_quantity || 0), 0);
      const rejectionRate = totalProduced > 0 ? (totalRejected / (totalProduced + totalRejected)) * 100 : 0;

      setSummary({
        material_waiting_qc: materialQcResult.count ?? 0,
        maintenance_overdue: maintenanceResult.count ?? 0,
        work_orders_delayed: delayedWoResult.count ?? 0,
        qc_pending_approval: qcPendingResult.count ?? 0,
        orders_in_pipeline: pipelineResult.count ?? 0,
        orders_in_production: productionResult.count ?? 0,
        external_wip_pcs: 0,
        late_deliveries: lateDeliveriesResult.count ?? 0,
        due_today: dueTodayResult.count ?? 0,
        on_time_rate_7d: onTimeRate,
        active_orders: activeOrdersResult.count ?? 0,
        rejection_rate: rejectionRate,
        blocked_count: blockedResult.count ?? 0,
      });

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

        const processKeyMap: Record<string, string> = {
          'Job Work': 'job_work', 'Plating': 'plating', 'Buffing': 'buffing',
          'Blasting': 'blasting', 'Forging': 'forging_ext', 'Heat Treatment': 'heat_treatment'
        };

        extSummary.forEach((row: any) => {
          const processKey = processKeyMap[row.process_name] || row.process_name.toLowerCase().replace(/\s+/g, '_');
          if (extData[processKey]) {
            extData[processKey] = {
              pcs: Math.round(row.pcs_total || 0),
              kg: parseFloat(Number(row.kg_total ?? 0).toFixed(1)),
              activeMoves: row.active_moves || 0,
              overdue: row.overdue || 0
            };
          }
        });

        setExternalData(extData);
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
      job_work: 'Job Work', plating: 'Plating', buffing: 'Buffing',
      blasting: 'Blasting', forging_ext: 'Forging', heat_treatment: 'Heat Treatment'
    };
    return labels[key] || key;
  };

  // External metrics
  const externalOverdueTotal = Object.values(externalData ?? {}).reduce((sum, p) => sum + (p?.overdue ?? 0), 0);
  const externalActiveTotal = Object.values(externalData ?? {}).reduce((sum, p) => sum + (p?.activeMoves ?? 0), 0);

  if (loading || permissionsLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Factory className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (!isBypassUser) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Critical strip — only visible when issues exist */}
      <CriticalTodayStrip />
      
      {/* Compact risk bar — always visible */}
      <ExecutiveRiskBar />
      
      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* ── HERO: Executive KPIs ─────────────────────── */}
        <div className="space-y-1">
          <h1 className="text-lg font-semibold tracking-tight text-foreground">
            Factory Overview
          </h1>
          <p className="text-xs text-muted-foreground">
            Real-time executive snapshot
          </p>
        </div>

        <ExecutiveKPIHero
          activeOrders={summary?.active_orders ?? 0}
          onTimeRate={summary?.on_time_rate_7d ?? 100}
          rejectionRate={summary?.rejection_rate ?? 0}
          externalOverdue={externalOverdueTotal}
          externalTotal={externalActiveTotal}
          blockedOrders={summary?.blocked_count ?? 0}
        />

        {/* ── PRIMARY: What needs your attention ───────── */}
        <ActionableBlockers />

        {/* ── SECONDARY: Two-column — Delivery Risk + External ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <DeliveryRiskPanel />

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <ArrowDownUp className="h-4 w-4 text-primary" />
                  External Processing
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
        </div>

        {/* ── TERTIARY: Two-column — Pipeline + Quality ──── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Factory className="h-4 w-4 text-primary" />
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
              <InternalFlowPanel stages={[]} />
            </CardContent>
          </Card>

          <QualityLossSignals />
        </div>

        {/* ── DETAILS: Collapsible deep-dive section ───── */}
        <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
          <CollapsibleTrigger asChild>
            <button className="w-full flex items-center justify-between py-2.5 px-4 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors border border-border/30">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <BarChart3 className="h-3.5 w-3.5" />
                <span className="font-medium">Detailed Insights</span>
                <span className="text-muted-foreground/60">
                  Performance alerts, loss impact, today's snapshot
                </span>
              </div>
              {detailsOpen ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-4 pt-4">
            <ThresholdAlerts />
            <LossImpactIndicator />
            <TodayFactorySnapshot />
            <OverdueReturnsTable selectedProcess={null} />
          </CollapsibleContent>
        </Collapsible>
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
