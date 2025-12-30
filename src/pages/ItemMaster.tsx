import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Edit, Trash2, Search, Info } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Home } from "lucide-react";

interface ProcessRoute {
  id: string;
  name: string;
  description: string | null;
}

interface MaterialForm {
  id: string;
  name: string;
}

interface CrossSectionShape {
  id: string;
  name: string;
  has_inner_diameter: boolean;
}

interface MaterialGrade {
  id: string;
  name: string;
  category: string | null;
}

export default function ItemMaster() {
  const { toast } = useToast();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  
  // Lookup data
  const [processRoutes, setProcessRoutes] = useState<ProcessRoute[]>([]);
  const [materialForms, setMaterialForms] = useState<MaterialForm[]>([]);
  const [crossSectionShapes, setCrossSectionShapes] = useState<CrossSectionShape[]>([]);
  const [materialGrades, setMaterialGrades] = useState<MaterialGrade[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);

  const [formData, setFormData] = useState({
    item_code: "",
    item_name: "",
    customer_id: "",
    default_process_route_id: "",
    default_material_form: "",
    default_cross_section_shape: "",
    default_nominal_size_mm: "",
    default_inner_diameter_mm: "",
    default_material_grade: "",
    estimated_net_weight_g: "",
    estimated_gross_weight_g: "",
    estimated_cycle_time_s: ""
  });

  // Check if selected shape needs inner diameter
  const selectedShape = crossSectionShapes.find(s => s.name === formData.default_cross_section_shape);
  const showInnerDiameter = selectedShape?.has_inner_diameter || false;

  useEffect(() => {
    loadItems();
    loadLookups();
  }, []);

  const loadLookups = async () => {
    const [routesRes, formsRes, shapesRes, gradesRes, customersRes] = await Promise.all([
      supabase.from("process_routes").select("id, name, description").eq("is_active", true).order("name"),
      supabase.from("material_forms").select("id, name").order("name"),
      supabase.from("cross_section_shapes").select("id, name, has_inner_diameter").order("name"),
      supabase.from("material_grades").select("id, name, category").order("name"),
      supabase.from("customer_master").select("id, customer_name").order("customer_name")
    ]);
    
    if (routesRes.data) setProcessRoutes(routesRes.data);
    if (formsRes.data) setMaterialForms(formsRes.data);
    if (shapesRes.data) setCrossSectionShapes(shapesRes.data);
    if (gradesRes.data) setMaterialGrades(gradesRes.data);
    if (customersRes.data) setCustomers(customersRes.data);
  };

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
      item_name: "",
      customer_id: "",
      default_process_route_id: "",
      default_material_form: "",
      default_cross_section_shape: "",
      default_nominal_size_mm: "",
      default_inner_diameter_mm: "",
      default_material_grade: "",
      estimated_net_weight_g: "",
      estimated_gross_weight_g: "",
      estimated_cycle_time_s: ""
    });
    setIsDialogOpen(true);
  };

  const handleEdit = (item: any) => {
    setEditingItem(item);
    setFormData({
      item_code: item.item_code,
      item_name: item.item_name || "",
      customer_id: item.customer_id || "",
      default_process_route_id: item.default_process_route_id || "",
      default_material_form: item.default_material_form || "",
      default_cross_section_shape: item.default_cross_section_shape || "",
      default_nominal_size_mm: item.default_nominal_size_mm?.toString() || "",
      default_inner_diameter_mm: item.default_inner_diameter_mm?.toString() || "",
      default_material_grade: item.default_material_grade || "",
      estimated_net_weight_g: item.estimated_net_weight_g?.toString() || item.net_weight_grams?.toString() || "",
      estimated_gross_weight_g: item.estimated_gross_weight_g?.toString() || item.gross_weight_grams?.toString() || "",
      estimated_cycle_time_s: item.estimated_cycle_time_s?.toString() || item.cycle_time_seconds?.toString() || ""
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
        item_name: formData.item_name || null,
        customer_id: formData.customer_id || null,
        default_process_route_id: formData.default_process_route_id || null,
        default_material_form: formData.default_material_form || null,
        default_cross_section_shape: formData.default_cross_section_shape || null,
        default_nominal_size_mm: formData.default_nominal_size_mm ? parseFloat(formData.default_nominal_size_mm) : null,
        default_inner_diameter_mm: showInnerDiameter && formData.default_inner_diameter_mm ? parseFloat(formData.default_inner_diameter_mm) : null,
        default_material_grade: formData.default_material_grade || null,
        estimated_net_weight_g: formData.estimated_net_weight_g ? parseFloat(formData.estimated_net_weight_g) : null,
        estimated_gross_weight_g: formData.estimated_gross_weight_g ? parseFloat(formData.estimated_gross_weight_g) : null,
        estimated_cycle_time_s: formData.estimated_cycle_time_s ? parseFloat(formData.estimated_cycle_time_s) : null,
        // Legacy fields mapping
        net_weight_grams: formData.estimated_net_weight_g ? parseFloat(formData.estimated_net_weight_g) : null,
        gross_weight_grams: formData.estimated_gross_weight_g ? parseFloat(formData.estimated_gross_weight_g) : null,
        cycle_time_seconds: formData.estimated_cycle_time_s ? parseFloat(formData.estimated_cycle_time_s) : null,
        last_used: new Date().toISOString()
      };

      if (editingItem) {
        const { error } = await supabase
          .from("item_master")
          .update(dataToSave)
          .eq("id", editingItem.id);
        
        if (error) throw error;
        toast({ description: "Item updated successfully" });
      } else {
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
    i.item_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    i.default_material_grade?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getProcessRouteName = (id: string) => {
    return processRoutes.find(r => r.id === id)?.name || "—";
  };

  const getCustomerName = (id: string) => {
    return customers.find(c => c.id === id)?.customer_name || "—";
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-6">
        <div className="mb-6">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/" className="flex items-center gap-1">
                  <Home className="h-4 w-4" />
                  Home
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Items Master</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>

        <Alert className="mb-6">
          <Info className="h-4 w-4" />
          <AlertDescription>
            <strong>Engineering Defaults Only:</strong> This master defines default manufacturing parameters. 
            Actual batch-specific values are defined in Material Requirements when processing orders.
            These defaults are used to pre-fill forms, not for purchasing or traceability.
          </AlertDescription>
        </Alert>

        <Card>
          <CardHeader>
            <div className="flex justify-between items-start">
              <div>
                <CardTitle>Items Master</CardTitle>
                <CardDescription>Engineering defaults for manufactured items</CardDescription>
              </div>
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
                  placeholder="Search by item code, name, or material grade..."
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
                  : "Items define engineering defaults for products. These defaults pre-fill Material Requirements."
                }
                hint="Item defaults include process route, material specs, and weight estimates."
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
                      <TableHead>Name</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Default Route</TableHead>
                      <TableHead>Material</TableHead>
                      <TableHead>Est. Weight (g)</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredItems.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.item_code}</TableCell>
                        <TableCell>{item.item_name || "—"}</TableCell>
                        <TableCell>
                          {item.customer_id ? (
                            <Badge variant="outline">{getCustomerName(item.customer_id)}</Badge>
                          ) : (
                            <span className="text-muted-foreground text-sm">Multi-customer</span>
                          )}
                        </TableCell>
                        <TableCell>{item.default_process_route_id ? getProcessRouteName(item.default_process_route_id) : "—"}</TableCell>
                        <TableCell>
                          {item.default_material_grade ? (
                            <div className="space-y-1">
                              <Badge variant="secondary">{item.default_material_grade}</Badge>
                              {item.default_cross_section_shape && item.default_nominal_size_mm && (
                                <div className="text-xs text-muted-foreground">
                                  {item.default_nominal_size_mm}mm {item.default_cross_section_shape}
                                </div>
                              )}
                            </div>
                          ) : "—"}
                        </TableCell>
                        <TableCell>
                          {(item.estimated_gross_weight_g || item.gross_weight_grams) ? (
                            <span>
                              {item.estimated_gross_weight_g || item.gross_weight_grams}g 
                              <span className="text-muted-foreground text-sm ml-1">
                                (net: {item.estimated_net_weight_g || item.net_weight_grams}g)
                              </span>
                            </span>
                          ) : "—"}
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
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingItem ? "Edit Item" : "Add Item"}</DialogTitle>
            <DialogDescription>
              Define engineering defaults. These are used to pre-fill Material Requirements, not for direct purchasing.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            {/* Identification Section */}
            <div className="space-y-4">
              <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">Identification</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Item Code *</Label>
                  <Input
                    value={formData.item_code}
                    onChange={(e) => setFormData({ ...formData, item_code: e.target.value })}
                    placeholder="e.g., P12345"
                    disabled={!!editingItem}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Item Name</Label>
                  <Input
                    value={formData.item_name}
                    onChange={(e) => setFormData({ ...formData, item_name: e.target.value })}
                    placeholder="Descriptive name"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Customer (optional)</Label>
                <Select
                  value={formData.customer_id}
                  onValueChange={(value) => setFormData({ ...formData, customer_id: value === "none" ? "" : value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Multi-customer (no specific customer)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Multi-customer</SelectItem>
                    {customers.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.customer_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Process Route Section */}
            <div className="space-y-4">
              <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">Default Process Route</h4>
              <div className="space-y-2">
                <Label>Process Route</Label>
                <Select
                  value={formData.default_process_route_id}
                  onValueChange={(value) => setFormData({ ...formData, default_process_route_id: value === "none" ? "" : value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select default route" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No default</SelectItem>
                    {processRoutes.map(r => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name} {r.description && `- ${r.description}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Material Definition Section */}
            <div className="space-y-4">
              <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">Default Material Definition</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Material Form</Label>
                  <Select
                    value={formData.default_material_form}
                    onValueChange={(value) => setFormData({ ...formData, default_material_form: value === "none" ? "" : value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select form" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Not specified</SelectItem>
                      {materialForms.map(f => (
                        <SelectItem key={f.id} value={f.name}>{f.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Cross-Section Shape</Label>
                  <Select
                    value={formData.default_cross_section_shape}
                    onValueChange={(value) => setFormData({ 
                      ...formData, 
                      default_cross_section_shape: value === "none" ? "" : value,
                      default_inner_diameter_mm: value === "none" ? "" : formData.default_inner_diameter_mm
                    })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select shape" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Not specified</SelectItem>
                      {crossSectionShapes.map(s => (
                        <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Nominal Size (mm)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={formData.default_nominal_size_mm}
                    onChange={(e) => setFormData({ ...formData, default_nominal_size_mm: e.target.value })}
                    placeholder="e.g., 25"
                  />
                </div>
                {showInnerDiameter && (
                  <div className="space-y-2">
                    <Label>Inner Diameter (mm)</Label>
                    <Input
                      type="number"
                      step="0.1"
                      value={formData.default_inner_diameter_mm}
                      onChange={(e) => setFormData({ ...formData, default_inner_diameter_mm: e.target.value })}
                      placeholder="For tubes/pipes"
                    />
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Material Grade</Label>
                  <Select
                    value={formData.default_material_grade}
                    onValueChange={(value) => setFormData({ ...formData, default_material_grade: value === "none" ? "" : value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select grade" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Not specified</SelectItem>
                      {materialGrades.map(g => (
                        <SelectItem key={g.id} value={g.name}>
                          {g.name} {g.category && `(${g.category})`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Estimates Section */}
            <div className="space-y-4">
              <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">Estimated Values (Planning Only)</h4>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Est. Gross Weight (g)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.estimated_gross_weight_g}
                    onChange={(e) => setFormData({ ...formData, estimated_gross_weight_g: e.target.value })}
                    placeholder="Grams"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Est. Net Weight (g)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.estimated_net_weight_g}
                    onChange={(e) => setFormData({ ...formData, estimated_net_weight_g: e.target.value })}
                    placeholder="Grams"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Est. Cycle Time (sec)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={formData.estimated_cycle_time_s}
                    onChange={(e) => setFormData({ ...formData, estimated_cycle_time_s: e.target.value })}
                    placeholder="Seconds"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t">
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
