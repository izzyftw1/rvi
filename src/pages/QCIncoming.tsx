import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft } from "lucide-react";

export default function QCIncoming() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [pendingLots, setPendingLots] = useState<any[]>([]);
  const [selectedLot, setSelectedLot] = useState<any>(null);
  const [formData, setFormData] = useState({
    qc_id: "",
    result: "",
    measurements: "",
    oes_file: null as File | null,
    remarks: ""
  });

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUser(user));
    loadPendingLots();
  }, []);

  const loadPendingLots = async () => {
    const { data } = await supabase
      .from("material_lots")
      .select("*")
      .eq("qc_status", "pending")
      .order("received_date_time", { ascending: true });
    
    if (data) setPendingLots(data);
  };

  const handleSelectLot = (lot: any) => {
    setSelectedLot(lot);
    setFormData({
      ...formData,
      qc_id: `QC-INC-${Date.now()}`
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      let oesFileUrl = "";
      
      if (formData.oes_file) {
        const fileExt = formData.oes_file.name.split('.').pop();
        const fileName = `material_lots/${selectedLot.lot_id}/oes_${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from("documents")
          .upload(fileName, formData.oes_file);
        
        if (uploadError) throw uploadError;
        oesFileUrl = fileName;
      }

      const measurements = formData.measurements ? JSON.parse(formData.measurements) : {};

      // Create a QC record linked to scan event
      const { error: qcError } = await supabase
        .from("scan_events")
        .insert({
          entity_type: "material_lot",
          entity_id: selectedLot.lot_id,
          to_stage: `qc_incoming_${formData.result}`,
          owner_id: user?.id,
          remarks: `QC ID: ${formData.qc_id}, Result: ${formData.result}, ${formData.remarks}`
        });

      if (qcError) throw qcError;

      // Update material lot QC status - material remains "received" but qc_status controls availability
      await supabase
        .from("material_lots")
        .update({ 
          qc_status: formData.result
        })
        .eq("id", selectedLot.id);

      if (formData.result === "pass") {
        // Notify production team
        const prodUsers = await supabase
          .from("user_roles")
          .select("user_id")
          .eq("role", "production");
        
        if (prodUsers.data) {
          await supabase.rpc("notify_users", {
            _user_ids: prodUsers.data.map(u => u.user_id),
            _type: "qc_passed",
            _title: "Material QC Passed",
            _message: `Lot ${selectedLot.lot_id} cleared for production`,
            _entity_type: "material_lot",
            _entity_id: selectedLot.id
          });
        }
      }

      toast({ description: `Incoming QC ${formData.result.toUpperCase()} recorded` });
      setSelectedLot(null);
      setFormData({ qc_id: "", result: "", measurements: "", oes_file: null, remarks: "" });
      loadPendingLots();
    } catch (error) {
      toast({ variant: "destructive", description: "Failed to submit QC record" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <Button variant="ghost" onClick={() => navigate("/")} className="mb-4">
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back
      </Button>

      <h1 className="text-3xl font-bold mb-6">Incoming Material QC</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Pending Inspection</h2>
          {pendingLots.map((lot) => (
            <Card 
              key={lot.id} 
              className={`cursor-pointer ${selectedLot?.id === lot.id ? 'ring-2 ring-primary' : ''}`}
              onClick={() => handleSelectLot(lot)}
            >
              <CardContent className="pt-6">
                <p className="font-semibold">{lot.lot_id}</p>
                <p className="text-sm text-muted-foreground">Heat: {lot.heat_no}</p>
                <p className="text-sm">{lot.alloy} - {lot.net_weight} kg</p>
                <p className="text-xs text-muted-foreground">Supplier: {lot.supplier}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {selectedLot && (
          <Card>
            <CardHeader>
              <CardTitle>QC Inspection - {selectedLot.lot_id}</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <Input
                  value={formData.qc_id}
                  disabled
                  placeholder="QC ID"
                />

                <Select value={formData.result} onValueChange={(value) => setFormData({...formData, result: value})}>
                  <SelectTrigger>
                    <SelectValue placeholder="QC Result" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pass">Pass</SelectItem>
                    <SelectItem value="fail">Fail</SelectItem>
                    <SelectItem value="hold">Hold</SelectItem>
                  </SelectContent>
                </Select>

                <Input
                  placeholder="Measurements (JSON format, e.g., {&quot;carbon&quot;: 0.08})"
                  value={formData.measurements}
                  onChange={(e) => setFormData({...formData, measurements: e.target.value})}
                />

                <div>
                  <label className="block text-sm font-medium mb-2">OES/XRF Report</label>
                  <Input
                    type="file"
                    onChange={(e) => setFormData({...formData, oes_file: e.target.files?.[0] || null})}
                    accept=".pdf,.jpg,.png"
                  />
                </div>

                <Input
                  placeholder="Remarks"
                  value={formData.remarks}
                  onChange={(e) => setFormData({...formData, remarks: e.target.value})}
                />

                <Button type="submit" disabled={loading || !formData.result} className="w-full">
                  Submit Incoming QC
                </Button>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}