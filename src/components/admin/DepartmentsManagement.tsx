import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Plus, Edit, Trash2, Building2, AlertTriangle } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorBoundary } from "./ErrorBoundary";

interface Department {
  id: string;
  name: string;
  type: string;
  description: string | null;
  created_at: string;
  site_id: string | null;
}

export function DepartmentsManagement() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingDept, setEditingDept] = useState<Department | null>(null);
  const [deptToDelete, setDeptToDelete] = useState<Department | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
  });
  const { toast } = useToast();

  useEffect(() => {
    loadDepartments();

    // Real-time subscription
    const channel = supabase
      .channel('departments-changes')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'departments' 
      }, () => {
        loadDepartments();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadDepartments = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("departments")
        .select("*")
        .order("name");

      if (error) throw error;
      setDepartments(data || []);
    } catch (error: any) {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to load departments", 
        variant: "destructive" 
      });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (dept?: Department) => {
    if (dept) {
      setEditingDept(dept);
      setFormData({
        name: dept.name,
        description: dept.description || "",
      });
    } else {
      setEditingDept(null);
      setFormData({ name: "", description: "" });
    }
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast({
        title: "Validation Error",
        description: "Department name is required",
        variant: "destructive",
      });
      return;
    }

    try {
      if (editingDept) {
        // Update existing department - only update name and description
        const { error } = await supabase
          .from("departments")
          .update({
            name: formData.name.trim(),
            description: formData.description.trim() || null,
          })
          .eq("id", editingDept.id);

        if (error) throw error;
        toast({ title: "Success", description: "Department updated successfully" });
      } else {
        // Create new department - use default 'production' type
        const { error } = await supabase
          .from("departments")
          .insert([{
            name: formData.name.trim(),
            type: 'production',
            description: formData.description.trim() || null,
          }]);

        if (error) throw error;
        toast({ title: "Success", description: "Department created successfully" });
      }

      setDialogOpen(false);
      setFormData({ name: "", description: "" });
      loadDepartments();
    } catch (error: any) {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to save department", 
        variant: "destructive" 
      });
    }
  };

  const handleDelete = async () => {
    if (!deptToDelete) return;

    try {
      const { error } = await supabase
        .from("departments")
        .delete()
        .eq("id", deptToDelete.id);

      if (error) throw error;

      toast({ title: "Success", description: "Department deleted successfully" });
      setDeleteDialogOpen(false);
      setDeptToDelete(null);
      loadDepartments();
    } catch (error: any) {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to delete department", 
        variant: "destructive" 
      });
    }
  };

  const LoadingSkeleton = () => (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );

  return (
    <ErrorBoundary>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Departments ({departments.length})
          </CardTitle>
          <Button onClick={() => handleOpenDialog()}>
            <Plus className="h-4 w-4 mr-2" />
            Add Department
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <LoadingSkeleton />
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Department Name</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Created At</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {departments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                      No departments found
                    </TableCell>
                  </TableRow>
                ) : (
                  departments.map((dept) => (
                    <TableRow key={dept.id}>
                      <TableCell className="font-medium">{dept.name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {dept.description || "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(dept.created_at), "PP")}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenDialog(dept)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setDeptToDelete(dept);
                              setDeleteDialogOpen(true);
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingDept ? "Edit Department" : "Add New Department"}</DialogTitle>
            <DialogDescription>
              {editingDept ? "Update department details" : "Create a new department"}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Department Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., CNC, QC, Cutting"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Describe the department's function"
                rows={3}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">
                {editingDept ? "Update" : "Create"} Department
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Confirm Department Deletion
            </DialogTitle>
            <DialogDescription className="space-y-2">
              <p>Are you sure you want to delete the department <strong>"{deptToDelete?.name}"</strong>?</p>
              <p className="font-medium text-foreground">This action cannot be undone.</p>
              <p className="text-sm">Users assigned to this department will be unassigned.</p>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Yes, Delete Department
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ErrorBoundary>
  );
}
