import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useUserRole } from "@/hooks/useUserRole";
import { Plus, Edit, Building2, Phone, Mail, MapPin, Clock, Package } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const PROCESS_OPTIONS = ["Plating", "Job Work", "Buffing", "Blasting", "Forging", "Heat Treatment"];

interface Partner {
  id: string;
  partner_name: string;
  process_type: string[];
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address_line1: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  gst_number: string | null;
  lead_time_days: number;
  is_active: boolean;
  remarks: string | null;
  created_at: string;
  updated_at: string;
}

const Partners = () => {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPartner, setEditingPartner] = useState<Partner | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [processFilter, setProcessFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  
  // Form state
  const [formData, setFormData] = useState({
    partner_name: "",
    process_type: [] as string[],
    contact_person: "",
    phone: "",
    email: "",
    address_line1: "",
    city: "",
    state: "",
    country: "India",
    gst_number: "",
    lead_time_days: 7,
    is_active: true,
    remarks: "",
  });

  const { toast } = useToast();
  const { hasRole } = useUserRole();
  const canEdit = hasRole("admin");

  const loadPartners = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("external_partners")
        .select("*")
        .order("partner_name");

      if (error) throw error;
      setPartners(data || []);
    } catch (error: any) {
      toast({
        title: "Error loading partners",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadPartners();

    // Real-time subscription
    const channel = supabase
      .channel("partners-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "external_partners",
        },
        () => {
          loadPartners();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadPartners]);

  const filteredPartners = useMemo(() => {
    return partners.filter((partner) => {
      const matchesSearch =
        searchQuery === "" ||
        partner.partner_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        partner.contact_person?.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesProcess =
        !processFilter || partner.process_type.includes(processFilter);

      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && partner.is_active) ||
        (statusFilter === "inactive" && !partner.is_active);

      return matchesSearch && matchesProcess && matchesStatus;
    });
  }, [partners, searchQuery, processFilter, statusFilter]);

  const processCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    partners.forEach((partner) => {
      if (partner.is_active) {
        partner.process_type.forEach((process) => {
          counts[process] = (counts[process] || 0) + 1;
        });
      }
    });
    return counts;
  }, [partners]);

  const handleOpenDialog = (partner?: Partner) => {
    if (partner) {
      setEditingPartner(partner);
      setFormData({
        partner_name: partner.partner_name,
        process_type: partner.process_type,
        contact_person: partner.contact_person || "",
        phone: partner.phone || "",
        email: partner.email || "",
        address_line1: partner.address_line1 || "",
        city: partner.city || "",
        state: partner.state || "",
        country: partner.country || "India",
        gst_number: partner.gst_number || "",
        lead_time_days: partner.lead_time_days,
        is_active: partner.is_active,
        remarks: partner.remarks || "",
      });
    } else {
      setEditingPartner(null);
      setFormData({
        partner_name: "",
        process_type: [],
        contact_person: "",
        phone: "",
        email: "",
        address_line1: "",
        city: "",
        state: "",
        country: "India",
        gst_number: "",
        lead_time_days: 7,
        is_active: true,
        remarks: "",
      });
    }
    setDialogOpen(true);
  };

  const handleSavePartner = async () => {
    if (!formData.partner_name.trim()) {
      toast({
        title: "Validation Error",
        description: "Partner name is required",
        variant: "destructive",
      });
      return;
    }

    if (formData.process_type.length === 0) {
      toast({
        title: "Validation Error",
        description: "At least one process type is required",
        variant: "destructive",
      });
      return;
    }

    try {
      if (editingPartner) {
        const { error } = await supabase
          .from("external_partners")
          .update(formData)
          .eq("id", editingPartner.id);

        if (error) throw error;
        toast({
          title: "Success",
          description: "Partner updated successfully",
        });
      } else {
        const { error } = await supabase
          .from("external_partners")
          .insert([formData]);

        if (error) throw error;
        toast({
          title: "Success",
          description: "Partner created successfully",
        });
      }

      setDialogOpen(false);
      loadPartners();
    } catch (error: any) {
      toast({
        title: "Error saving partner",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const toggleProcessType = (process: string) => {
    setFormData((prev) => ({
      ...prev,
      process_type: prev.process_type.includes(process)
        ? prev.process_type.filter((p) => p !== process)
        : [...prev.process_type, process],
    }));
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Building2 className="h-8 w-8 text-primary" />
            Partner Management
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage external processing partners and vendors
          </p>
        </div>
        {canEdit && (
          <Button onClick={() => handleOpenDialog()} className="gap-2">
            <Plus className="h-4 w-4" />
            Add Partner
          </Button>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Partners
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{partners.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Active Partners
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {partners.filter((p) => p.is_active).length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Inactive Partners
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {partners.filter((p) => !p.is_active).length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Avg Lead Time
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {partners.length > 0
                ? Math.round(
                    partners.reduce((sum, p) => sum + p.lead_time_days, 0) /
                      partners.length
                  )
                : 0}{" "}
              days
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>Search</Label>
              <Input
                placeholder="Search by name or contact..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div>
              <Label>Status</Label>
              <div className="flex gap-2 mt-1">
                <Button
                  variant={statusFilter === "all" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setStatusFilter("all")}
                >
                  All
                </Button>
                <Button
                  variant={statusFilter === "active" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setStatusFilter("active")}
                >
                  Active
                </Button>
                <Button
                  variant={statusFilter === "inactive" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setStatusFilter("inactive")}
                >
                  Inactive
                </Button>
              </div>
            </div>
          </div>

          {/* Process Type Filters */}
          <div>
            <Label>Process Type</Label>
            <div className="flex flex-wrap gap-2 mt-2">
              <Badge
                variant={processFilter === null ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => setProcessFilter(null)}
              >
                All
              </Badge>
              {PROCESS_OPTIONS.map((process) => (
                <Badge
                  key={process}
                  variant={processFilter === process ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => setProcessFilter(process)}
                >
                  {process} ({processCounts[process] || 0})
                </Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Partners Table */}
      <Card>
        <CardHeader>
          <CardTitle>Partners ({filteredPartners.length})</CardTitle>
          <CardDescription>
            Showing {filteredPartners.length} of {partners.length} partners
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Partner Name</TableHead>
                <TableHead>Process Types</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Lead Time</TableHead>
                <TableHead>Status</TableHead>
                {canEdit && <TableHead>Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPartners.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    No partners found. {canEdit && "Click 'Add Partner' to create one."}
                  </TableCell>
                </TableRow>
              ) : (
                filteredPartners.map((partner) => (
                  <TableRow key={partner.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        {partner.partner_name}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {partner.process_type.map((process) => (
                          <Badge key={process} variant="secondary" className="text-xs">
                            <Package className="h-3 w-3 mr-1" />
                            {process}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1 text-sm">
                        {partner.contact_person && (
                          <div className="flex items-center gap-1 text-muted-foreground">
                            {partner.contact_person}
                          </div>
                        )}
                        {partner.phone && (
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <Phone className="h-3 w-3" />
                            {partner.phone}
                          </div>
                        )}
                        {partner.email && (
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <Mail className="h-3 w-3" />
                            {partner.email}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <MapPin className="h-3 w-3" />
                        {[partner.city, partner.state, partner.country]
                          .filter(Boolean)
                          .join(", ") || "—"}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        {partner.lead_time_days} days
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={partner.is_active ? "default" : "secondary"}>
                        {partner.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    {canEdit && (
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenDialog(partner)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Add/Edit Partner Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingPartner ? "Edit Partner" : "Add New Partner"}
            </DialogTitle>
            <DialogDescription>
              {editingPartner
                ? "Update partner information"
                : "Add a new external processing partner"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Partner Name */}
            <div>
              <Label htmlFor="partner_name">
                Partner Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="partner_name"
                value={formData.partner_name}
                onChange={(e) =>
                  setFormData({ ...formData, partner_name: e.target.value })
                }
                placeholder="Enter partner name"
              />
            </div>

            {/* Process Types */}
            <div>
              <Label>
                Process Types <span className="text-destructive">*</span>
              </Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {PROCESS_OPTIONS.map((process) => (
                  <Badge
                    key={process}
                    variant={
                      formData.process_type.includes(process) ? "default" : "outline"
                    }
                    className="cursor-pointer"
                    onClick={() => toggleProcessType(process)}
                  >
                    {process}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Contact Details */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="contact_person">Contact Person</Label>
                <Input
                  id="contact_person"
                  value={formData.contact_person}
                  onChange={(e) =>
                    setFormData({ ...formData, contact_person: e.target.value })
                  }
                  placeholder="Name"
                />
              </div>
              <div>
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) =>
                    setFormData({ ...formData, phone: e.target.value })
                  }
                  placeholder="+91 98765 43210"
                />
              </div>
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                  placeholder="contact@partner.com"
                />
              </div>
            </div>

            {/* Address */}
            <div>
              <Label htmlFor="address_line1">Address</Label>
              <Input
                id="address_line1"
                value={formData.address_line1}
                onChange={(e) =>
                  setFormData({ ...formData, address_line1: e.target.value })
                }
                placeholder="Street address"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="city">City</Label>
                <Input
                  id="city"
                  value={formData.city}
                  onChange={(e) =>
                    setFormData({ ...formData, city: e.target.value })
                  }
                  placeholder="City"
                />
              </div>
              <div>
                <Label htmlFor="state">State</Label>
                <Input
                  id="state"
                  value={formData.state}
                  onChange={(e) =>
                    setFormData({ ...formData, state: e.target.value })
                  }
                  placeholder="State"
                />
              </div>
              <div>
                <Label htmlFor="country">Country</Label>
                <Input
                  id="country"
                  value={formData.country}
                  onChange={(e) =>
                    setFormData({ ...formData, country: e.target.value })
                  }
                  placeholder="Country"
                />
              </div>
            </div>

            {/* GST & Lead Time */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="gst_number">GST Number</Label>
                <Input
                  id="gst_number"
                  value={formData.gst_number}
                  onChange={(e) =>
                    setFormData({ ...formData, gst_number: e.target.value })
                  }
                  placeholder="29XXXXX1234X1ZX"
                />
              </div>
              <div>
                <Label htmlFor="lead_time_days">Lead Time (Days)</Label>
                <Input
                  id="lead_time_days"
                  type="number"
                  value={formData.lead_time_days}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      lead_time_days: parseInt(e.target.value) || 7,
                    })
                  }
                  min={1}
                />
              </div>
            </div>

            {/* Remarks */}
            <div>
              <Label htmlFor="remarks">Remarks</Label>
              <Textarea
                id="remarks"
                value={formData.remarks}
                onChange={(e) =>
                  setFormData({ ...formData, remarks: e.target.value })
                }
                placeholder="Additional notes..."
                rows={3}
              />
            </div>

            {/* Active Status */}
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <Label htmlFor="active" className="font-medium">
                  Active Partner
                </Label>
                <p className="text-sm text-muted-foreground">
                  Inactive partners won't appear in partner selection
                </p>
              </div>
              <Switch
                id="is_active"
                checked={formData.is_active}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, is_active: checked })
                }
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSavePartner}>
              {editingPartner ? "Update Partner" : "Create Partner"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Partners;
