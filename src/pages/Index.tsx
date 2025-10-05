import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DepartmentCard } from "@/components/DepartmentCard";
import { 
  Factory, 
  Package, 
  Truck, 
  CheckCircle2,
  Search,
  QrCode,
  LogOut,
  BarChart3,
  Box,
  ClipboardCheck,
  FileText,
  Boxes
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const Index = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [floorStats, setFloorStats] = useState({
    stores: { wipPcs: 0, wipKg: 0, avgWaitTime: 0, alerts: 0 },
    production: { wipPcs: 0, wipKg: 0, avgWaitTime: 0, alerts: 0 },
    quality: { wipPcs: 0, wipKg: 0, avgWaitTime: 0, alerts: 0 },
    packing: { wipPcs: 0, wipKg: 0, avgWaitTime: 0, alerts: 0 },
    jobWork: { wipPcs: 0, wipKg: 0, avgWaitTime: 0, alerts: 0 },
    dispatch: { wipPcs: 0, wipKg: 0, avgWaitTime: 0, alerts: 0 },
  });
  const [todayStats, setTodayStats] = useState({
    woDueToday: 0,
    lateItems: 0,
    blockedSteps: 0,
    readyToShip: 0
  });

  useEffect(() => {
    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setUser(session.user);
        loadProfile(session.user.id);
        loadLiveData();
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
        loadLiveData();
      } else {
        navigate("/auth");
      }
    });

    // Set up real-time subscriptions for live updates
    const channel = supabase
      .channel('floor-status-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'routing_steps'
        },
        () => {
          loadLiveData();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'work_orders'
        },
        () => {
          loadLiveData();
        }
      )
      .subscribe();

    // Refresh data every 30 seconds
    const interval = setInterval(loadLiveData, 30000);

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

  const loadLiveData = async () => {
    try {
      // Get all departments
      const { data: departments } = await supabase
        .from('departments')
        .select('id, name, type');

      if (!departments) return;

      const newFloorStats = { ...floorStats };
      
      for (const dept of departments) {
        const { data: steps } = await supabase
          .from('routing_steps')
          .select(`
            consumed_qty,
            actual_start,
            work_orders (
              quantity
            )
          `)
          .eq('department_id', dept.id)
          .in('status', ['in_progress', 'pending', 'waiting']);

        if (steps) {
          const totalPcs = steps.reduce((sum, step: any) => {
            return sum + (step.work_orders?.quantity || 0);
          }, 0);

          const avgWait = steps.length > 0
            ? steps.reduce((sum, step: any) => {
              if (step.actual_start) {
                const hours = (Date.now() - new Date(step.actual_start).getTime()) / (1000 * 60 * 60);
                return sum + hours;
              }
              return sum;
            }, 0) / steps.length
            : 0;

          const alerts = steps.filter((step: any) => {
            if (step.actual_start) {
              const hours = (Date.now() - new Date(step.actual_start).getTime()) / (1000 * 60 * 60);
              return hours > 24;
            }
            return false;
          }).length;

          const deptKey = dept.name.toLowerCase().replace(/\s+/g, '');
          if (deptKey.includes('store')) {
            newFloorStats.stores = { wipPcs: totalPcs, wipKg: totalPcs * 0.5, avgWaitTime: avgWait, alerts };
          } else if (deptKey.includes('production')) {
            newFloorStats.production = { wipPcs: totalPcs, wipKg: totalPcs * 0.5, avgWaitTime: avgWait, alerts };
          } else if (deptKey.includes('quality')) {
            newFloorStats.quality = { wipPcs: totalPcs, wipKg: totalPcs * 0.5, avgWaitTime: avgWait, alerts };
          } else if (deptKey.includes('packing')) {
            newFloorStats.packing = { wipPcs: totalPcs, wipKg: totalPcs * 0.5, avgWaitTime: avgWait, alerts };
          } else if (deptKey.includes('job')) {
            newFloorStats.jobWork = { wipPcs: totalPcs, wipKg: totalPcs * 0.5, avgWaitTime: avgWait, alerts };
          } else if (deptKey.includes('dispatch')) {
            newFloorStats.dispatch = { wipPcs: totalPcs, wipKg: totalPcs * 0.5, avgWaitTime: avgWait, alerts };
          }
        }
      }

      setFloorStats(newFloorStats);

      // Get today's stats
      const today = new Date().toISOString().split('T')[0];
      
      const { data: wosDueToday } = await supabase
        .from('work_orders')
        .select('id', { count: 'exact' })
        .eq('due_date', today);

      const { data: lateWos } = await supabase
        .from('work_orders')
        .select('id', { count: 'exact' })
        .lt('due_date', today)
        .neq('status', 'completed');

      const { data: readyShip } = await supabase
        .from('work_orders')
        .select('id', { count: 'exact' })
        .eq('dispatch_allowed', true)
        .neq('status', 'completed');

      const { data: blocked } = await supabase
        .from('routing_steps')
        .select('id', { count: 'exact' })
        .eq('status', 'waiting');

      setTodayStats({
        woDueToday: wosDueToday?.length || 0,
        lateItems: lateWos?.length || 0,
        readyToShip: readyShip?.length || 0,
        blockedSteps: blocked?.length || 0
      });

    } catch (error) {
      console.error('Error loading live data:', error);
    }
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

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary rounded-lg">
                <Factory className="h-6 w-6 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-xl font-bold">RV Industries</h1>
                <p className="text-sm text-muted-foreground">Manufacturing Traceability</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-sm font-medium">{profile?.full_name}</p>
                <p className="text-xs text-muted-foreground capitalize">{profile?.role?.replace('_', ' ')}</p>
              </div>
              <Button variant="ghost" size="icon" onClick={handleLogout}>
                <LogOut className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        {/* Quick Actions */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <QrCode className="h-5 w-5" />
              Quick Actions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Button onClick={() => navigate("/scan-console")} className="h-auto py-4 flex-col gap-2 bg-primary">
                <QrCode className="h-6 w-6" />
                <span className="text-sm font-bold">📱 SCAN</span>
              </Button>
              <Button onClick={() => navigate("/sales")} variant="secondary" className="h-auto py-4 flex-col gap-2">
                <FileText className="h-6 w-6" />
                <span className="text-sm">Sales</span>
              </Button>
              <Button onClick={() => navigate("/purchase")} variant="secondary" className="h-auto py-4 flex-col gap-2">
                <Truck className="h-6 w-6" />
                <span className="text-sm">Purchase</span>
              </Button>
              <Button onClick={() => navigate("/materials/inwards")} variant="secondary" className="h-auto py-4 flex-col gap-2">
                <Box className="h-6 w-6" />
                <span className="text-sm">Goods In</span>
              </Button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
              <Button onClick={() => navigate("/qc/incoming")} variant="secondary" className="h-auto py-4 flex-col gap-2">
                <ClipboardCheck className="h-6 w-6" />
                <span className="text-sm">QC In</span>
              </Button>
              <Button onClick={() => navigate("/work-orders")} variant="secondary" className="h-auto py-4 flex-col gap-2">
                <Search className="h-6 w-6" />
                <span className="text-sm">Production</span>
              </Button>
              <Button onClick={() => navigate("/quality")} variant="secondary" className="h-auto py-4 flex-col gap-2">
                <ClipboardCheck className="h-6 w-6" />
                <span className="text-sm">QC Batch</span>
              </Button>
              <Button onClick={() => navigate("/packing")} variant="secondary" className="h-auto py-4 flex-col gap-2">
                <Package className="h-6 w-6" />
                <span className="text-sm">Packing</span>
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <Button onClick={() => navigate("/dispatch")} variant="secondary" className="h-auto py-4 flex-col gap-2">
                <Truck className="h-6 w-6" />
                <span className="text-sm">Dispatch</span>
              </Button>
              <Button onClick={() => navigate("/genealogy")} variant="secondary" className="h-auto py-4 flex-col gap-2">
                <BarChart3 className="h-6 w-6" />
                <span className="text-sm">Genealogy</span>
              </Button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
              <Button onClick={() => navigate("/material-requirements")} variant="secondary" className="h-auto py-4 flex-col gap-2">
                <Boxes className="h-6 w-6" />
                <span className="text-sm">Material Req</span>
              </Button>
              <Button onClick={() => navigate("/reports")} variant="outline" className="h-auto py-4 flex-col gap-2">
                <BarChart3 className="h-6 w-6" />
                <span className="text-sm font-bold">📊 Reports</span>
              </Button>
              <Button onClick={() => navigate("/tolerance-setup")} variant="outline" className="h-auto py-4 flex-col gap-2">
                <ClipboardCheck className="h-6 w-6" />
                <span className="text-sm">Tolerances</span>
              </Button>
              <Button onClick={() => navigate("/hourly-qc")} variant="outline" className="h-auto py-4 flex-col gap-2">
                <ClipboardCheck className="h-6 w-6" />
                <span className="text-sm">Hourly QC</span>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Search Bar */}
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input 
              placeholder="Search by WO, Heat No, Lot ID, Carton, Customer..."
              className="pl-10 h-12 text-base"
            />
          </div>
        </div>

        {/* Live Floor Map */}
        <div className="mb-6">
          <h2 className="text-2xl font-bold mb-4">Live Floor Status</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            <DepartmentCard
              title="Goods In"
              icon={Package}
              wipPcs={floorStats.stores.wipPcs}
              wipKg={floorStats.stores.wipKg}
              avgWaitTime={`${floorStats.stores.avgWaitTime.toFixed(1)}h`}
              alerts={floorStats.stores.alerts}
              onClick={() => navigate("/department/stores")}
            />
            <DepartmentCard
              title="Production"
              icon={Factory}
              wipPcs={floorStats.production.wipPcs}
              wipKg={floorStats.production.wipKg}
              avgWaitTime={`${floorStats.production.avgWaitTime.toFixed(1)}h`}
              alerts={floorStats.production.alerts}
              onClick={() => navigate("/department/production")}
            />
            <DepartmentCard
              title="Quality Control"
              icon={CheckCircle2}
              wipPcs={floorStats.quality.wipPcs}
              wipKg={floorStats.quality.wipKg}
              avgWaitTime={`${floorStats.quality.avgWaitTime.toFixed(1)}h`}
              alerts={floorStats.quality.alerts}
              onClick={() => navigate("/department/quality")}
            />
            <DepartmentCard
              title="Packing"
              icon={Box}
              wipPcs={floorStats.packing.wipPcs}
              wipKg={floorStats.packing.wipKg}
              avgWaitTime={`${floorStats.packing.avgWaitTime.toFixed(1)}h`}
              alerts={floorStats.packing.alerts}
              onClick={() => navigate("/department/packing")}
            />
            <DepartmentCard
              title="Job Work"
              icon={Truck}
              wipPcs={floorStats.jobWork.wipPcs}
              wipKg={floorStats.jobWork.wipKg}
              avgWaitTime={`${floorStats.jobWork.avgWaitTime.toFixed(1)}h`}
              alerts={floorStats.jobWork.alerts}
              onClick={() => navigate("/department/job-work")}
            />
            <DepartmentCard
              title="Dispatch"
              icon={Truck}
              wipPcs={floorStats.dispatch.wipPcs}
              wipKg={floorStats.dispatch.wipKg}
              avgWaitTime={`${floorStats.dispatch.avgWaitTime.toFixed(1)}h`}
              alerts={floorStats.dispatch.alerts}
              onClick={() => navigate("/department/dispatch")}
            />
          </div>
        </div>

        {/* Today's Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5" />
              Today at a Glance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-4 bg-secondary rounded-lg">
                <p className="text-3xl font-bold text-primary">{todayStats.woDueToday}</p>
                <p className="text-sm text-muted-foreground">WOs Due Today</p>
              </div>
              <div className="text-center p-4 bg-secondary rounded-lg">
                <p className="text-3xl font-bold text-destructive">{todayStats.lateItems}</p>
                <p className="text-sm text-muted-foreground">Late Items</p>
              </div>
              <div className="text-center p-4 bg-secondary rounded-lg">
                <p className="text-3xl font-bold text-yellow-500">{todayStats.blockedSteps}</p>
                <p className="text-sm text-muted-foreground">Blocked Steps</p>
              </div>
              <div className="text-center p-4 bg-secondary rounded-lg">
                <p className="text-3xl font-bold text-green-500">{todayStats.readyToShip}</p>
                <p className="text-sm text-muted-foreground">Ready to Ship</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default Index;
