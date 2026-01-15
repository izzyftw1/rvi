import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { FormSection, FormRow, FormField, FormActions, FormContainer, RequiredIndicator } from "@/components/ui/form-layout";
import { getTdsRate, getPanEntityType, isValidPan } from "@/lib/tdsUtils";
import { Badge } from "@/components/ui/badge";
import { generatePartyCode as generateDeterministicPartyCode } from "@/lib/partyCodeGenerator";

const COUNTRIES = [
  "United States", "United Kingdom", "Canada", "Australia", "Germany", "France", "Italy", "Spain",
  "India", "China", "Japan", "South Korea", "Brazil", "Mexico", "Argentina", "Netherlands",
  "Belgium", "Switzerland", "Austria", "Sweden", "Norway", "Denmark", "Finland", "Poland",
  "Czech Republic", "Singapore", "Malaysia", "Thailand", "Vietnam", "Indonesia", "Philippines",
  "United Arab Emirates", "Saudi Arabia", "South Africa", "Egypt", "Turkey", "Russia", "Other"
];

interface AddCustomerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCustomerAdded: (customer: any) => void;
}

export function AddCustomerDialog({ open, onOpenChange, onCustomerAdded }: AddCustomerDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<any[]>([]);
  const [existingPartyCodes, setExistingPartyCodes] = useState<string[]>([]);
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
    credit_limit_amount: "",
    credit_limit_currency: "USD",
    payment_terms_days: "30",
    primary_contact_name: "",
    primary_contact_email: "",
    primary_contact_phone: "",
    pan_number: "",
    is_export_customer: false,
  });

  useEffect(() => {
    if (open) {
      loadUsers();
      loadExistingPartyCodes();
    }
  }, [open]);

  const loadUsers = async () => {
    // First get profiles
    const { data: profilesData } = await supabase
      .from("profiles")
      .select("id, full_name");
    
    // Get emails from auth users via edge function or RPC - for now use profiles id
    // The id in profiles matches auth.users.id, so we can look up emails
    const profiles = profilesData || [];
    
    // Try to get emails for these users - the id is the auth.users id
    // We'll enrich with email lookup
    const enrichedProfiles = await Promise.all(
      profiles.map(async (p) => {
        // Try to get email from supplier_accounts or other sources
        const { data: accountData } = await supabase
          .from("supplier_accounts")
          .select("user_id")
          .eq("user_id", p.id)
          .limit(1);
        
        // For now, we'll use full_name to derive email pattern for known salespeople
        // This matches the offline logic where salespeople have specific emails
        const emailFromName = deriveEmailFromName(p.full_name);
        
        return {
          ...p,
          email: emailFromName
        };
      })
    );
    
    if (enrichedProfiles) setUsers(enrichedProfiles);
  };
  
  // Derive email from name for known salespeople
  const deriveEmailFromName = (name: string | null): string | null => {
    if (!name) return null;
    const nameLower = name.toLowerCase().trim();
    const firstName = nameLower.split(' ')[0];
    
    // Map known names to their emails
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

  const loadExistingPartyCodes = async () => {
    const { data } = await supabase
      .from("customer_master")
      .select("party_code")
      .not("party_code", "is", null);
    if (data) {
      setExistingPartyCodes(data.map(c => c.party_code).filter(Boolean));
    }
  };

  // Generate party code based on current form state
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

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.customer_name.trim()) {
      toast({ variant: "destructive", description: "Customer name is required" });
      return;
    }

    if (!formData.city?.trim() && !formData.country?.trim()) {
      toast({ variant: "destructive", description: "Either city or country must be filled" });
      return;
    }

    setLoading(true);
    try {
      const dataToSave = {
        customer_name: formData.customer_name,
        party_code: formData.party_code || generatePartyCodeForForm(),
        account_owner: formData.account_owner || null,
        address_line_1: formData.address_line_1 || null,
        pincode: formData.pincode || null,
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
        pan_number: formData.pan_number || null,
        is_export_customer: formData.is_export_customer,
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
        credit_limit_amount: "",
        credit_limit_currency: "USD",
        payment_terms_days: "30",
        primary_contact_name: "",
        primary_contact_email: "",
        primary_contact_phone: "",
        pan_number: "",
        is_export_customer: false,
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
          <DialogDescription>
            Create a new customer record in the system
          </DialogDescription>
        </DialogHeader>

        <FormContainer onSubmit={handleSave}>
          {/* Basic Information */}
          <FormSection title="Basic Information">
            <FormField>
              <Label>Customer Name<RequiredIndicator /></Label>
              <Input
                value={formData.customer_name}
                onChange={(e) => {
                  setFormData({
                    ...formData,
                    customer_name: e.target.value,
                  });
                }}
                placeholder="Enter customer name"
              />
            </FormField>
            
            <FormRow>
              <FormField>
                <Label>Party Code</Label>
                <div className="flex gap-2">
                  <Input
                    value={formData.party_code}
                    onChange={(e) => setFormData({ ...formData, party_code: e.target.value })}
                    placeholder="Auto-generated on save"
                    readOnly
                    className="bg-muted"
                  />
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="sm"
                    onClick={() => setFormData({ ...formData, party_code: generatePartyCodeForForm() })}
                    disabled={!formData.country}
                  >
                    Preview
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Code generated automatically based on country, state, and account owner
                </p>
              </FormField>
              <FormField>
                <Label>Account Owner</Label>
                <Select value={formData.account_owner} onValueChange={(value) => setFormData({...formData, account_owner: value})}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select owner" />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
            </FormRow>
          </FormSection>

          {/* Tax Information */}
          <FormSection title="Tax Information" withSeparator>
            <FormRow>
              <FormField>
                <Label>PAN Number</Label>
                <Input
                  value={formData.pan_number}
                  onChange={(e) => setFormData({ ...formData, pan_number: e.target.value.toUpperCase() })}
                  placeholder="XXXXX0000X"
                  maxLength={10}
                />
                {formData.pan_number && formData.pan_number.length >= 4 && (
                  <div className="mt-1 flex items-center gap-2 text-xs">
                    <Badge variant="outline" className="text-xs">
                      {getPanEntityType(formData.pan_number)}
                    </Badge>
                    <span className="text-muted-foreground">
                      TDS: {getTdsRate(formData.pan_number, formData.is_export_customer)}%
                    </span>
                    {!isValidPan(formData.pan_number) && formData.pan_number.length === 10 && (
                      <span className="text-destructive">Invalid format</span>
                    )}
                  </div>
                )}
              </FormField>
              <FormField>
                <Label>Export Customer</Label>
                <div className="flex items-center gap-2 h-10">
                  <Checkbox 
                    id="is_export"
                    checked={formData.is_export_customer}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_export_customer: checked === true })}
                  />
                  <label htmlFor="is_export" className="text-sm cursor-pointer">
                    No TDS applicable
                  </label>
                </div>
              </FormField>
            </FormRow>
            <FormRow>
              <FormField>
                <Label>GST Type</Label>
                <Select value={formData.gst_type} onValueChange={(value) => setFormData({ ...formData, gst_type: value as any })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="not_applicable">Not Applicable</SelectItem>
                    <SelectItem value="domestic">Domestic</SelectItem>
                    <SelectItem value="export">Export</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>
              <FormField>
                <Label>GST Number</Label>
                <Input
                  value={formData.gst_number}
                  onChange={(e) => setFormData({ ...formData, gst_number: e.target.value })}
                  placeholder="If applicable"
                />
              </FormField>
            </FormRow>
          </FormSection>

          {/* Address */}
          <FormSection 
            title="Address" 
            description="City or country is required"
            withSeparator
          >
            <FormField>
              <Label>Address Line 1</Label>
              <Input
                value={formData.address_line_1}
                onChange={(e) => setFormData({ ...formData, address_line_1: e.target.value })}
                placeholder="Street address, building number"
              />
            </FormField>
            
            <FormRow>
              <FormField>
                <Label>City</Label>
                <Input
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  placeholder="City"
                />
              </FormField>
              <FormField>
                <Label>Pincode</Label>
                <Input
                  value={formData.pincode}
                  onChange={(e) => setFormData({ ...formData, pincode: e.target.value })}
                  placeholder="ZIP/Postal code"
                />
              </FormField>
            </FormRow>
            
            <FormRow>
              <FormField>
                <Label>State/Province</Label>
                <Input
                  value={formData.state}
                  onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                  placeholder="State"
                />
              </FormField>
              <FormField>
                <Label>Country</Label>
                <Select value={formData.country} onValueChange={(value) => setFormData({...formData, country: value})}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select country" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {COUNTRIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
            </FormRow>
          </FormSection>

          {/* Payment Terms */}
          <FormSection title="Payment Terms" withSeparator>
            <FormRow cols={3}>
              <FormField>
                <Label>Payment Terms (Days)</Label>
                <Input
                  type="number"
                  value={formData.payment_terms_days}
                  onChange={(e) => setFormData({ ...formData, payment_terms_days: e.target.value })}
                  placeholder="30"
                />
              </FormField>
              <FormField>
                <Label>Credit Limit</Label>
                <Input
                  type="number"
                  value={formData.credit_limit_amount}
                  onChange={(e) => setFormData({ ...formData, credit_limit_amount: e.target.value })}
                  placeholder="0.00"
                />
              </FormField>
              <FormField>
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
              </FormField>
            </FormRow>
          </FormSection>

          {/* Primary Contact */}
          <FormSection 
            title="Primary Contact" 
            description="Optional contact information"
            withSeparator
          >
            <FormField>
              <Label>Contact Name</Label>
              <Input
                value={formData.primary_contact_name}
                onChange={(e) => setFormData({ ...formData, primary_contact_name: e.target.value })}
                placeholder="Contact person name"
              />
            </FormField>
            
            <FormRow>
              <FormField>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={formData.primary_contact_email}
                  onChange={(e) => setFormData({ ...formData, primary_contact_email: e.target.value })}
                  placeholder="email@example.com"
                />
              </FormField>
              <FormField>
                <Label>Phone</Label>
                <Input
                  value={formData.primary_contact_phone}
                  onChange={(e) => setFormData({ ...formData, primary_contact_phone: e.target.value })}
                  placeholder="+1234567890"
                />
              </FormField>
            </FormRow>
          </FormSection>

          <FormActions>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Adding...' : 'Add Customer'}
            </Button>
          </FormActions>
        </FormContainer>
      </DialogContent>
    </Dialog>
  );
}
