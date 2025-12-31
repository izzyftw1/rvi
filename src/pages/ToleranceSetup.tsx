import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Settings, Search, Check, ChevronsUpDown, Plus, Trash2, Edit, AlertCircle, Info } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

import React from "react";

const OPERATIONS = ['A', 'B', 'C', 'D'] as const;

interface DimensionTolerance {
  id?: string;
  item_code: string;
  revision: string;
  operation: string;
  dimensions: Record<string, { name: string; min: number; max: number }>;
  created_at?: string;
}

const ToleranceSetup = () => {
  const [tolerances, setTolerances] = useState<DimensionTolerance[]>([]);
  const [itemCodes, setItemCodes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [itemSearchOpen, setItemSearchOpen] = useState(false);
  const [itemSearch, setItemSearch] = useState("");
  
  const [formData, setFormData] = useState({
    item_code: "",
    revision: "0",
    operation: "A" as typeof OPERATIONS[number],
  });

  const [dimensions, setDimensions] = useState<
    Array<{ id: number; name: string; min: string; max: string }>
  >([
    { id: 1, name: '', min: '', max: '' },
    { id: 2, name: '', min: '', max: '' },
    { id: 3, name: '', min: '', max: '' },
  ]);

  // Check if current selection has existing tolerances
  const existingTolerance = useMemo(() => {
    if (!formData.item_code || !formData.operation) return null;
    return tolerances.find(
      t => t.item_code === formData.item_code && 
           t.operation === formData.operation &&
           t.revision === formData.revision
    );
  }, [formData.item_code, formData.operation, formData.revision, tolerances]);

  // Filtered item codes based on search
  const filteredItemCodes = useMemo(() => {
    if (!itemSearch) return itemCodes;
    const search = itemSearch.toLowerCase();
    return itemCodes.filter(code => code.toLowerCase().includes(search));
  }, [itemCodes, itemSearch]);

  // Get tolerances for selected item
  const selectedItemTolerances = useMemo(() => {
    if (!formData.item_code) return [];
    return tolerances.filter(t => t.item_code === formData.item_code);
  }, [formData.item_code, tolerances]);
  
  useEffect(() => {
    loadTolerances();
    loadItemCodes();

    const channel = supabase
      .channel('tolerance-setup-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dimension_tolerances' }, () => {
        loadTolerances();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_orders' }, () => {
        loadItemCodes();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'item_master' }, () => {
        loadItemCodes();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Auto-load existing tolerance when item_code + operation + revision changes
  useEffect(() => {
    if (editingId) return; // Don't auto-load when manually editing
    
    if (existingTolerance && existingTolerance.id) {
      // Auto-populate the form with existing data
      const dimensionsArray = Object.entries(existingTolerance.dimensions).map(([id, dim]) => ({
        id: parseInt(id),
        name: dim.name,
        min: dim.min.toString(),
        max: dim.max.toString()
      }));
      
      if (dimensionsArray.length > 0) {
        setDimensions(dimensionsArray);
        setEditingId(existingTolerance.id);
      }
    }
  }, [existingTolerance, editingId]);

  const loadTolerances = async () => {
    try {
      const { data, error } = await supabase
        .from("dimension_tolerances")
        .select("*")
        .order("item_code", { ascending: true });

      if (error) throw error;
      setTolerances((data || []) as any);
    } catch (error: any) {
      toast.error("Failed to load tolerances: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const loadItemCodes = async () => {
    try {
      const [woResult, itemResult] = await Promise.all([
        supabase
          .from("work_orders")
          .select("item_code")
          .order("item_code", { ascending: true }),
        supabase
          .from("item_master")
          .select("item_code")
          .order("item_code", { ascending: true })
      ]);

      if (woResult.error) throw woResult.error;
      if (itemResult.error) throw itemResult.error;
      
      const woItems = woResult.data?.map(wo => wo.item_code) || [];
      const masterItems = itemResult.data?.map(item => item.item_code) || [];
      const allItems = [...woItems, ...masterItems];
      const unique = Array.from(new Set(allItems.filter(Boolean)));
      
      setItemCodes(unique);
    } catch (error: any) {
      toast.error("Failed to load item codes: " + error.message);
    }
  };

  const addMoreDimensions = () => {
    if (dimensions.length >= 100) {
      toast.error("Maximum 100 dimensions allowed");
      return;
    }
    const newId = Math.max(...dimensions.map(d => d.id), 0) + 1;
    setDimensions([...dimensions, { id: newId, name: '', min: '', max: '' }]);
  };

  const removeDimension = (id: number) => {
    if (dimensions.length <= 1) {
      toast.error("At least one dimension is required");
      return;
    }
    setDimensions(dimensions.filter(d => d.id !== id));
  };

  const handleSave = async () => {
    if (!formData.item_code || !formData.operation) {
      toast.error('Item Code and Operation are required');
      return;
    }

    const validDimensions = dimensions.filter(d => d.name && d.min && d.max);
    if (validDimensions.length === 0) {
      toast.error('At least one complete dimension (name, min, max) is required');
      return;
    }

    const dimensionsObj = validDimensions.reduce((acc, dim) => {
      acc[dim.id.toString()] = {
        name: dim.name,
        min: parseFloat(dim.min),
        max: parseFloat(dim.max)
      };
      return acc;
    }, {} as Record<string, { name: string; min: number; max: number }>);

    try {
      if (editingId) {
        const { error } = await supabase
          .from('dimension_tolerances')
          .update({
            item_code: formData.item_code,
            revision: formData.revision || '0',
            operation: formData.operation,
            dimensions: dimensionsObj,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingId);

        if (error) throw error;
      } else {
        // Use upsert to handle unique constraint on (item_code, operation)
        const { error } = await supabase
          .from('dimension_tolerances')
          .upsert({
            item_code: formData.item_code,
            revision: formData.revision || '0',
            operation: formData.operation,
            dimensions: dimensionsObj,
            created_by: (await supabase.auth.getUser()).data.user?.id,
            updated_at: new Date().toISOString()
          }, {
            onConflict: 'item_code,operation'
          });

        if (error) throw error;
      }

      await loadTolerances();
      toast.success(editingId ? 'Tolerance updated!' : 'Tolerance saved!');
      resetForm();
    } catch (error: any) {
      console.error('Error saving tolerance:', error);
      toast.error(error.message || 'Failed to save tolerance');
    }
  };

  const handleEdit = (tolerance: DimensionTolerance) => {
    setEditingId(tolerance.id || null);
    setFormData({
      item_code: tolerance.item_code,
      revision: tolerance.revision,
      operation: tolerance.operation as typeof OPERATIONS[number]
    });
    
    const dimensionsArray = Object.entries(tolerance.dimensions).map(([id, dim]) => ({
      id: parseInt(id),
      name: dim.name,
      min: dim.min.toString(),
      max: dim.max.toString()
    }));
    
    setDimensions(dimensionsArray);
    
    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this tolerance?')) return;
    
    try {
      const { error } = await supabase
        .from('dimension_tolerances')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      toast.success('Tolerance deleted');
      loadTolerances();
    } catch (error: any) {
      toast.error('Failed to delete: ' + error.message);
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setFormData({ item_code: '', revision: '0', operation: 'A' });
    setDimensions([
      { id: 1, name: '', min: '', max: '' },
      { id: 2, name: '', min: '', max: '' },
      { id: 3, name: '', min: '', max: '' },
    ]);
    setItemSearch("");
  };

  const handleItemSelect = (code: string) => {
    setFormData({ ...formData, item_code: code });
    setItemSearchOpen(false);
    setItemSearch("");
    
    // Reset editing state when selecting a new item
    setEditingId(null);
    setDimensions([
      { id: 1, name: '', min: '', max: '' },
      { id: 2, name: '', min: '', max: '' },
      { id: 3, name: '', min: '', max: '' },
    ]);
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
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto p-4 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Settings className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Tolerance Setup</h1>
            <p className="text-sm text-muted-foreground">Define dimensional tolerances for QC inspections</p>
          </div>
        </div>

        {/* Main Form Card */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">
                  {editingId ? "Edit Tolerance" : "Add / Edit Tolerance"}
                </CardTitle>
                <CardDescription>
                  {editingId 
                    ? "Modify the existing tolerance configuration"
                    : "Select an item code - existing tolerances will auto-load for editing"
                  }
                </CardDescription>
              </div>
              {editingId && (
                <Badge variant="secondary" className="gap-1">
                  <Edit className="h-3 w-3" />
                  Editing
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Item Selection Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Searchable Item Code Selector */}
              <div className="space-y-2">
                <Label>Item Code *</Label>
                <Popover open={itemSearchOpen} onOpenChange={setItemSearchOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={itemSearchOpen}
                      className="w-full justify-between font-normal"
                    >
                      {formData.item_code || "Search item codes..."}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[400px] p-0" align="start">
                    <Command shouldFilter={false}>
                      <CommandInput 
                        placeholder="Type to search item codes..." 
                        value={itemSearch}
                        onValueChange={setItemSearch}
                      />
                      <CommandList>
                        <CommandEmpty>
                          {itemSearch ? "No matching items found" : "Start typing to search..."}
                        </CommandEmpty>
                        <CommandGroup heading={`${filteredItemCodes.length} items`}>
                          {filteredItemCodes.slice(0, 50).map((code) => {
                            const hasTolerance = tolerances.some(t => t.item_code === code);
                            return (
                              <CommandItem
                                key={code}
                                value={code}
                                onSelect={() => handleItemSelect(code)}
                                className="flex items-center justify-between"
                              >
                                <div className="flex items-center gap-2">
                                  <Check
                                    className={cn(
                                      "h-4 w-4",
                                      formData.item_code === code ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                  <span>{code}</span>
                                </div>
                                {hasTolerance && (
                                  <Badge variant="outline" className="text-xs">
                                    Has tolerances
                                  </Badge>
                                )}
                              </CommandItem>
                            );
                          })}
                          {filteredItemCodes.length > 50 && (
                            <div className="py-2 px-3 text-xs text-muted-foreground text-center">
                              Showing first 50 results. Type more to narrow down.
                            </div>
                          )}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                <p className="text-xs text-muted-foreground">{itemCodes.length} items available</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="revision">Revision</Label>
                <Input
                  id="revision"
                  value={formData.revision}
                  onChange={(e) => setFormData({ ...formData, revision: e.target.value })}
                  placeholder="e.g., 0, A, 1.0"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="operation">Operation *</Label>
                <Select
                  value={formData.operation}
                  onValueChange={(value) => {
                    setFormData({ ...formData, operation: value as typeof OPERATIONS[number] });
                    // Reset editing when changing operation
                    if (!editingId) {
                      setDimensions([
                        { id: 1, name: '', min: '', max: '' },
                        { id: 2, name: '', min: '', max: '' },
                        { id: 3, name: '', min: '', max: '' },
                      ]);
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OPERATIONS.map((op) => {
                      const hasToleranceForOp = selectedItemTolerances.some(
                        t => t.operation === op && t.revision === formData.revision
                      );
                      return (
                        <SelectItem key={op} value={op}>
                          <div className="flex items-center gap-2">
                            <span>Operation {op}</span>
                            {hasToleranceForOp && (
                              <Badge variant="secondary" className="text-xs h-5">Defined</Badge>
                            )}
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Existing Tolerance Alert */}
            {existingTolerance && editingId && (
              <Alert className="border-blue-200 bg-blue-50 dark:bg-blue-900/20">
                <Info className="h-4 w-4 text-blue-600" />
                <AlertDescription className="text-blue-800 dark:text-blue-300">
                  Editing existing tolerance for <strong>{formData.item_code}</strong> - Operation {formData.operation} (Rev {formData.revision}).
                  Modify the dimensions below and save to update.
                </AlertDescription>
              </Alert>
            )}

            {/* Dimensions Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-base font-medium">Dimensions & Tolerances</Label>
                  <p className="text-xs text-muted-foreground">Define min/max limits for each dimension</p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={addMoreDimensions}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add Row
                </Button>
              </div>
              
              <div className="border rounded-lg overflow-hidden">
                <div className="grid grid-cols-[2fr,1fr,1fr,auto] gap-2 p-3 bg-muted/50 text-sm font-medium">
                  <div>Dimension Name</div>
                  <div>Min</div>
                  <div>Max</div>
                  <div className="w-10"></div>
                </div>
                
                <div className="divide-y">
                  {dimensions.map((dim, index) => (
                    <div key={dim.id} className="grid grid-cols-[2fr,1fr,1fr,auto] gap-2 p-2">
                      <Input
                        type="text"
                        placeholder="e.g. ID, OD, Thread Pitch"
                        value={dim.name}
                        onChange={(e) => {
                          const newDimensions = [...dimensions];
                          newDimensions[index].name = e.target.value;
                          setDimensions(newDimensions);
                        }}
                      />
                      <Input
                        type="number"
                        step="0.001"
                        placeholder="Min"
                        value={dim.min}
                        onChange={(e) => {
                          const newDimensions = [...dimensions];
                          newDimensions[index].min = e.target.value;
                          setDimensions(newDimensions);
                        }}
                      />
                      <Input
                        type="number"
                        step="0.001"
                        placeholder="Max"
                        value={dim.max}
                        onChange={(e) => {
                          const newDimensions = [...dimensions];
                          newDimensions[index].max = e.target.value;
                          setDimensions(newDimensions);
                        }}
                      />
                      <div className="w-10 flex items-center justify-center">
                        {dimensions.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeDimension(dim.id)}
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2 pt-2">
              <Button onClick={handleSave} className="gap-2">
                <Check className="h-4 w-4" />
                {editingId ? "Update Tolerance" : "Save Tolerance"}
              </Button>
              {(editingId || formData.item_code) && (
                <Button variant="outline" onClick={resetForm}>
                  Cancel
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Existing Tolerances List */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Existing Tolerances
            </CardTitle>
            <CardDescription>
              {tolerances.length} tolerance configurations defined
            </CardDescription>
          </CardHeader>
          <CardContent>
            {tolerances.length === 0 ? (
              <div className="text-center py-12">
                <Settings className="h-12 w-12 mx-auto mb-4 text-muted-foreground/30" />
                <p className="font-medium mb-1">No tolerances defined yet</p>
                <p className="text-sm text-muted-foreground">
                  Select an item code above to add dimensional tolerances
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {Array.from(new Set(tolerances.map(t => t.item_code))).map(itemCode => {
                  const itemTolerances = tolerances.filter(t => t.item_code === itemCode);
                  return (
                    <div key={itemCode} className="border rounded-lg overflow-hidden">
                      <div className="bg-muted/50 px-4 py-2 flex items-center justify-between">
                        <span className="font-semibold text-primary">{itemCode}</span>
                        <Badge variant="outline">{itemTolerances.length} operation(s)</Badge>
                      </div>
                      
                      <div className="divide-y">
                        {['A', 'B', 'C', 'D'].map(op => {
                          const opTolerances = itemTolerances.filter(t => t.operation === op);
                          if (opTolerances.length === 0) return null;
                          
                          return opTolerances.map(tolerance => (
                            <div key={tolerance.id} className="p-4">
                              <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-3">
                                  <Badge>Op {op}</Badge>
                                  <span className="text-sm text-muted-foreground">
                                    Rev: {tolerance.revision}
                                  </span>
                                </div>
                                <div className="flex gap-2">
                                  <Button 
                                    variant="outline" 
                                    size="sm" 
                                    onClick={() => handleEdit(tolerance)}
                                    className="gap-1"
                                  >
                                    <Edit className="h-3 w-3" />
                                    Edit
                                  </Button>
                                  <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    onClick={() => handleDelete(tolerance.id!)}
                                    className="text-destructive hover:text-destructive"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </div>
                              </div>
                              
                              <div className="bg-muted/30 rounded-lg overflow-hidden">
                                <div className="grid grid-cols-3 gap-2 p-2 text-xs font-medium text-muted-foreground">
                                  <div>Dimension</div>
                                  <div>Min</div>
                                  <div>Max</div>
                                </div>
                                <div className="divide-y divide-border/50">
                                  {Object.entries(tolerance.dimensions).map(([id, dim]) => (
                                    <div key={id} className="grid grid-cols-3 gap-2 p-2 text-sm">
                                      <div className="font-medium">{dim.name}</div>
                                      <div>{dim.min}</div>
                                      <div>{dim.max}</div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          ));
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ToleranceSetup;
