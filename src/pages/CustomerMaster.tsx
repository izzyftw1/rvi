import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { useToast } from "@/hooks/use-toast";
import { Plus, Edit, Trash2, Search, Eye, BarChart3, ExternalLink } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useNavigate } from "react-router-dom";
import { generatePartyCode as generateDeterministicPartyCode } from "@/lib/partyCodeGenerator";
import { CustomerName, useCustomerDisplayText } from "@/components/CustomerName";

const COUNTRIES = [
  "United States", "United Kingdom", "Canada", "Australia", "Germany", "France", "Italy", "Spain",
  "India", "China", "Japan", "South Korea", "Brazil", "Mexico", "Argentina", "Netherlands",
  "Belgium", "Switzerland", "Austria", "Sweden", "Norway", "Denmark", "Finland", "Poland",
  "Czech Republic", "Singapore", "Malaysia", "Thailand", "Vietnam", "Indonesia", "Philippines",
  "United Arab Emirates", "Saudi Arabia", "South Africa", "Egypt", "Turkey", "Russia", "Other"
];

export default function CustomerMaster() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { getDisplayText, canView: canViewCustomerName } = useCustomerDisplayText();
  const [customers, setCustomers] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [existingPartyCodes, setExistingPartyCodes] = useState<string[]>([]);
  const [lastOrderDates, setLastOrderDates] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<any>(null);
  const [formData, setFormData] = useState({
    customer_name: "",
    party_code: "",
    account_owner: "",
    address_line_1: "",
    pincode: "",
    city: "",
    state: "",
    country: "",
    gst_number: "",
    gst_type: "not_applicable" as "domestic" | "export" | "not_applicable",
    pan_number: "",
    credit_limit_amount: "",
    credit_limit_currency: "USD",
    payment_terms_days: "30",
    primary_contact_name: "",
    primary_contact_email: "",
    primary_contact_phone: "",
  });

  useEffect(() => {
    loadCustomers();
    loadExistingPartyCodes();
  }, []);

  const loadCustomers = async () => {
    setLoading(true);
    
    // Load customers
    const { data: customersData } = await supabase
      .from("customer_master")
      .select("*")
      .order("created_at", { ascending: false });
    
    // Load last order dates from view
    const { data: orderDates } = await supabase
      .from("customer_last_order" as any)
      .select("*");
    
    // Load users for account owner display and derive their emails
    const { data: profilesData } = await supabase
      .from("profiles")
      .select("id, full_name");
    
    // Derive emails from names for known salespeople
    const enrichedProfiles = (profilesData || []).map(p => ({
      ...p,
      email: deriveEmailFromName(p.full_name)
    }));
    
    if (customersData) setCustomers(customersData);
    if (enrichedProfiles) setUsers(enrichedProfiles);
    
    // Map last order dates
    if (orderDates) {
      const dateMap: Record<string, string> = {};
      orderDates.forEach((row: any) => {
        if (row.last_order_date) {
          dateMap[row.customer_id] = row.last_order_date;
        }
      });
      setLastOrderDates(dateMap);
    }
    
    setLoading(false);
  };

  const loadExistingPartyCodes = async () => {
    const { data } = await supabase
      .from("customer_master")
      .select("party_code")
      .not("party_code", "is", null);
    if (data) {
      setExistingPartyCodes(data.map(c => c.party_code).filter(Boolean));
    }
  };

  // Derive email from name for known salespeople
  const deriveEmailFromName = (name: string | null): string | null => {
    if (!name) return null;
    const nameLower = name.toLowerCase().trim();
    const firstName = nameLower.split(' ')[0];
    
    const nameToEmail: Record<string, string> = {
      'sales': 'sales@brasspartsindia.net',
      'abhi': 'abhi@brasspartsindia.net',
      'ronak': 'ronak@brasspartsindia.net',
      'amit': 'amit@brasspartsindia.net',
      'mitul': 'mitul@brasspartsindia.net',
      'nitish': 'nitish@brasspartsindia.net',
      'harsha': 'harsha@brasspartsindia.net',
      'sahil': 'sahil@brasspartsindia.net',
      'atulkumar': 'atulkumar@brasspartsindia.net',
      'atul': 'atulkumar@brasspartsindia.net',
      'marcin': 'marcin@brasspartsindia.net',
      'dhaval': 'dhaval@brasspartsindia.net',
    };
    
    return nameToEmail[firstName] || null;
  };

  // Generate party code based on form data
  const generatePartyCodeForForm = () => {
    const selectedUser = users.find(u => u.id === formData.account_owner);
    return generateDeterministicPartyCode({
      country: formData.country,
      state: formData.state,
      salespersonEmail: selectedUser?.email, // Use email for accurate code lookup
      salespersonName: selectedUser?.full_name, // Fallback to name
      existingPartyCodes,
    });
  };

  const handleAdd = () => {
    setEditingCustomer(null);
    setFormData({
      customer_name: "",
      party_code: "",
      account_owner: "",
      address_line_1: "",
      pincode: "",
      city: "",
      state: "",
      country: "",
      gst_number: "",
      gst_type: "not_applicable",
      pan_number: "",
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
      account_owner: customer.account_owner || "",
      address_line_1: customer.address_line_1 || "",
      pincode: customer.pincode || "",
      city: customer.city || "",
      state: customer.state || "",
      country: customer.country || "",
      gst_number: customer.gst_number || "",
      gst_type: customer.gst_type || "not_applicable",
      pan_number: customer.pan_number || "",
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

    // Validate that either city or country is filled
    if (!formData.city?.trim() && !formData.country?.trim()) {
      toast({ variant: "destructive", description: "Either city or country must be filled" });
      return;
    }

    setLoading(true);
    try {
      const dataToSave = {
        customer_name: formData.customer_name,
        party_code: editingCustomer?.party_code || formData.party_code || generatePartyCodeForForm(),
        account_owner: formData.account_owner || null,
        address_line_1: formData.address_line_1 || null,
        pincode: formData.pincode || null,
        city: formData.city || null,
        state: formData.state || null,
        country: formData.country || null,
        gst_number: formData.gst_number || null,
        gst_type: formData.gst_type,
        pan_number: formData.pan_number || null,
        credit_limit_amount: formData.credit_limit_amount ? parseFloat(formData.credit_limit_amount) : null,
        credit_limit_currency: formData.credit_limit_currency,
        payment_terms_days: formData.payment_terms_days ? parseInt(formData.payment_terms_days) : 30,
        primary_contact_name: formData.primary_contact_name || null,
        primary_contact_email: formData.primary_contact_email || null,
        primary_contact_phone: formData.primary_contact_phone || null,
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

  const filteredCustomers = customers.filter(c => {
    const accountOwnerName = users.find(u => u.id === c.account_owner)?.full_name || "";
    return c.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.party_code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.city?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.country?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      accountOwnerName.toLowerCase().includes(searchTerm.toLowerCase());
  });

  return (
    <div className="min-h-screen bg-background">
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
                  placeholder="Search customers by name, party code, location, or account owner..."
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
              <EmptyState
                icon="customers"
                title={searchTerm ? "No Customers Match Your Search" : "No Customers Yet"}
                description={searchTerm 
                  ? `No customers match "${searchTerm}". Try a different search term.`
                  : "Customers are added when creating Sales Orders or manually. Add your first customer to start creating orders."
                }
                action={!searchTerm ? {
                  label: "Add Customer",
                  onClick: handleAdd,
                } : {
                  label: "Clear Search",
                  onClick: () => setSearchTerm(""),
                  variant: "outline",
                }}
                size="md"
              />
            ) : (
              <TooltipProvider>
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Customer Name</TableHead>
                        <TableHead>Account Owner</TableHead>
                        <TableHead>Party Code</TableHead>
                        <TableHead>Location</TableHead>
                        <TableHead>Country</TableHead>
                        <TableHead>GST Type</TableHead>
                        <TableHead>Contact</TableHead>
                        <TableHead>Last Order Date</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredCustomers.map((customer) => {
                        const accountOwner = users.find(u => u.id === customer.account_owner);
                        const lastOrderDate = lastOrderDates[customer.id];
                        
                        return (
                          <TableRow key={customer.id}>
                            <TableCell className="font-medium">{customer.customer_name}</TableCell>
                            <TableCell>
                              {accountOwner ? accountOwner.full_name : "—"}
                            </TableCell>
                            <TableCell>{customer.party_code || "—"}</TableCell>
                            <TableCell>
                              {[customer.city, customer.state]
                                .filter(Boolean)
                                .join(", ") || "—"}
                            </TableCell>
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
                              {lastOrderDate
                                ? new Date(lastOrderDate).toLocaleDateString()
                                : "—"}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => navigate(`/sales?customer=${customer.id}`)}
                                    >
                                      <ExternalLink className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>View all orders</TooltipContent>
                                </Tooltip>
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
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </TooltipProvider>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingCustomer ? "Edit Customer" : "Add Customer"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-2">
                <Label>Customer Name *</Label>
                <Input
                  value={formData.customer_name}
                  onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
                  placeholder="Enter customer name"
                />
              </div>
              <div className="space-y-2">
                <Label>Party Code</Label>
                <div className="flex gap-2">
                  <Input
                    value={formData.party_code}
                    readOnly={!!editingCustomer}
                    className={editingCustomer ? "bg-muted" : ""}
                    onChange={(e) => setFormData({ ...formData, party_code: e.target.value })}
                    placeholder={editingCustomer ? "Cannot change" : "Auto-generated on save"}
                  />
                  {!editingCustomer && (
                    <Button 
                      type="button" 
                      variant="outline" 
                      size="sm"
                      onClick={() => setFormData({ ...formData, party_code: generatePartyCodeForForm() })}
                      disabled={!formData.country}
                    >
                      Preview
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {editingCustomer ? "Party code cannot be changed after creation" : "Generated based on country, state & account owner"}
                </p>
              </div>
              <div className="space-y-2">
                <Label>Account Owner</Label>
                <Select 
                  value={formData.account_owner} 
                  onValueChange={(value) => setFormData({...formData, account_owner: value})}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select account owner" />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>GST Type</Label>
                <Select 
                  value={formData.gst_type} 
                  onValueChange={(value) => setFormData({ ...formData, gst_type: value as any })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="not_applicable">Not Applicable</SelectItem>
                    <SelectItem value="domestic">Domestic</SelectItem>
                    <SelectItem value="export">Export</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>GST Number</Label>
                <Input
                  value={formData.gst_number}
                  onChange={(e) => setFormData({ ...formData, gst_number: e.target.value })}
                  placeholder="GST number (if applicable)"
                />
              </div>
              {(formData.gst_type === "domestic" || formData.country === "India") && (
                <div className="space-y-2">
                  <Label>PAN Number</Label>
                  <Input
                    value={formData.pan_number}
                    onChange={(e) => setFormData({ ...formData, pan_number: e.target.value.toUpperCase() })}
                    placeholder="XXXXX0000X"
                    maxLength={10}
                  />
                  <p className="text-xs text-muted-foreground">Required for TDS calculation on domestic customers</p>
                </div>
              )}
            </div>

            <div className="space-y-3">
              <h4 className="font-medium text-sm">Location (City or Country required)</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 space-y-2">
                  <Label>Address Line 1</Label>
                  <Input
                    value={formData.address_line_1}
                    onChange={(e) => setFormData({ ...formData, address_line_1: e.target.value })}
                    placeholder="Street address, building number"
                  />
                </div>
                <div className="space-y-2">
                  <Label>City</Label>
                  <Input
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    placeholder="City"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Pincode</Label>
                  <Input
                    value={formData.pincode}
                    onChange={(e) => setFormData({ ...formData, pincode: e.target.value })}
                    placeholder="ZIP/Postal code"
                  />
                </div>
                <div className="space-y-2">
                  <Label>State/Province</Label>
                  <Input
                    value={formData.state}
                    onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                    placeholder="State"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Country</Label>
                  <Select value={formData.country} onValueChange={(value) => setFormData({...formData, country: value})}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select country" />
                    </SelectTrigger>
                    <SelectContent className="max-h-60">
                      {COUNTRIES.map((country) => (
                        <SelectItem key={country} value={country}>
                          {country}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                  <Select value={formData.credit_limit_currency} onValueChange={(value) => setFormData({...formData, credit_limit_currency: value})}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="EUR">EUR</SelectItem>
                      <SelectItem value="INR">INR</SelectItem>
                      <SelectItem value="GBP">GBP</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="font-medium text-sm">Primary Contact (Optional)</h4>
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
                {editingCustomer ? "Update" : "Add"} Customer
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
