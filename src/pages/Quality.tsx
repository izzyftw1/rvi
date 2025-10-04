import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, Upload } from "lucide-react";

const Quality = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [woId, setWoId] = useState("");
  const [wo, setWo] = useState<any>(null);

  const [formData, setFormData] = useState({
    qc_id: "",
    qc_type: "",
    result: "",
    measurements: "",
    remarks: "",
    oes_xrf_file: null as File | null,
  });

  const handleFindWO = async () => {
    try {
      const { data, error } = await supabase
        .from("work_orders")
        .select("*")
        .eq("wo_id", woId)
        .single();

      if (error) throw error;

      if (data) {
        setWo(data);
        // Auto-generate QC ID
        setFormData({
          ...formData,
          qc_id: `QC-${woId}-${Date.now().toString().slice(-6)}`,
        });
      } else {
        toast({
          variant: "destructive",
          title: "Not found",
          description: "Work order not found",
        });
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wo) return;

    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();

      // Upload OES/XRF file if provided
      let oes_xrf_file_url = null;
      if (formData.oes_xrf_file) {
        const fileExt = formData.oes_xrf_file.name.split('.').pop();
        const fileName = `${user?.id}/qc/${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('documents')
          .upload(fileName, formData.oes_xrf_file);

        if (uploadError) throw uploadError;
        oes_xrf_file_url = fileName;
      }

      // Parse measurements JSON
      let measurements = null;
      if (formData.measurements) {
        try {
          measurements = JSON.parse(formData.measurements);
        } catch {
          measurements = { notes: formData.measurements };
        }
      }

      // Create QC record
      const { error: insertError } = await supabase.from("qc_records").insert([{
        qc_id: formData.qc_id,
        wo_id: wo.id,
        qc_type: formData.qc_type as any,
        result: formData.result as any,
        measurements,
        oes_xrf_file: oes_xrf_file_url,
        remarks: formData.remarks,
        approved_by: user?.id,
      }]);

      if (insertError) throw insertError;

      // If pass, update WO status
      if (formData.result === "pass" && formData.qc_type === "final") {
        await supabase
          .from("work_orders")
          .update({ status: "qc" as any })
          .eq("id", wo.id);
      }

      toast({
        title: "QC record created",
        description: `${formData.qc_id} - ${formData.result.toUpperCase()}`,
      });

      // Reset
      setWoId("");
      setWo(null);
      setFormData({
        qc_id: "",
        qc_type: "",
        result: "",
        measurements: "",
        remarks: "",
        oes_xrf_file: null,
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Failed to create QC record",
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={() => navigate("/")}>
            ← Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Quality Control</h1>
            <p className="text-sm text-muted-foreground">Create QC inspection records</p>
          </div>
        </div>

        {/* Find WO */}
        <Card>
          <CardHeader>
            <CardTitle>Find Work Order</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input
                placeholder="Enter WO ID..."
                value={woId}
                onChange={(e) => setWoId(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && handleFindWO()}
              />
              <Button onClick={handleFindWO}>Find</Button>
            </div>
          </CardContent>
        </Card>

        {/* WO Info & QC Form */}
        {wo && (
          <>
            <Card className="border-primary">
              <CardHeader>
                <CardTitle>{wo.wo_id}</CardTitle>
                <CardDescription>
                  {wo.customer} • {wo.item_code} • {wo.quantity} pcs
                </CardDescription>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5" />
                  QC Inspection
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="qc_id">QC ID</Label>
                      <Input
                        id="qc_id"
                        value={formData.qc_id}
                        onChange={(e) => setFormData({ ...formData, qc_id: e.target.value })}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="qc_type">Inspection Type *</Label>
                      <Select
                        value={formData.qc_type}
                        onValueChange={(value) => setFormData({ ...formData, qc_type: value })}
                        required
                      >
                        <SelectTrigger id="qc_type">
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="first_piece">First Piece</SelectItem>
                          <SelectItem value="in_process">In-Process</SelectItem>
                          <SelectItem value="final">Final Inspection</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="result">Result *</Label>
                    <Select
                      value={formData.result}
                      onValueChange={(value) => setFormData({ ...formData, result: value })}
                      required
                    >
                      <SelectTrigger id="result">
                        <SelectValue placeholder="Select result" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pass">Pass</SelectItem>
                        <SelectItem value="fail">Fail</SelectItem>
                        <SelectItem value="rework">Rework Required</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="measurements">Measurements (JSON or text)</Label>
                    <Textarea
                      id="measurements"
                      value={formData.measurements}
                      onChange={(e) => setFormData({ ...formData, measurements: e.target.value })}
                      placeholder='{"diameter": 25.4, "length": 100.2} or free text'
                      rows={3}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="oes_xrf_file">OES/XRF Report</Label>
                    <Input
                      id="oes_xrf_file"
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      onChange={(e) =>
                        setFormData({ ...formData, oes_xrf_file: e.target.files?.[0] || null })
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="remarks">Remarks</Label>
                    <Textarea
                      id="remarks"
                      value={formData.remarks}
                      onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                      placeholder="Additional notes..."
                      rows={3}
                    />
                  </div>

                  <Button type="submit" disabled={loading} className="w-full">
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Submit QC Record
                  </Button>
                </form>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
};

export default Quality;
