import { NavigationHeader } from "@/components/NavigationHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { OverdueInvoicesWidget } from "@/components/finance/OverdueInvoicesWidget";
import { CashflowProjection } from "@/components/finance/CashflowProjection";
import { FollowupsTodayWidget } from "@/components/finance/FollowupsTodayWidget";
import { DollarSign, TrendingUp, AlertCircle, Clock, Home } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";

export default function FinanceDashboard() {
  const [stats, setStats] = useState({
    totalAR: 0,
    overdueAR: 0,
    dso: 0,
    cashCollected30: 0,
    cashCollected90: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardStats();
  }, []);

  const loadDashboardStats = async () => {
    try {
      // Total AR (all unpaid invoices)
      const { data: arData } = await supabase
        .from("invoices")
        .select("balance_amount")
        .in("status", ["issued", "part_paid", "overdue"]);
      
      const totalAR = arData?.reduce((sum, inv) => sum + Number(inv.balance_amount), 0) || 0;

      // Overdue AR
      const { data: overdueData } = await supabase
        .from("invoices")
        .select("balance_amount")
        .eq("status", "overdue");
      
      const overdueAR = overdueData?.reduce((sum, inv) => sum + Number(inv.balance_amount), 0) || 0;

      // Cash collected last 30 days
      const date30DaysAgo = new Date();
      date30DaysAgo.setDate(date30DaysAgo.getDate() - 30);
      
      const { data: payments30 } = await supabase
        .from("payments")
        .select("amount")
        .gte("payment_date", date30DaysAgo.toISOString().split('T')[0]);
      
      const cashCollected30 = payments30?.reduce((sum, p) => sum + Number(p.amount), 0) || 0;

      // Cash collected last 90 days
      const date90DaysAgo = new Date();
      date90DaysAgo.setDate(date90DaysAgo.getDate() - 90);
      
      const { data: payments90 } = await supabase
        .from("payments")
        .select("amount")
        .gte("payment_date", date90DaysAgo.toISOString().split('T')[0]);
      
      const cashCollected90 = payments90?.reduce((sum, p) => sum + Number(p.amount), 0) || 0;

      // DSO calculation (simplified: Total AR / (Total Sales / 90))
      const { data: recentInvoices } = await supabase
        .from("invoices")
        .select("total_amount")
        .gte("invoice_date", date90DaysAgo.toISOString().split('T')[0]);
      
      const totalSales90 = recentInvoices?.reduce((sum, inv) => sum + Number(inv.total_amount), 0) || 0;
      const avgDailySales = totalSales90 / 90;
      const dso = avgDailySales > 0 ? Math.round(totalAR / avgDailySales) : 0;

      setStats({
        totalAR,
        overdueAR,
        dso,
        cashCollected30,
        cashCollected90
      });
    } catch (error: any) {
      console.error("Error loading dashboard stats:", error);
    } finally {
      setLoading(false);
    }
  };

  // Mock trend data for charts
  const arTrendData = [
    { month: 'Jan', ar: 45000, overdue: 12000 },
    { month: 'Feb', ar: 52000, overdue: 15000 },
    { month: 'Mar', ar: 48000, overdue: 11000 },
    { month: 'Apr', ar: 61000, overdue: 18000 },
    { month: 'May', ar: 55000, overdue: 14000 },
    { month: 'Jun', ar: stats.totalAR, overdue: stats.overdueAR }
  ];

  const collectionTrendData = [
    { week: 'W1', collected: 12000 },
    { week: 'W2', collected: 15000 },
    { week: 'W3', collected: 11000 },
    { week: 'W4', collected: 13000 }
  ];

  return (
    <div className="min-h-screen bg-background">
      <NavigationHeader title="Finance Dashboard" subtitle="Accounts Receivable & Cash Management" />
      
      <div className="p-6 space-y-6">
        {/* Breadcrumb */}
        <div className="flex items-center justify-between">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link to="/">
                    <Home className="h-4 w-4" />
                  </Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Finance Dashboard</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link to="/finance/invoices/create">Create Invoices</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/finance/reports">View Reports</Link>
            </Button>
          </div>
        </div>
        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total AR</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${loading ? "—" : stats.totalAR.toFixed(0)}</div>
              <p className="text-xs text-muted-foreground">Outstanding receivables</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Overdue AR</CardTitle>
              <AlertCircle className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">
                ${loading ? "—" : stats.overdueAR.toFixed(0)}
              </div>
              <p className="text-xs text-muted-foreground">
                {loading ? "—" : ((stats.overdueAR / stats.totalAR) * 100).toFixed(1)}% of total AR
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">DSO</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{loading ? "—" : stats.dso} days</div>
              <p className="text-xs text-muted-foreground">Days Sales Outstanding</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Cash Collected (30d)</CardTitle>
              <TrendingUp className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                ${loading ? "—" : stats.cashCollected30.toFixed(0)}
              </div>
              <p className="text-xs text-muted-foreground">
                Last 90d: ${loading ? "—" : stats.cashCollected90.toFixed(0)}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Main Widgets */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <OverdueInvoicesWidget />
          <FollowupsTodayWidget />
        </div>

        {/* Trend Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>AR Trend</CardTitle>
              <CardDescription>Total AR vs Overdue (Last 6 months)</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={arTrendData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="month" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }}
                  />
                  <Bar dataKey="ar" fill="hsl(var(--primary))" name="Total AR" />
                  <Bar dataKey="overdue" fill="hsl(var(--destructive))" name="Overdue" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Collection Trend</CardTitle>
              <CardDescription>Cash collected (Last 4 weeks)</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={collectionTrendData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="week" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="collected" 
                    stroke="hsl(var(--chart-2))" 
                    strokeWidth={2} 
                    name="Collected"
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Cashflow Projection */}
        <CashflowProjection />

        {/* Quick Links */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>
              Common finance and AR management tasks
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>→ Create invoices from approved Sales Orders</li>
              <li>→ Record payments and allocate to invoices</li>
              <li>→ Run aging reports (Current, 1-15, 16-30, 31-45, 46-60, 60+ days)</li>
              <li>→ Set reminders and log follow-up outcomes</li>
              <li>→ Manage recovery stages: Friendly → Firm → Final Notice → Hold Shipments → Legal</li>
              <li>→ Track expected vs. actual cashflow with weekly variance analysis</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
