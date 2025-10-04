import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowLeft, Plus, Edit2, Save, X } from "lucide-react";
import { useNavigate } from "react-router-dom";

const ToleranceSetup = () => {
  const navigate = useNavigate();
  const [tolerances, setTolerances] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    item_code: "",
    revision: "",
    dimension_a_min: "",
    dimension_a_max: "",
    dimension_b_min: "",
    dimension_b_max: "",
    dimension_c_min: "",
    dimension_c_max: "",
    dimension_d_min: "",
    dimension_d_max: "",
    dimension_e_min: "",
    dimension_e_max: "",
    dimension_f_min: "",
    dimension_f_max: "",
    dimension_g_min: "",
    dimension_g_max: "",
  });

  useEffect(() => {
    loadTolerances();
  }, []);

  const loadTolerances = async () => {
    try {
      const { data, error } = await supabase
        .from("dimension_tolerances")
        .select("*")
        .order("item_code");

      if (error) throw error;
      setTolerances(data || []);
    } catch (error: any) {
      toast.error("Failed to load tolerances: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      const payload = {
        item_code: formData.item_code,
        revision: formData.revision || null,
        dimension_a_min: formData.dimension_a_min ? parseFloat(formData.dimension_a_min) : null,
        dimension_a_max: formData.dimension_a_max ? parseFloat(formData.dimension_a_max) : null,
        dimension_b_min: formData.dimension_b_min ? parseFloat(formData.dimension_b_min) : null,
        dimension_b_max: formData.dimension_b_max ? parseFloat(formData.dimension_b_max) : null,
        dimension_c_min: formData.dimension_c_min ? parseFloat(formData.dimension_c_min) : null,
        dimension_c_max: formData.dimension_c_max ? parseFloat(formData.dimension_c_max) : null,
        dimension_d_min: formData.dimension_d_min ? parseFloat(formData.dimension_d_min) : null,
        dimension_d_max: formData.dimension_d_max ? parseFloat(formData.dimension_d_max) : null,
        dimension_e_min: formData.dimension_e_min ? parseFloat(formData.dimension_e_min) : null,
        dimension_e_max: formData.dimension_e_max ? parseFloat(formData.dimension_e_max) : null,
        dimension_f_min: formData.dimension_f_min ? parseFloat(formData.dimension_f_min) : null,
        dimension_f_max: formData.dimension_f_max ? parseFloat(formData.dimension_f_max) : null,
        dimension_g_min: formData.dimension_g_min ? parseFloat(formData.dimension_g_min) : null,
        dimension_g_max: formData.dimension_g_max ? parseFloat(formData.dimension_g_max) : null,
      };

      if (editingId) {
        const { error } = await supabase
          .from("dimension_tolerances")
          .update(payload)
          .eq("id", editingId);
        if (error) throw error;
        toast.success("Tolerance updated successfully");
      } else {
        const { error } = await supabase
          .from("dimension_tolerances")
          .insert(payload);
        if (error) throw error;
        toast.success("Tolerance created successfully");
      }

      resetForm();
      loadTolerances();
    } catch (error: any) {
      toast.error("Failed to save: " + error.message);
    }
  };

  const handleEdit = (tolerance: any) => {
    setEditingId(tolerance.id);
    setFormData({
      item_code: tolerance.item_code,
      revision: tolerance.revision || "",
      dimension_a_min: tolerance.dimension_a_min || "",
      dimension_a_max: tolerance.dimension_a_max || "",
      dimension_b_min: tolerance.dimension_b_min || "",
      dimension_b_max: tolerance.dimension_b_max || "",
      dimension_c_min: tolerance.dimension_c_min || "",
      dimension_c_max: tolerance.dimension_c_max || "",
      dimension_d_min: tolerance.dimension_d_min || "",
      dimension_d_max: tolerance.dimension_d_max || "",
      dimension_e_min: tolerance.dimension_e_min || "",
      dimension_e_max: tolerance.dimension_e_max || "",
      dimension_f_min: tolerance.dimension_f_min || "",
      dimension_f_max: tolerance.dimension_f_max || "",
      dimension_g_min: tolerance.dimension_g_min || "",
      dimension_g_max: tolerance.dimension_g_max || "",
    });
  };

  const resetForm = () => {
    setEditingId(null);
    setFormData({
      item_code: "",
      revision: "",
      dimension_a_min: "",
      dimension_a_max: "",
      dimension_b_min: "",
      dimension_b_max: "",
      dimension_c_min: "",
      dimension_c_max: "",
      dimension_d_min: "",
      dimension_d_max: "",
      dimension_e_min: "",
      dimension_e_max: "",
      dimension_f_min: "",
      dimension_f_max: "",
      dimension_g_min: "",
      dimension_g_max: "",
    });
  };

  const dimensions = ["A", "B", "C", "D", "E", "F", "G"];

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Dimension Tolerance Setup</h1>
            <p className="text-sm text-muted-foreground">Manager/QC Supervisor Only</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{editingId ? "Edit Tolerance" : "Add New Tolerance"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Item Code</Label>
                <Input
                  value={formData.item_code}
                  onChange={(e) => setFormData({ ...formData, item_code: e.target.value })}
                  placeholder="Enter item code"
                />
              </div>
              <div>
                <Label>Revision</Label>
                <Input
                  value={formData.revision}
                  onChange={(e) => setFormData({ ...formData, revision: e.target.value })}
                  placeholder="Optional"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {dimensions.map((dim) => {
                const dimLower = dim.toLowerCase();
                return (
                  <Card key={dim}>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm">Dimension {dim}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div>
                        <Label className="text-xs">Min</Label>
                        <Input
                          type="number"
                          step="0.001"
                          value={formData[`dimension_${dimLower}_min` as keyof typeof formData]}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              [`dimension_${dimLower}_min`]: e.target.value,
                            })
                          }
                          placeholder="Min value"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Max</Label>
                        <Input
                          type="number"
                          step="0.001"
                          value={formData[`dimension_${dimLower}_max` as keyof typeof formData]}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              [`dimension_${dimLower}_max`]: e.target.value,
                            })
                          }
                          placeholder="Max value"
                        />
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <div className="flex gap-2">
              <Button onClick={handleSave}>
                <Save className="h-4 w-4 mr-2" />
                {editingId ? "Update" : "Create"}
              </Button>
              {editingId && (
                <Button variant="outline" onClick={resetForm}>
                  <X className="h-4 w-4 mr-2" />
                  Cancel
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Existing Tolerances</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8">Loading...</div>
            ) : tolerances.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No tolerances defined yet
              </div>
            ) : (
              <div className="space-y-2">
                {tolerances.map((tol) => (
                  <div
                    key={tol.id}
                    className="flex items-center justify-between p-4 border rounded-lg"
                  >
                    <div>
                      <div className="font-medium">
                        {tol.item_code}
                        {tol.revision && ` (Rev: ${tol.revision})`}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {dimensions
                          .filter((dim) => {
                            const dimLower = dim.toLowerCase();
                            return tol[`dimension_${dimLower}_min`] || tol[`dimension_${dimLower}_max`];
                          })
                          .map((dim) => `${dim}`)
                          .join(", ")}
                      </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => handleEdit(tol)}>
                      <Edit2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ToleranceSetup;
