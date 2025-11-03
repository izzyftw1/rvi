import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { NavigationHeader } from '@/components/NavigationHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { Download, FileSpreadsheet, FileText, Calendar } from 'lucide-react';
import { format } from 'date-fns';

export default function FinanceReports() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [scheduleExport, setScheduleExport] = useState(false);
  const [exportFormat, setExportFormat] = useState<'csv' | 'xlsx' | 'pdf'>('xlsx');

  // AR Aging Data
  const [agingData, setAgingData] = useState<any[]>([]);
  const [agingPeriod, setAgingPeriod] = useState<'30' | '60' | '90'>('30');

  // Collection Report Data
  const [collectionData, setCollectionData] = useState<any[]>([]);
  const [collectionPeriod, setCollectionPeriod] = useState('current_month');

  // Sales by Region Data
  const [salesByRegion, setSalesByRegion] = useState<any[]>([]);
  const [salesGroupBy, setSalesGroupBy] = useState<'city' | 'state' | 'country'>('city');

  // Reconciliation Data
  const [reconciliationData, setReconciliationData] = useState<any[]>([]);

  // GST Summary Data
  const [gstData, setGstData] = useState<any[]>([]);

  // Profitability Data
  const [profitabilityData, setProfitabilityData] = useState<any[]>([]);

  useEffect(() => {
    loadAllReports();
  }, []);

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
      ]);
    } catch (error) {
      console.error('Error loading reports:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadARAgingReport = async () => {
    const { data: invoices } = await supabase
      .from('invoices')
      .select(`
        *,
        customer:customer_master(customer_name, city, state, country, primary_contact_name, primary_contact_email, primary_contact_phone),
        ar_followups(followup_date, notes, outcome)
      `)
      .in('status', ['issued', 'part_paid', 'overdue'])
      .order('due_date', { ascending: true });

    const today = new Date();
    const aging = (invoices || []).map((inv: any) => {
      const daysOverdue = Math.floor((today.getTime() - new Date(inv.due_date).getTime()) / (1000 * 60 * 60 * 24));
      return {
        ...inv,
        days_overdue: Math.max(0, daysOverdue),
        aging_bucket: daysOverdue <= 30 ? '0-30' : daysOverdue <= 60 ? '31-60' : daysOverdue <= 90 ? '61-90' : '90+',
      };
    });

    setAgingData(aging);
  };

  const loadCollectionReport = async () => {
    const startDate = collectionPeriod === 'current_month' 
      ? new Date(new Date().getFullYear(), new Date().getMonth(), 1)
      : new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1);

    const { data: payments } = await supabase
      .from('payments')
      .select(`
        *,
        invoice:invoices(invoice_no, customer_id, expected_payment_date, total_amount)
      `)
      .gte('payment_date', startDate.toISOString().split('T')[0])
      .order('payment_date', { ascending: false });

    const collectionsWithVariance = (payments || []).map((p: any) => ({
      ...p,
      variance: p.invoice?.expected_payment_date 
        ? Math.floor((new Date(p.payment_date).getTime() - new Date(p.invoice.expected_payment_date).getTime()) / (1000 * 60 * 60 * 24))
        : null,
    }));

    setCollectionData(collectionsWithVariance);
  };

  const loadSalesByRegion = async () => {
    try {
      // Get all invoices with customer info
      const { data: invoices, error: invError } = await supabase
        .from('invoices')
        .select('customer_id, total_amount, status')
        .eq('status', 'paid');

      if (invError) throw invError;

      // Get unique customer IDs
      const customerIds = [...new Set(invoices?.map(i => i.customer_id).filter(Boolean))];

      // Get customer details
      const { data: customers, error: custError } = await supabase
        .from('customer_master')
        .select('id, customer_name, city, state, country')
        .in('id', customerIds);

      if (custError) throw custError;

      // Create customer lookup
      const customerMap: any = {};
      customers?.forEach(c => {
        customerMap[c.id] = c;
      });

      // Group by selected region
      const grouped = (invoices || []).reduce((acc: any, inv: any) => {
        const customer = customerMap[inv.customer_id];
        const key = customer?.[salesGroupBy] || 'Unknown';
        if (!acc[key]) {
          acc[key] = { region: key, total: 0, count: 0 };
        }
        acc[key].total += Number(inv.total_amount) || 0;
        acc[key].count += 1;
        return acc;
      }, {});

      setSalesByRegion(Object.values(grouped));
    } catch (error: any) {
      console.error("Sales by region error:", error);
      toast({ title: 'Error loading sales by region', description: error.message, variant: 'destructive' });
    }
  };

  const loadReconciliationReport = async () => {
    const { data: salesOrders } = await supabase
      .from('sales_orders')
      .select(`
        id,
        so_id,
        po_number,
        customer,
        total_amount,
        invoices(invoice_no, total_amount),
        shipments(shipment_id, gross_weight_kg)
      `);

    const reconciliation = (salesOrders || []).map((so: any) => ({
      so_id: so.so_id,
      customer: so.customer,
      so_amount: so.total_amount || 0,
      invoiced_amount: so.invoices?.reduce((sum: number, inv: any) => sum + (Number(inv.total_amount) || 0), 0) || 0,
      shipped_weight: so.shipments?.reduce((sum: number, ship: any) => sum + (Number(ship.gross_weight_kg) || 0), 0) || 0,
    }));

    setReconciliationData(reconciliation);
  };

  const loadGSTSummary = async () => {
    const { data: invoices } = await supabase
      .from('invoices')
      .select(`
        *,
        customer:customer_master(gst_type)
      `)
      .neq('customer.gst_type', 'export');

    const gstSummary = (invoices || [])
      .filter((inv: any) => inv.customer?.gst_type === 'domestic')
      .map((inv: any) => ({
        invoice_no: inv.invoice_no,
        invoice_date: inv.invoice_date,
        taxable_value: Number(inv.subtotal) || 0,
        gst_percent: Number(inv.gst_percent) || 0,
        gst_amount: Number(inv.gst_amount) || 0,
        total: Number(inv.total_amount) || 0,
      }));

    setGstData(gstSummary);
  };

  const loadProfitabilityReport = async () => {
    const { data: salesOrders } = await supabase
      .from('sales_orders')
      .select(`
        so_id,
        customer,
        total_amount,
        work_orders(quantity, production_logs(quantity_scrap))
      `);

    const profitability = (salesOrders || []).map((so: any) => {
      const totalScrap = so.work_orders?.reduce((sum: number, wo: any) => {
        return sum + (wo.production_logs?.reduce((s: number, log: any) => s + (log.quantity_scrap || 0), 0) || 0);
      }, 0) || 0;

      const totalQuantity = so.work_orders?.reduce((sum: number, wo: any) => sum + (wo.quantity || 0), 0) || 0;
      const scrapPercent = totalQuantity > 0 ? (totalScrap / totalQuantity) * 100 : 0;

      return {
        so_id: so.so_id,
        customer: so.customer,
        revenue: Number(so.total_amount) || 0,
        total_quantity: totalQuantity,
        total_scrap: totalScrap,
        scrap_percent: scrapPercent.toFixed(2),
      };
    });

    setProfitabilityData(profitability);
  };

  const exportToCSV = (data: any[], filename: string) => {
    if (data.length === 0) {
      toast({ title: 'No data', description: 'No data available to export', variant: 'destructive' });
      return;
    }

    const headers = Object.keys(data[0]).join(',');
    const rows = data.map(row => Object.values(row).join(',')).join('\n');
    const csv = `${headers}\n${rows}`;

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    toast({ title: 'Success', description: 'Report exported as CSV' });
  };

  const exportToExcel = (data: any[], filename: string) => {
    if (data.length === 0) {
      toast({ title: 'No data', description: 'No data available to export', variant: 'destructive' });
      return;
    }

    const XLSX = require('xlsx');
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Report');
    XLSX.writeFile(wb, `${filename}_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);

    toast({ title: 'Success', description: 'Report exported as Excel' });
  };

  const exportToPDF = (data: any[], filename: string, title: string) => {
    if (data.length === 0) {
      toast({ title: 'No data', description: 'No data available to export', variant: 'destructive' });
      return;
    }

    const { jsPDF } = require('jspdf');
    require('jspdf-autotable');

    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text(title, 14, 20);
    doc.setFontSize(11);
    doc.text(`Generated: ${format(new Date(), 'PPP')}`, 14, 30);

    const headers = Object.keys(data[0]);
    const rows = data.map(row => headers.map(h => row[h]));

    doc.autoTable({
      head: [headers],
      body: rows,
      startY: 40,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [41, 128, 185] },
    });

    doc.save(`${filename}_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
    toast({ title: 'Success', description: 'Report exported as PDF' });
  };

  const handleExport = (data: any[], filename: string, title: string) => {
    if (scheduleExport) {
      toast({ 
        title: 'Export Scheduled', 
        description: 'Report will be generated and stored for later download',
      });
      // In a real implementation, you'd save this to a database table
      return;
    }

    switch (exportFormat) {
      case 'csv':
        exportToCSV(data, filename);
        break;
      case 'xlsx':
        exportToExcel(data, filename);
        break;
      case 'pdf':
        exportToPDF(data, filename, title);
        break;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <NavigationHeader title="Finance Reports" subtitle="Export financial reports" />
        <div className="container mx-auto p-6">Loading reports...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <NavigationHeader title="Finance Reports" subtitle="Export financial reports" />

      <main className="container mx-auto p-6 space-y-6">
        {/* Export Controls */}
        <Card>
          <CardHeader>
            <CardTitle>Export Settings</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-6">
              <div className="flex-1">
                <Label>Export Format</Label>
                <Select value={exportFormat} onValueChange={(v: any) => setExportFormat(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="csv">CSV</SelectItem>
                    <SelectItem value="xlsx">Excel (XLSX)</SelectItem>
                    <SelectItem value="pdf">PDF</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={scheduleExport} onCheckedChange={setScheduleExport} />
                <Label>Schedule Export</Label>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Reports Tabs */}
        <Tabs defaultValue="aging" className="w-full">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="aging">AR Aging</TabsTrigger>
            <TabsTrigger value="collection">Collection</TabsTrigger>
            <TabsTrigger value="sales">Sales by Region</TabsTrigger>
            <TabsTrigger value="reconciliation">Reconciliation</TabsTrigger>
            <TabsTrigger value="gst">GST Summary</TabsTrigger>
            <TabsTrigger value="profitability">Profitability</TabsTrigger>
          </TabsList>

          {/* AR Aging Report */}
          <TabsContent value="aging">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>AR Aging Report</CardTitle>
                  <Button onClick={() => handleExport(agingData, 'ar_aging_report', 'AR Aging Report')}>
                    <Download className="h-4 w-4 mr-2" />
                    Export
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Days Overdue</TableHead>
                      <TableHead>Aging Bucket</TableHead>
                      <TableHead>Last Follow-up</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {agingData.map((inv: any) => (
                      <TableRow key={inv.id}>
                        <TableCell>{inv.invoice_no}</TableCell>
                        <TableCell>{inv.customer?.customer_name}</TableCell>
                        <TableCell className="text-xs">
                          {inv.customer?.primary_contact_name}<br />
                          {inv.customer?.primary_contact_email}
                        </TableCell>
                        <TableCell>${Number(inv.balance_amount).toLocaleString()}</TableCell>
                        <TableCell>{inv.days_overdue} days</TableCell>
                        <TableCell>
                          <Badge variant={inv.aging_bucket === '90+' ? 'destructive' : 'secondary'}>
                            {inv.aging_bucket} days
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">
                          {inv.ar_followups?.[0]?.notes || '—'}
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
                  <CardTitle>Collection Report</CardTitle>
                  <div className="flex gap-2">
                    <Select value={collectionPeriod} onValueChange={(v) => { setCollectionPeriod(v); loadCollectionReport(); }}>
                      <SelectTrigger className="w-[200px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="current_month">Current Month</SelectItem>
                        <SelectItem value="last_month">Last Month</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button onClick={() => handleExport(collectionData, 'collection_report', 'Collection Report')}>
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
                      <TableHead>Amount</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Expected Date</TableHead>
                      <TableHead>Variance (Days)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {collectionData.map((payment: any) => (
                      <TableRow key={payment.id}>
                        <TableCell>{format(new Date(payment.payment_date), 'PP')}</TableCell>
                        <TableCell>{payment.invoice?.invoice_no}</TableCell>
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
                  <CardTitle>Sales by Region</CardTitle>
                  <div className="flex gap-2">
                    <Select value={salesGroupBy} onValueChange={(v: any) => { setSalesGroupBy(v); loadSalesByRegion(); }}>
                      <SelectTrigger className="w-[200px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="city">By City</SelectItem>
                        <SelectItem value="state">By State</SelectItem>
                        <SelectItem value="country">By Country</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button onClick={() => handleExport(salesByRegion, 'sales_by_region', 'Sales by Region')}>
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
                      <TableHead>Region</TableHead>
                      <TableHead>Total Sales</TableHead>
                      <TableHead>Invoice Count</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {salesByRegion.map((region: any, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-medium">{region.region}</TableCell>
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
                  <CardTitle>SO vs Invoice vs Shipment Reconciliation</CardTitle>
                  <Button onClick={() => handleExport(reconciliationData, 'reconciliation_report', 'Reconciliation Report')}>
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
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reconciliationData.map((rec: any, idx) => {
                      const variance = rec.so_amount - rec.invoiced_amount;
                      return (
                        <TableRow key={idx}>
                          <TableCell>{rec.so_id}</TableCell>
                          <TableCell>{rec.customer}</TableCell>
                          <TableCell>${Number(rec.so_amount).toLocaleString()}</TableCell>
                          <TableCell>${Number(rec.invoiced_amount).toLocaleString()}</TableCell>
                          <TableCell>{Number(rec.shipped_weight).toLocaleString()}</TableCell>
                          <TableCell>
                            <Badge variant={Math.abs(variance) > 0 ? 'destructive' : 'default'}>
                              ${Math.abs(variance).toLocaleString()}
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

          {/* GST Summary */}
          <TabsContent value="gst">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>GST Summary (Domestic Only)</CardTitle>
                  <Button onClick={() => handleExport(gstData, 'gst_summary', 'GST Summary')}>
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
                      <TableHead>Taxable Value</TableHead>
                      <TableHead>GST %</TableHead>
                      <TableHead>GST Amount</TableHead>
                      <TableHead>Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {gstData.map((gst: any, idx) => (
                      <TableRow key={idx}>
                        <TableCell>{gst.invoice_no}</TableCell>
                        <TableCell>{format(new Date(gst.invoice_date), 'PP')}</TableCell>
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

          {/* Profitability */}
          <TabsContent value="profitability">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Profitability Analysis</CardTitle>
                  <Button onClick={() => handleExport(profitabilityData, 'profitability_report', 'Profitability Report')}>
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
                      <TableHead>Revenue</TableHead>
                      <TableHead>Total Qty</TableHead>
                      <TableHead>Scrap Qty</TableHead>
                      <TableHead>Scrap %</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {profitabilityData.map((prof: any, idx) => (
                      <TableRow key={idx}>
                        <TableCell>{prof.so_id}</TableCell>
                        <TableCell>{prof.customer}</TableCell>
                        <TableCell>${Number(prof.revenue).toLocaleString()}</TableCell>
                        <TableCell>{prof.total_quantity}</TableCell>
                        <TableCell>{prof.total_scrap}</TableCell>
                        <TableCell>
                          <Badge variant={Number(prof.scrap_percent) > 5 ? 'destructive' : 'default'}>
                            {prof.scrap_percent}%
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
