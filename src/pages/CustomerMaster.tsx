import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { NavigationHeader } from "@/components/NavigationHeader";
import { useToast } from "@/hooks/use-toast";
import { Plus, Edit, Trash2, Search, Eye, BarChart3 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useNavigate } from "react-router-dom";

export default function CustomerMaster() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<any>(null);
  const [formData, setFormData] = useState({
    customer_name: "",
    party_code: "",
    city: "",
    state: "",
    country: "",
    gst_number: "",
    gst_type: "not_applicable" as "domestic" | "export" | "not_applicable",
    credit_limit_amount: "",
    credit_limit_currency: "USD",
    payment_terms_days: "30",
    primary_contact_name: "",
    primary_contact_email: "",
    primary_contact_phone: "",
  });

  useEffect(() => {
    loadCustomers();
  }, []);

  const loadCustomers = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("customer_master")
      .select("*")
      .order("last_used", { ascending: false });
    
    if (!error && data) {
      setCustomers(data);
    }
    setLoading(false);
  };

  const generatePartyCode = (name: string) => {
    const prefix = name.replace(/[^a-zA-Z]/g, '').substring(0, 3).toUpperCase();
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    return `${prefix}${randomNum}`;
  };

  const handleAdd = () => {
    setEditingCustomer(null);
    setFormData({
      customer_name: "",
      party_code: "",
      city: "",
      state: "",
      country: "",
      gst_number: "",
      gst_type: "not_applicable",
      credit_limit_amount: "",
      credit_limit_currency: "USD",
      payment_terms_days: "30",
      primary_contact_name: "",
      primary_contact_email: "",
      primary_contact_phone: "",
    });
    setIsDialogOpen(true);
  };

  const handleEdit = (customer: any) => {
    setEditingCustomer(customer);
    setFormData({
      customer_name: customer.customer_name,
      party_code: customer.party_code || "",
      city: customer.city || "",
      state: customer.state || "",
      country: customer.country || "",
      gst_number: customer.gst_number || "",
      gst_type: customer.gst_type || "not_applicable",
      credit_limit_amount: customer.credit_limit_amount?.toString() || "",
      credit_limit_currency: customer.credit_limit_currency || "USD",
      payment_terms_days: customer.payment_terms_days?.toString() || "30",
      primary_contact_name: customer.primary_contact_name || "",
      primary_contact_email: customer.primary_contact_email || "",
      primary_contact_phone: customer.primary_contact_phone || "",
    });
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.customer_name.trim()) {
      toast({ variant: "destructive", description: "Customer name is required" });
      return;
    }

    setLoading(true);
    try {
      const dataToSave = {
        customer_name: formData.customer_name,
        party_code: formData.party_code || generatePartyCode(formData.customer_name),
        city: formData.city || null,
        state: formData.state || null,
        country: formData.country || null,
        gst_number: formData.gst_number || null,
        gst_type: formData.gst_type,
        credit_limit_amount: formData.credit_limit_amount ? parseFloat(formData.credit_limit_amount) : null,
        credit_limit_currency: formData.credit_limit_currency,
        payment_terms_days: formData.payment_terms_days ? parseInt(formData.payment_terms_days) : 30,
        primary_contact_name: formData.primary_contact_name || null,
        primary_contact_email: formData.primary_contact_email || null,
        primary_contact_phone: formData.primary_contact_phone || null,
        last_used: new Date().toISOString()
      };

      if (editingCustomer) {
        // Update
        const { error } = await supabase
          .from("customer_master")
          .update(dataToSave)
          .eq("id", editingCustomer.id);
        
        if (error) throw error;
        toast({ description: "Customer updated successfully" });
      } else {
        // Insert
        const { error } = await supabase
          .from("customer_master")
          .insert([dataToSave]);
        
        if (error) throw error;
        toast({ description: "Customer added successfully" });
      }

      setIsDialogOpen(false);
      await loadCustomers();
    } catch (err: any) {
      toast({ variant: "destructive", description: `Error: ${err.message}` });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete customer "${name}"?`)) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from("customer_master")
        .delete()
        .eq("id", id);
      
      if (error) throw error;
      toast({ description: "Customer deleted successfully" });
      await loadCustomers();
    } catch (err: any) {
      toast({ variant: "destructive", description: `Error: ${err.message}` });
    } finally {
      setLoading(false);
    }
  };

  const filteredCustomers = customers.filter(c =>
    c.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.party_code?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-background">
      <NavigationHeader title="Customer Master" subtitle="Manage customer database" />
      
      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>Customers</CardTitle>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => navigate("/customers/reports")}>
                  <BarChart3 className="h-4 w-4 mr-2" />
                  Reports
                </Button>
                <Button onClick={handleAdd}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Customer
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* Search */}
            <div className="mb-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search customers by name or party code..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            {/* Table */}
            {loading ? (
              <p className="text-center py-8 text-muted-foreground">Loading...</p>
            ) : filteredCustomers.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">
                {searchTerm ? "No customers found" : "No customers yet. Add your first customer."}
              </p>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                  <TableRow>
                    <TableHead>Customer Name</TableHead>
                    <TableHead>Party Code</TableHead>
                    <TableHead>City</TableHead>
                    <TableHead>State</TableHead>
                    <TableHead>Country</TableHead>
                    <TableHead>GST Type</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Last Used</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                  </TableHeader>
                  <TableBody>
                     {filteredCustomers.map((customer) => (
                      <TableRow key={customer.id}>
                        <TableCell className="font-medium">{customer.customer_name}</TableCell>
                        <TableCell>{customer.party_code || "—"}</TableCell>
                        <TableCell>{customer.city || "—"}</TableCell>
                        <TableCell>{customer.state || "—"}</TableCell>
                        <TableCell>{customer.country || "—"}</TableCell>
                        <TableCell>
                          <span className="text-xs px-2 py-1 rounded-full bg-muted">
                            {customer.gst_type === "domestic" ? "Domestic" : 
                             customer.gst_type === "export" ? "Export" : "N/A"}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm">
                          {customer.primary_contact_name || customer.primary_contact_email || "—"}
                        </TableCell>
                        <TableCell>
                          {customer.last_used 
                            ? new Date(customer.last_used).toLocaleDateString()
                            : "Never"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => navigate(`/customers/${customer.id}`)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEdit(customer)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(customer.id, customer.customer_name)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingCustomer ? "Edit Customer" : "Add Customer"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-2">
                <Label>Customer Name *</Label>
                <Input
                  value={formData.customer_name}
                  onChange={(e) => {
                    const name = e.target.value;
                    setFormData({
                      ...formData,
                      customer_name: name,
                      party_code: formData.party_code || (name.length >= 3 ? generatePartyCode(name) : "")
                    });
                  }}
                  placeholder="Enter customer name"
                />
              </div>
              <div className="space-y-2">
                <Label>Party Code</Label>
                <Input
                  value={formData.party_code}
                  onChange={(e) => setFormData({ ...formData, party_code: e.target.value })}
                  placeholder="Auto-generated or enter custom code"
                />
              </div>
              <div className="space-y-2">
                <Label>GST Type</Label>
                <select
                  value={formData.gst_type}
                  onChange={(e) => setFormData({ ...formData, gst_type: e.target.value as any })}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="not_applicable">Not Applicable</option>
                  <option value="domestic">Domestic</option>
                  <option value="export">Export</option>
                </select>
              </div>
              <div className="col-span-2 space-y-2">
                <Label>GST Number</Label>
                <Input
                  value={formData.gst_number}
                  onChange={(e) => setFormData({ ...formData, gst_number: e.target.value })}
                  placeholder="GST number (if applicable)"
                />
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="font-medium text-sm">Location</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>City</Label>
                  <Input
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    placeholder="City"
                  />
                </div>
                <div className="space-y-2">
                  <Label>State</Label>
                  <Input
                    value={formData.state}
                    onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                    placeholder="State"
                  />
                </div>
                <div className="col-span-2 space-y-2">
                  <Label>Country</Label>
                  <Input
                    value={formData.country}
                    onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                    placeholder="Country"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="font-medium text-sm">Payment Terms</h4>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Payment Terms (Days)</Label>
                  <Input
                    type="number"
                    value={formData.payment_terms_days}
                    onChange={(e) => setFormData({ ...formData, payment_terms_days: e.target.value })}
                    placeholder="30"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Credit Limit</Label>
                  <Input
                    type="number"
                    value={formData.credit_limit_amount}
                    onChange={(e) => setFormData({ ...formData, credit_limit_amount: e.target.value })}
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Currency</Label>
                  <select
                    value={formData.credit_limit_currency}
                    onChange={(e) => setFormData({ ...formData, credit_limit_currency: e.target.value })}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="INR">INR</option>
                    <option value="GBP">GBP</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="font-medium text-sm">Primary Contact</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 space-y-2">
                  <Label>Contact Name</Label>
                  <Input
                    value={formData.primary_contact_name}
                    onChange={(e) => setFormData({ ...formData, primary_contact_name: e.target.value })}
                    placeholder="Contact person name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={formData.primary_contact_email}
                    onChange={(e) => setFormData({ ...formData, primary_contact_email: e.target.value })}
                    placeholder="email@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input
                    value={formData.primary_contact_phone}
                    onChange={(e) => setFormData({ ...formData, primary_contact_phone: e.target.value })}
                    placeholder="+1234567890"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={loading}>
                {editingCustomer ? "Update" : "Add"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
