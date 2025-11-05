import { useEffect, useState } from "react";
import { NavigationHeader } from "@/components/NavigationHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Plus, Edit, Trash2, TrendingUp, AlertCircle } from "lucide-react";
import { differenceInDays, parseISO, isPast } from "date-fns";
import { useUserRole } from "@/hooks/useUserRole";

interface Partner {
  id: string;
  name: string;
  process_types: string[];
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  gst_number: string | null;
  active: boolean;
  requires_return_qc: boolean;
}

const PROCESS_OPTIONS = [
  { value: "job_work", label: "Job Work" },
  { value: "plating", label: "Plating" },
  { value: "buffing", label: "Buffing" },
  { value: "blasting", label: "Blasting" },
  { value: "forging", label: "Forging" },
];

const Partners = () => {
  const { toast } = useToast();
  const { hasAnyRole } = useUserRole();
  const [partners, setPartners] = useState<Partner[]>([]);
  const [moves, setMoves] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPartner, setEditingPartner] = useState<Partner | null>(null);
  
  const canManage = hasAnyRole(['logistics', 'admin']);
  
  // Form state
  const [name, setName] = useState("");
  const [processTypes, setProcessTypes] = useState<string[]>([]);
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [gstNumber, setGstNumber] = useState("");
  const [requiresReturnQc, setRequiresReturnQc] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);

      // Load partners
      const { data: partnersData } = await supabase
        .from("external_partners" as any)
        .select("*")
        .order("name");

      // Load moves for stats
      const { data: movesData } = await supabase
        .from("wo_external_moves" as any)
        .select("id, partner_id, status, expected_return_date, dispatch_date");

      setPartners((partnersData || []) as unknown as Partner[]);
      setMoves(movesData || []);
    } catch (error) {
      console.error("Error loading partners:", error);
      toast({
        title: "Error",
        description: "Failed to load partners",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const openDialog = (partner?: Partner) => {
    if (partner) {
      setEditingPartner(partner);
      setName(partner.name);
      setProcessTypes(partner.process_types || []);
      setContactName(partner.contact_name || "");
      setPhone(partner.phone || "");
      setEmail(partner.email || "");
      setAddress(partner.address || "");
      setGstNumber(partner.gst_number || "");
      setRequiresReturnQc(partner.requires_return_qc || false);
    } else {
      setEditingPartner(null);
      resetForm();
    }
    setDialogOpen(true);
  };

  const resetForm = () => {
    setName("");
    setProcessTypes([]);
    setContactName("");
    setPhone("");
    setEmail("");
    setAddress("");
    setGstNumber("");
    setRequiresReturnQc(false);
  };

  const handleSave = async () => {
    if (!name || processTypes.length === 0) {
      toast({
        title: "Validation Error",
        description: "Name and at least one process type are required",
        variant: "destructive",
      });
      return;
    }

    try {
      const partnerData = {
        name,
        process_types: processTypes,
        contact_name: contactName || null,
        phone: phone || null,
        email: email || null,
        address: address || null,
        gst_number: gstNumber || null,
        requires_return_qc: requiresReturnQc,
      };

      if (editingPartner) {
        const { error } = await supabase
          .from("external_partners" as any)
          .update(partnerData)
          .eq("id", editingPartner.id);

        if (error) throw error;
        toast({ title: "Success", description: "Partner updated successfully" });
      } else {
        const { error } = await supabase
          .from("external_partners" as any)
          .insert(partnerData);

        if (error) throw error;
        toast({ title: "Success", description: "Partner created successfully" });
      }

      setDialogOpen(false);
      resetForm();
      loadData();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (partner: Partner) => {
    if (!confirm(`Are you sure you want to deactivate ${partner.name}?`)) return;

    try {
      const { error } = await supabase
        .from("external_partners" as any)
        .update({ active: false })
        .eq("id", partner.id);

      if (error) throw error;
      toast({ title: "Success", description: "Partner deactivated" });
      loadData();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const toggleProcessType = (processType: string) => {
    setProcessTypes(prev =>
      prev.includes(processType)
        ? prev.filter(p => p !== processType)
        : [...prev, processType]
    );
  };

  const getPartnerStats = (partnerId: string) => {
    const partnerMoves = moves.filter(m => m.partner_id === partnerId);
    const activeMoves = partnerMoves.filter(m => m.status !== 'received_full');
    const overdueMoves = partnerMoves.filter(m =>
      m.expected_return_date &&
      isPast(parseISO(m.expected_return_date)) &&
      m.status !== 'received_full'
    );

    // On-time return rate (last 90 days)
    const recentMoves = partnerMoves.filter(m => {
      const dispatchDate = parseISO(m.dispatch_date);
      return differenceInDays(new Date(), dispatchDate) <= 90;
    });
    const completedOnTime = recentMoves.filter(m =>
      m.status === 'received_full' &&
      (!m.expected_return_date || !isPast(parseISO(m.expected_return_date)))
    );
    const onTimeRate = recentMoves.length > 0
      ? Math.round((completedOnTime.length / recentMoves.length) * 100)
      : 0;

    return { activeMoves: activeMoves.length, overdueMoves: overdueMoves.length, onTimeRate };
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <NavigationHeader />
        <div className="max-w-7xl mx-auto p-4">
          <p className="text-center text-muted-foreground">Loading partners...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <NavigationHeader />
      
      <div className="max-w-7xl mx-auto p-4 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">External Partners</h1>
            <p className="text-sm text-muted-foreground">Manage external processing partners</p>
          </div>
          {canManage && (
            <Button onClick={() => openDialog()}>
              <Plus className="h-4 w-4 mr-2" />
              Add Partner
            </Button>
          )}
        </div>

        <div className="grid gap-4">
          {partners.filter(p => p.active).map(partner => {
            const stats = getPartnerStats(partner.id);

            return (
              <Card key={partner.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-lg">{partner.name}</CardTitle>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {partner.process_types?.map(pt => (
                          <Badge key={pt} variant="outline" className="capitalize">
                            {pt.replace('_', ' ')}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    {canManage && (
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => openDialog(partner)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="destructive" size="sm" onClick={() => handleDelete(partner)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      {partner.contact_name && (
                        <div>
                          <p className="text-sm text-muted-foreground">Contact</p>
                          <p className="font-medium">{partner.contact_name}</p>
                        </div>
                      )}
                      {partner.phone && (
                        <div>
                          <p className="text-sm text-muted-foreground">Phone</p>
                          <p className="font-medium">{partner.phone}</p>
                        </div>
                      )}
                      {partner.email && (
                        <div>
                          <p className="text-sm text-muted-foreground">Email</p>
                          <p className="font-medium">{partner.email}</p>
                        </div>
                      )}
                      {partner.gst_number && (
                        <div>
                          <p className="text-sm text-muted-foreground">GST</p>
                          <p className="font-medium">{partner.gst_number}</p>
                        </div>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Active Moves</p>
                        <p className="text-2xl font-bold">{stats.activeMoves}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Overdue</p>
                        <p className="text-2xl font-bold text-destructive">{stats.overdueMoves}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">On-Time (90d)</p>
                        <p className="text-2xl font-bold text-green-600">{stats.onTimeRate}%</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {partners.filter(p => p.active).length === 0 && (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">No partners yet. Add your first partner to get started.</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingPartner ? 'Edit Partner' : 'Add Partner'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Partner Name *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Partner name" />
            </div>

            <div className="space-y-2">
              <Label>Process Types *</Label>
              <div className="grid grid-cols-2 gap-2">
                {PROCESS_OPTIONS.map(option => (
                  <div key={option.value} className="flex items-center space-x-2">
                    <Checkbox
                      checked={processTypes.includes(option.value)}
                      onCheckedChange={() => toggleProcessType(option.value)}
                    />
                    <Label className="cursor-pointer">{option.label}</Label>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Contact Name</Label>
                <Input value={contactName} onChange={(e) => setContactName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>Address</Label>
              <Textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={2} />
            </div>

            <div className="space-y-2">
              <Label>GST Number</Label>
              <Input value={gstNumber} onChange={(e) => setGstNumber(e.target.value)} />
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                checked={requiresReturnQc}
                onCheckedChange={(checked) => setRequiresReturnQc(checked as boolean)}
              />
              <Label className="cursor-pointer">Require QC on Return Receipt</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave}>
              {editingPartner ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Partners;
