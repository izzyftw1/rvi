import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormSection, FormRow, FormField, FormActions, FormContainer, RequiredIndicator } from "@/components/ui/form-layout";

interface MaterialGrade {
  id: string;
  name: string;
  category: string | null;
}

interface CrossSectionShape {
  id: string;
  name: string;
  has_inner_diameter: boolean;
}

interface MaterialForm {
  id: string;
  name: string;
}

interface ProcessRoute {
  id: string;
  name: string;
}

interface AddItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onItemAdded: (item: any) => void;
}

export function AddItemDialog({ open, onOpenChange, onItemAdded }: AddItemDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [materialGrades, setMaterialGrades] = useState<MaterialGrade[]>([]);
  const [crossSectionShapes, setCrossSectionShapes] = useState<CrossSectionShape[]>([]);
  const [materialForms, setMaterialForms] = useState<MaterialForm[]>([]);
  const [processRoutes, setProcessRoutes] = useState<ProcessRoute[]>([]);

  const [formData, setFormData] = useState({
    item_code: "",
    item_name: "",
    default_process_route_id: "",
    default_material_form: "",
    default_cross_section_shape: "",
    default_nominal_size_mm: "",
    default_material_grade: "",
    estimated_gross_weight_g: "",
    estimated_net_weight_g: "",
    estimated_cycle_time_s: ""
  });

  const selectedShape = crossSectionShapes.find(s => s.name === formData.default_cross_section_shape);
  const showInnerDiameter = selectedShape?.has_inner_diameter || false;

  useEffect(() => {
    if (open) loadLookups();
  }, [open]);

  const loadLookups = async () => {
    const [gradesRes, shapesRes, formsRes, routesRes] = await Promise.all([
      supabase.from("material_grades").select("id, name, category").order("name"),
      supabase.from("cross_section_shapes").select("id, name, has_inner_diameter").order("name"),
      supabase.from("material_forms").select("id, name").order("name"),
      supabase.from("process_routes").select("id, name").eq("is_active", true).order("name"),
    ]);
    if (gradesRes.data) setMaterialGrades(gradesRes.data);
    if (shapesRes.data) setCrossSectionShapes(shapesRes.data);
    if (formsRes.data) setMaterialForms(formsRes.data);
    if (routesRes.data) setProcessRoutes(routesRes.data);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.item_code.trim()) {
      toast({ variant: "destructive", description: "Item code is required" });
      return;
    }

    setLoading(true);
    try {
      const dataToSave = {
        item_code: formData.item_code,
        item_name: formData.item_name || null,
        default_process_route_id: formData.default_process_route_id || null,
        default_material_form: formData.default_material_form || null,
        default_cross_section_shape: formData.default_cross_section_shape || null,
        default_nominal_size_mm: formData.default_nominal_size_mm ? parseFloat(formData.default_nominal_size_mm) : null,
        default_material_grade: formData.default_material_grade || null,
        estimated_gross_weight_g: formData.estimated_gross_weight_g ? parseFloat(formData.estimated_gross_weight_g) : null,
        estimated_net_weight_g: formData.estimated_net_weight_g ? parseFloat(formData.estimated_net_weight_g) : null,
        estimated_cycle_time_s: formData.estimated_cycle_time_s ? parseFloat(formData.estimated_cycle_time_s) : null,
        // Legacy field sync
        gross_weight_grams: formData.estimated_gross_weight_g ? parseFloat(formData.estimated_gross_weight_g) : null,
        net_weight_grams: formData.estimated_net_weight_g ? parseFloat(formData.estimated_net_weight_g) : null,
        cycle_time_seconds: formData.estimated_cycle_time_s ? parseFloat(formData.estimated_cycle_time_s) : null,
        last_used: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from("item_master")
        .insert([dataToSave])
        .select()
        .single();
      
      if (error) throw error;
      
      toast({ description: "Item added successfully" });
      onItemAdded(data);
      onOpenChange(false);
      
      setFormData({
        item_code: "",
        item_name: "",
        default_process_route_id: "",
        default_material_form: "",
        default_cross_section_shape: "",
        default_nominal_size_mm: "",
        default_material_grade: "",
        estimated_gross_weight_g: "",
        estimated_net_weight_g: "",
        estimated_cycle_time_s: ""
      });
    } catch (err: any) {
      toast({ variant: "destructive", description: `Error: ${err.message}` });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Item</DialogTitle>
          <DialogDescription>
            Create a new item with engineering defaults
          </DialogDescription>
        </DialogHeader>

        <FormContainer onSubmit={handleSave}>
          {/* Identification */}
          <FormSection title="Identification">
            <FormRow>
              <FormField>
                <Label>Item Code<RequiredIndicator /></Label>
                <Input
                  value={formData.item_code}
                  onChange={(e) => setFormData({ ...formData, item_code: e.target.value })}
                  placeholder="e.g., P12345"
                />
              </FormField>
              <FormField>
                <Label>Item Name</Label>
                <Input
                  value={formData.item_name}
                  onChange={(e) => setFormData({ ...formData, item_name: e.target.value })}
                  placeholder="Descriptive name"
                />
              </FormField>
            </FormRow>
          </FormSection>

          {/* Process & Material */}
          <FormSection title="Process & Material" withSeparator>
            <FormRow>
              <FormField>
                <Label>Default Process Route</Label>
                <Select value={formData.default_process_route_id} onValueChange={(v) => setFormData({ ...formData, default_process_route_id: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select route" />
                  </SelectTrigger>
                  <SelectContent className="bg-background z-50">
                    {processRoutes.map(r => (
                      <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
              <FormField>
                <Label>Material Grade</Label>
                <Select value={formData.default_material_grade} onValueChange={(v) => setFormData({ ...formData, default_material_grade: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select grade" />
                  </SelectTrigger>
                  <SelectContent className="bg-background z-50 max-h-60">
                    {materialGrades.map(g => (
                      <SelectItem key={g.id} value={g.name}>
                        {g.name}{g.category ? ` (${g.category})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
            </FormRow>
            <FormRow>
              <FormField>
                <Label>Material Form</Label>
                <Select value={formData.default_material_form} onValueChange={(v) => setFormData({ ...formData, default_material_form: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select form" />
                  </SelectTrigger>
                  <SelectContent className="bg-background z-50">
                    {materialForms.map(f => (
                      <SelectItem key={f.id} value={f.name}>{f.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
              <FormField>
                <Label>Cross Section Shape</Label>
                <Select value={formData.default_cross_section_shape} onValueChange={(v) => setFormData({ ...formData, default_cross_section_shape: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select shape" />
                  </SelectTrigger>
                  <SelectContent className="bg-background z-50">
                    {crossSectionShapes.map(s => (
                      <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
            </FormRow>
            <FormField>
              <Label>Nominal Size (mm)</Label>
              <Input
                type="number"
                step="0.01"
                value={formData.default_nominal_size_mm}
                onChange={(e) => setFormData({ ...formData, default_nominal_size_mm: e.target.value })}
                placeholder="Diameter/width in mm"
              />
            </FormField>
          </FormSection>

          {/* Weight & Cycle Time */}
          <FormSection title="Production Estimates" withSeparator>
            <FormRow cols={3}>
              <FormField>
                <Label>Gross Weight (g)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.estimated_gross_weight_g}
                  onChange={(e) => setFormData({ ...formData, estimated_gross_weight_g: e.target.value })}
                  placeholder="Grams"
                />
              </FormField>
              <FormField>
                <Label>Net Weight (g)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.estimated_net_weight_g}
                  onChange={(e) => setFormData({ ...formData, estimated_net_weight_g: e.target.value })}
                  placeholder="Grams"
                />
              </FormField>
              <FormField>
                <Label>Cycle Time (sec)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.estimated_cycle_time_s}
                  onChange={(e) => setFormData({ ...formData, estimated_cycle_time_s: e.target.value })}
                  placeholder="Seconds"
                />
              </FormField>
            </FormRow>
          </FormSection>

          <FormActions>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Adding...' : 'Add Item'}
            </Button>
          </FormActions>
        </FormContainer>
      </DialogContent>
    </Dialog>
  );
}
