import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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

  const handleSave = async () => {
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
      
      // Reset form
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
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add New Item</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Item Code *</Label>
              <Input
                value={formData.item_code}
                onChange={(e) => setFormData({ ...formData, item_code: e.target.value })}
                placeholder="Enter item code"
              />
            </div>
            <div className="space-y-2">
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
            </div>
          </div>
          <div className="space-y-2">
            <Label>Material Size/Type</Label>
            <Input
              value={formData.material_size_mm}
              onChange={(e) => setFormData({ ...formData, material_size_mm: e.target.value })}
              placeholder="e.g., Round 12mm, Hex 25mm"
            />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Gross Weight (g)</Label>
              <Input
                type="number"
                step="0.01"
                value={formData.gross_weight_grams}
                onChange={(e) => setFormData({ ...formData, gross_weight_grams: e.target.value })}
                placeholder="Grams"
              />
            </div>
            <div className="space-y-2">
              <Label>Net Weight (g)</Label>
              <Input
                type="number"
                step="0.01"
                value={formData.net_weight_grams}
                onChange={(e) => setFormData({ ...formData, net_weight_grams: e.target.value })}
                placeholder="Grams"
              />
            </div>
            <div className="space-y-2">
              <Label>Cycle Time (sec)</Label>
              <Input
                type="number"
                step="0.01"
                value={formData.cycle_time_seconds}
                onChange={(e) => setFormData({ ...formData, cycle_time_seconds: e.target.value })}
                placeholder="Seconds"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={loading}>
              Add Item
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
