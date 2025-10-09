import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { NavigationHeader } from "@/components/NavigationHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { TrendingUp, Users, Package, DollarSign } from "lucide-react";

const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884D8", "#82CA9D"];

export default function CustomerReports() {
  const [dateRange, setDateRange] = useState("90");
  const [gstFilter, setGstFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [salesByCustomer, setSalesByCustomer] = useState<any[]>([]);
  const [salesByLocation, setSalesByLocation] = useState<any[]>([]);
  const [salesByItem, setSalesByItem] = useState<any[]>([]);
  const [stats, setStats] = useState({
    totalCustomers: 0,
    totalSales: 0,
    domesticSales: 0,
    exportSales: 0
  });

  useEffect(() => {
    loadReportData();
  }, [dateRange, gstFilter]);

  const loadReportData = async () => {
    setLoading(true);
    try {
      const daysAgo = new Date();
      daysAgo.setDate(daysAgo.getDate() - parseInt(dateRange));
      const dateFilter = daysAgo.toISOString().split('T')[0];

      // Sales by Customer
      const { data: invoices } = await supabase
        .from("invoices")
        .select(`
          total_amount,
          customer_master!inner(
            customer_name,
            gst_type,
            city,
            state,
            country
          )
        `)
        .gte("invoice_date", dateFilter);

      // Apply GST filter
      let filteredInvoices = invoices || [];
      if (gstFilter !== "all") {
        filteredInvoices = filteredInvoices.filter(
          (inv: any) => inv.customer_master?.gst_type === gstFilter
        );
      }

      // Aggregate by customer
      const customerMap = new Map<string, number>();
      filteredInvoices.forEach((inv: any) => {
        const customer = inv.customer_master?.customer_name || "Unknown";
        const current = customerMap.get(customer) || 0;
        customerMap.set(customer, current + Number(inv.total_amount));
      });

      const customerData = Array.from(customerMap.entries())
        .map(([name, amount]) => ({ name, amount }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 10);

      setSalesByCustomer(customerData);

      // Aggregate by location (city)
      const cityMap = new Map<string, number>();
      filteredInvoices.forEach((inv: any) => {
        const city = inv.customer_master?.city || "Unknown";
        const current = cityMap.get(city) || 0;
        cityMap.set(city, current + Number(inv.total_amount));
      });

      const cityData = Array.from(cityMap.entries())
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 8);

      setSalesByLocation(cityData);

      // Get sales by item from invoice items
      const { data: invoiceItems } = await supabase
        .from("invoice_items")
        .select(`
          description,
          amount,
          invoice_items!inner(
            invoices!inner(invoice_date)
          )
        `)
        .gte("invoices.invoice_date", dateFilter);

      const itemMap = new Map<string, number>();
      invoiceItems?.forEach((item: any) => {
        const itemName = item.description || "Unknown";
        const current = itemMap.get(itemName) || 0;
        itemMap.set(itemName, current + Number(item.amount));
      });

      const itemData = Array.from(itemMap.entries())
        .map(([name, amount]) => ({ name, amount }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 10);

      setSalesByItem(itemData);

      // Calculate stats
      const totalSales = filteredInvoices.reduce((sum, inv) => sum + Number(inv.total_amount), 0);
      const domesticSales = filteredInvoices
        .filter((inv: any) => inv.customer_master?.gst_type === "domestic")
        .reduce((sum, inv) => sum + Number(inv.total_amount), 0);
      const exportSales = filteredInvoices
        .filter((inv: any) => inv.customer_master?.gst_type === "export")
        .reduce((sum, inv) => sum + Number(inv.total_amount), 0);

      const { data: customers, count } = await supabase
        .from("customer_master")
        .select("id", { count: "exact" });

      setStats({
        totalCustomers: count || 0,
        totalSales,
        domesticSales,
        exportSales
      });

    } catch (error: any) {
      console.error("Error loading report data:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <NavigationHeader 
        title="Customer Reports" 
        subtitle="Sales analysis by customer, location, and product"
      />
      
      <div className="p-6 space-y-6">
        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle>Filters</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Date Range</Label>
                <Select value={dateRange} onValueChange={setDateRange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30">Last 30 Days</SelectItem>
                    <SelectItem value="60">Last 60 Days</SelectItem>
                    <SelectItem value="90">Last 90 Days</SelectItem>
                    <SelectItem value="180">Last 6 Months</SelectItem>
                    <SelectItem value="365">Last Year</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>GST Type</Label>
                <Select value={gstFilter} onValueChange={setGstFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="domestic">Domestic</SelectItem>
                    <SelectItem value="export">Export</SelectItem>
                    <SelectItem value="not_applicable">Not Applicable</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Customers</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{loading ? "—" : stats.totalCustomers}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Sales</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${loading ? "—" : stats.totalSales.toFixed(0)}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Domestic Sales</CardTitle>
              <TrendingUp className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                ${loading ? "—" : stats.domesticSales.toFixed(0)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Export Sales</CardTitle>
              <Package className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">
                ${loading ? "—" : stats.exportSales.toFixed(0)}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Top 10 Customers by Sales</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-sm text-muted-foreground">Loading...</p>
              ) : salesByCustomer.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No data available</p>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={salesByCustomer}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                    <YAxis />
                    <Tooltip formatter={(value: number) => `$${value.toFixed(0)}`} />
                    <Bar dataKey="amount" fill="#8884d8" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Sales by City</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-sm text-muted-foreground">Loading...</p>
              ) : salesByLocation.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No data available</p>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={salesByLocation}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={(entry) => entry.name}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {salesByLocation.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => `$${value.toFixed(0)}`} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Top 10 Items by Sales</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : salesByItem.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No data available</p>
            ) : (
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={salesByItem} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis dataKey="name" type="category" width={150} />
                  <Tooltip formatter={(value: number) => `$${value.toFixed(0)}`} />
                  <Bar dataKey="amount" fill="#82ca9d" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
