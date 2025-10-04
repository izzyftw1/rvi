import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
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
  ClipboardCheck
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const Index = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setUser(session.user);
        loadProfile(session.user.id);
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
      } else {
        navigate("/auth");
      }
    });

    return () => subscription.unsubscribe();
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
              <Button className="h-auto py-4 flex-col gap-2">
                <QrCode className="h-6 w-6" />
                <span className="text-sm">Scan</span>
              </Button>
              <Button variant="secondary" className="h-auto py-4 flex-col gap-2">
                <Search className="h-6 w-6" />
                <span className="text-sm">Search</span>
              </Button>
              <Button variant="secondary" className="h-auto py-4 flex-col gap-2">
                <Box className="h-6 w-6" />
                <span className="text-sm">New WO</span>
              </Button>
              <Button variant="secondary" className="h-auto py-4 flex-col gap-2">
                <BarChart3 className="h-6 w-6" />
                <span className="text-sm">Reports</span>
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
              title="Stores"
              icon={Package}
              wipPcs={145}
              wipKg={2340.5}
              avgWaitTime="4.2h"
              alerts={2}
            />
            <DepartmentCard
              title="Production"
              icon={Factory}
              wipPcs={89}
              wipKg={1567.3}
              avgWaitTime="6.8h"
              alerts={1}
            />
            <DepartmentCard
              title="Quality Control"
              icon={CheckCircle2}
              wipPcs={34}
              wipKg={589.2}
              avgWaitTime="2.1h"
            />
            <DepartmentCard
              title="Packing"
              icon={Box}
              wipPcs={67}
              wipKg={1123.8}
              avgWaitTime="3.5h"
            />
            <DepartmentCard
              title="Job Work"
              icon={Truck}
              wipPcs={23}
              wipKg={456.7}
              avgWaitTime="12.3h"
            />
            <DepartmentCard
              title="Dispatch"
              icon={Truck}
              wipPcs={15}
              wipKg={298.4}
              avgWaitTime="1.2h"
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
                <p className="text-3xl font-bold text-primary">12</p>
                <p className="text-sm text-muted-foreground">WOs Due Today</p>
              </div>
              <div className="text-center p-4 bg-secondary rounded-lg">
                <p className="text-3xl font-bold text-danger">3</p>
                <p className="text-sm text-muted-foreground">Late Items</p>
              </div>
              <div className="text-center p-4 bg-secondary rounded-lg">
                <p className="text-3xl font-bold text-warning">5</p>
                <p className="text-sm text-muted-foreground">Blocked Steps</p>
              </div>
              <div className="text-center p-4 bg-secondary rounded-lg">
                <p className="text-3xl font-bold text-success">8</p>
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
