import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { NavigationHeader } from "@/components/NavigationHeader";
import { useToast } from "@/hooks/use-toast";
import { Plus, Edit, Trash2, Search } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

export default function ItemMaster() {
  const { toast } = useToast();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [formData, setFormData] = useState({
    item_code: "",
    alloy: "",
    material_size_mm: "",
    gross_weight_grams: "",
    net_weight_grams: "",
    cycle_time_seconds: ""
  });

  useEffect(() => {
    loadItems();
  }, []);

  const loadItems = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("item_master")
      .select("*")
      .order("last_used", { ascending: false });
    
    if (!error && data) {
      setItems(data);
    }
    setLoading(false);
  };

  const handleAdd = () => {
    setEditingItem(null);
    setFormData({
      item_code: "",
      alloy: "",
      material_size_mm: "",
      gross_weight_grams: "",
      net_weight_grams: "",
      cycle_time_seconds: ""
    });
    setIsDialogOpen(true);
  };

  const handleEdit = (item: any) => {
    setEditingItem(item);
    setFormData({
      item_code: item.item_code,
      alloy: item.alloy || "",
      material_size_mm: item.material_size_mm || "",
      gross_weight_grams: item.gross_weight_grams?.toString() || "",
      net_weight_grams: item.net_weight_grams?.toString() || "",
      cycle_time_seconds: item.cycle_time_seconds?.toString() || ""
    });
    setIsDialogOpen(true);
  };

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

      if (editingItem) {
        // Update
        const { error } = await supabase
          .from("item_master")
          .update(dataToSave)
          .eq("id", editingItem.id);
        
        if (error) throw error;
        toast({ description: "Item updated successfully" });
      } else {
        // Insert
        const { error } = await supabase
          .from("item_master")
          .insert([dataToSave]);
        
        if (error) throw error;
        toast({ description: "Item added successfully" });
      }

      setIsDialogOpen(false);
      await loadItems();
    } catch (err: any) {
      toast({ variant: "destructive", description: `Error: ${err.message}` });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, code: string) => {
    if (!confirm(`Are you sure you want to delete item "${code}"?`)) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from("item_master")
        .delete()
        .eq("id", id);
      
      if (error) throw error;
      toast({ description: "Item deleted successfully" });
      await loadItems();
    } catch (err: any) {
      toast({ variant: "destructive", description: `Error: ${err.message}` });
    } finally {
      setLoading(false);
    }
  };

  const filteredItems = items.filter(i =>
    i.item_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    i.alloy?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-background">
      <NavigationHeader title="Item Master" subtitle="Manage item database" />
      
      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>Items</CardTitle>
              <Button onClick={handleAdd}>
                <Plus className="h-4 w-4 mr-2" />
                Add Item
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {/* Search */}
            <div className="mb-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search items by code or alloy..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            {/* Table */}
            {loading ? (
              <p className="text-center py-8 text-muted-foreground">Loading...</p>
            ) : filteredItems.length === 0 ? (
              <EmptyState
                icon="items"
                title={searchTerm ? "No Items Match Your Search" : "No Items in Catalog"}
                description={searchTerm 
                  ? `No items match "${searchTerm}". Try a different search term.`
                  : "Items define the products you manufacture. Add items to use them in Sales Orders and Work Orders."
                }
                hint="Items include material specifications, weights, and cycle times for production planning."
                action={!searchTerm ? {
                  label: "Add Item",
                  onClick: handleAdd,
                } : {
                  label: "Clear Search",
                  onClick: () => setSearchTerm(""),
                  variant: "outline",
                }}
                size="md"
              />
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item Code</TableHead>
                      <TableHead>Alloy</TableHead>
                      <TableHead>Material Size</TableHead>
                      <TableHead>Gross Wt (g)</TableHead>
                      <TableHead>Net Wt (g)</TableHead>
                      <TableHead>Cycle Time (s)</TableHead>
                      <TableHead>Last Used</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredItems.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.item_code}</TableCell>
                        <TableCell>{item.alloy || "—"}</TableCell>
                        <TableCell>{item.material_size_mm || "—"}</TableCell>
                        <TableCell>{item.gross_weight_grams || "—"}</TableCell>
                        <TableCell>{item.net_weight_grams || "—"}</TableCell>
                        <TableCell>{item.cycle_time_seconds || "—"}</TableCell>
                        <TableCell>
                          {item.last_used 
                            ? new Date(item.last_used).toLocaleDateString()
                            : "Never"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEdit(item)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(item.id, item.item_code)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingItem ? "Edit Item" : "Add Item"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Item Code *</Label>
                <Input
                  value={formData.item_code}
                  onChange={(e) => setFormData({ ...formData, item_code: e.target.value })}
                  placeholder="Enter item code"
                  disabled={!!editingItem}
                />
              </div>
              <div className="space-y-2">
                <Label>Alloy</Label>
                <Input
                  value={formData.alloy}
                  onChange={(e) => setFormData({ ...formData, alloy: e.target.value })}
                  placeholder="e.g., SS316L"
                />
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
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={loading}>
                {editingItem ? "Update" : "Add"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
