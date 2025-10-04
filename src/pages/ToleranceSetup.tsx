import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";

const OPERATIONS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'] as const;

interface DimensionTolerance {
  min: number;
  max: number;
  label: string;
}

const ToleranceSetup = () => {
  const navigate = useNavigate();
  const [tolerances, setTolerances] = useState<any[]>([]);
  const [itemCodes, setItemCodes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    item_code: "",
    revision: "",
    operation: "A" as typeof OPERATIONS[number],
  });

  const [dimensions, setDimensions] = useState<Record<number, DimensionTolerance>>({});
  
  useEffect(() => {
    loadTolerances();
    loadItemCodes();
  }, []);

  useEffect(() => {
    if (Object.keys(dimensions).length === 0) {
      const initial: Record<number, DimensionTolerance> = {};
      for (let i = 1; i <= 20; i++) {
        initial[i] = { min: 0, max: 0, label: `Dimension ${i}` };
      }
      setDimensions(initial);
    }
  }, []);

  const loadTolerances = async () => {
    try {
      const { data, error } = await supabase
        .from("dimension_tolerances")
        .select("*")
        .order("item_code", { ascending: true });

      if (error) throw error;
      setTolerances(data || []);
    } catch (error: any) {
      toast.error("Failed to load tolerances: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const loadItemCodes = async () => {
    try {
      const { data, error } = await supabase
        .from("work_orders")
        .select("item_code")
        .order("item_code", { ascending: true });

      if (error) throw error;
      
      // Get unique item codes
      const unique = Array.from(new Set(data?.map(wo => wo.item_code) || []));
      setItemCodes(unique);
    } catch (error: any) {
      toast.error("Failed to load item codes: " + error.message);
    }
  };

  const addMoreDimensions = () => {
    const currentCount = Object.keys(dimensions).length;
    if (currentCount >= 100) {
      toast.error("Maximum 100 dimensions allowed");
      return;
    }
    const toAdd = Math.min(10, 100 - currentCount);
    const newDimensions = { ...dimensions };
    for (let i = 1; i <= toAdd; i++) {
      const dimNum = currentCount + i;
      newDimensions[dimNum] = { min: 0, max: 0, label: `Dimension ${dimNum}` };
    }
    setDimensions(newDimensions);
    toast.success(`Added ${toAdd} more dimensions`);
  };

  const removeDimension = (dimNum: number) => {
    if (Object.keys(dimensions).length <= 1) {
      toast.error("At least one dimension is required");
      return;
    }
    const newDimensions = { ...dimensions };
    delete newDimensions[dimNum];
    setDimensions(newDimensions);
  };

  const handleSave = async () => {
    try {
      if (!formData.item_code) {
        toast.error("Item code is required");
        return;
      }

      const payload = {
        item_code: formData.item_code,
        revision: formData.revision || null,
        operation: formData.operation,
        dimensions: dimensions as any,
      };

      let error;
      if (editingId) {
        ({ error } = await supabase
          .from("dimension_tolerances")
          .update(payload)
          .eq("id", editingId));
      } else {
        ({ error } = await supabase
          .from("dimension_tolerances")
          .insert([payload]));
      }

      if (error) throw error;

      toast.success(editingId ? "Tolerance updated successfully" : "Tolerance created successfully");
      resetForm();
      loadTolerances();
    } catch (error: any) {
      toast.error("Failed to save tolerance: " + error.message);
    }
  };

  const handleEdit = (tolerance: any) => {
    setEditingId(tolerance.id);
    setFormData({
      item_code: tolerance.item_code,
      revision: tolerance.revision || "",
      operation: tolerance.operation,
    });
    setDimensions(tolerance.dimensions || {});
  };

  const resetForm = () => {
    setEditingId(null);
    setFormData({
      item_code: "",
      revision: "",
      operation: "A",
    });
    const initial: Record<number, DimensionTolerance> = {};
    for (let i = 1; i <= 20; i++) {
      initial[i] = { min: 0, max: 0, label: `Dimension ${i}` };
    }
    setDimensions(initial);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="max-w-4xl mx-auto">
          <div className="text-center py-12">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Tolerance Setup</h1>
            <p className="text-sm text-muted-foreground">Define dimensional tolerances per part and operation (Manager/QC Supervisor only)</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{editingId ? "Edit Tolerance" : "Add New Tolerance"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="item_code">Item Code *</Label>
                <Select
                  value={formData.item_code}
                  onValueChange={(value) => setFormData({ ...formData, item_code: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select item code" />
                  </SelectTrigger>
                  <SelectContent>
                    {itemCodes.map((code) => (
                      <SelectItem key={code} value={code}>
                        {code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="revision">Revision</Label>
                <Input
                  id="revision"
                  value={formData.revision}
                  onChange={(e) => setFormData({ ...formData, revision: e.target.value })}
                  placeholder="e.g., A"
                />
              </div>
              <div>
                <Label htmlFor="operation">Operation *</Label>
                <Select
                  value={formData.operation}
                  onValueChange={(value) => setFormData({ ...formData, operation: value as typeof OPERATIONS[number] })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OPERATIONS.map((op) => (
                      <SelectItem key={op} value={op}>
                        Operation {op}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">
                  Dimension Tolerances ({Object.keys(dimensions).length}/100)
                </h3>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addMoreDimensions}
                  disabled={Object.keys(dimensions).length >= 100}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add More (+10)
                </Button>
              </div>
              
              <div className="max-h-96 overflow-y-auto space-y-3 border rounded-lg p-4">
                {Object.entries(dimensions)
                  .sort(([a], [b]) => parseInt(a) - parseInt(b))
                  .map(([dimNum, dimData]) => (
                    <div key={dimNum} className="grid grid-cols-[auto_1fr_1fr_auto] gap-3 items-end p-3 bg-muted/50 rounded">
                      <div className="font-medium text-sm pt-6">
                        {dimNum}
                      </div>
                      <div>
                        <Label htmlFor={`dim_${dimNum}_min`} className="text-xs">Min</Label>
                        <Input
                          id={`dim_${dimNum}_min`}
                          type="number"
                          step="0.001"
                          value={dimData.min}
                          onChange={(e) =>
                            setDimensions({
                              ...dimensions,
                              [dimNum]: { ...dimData, min: parseFloat(e.target.value) || 0 },
                            })
                          }
                          placeholder="Min"
                        />
                      </div>
                      <div>
                        <Label htmlFor={`dim_${dimNum}_max`} className="text-xs">Max</Label>
                        <Input
                          id={`dim_${dimNum}_max`}
                          type="number"
                          step="0.001"
                          value={dimData.max}
                          onChange={(e) =>
                            setDimensions({
                              ...dimensions,
                              [dimNum]: { ...dimData, max: parseFloat(e.target.value) || 0 },
                            })
                          }
                          placeholder="Max"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeDimension(parseInt(dimNum))}
                        disabled={Object.keys(dimensions).length <= 1}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={handleSave}>
                {editingId ? "Update Tolerance" : "Save Tolerance"}
              </Button>
              {editingId && (
                <Button variant="outline" onClick={resetForm}>
                  Cancel Edit
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
            <div className="space-y-4">
              {tolerances.map((tolerance) => (
                <div
                  key={tolerance.id}
                  className="p-4 border rounded-lg flex items-center justify-between hover:bg-muted/50"
                >
                  <div className="flex-1">
                    <div className="font-medium">
                      {tolerance.item_code} {tolerance.revision && `(Rev ${tolerance.revision})`}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Operation {tolerance.operation} • {Object.keys(tolerance.dimensions || {}).length} dimensions
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => handleEdit(tolerance)}>
                    Edit
                  </Button>
                </div>
              ))}
              {tolerances.length === 0 && (
                <div className="text-center text-muted-foreground py-8">
                  No tolerances defined yet
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ToleranceSetup;
