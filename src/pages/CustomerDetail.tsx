import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { NavigationHeader } from "@/components/NavigationHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { 
  Building2, 
  Phone, 
  Mail, 
  MapPin, 
  DollarSign, 
  FileText, 
  Package, 
  Truck,
  AlertCircle,
  Plus,
  User,
  Clock
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Contact {
  id: string;
  name: string;
  role: string;
  email: string;
  phone: string;
}

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
}

export default function CustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalAR: 0,
    overdueAR: 0,
    avgDaysToPay: 0,
    openSOs: 0,
    openWOs: 0,
    activeShipments: 0
  });
  const [activities, setActivities] = useState<any[]>([]);
  const [showContactDialog, setShowContactDialog] = useState(false);
  const [showFollowupDialog, setShowFollowupDialog] = useState(false);

  useEffect(() => {
    if (id) {
      loadCustomerData();
      loadStats();
      loadActivities();
    }
  }, [id]);

  const loadCustomerData = async () => {
    try {
      const { data, error } = await supabase
        .from("customer_master")
        .select("*")
        .eq("id", id)
        .single();

      if (error) throw error;
      setCustomer(data);
    } catch (error: any) {
      toast({ variant: "destructive", description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      // Total AR for this customer
      const { data: invoices } = await supabase
        .from("invoices")
        .select("balance_amount, status")
        .eq("customer_id", id)
        .in("status", ["issued", "part_paid", "overdue"]);

      const totalAR = invoices?.reduce((sum, inv) => sum + Number(inv.balance_amount), 0) || 0;
      const overdueAR = invoices?.filter(inv => inv.status === "overdue")
        .reduce((sum, inv) => sum + Number(inv.balance_amount), 0) || 0;

      // Open Sales Orders
      const { data: salesOrders } = await supabase
        .from("sales_orders")
        .select("id", { count: "exact" })
        .eq("customer", customer?.customer_name)
        .in("status", ["draft", "pending_approval", "approved"]);

      // Open Work Orders
      const { data: workOrders } = await supabase
        .from("work_orders")
        .select("id", { count: "exact" })
        .eq("customer", customer?.customer_name)
        .neq("status", "completed");

      // Active Shipments
      const { data: shipments } = await supabase
        .from("shipments")
        .select("id", { count: "exact" })
        .eq("customer", customer?.customer_name)
        .is("delivered_date", null);

      // Average days to pay (from payments)
      const { data: payments } = await supabase
        .from("payments")
        .select(`
          payment_date,
          invoices!inner(invoice_date, customer_id)
        `)
        .eq("invoices.customer_id", id);

      let avgDaysToPay = 0;
      if (payments && payments.length > 0) {
        const totalDays = payments.reduce((sum, payment: any) => {
          const invoiceDate = new Date(payment.invoices.invoice_date);
          const paymentDate = new Date(payment.payment_date);
          const days = Math.floor((paymentDate.getTime() - invoiceDate.getTime()) / (1000 * 60 * 60 * 24));
          return sum + days;
        }, 0);
        avgDaysToPay = Math.round(totalDays / payments.length);
      }

      setStats({
        totalAR,
        overdueAR,
        avgDaysToPay,
        openSOs: salesOrders?.length || 0,
        openWOs: workOrders?.length || 0,
        activeShipments: shipments?.length || 0
      });
    } catch (error: any) {
      console.error("Error loading stats:", error);
    }
  };

  const loadActivities = async () => {
    try {
      // Combine invoices, payments, and follow-ups
      const { data: invoiceActivity } = await supabase
        .from("invoices")
        .select("id, invoice_no, invoice_date, total_amount")
        .eq("customer_id", id)
        .order("invoice_date", { ascending: false })
        .limit(5);

      const { data: paymentActivity } = await supabase
        .from("payments")
        .select(`
          id,
          payment_date,
          amount,
          invoices!inner(invoice_no, customer_id)
        `)
        .eq("invoices.customer_id", id)
        .order("payment_date", { ascending: false })
        .limit(5);

      const { data: followupActivity } = await supabase
        .from("ar_followups")
        .select(`
          id,
          followup_date,
          outcome,
          notes,
          invoices!inner(invoice_no, customer_id)
        `)
        .eq("invoices.customer_id", id)
        .order("followup_date", { ascending: false })
        .limit(5);

      const combined = [
        ...(invoiceActivity?.map(inv => ({
          type: "invoice",
          date: inv.invoice_date,
          description: `Invoice ${inv.invoice_no} issued - $${Number(inv.total_amount).toFixed(2)}`,
          icon: FileText
        })) || []),
        ...(paymentActivity?.map((pay: any) => ({
          type: "payment",
          date: pay.payment_date,
          description: `Payment received $${Number(pay.amount).toFixed(2)} for ${pay.invoices.invoice_no}`,
          icon: DollarSign
        })) || []),
        ...(followupActivity?.map((fup: any) => ({
          type: "followup",
          date: fup.followup_date,
          description: `Follow-up: ${fup.outcome} - ${fup.notes || 'No notes'}`,
          icon: Phone
        })) || [])
      ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      setActivities(combined.slice(0, 10));
    } catch (error: any) {
      console.error("Error loading activities:", error);
    }
  };

  const handleNewSalesOrder = () => {
    navigate("/sales", { state: { prefilledCustomer: customer?.customer_name } });
  };

  const handleNewFollowup = () => {
    setShowFollowupDialog(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <NavigationHeader title="Customer Detail" subtitle="Loading..." />
        <div className="p-6">
          <p className="text-muted-foreground">Loading customer data...</p>
        </div>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="min-h-screen bg-background">
        <NavigationHeader title="Customer Detail" subtitle="Not Found" />
        <div className="p-6">
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-muted-foreground">Customer not found</p>
              <Button className="mt-4" onClick={() => navigate("/customers")}>
                Back to Customers
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <NavigationHeader 
        title={customer.customer_name} 
        subtitle={`${customer.party_code || 'No Party Code'} • ${customer.city || ''}, ${customer.country || ''}`}
      />
      
      <div className="p-6 space-y-6">
        {/* Quick Actions */}
        <div className="flex gap-3">
          <Button onClick={handleNewSalesOrder}>
            <Plus className="h-4 w-4 mr-2" />
            New Sales Order
          </Button>
          <Button variant="outline" onClick={handleNewFollowup}>
            <Phone className="h-4 w-4 mr-2" />
            New Follow-up
          </Button>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total AR</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${stats.totalAR.toFixed(0)}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Overdue</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">${stats.overdueAR.toFixed(0)}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Avg Days to Pay</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.avgDaysToPay}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Open SOs</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.openSOs}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Open WOs</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.openWOs}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Active Shipments</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.activeShipments}</div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="contacts">Contacts</TabsTrigger>
            <TabsTrigger value="transactions">Transactions</TabsTrigger>
            <TabsTrigger value="activity">Activity Timeline</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="h-5 w-5" />
                    Company Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Party Code</p>
                    <p className="text-sm">{customer.party_code || "—"}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">GST Number</p>
                    <p className="text-sm">{customer.gst_number || "—"}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">GST Type</p>
                    <Badge variant={customer.gst_type === "domestic" ? "default" : "secondary"}>
                      {customer.gst_type || "Not Set"}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Location</p>
                    <p className="text-sm flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {customer.city}, {customer.state}, {customer.country}
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <DollarSign className="h-5 w-5" />
                    Payment Terms
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Payment Terms</p>
                    <p className="text-sm">{customer.payment_terms_days} days</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Currency</p>
                    <p className="text-sm">{customer.credit_limit_currency || "USD"}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Credit Limit</p>
                    <p className="text-sm font-semibold">
                      {customer.credit_limit_currency} {customer.credit_limit_amount?.toFixed(2) || "0.00"}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Available Credit</p>
                    <p className="text-sm font-semibold text-green-600">
                      {customer.credit_limit_currency} {((customer.credit_limit_amount || 0) - stats.totalAR).toFixed(2)}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="contacts" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Primary Contact</CardTitle>
                <Button size="sm" onClick={() => setShowContactDialog(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Contact
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 border rounded-lg">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <User className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">{customer.primary_contact_name || "No Name"}</p>
                      <p className="text-sm text-muted-foreground">Primary Contact</p>
                    </div>
                  </div>
                  <div className="space-y-2 text-sm">
                    <p className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      {customer.primary_contact_email || "—"}
                    </p>
                    <p className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      {customer.primary_contact_phone || "—"}
                    </p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground text-center">
                  Additional contacts can be added (feature pending)
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="transactions" className="space-y-4">
            <p className="text-sm text-muted-foreground">
              View all sales orders, work orders, invoices, and shipments for this customer (feature pending)
            </p>
          </TabsContent>

          <TabsContent value="activity" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
              </CardHeader>
              <CardContent>
                {activities.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No activity yet
                  </p>
                ) : (
                  <div className="space-y-4">
                    {activities.map((activity, idx) => {
                      const Icon = activity.icon;
                      return (
                        <div key={idx} className="flex gap-4">
                          <div className="flex flex-col items-center">
                            <div className="rounded-full p-2 bg-muted">
                              <Icon className="h-4 w-4" />
                            </div>
                            {idx < activities.length - 1 && (
                              <div className="w-px bg-border h-full mt-2" />
                            )}
                          </div>
                          <div className="flex-1 pb-4">
                            <p className="text-sm">{activity.description}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {new Date(activity.date).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
