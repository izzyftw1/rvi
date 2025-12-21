import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useUserRole } from "@/hooks/useUserRole";
import { Plus, Trash2, GripVertical, Edit2, Loader2 } from "lucide-react";
import type { OperationType } from "@/hooks/useExecutionRecord";

interface OperationRoute {
  id: string;
  work_order_id: string;
  sequence_number: number;
  operation_type: OperationType;
  process_name: string | null;
  is_external: boolean;
  is_mandatory: boolean;
  created_at: string;
}

interface OperationRouteManagerProps {
  workOrderId: string;
  onUpdate?: () => void;
}

const OPERATION_TYPES: { value: OperationType; label: string }[] = [
  { value: 'RAW_MATERIAL', label: 'Raw Material' },
  { value: 'CNC', label: 'CNC / Machining' },
  { value: 'QC', label: 'Quality Check' },
  { value: 'EXTERNAL_PROCESS', label: 'External Process' },
  { value: 'PACKING', label: 'Packing' },
  { value: 'DISPATCH', label: 'Dispatch' },
];

const EXTERNAL_PROCESSES = [
  'Plating', 'Buffing', 'Blasting', 'Forging', 'Heat Treatment', 'Job Work'
];

export function OperationRouteManager({ workOrderId, onUpdate }: OperationRouteManagerProps) {
  const { toast } = useToast();
  const { hasAnyRole } = useUserRole();
  const canManage = hasAnyRole(['admin', 'production']);
  
  const [routes, setRoutes] = useState<OperationRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRoute, setEditingRoute] = useState<OperationRoute | null>(null);
  const [saving, setSaving] = useState(false);
  
  // Form state
  const [operationType, setOperationType] = useState<OperationType>('RAW_MATERIAL');
  const [processName, setProcessName] = useState<string>('');
  const [isExternal, setIsExternal] = useState(false);
  const [isMandatory, setIsMandatory] = useState(true);

  useEffect(() => {
    loadRoutes();
  }, [workOrderId]);

  const loadRoutes = async () => {
    try {
      const { data, error } = await supabase
        .from("operation_routes")
        .select("*")
        .eq("work_order_id", workOrderId)
        .order("sequence_number");

      if (error) throw error;
      setRoutes((data || []) as OperationRoute[]);
    } catch (error: any) {
      console.error("Error loading routes:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddRoute = () => {
    setEditingRoute(null);
    setOperationType('RAW_MATERIAL');
    setProcessName('');
    setIsExternal(false);
    setIsMandatory(true);
    setDialogOpen(true);
  };

  const handleEditRoute = (route: OperationRoute) => {
    setEditingRoute(route);
    setOperationType(route.operation_type);
    setProcessName(route.process_name || '');
    setIsExternal(route.is_external);
    setIsMandatory(route.is_mandatory);
    setDialogOpen(true);
  };

  const handleSaveRoute = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (editingRoute) {
        // Update existing route
        const { error } = await supabase
          .from("operation_routes")
          .update({
            operation_type: operationType,
            process_name: processName || null,
            is_external: isExternal,
            is_mandatory: isMandatory,
          })
          .eq("id", editingRoute.id);

        if (error) throw error;
        toast({ title: "Route step updated" });
      } else {
        // Create new route with next sequence number
        const nextSeq = routes.length > 0 
          ? Math.max(...routes.map(r => r.sequence_number)) + 1 
          : 1;

        const { error } = await supabase
          .from("operation_routes")
          .insert({
            work_order_id: workOrderId,
            sequence_number: nextSeq,
            operation_type: operationType,
            process_name: processName || null,
            is_external: isExternal,
            is_mandatory: isMandatory,
            created_by: user?.id,
          });

        if (error) throw error;
        toast({ title: "Route step added" });
      }

      setDialogOpen(false);
      loadRoutes();
      onUpdate?.();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRoute = async (routeId: string) => {
    try {
      const { error } = await supabase
        .from("operation_routes")
        .delete()
        .eq("id", routeId);

      if (error) throw error;
      
      toast({ title: "Route step deleted" });
      loadRoutes();
      onUpdate?.();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleMoveRoute = async (routeId: string, direction: 'up' | 'down') => {
    const index = routes.findIndex(r => r.id === routeId);
    if (index === -1) return;
    
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= routes.length) return;

    try {
      const currentRoute = routes[index];
      const targetRoute = routes[targetIndex];

      // Swap sequence numbers
      await supabase
        .from("operation_routes")
        .update({ sequence_number: targetRoute.sequence_number })
        .eq("id", currentRoute.id);

      await supabase
        .from("operation_routes")
        .update({ sequence_number: currentRoute.sequence_number })
        .eq("id", targetRoute.id);

      loadRoutes();
      onUpdate?.();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-6 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div>
            <CardTitle className="text-base">Operation Route</CardTitle>
            <CardDescription>Define the expected sequence of operations</CardDescription>
          </div>
          {canManage && (
            <Button size="sm" onClick={handleAddRoute}>
              <Plus className="h-4 w-4 mr-1" />
              Add Step
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {routes.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No operation route defined. {canManage && "Click 'Add Step' to create one."}
            </p>
          ) : (
            <div className="space-y-2">
              {routes.map((route, index) => (
                <div
                  key={route.id}
                  className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                >
                  <div className="flex flex-col gap-1">
                    {canManage && index > 0 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5"
                        onClick={() => handleMoveRoute(route.id, 'up')}
                      >
                        <GripVertical className="h-3 w-3 rotate-90" />
                      </Button>
                    )}
                    {canManage && index < routes.length - 1 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5"
                        onClick={() => handleMoveRoute(route.id, 'down')}
                      >
                        <GripVertical className="h-3 w-3 rotate-90" />
                      </Button>
                    )}
                  </div>
                  
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-semibold text-sm">
                    {route.sequence_number}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        {OPERATION_TYPES.find(t => t.value === route.operation_type)?.label || route.operation_type}
                      </span>
                      {route.process_name && (
                        <span className="text-muted-foreground">({route.process_name})</span>
                      )}
                      {route.is_external && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                          External
                        </span>
                      )}
                      {!route.is_mandatory && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                          Optional
                        </span>
                      )}
                    </div>
                  </div>
                  
                  {canManage && (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleEditRoute(route)}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => handleDeleteRoute(route.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingRoute ? 'Edit Route Step' : 'Add Route Step'}</DialogTitle>
            <DialogDescription>
              Define an operation step in the work order route
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Operation Type</Label>
              <Select value={operationType} onValueChange={(v) => setOperationType(v as OperationType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OPERATION_TYPES.map(type => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Process Name (optional)</Label>
              {operationType === 'EXTERNAL_PROCESS' ? (
                <Select value={processName} onValueChange={setProcessName}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select process" />
                  </SelectTrigger>
                  <SelectContent>
                    {EXTERNAL_PROCESSES.map(proc => (
                      <SelectItem key={proc} value={proc}>
                        {proc}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  value={processName}
                  onChange={(e) => setProcessName(e.target.value)}
                  placeholder="e.g., Operation A, Final QC"
                />
              )}
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="is_external">External Operation</Label>
              <Switch
                id="is_external"
                checked={isExternal}
                onCheckedChange={setIsExternal}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="is_mandatory">Mandatory Step</Label>
              <Switch
                id="is_mandatory"
                checked={isMandatory}
                onCheckedChange={setIsMandatory}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveRoute} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingRoute ? 'Update' : 'Add Step'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
