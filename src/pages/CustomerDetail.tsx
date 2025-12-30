import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Building2, Phone, Mail, MapPin, DollarSign, FileText, Package, Plus, User, Clock, Briefcase } from "lucide-react";

interface Customer {
  id: string;
  customer_name: string;
  party_code: string;
  city: string;
  state: string;
  country: string;
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
    } catch (error: any) {
      toast({ variant: "destructive", description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    if (!customer || !id) return;
    try {
      const { data: invData } = await supabase.from("invoices").select("balance_amount, status").eq("customer_id", id);
      const filteredInv = (invData || []).filter((inv: any) => ["issued", "part_paid", "overdue"].includes(inv.status));
      const totalAR = filteredInv.reduce((sum: number, inv: any) => sum + Number(inv.balance_amount), 0);
      const overdueAR = filteredInv.filter((inv: any) => inv.status === "overdue").reduce((sum: number, inv: any) => sum + Number(inv.balance_amount), 0);

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
      const { data: invAct } = await supabase.from("invoices").select("id, invoice_no, invoice_date, total_amount").eq("customer_id", id).order("invoice_date", { ascending: false }).limit(5);
      const combined = (invAct || []).map(inv => ({ type: "invoice", date: inv.invoice_date, description: `Invoice ${inv.invoice_no} issued - ${Number(inv.total_amount).toFixed(2)}`, icon: FileText }));
      setActivities(combined.slice(0, 10));
    } catch (error: any) {
      console.error("Error loading activities:", error);
    }
  };

  const loadTransactions = async () => {
    if (!customer) return;
    try {
      const { data: soData } = await supabase.from("sales_orders").select("id, so_id, status, total_amount, currency, created_at").eq("customer_id", id).order("created_at", { ascending: false }).limit(20);
      setSalesOrders(soData || []);

      const { data: woData } = await supabase.from("work_orders").select("id, display_id, item_code, quantity, status, due_date").eq("customer_id", id).order("created_at", { ascending: false }).limit(20);
      setWorkOrders(woData || []);

      const { data: invData } = await supabase.from("invoices").select("id, invoice_no, invoice_date, total_amount, balance_amount, status, currency").eq("customer_id", id).order("invoice_date", { ascending: false }).limit(20);
      setInvoices(invData || []);
    } catch (error: any) {
      console.error("Error loading transactions:", error);
    }
  };

  const handleNewSalesOrder = () => navigate("/sales", { state: { prefilledCustomer: customer?.customer_name } });

  if (loading) return <div className="p-6"><p className="text-muted-foreground">Loading...</p></div>;
  if (!customer) return <div className="p-6"><Card><CardContent className="py-8 text-center"><p>Customer not found</p><Button className="mt-4" onClick={() => navigate("/customers")}>Back</Button></CardContent></Card></div>;

  return (
    <div className="min-h-screen bg-background p-6 space-y-6">
      <div className="flex gap-3">
        <Button onClick={handleNewSalesOrder}><Plus className="h-4 w-4 mr-2" />New Sales Order</Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {[{ label: "Total AR", value: `$${stats.totalAR.toFixed(0)}` }, { label: "Overdue", value: `$${stats.overdueAR.toFixed(0)}`, className: "text-destructive" }, { label: "Open SOs", value: stats.openSOs }, { label: "Open WOs", value: stats.openWOs }, { label: "Shipments", value: stats.activeShipments }].map((s, i) => (
          <Card key={i}><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{s.label}</CardTitle></CardHeader><CardContent><div className={`text-2xl font-bold ${s.className || ''}`}>{s.value}</div></CardContent></Card>
        ))}
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
          <TabsTrigger value="workorders">Work Orders</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card><CardHeader><CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5" />Company Info</CardTitle></CardHeader><CardContent className="space-y-3">
            <div><p className="text-sm text-muted-foreground">Party Code</p><p>{customer.party_code || "—"}</p></div>
            <div><p className="text-sm text-muted-foreground">GST</p><p>{customer.gst_number || "—"}</p></div>
            <div><p className="text-sm text-muted-foreground">PAN</p><p>{customer.pan_number || "—"}</p></div>
            <div><p className="text-sm text-muted-foreground">Location</p><p>{customer.city}, {customer.state}, {customer.country}</p></div>
          </CardContent></Card>
          <Card><CardHeader><CardTitle className="flex items-center gap-2"><DollarSign className="h-5 w-5" />Payment</CardTitle></CardHeader><CardContent className="space-y-3">
            <div><p className="text-sm text-muted-foreground">Terms</p><p>{customer.payment_terms_days} days</p></div>
            <div><p className="text-sm text-muted-foreground">Credit Limit</p><p>{customer.credit_limit_currency} {customer.credit_limit_amount?.toFixed(2) || "0.00"}</p></div>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="transactions">
          <Card><CardHeader><CardTitle>Sales Orders</CardTitle></CardHeader><CardContent>
            {salesOrders.length === 0 ? <p className="text-muted-foreground text-center py-4">No sales orders</p> : (
              <Table><TableHeader><TableRow><TableHead>SO #</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
                <TableBody>{salesOrders.map(so => <TableRow key={so.id}><TableCell className="font-medium">{so.so_id}</TableCell><TableCell><Badge variant={so.status === 'approved' ? 'default' : 'secondary'}>{so.status}</Badge></TableCell><TableCell className="text-right">{so.currency} {Number(so.total_amount || 0).toFixed(2)}</TableCell></TableRow>)}</TableBody></Table>
            )}
          </CardContent></Card>
          <Card className="mt-4"><CardHeader><CardTitle>Invoices</CardTitle></CardHeader><CardContent>
            {invoices.length === 0 ? <p className="text-muted-foreground text-center py-4">No invoices</p> : (
              <Table><TableHeader><TableRow><TableHead>Invoice #</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Total</TableHead><TableHead className="text-right">Balance</TableHead></TableRow></TableHeader>
                <TableBody>{invoices.map(inv => <TableRow key={inv.id}><TableCell className="font-medium">{inv.invoice_no}</TableCell><TableCell><Badge variant={inv.status === 'paid' ? 'default' : 'secondary'}>{inv.status}</Badge></TableCell><TableCell className="text-right">{inv.currency} {Number(inv.total_amount || 0).toFixed(2)}</TableCell><TableCell className="text-right">{inv.currency} {Number(inv.balance_amount || 0).toFixed(2)}</TableCell></TableRow>)}</TableBody></Table>
            )}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="workorders">
          <Card><CardHeader><CardTitle className="flex items-center gap-2"><Briefcase className="h-5 w-5" />Work Order History</CardTitle></CardHeader><CardContent>
            {workOrders.length === 0 ? <p className="text-muted-foreground text-center py-4">No work orders for this customer</p> : (
              <Table><TableHeader><TableRow><TableHead>WO #</TableHead><TableHead>Item</TableHead><TableHead className="text-right">Qty</TableHead><TableHead>Status</TableHead><TableHead>Due</TableHead></TableRow></TableHeader>
                <TableBody>{workOrders.map(wo => <TableRow key={wo.id}><TableCell className="font-medium">{wo.display_id}</TableCell><TableCell>{wo.item_code}</TableCell><TableCell className="text-right">{wo.quantity}</TableCell><TableCell><Badge variant={wo.status === 'completed' ? 'default' : 'secondary'}>{wo.status}</Badge></TableCell><TableCell>{wo.due_date}</TableCell></TableRow>)}</TableBody></Table>
            )}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="activity">
          <Card><CardHeader><CardTitle>Recent Activity</CardTitle></CardHeader><CardContent>
            {activities.length === 0 ? <div className="text-center py-8"><Clock className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" /><p className="text-sm text-muted-foreground">No activity yet</p></div> : (
              <div className="space-y-4">{activities.map((a, i) => <div key={i} className="flex gap-4 items-center"><div className="rounded-full p-2 bg-muted"><FileText className="h-4 w-4" /></div><div><p className="text-sm">{a.description}</p><p className="text-xs text-muted-foreground">{a.date}</p></div></div>)}</div>
            )}
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
