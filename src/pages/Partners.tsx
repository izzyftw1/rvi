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
  name: string;
  process_type: string | null;
  default_lead_time_days: number | null;
  is_active: boolean;
  address: string | null;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  created_at: string;
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
    name: "",
    process_type: "",
    default_lead_time_days: 7,
    contact_person: "",
    phone: "",
    email: "",
    address: "",
    is_active: true,
  });

  const { toast } = useToast();
  const { hasRole } = useUserRole();
  const canEdit = hasRole("admin");

  const loadPartners = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("external_partners")
        .select("*")
        .order("name");

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
        partner.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        partner.contact_person?.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesProcess =
        !processFilter || partner.process_type === processFilter;

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
      if (partner.is_active && partner.process_type) {
        counts[partner.process_type] = (counts[partner.process_type] || 0) + 1;
      }
    });
    return counts;
  }, [partners]);

  const handleOpenDialog = (partner?: Partner) => {
    if (partner) {
      setEditingPartner(partner);
      setFormData({
        name: partner.name,
        process_type: partner.process_type || "",
        default_lead_time_days: partner.default_lead_time_days || 7,
        contact_person: partner.contact_person || "",
        phone: partner.phone || "",
        email: partner.email || "",
        address: partner.address || "",
        is_active: partner.is_active,
      });
    } else {
      setEditingPartner(null);
      setFormData({
        name: "",
        process_type: "",
        default_lead_time_days: 7,
        contact_person: "",
        phone: "",
        email: "",
        address: "",
        is_active: true,
      });
    }
    setDialogOpen(true);
  };

  const handleSavePartner = async () => {
    if (!formData.name.trim()) {
      toast({
        title: "Validation Error",
        description: "Partner name is required",
        variant: "destructive",
      });
      return;
    }

    try {
      if (editingPartner) {
        const { error } = await supabase
          .from("external_partners")
          .update({
            name: formData.name.trim(),
            process_type: formData.process_type.trim(),
            default_lead_time_days: formData.default_lead_time_days,
            contact_name: formData.contact_person.trim() || null,
            contact_phone: formData.phone.trim() || null,
            contact_email: formData.email.trim() || null,
            address: formData.address.trim() || null,
            is_active: formData.is_active,
          })
          .eq("id", editingPartner.id);

        if (error) throw error;
        toast({
          title: "Success",
          description: "Partner updated successfully",
        });
      } else {
        const { error } = await supabase
          .from("external_partners")
          .insert([{
            name: formData.name.trim(),
            process_type: formData.process_type.trim(),
            default_lead_time_days: formData.default_lead_time_days,
            contact_name: formData.contact_person.trim() || null,
            contact_phone: formData.phone.trim() || null,
            contact_email: formData.email.trim() || null,
            address: formData.address.trim() || null,
            is_active: formData.is_active,
          }]);

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
                    partners.reduce((sum, p) => sum + (p.default_lead_time_days || 7), 0) /
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
                        {partner.name}
                      </div>
                    </TableCell>
                    <TableCell>
                      {partner.process_type ? (
                        <Badge variant="secondary" className="text-xs">
                          <Package className="h-3 w-3 mr-1" />
                          {partner.process_type}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
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
                        {partner.address || "—"}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        {partner.default_lead_time_days || 7} days
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
              <Label htmlFor="name">
                Partner Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder="Enter partner name"
              />
            </div>

            {/* Process Type */}
            <div>
              <Label htmlFor="process_type">Process Type</Label>
              <select
                id="process_type"
                value={formData.process_type}
                onChange={(e) =>
                  setFormData({ ...formData, process_type: e.target.value })
                }
                className="w-full border rounded-md px-3 py-2 text-sm"
              >
                <option value="">Select process type</option>
                {PROCESS_OPTIONS.map((process) => (
                  <option key={process} value={process}>
                    {process}
                  </option>
                ))}
              </select>
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
              <Label htmlFor="address">Address</Label>
              <Textarea
                id="address"
                value={formData.address}
                onChange={(e) =>
                  setFormData({ ...formData, address: e.target.value })
                }
                placeholder="Complete address"
                rows={3}
              />
            </div>

            {/* Lead Time */}
            <div>
              <Label htmlFor="default_lead_time_days">Default Lead Time (Days)</Label>
              <Input
                id="default_lead_time_days"
                type="number"
                value={formData.default_lead_time_days}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    default_lead_time_days: parseInt(e.target.value) || 7,
                  })
                }
                min={1}
                placeholder="7"
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
