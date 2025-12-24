import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Download, FileSpreadsheet, FileText, ExternalLink } from 'lucide-react';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { downloadExcel, downloadPDF } from '@/lib/exportHelpers';
import { formatINR } from '@/lib/currencyConverter';

interface ReportFilters {
  customerId: string;
  region: string;
  currency: string;
  dateFrom: string;
  dateTo: string;
  overdueDays: string;
  paymentMethod: string;
  city: string;
  state: string;
  country: string;
  customerType: string;
  supplierId: string;
}

export default function FinanceReports() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  // Filter options
  const [customers, setCustomers] = useState<any[]>([]);
  const [regions, setRegions] = useState<string[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);

  // Filters
  const [filters, setFilters] = useState<ReportFilters>({
    customerId: 'all',
    region: 'all',
    currency: 'all',
    dateFrom: format(new Date(new Date().getFullYear(), 0, 1), 'yyyy-MM-dd'),
    dateTo: format(new Date(), 'yyyy-MM-dd'),
    overdueDays: 'all',
    paymentMethod: 'all',
    city: 'all',
    state: 'all',
    country: 'all',
    customerType: 'all',
    supplierId: 'all'
  });

  // Report Data
  const [agingData, setAgingData] = useState<any[]>([]);
  const [collectionData, setCollectionData] = useState<any[]>([]);
  const [salesByRegion, setSalesByRegion] = useState<any[]>([]);
  const [reconciliationData, setReconciliationData] = useState<any[]>([]);
  const [gstDomesticData, setGstDomesticData] = useState<any[]>([]);
  const [gstExportData, setGstExportData] = useState<any[]>([]);
  const [profitabilityData, setProfitabilityData] = useState<any[]>([]);
  const [comprehensiveData, setComprehensiveData] = useState<any[]>([]);

  useEffect(() => {
    loadFilterOptions();
  }, []);

  useEffect(() => {
    loadAllReports();
  }, [filters]);

  const loadFilterOptions = async () => {
    try {
      // Load customers
      const { data: customersData } = await supabase
        .from("customer_master")
        .select("id, customer_name, city, state, country, gst_type")
        .order("customer_name");
      
      setCustomers(customersData || []);

      // Extract unique regions
      const uniqueCities = [...new Set(customersData?.map(c => c.city).filter(Boolean))];
      setRegions(uniqueCities as string[]);

      // Load suppliers
      const { data: suppliersData } = await supabase
        .from("suppliers")
        .select("id, name")
        .order("name");
      
      setSuppliers(suppliersData || []);
    } catch (error) {
      console.error("Error loading filter options:", error);
    }
  };

  const loadAllReports = async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadARAgingReport(),
        loadCollectionReport(),
        loadSalesByRegion(),
        loadReconciliationReport(),
        loadGSTSummary(),
        loadProfitabilityReport(),
        loadComprehensiveReport()
      ]);
    } catch (error) {
      console.error('Error loading reports:', error);
      toast({
        title: "Error",
        description: "Failed to load reports",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const loadARAgingReport = async () => {
    try {
      let query = supabase
        .from('invoices')
        .select(`
          *,
          customer:customer_master!invoices_customer_id_fkey(customer_name, city, state, country, gst_type)
        `)
        .in('status', ['issued', 'part_paid', 'overdue'])
        .gte('invoice_date', filters.dateFrom)
        .lte('invoice_date', filters.dateTo)
        .order('due_date', { ascending: true });

      if (filters.customerId !== 'all') {
        query = query.eq('customer_id', filters.customerId);
      }

      if (filters.currency !== 'all') {
        query = query.eq('currency', filters.currency);
      }

      const { data: invoices } = await query;

      const today = new Date();
      let aging = (invoices || []).map((inv: any) => {
        const daysOverdue = Math.floor((today.getTime() - new Date(inv.due_date).getTime()) / (1000 * 60 * 60 * 24));
        return {
          ...inv,
          days_overdue: Math.max(0, daysOverdue),
          aging_bucket: daysOverdue <= 30 ? '0-30' : daysOverdue <= 60 ? '31-60' : daysOverdue <= 90 ? '61-90' : '90+',
        };
      });

      // Apply region filter
      if (filters.region !== 'all') {
        aging = aging.filter(inv => inv.customer?.city === filters.region);
      }

      // Apply overdue days filter
      if (filters.overdueDays !== 'all') {
        const days = parseInt(filters.overdueDays);
        aging = aging.filter(inv => inv.days_overdue >= days);
      }

      setAgingData(aging);
    } catch (error) {
      console.error("Error loading AR aging:", error);
    }
  };

  const loadCollectionReport = async () => {
    try {
      // Simplified query to avoid type recursion
      let query = supabase
        .from('payments')
        .select('id, invoice_id, amount, payment_date, method, reference')
        .gte('payment_date', filters.dateFrom)
        .lte('payment_date', filters.dateTo)
        .order('payment_date', { ascending: false });

      if (filters.paymentMethod !== 'all') {
        query = query.eq('method', filters.paymentMethod as any);
      }

      const { data: payments } = await query;

      // Get invoice details separately
      const invoiceIds = (payments || []).map(p => p.invoice_id).filter(Boolean);
      const { data: invoicesData } = invoiceIds.length > 0
        ? await supabase
            .from('invoices')
            .select('id, invoice_no, customer_id, expected_payment_date, total_amount')
            .in('id', invoiceIds)
        : { data: [] };

      // Get customer details
      const customerIds = (invoicesData || []).map(i => i.customer_id).filter(Boolean);
      const { data: customersData } = customerIds.length > 0
        ? await supabase
            .from('customer_master')
            .select('id, customer_name, city')
            .in('id', customerIds)
        : { data: [] };

      const invoiceMap: Record<string, any> = {};
      (invoicesData || []).forEach((inv: any) => {
        invoiceMap[inv.id] = inv;
      });

      const customerMap: Record<string, any> = {};
      (customersData || []).forEach((c: any) => {
        customerMap[c.id] = c;
      });

      // Enrich payments with invoice and customer data
      const enrichedPayments = (payments || []).map((p: any) => {
        const invoice = invoiceMap[p.invoice_id] || {};
        const customer = invoice.customer_id ? customerMap[invoice.customer_id] : null;
        return {
          ...p,
          invoice: {
            ...invoice,
            customer
          }
        };
      });

      let collectionsWithVariance = enrichedPayments.map((p: any) => ({
        ...p,
        variance: p.invoice?.expected_payment_date 
          ? Math.floor((new Date(p.payment_date).getTime() - new Date(p.invoice.expected_payment_date).getTime()) / (1000 * 60 * 60 * 24))
          : null,
      }));

      // Apply customer filter
      if (filters.customerId !== 'all') {
        collectionsWithVariance = collectionsWithVariance.filter(p => p.invoice?.customer_id === filters.customerId);
      }

      // Apply region filter
      if (filters.region !== 'all') {
        collectionsWithVariance = collectionsWithVariance.filter(p => p.invoice?.customer?.city === filters.region);
      }

      setCollectionData(collectionsWithVariance);
    } catch (error) {
      console.error("Error loading collection report:", error);
    }
  };

  const loadSalesByRegion = async () => {
    try {
      let query = supabase
        .from('invoices')
        .select(`
          customer_id, 
          total_amount, 
          status,
          currency,
          customer:customer_master!invoices_customer_id_fkey(customer_name, city, state, country, gst_type)
        `)
        .eq('status', 'paid')
        .gte('invoice_date', filters.dateFrom)
        .lte('invoice_date', filters.dateTo);

      if (filters.customerId !== 'all') {
        query = query.eq('customer_id', filters.customerId);
      }

      const { data: invoices } = await query;

      // Group by city, state, or country
      const grouped = (invoices || []).reduce((acc: any, inv: any) => {
        const city = inv.customer?.city || 'Unknown';
        const state = inv.customer?.state || 'Unknown';
        const country = inv.customer?.country || 'Unknown';
        const customerType = inv.customer?.gst_type || 'Unknown';

        // Apply filters
        if (filters.city !== 'all' && city !== filters.city) return acc;
        if (filters.state !== 'all' && state !== filters.state) return acc;
        if (filters.country !== 'all' && country !== filters.country) return acc;
        if (filters.customerType !== 'all' && customerType !== filters.customerType) return acc;

        const key = `${city}|${state}|${country}|${customerType}`;
        if (!acc[key]) {
          acc[key] = { city, state, country, customerType, total: 0, count: 0 };
        }
        acc[key].total += Number(inv.total_amount) || 0;
        acc[key].count += 1;
        return acc;
      }, {});

      setSalesByRegion(Object.values(grouped));
    } catch (error) {
      console.error("Sales by region error:", error);
    }
  };

  const loadReconciliationReport = async () => {
    try {
      // Simplified query to avoid type recursion
      const { data: salesOrders } = await supabase
        .from('sales_orders')
        .select('id, so_id, po_number, customer, total_amount')
        .gte('created_at', filters.dateFrom)
        .lte('created_at', filters.dateTo);

      const soIds = (salesOrders || []).map(so => so.id);
      
      // Get invoices separately
      const { data: invoicesData } = soIds.length > 0
        ? await supabase
            .from('invoices')
            .select('so_id, invoice_no, total_amount')
            .in('so_id', soIds)
        : { data: [] };

      // Get shipments separately
      const { data: shipmentsData } = soIds.length > 0
        ? await supabase
            .from('shipments')
            .select('so_id, ship_id, gross_weight_kg')
            .in('so_id', soIds)
        : { data: [] };

      // Build lookup maps
      const invoicesBySO: Record<string, any[]> = {};
      (invoicesData || []).forEach((inv: any) => {
        if (!invoicesBySO[inv.so_id]) invoicesBySO[inv.so_id] = [];
        invoicesBySO[inv.so_id].push(inv);
      });

      const shipmentsBySO: Record<string, any[]> = {};
      (shipmentsData || []).forEach((ship: any) => {
        if (!shipmentsBySO[ship.so_id]) shipmentsBySO[ship.so_id] = [];
        shipmentsBySO[ship.so_id].push(ship);
      });

      const reconciliation = (salesOrders || []).map((so: any) => {
        const soAmount = Number(so.total_amount) || 0;
        const invoices = invoicesBySO[so.id] || [];
        const shipments = shipmentsBySO[so.id] || [];
        const invoicedAmount = invoices.reduce((sum: number, inv: any) => sum + (Number(inv.total_amount) || 0), 0);
        const shippedWeight = shipments.reduce((sum: number, ship: any) => sum + (Number(ship.gross_weight_kg) || 0), 0);
        const variance = soAmount - invoicedAmount;

        return {
          so_id: so.so_id,
          customer: so.customer,
          so_amount: soAmount,
          invoiced_amount: invoicedAmount,
          shipped_weight: shippedWeight,
          variance: variance,
          variance_percent: soAmount > 0 ? (variance / soAmount) * 100 : 0
        };
      });

      setReconciliationData(reconciliation);
    } catch (error) {
      console.error("Error loading reconciliation:", error);
    }
  };

  const loadGSTSummary = async () => {
    try {
      // Simplified query - load invoices first
      let query = supabase
        .from('invoices')
        .select('id, invoice_no, invoice_date, customer_id, subtotal, gst_percent, gst_amount, total_amount, currency')
        .gte('invoice_date', filters.dateFrom)
        .lte('invoice_date', filters.dateTo);

      if (filters.customerId !== 'all') {
        query = query.eq('customer_id', filters.customerId);
      }

      const { data: invoices } = await query;

      // Get customer details separately
      const customerIds = (invoices || []).map(i => i.customer_id).filter(Boolean);
      const { data: customersData } = customerIds.length > 0
        ? await supabase
            .from('customer_master')
            .select('id, customer_name, gst_type, gst_number')
            .in('id', customerIds)
        : { data: [] };

      const customerMap: Record<string, any> = {};
      (customersData || []).forEach((c: any) => {
        customerMap[c.id] = c;
      });

      // Enrich invoices with customer data
      const enrichedInvoices = (invoices || []).map((inv: any) => ({
        ...inv,
        customer: customerMap[inv.customer_id] || null
      }));

      // Separate domestic and export
      const domestic = enrichedInvoices
        .filter((inv: any) => inv.customer?.gst_type === 'domestic')
        .map((inv: any) => ({
          invoice_no: inv.invoice_no,
          invoice_date: inv.invoice_date,
          customer_name: inv.customer?.customer_name,
          gst_number: inv.customer?.gst_number,
          taxable_value: Number(inv.subtotal) || 0,
          gst_percent: Number(inv.gst_percent) || 0,
          gst_amount: Number(inv.gst_amount) || 0,
          total: Number(inv.total_amount) || 0,
        }));

      const exportInv = enrichedInvoices
        .filter((inv: any) => inv.customer?.gst_type === 'export')
        .map((inv: any) => ({
          invoice_no: inv.invoice_no,
          invoice_date: inv.invoice_date,
          customer_name: inv.customer?.customer_name,
          taxable_value: Number(inv.subtotal) || 0,
          total: Number(inv.total_amount) || 0,
          currency: inv.currency
        }));

      setGstDomesticData(domestic);
      setGstExportData(exportInv);
    } catch (error) {
      console.error("Error loading GST summary:", error);
    }
  };

  const loadProfitabilityReport = async () => {
    try {
      // Get work orders with financial snapshots
      // Simplified query to avoid type recursion - fetch work orders first
      const { data: workOrders } = await supabase
        .from('work_orders')
        .select('id, wo_id, display_id, customer, quantity, financial_snapshot, so_id')
        .not('financial_snapshot', 'is', null)
        .gte('created_at', filters.dateFrom)
        .lte('created_at', filters.dateTo);

      // Fetch sales order totals separately
      const soIds = (workOrders || []).map(wo => wo.so_id).filter(Boolean);
      const { data: salesOrdersData } = soIds.length > 0 
        ? await supabase
            .from('sales_orders')
            .select('id, total_amount')
            .in('id', soIds)
        : { data: [] };
      
      const salesOrderMap: Record<string, number> = {};
      (salesOrdersData || []).forEach((so: any) => {
        salesOrderMap[so.id] = Number(so.total_amount) || 0;
      });

      const profitability = (workOrders || []).map((wo: any) => {
        const snapshot = wo.financial_snapshot || {};
        const revenue = wo.so_id ? (salesOrderMap[wo.so_id] || 0) : 0;
        const materialCost = snapshot.total_material_cost || 0;
        const labourCost = snapshot.total_labour_cost || 0;
        const scrapPct = snapshot.scrap_percentage || 0;
        const totalCost = materialCost + labourCost;
        const netProfit = revenue - totalCost;
        const netProfitPct = revenue > 0 ? (netProfit / revenue) * 100 : 0;

        return {
          wo_id: wo.display_id || wo.wo_id,
          customer: wo.customer,
          revenue: revenue,
          material_cost: materialCost,
          material_cost_pct: revenue > 0 ? (materialCost / revenue) * 100 : 0,
          labour_cost: labourCost,
          labour_cost_pct: revenue > 0 ? (labourCost / revenue) * 100 : 0,
          scrap_pct: scrapPct,
          total_cost: totalCost,
          net_profit: netProfit,
          net_profit_pct: netProfitPct
        };
      });

      setProfitabilityData(profitability);
    } catch (error) {
      console.error("Error loading profitability:", error);
    }
  };

  const loadComprehensiveReport = async () => {
    try {
      // Get sales data
      let salesQuery = supabase
        .from('sales_orders')
        .select(`
          id,
          so_id,
          customer,
          total_amount,
          advance_payment,
          created_at,
          customer_id
        `)
        .eq('status', 'approved')
        .gte('created_at', filters.dateFrom)
        .lte('created_at', filters.dateTo);

      if (filters.customerId !== 'all') {
        salesQuery = salesQuery.eq('customer_id', filters.customerId);
      }

      const { data: salesOrders } = await salesQuery;

      // Get payments
      let paymentsQuery = supabase
        .from('payments')
        .select(`
          amount,
          payment_date,
          invoice:invoices!payments_invoice_id_fkey(customer_id)
        `)
        .gte('payment_date', filters.dateFrom)
        .lte('payment_date', filters.dateTo);

      const { data: payments } = await paymentsQuery;

      // Get invoices for aging
      let invoicesQuery = supabase
        .from('invoices')
        .select('customer_id, balance_amount, status')
        .in('status', ['issued', 'part_paid', 'overdue']);

      if (filters.customerId !== 'all') {
        invoicesQuery = invoicesQuery.eq('customer_id', filters.customerId);
      }

      const { data: invoices } = await invoicesQuery;

      // Aggregate by customer and month
      const comprehensive: any = {};

      salesOrders?.forEach((so: any) => {
        const month = format(new Date(so.created_at), 'MMM yyyy');
        const customer = so.customer || 'Unknown';
        const key = `${customer}|${month}`;

        if (!comprehensive[key]) {
          comprehensive[key] = {
            customer,
            month,
            sales: 0,
            advance: 0,
            collections: 0,
            aging: 0
          };
        }

        comprehensive[key].sales += Number(so.total_amount) || 0;
        
        if (so.advance_payment?.calculated_amount) {
          comprehensive[key].advance += Number(so.advance_payment.calculated_amount);
        }
      });

      payments?.forEach((p: any) => {
        const month = format(new Date(p.payment_date), 'MMM yyyy');
        const customerId = p.invoice?.customer_id;
        
        // Find customer name from salesOrders
        const soForCustomer = salesOrders?.find(so => so.customer_id === customerId);
        const customer = soForCustomer?.customer || 'Unknown';
        const key = `${customer}|${month}`;

        if (!comprehensive[key]) {
          comprehensive[key] = {
            customer,
            month,
            sales: 0,
            advance: 0,
            collections: 0,
            aging: 0
          };
        }

        comprehensive[key].collections += Number(p.amount) || 0;
      });

      // Add aging data
      invoices?.forEach((inv: any) => {
        const soForCustomer = salesOrders?.find(so => so.customer_id === inv.customer_id);
        const customer = soForCustomer?.customer || 'Unknown';
        
        // Add to most recent month for this customer
        const latestMonth = Object.keys(comprehensive)
          .filter(k => k.startsWith(`${customer}|`))
          .sort()
          .reverse()[0];

        if (latestMonth && comprehensive[latestMonth]) {
          comprehensive[latestMonth].aging += Number(inv.balance_amount) || 0;
        }
      });

      setComprehensiveData(Object.values(comprehensive));
    } catch (error) {
      console.error("Error loading comprehensive report:", error);
    }
  };

  const handleExport = (data: any[], filename: string, format: 'excel' | 'pdf') => {
    if (data.length === 0) {
      toast({
        title: "No Data",
        description: "No data available to export",
        variant: "destructive"
      });
      return;
    }

    if (format === 'excel') {
      downloadExcel(data, filename);
    } else {
      const columns = Object.keys(data[0]).map(key => ({
        header: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        dataKey: key
      }));
      downloadPDF(data, filename, filename.replace(/_/g, ' '), columns);
    }

    toast({
      title: "Export Successful",
      description: `Report exported as ${format.toUpperCase()}`
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto p-6">Loading reports...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto p-6 space-y-6">
        {/* Global Filters */}
        <Card>
          <CardHeader>
            <CardTitle>Report Filters</CardTitle>
            <CardDescription>Apply filters across all reports</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
                    <SelectItem value="all">All Currencies</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="INR">INR</SelectItem>
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

        {/* Reports Tabs */}
        <Tabs defaultValue="comprehensive" className="w-full">
          <TabsList className="grid w-full grid-cols-7">
            <TabsTrigger value="comprehensive">Master Report</TabsTrigger>
            <TabsTrigger value="aging">AR Aging</TabsTrigger>
            <TabsTrigger value="collection">Collection</TabsTrigger>
            <TabsTrigger value="sales">Sales by Region</TabsTrigger>
            <TabsTrigger value="reconciliation">Reconciliation</TabsTrigger>
            <TabsTrigger value="gst">GST Summary</TabsTrigger>
            <TabsTrigger value="profitability">Profitability</TabsTrigger>
          </TabsList>

          {/* Comprehensive Financial Summary */}
          <TabsContent value="comprehensive">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Comprehensive Financial Summary</CardTitle>
                    <CardDescription>Sales, Collections, Advances, and Aging by Customer and Month</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={() => handleExport(comprehensiveData, 'comprehensive_financial_summary', 'excel')}>
                      <FileSpreadsheet className="h-4 w-4 mr-2" />
                      Excel
                    </Button>
                    <Button variant="outline" onClick={() => handleExport(comprehensiveData, 'comprehensive_financial_summary', 'pdf')}>
                      <FileText className="h-4 w-4 mr-2" />
                      PDF
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Customer</TableHead>
                      <TableHead>Month</TableHead>
                      <TableHead>Sales</TableHead>
                      <TableHead>Advance</TableHead>
                      <TableHead>Collections</TableHead>
                      <TableHead>Outstanding</TableHead>
                      <TableHead>Collection %</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {comprehensiveData.map((row: any, idx) => {
                      const collectionPct = row.sales > 0 ? (row.collections / row.sales) * 100 : 0;
                      return (
                        <TableRow key={idx}>
                          <TableCell className="font-medium">{row.customer}</TableCell>
                          <TableCell>{row.month}</TableCell>
                          <TableCell>${Number(row.sales).toLocaleString()}</TableCell>
                          <TableCell className="text-green-600">${Number(row.advance).toLocaleString()}</TableCell>
                          <TableCell>${Number(row.collections).toLocaleString()}</TableCell>
                          <TableCell className="text-orange-600">${Number(row.aging).toLocaleString()}</TableCell>
                          <TableCell>
                            <Badge variant={collectionPct >= 80 ? 'default' : 'destructive'}>
                              {collectionPct.toFixed(1)}%
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* AR Aging Report */}
          <TabsContent value="aging">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>AR Aging Report</CardTitle>
                    <CardDescription>Click customer to view their invoices or sales orders</CardDescription>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <Label>Min Overdue Days</Label>
                      <Select value={filters.overdueDays} onValueChange={(v) => setFilters({...filters, overdueDays: v})}>
                        <SelectTrigger className="w-[150px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All</SelectItem>
                          <SelectItem value="0">Current</SelectItem>
                          <SelectItem value="30">30+ Days</SelectItem>
                          <SelectItem value="60">60+ Days</SelectItem>
                          <SelectItem value="90">90+ Days</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Button onClick={() => handleExport(agingData, 'ar_aging_report', 'excel')}>
                      <Download className="h-4 w-4 mr-2" />
                      Export
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Region</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Currency</TableHead>
                      <TableHead>Days Overdue</TableHead>
                      <TableHead>Aging Bucket</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {agingData.map((inv: any) => (
                      <TableRow key={inv.id} className="hover:bg-muted/50">
                        <TableCell 
                          className="font-medium cursor-pointer text-primary hover:underline"
                          onClick={() => navigate(`/finance/invoices/${inv.id}`)}
                        >
                          {inv.invoice_no}
                          <ExternalLink className="h-3 w-3 inline ml-1" />
                        </TableCell>
                        <TableCell 
                          className="cursor-pointer text-primary hover:underline"
                          onClick={() => navigate(`/sales?customer=${inv.customer_id}`)}
                        >
                          {inv.customer?.customer_name}
                        </TableCell>
                        <TableCell>{inv.customer?.city || '—'}</TableCell>
                        <TableCell>${Number(inv.balance_amount).toLocaleString()}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{inv.currency}</Badge>
                        </TableCell>
                        <TableCell>{inv.days_overdue} days</TableCell>
                        <TableCell>
                          <Badge variant={inv.aging_bucket === '90+' ? 'destructive' : inv.aging_bucket === '61-90' ? 'default' : 'secondary'}>
                            {inv.aging_bucket} days
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button 
                            size="sm" 
                            variant="ghost"
                            onClick={() => navigate(`/sales?customer=${inv.customer_id}`)}
                          >
                            View Orders
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Collection Report */}
          <TabsContent value="collection">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Collection Report</CardTitle>
                    <CardDescription>Click payment to view linked invoice</CardDescription>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <Label>Method</Label>
                      <Select value={filters.paymentMethod} onValueChange={(v) => setFilters({...filters, paymentMethod: v})}>
                        <SelectTrigger className="w-[150px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Methods</SelectItem>
                          <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                          <SelectItem value="check">Check</SelectItem>
                          <SelectItem value="cash">Cash</SelectItem>
                          <SelectItem value="wire">Wire</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Button onClick={() => handleExport(collectionData, 'collection_report', 'excel')}>
                      <Download className="h-4 w-4 mr-2" />
                      Export
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Payment Date</TableHead>
                      <TableHead>Invoice</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Expected Date</TableHead>
                      <TableHead>Variance (Days)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {collectionData.map((payment: any) => (
                      <TableRow key={payment.id} className="hover:bg-muted/50">
                        <TableCell>{format(new Date(payment.payment_date), 'PP')}</TableCell>
                        <TableCell 
                          className="font-medium cursor-pointer text-primary hover:underline"
                          onClick={() => navigate(`/finance/invoices/${payment.invoice_id}`)}
                        >
                          {payment.invoice?.invoice_no}
                          <ExternalLink className="h-3 w-3 inline ml-1" />
                        </TableCell>
                        <TableCell>{payment.invoice?.customer?.customer_name || '—'}</TableCell>
                        <TableCell>${Number(payment.amount).toLocaleString()}</TableCell>
                        <TableCell><Badge variant="outline">{payment.method}</Badge></TableCell>
                        <TableCell>
                          {payment.invoice?.expected_payment_date 
                            ? format(new Date(payment.invoice.expected_payment_date), 'PP')
                            : '—'}
                        </TableCell>
                        <TableCell>
                          {payment.variance !== null ? (
                            <Badge variant={payment.variance > 0 ? 'destructive' : 'default'}>
                              {payment.variance > 0 ? '+' : ''}{payment.variance}
                            </Badge>
                          ) : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Sales by Region */}
          <TabsContent value="sales">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Sales by Region Analysis</CardTitle>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <Label>City</Label>
                      <Select value={filters.city} onValueChange={(v) => setFilters({...filters, city: v})}>
                        <SelectTrigger className="w-[150px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Cities</SelectItem>
                          {regions.map(r => (
                            <SelectItem key={r} value={r}>{r}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center gap-2">
                      <Label>Customer Type</Label>
                      <Select value={filters.customerType} onValueChange={(v) => setFilters({...filters, customerType: v})}>
                        <SelectTrigger className="w-[150px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Types</SelectItem>
                          <SelectItem value="domestic">Domestic</SelectItem>
                          <SelectItem value="export">Export</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Button onClick={() => handleExport(salesByRegion, 'sales_by_region', 'excel')}>
                      <Download className="h-4 w-4 mr-2" />
                      Export
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>City</TableHead>
                      <TableHead>State</TableHead>
                      <TableHead>Country</TableHead>
                      <TableHead>Customer Type</TableHead>
                      <TableHead>Total Sales</TableHead>
                      <TableHead>Invoice Count</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {salesByRegion.map((region: any, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-medium">{region.city}</TableCell>
                        <TableCell>{region.state}</TableCell>
                        <TableCell>{region.country}</TableCell>
                        <TableCell>
                          <Badge variant={region.customerType === 'export' ? 'default' : 'secondary'}>
                            {region.customerType}
                          </Badge>
                        </TableCell>
                        <TableCell>${Number(region.total).toLocaleString()}</TableCell>
                        <TableCell>{region.count}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Reconciliation Report */}
          <TabsContent value="reconciliation">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>SO vs Invoice vs Shipment Reconciliation</CardTitle>
                    <CardDescription>Click supplier name to open Procurement Reconciliation Report</CardDescription>
                  </div>
                  <Button onClick={() => handleExport(reconciliationData, 'reconciliation_report', 'excel')}>
                    <Download className="h-4 w-4 mr-2" />
                    Export
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Sales Order</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>SO Amount</TableHead>
                      <TableHead>Invoiced Amount</TableHead>
                      <TableHead>Shipped Weight (kg)</TableHead>
                      <TableHead>Variance</TableHead>
                      <TableHead>Variance %</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reconciliationData.map((rec: any, idx) => (
                      <TableRow key={idx}>
                        <TableCell 
                          className="font-medium cursor-pointer text-primary hover:underline"
                          onClick={() => navigate(`/sales?so=${rec.so_id}`)}
                        >
                          {rec.so_id}
                        </TableCell>
                        <TableCell>{rec.customer}</TableCell>
                        <TableCell>${Number(rec.so_amount).toLocaleString()}</TableCell>
                        <TableCell>${Number(rec.invoiced_amount).toLocaleString()}</TableCell>
                        <TableCell>{Number(rec.shipped_weight).toLocaleString()}</TableCell>
                        <TableCell>
                          <Badge variant={Math.abs(rec.variance) > 0 ? 'destructive' : 'default'}>
                            ${Math.abs(rec.variance).toLocaleString()}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={Math.abs(rec.variance_percent) > 5 ? 'destructive' : 'default'}>
                            {rec.variance_percent.toFixed(2)}%
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* GST Summary */}
          <TabsContent value="gst">
            <Tabs defaultValue="domestic" className="w-full">
              <TabsList>
                <TabsTrigger value="domestic">Domestic GST</TabsTrigger>
                <TabsTrigger value="export">Export Sales</TabsTrigger>
              </TabsList>

              <TabsContent value="domestic">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle>GST Summary - Domestic</CardTitle>
                      <Button onClick={() => handleExport(gstDomesticData, 'gst_domestic_summary', 'excel')}>
                        <Download className="h-4 w-4 mr-2" />
                        Export
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Invoice No</TableHead>
                          <TableHead>Invoice Date</TableHead>
                          <TableHead>Customer</TableHead>
                          <TableHead>GST Number</TableHead>
                          <TableHead>Taxable Value</TableHead>
                          <TableHead>GST %</TableHead>
                          <TableHead>GST Amount</TableHead>
                          <TableHead>Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {gstDomesticData.map((gst: any, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="font-medium">{gst.invoice_no}</TableCell>
                            <TableCell>{format(new Date(gst.invoice_date), 'PP')}</TableCell>
                            <TableCell>{gst.customer_name}</TableCell>
                            <TableCell className="text-xs">{gst.gst_number || '—'}</TableCell>
                            <TableCell>${Number(gst.taxable_value).toLocaleString()}</TableCell>
                            <TableCell>{Number(gst.gst_percent)}%</TableCell>
                            <TableCell>${Number(gst.gst_amount).toLocaleString()}</TableCell>
                            <TableCell className="font-bold">${Number(gst.total).toLocaleString()}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="export">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle>Export Sales Summary</CardTitle>
                      <Button onClick={() => handleExport(gstExportData, 'export_sales_summary', 'excel')}>
                        <Download className="h-4 w-4 mr-2" />
                        Export
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Invoice No</TableHead>
                          <TableHead>Invoice Date</TableHead>
                          <TableHead>Customer</TableHead>
                          <TableHead>Taxable Value</TableHead>
                          <TableHead>Currency</TableHead>
                          <TableHead>Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {gstExportData.map((exp: any, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="font-medium">{exp.invoice_no}</TableCell>
                            <TableCell>{format(new Date(exp.invoice_date), 'PP')}</TableCell>
                            <TableCell>{exp.customer_name}</TableCell>
                            <TableCell>${Number(exp.taxable_value).toLocaleString()}</TableCell>
                            <TableCell><Badge variant="outline">{exp.currency}</Badge></TableCell>
                            <TableCell className="font-bold">${Number(exp.total).toLocaleString()}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </TabsContent>

          {/* Profitability */}
          <TabsContent value="profitability">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Profitability Analysis by Work Order</CardTitle>
                  <Button onClick={() => handleExport(profitabilityData, 'profitability_report', 'excel')}>
                    <Download className="h-4 w-4 mr-2" />
                    Export
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Work Order</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Revenue</TableHead>
                      <TableHead>Material Cost</TableHead>
                      <TableHead>Material %</TableHead>
                      <TableHead>Labour Cost</TableHead>
                      <TableHead>Labour %</TableHead>
                      <TableHead>Scrap %</TableHead>
                      <TableHead>Net Profit</TableHead>
                      <TableHead>Net Profit %</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {profitabilityData.map((prof: any, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-medium">{prof.wo_id}</TableCell>
                        <TableCell>{prof.customer}</TableCell>
                        <TableCell>${Number(prof.revenue).toLocaleString()}</TableCell>
                        <TableCell>${Number(prof.material_cost).toLocaleString()}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{prof.material_cost_pct.toFixed(1)}%</Badge>
                        </TableCell>
                        <TableCell>${Number(prof.labour_cost).toLocaleString()}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{prof.labour_cost_pct.toFixed(1)}%</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={Number(prof.scrap_pct) > 5 ? 'destructive' : 'default'}>
                            {prof.scrap_pct.toFixed(1)}%
                          </Badge>
                        </TableCell>
                        <TableCell className={prof.net_profit >= 0 ? 'text-green-600' : 'text-red-600'}>
                          ${Number(prof.net_profit).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <Badge variant={prof.net_profit_pct >= 10 ? 'default' : 'destructive'}>
                            {prof.net_profit_pct.toFixed(1)}%
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}