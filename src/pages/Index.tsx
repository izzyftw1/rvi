import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import rvLogo from "@/assets/rv-logo.jpg";
import { useThrottledRealtime } from "@/hooks/useThrottledRealtime";
import { 
  Factory, 
  Package, 
  Truck, 
  CheckCircle2,
  LogOut,
  Shield,
  AlertTriangle,
  ClipboardCheck,
  QrCode,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { KPIBanner } from "@/components/dashboard/KPIBanner";
import { FloorKanban } from "@/components/dashboard/FloorKanban";
import { useUserRole } from "@/hooks/useUserRole";
import { CriticalAlertsBar } from "@/components/dashboard/CriticalAlertsBar";
import { TodayGlanceTimeline } from "@/components/dashboard/TodayGlanceTimeline";
import { ExternalDashboard } from "@/components/dashboard/ExternalDashboard";
import { QCAlertsWidget } from "@/components/dashboard/QCAlertsWidget";
import { LogisticsAlertsWidget } from "@/components/dashboard/LogisticsAlertsWidget";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { QuickActionsAccordion } from "@/components/dashboard/QuickActionsAccordion";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

const Index = () => {
  const navigate = useNavigate();
  const { isSuperAdmin, isFinanceRole, hasRole } = useUserRole();
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [userRoles, setUserRoles] = useState<string[]>([]);
  const [quickAccessOpen, setQuickAccessOpen] = useState(true);
  
  // KPI Metrics
  const [kpiMetrics, setKpiMetrics] = useState({
    ordersPipeline: 0,
    ordersProduction: 0,
    externalWIP: 0,
    lateDeliveries: 0,
    dueToday: 0,
    ontimeRate7d: 0,
  });

  // Floor Stats
  const [floorStats, setFloorStats] = useState({
    goods_in: { count: 0, pcs: 0, kg: 0, avgWait: 0 },
    production: { count: 0, pcs: 0, kg: 0, avgWait: 0 },
    qc: { count: 0, pcs: 0, kg: 0, avgWait: 0 },
    packing: { count: 0, pcs: 0, kg: 0, avgWait: 0 },
    dispatch: { count: 0, pcs: 0, kg: 0, avgWait: 0 },
  });

  const [todayEvents, setTodayEvents] = useState<any[]>([]);

  useEffect(() => {
    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setUser(session.user);
        loadProfile(session.user.id);
        loadDashboardData();
      } else {
        navigate("/auth");
      }
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setUser(session.user);
        loadProfile(session.user.id);
        loadDashboardData();
      } else {
        navigate("/auth");
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [navigate]);

  // Throttled realtime for KPIs - separate channel
  const loadKPIsCallback = useCallback(() => {
    if (user) loadKPIs();
  }, [user, userRoles]);

  useThrottledRealtime({
    channelName: 'dashboard-kpis',
    tables: ['work_orders', 'sales_orders', 'qc_records', 'wo_external_moves'],
    onUpdate: loadKPIsCallback,
    throttleMs: 10000, // 10 seconds for KPIs
    cacheMs: 30000, // 30 seconds cache
  });

  const loadProfile = async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    
    if (data) {
      setProfile(data);
    }

    // Load user roles
    const { data: rolesData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId);
    
    if (rolesData) {
      setUserRoles(rolesData.map(r => r.role));
    }
  };

  const loadDashboardData = async () => {
    try {
      await loadKPIs();
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    }
  };

  const loadKPIs = async () => {
    const today = new Date().toISOString().split('T')[0];
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    // Check if user is QC role
    const isQC = userRoles.includes('quality');

    if (isQC) {
      // QC-specific KPIs
      // Material Tests Pending
      const { count: materialTests } = await supabase
        .from('qc_records')
        .select('*', { count: 'exact', head: true })
        .eq('qc_type', 'incoming')
        .eq('result', 'pending');

      // First-Piece Due (24h)
      const { data: firstPieceDue } = await supabase
        .from('qc_records')
        .select('*, work_orders!inner(due_date)')
        .eq('qc_type', 'first_piece')
        .eq('result', 'pending')
        .lte('work_orders.due_date', tomorrowStr);

      // QC Holds
      const { count: qcHolds } = await supabase
        .from('work_orders')
        .select('*', { count: 'exact', head: true })
        .eq('production_allowed', false)
        .neq('status', 'completed');

      // Orders in Production (still useful for QC)
      const { count: production } = await supabase
        .from('work_orders')
        .select('*', { count: 'exact', head: true })
        .in('status', ['in_progress', 'pending']);

      // Late Deliveries
      const { count: late } = await supabase
        .from('work_orders')
        .select('*', { count: 'exact', head: true })
        .lt('due_date', today)
        .neq('status', 'completed');

      // Due Today
      const { count: dueToday } = await supabase
        .from('work_orders')
        .select('*', { count: 'exact', head: true })
        .eq('due_date', today)
        .neq('status', 'completed');

      setKpiMetrics({
        ordersPipeline: materialTests || 0, // Repurposed
        ordersProduction: production || 0,
        externalWIP: firstPieceDue?.length || 0, // Repurposed
        lateDeliveries: late || 0,
        dueToday: qcHolds || 0, // Repurposed
        ontimeRate7d: dueToday || 0, // Repurposed
      });
    } else {
      // Default KPIs for Production/Logistics/Others
      // Orders in Pipeline (pending/approved sales orders)
      const { count: pipeline } = await supabase
        .from('sales_orders')
        .select('*', { count: 'exact', head: true })
        .in('status', ['pending', 'approved']);

      // Orders in Production
      const { count: production } = await supabase
        .from('work_orders')
        .select('*', { count: 'exact', head: true })
        .in('status', ['in_progress', 'pending']);

      // External WIP (count pieces sent out but not returned)
      const { data: externalMoves } = await supabase
        .from('wo_external_moves' as any)
        .select('qty_sent, qty_returned')
        .is('returned_date', null);
      
      const externalWIP = externalMoves?.reduce((sum: number, move: any) => {
        return sum + (move.qty_sent - (move.qty_returned || 0));
      }, 0) || 0;

      // Late Deliveries
      const { count: late } = await supabase
        .from('work_orders')
        .select('*', { count: 'exact', head: true })
        .lt('due_date', today)
        .neq('status', 'completed');

      // Due Today
      const { count: dueToday } = await supabase
        .from('work_orders')
        .select('*', { count: 'exact', head: true })
        .eq('due_date', today)
        .neq('status', 'completed');

      // On-time Rate 7d
      const { data: completedLast7d } = await supabase
        .from('work_orders')
        .select('due_date, updated_at')
        .eq('status', 'completed')
        .gte('updated_at', sevenDaysAgo);
      
      const ontimeCount = completedLast7d?.filter(wo => {
        return new Date(wo.updated_at) <= new Date(wo.due_date);
      }).length || 0;
      
      const totalCompleted = completedLast7d?.length || 0;
      const ontimeRate7d = totalCompleted > 0 ? Math.round((ontimeCount / totalCompleted) * 100) : 100;

      setKpiMetrics({
        ordersPipeline: pipeline || 0,
        ordersProduction: production || 0,
        externalWIP,
        lateDeliveries: late || 0,
        dueToday: dueToday || 0,
        ontimeRate7d,
      });
    }
  };

  // Removed loadFloorStatus and loadTodayEvents - moved to individual components with throttling

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
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

  // Prepare KPI data based on role
  const isQC = userRoles.includes('quality');
  
  const kpiData = isQC ? [
    {
      label: "Material Tests Pending",
      value: kpiMetrics.ordersPipeline.toString(),
      status: (kpiMetrics.ordersPipeline === 0 ? 'good' : 
              kpiMetrics.ordersPipeline <= 3 ? 'warning' : 'critical') as 'good' | 'warning' | 'critical',
      icon: Package,
      onClick: () => navigate("/qc-incoming")
    },
    {
      label: "Orders in Production",
      value: kpiMetrics.ordersProduction.toString(),
      status: 'good' as const,
      icon: Factory,
      onClick: () => navigate("/production-progress")
    },
    {
      label: "First-Piece Due (24h)",
      value: kpiMetrics.externalWIP.toString(),
      status: (kpiMetrics.externalWIP === 0 ? 'good' : 
              kpiMetrics.externalWIP <= 2 ? 'warning' : 'critical') as 'good' | 'warning' | 'critical',
      icon: ClipboardCheck,
      onClick: () => navigate("/quality")
    },
    {
      label: "Late Deliveries",
      value: kpiMetrics.lateDeliveries.toString(),
      status: (kpiMetrics.lateDeliveries === 0 ? 'good' : 
              kpiMetrics.lateDeliveries <= 3 ? 'warning' : 'critical') as 'good' | 'warning' | 'critical',
      icon: AlertTriangle,
      onClick: () => navigate("/work-orders")
    },
    {
      label: "QC Holds",
      value: kpiMetrics.dueToday.toString(),
      status: (kpiMetrics.dueToday === 0 ? 'good' : 
              kpiMetrics.dueToday <= 2 ? 'warning' : 'critical') as 'good' | 'warning' | 'critical',
      icon: AlertTriangle,
      onClick: () => navigate("/quality")
    },
    {
      label: "Due Today",
      value: kpiMetrics.ontimeRate7d.toString(),
      status: (kpiMetrics.ontimeRate7d === 0 ? 'good' : 
              kpiMetrics.ontimeRate7d <= 5 ? 'warning' : 'critical') as 'good' | 'warning' | 'critical',
      icon: CheckCircle2,
      onClick: () => navigate("/work-orders")
    }
  ] : [
    {
      label: "Orders in Pipeline",
      value: kpiMetrics.ordersPipeline.toString(),
      status: 'good' as const,
      icon: Package,
      onClick: () => navigate("/sales")
    },
    {
      label: "Orders in Production",
      value: kpiMetrics.ordersProduction.toString(),
      status: 'good' as const,
      icon: Factory,
      onClick: () => navigate("/production-progress")
    },
    {
      label: "External WIP pcs",
      value: kpiMetrics.externalWIP.toString(),
      status: (kpiMetrics.externalWIP === 0 ? 'good' : 
              kpiMetrics.externalWIP <= 500 ? 'warning' : 'critical') as 'good' | 'warning' | 'critical',
      icon: Truck,
      onClick: () => navigate("/logistics")
    },
    {
      label: "Late Deliveries",
      value: kpiMetrics.lateDeliveries.toString(),
      status: (kpiMetrics.lateDeliveries === 0 ? 'good' : 
              kpiMetrics.lateDeliveries <= 3 ? 'warning' : 'critical') as 'good' | 'warning' | 'critical',
      icon: AlertTriangle,
      onClick: () => navigate("/work-orders")
    },
    {
      label: "Due Today",
      value: kpiMetrics.dueToday.toString(),
      status: (kpiMetrics.dueToday === 0 ? 'good' : 
              kpiMetrics.dueToday <= 5 ? 'warning' : 'critical') as 'good' | 'warning' | 'critical',
      icon: ClipboardCheck,
      onClick: () => navigate("/work-orders")
    },
    {
      label: "On-time Rate 7d",
      value: `${kpiMetrics.ontimeRate7d}%`,
      status: (kpiMetrics.ontimeRate7d >= 90 ? 'good' : 
              kpiMetrics.ontimeRate7d >= 75 ? 'warning' : 'critical') as 'good' | 'warning' | 'critical',
      icon: CheckCircle2,
      onClick: () => navigate("/reports")
    }
  ];


  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img 
                src={rvLogo} 
                alt="RV Industries Logo" 
                className="h-16 object-contain"
              />
              <div>
                <h1 className="text-xl font-bold">Manufacturing Control Center</h1>
                <p className="text-xs text-muted-foreground">Real-time Operations Dashboard</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <Button 
                onClick={() => navigate("/scan-console")} 
                variant="default"
                className="gap-2"
              >
                <QrCode className="h-4 w-4" />
                Scan Console
              </Button>
              <div className="text-right">
                <p className="text-sm font-medium">{profile?.full_name}</p>
                <p className="text-xs text-muted-foreground capitalize">{profile?.role?.replace('_', ' ')}</p>
              </div>
              {isSuperAdmin() && (
                <Button variant="ghost" onClick={() => navigate("/admin")} className="hidden sm:inline-flex gap-2">
                  <Shield className="h-5 w-5" />
                  Admin
                </Button>
              )}
              <Button variant="ghost" size="icon" onClick={handleLogout}>
                <LogOut className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Critical Alerts Bar */}
        <CriticalAlertsBar />

        {/* KPI Banner - Compact 6 tiles */}
        <KPIBanner metrics={kpiData} />

        {/* Role-specific alerts */}
        {userRoles.includes('quality') && (
          <QCAlertsWidget />
        )}
        {userRoles.includes('logistics') && (
          <LogisticsAlertsWidget />
        )}

        {/* Tabbed View - Default tab based on role */}
        <Tabs 
          defaultValue={userRoles.includes('logistics') ? 'external' : 'internal'} 
          className="w-full"
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="internal">Internal Flow</TabsTrigger>
            <TabsTrigger value="external">External Processing</TabsTrigger>
          </TabsList>
          
          <TabsContent value="internal" className="space-y-6 mt-6">
            {/* Live Floor Status - Kanban View */}
            {!userRoles.includes('quality') && <FloorKanban />}

            {/* Today at a Glance Timeline */}
            <TodayGlanceTimeline limit={10} showViewAll={true} />

            {/* QC sees simplified kanban */}
            {userRoles.includes('quality') && (
              <div className="text-center py-8 text-muted-foreground">
                <p className="text-sm">Internal flow view available. Switch to External tab for detailed processing.</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="external" className="mt-6">
            <ExternalDashboard />
          </TabsContent>
        </Tabs>

        {/* Quick Access Section - Collapsible */}
        <Collapsible 
          open={quickAccessOpen} 
          onOpenChange={setQuickAccessOpen}
          className="space-y-2"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold">Quick Access</h2>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-2">
                {quickAccessOpen ? (
                  <>
                    <ChevronUp className="h-4 w-4" />
                    <span className="text-sm">Collapse</span>
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-4 w-4" />
                    <span className="text-sm">Expand</span>
                  </>
                )}
              </Button>
            </CollapsibleTrigger>
          </div>
          
          <CollapsibleContent className="space-y-2 animate-accordion-down">
            <QuickActionsAccordion userRoles={userRoles} />
          </CollapsibleContent>
        </Collapsible>
      </main>
    </div>
  );
};

export default Index;
