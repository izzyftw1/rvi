import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormSection, FormRow, FormField, FormActions, FormContainer, RequiredIndicator } from "@/components/ui/form-layout";

const ALLOYS = [
  { group: "Brass Alloys", items: ["C36000", "C37700", "C38500", "C46400", "C23000", "C27200", "C26000", "C27450", "DZR Brass (CW602N)", "CW614N", "CW617N", "CZ122"] },
  { group: "Stainless Steels", items: ["SS304", "SS304L", "SS316", "SS316L", "SS410", "SS420", "SS430"] },
  { group: "Copper Alloys", items: ["ETP Copper", "OFHC Copper"] },
  { group: "Aluminium Alloys", items: ["6061", "6082", "7075", "1100", "2024", "5052"] }
];

interface AddItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onItemAdded: (item: any) => void;
}

export function AddItemDialog({ open, onOpenChange, onItemAdded }: AddItemDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    item_code: "",
    alloy: "",
    material_size_mm: "",
    gross_weight_grams: "",
    net_weight_grams: "",
    cycle_time_seconds: ""
  });

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
        alloy: formData.alloy || null,
        material_size_mm: formData.material_size_mm || null,
        gross_weight_grams: formData.gross_weight_grams ? parseFloat(formData.gross_weight_grams) : null,
        net_weight_grams: formData.net_weight_grams ? parseFloat(formData.net_weight_grams) : null,
        cycle_time_seconds: formData.cycle_time_seconds ? parseFloat(formData.cycle_time_seconds) : null,
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
        alloy: "",
        material_size_mm: "",
        gross_weight_grams: "",
        net_weight_grams: "",
        cycle_time_seconds: ""
      });
    } catch (err: any) {
      toast({ variant: "destructive", description: `Error: ${err.message}` });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add New Item</DialogTitle>
          <DialogDescription>
            Create a new item in the master catalog
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
                  placeholder="Enter item code"
                />
              </FormField>
              <FormField>
                <Label>Alloy</Label>
                <Select value={formData.alloy} onValueChange={(v) => setFormData({ ...formData, alloy: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select alloy" />
                  </SelectTrigger>
                  <SelectContent className="bg-background z-50">
                    {ALLOYS.map(group => (
                      <div key={group.group}>
                        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                          {group.group}
                        </div>
                        {group.items.map(alloy => (
                          <SelectItem key={alloy} value={alloy}>
                            {alloy}
                          </SelectItem>
                        ))}
                      </div>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
            </FormRow>
          </FormSection>

          {/* Material Specifications */}
          <FormSection title="Material Specifications" withSeparator>
            <FormField>
              <Label>Material Size/Type</Label>
              <Input
                value={formData.material_size_mm}
                onChange={(e) => setFormData({ ...formData, material_size_mm: e.target.value })}
                placeholder="e.g., Round 12mm, Hex 25mm"
              />
            </FormField>
          </FormSection>

          {/* Production Parameters */}
          <FormSection title="Production Parameters" withSeparator>
            <FormRow cols={3}>
              <FormField>
                <Label>Gross Weight (g)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.gross_weight_grams}
                  onChange={(e) => setFormData({ ...formData, gross_weight_grams: e.target.value })}
                  placeholder="Grams"
                />
              </FormField>
              <FormField>
                <Label>Net Weight (g)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.net_weight_grams}
                  onChange={(e) => setFormData({ ...formData, net_weight_grams: e.target.value })}
                  placeholder="Grams"
                />
              </FormField>
              <FormField>
                <Label>Cycle Time (sec)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.cycle_time_seconds}
                  onChange={(e) => setFormData({ ...formData, cycle_time_seconds: e.target.value })}
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
