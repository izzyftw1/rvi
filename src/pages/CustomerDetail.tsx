import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Building2, Phone, Mail, MapPin, DollarSign, FileText, Plus, User, Clock, Briefcase, Download, Calendar, ArrowLeft, Edit } from "lucide-react";
import { format } from "date-fns";
import { convertToINR, formatINR } from "@/lib/currencyConverter";
import { downloadCSV, downloadExcel } from "@/lib/exportHelpers";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Customer {
  id: string;
  customer_name: string;
  party_code: string;
  city: string;
  state: string;
  country: string;
  address_line_1: string;
  primary_contact_name: string;
  primary_contact_email: string;
  primary_contact_phone: string;
  gst_number: string;
  gst_type: string;
  payment_terms_days: number;
  credit_limit_currency: string;
  credit_limit_amount: number;
  pan_number: string;
}

export default function CustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ totalAR: 0, overdueAR: 0, avgDaysToPay: 0, openSOs: 0, openWOs: 0, activeShipments: 0 });
  const [activities, setActivities] = useState<any[]>([]);
  const [salesOrders, setSalesOrders] = useState<any[]>([]);
  const [workOrders, setWorkOrders] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [dateRange, setDateRange] = useState({ start: "", end: "" });
  const [editContactOpen, setEditContactOpen] = useState(false);
  const [contactForm, setContactForm] = useState({ name: "", email: "", phone: "" });

  const isDomestic = customer?.gst_type === "domestic" || customer?.country === "India";

  useEffect(() => {
    if (id) {
      loadCustomerData();
    }
  }, [id]);

  useEffect(() => {
    if (customer) {
      loadStats();
      loadActivities();
      loadTransactions();
    }
  }, [customer]);

  const loadCustomerData = async () => {
    try {
      const { data, error } = await supabase.from("customer_master").select("*").eq("id", id).single();
      if (error) throw error;
      setCustomer(data);
      setContactForm({
        name: data.primary_contact_name || "",
        email: data.primary_contact_email || "",
        phone: data.primary_contact_phone || ""
      });
    } catch (error: any) {
      toast({ variant: "destructive", description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    if (!customer || !id) return;
    try {
      const { data: invData } = await supabase.from("invoices").select("balance_amount, status, currency").eq("customer_id", id);
      const filteredInv = (invData || []).filter((inv: any) => ["issued", "part_paid", "overdue"].includes(inv.status));
      
      // Calculate AR - convert to INR for domestic customers
      let totalAR = 0;
      let overdueAR = 0;
      
      filteredInv.forEach((inv: any) => {
        const amount = Number(inv.balance_amount || 0);
        const inrAmount = isDomestic ? convertToINR(amount, inv.currency || "INR") : amount;
        totalAR += inrAmount;
        if (inv.status === "overdue") {
          overdueAR += inrAmount;
        }
      });

      const { data: soData } = await (supabase.from("sales_orders") as any).select("id").eq("customer_id", id).in("status", ["draft", "pending", "approved"]);
      const { data: woData } = await (supabase.from("work_orders") as any).select("id").eq("customer_id", id).neq("status", "completed");
      const { data: shipData } = await (supabase.from("shipments") as any).select("id").eq("customer_id", id).is("delivered_date", null);

      setStats({ totalAR, overdueAR, avgDaysToPay: 0, openSOs: soData?.length || 0, openWOs: woData?.length || 0, activeShipments: shipData?.length || 0 });
    } catch (error: any) {
      console.error("Error loading stats:", error);
    }
  };

  const loadActivities = async () => {
    if (!customer) return;
    try {
      const { data: invAct } = await supabase.from("invoices").select("id, invoice_no, invoice_date, total_amount, currency").eq("customer_id", id).order("invoice_date", { ascending: false }).limit(5);
      const { data: soAct } = await supabase.from("sales_orders").select("id, so_id, created_at, total_amount, currency").eq("customer_id", id).order("created_at", { ascending: false }).limit(5);
      const { data: payAct } = await supabase.from("customer_receipts").select("id, receipt_no, receipt_date, total_amount, currency").eq("customer_id", id).order("receipt_date", { ascending: false }).limit(5);
      
      const combined = [
        ...(invAct || []).map(inv => ({ 
          type: "invoice", 
          date: inv.invoice_date, 
          description: `Invoice ${inv.invoice_no} issued`,
          amount: `${inv.currency || 'INR'} ${Number(inv.total_amount).toLocaleString()}`,
          icon: FileText 
        })),
        ...(soAct || []).map(so => ({ 
          type: "sales_order", 
          date: so.created_at, 
          description: `Sales Order ${so.so_id} created`,
          amount: `${so.currency || 'USD'} ${Number(so.total_amount).toLocaleString()}`,
          icon: FileText 
        })),
        ...(payAct || []).map(pay => ({ 
          type: "payment", 
          date: pay.receipt_date, 
          description: `Payment ${pay.receipt_no} received`,
          amount: `${pay.currency || 'INR'} ${Number(pay.total_amount).toLocaleString()}`,
          icon: DollarSign 
        })),
      ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      
      setActivities(combined.slice(0, 15));
    } catch (error: any) {
      console.error("Error loading activities:", error);
    }
  };

  const loadTransactions = async () => {
    if (!customer) return;
    try {
      const { data: soData } = await supabase.from("sales_orders").select("id, so_id, status, total_amount, currency, created_at, order_date").eq("customer_id", id).order("created_at", { ascending: false }).limit(50);
      setSalesOrders(soData || []);

      const { data: woData } = await supabase.from("work_orders").select("id, display_id, item_code, quantity, status, due_date, created_at").eq("customer_id", id).order("created_at", { ascending: false }).limit(50);
      setWorkOrders(woData || []);

      const { data: invData } = await supabase.from("invoices").select("id, invoice_no, invoice_date, total_amount, balance_amount, status, currency, due_date").eq("customer_id", id).order("invoice_date", { ascending: false }).limit(50);
      setInvoices(invData || []);
    } catch (error: any) {
      console.error("Error loading transactions:", error);
    }
  };

  const handleNewSalesOrder = () => navigate("/sales", { state: { prefilledCustomer: customer?.customer_name } });

  const handleUpdateContact = async () => {
    if (!customer) return;
    try {
      const { error } = await supabase
        .from("customer_master")
        .update({
          primary_contact_name: contactForm.name || null,
          primary_contact_email: contactForm.email || null,
          primary_contact_phone: contactForm.phone || null,
        })
        .eq("id", customer.id);
      
      if (error) throw error;
      toast({ description: "Contact updated successfully" });
      setEditContactOpen(false);
      loadCustomerData();
    } catch (error: any) {
      toast({ variant: "destructive", description: error.message });
    }
  };

  // Filter data by date range
  const filteredSalesOrders = useMemo(() => {
    if (!dateRange.start && !dateRange.end) return salesOrders;
    return salesOrders.filter(so => {
      const date = new Date(so.order_date || so.created_at);
      if (dateRange.start && date < new Date(dateRange.start)) return false;
      if (dateRange.end && date > new Date(dateRange.end)) return false;
      return true;
    });
  }, [salesOrders, dateRange]);

  const filteredWorkOrders = useMemo(() => {
    if (!dateRange.start && !dateRange.end) return workOrders;
    return workOrders.filter(wo => {
      const date = new Date(wo.created_at);
      if (dateRange.start && date < new Date(dateRange.start)) return false;
      if (dateRange.end && date > new Date(dateRange.end)) return false;
      return true;
    });
  }, [workOrders, dateRange]);

  const filteredInvoices = useMemo(() => {
    if (!dateRange.start && !dateRange.end) return invoices;
    return invoices.filter(inv => {
      const date = new Date(inv.invoice_date);
      if (dateRange.start && date < new Date(dateRange.start)) return false;
      if (dateRange.end && date > new Date(dateRange.end)) return false;
      return true;
    });
  }, [invoices, dateRange]);

  // Export functions
  const exportSalesOrders = (type: 'csv' | 'excel') => {
    const data = filteredSalesOrders.map(so => ({
      "SO Number": so.so_id,
      "Date": so.order_date || so.created_at ? format(new Date(so.order_date || so.created_at), 'yyyy-MM-dd') : '',
      "Status": so.status,
      "Currency": so.currency || 'USD',
      "Total": Number(so.total_amount || 0).toFixed(2)
    }));
    if (type === 'csv') downloadCSV(data, `${customer?.customer_name}_sales_orders`);
    else downloadExcel(data, `${customer?.customer_name}_sales_orders`, 'Sales Orders');
  };

  const exportWorkOrders = (type: 'csv' | 'excel') => {
    const data = filteredWorkOrders.map(wo => ({
      "WO Number": wo.display_id,
      "Item Code": wo.item_code,
      "Quantity": wo.quantity,
      "Status": wo.status,
      "Due Date": wo.due_date || '',
      "Created": wo.created_at ? format(new Date(wo.created_at), 'yyyy-MM-dd') : ''
    }));
    if (type === 'csv') downloadCSV(data, `${customer?.customer_name}_work_orders`);
    else downloadExcel(data, `${customer?.customer_name}_work_orders`, 'Work Orders');
  };

  const exportInvoices = (type: 'csv' | 'excel') => {
    const data = filteredInvoices.map(inv => ({
      "Invoice Number": inv.invoice_no,
      "Date": inv.invoice_date ? format(new Date(inv.invoice_date), 'yyyy-MM-dd') : '',
      "Due Date": inv.due_date || '',
      "Status": inv.status,
      "Currency": inv.currency || 'INR',
      "Total": Number(inv.total_amount || 0).toFixed(2),
      "Balance": Number(inv.balance_amount || 0).toFixed(2)
    }));
    if (type === 'csv') downloadCSV(data, `${customer?.customer_name}_invoices`);
    else downloadExcel(data, `${customer?.customer_name}_invoices`, 'Invoices');
  };

  const formatAmount = (amount: number, currency: string = 'USD') => {
    if (isDomestic) {
      return formatINR(convertToINR(amount, currency));
    }
    return `${currency} ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  if (loading) return <div className="p-6"><p className="text-muted-foreground">Loading...</p></div>;
  if (!customer) return <div className="p-6"><Card><CardContent className="py-8 text-center"><p>Customer not found</p><Button className="mt-4" onClick={() => navigate("/customers")}>Back</Button></CardContent></Card></div>;

  return (
    <div className="min-h-screen bg-background p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate("/customers")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{customer.customer_name}</h1>
            <p className="text-sm text-muted-foreground">{customer.party_code}</p>
          </div>
        </div>
        <Button onClick={handleNewSalesOrder}><Plus className="h-4 w-4 mr-2" />New Sales Order</Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total AR</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{isDomestic ? formatINR(stats.totalAR) : `$${stats.totalAR.toFixed(0)}`}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Overdue</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-destructive">{isDomestic ? formatINR(stats.overdueAR) : `$${stats.overdueAR.toFixed(0)}`}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Open SOs</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{stats.openSOs}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Open WOs</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{stats.openWOs}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Shipments</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{stats.activeShipments}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Type</CardTitle></CardHeader>
          <CardContent><Badge variant={isDomestic ? "default" : "secondary"}>{isDomestic ? "Domestic" : "Export"}</Badge></CardContent>
        </Card>
      </div>

      {/* Date Range Filter */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Date Range:</span>
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={dateRange.start}
                onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                className="w-40"
              />
              <span className="text-muted-foreground">to</span>
              <Input
                type="date"
                value={dateRange.end}
                onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                className="w-40"
              />
            </div>
            {(dateRange.start || dateRange.end) && (
              <Button variant="ghost" size="sm" onClick={() => setDateRange({ start: "", end: "" })}>
                Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="transactions">Sales Orders ({filteredSalesOrders.length})</TabsTrigger>
          <TabsTrigger value="workorders">Work Orders ({filteredWorkOrders.length})</TabsTrigger>
          <TabsTrigger value="invoices">Invoices ({filteredInvoices.length})</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5" />Company Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div><p className="text-sm text-muted-foreground">Party Code</p><p className="font-medium">{customer.party_code || "—"}</p></div>
              <div><p className="text-sm text-muted-foreground">GST Number</p><p className="font-medium">{customer.gst_number || "—"}</p></div>
              {isDomestic && (
                <div><p className="text-sm text-muted-foreground">PAN Number</p><p className="font-medium">{customer.pan_number || "—"}</p></div>
              )}
              <div>
                <p className="text-sm text-muted-foreground">Address</p>
                <p className="font-medium">
                  {[customer.address_line_1, customer.city, customer.state, customer.country].filter(Boolean).join(", ") || "—"}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2"><User className="h-5 w-5" />Primary Contact</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setEditContactOpen(true)}>
                <Edit className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <span>{customer.primary_contact_name || "No contact name"}</span>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span>{customer.primary_contact_email || "No email"}</span>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <span>{customer.primary_contact_phone || "No phone"}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><DollarSign className="h-5 w-5" />Payment Terms</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div><p className="text-sm text-muted-foreground">Payment Terms</p><p className="font-medium">{customer.payment_terms_days} days</p></div>
              <div><p className="text-sm text-muted-foreground">Credit Limit</p><p className="font-medium">{customer.credit_limit_currency} {customer.credit_limit_amount?.toLocaleString() || "0"}</p></div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="transactions">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Sales Orders</CardTitle>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => exportSalesOrders('csv')}>
                  <Download className="h-4 w-4 mr-2" />CSV
                </Button>
                <Button variant="outline" size="sm" onClick={() => exportSalesOrders('excel')}>
                  <Download className="h-4 w-4 mr-2" />Excel
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {filteredSalesOrders.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">No sales orders</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>SO #</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSalesOrders.map(so => (
                      <TableRow 
                        key={so.id} 
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => navigate(`/sales?order=${so.id}`)}
                      >
                        <TableCell className="font-medium text-primary">{so.so_id}</TableCell>
                        <TableCell>{so.order_date || so.created_at ? format(new Date(so.order_date || so.created_at), 'dd MMM yyyy') : '—'}</TableCell>
                        <TableCell><Badge variant={so.status === 'approved' ? 'default' : 'secondary'}>{so.status}</Badge></TableCell>
                        <TableCell className="text-right">{formatAmount(Number(so.total_amount || 0), so.currency)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="workorders">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2"><Briefcase className="h-5 w-5" />Work Orders</CardTitle>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => exportWorkOrders('csv')}>
                  <Download className="h-4 w-4 mr-2" />CSV
                </Button>
                <Button variant="outline" size="sm" onClick={() => exportWorkOrders('excel')}>
                  <Download className="h-4 w-4 mr-2" />Excel
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {filteredWorkOrders.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">No work orders for this customer</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>WO #</TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredWorkOrders.map(wo => (
                      <TableRow 
                        key={wo.id} 
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => navigate(`/work-orders/${wo.id}`)}
                      >
                        <TableCell className="font-medium text-primary">{wo.display_id}</TableCell>
                        <TableCell>{wo.item_code}</TableCell>
                        <TableCell className="text-right">{wo.quantity?.toLocaleString()}</TableCell>
                        <TableCell><Badge variant={wo.status === 'completed' ? 'default' : 'secondary'}>{wo.status}</Badge></TableCell>
                        <TableCell>{wo.due_date ? format(new Date(wo.due_date), 'dd MMM yyyy') : '—'}</TableCell>
                        <TableCell>{wo.created_at ? format(new Date(wo.created_at), 'dd MMM yyyy') : '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="invoices">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Invoices</CardTitle>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => exportInvoices('csv')}>
                  <Download className="h-4 w-4 mr-2" />CSV
                </Button>
                <Button variant="outline" size="sm" onClick={() => exportInvoices('excel')}>
                  <Download className="h-4 w-4 mr-2" />Excel
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {filteredInvoices.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">No invoices</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice #</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredInvoices.map(inv => (
                      <TableRow 
                        key={inv.id} 
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => navigate(`/finance/invoices/${inv.id}`)}
                      >
                        <TableCell className="font-medium text-primary">{inv.invoice_no}</TableCell>
                        <TableCell>{inv.invoice_date ? format(new Date(inv.invoice_date), 'dd MMM yyyy') : '—'}</TableCell>
                        <TableCell>{inv.due_date ? format(new Date(inv.due_date), 'dd MMM yyyy') : '—'}</TableCell>
                        <TableCell><Badge variant={inv.status === 'paid' ? 'default' : inv.status === 'overdue' ? 'destructive' : 'secondary'}>{inv.status}</Badge></TableCell>
                        <TableCell className="text-right">{formatAmount(Number(inv.total_amount || 0), inv.currency)}</TableCell>
                        <TableCell className="text-right">{formatAmount(Number(inv.balance_amount || 0), inv.currency)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity">
          <Card>
            <CardHeader><CardTitle>Recent Activity</CardTitle></CardHeader>
            <CardContent>
              {activities.length === 0 ? (
                <div className="text-center py-8">
                  <Clock className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground">No activity yet</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {activities.map((a, i) => (
                    <div key={i} className="flex gap-4 items-start border-b pb-3 last:border-0">
                      <div className="rounded-full p-2 bg-muted shrink-0">
                        {a.type === 'payment' ? <DollarSign className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{a.description}</p>
                        <p className="text-xs text-muted-foreground">{a.amount}</p>
                      </div>
                      <div className="text-xs text-muted-foreground shrink-0">
                        {a.date ? format(new Date(a.date), 'dd MMM yyyy') : ''}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit Contact Dialog */}
      <Dialog open={editContactOpen} onOpenChange={setEditContactOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Primary Contact</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Contact Name</Label>
              <Input
                value={contactForm.name}
                onChange={(e) => setContactForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Contact person name"
              />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={contactForm.email}
                onChange={(e) => setContactForm(prev => ({ ...prev, email: e.target.value }))}
                placeholder="email@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input
                value={contactForm.phone}
                onChange={(e) => setContactForm(prev => ({ ...prev, phone: e.target.value }))}
                placeholder="+91 12345 67890"
              />
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setEditContactOpen(false)}>Cancel</Button>
              <Button onClick={handleUpdateContact}>Save Contact</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}