import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface AddCustomerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCustomerAdded: (customer: any) => void;
}

export function AddCustomerDialog({ open, onOpenChange, onCustomerAdded }: AddCustomerDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
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

  const generatePartyCode = (name: string) => {
    const prefix = name.replace(/[^a-zA-Z]/g, '').substring(0, 3).toUpperCase();
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    return `${prefix}${randomNum}`;
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

      const { data, error } = await supabase
        .from("customer_master")
        .insert([dataToSave])
        .select()
        .single();
      
      if (error) throw error;
      
      toast({ description: "Customer added successfully" });
      onCustomerAdded(data);
      onOpenChange(false);
      
      // Reset form
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
    } catch (err: any) {
      toast({ variant: "destructive", description: `Error: ${err.message}` });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Customer</DialogTitle>
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
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={loading}>
              Add Customer
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
