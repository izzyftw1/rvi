
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
import { Home, Download, FileSpreadsheet, FileText, TrendingUp, DollarSign, Users, Package, Clock, AlertCircle, Lock } from "lucide-react";
import { downloadExcel, downloadDashboardPDF } from "@/lib/exportHelpers";
import { useToast } from "@/hooks/use-toast";
import { format, startOfMonth, startOfQuarter, startOfYear, endOfMonth, endOfQuarter, endOfYear } from "date-fns";
import { DrillDownModal } from "@/components/finance/DrillDownModal";
import { NCRCostImpactWidget } from "@/components/finance/NCRCostImpactWidget";
import { OutstandingBreakdownWidget } from "@/components/finance/OutstandingBreakdownWidget";
import { Badge } from "@/components/ui/badge";

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

  // Dashboard data — FIX #5: separate billed vs collected
  const [billedStats, setBilledStats] = useState({ mtd: 0, qtd: 0, ytd: 0 });
  const [collectedStats, setCollectedStats] = useState({ mtd: 0, qtd: 0, ytd: 0 });
  const [topCustomers, setTopCustomers] = useState<any[]>([]);
  const [topItems, setTopItems] = useState<any[]>([]);
  // FIX #7: Use same aging buckets as Aging.tsx page
  const [agingData, setAgingData] = useState<any[]>([]);
  const [advanceStats, setAdvanceStats] = useState({
    totalAdvance: 0,
    percentOfSales: 0
  });
  const [cashflowData, setCashflowData] = useState<any[]>([]);
  const [regionData, setRegionData] = useState<any[]>([]);
  const [profitabilityData, setProfitabilityData] = useState<any[]>([]);
  // FIX #62: Period lock status
  const [lockedPeriods, setLockedPeriods] = useState<any[]>([]);

  // Drill-down modal state
  const [drillDownOpen, setDrillDownOpen] = useState(false);
  const [drillDownType, setDrillDownType] = useState<'revenue' | 'customer' | 'item' | 'scrap' | 'region' | 'profitability'>('revenue');
  const [drillDownTitle, setDrillDownTitle] = useState('');
  const [drillDownData, setDrillDownData] = useState<any[]>([]);
  const [drillDownMetadata, setDrillDownMetadata] = useState<any>(null);

  useEffect(() => {
    loadFilterOptions();
    loadLockedPeriods();
  }, []);

  useEffect(() => {
    loadDashboardData();
  }, [filters]);

  // FIX #8: Add realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('finance-dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'invoices' }, () => loadDashboardData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customer_receipts' }, () => loadDashboardData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'receipt_allocations' }, () => loadDashboardData())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [filters]);

  const loadLockedPeriods = async () => {
    const { data } = await supabase
      .from('finance_period_locks')
      .select('*')
      .eq('locked', true)
      .order('period_start', { ascending: false })
      .limit(12);
    setLockedPeriods(data || []);
  };

  const loadFilterOptions = async () => {
    try {
      const { data: customersData } = await supabase
        .from("customer_master")
        .select("id, customer_name, city, state")
        .order("customer_name");
      
      setCustomers(customersData || []);
      const uniqueRegions = [...new Set(customersData?.map(c => c.city).filter(Boolean))];
      setRegions(uniqueRegions as string[]);

      const { data: itemsData } = await supabase
        .from("item_master")
        .select("id, item_code")
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

      // FIX #5: Load ALL non-cancelled invoices for billed revenue
      let query = supabase
        .from("invoices")
        .select("total_amount, currency, invoice_date, customer_id, status, customer_master!inner(city)")
        .not("status", "eq", "draft")
        .not("status", "eq", "cancelled")
        .gte("invoice_date", filters.dateFrom)
        .lte("invoice_date", filters.dateTo);

      if (filters.customerId !== 'all') query = query.eq("customer_id", filters.customerId);
      if (filters.region !== 'all') query = query.eq("customer_master.city", filters.region);

      const { data } = await query;

      const calculateRevenue = (startDate: Date, statusFilter?: string) => {
        return data?.reduce((sum, inv) => {
          const invDate = new Date(inv.invoice_date);
          if (invDate >= startDate) {
            if (statusFilter && inv.status !== statusFilter) return sum;
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

      // Billed = all non-draft/non-cancelled invoices
      setBilledStats({
        mtd: calculateRevenue(monthStart),
        qtd: calculateRevenue(quarterStart),
        ytd: calculateRevenue(yearStart)
      });

      // Collected = only paid invoices
      setCollectedStats({
        mtd: calculateRevenue(monthStart, 'paid'),
        qtd: calculateRevenue(quarterStart, 'paid'),
        ytd: calculateRevenue(yearStart, 'paid')
      });
    } catch (error) {
      console.error("Error loading revenue stats:", error);
    }
  };

  const loadTopCustomers = async () => {
    try {
      // FIX #1: Include all billed invoices, not just paid
      let query = supabase
        .from("invoices")
        .select(`customer_id, total_amount, currency, customer_master!inner(customer_name, city)`)
        .not("status", "eq", "cancelled")
        .not("status", "eq", "draft")
        .gte("invoice_date", filters.dateFrom)
        .lte("invoice_date", filters.dateTo);

      if (filters.customerId !== 'all') query = query.eq("customer_id", filters.customerId);
      if (filters.region !== 'all') query = query.eq("customer_master.city", filters.region);

      const { data } = await query;

      const customerMap = new Map();
      data?.forEach((inv: any) => {
        const amount = filters.currency === 'all'
          ? convertToINR(Number(inv.total_amount), inv.currency)
          : inv.currency === filters.currency ? Number(inv.total_amount) : 0;

        if (amount > 0) {
          const existing = customerMap.get(inv.customer_id);
          if (existing) {
            existing.revenue += amount;
          } else {
            customerMap.set(inv.customer_id, {
              customer_id: inv.customer_id,
              customer_name: inv.customer_master.customer_name,
              revenue: amount
            });
          }
        }
      });

      setTopCustomers(Array.from(customerMap.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 5));
    } catch (error) {
      console.error("Error loading top customers:", error);
    }
  };

  const loadTopItems = async () => {
    try {
      let query = supabase
        .from("sales_order_items")
        .select(`item_code, quantity, sales_orders!inner(status, created_at, customer_id, customer_master!inner(city))`)
        .eq("sales_orders.status", "approved")
        .gte("sales_orders.created_at", filters.dateFrom)
        .lte("sales_orders.created_at", filters.dateTo);

      if (filters.customerId !== 'all') query = query.eq("sales_orders.customer_id", filters.customerId);
      if (filters.region !== 'all') query = query.eq("sales_orders.customer_master.city", filters.region);
      if (filters.itemCode !== 'all') query = query.eq("item_code", filters.itemCode);

      const { data } = await query;

      const itemMap = new Map();
      data?.forEach((item: any) => {
        const existing = itemMap.get(item.item_code);
        if (existing) {
          existing.quantity += Number(item.quantity);
        } else {
          itemMap.set(item.item_code, { item_code: item.item_code, quantity: Number(item.quantity) });
        }
      });

      setTopItems(Array.from(itemMap.values()).sort((a, b) => b.quantity - a.quantity).slice(0, 5));
    } catch (error) {
      console.error("Error loading top items:", error);
    }
  };

  // FIX #7: Use same aging buckets as Aging.tsx page (Current, 1-15, 16-30, 31-45, 46-60, >60)
  const loadAgingData = async () => {
    try {
      let query = supabase
        .from("invoices")
        .select(`balance_amount, currency, due_date, customer_id, status, customer_master!inner(city)`)
        .in("status", ["issued", "part_paid", "overdue"])
        .gt("balance_amount", 0);

      if (filters.customerId !== 'all') query = query.eq("customer_id", filters.customerId);
      if (filters.region !== 'all') query = query.eq("customer_master.city", filters.region);

      const { data } = await query;

      const today = new Date();
      const aging = { current: 0, days15: 0, days30: 0, days45: 0, days60: 0, over60: 0 };

      data?.forEach((inv: any) => {
        const amount = filters.currency === 'all'
          ? convertToINR(Number(inv.balance_amount), inv.currency)
          : inv.currency === filters.currency ? Number(inv.balance_amount) : 0;

        if (amount > 0) {
          const dueDate = new Date(inv.due_date);
          const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));

          if (daysOverdue < 0) aging.current += amount;
          else if (daysOverdue <= 15) aging.days15 += amount;
          else if (daysOverdue <= 30) aging.days30 += amount;
          else if (daysOverdue <= 45) aging.days45 += amount;
          else if (daysOverdue <= 60) aging.days60 += amount;
          else aging.over60 += amount;
        }
      });

      setAgingData([
        { name: "Current", value: aging.current },
        { name: "1-15 Days", value: aging.days15 },
        { name: "16-30 Days", value: aging.days30 },
        { name: "31-45 Days", value: aging.days45 },
        { name: "46-60 Days", value: aging.days60 },
        { name: ">60 Days", value: aging.over60 }
      ]);
    } catch (error) {
      console.error("Error loading aging data:", error);
    }
  };

  const loadAdvanceStats = async () => {
    try {
      let query = supabase
        .from("sales_orders")
        .select(`advance_payment, items, customer_id, customer_master!inner(city)`)
        .eq("status", "approved")
        .gte("created_at", filters.dateFrom)
        .lte("created_at", filters.dateTo);

      if (filters.customerId !== 'all') query = query.eq("customer_id", filters.customerId);
      if (filters.region !== 'all') query = query.eq("customer_master.city", filters.region);

      const { data } = await query;

      let totalAdvance = 0;
      let totalSales = 0;

      data?.forEach((so: any) => {
        const soTotal = so.items?.reduce((sum: number, item: any) => {
          return sum + (Number(item.quantity) * Number(item.rate));
        }, 0) || 0;
        totalSales += soTotal;

        if (so.advance_payment?.calculated_amount) {
          totalAdvance += Number(so.advance_payment.calculated_amount);
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
      const { data: invoices } = await supabase
        .from("invoices")
        .select("expected_payment_date, balance_amount, currency")
        .in("status", ["issued", "part_paid"])
        .not("expected_payment_date", "is", null)
        .gte("expected_payment_date", filters.dateFrom)
        .lte("expected_payment_date", filters.dateTo);

      const { data: payments } = await supabase
        .from("payments")
        .select("payment_date, amount, invoices!inner(currency)")
        .gte("payment_date", filters.dateFrom)
        .lte("payment_date", filters.dateTo);

      const monthlyMap = new Map();

      invoices?.forEach((inv: any) => {
        const month = format(new Date(inv.expected_payment_date), 'MMM yyyy');
        const amount = filters.currency === 'all'
          ? convertToINR(Number(inv.balance_amount), inv.currency)
          : inv.currency === filters.currency ? Number(inv.balance_amount) : 0;

        const existing = monthlyMap.get(month);
        if (existing) existing.expected += amount;
        else monthlyMap.set(month, { month, expected: amount, actual: 0 });
      });

      payments?.forEach((pay: any) => {
        const month = format(new Date(pay.payment_date), 'MMM yyyy');
        const currency = pay.invoices?.currency || 'INR';
        const amount = filters.currency === 'all'
          ? convertToINR(Number(pay.amount), currency)
          : currency === filters.currency ? Number(pay.amount) : 0;

        const existing = monthlyMap.get(month);
        if (existing) existing.actual += amount;
        else monthlyMap.set(month, { month, expected: 0, actual: amount });
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
        .select(`total_amount, currency, customer_master!inner(city, state)`)
        .not("status", "eq", "cancelled")
        .not("status", "eq", "draft")
        .gte("invoice_date", filters.dateFrom)
        .lte("invoice_date", filters.dateTo);

      if (filters.customerId !== 'all') query = query.eq("customer_id", filters.customerId);

      const { data } = await query;

      const regionMap = new Map();
      data?.forEach((inv: any) => {
        const region = inv.customer_master?.city || "Unknown";
        const amount = filters.currency === 'all'
          ? convertToINR(Number(inv.total_amount), inv.currency)
          : inv.currency === filters.currency ? Number(inv.total_amount) : 0;

        const existing = regionMap.get(region);
        if (existing) existing.revenue += amount;
        else regionMap.set(region, { region, revenue: amount });
      });

      setRegionData(Array.from(regionMap.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 10));
    } catch (error) {
      console.error("Error loading region data:", error);
    }
  };

  // FIX #75: Batch profitability query instead of 36 sequential calls
  const loadProfitabilityData = async () => {
    try {
      const { data: workOrders } = await supabase
        .from("work_orders")
        .select(`id, created_at, quantity, financial_snapshot`)
        .not("financial_snapshot", "is", null)
        .gte("created_at", filters.dateFrom)
        .lte("created_at", filters.dateTo);

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
            monthlyMap.set(month, { month, count: 1, scrapPct, materialCostPct, labourCostPct });
          }
        }
      });

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

  // Drill-down handlers
  const handleRevenueDrillDown = async (period: 'mtd' | 'qtd' | 'ytd') => {
    try {
      const { data: invoices } = await supabase
        .from("invoices")
        .select(`invoice_no, invoice_date, total_amount, status, currency, customer_master!inner(customer_name)`)
        .not("status", "eq", "cancelled")
        .not("status", "eq", "draft")
        .order("invoice_date", { ascending: false });

      const drillData = invoices?.map(inv => ({
        date: format(new Date(inv.invoice_date), 'yyyy-MM-dd'),
        invoice_no: inv.invoice_no,
        customer: (inv as any).customer_master?.customer_name || 'N/A',
        amount: inv.total_amount,
        status: inv.status
      })) || [];

      setDrillDownType('revenue');
      setDrillDownTitle(`Revenue Details - ${period.toUpperCase()}`);
      setDrillDownData(drillData);
      setDrillDownMetadata(null);
      setDrillDownOpen(true);
    } catch (error) {
      console.error("Error loading revenue drill-down:", error);
    }
  };

  const handleCustomerDrillDown = async (customerName: string, customerId: string) => {
    try {
      const { data: salesOrders } = await supabase
        .from("sales_orders")
        .select(`items, created_at, total_amount`)
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false });

      const drillData: any[] = [];
      let totalOrders = 0;
      let totalRevenue = 0;

      salesOrders?.forEach(order => {
        const items = typeof order.items === 'string' ? JSON.parse(order.items) : order.items || [];
        const month = format(new Date(order.created_at), 'MMM yyyy');
        
        items.forEach((item: any) => {
          const quantity = Number(item.quantity) || 0;
          const revenue = Number(item.line_amount) || 0;
          drillData.push({ month, item_code: item.item_code, quantity, revenue, avg_price: quantity > 0 ? revenue / quantity : 0 });
          totalRevenue += revenue;
        });
        totalOrders++;
      });

      setDrillDownType('customer');
      setDrillDownTitle(`${customerName} - Sales History`);
      setDrillDownData(drillData);
      setDrillDownMetadata({ total_orders: totalOrders, total_revenue: totalRevenue, avg_order_value: totalOrders > 0 ? totalRevenue / totalOrders : 0 });
      setDrillDownOpen(true);
    } catch (error) {
      console.error("Error loading customer drill-down:", error);
    }
  };

  const handleItemDrillDown = async (itemCode: string) => {
    try {
      const { data: salesOrders } = await supabase
        .from("sales_orders")
        .select(`items, created_at, customer_master!inner(customer_name)`)
        .order("created_at", { ascending: false });

      const drillData: any[] = [];
      let totalQuantity = 0;
      let totalRevenue = 0;

      salesOrders?.forEach(order => {
        const items = typeof order.items === 'string' ? JSON.parse(order.items) : order.items || [];
        const month = format(new Date(order.created_at), 'MMM yyyy');
        
        items.forEach((item: any) => {
          if (item.item_code === itemCode) {
            const quantity = Number(item.quantity) || 0;
            const revenue = Number(item.line_amount) || 0;
            drillData.push({ month, customer: (order as any).customer_master?.customer_name || 'N/A', quantity, revenue, avg_price: quantity > 0 ? revenue / quantity : 0 });
            totalQuantity += quantity;
            totalRevenue += revenue;
          }
        });
      });

      setDrillDownType('item');
      setDrillDownTitle(`${itemCode} - Sales History`);
      setDrillDownData(drillData);
      setDrillDownMetadata({ total_quantity: totalQuantity, total_revenue: totalRevenue, avg_price: totalQuantity > 0 ? totalRevenue / totalQuantity : 0 });
      setDrillDownOpen(true);
    } catch (error) {
      console.error("Error loading item drill-down:", error);
    }
  };

  const handleScrapDrillDown = async () => {
    // FIX #51: Use actual rejection data instead of hardcoded 5%
    try {
      const { data: logs } = await supabase
        .from("daily_production_logs")
        .select("log_date, total_rejection_quantity, actual_quantity, wo_id")
        .gte("log_date", filters.dateFrom)
        .lte("log_date", filters.dateTo)
        .gt("total_rejection_quantity", 0)
        .limit(200);

      const drillData = (logs || []).map(log => ({
        date: log.log_date,
        wo_id: log.wo_id || 'N/A',
        scrap_qty: Number(log.total_rejection_quantity) || 0,
        total_qty: Number(log.actual_quantity) || 0,
        scrap_percent: Number(log.actual_quantity) > 0 
          ? ((Number(log.total_rejection_quantity) / Number(log.actual_quantity)) * 100) 
          : 0
      }));

      const totalScrap = drillData.reduce((sum, r) => sum + r.scrap_qty, 0);
      const totalQty = drillData.reduce((sum, r) => sum + r.total_qty, 0);

      setDrillDownType('scrap');
      setDrillDownTitle('Scrap Analysis Details (from Production Logs)');
      setDrillDownData(drillData);
      setDrillDownMetadata({
        total_scrap: totalScrap,
        avg_scrap_percent: totalQty > 0 ? (totalScrap / totalQty) * 100 : 0,
      });
      setDrillDownOpen(true);
    } catch (error) {
      console.error("Error loading scrap drill-down:", error);
    }
  };

  const handleRegionDrillDown = async (regionName: string) => {
    try {
      const { data: salesOrders } = await supabase
        .from("sales_orders")
        .select(`total_amount, customer_master!inner(customer_name, city, state)`)
        .eq("customer_master.city", regionName)
        .order("created_at", { ascending: false });

      const customerMap = new Map<string, any>();
      salesOrders?.forEach(order => {
        const customer = (order as any).customer_master?.customer_name || 'N/A';
        const revenue = Number(order.total_amount) || 0;
        
        if (!customerMap.has(customer)) {
          customerMap.set(customer, {
            customer,
            city: (order as any).customer_master?.city || 'N/A',
            state: (order as any).customer_master?.state || 'N/A',
            order_count: 0,
            revenue: 0
          });
        }
        
        const entry = customerMap.get(customer);
        entry.order_count++;
        entry.revenue += revenue;
      });

      setDrillDownType('region');
      setDrillDownTitle(`${regionName} - Regional Breakdown`);
      setDrillDownData(Array.from(customerMap.values()));
      setDrillDownMetadata(null);
      setDrillDownOpen(true);
    } catch (error) {
      console.error("Error loading region drill-down:", error);
    }
  };

  const handleProfitabilityDrillDown = async () => {
    // FIX #75: Use the already-loaded profitabilityData instead of 36 sequential API calls
    setDrillDownType('profitability');
    setDrillDownTitle('Monthly Profitability Analysis');
    setDrillDownData(profitabilityData.map(item => ({
      month: item.month,
      material_cost_pct: item.materialCostPct,
      labour_cost_pct: item.labourCostPct,
      scrap_pct: item.scrapPct,
    })));
    setDrillDownMetadata(null);
    setDrillDownOpen(true);
  };

  const handleExportExcel = () => {
    const exportData = [
      { section: "Billed Revenue", mtd: billedStats.mtd, qtd: billedStats.qtd, ytd: billedStats.ytd },
      { section: "Collected Revenue", mtd: collectedStats.mtd, qtd: collectedStats.qtd, ytd: collectedStats.ytd },
      ...topCustomers.map(c => ({ section: "Top Customers", ...c })),
      ...topItems.map(i => ({ section: "Top Items", ...i })),
      ...agingData.map(a => ({ section: "Aging", ...a })),
      { section: "Advance", total: advanceStats.totalAdvance, percent: advanceStats.percentOfSales }
    ];

    downloadExcel(exportData, 'Finance_Dashboard', 'Analytics');
    toast({ title: "Export Successful", description: "Dashboard data exported to Excel" });
  };

  const handleExportPDF = () => {
    const stats = {
      'Billed MTD': formatINR(billedStats.mtd),
      'Collected MTD': formatINR(collectedStats.mtd),
      'Billed YTD': formatINR(billedStats.ytd),
      'Collected YTD': formatINR(collectedStats.ytd),
      'Advance Collected': formatINR(advanceStats.totalAdvance),
    };

    const charts = [
      { title: "Top 5 Customers", data: topCustomers },
      { title: "Top 5 Items", data: topItems },
      { title: "Receivables Aging", data: agingData },
      { title: "Region-wise Revenue", data: regionData }
    ];

    downloadDashboardPDF('Finance Dashboard', stats, charts);
    toast({ title: "Export Successful", description: "Dashboard exported to PDF" });
  };

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#FF6B6B'];

  return (
    <div className="min-h-screen bg-background">
      <div className="p-6 space-y-6">
        {/* Breadcrumb & Actions */}
        <div className="flex items-center justify-between">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink asChild><Link to="/"><Home className="h-4 w-4" /></Link></BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem><BreadcrumbPage>Finance Dashboard</BreadcrumbPage></BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleExportExcel}>
              <FileSpreadsheet className="h-4 w-4 mr-2" />Export Excel
            </Button>
            <Button variant="outline" onClick={handleExportPDF}>
              <FileText className="h-4 w-4 mr-2" />Export PDF
            </Button>
          </div>
        </div>

        {/* Period Lock Notice */}
        {lockedPeriods.length > 0 && (
          <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg">
            <Lock className="h-4 w-4 text-amber-600" />
            <span className="text-sm text-amber-700 dark:text-amber-300">
              {lockedPeriods.length} period(s) locked. Latest: {format(new Date(lockedPeriods[0].period_start), 'MMM yyyy')}
            </span>
            <Link to="/finance/settings" className="text-xs text-primary hover:underline ml-auto">Manage →</Link>
          </div>
        )}

        {/* Filters */}
        <Card>
          <CardHeader><CardTitle>Dashboard Filters</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <div>
                <Label>Customer</Label>
                <Select value={filters.customerId} onValueChange={(v) => setFilters({...filters, customerId: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Customers</SelectItem>
                    {customers.map(c => <SelectItem key={c.id} value={c.id}>{c.customer_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Region</Label>
                <Select value={filters.region} onValueChange={(v) => setFilters({...filters, region: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Regions</SelectItem>
                    {regions.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Currency</Label>
                <Select value={filters.currency} onValueChange={(v) => setFilters({...filters, currency: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
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
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Items</SelectItem>
                    {items.map(i => <SelectItem key={i.id} value={i.item_code}>{i.item_code}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Date From</Label>
                <Input type="date" value={filters.dateFrom} onChange={(e) => setFilters({...filters, dateFrom: e.target.value})} />
              </div>
              <div>
                <Label>Date To</Label>
                <Input type="date" value={filters.dateTo} onChange={(e) => setFilters({...filters, dateTo: e.target.value})} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* FIX #5: Billed vs Collected Revenue KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => handleRevenueDrillDown('ytd')}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Billed Revenue (YTD)</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{loading ? "—" : formatINR(billedStats.ytd)}</div>
              <p className="text-xs text-muted-foreground">All issued invoices</p>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => handleRevenueDrillDown('ytd')}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Collected Revenue (YTD)</CardTitle>
              <DollarSign className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{loading ? "—" : formatINR(collectedStats.ytd)}</div>
              <p className="text-xs text-muted-foreground">Paid invoices only</p>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => handleRevenueDrillDown('mtd')}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Billed MTD</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{loading ? "—" : formatINR(billedStats.mtd)}</div>
              <p className="text-xs text-muted-foreground">QTD: {formatINR(billedStats.qtd)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Collection Rate</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {loading ? "—" : billedStats.ytd > 0 
                  ? `${((collectedStats.ytd / billedStats.ytd) * 100).toFixed(1)}%`
                  : "N/A"
                }
              </div>
              <p className="text-xs text-muted-foreground">Collected / Billed YTD</p>
            </CardContent>
          </Card>
        </div>

        {/* Outstanding Breakdown Widget */}
        <OutstandingBreakdownWidget />

        {/* Advance Payment Stats + NCR Cost Impact */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Advance Collected</CardTitle>
              <DollarSign className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{loading ? "—" : formatINR(advanceStats.totalAdvance)}</div>
              <p className="text-xs text-muted-foreground">{advanceStats.percentOfSales.toFixed(1)}% of total sales</p>
            </CardContent>
          </Card>
          <NCRCostImpactWidget dateFrom={filters.dateFrom} dateTo={filters.dateTo} />
        </div>

        {/* Top Performers */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="cursor-pointer hover:shadow-lg transition-shadow">
            <CardHeader>
              <CardTitle>Top 5 Customers by Revenue</CardTitle>
              <CardDescription>Click on a customer for detailed breakdown</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={topCustomers} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" className="text-xs" />
                  <YAxis dataKey="customer_name" type="category" width={100} className="text-xs" />
                  <Tooltip formatter={(value: number) => formatINR(value)} contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }} />
                  <Bar dataKey="revenue" fill="hsl(var(--primary))" onClick={(data) => handleCustomerDrillDown(data.customer_name, data.customer_id)} cursor="pointer" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="cursor-pointer hover:shadow-lg transition-shadow">
            <CardHeader>
              <CardTitle>Top 5 Items by Sales Quantity</CardTitle>
              <CardDescription>Click on an item for detailed breakdown</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={topItems}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="item_code" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }} />
                  <Bar dataKey="quantity" fill="hsl(var(--chart-2))" onClick={(data) => handleItemDrillDown(data.item_code)} cursor="pointer" />
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
              <CardDescription>Matches AR Aging page buckets</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={agingData} cx="50%" cy="50%" labelLine={false}
                    label={({ name, value }) => value > 0 ? `${name}: ${formatINR(value)}` : ''}
                    outerRadius={100} fill="#8884d8" dataKey="value">
                    {agingData.map((_, index) => (
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
              <CardTitle>Cashflow Projection</CardTitle>
              <CardDescription>Expected vs Actual Collections</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={cashflowData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="month" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip formatter={(value: number) => formatINR(value)} contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }} />
                  <Bar dataKey="expected" fill="hsl(var(--muted-foreground))" name="Expected" />
                  <Line type="monotone" dataKey="actual" stroke="hsl(var(--primary))" name="Actual" strokeWidth={2} />
                </ComposedChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Region & Profitability */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="cursor-pointer hover:shadow-lg transition-shadow">
            <CardHeader>
              <CardTitle>Revenue by Region</CardTitle>
              <CardDescription>Click for regional breakdown</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={regionData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="region" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip formatter={(value: number) => formatINR(value)} contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }} />
                  <Bar dataKey="revenue" fill="hsl(var(--chart-4))" onClick={(data) => handleRegionDrillDown(data.region)} cursor="pointer" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={handleProfitabilityDrillDown}>
            <CardHeader>
              <CardTitle>Cost Structure Trend</CardTitle>
              <CardDescription>Click for detailed profitability analysis</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={profitabilityData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="month" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }} />
                  <Line type="monotone" dataKey="materialCostPct" stroke="#FF8042" name="Material %" strokeWidth={2} />
                  <Line type="monotone" dataKey="labourCostPct" stroke="#0088FE" name="Labour %" strokeWidth={2} />
                  <Line type="monotone" dataKey="scrapPct" stroke="#FF6B6B" name="Scrap %" strokeWidth={2} />
                  <Legend />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Drill-Down Modal */}
        <DrillDownModal
          open={drillDownOpen}
          onClose={() => setDrillDownOpen(false)}
          title={drillDownTitle}
          type={drillDownType}
          data={drillDownData}
          metadata={drillDownMetadata}
        />
      </div>
    </div>
  );
}
