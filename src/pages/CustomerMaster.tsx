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
    party_code: ""
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
    setFormData({ customer_name: "", party_code: "" });
    setIsDialogOpen(true);
  };

  const handleEdit = (customer: any) => {
    setEditingCustomer(customer);
    setFormData({
      customer_name: customer.customer_name,
      party_code: customer.party_code || ""
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
                      <TableHead>Last Used</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCustomers.map((customer) => (
                      <TableRow key={customer.id}>
                        <TableCell className="font-medium">{customer.customer_name}</TableCell>
                        <TableCell>{customer.party_code || "—"}</TableCell>
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCustomer ? "Edit Customer" : "Add Customer"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
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
            <div className="flex justify-end gap-2">
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
