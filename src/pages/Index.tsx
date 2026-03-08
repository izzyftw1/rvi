/**
 * Homepage - Executive Factory Overview
 * Clean, scannable layout with progressive disclosure.
 */
import { useEffect, useState } from "react";
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
  active_orders: number;
  on_time_rate_7d: number;
  rejection_rate: number;
  external_wip_pcs: number;
  blocked_count: number;
}

interface ExternalProcessData {
  pcs: number; kg: number; activeMoves: number; overdue: number;
}

const Index = () => {
  const navigate = useNavigate();
  const { isBypassUser, userDepartmentType, loading: permissionsLoading } = useDepartmentPermissions();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [externalData, setExternalData] = useState<Record<string, ExternalProcessData>>({});
  const [selectedProcess, setSelectedProcess] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const departmentLandingPages: Record<string, string> = {
    production: '/work-orders', quality: '/quality', sales: '/sales', packing: '/packing', design: '/items',
  };

  useEffect(() => {
    if (permissionsLoading) return;
    if (!isBypassUser && userDepartmentType) {
      navigate(departmentLandingPages[userDepartmentType] || '/work-orders', { replace: true });
    }
  }, [permissionsLoading, isBypassUser, userDepartmentType, navigate]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) { setUser(session.user); loadDashboardData(); }
      else navigate("/auth");
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) { setUser(session.user); loadDashboardData(); }
      else navigate("/auth");
    });
    return () => { subscription.unsubscribe(); };
  }, [navigate]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase.channel('control-tower-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_orders' }, () => loadDashboardData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wo_external_moves' }, () => loadDashboardData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_production_logs' }, () => loadDashboardData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const loadDashboardData = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const [activeResult, completedOnTimeResult, totalCompletedResult, todayLogsResult, blockedResult] = await Promise.all([
        supabase.from('work_orders_restricted').select('id', { count: 'exact', head: true }).not('status', 'in', '("completed","shipped","cancelled")'),
        supabase.from('work_orders_restricted').select('id', { count: 'exact', head: true }).eq('status', 'completed').gte('updated_at', sevenDaysAgo).gte('due_date', sevenDaysAgo),
        supabase.from('work_orders_restricted').select('id', { count: 'exact', head: true }).eq('status', 'completed').gte('updated_at', sevenDaysAgo),
        supabase.from('daily_production_logs').select('total_rejection_quantity, actual_quantity').eq('log_date', today),
        supabase.from('work_orders_restricted').select('id', { count: 'exact', head: true }).in('status', ['pending', 'in_progress']).lt('due_date', today),
      ]);

      const completedOnTime = completedOnTimeResult.count ?? 0;
      const totalCompleted = totalCompletedResult.count ?? 0;
      const onTimeRate = totalCompleted > 0 ? Math.round((completedOnTime / totalCompleted) * 100) : 100;

      const logs = todayLogsResult.data || [];
      const totalProduced = logs.reduce((s: number, l: any) => s + (l.actual_quantity || 0), 0);
      const totalRejected = logs.reduce((s: number, l: any) => s + (l.total_rejection_quantity || 0), 0);
      const rejectionRate = totalProduced > 0 ? (totalRejected / (totalProduced + totalRejected)) * 100 : 0;

      setSummary({
        active_orders: activeResult.count ?? 0,
        on_time_rate_7d: onTimeRate,
        rejection_rate: rejectionRate,
        external_wip_pcs: 0,
        blocked_count: blockedResult.count ?? 0,
      });

      // External data
      const { data: extSummary } = await supabase.from('external_processing_summary_vw').select('*');
      if (extSummary) {
        const extData: Record<string, ExternalProcessData> = {};
        const keyMap: Record<string, string> = {
          'Job Work': 'job_work', 'Plating': 'plating', 'Buffing': 'buffing',
          'Blasting': 'blasting', 'Forging': 'forging_ext', 'Heat Treatment': 'heat_treatment'
        };
        extSummary.forEach((row: any) => {
          const key = keyMap[row.process_name] || row.process_name.toLowerCase().replace(/\s+/g, '_');
          extData[key] = {
            pcs: Math.round(row.pcs_total || 0),
            kg: parseFloat(Number(row.kg_total ?? 0).toFixed(1)),
            activeMoves: row.active_moves || 0,
            overdue: row.overdue || 0
          };
        });
        setExternalData(extData);
        const totalExtPcs = Object.values(extData).reduce((s, p) => s + p.pcs, 0);
        setSummary(prev => prev ? { ...prev, external_wip_pcs: totalExtPcs } : prev);
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

  const externalOverdueTotal = Object.values(externalData).reduce((s, p) => s + (p?.overdue ?? 0), 0);
  const externalActiveTotal = Object.values(externalData).reduce((s, p) => s + (p?.activeMoves ?? 0), 0);

  if (loading || permissionsLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Factory className="h-10 w-10 animate-spin text-primary mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (!isBypassUser) return null;

  return (
    <div className="min-h-screen bg-background">
      <CriticalTodayStrip />
      <ExecutiveRiskBar />

      <main className="container mx-auto px-4 py-5 space-y-5">
        {/* Header */}
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-foreground">Factory Overview</h1>
          <p className="text-xs text-muted-foreground">Real-time executive snapshot</p>
        </div>

        {/* KPIs */}
        <ExecutiveKPIHero
          activeOrders={summary?.active_orders ?? 0}
          onTimeRate={summary?.on_time_rate_7d ?? 100}
          rejectionRate={summary?.rejection_rate ?? 0}
          externalOverdue={externalOverdueTotal}
          externalTotal={externalActiveTotal}
          blockedOrders={summary?.blocked_count ?? 0}
        />

        {/* Actions */}
        <ActionableBlockers />

        {/* Two-column: Delivery + External */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <DeliveryRiskPanel />
          <Card>
            <CardHeader className="pb-2 pt-3 px-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <ArrowDownUp className="h-4 w-4 text-primary" />
                  External Processing
                </CardTitle>
                <button onClick={() => navigate('/partners')} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                  Full View <ExternalLink className="h-3 w-3" />
                </button>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <ExternalFlowPanel data={externalData} onProcessClick={handleProcessClick} />
            </CardContent>
          </Card>
        </div>

        {/* Two-column: Pipeline + Quality */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2 pt-3 px-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Factory className="h-4 w-4 text-primary" />
                  Production Pipeline
                </CardTitle>
                <button onClick={() => navigate('/production-progress')} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                  Full View <ExternalLink className="h-3 w-3" />
                </button>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <InternalFlowPanel stages={[]} />
            </CardContent>
          </Card>
          <QualityLossSignals />
        </div>

        {/* Collapsible details */}
        <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
          <CollapsibleTrigger asChild>
            <button className="w-full flex items-center justify-between py-2 px-4 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors border border-border/30">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <BarChart3 className="h-3.5 w-3.5" />
                <span className="font-medium">Detailed Insights</span>
                <span className="text-muted-foreground/60 hidden sm:inline">Performance alerts, loss impact, today's snapshot</span>
              </div>
              {detailsOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
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
