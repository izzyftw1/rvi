import { NavigationHeader } from "@/components/NavigationHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, Legend, ComposedChart } from "recharts";
import { convertToINR, formatINR } from "@/lib/currencyConverter";
import { Home, Download, FileSpreadsheet, FileText, TrendingUp, DollarSign, Users, Package, Clock, AlertCircle } from "lucide-react";
import { downloadExcel, downloadDashboardPDF } from "@/lib/exportHelpers";
import { useToast } from "@/hooks/use-toast";
import { format, startOfMonth, startOfQuarter, startOfYear, endOfMonth, endOfQuarter, endOfYear } from "date-fns";

interface DashboardFilters {
  customerId: string;
  region: string;
  dateFrom: string;
  dateTo: string;
  currency: string;
  itemCode: string;
}

export default function FinanceDashboard() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<DashboardFilters>({
    customerId: 'all',
    region: 'all',
    dateFrom: format(startOfYear(new Date()), 'yyyy-MM-dd'),
    dateTo: format(new Date(), 'yyyy-MM-dd'),
    currency: 'all',
    itemCode: 'all'
  });

  // Filter options
  const [customers, setCustomers] = useState<any[]>([]);
  const [regions, setRegions] = useState<string[]>([]);
  const [items, setItems] = useState<any[]>([]);

  // Dashboard data
  const [revenueStats, setRevenueStats] = useState({
    mtd: 0,
    qtd: 0,
    ytd: 0
  });
  const [topCustomers, setTopCustomers] = useState<any[]>([]);
  const [topItems, setTopItems] = useState<any[]>([]);
  const [agingData, setAgingData] = useState<any[]>([]);
  const [advanceStats, setAdvanceStats] = useState({
    totalAdvance: 0,
    percentOfSales: 0
  });
  const [cashflowData, setCashflowData] = useState<any[]>([]);
  const [regionData, setRegionData] = useState<any[]>([]);
  const [profitabilityData, setProfitabilityData] = useState<any[]>([]);

  useEffect(() => {
    loadFilterOptions();
  }, []);

  useEffect(() => {
    loadDashboardData();
  }, [filters]);

  const loadFilterOptions = async () => {
    try {
      // Load customers
      const { data: customersData } = await supabase
        .from("customer_master")
        .select("id, customer_name, city, state")
        .order("customer_name");
      
      setCustomers(customersData || []);

      // Extract unique regions
      const uniqueRegions = [...new Set(customersData?.map(c => c.city).filter(Boolean))];
      setRegions(uniqueRegions as string[]);

      // Load items
      const { data: itemsData } = await supabase
        .from("item_master")
        .select("id, item_code, item_name")
        .order("item_code");
      
      setItems(itemsData || []);
    } catch (error) {
      console.error("Error loading filter options:", error);
    }
  };

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadRevenueStats(),
        loadTopCustomers(),
        loadTopItems(),
        loadAgingData(),
        loadAdvanceStats(),
        loadCashflowData(),
        loadRegionData(),
        loadProfitabilityData()
      ]);
    } catch (error) {
      console.error("Error loading dashboard:", error);
      toast({
        title: "Error",
        description: "Failed to load dashboard data",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const loadRevenueStats = async () => {
    try {
      const today = new Date();
      const monthStart = startOfMonth(today);
      const quarterStart = startOfQuarter(today);
      const yearStart = startOfYear(today);

      // Build query with filters
      let query = supabase
        .from("invoices")
        .select("total_amount, currency, invoice_date, customer_id, customer_master!inner(city)")
        .eq("status", "paid")
        .gte("invoice_date", filters.dateFrom)
        .lte("invoice_date", filters.dateTo);

      if (filters.customerId !== 'all') {
        query = query.eq("customer_id", filters.customerId);
      }

      if (filters.region !== 'all') {
        query = query.eq("customer_master.city", filters.region);
      }

      const { data } = await query;

      const calculateRevenue = (startDate: Date) => {
        return data?.reduce((sum, inv) => {
          const invDate = new Date(inv.invoice_date);
          if (invDate >= startDate) {
            const amount = filters.currency === 'all' 
              ? convertToINR(Number(inv.total_amount), inv.currency)
              : inv.currency === filters.currency 
                ? Number(inv.total_amount) 
                : 0;
            return sum + amount;
          }
          return sum;
        }, 0) || 0;
      };

      setRevenueStats({
        mtd: calculateRevenue(monthStart),
        qtd: calculateRevenue(quarterStart),
        ytd: calculateRevenue(yearStart)
      });
    } catch (error) {
      console.error("Error loading revenue stats:", error);
    }
  };

  const loadTopCustomers = async () => {
    try {
      let query = supabase
        .from("invoices")
        .select(`
          customer_id,
          total_amount,
          currency,
          customer_master!inner(customer_name, city)
        `)
        .eq("status", "paid")
        .gte("invoice_date", filters.dateFrom)
        .lte("invoice_date", filters.dateTo);

      if (filters.customerId !== 'all') {
        query = query.eq("customer_id", filters.customerId);
      }

      if (filters.region !== 'all') {
        query = query.eq("customer_master.city", filters.region);
      }

      const { data } = await query;

      // Aggregate by customer
      const customerMap = new Map();
      data?.forEach((inv: any) => {
        const amount = filters.currency === 'all'
          ? convertToINR(Number(inv.total_amount), inv.currency)
          : inv.currency === filters.currency
            ? Number(inv.total_amount)
            : 0;

        if (amount > 0) {
          const existing = customerMap.get(inv.customer_id);
          if (existing) {
            existing.revenue += amount;
          } else {
            customerMap.set(inv.customer_id, {
              customer_name: inv.customer_master.customer_name,
              revenue: amount
            });
          }
        }
      });

      const topCustomersArray = Array.from(customerMap.values())
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5);

      setTopCustomers(topCustomersArray);
    } catch (error) {
      console.error("Error loading top customers:", error);
    }
  };

  const loadTopItems = async () => {
    try {
      let query = supabase
        .from("sales_order_items")
        .select(`
          item_code,
          quantity,
          sales_orders!inner(
            status,
            created_at,
            customer_id,
            customer_master!inner(city)
          )
        `)
        .eq("sales_orders.status", "approved")
        .gte("sales_orders.created_at", filters.dateFrom)
        .lte("sales_orders.created_at", filters.dateTo);

      if (filters.customerId !== 'all') {
        query = query.eq("sales_orders.customer_id", filters.customerId);
      }

      if (filters.region !== 'all') {
        query = query.eq("sales_orders.customer_master.city", filters.region);
      }

      if (filters.itemCode !== 'all') {
        query = query.eq("item_code", filters.itemCode);
      }

      const { data } = await query;

      // Aggregate by item
      const itemMap = new Map();
      data?.forEach((item: any) => {
        const existing = itemMap.get(item.item_code);
        if (existing) {
          existing.quantity += Number(item.quantity);
        } else {
          itemMap.set(item.item_code, {
            item_code: item.item_code,
            quantity: Number(item.quantity)
          });
        }
      });

      const topItemsArray = Array.from(itemMap.values())
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 5);

      setTopItems(topItemsArray);
    } catch (error) {
      console.error("Error loading top items:", error);
    }
  };

  const loadAgingData = async () => {
    try {
      let query = supabase
        .from("invoices")
        .select(`
          balance_amount,
          currency,
          due_date,
          customer_id,
          customer_master!inner(city)
        `)
        .in("status", ["issued", "part_paid", "overdue"]);

      if (filters.customerId !== 'all') {
        query = query.eq("customer_id", filters.customerId);
      }

      if (filters.region !== 'all') {
        query = query.eq("customer_master.city", filters.region);
      }

      const { data } = await query;

      const today = new Date();
      const aging = {
        current: 0,
        days30: 0,
        days60: 0,
        days90: 0,
        over90: 0
      };

      data?.forEach((inv: any) => {
        const amount = filters.currency === 'all'
          ? convertToINR(Number(inv.balance_amount), inv.currency)
          : inv.currency === filters.currency
            ? Number(inv.balance_amount)
            : 0;

        if (amount > 0) {
          const dueDate = new Date(inv.due_date);
          const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));

          if (daysOverdue < 0) {
            aging.current += amount;
          } else if (daysOverdue <= 30) {
            aging.days30 += amount;
          } else if (daysOverdue <= 60) {
            aging.days60 += amount;
          } else if (daysOverdue <= 90) {
            aging.days90 += amount;
          } else {
            aging.over90 += amount;
          }
        }
      });

      setAgingData([
        { name: "Current", value: aging.current },
        { name: "0-30 Days", value: aging.days30 },
        { name: "31-60 Days", value: aging.days60 },
        { name: "61-90 Days", value: aging.days90 },
        { name: "90+ Days", value: aging.over90 }
      ]);
    } catch (error) {
      console.error("Error loading aging data:", error);
    }
  };

  const loadAdvanceStats = async () => {
    try {
      let query = supabase
        .from("sales_orders")
        .select(`
          advance_payment,
          items,
          customer_id,
          customer_master!inner(city)
        `)
        .eq("status", "approved")
        .gte("created_at", filters.dateFrom)
        .lte("created_at", filters.dateTo);

      if (filters.customerId !== 'all') {
        query = query.eq("customer_id", filters.customerId);
      }

      if (filters.region !== 'all') {
        query = query.eq("customer_master.city", filters.region);
      }

      const { data } = await query;

      let totalAdvance = 0;
      let totalSales = 0;

      data?.forEach((so: any) => {
        // Calculate total sales from items
        const soTotal = so.items?.reduce((sum: number, item: any) => {
          return sum + (Number(item.quantity) * Number(item.rate));
        }, 0) || 0;
        totalSales += soTotal;

        // Calculate advance
        if (so.advance_payment) {
          const advPayment = so.advance_payment;
          if (advPayment.calculated_amount) {
            totalAdvance += Number(advPayment.calculated_amount);
          }
        }
      });

      setAdvanceStats({
        totalAdvance,
        percentOfSales: totalSales > 0 ? (totalAdvance / totalSales) * 100 : 0
      });
    } catch (error) {
      console.error("Error loading advance stats:", error);
    }
  };

  const loadCashflowData = async () => {
    try {
      // Get expected from invoices
      const { data: invoices } = await supabase
        .from("invoices")
        .select("expected_payment_date, balance_amount, currency")
        .in("status", ["issued", "part_paid"])
        .not("expected_payment_date", "is", null)
        .gte("expected_payment_date", filters.dateFrom)
        .lte("expected_payment_date", filters.dateTo);

      // Get actual from payments
      const { data: payments } = await supabase
        .from("payments")
        .select("payment_date, amount, invoices!inner(currency)")
        .gte("payment_date", filters.dateFrom)
        .lte("payment_date", filters.dateTo);

      // Aggregate by month
      const monthlyMap = new Map();

      invoices?.forEach((inv: any) => {
        const month = format(new Date(inv.expected_payment_date), 'MMM yyyy');
        const amount = filters.currency === 'all'
          ? convertToINR(Number(inv.balance_amount), inv.currency)
          : inv.currency === filters.currency
            ? Number(inv.balance_amount)
            : 0;

        const existing = monthlyMap.get(month);
        if (existing) {
          existing.expected += amount;
        } else {
          monthlyMap.set(month, { month, expected: amount, actual: 0 });
        }
      });

      payments?.forEach((pay: any) => {
        const month = format(new Date(pay.payment_date), 'MMM yyyy');
        const currency = pay.invoices?.currency || 'INR';
        const amount = filters.currency === 'all'
          ? convertToINR(Number(pay.amount), currency)
          : currency === filters.currency
            ? Number(pay.amount)
            : 0;

        const existing = monthlyMap.get(month);
        if (existing) {
          existing.actual += amount;
        } else {
          monthlyMap.set(month, { month, expected: 0, actual: amount });
        }
      });

      setCashflowData(Array.from(monthlyMap.values()).sort((a, b) => 
        new Date(a.month).getTime() - new Date(b.month).getTime()
      ));
    } catch (error) {
      console.error("Error loading cashflow data:", error);
    }
  };

  const loadRegionData = async () => {
    try {
      let query = supabase
        .from("invoices")
        .select(`
          total_amount,
          currency,
          customer_master!inner(city, state)
        `)
        .eq("status", "paid")
        .gte("invoice_date", filters.dateFrom)
        .lte("invoice_date", filters.dateTo);

      if (filters.customerId !== 'all') {
        query = query.eq("customer_id", filters.customerId);
      }

      const { data } = await query;

      const regionMap = new Map();
      data?.forEach((inv: any) => {
        const region = inv.customer_master?.city || "Unknown";
        const amount = filters.currency === 'all'
          ? convertToINR(Number(inv.total_amount), inv.currency)
          : inv.currency === filters.currency
            ? Number(inv.total_amount)
            : 0;

        const existing = regionMap.get(region);
        if (existing) {
          existing.revenue += amount;
        } else {
          regionMap.set(region, { region, revenue: amount });
        }
      });

      const regionArray = Array.from(regionMap.values())
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10);

      setRegionData(regionArray);
    } catch (error) {
      console.error("Error loading region data:", error);
    }
  };

  const loadProfitabilityData = async () => {
    try {
      // Get work orders with costs
      const { data: workOrders } = await supabase
        .from("work_orders")
        .select(`
          id,
          created_at,
          quantity,
          financial_snapshot
        `)
        .not("financial_snapshot", "is", null)
        .gte("created_at", filters.dateFrom)
        .lte("created_at", filters.dateTo);

      // Aggregate by month
      const monthlyMap = new Map();

      workOrders?.forEach((wo: any) => {
        const month = format(new Date(wo.created_at), 'MMM yyyy');
        const snapshot = wo.financial_snapshot;

        if (snapshot) {
          const existing = monthlyMap.get(month);
          const scrapPct = snapshot.scrap_percentage || 0;
          const materialCostPct = snapshot.material_cost_percentage || 0;
          const labourCostPct = snapshot.labour_cost_percentage || 0;

          if (existing) {
            existing.count++;
            existing.scrapPct += scrapPct;
            existing.materialCostPct += materialCostPct;
            existing.labourCostPct += labourCostPct;
          } else {
            monthlyMap.set(month, {
              month,
              count: 1,
              scrapPct,
              materialCostPct,
              labourCostPct
            });
          }
        }
      });

      // Calculate averages
      const profitArray = Array.from(monthlyMap.values()).map(item => ({
        month: item.month,
        scrapPct: item.scrapPct / item.count,
        materialCostPct: item.materialCostPct / item.count,
        labourCostPct: item.labourCostPct / item.count
      })).sort((a, b) => new Date(a.month).getTime() - new Date(b.month).getTime());

      setProfitabilityData(profitArray);
    } catch (error) {
      console.error("Error loading profitability data:", error);
    }
  };

  const handleExportExcel = () => {
    const exportData = [
      { section: "Revenue Stats", mtd: revenueStats.mtd, qtd: revenueStats.qtd, ytd: revenueStats.ytd },
      ...topCustomers.map(c => ({ section: "Top Customers", ...c })),
      ...topItems.map(i => ({ section: "Top Items", ...i })),
      ...agingData.map(a => ({ section: "Aging", ...a })),
      { section: "Advance", total: advanceStats.totalAdvance, percent: advanceStats.percentOfSales }
    ];

    downloadExcel(exportData, 'Finance_Dashboard', 'Analytics');
    toast({
      title: "Export Successful",
      description: "Dashboard data exported to Excel"
    });
  };

  const handleExportPDF = () => {
    const stats = {
      'Revenue MTD': formatINR(revenueStats.mtd),
      'Revenue QTD': formatINR(revenueStats.qtd),
      'Revenue YTD': formatINR(revenueStats.ytd),
      'Advance Collected': formatINR(advanceStats.totalAdvance),
      'Advance %': `${advanceStats.percentOfSales.toFixed(1)}%`
    };

    const charts = [
      { title: "Top 5 Customers", data: topCustomers },
      { title: "Top 5 Items", data: topItems },
      { title: "Receivables Aging", data: agingData },
      { title: "Region-wise Revenue", data: regionData }
    ];

    downloadDashboardPDF('Finance Dashboard', stats, charts);
    toast({
      title: "Export Successful",
      description: "Dashboard exported to PDF"
    });
  };

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

  return (
    <div className="min-h-screen bg-background">
      <NavigationHeader title="Finance Analytics Hub" subtitle="Real-time Revenue & Performance Insights" />
      
      <div className="p-6 space-y-6">
        {/* Breadcrumb & Actions */}
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
            <Button variant="outline" onClick={handleExportExcel}>
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Export Excel
            </Button>
            <Button variant="outline" onClick={handleExportPDF}>
              <FileText className="h-4 w-4 mr-2" />
              Export PDF
            </Button>
          </div>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle>Dashboard Filters</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <div>
                <Label>Customer</Label>
                <Select value={filters.customerId} onValueChange={(v) => setFilters({...filters, customerId: v})}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Customers</SelectItem>
                    {customers.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.customer_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Region</Label>
                <Select value={filters.region} onValueChange={(v) => setFilters({...filters, region: v})}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Regions</SelectItem>
                    {regions.map(r => (
                      <SelectItem key={r} value={r}>{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Currency</Label>
                <Select value={filters.currency} onValueChange={(v) => setFilters({...filters, currency: v})}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All (INR)</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="INR">INR</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Item</Label>
                <Select value={filters.itemCode} onValueChange={(v) => setFilters({...filters, itemCode: v})}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Items</SelectItem>
                    {items.map(i => (
                      <SelectItem key={i.id} value={i.item_code}>{i.item_code}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Date From</Label>
                <Input 
                  type="date" 
                  value={filters.dateFrom} 
                  onChange={(e) => setFilters({...filters, dateFrom: e.target.value})}
                />
              </div>
              <div>
                <Label>Date To</Label>
                <Input 
                  type="date" 
                  value={filters.dateTo} 
                  onChange={(e) => setFilters({...filters, dateTo: e.target.value})}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Revenue KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Revenue MTD</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{loading ? "—" : formatINR(revenueStats.mtd)}</div>
              <p className="text-xs text-muted-foreground">Month to Date</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Revenue QTD</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{loading ? "—" : formatINR(revenueStats.qtd)}</div>
              <p className="text-xs text-muted-foreground">Quarter to Date</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Revenue YTD</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{loading ? "—" : formatINR(revenueStats.ytd)}</div>
              <p className="text-xs text-muted-foreground">Year to Date</p>
            </CardContent>
          </Card>
        </div>

        {/* Advance Payment Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Advance Collected</CardTitle>
              <DollarSign className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {loading ? "—" : formatINR(advanceStats.totalAdvance)}
              </div>
              <p className="text-xs text-muted-foreground">
                {advanceStats.percentOfSales.toFixed(1)}% of total sales
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Top Performers */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Top 5 Customers by Revenue</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={topCustomers} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" className="text-xs" />
                  <YAxis dataKey="customer_name" type="category" width={100} className="text-xs" />
                  <Tooltip 
                    formatter={(value: number) => formatINR(value)}
                    contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }}
                  />
                  <Bar dataKey="revenue" fill="hsl(var(--primary))" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Top 5 Items by Sales Quantity</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={topItems}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="item_code" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }}
                  />
                  <Bar dataKey="quantity" fill="hsl(var(--chart-2))" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Aging & Cashflow */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Receivables Aging Analysis</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={agingData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={(entry) => `${entry.name}: ${formatINR(entry.value)}`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {agingData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => formatINR(value)} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Expected vs Actual Cashflow</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={cashflowData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="month" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip 
                    formatter={(value: number) => formatINR(value)}
                    contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }}
                  />
                  <Legend />
                  <Bar dataKey="expected" fill="hsl(var(--chart-1))" name="Expected" />
                  <Bar dataKey="actual" fill="hsl(var(--chart-2))" name="Actual" />
                </ComposedChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Region & Profitability */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Region-wise Revenue Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={regionData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" className="text-xs" />
                  <YAxis dataKey="region" type="category" width={80} className="text-xs" />
                  <Tooltip 
                    formatter={(value: number) => formatINR(value)}
                    contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }}
                  />
                  <Bar dataKey="revenue" fill="hsl(var(--chart-3))" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Profitability Trend</CardTitle>
              <CardDescription>Cost percentages over time</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={profitabilityData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="month" className="text-xs" />
                  <YAxis className="text-xs" label={{ value: '%', angle: -90, position: 'insideLeft' }} />
                  <Tooltip 
                    formatter={(value: number) => `${value.toFixed(2)}%`}
                    contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="scrapPct" stroke="hsl(var(--destructive))" name="Scrap %" strokeWidth={2} />
                  <Line type="monotone" dataKey="materialCostPct" stroke="hsl(var(--chart-1))" name="Material Cost %" strokeWidth={2} />
                  <Line type="monotone" dataKey="labourCostPct" stroke="hsl(var(--chart-2))" name="Labour Cost %" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}