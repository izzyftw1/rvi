import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import rvLogo from "@/assets/rv-logo.jpg";
import { 
  Factory, 
  Package, 
  Truck, 
  CheckCircle2,
  Search,
  LogOut,
  Shield,
  DollarSign,
  CreditCard,
  AlertTriangle,
  Box,
  ClipboardCheck,
  QrCode
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { KPIBanner } from "@/components/dashboard/KPIBanner";
import { QuickActionsAccordion } from "@/components/dashboard/QuickActionsAccordion";
import { FloorKanban } from "@/components/dashboard/FloorKanban";
import { TodayTimeline } from "@/components/dashboard/TodayTimeline";
import { useUserRole } from "@/hooks/useUserRole";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { convertToINR, formatINR } from "@/lib/currencyConverter";

const Index = () => {
  const navigate = useNavigate();
  const { isSuperAdmin, isFinanceRole } = useUserRole();
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  // KPI Metrics
  const [kpiMetrics, setKpiMetrics] = useState({
    revenueYTD: 0,
    revenueTarget: 1000000,
    ordersPipeline: 0,
    ordersProduction: 0,
    lateDeliveries: 0,
    latePayments: 0,
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

    // Set up real-time subscriptions
    const channel = supabase
      .channel('dashboard-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_orders' }, () => {
        loadDashboardData();
      })
      .subscribe();

    // Refresh data every 30 seconds
    const interval = setInterval(loadDashboardData, 30000);

    return () => {
      subscription.unsubscribe();
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [navigate]);

  const loadProfile = async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    
    if (data) {
      setProfile(data);
    }
  };

  const loadDashboardData = async () => {
    try {
      // Load KPIs
      await loadKPIs();
      
      // Load Floor Status
      await loadFloorStatus();
      
      // Load Today's Events
      await loadTodayEvents();
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    }
  };

  const loadKPIs = async () => {
    // Revenue YTD (from sales bookings + invoices, converted to INR)
    const yearStart = new Date(new Date().getFullYear(), 0, 1).toISOString();
    
    const { data: bookings } = await supabase
      .from('sales_bookings')
      .select('total_value, currency')
      .gte('booking_date', yearStart);
    
    const { data: invoices } = await supabase
      .from('invoices')
      .select('total_amount, currency')
      .gte('invoice_date', yearStart);
    
    const revenueFromBookings = bookings?.reduce((sum, b) => {
      return sum + convertToINR(Number(b.total_value), b.currency);
    }, 0) || 0;
    
    const revenueFromInvoices = invoices?.reduce((sum, inv) => {
      return sum + convertToINR(Number(inv.total_amount), inv.currency);
    }, 0) || 0;
    
    const revenueYTD = revenueFromBookings + revenueFromInvoices;

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

    // Late Deliveries
    const today = new Date().toISOString().split('T')[0];
    const { count: late } = await supabase
      .from('work_orders')
      .select('*', { count: 'exact', head: true })
      .lt('due_date', today)
      .neq('status', 'completed');

    // Late Payments (overdue invoices, converted to INR)
    const { data: overdueInvoices } = await supabase
      .from('invoices')
      .select('balance_amount, currency')
      .eq('status', 'overdue');
    
    const latePayments = overdueInvoices?.reduce((sum, inv) => {
      return sum + convertToINR(Number(inv.balance_amount), inv.currency);
    }, 0) || 0;

    setKpiMetrics({
      revenueYTD,
      revenueTarget: 1000000,
      ordersPipeline: pipeline || 0,
      ordersProduction: production || 0,
      lateDeliveries: late || 0,
      latePayments,
    });
  };

  const loadFloorStatus = async () => {
    const { data: wos } = await supabase
      .from('work_orders')
      .select('id, current_stage, quantity, gross_weight_per_pc, created_at');

    if (!wos) return;

    const stages = {
      goods_in: { count: 0, pcs: 0, kg: 0, totalWaitHours: 0, woCount: 0 },
      production: { count: 0, pcs: 0, kg: 0, totalWaitHours: 0, woCount: 0 },
      qc: { count: 0, pcs: 0, kg: 0, totalWaitHours: 0, woCount: 0 },
      packing: { count: 0, pcs: 0, kg: 0, totalWaitHours: 0, woCount: 0 },
      dispatch: { count: 0, pcs: 0, kg: 0, totalWaitHours: 0, woCount: 0 },
    };

    wos.forEach(wo => {
      const stage = wo.current_stage as keyof typeof stages;
      if (stages[stage]) {
        stages[stage].count++;
        stages[stage].pcs += wo.quantity || 0;
        stages[stage].kg += (wo.quantity || 0) * (wo.gross_weight_per_pc || 0) / 1000;
        
        const waitHours = (Date.now() - new Date(wo.created_at).getTime()) / (1000 * 60 * 60);
        stages[stage].totalWaitHours += waitHours;
        stages[stage].woCount++;
      }
    });

    setFloorStats({
      goods_in: {
        count: stages.goods_in.count,
        pcs: stages.goods_in.pcs,
        kg: stages.goods_in.kg,
        avgWait: stages.goods_in.woCount > 0 ? stages.goods_in.totalWaitHours / stages.goods_in.woCount : 0
      },
      production: {
        count: stages.production.count,
        pcs: stages.production.pcs,
        kg: stages.production.kg,
        avgWait: stages.production.woCount > 0 ? stages.production.totalWaitHours / stages.production.woCount : 0
      },
      qc: {
        count: stages.qc.count,
        pcs: stages.qc.pcs,
        kg: stages.qc.kg,
        avgWait: stages.qc.woCount > 0 ? stages.qc.totalWaitHours / stages.qc.woCount : 0
      },
      packing: {
        count: stages.packing.count,
        pcs: stages.packing.pcs,
        kg: stages.packing.kg,
        avgWait: stages.packing.woCount > 0 ? stages.packing.totalWaitHours / stages.packing.woCount : 0
      },
      dispatch: {
        count: stages.dispatch.count,
        pcs: stages.dispatch.pcs,
        kg: stages.dispatch.kg,
        avgWait: stages.dispatch.woCount > 0 ? stages.dispatch.totalWaitHours / stages.dispatch.woCount : 0
      },
    });
  };

  const loadTodayEvents = async () => {
    const today = new Date().toISOString().split('T')[0];
    const events: any[] = [];

    // WOs due today
    const { count: woDue } = await supabase
      .from('work_orders')
      .select('*', { count: 'exact', head: true })
      .eq('due_date', today);

    if (woDue && woDue > 0) {
      events.push({
        time: 'End of Day',
        type: 'wo_due',
        title: `${woDue} Work Orders Due`,
        count: woDue,
        priority: 'high'
      });
    }

    // Late deliveries
    const { count: late } = await supabase
      .from('work_orders')
      .select('*', { count: 'exact', head: true })
      .lt('due_date', today)
      .neq('status', 'completed');

    if (late && late > 0) {
      events.push({
        time: 'Overdue',
        type: 'late',
        title: `${late} Late Deliveries`,
        count: late,
        priority: 'high'
      });
    }

    // Ready to ship
    const { count: ready } = await supabase
      .from('work_orders')
      .select('*', { count: 'exact', head: true })
      .eq('dispatch_allowed', true)
      .neq('status', 'completed');

    if (ready && ready > 0) {
      events.push({
        time: 'Ready Now',
        type: 'ready',
        title: `${ready} Ready for Dispatch`,
        count: ready,
        priority: 'medium'
      });
    }

    // Payments expected (invoices due today)
    const { count: paymentsDue } = await supabase
      .from('invoices')
      .select('*', { count: 'exact', head: true })
      .eq('due_date', today)
      .neq('status', 'paid');

    if (paymentsDue && paymentsDue > 0) {
      events.push({
        time: 'Today',
        type: 'payment',
        title: `${paymentsDue} Payments Expected`,
        count: paymentsDue,
        priority: 'medium'
      });
    }

    setTodayEvents(events);
  };

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

  // Prepare KPI data
  const kpiData = [
    {
      label: "Revenue YTD",
      value: `₹${(kpiMetrics.revenueYTD / 100000).toFixed(1)}L`,
      target: `₹${(kpiMetrics.revenueTarget / 100000).toFixed(1)}L`,
      status: (kpiMetrics.revenueYTD >= kpiMetrics.revenueTarget * 0.8 ? 'good' : 
              kpiMetrics.revenueYTD >= kpiMetrics.revenueTarget * 0.6 ? 'warning' : 'critical') as 'good' | 'warning' | 'critical',
      trend: 12,
      icon: DollarSign,
      onClick: () => navigate("/finance/dashboard")
    },
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
      label: "Late Deliveries",
      value: kpiMetrics.lateDeliveries.toString(),
      status: (kpiMetrics.lateDeliveries === 0 ? 'good' : 
              kpiMetrics.lateDeliveries <= 3 ? 'warning' : 'critical') as 'good' | 'warning' | 'critical',
      icon: AlertTriangle,
      onClick: () => navigate("/work-orders") // Could add a filter parameter later
    },
    {
      label: "Late Payments",
      value: `₹${(kpiMetrics.latePayments / 100000).toFixed(1)}L`,
      status: (kpiMetrics.latePayments === 0 ? 'good' : 
              kpiMetrics.latePayments <= 50000 ? 'warning' : 'critical') as 'good' | 'warning' | 'critical',
      icon: CreditCard,
      onClick: () => navigate("/finance/invoices")
    }
  ];

  // Prepare Kanban data
  const kanbanStages = [
    {
      stage: "Goods In",
      icon: Package,
      count: floorStats.goods_in.count,
      totalPcs: floorStats.goods_in.pcs,
      totalKg: floorStats.goods_in.kg,
      avgWaitHours: floorStats.goods_in.avgWait,
      status: 'good' as const,
      onClick: () => navigate("/stage/goods_in")
    },
    {
      stage: "Production",
      icon: Factory,
      count: floorStats.production.count,
      totalPcs: floorStats.production.pcs,
      totalKg: floorStats.production.kg,
      avgWaitHours: floorStats.production.avgWait,
      status: 'good' as const,
      onClick: () => navigate("/stage/production")
    },
    {
      stage: "QC",
      icon: ClipboardCheck,
      count: floorStats.qc.count,
      totalPcs: floorStats.qc.pcs,
      totalKg: floorStats.qc.kg,
      avgWaitHours: floorStats.qc.avgWait,
      status: 'good' as const,
      onClick: () => navigate("/stage/qc")
    },
    {
      stage: "Packing",
      icon: Box,
      count: floorStats.packing.count,
      totalPcs: floorStats.packing.pcs,
      totalKg: floorStats.packing.kg,
      avgWaitHours: floorStats.packing.avgWait,
      status: 'good' as const,
      onClick: () => navigate("/stage/packing")
    },
    {
      stage: "Dispatch",
      icon: Truck,
      count: floorStats.dispatch.count,
      totalPcs: floorStats.dispatch.pcs,
      totalKg: floorStats.dispatch.kg,
      avgWaitHours: floorStats.dispatch.avgWait,
      status: 'good' as const,
      onClick: () => navigate("/stage/dispatch")
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
        {/* KPI Banner */}
        <KPIBanner metrics={kpiData} />

        {/* Quick Actions Accordion */}
        <div>
          <h2 className="text-xl font-bold mb-4">Quick Actions</h2>
          <QuickActionsAccordion />
        </div>

        {/* Floor Kanban */}
        <FloorKanban stages={kanbanStages} />

        {/* Today Timeline */}
        {todayEvents.length > 0 && <TodayTimeline events={todayEvents} />}
      </main>
    </div>
  );
};

export default Index;
