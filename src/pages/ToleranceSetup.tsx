import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Settings } from "lucide-react";
import { toast } from "sonner";

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
  
  useEffect(() => {
    loadTolerances();
    loadItemCodes();

    // Set up realtime subscriptions
    const channel = supabase
      .channel('tolerance-setup-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dimension_tolerances' }, () => {
        console.log('Dimension tolerances updated - refreshing');
        loadTolerances();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_orders' }, () => {
        console.log('Work orders updated - refreshing item codes');
        loadItemCodes();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'item_master' }, () => {
        console.log('Item master updated - refreshing item codes');
        loadItemCodes();
      })
      .subscribe((status) => {
        console.log('Tolerance Setup realtime subscription status:', status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

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
      // Load from both work_orders and item_master
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
      
      // Combine and deduplicate item codes from both sources
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
    const newId = Math.max(...dimensions.map(d => d.id)) + 1;
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
        const { error } = await supabase
          .from('dimension_tolerances')
          .insert({
            item_code: formData.item_code,
            revision: formData.revision || '0',
            operation: formData.operation,
            dimensions: dimensionsObj,
            created_by: (await supabase.auth.getUser()).data.user?.id
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
  };

  const resetForm = () => {
    setEditingId(null);
    setFormData({ item_code: '', revision: '0', operation: 'A' });
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
                  placeholder="e.g., 0"
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
                <Label>Dimensions & Tolerances</Label>
                <Button type="button" variant="outline" size="sm" onClick={addMoreDimensions}>
                  + Add Row
                </Button>
              </div>
              
              <div className="space-y-2">
                <div className="grid grid-cols-[2fr,1fr,1fr,auto] gap-2 text-sm font-medium text-muted-foreground">
                  <div>Dimension Name</div>
                  <div>Min</div>
                  <div>Max</div>
                  <div></div>
                </div>
                
                {dimensions.map((dim, index) => (
                  <div key={dim.id} className="grid grid-cols-[2fr,1fr,1fr,auto] gap-2">
                    <Input
                      type="text"
                      placeholder="e.g. ID, OD, Thread Pitch, Overall Length"
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
                    {dimensions.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeDimension(dim.id)}
                        className="h-10 w-10 p-0"
                      >
                        ×
                      </Button>
                    )}
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
              <h3 className="text-lg font-semibold">Existing Tolerances</h3>
              
              {Array.from(new Set(tolerances.map(t => t.item_code))).map(itemCode => {
                const itemTolerances = tolerances.filter(t => t.item_code === itemCode);
                return (
                  <div key={itemCode} className="space-y-2">
                    <h4 className="font-medium text-primary">{itemCode}</h4>
                    
                    {['A', 'B', 'C', 'D'].map(op => {
                      const opTolerances = itemTolerances.filter(t => t.operation === op);
                      if (opTolerances.length === 0) return null;
                      
                      return (
                        <div key={op} className="ml-4">
                          <p className="text-sm font-medium text-muted-foreground mb-2">Operation {op}</p>
                          {opTolerances.map(tolerance => (
                            <Card key={tolerance.id} className="p-4 mb-2">
                              <div className="flex items-center justify-between mb-4">
                                <p className="text-sm text-muted-foreground">
                                  Revision: {tolerance.revision}
                                </p>
                                <Button variant="outline" size="sm" onClick={() => handleEdit(tolerance)}>
                                  Edit
                                </Button>
                              </div>
                              
                              <div className="grid grid-cols-3 gap-2 text-sm">
                                <div className="font-medium">Dimension Name</div>
                                <div className="font-medium">Min</div>
                                <div className="font-medium">Max</div>
                                
                                {Object.entries(tolerance.dimensions).map(([id, dim]) => (
                                  <React.Fragment key={id}>
                                    <div>{dim.name || `Dimension ${id}`}</div>
                                    <div>{dim.min}</div>
                                    <div>{dim.max}</div>
                                  </React.Fragment>
                                ))}
                              </div>
                            </Card>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
              
              {tolerances.length === 0 && (
                <div className="text-center py-8">
                  <Settings className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
                  <p className="text-sm font-medium mb-1">No tolerances defined yet</p>
                  <p className="text-sm text-muted-foreground mb-1">
                    <span className="font-medium">Why:</span> Dimensional tolerances must be set up for QC checks.
                  </p>
                  <p className="text-sm text-muted-foreground">
                    <span className="font-medium">How to populate:</span> Enter an item code above and add dimensions with min/max tolerances.
                  </p>
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
