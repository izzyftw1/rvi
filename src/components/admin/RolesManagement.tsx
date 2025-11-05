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
import { Plus, Edit, Trash2, Shield } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";

interface Role {
  id: string;
  role_name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export function RolesManagement() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [roleToDelete, setRoleToDelete] = useState<Role | null>(null);
  const [formData, setFormData] = useState({
    role_name: "",
    description: "",
  });
  const { toast } = useToast();

  useEffect(() => {
    loadRoles();

    // Real-time subscription
    const channel = supabase
      .channel('roles-changes')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'roles' 
      }, () => {
        loadRoles();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadRoles = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("roles")
        .select("*")
        .order("role_name");

      if (error) throw error;
      setRoles(data || []);
    } catch (error: any) {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to load roles", 
        variant: "destructive" 
      });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (role?: Role) => {
    if (role) {
      setEditingRole(role);
      setFormData({
        role_name: role.role_name,
        description: role.description || "",
      });
    } else {
      setEditingRole(null);
      setFormData({ role_name: "", description: "" });
    }
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.role_name.trim()) {
      toast({
        title: "Validation Error",
        description: "Role name is required",
        variant: "destructive",
      });
      return;
    }

    try {
      if (editingRole) {
        // Update existing role
        const { error } = await supabase
          .from("roles")
          .update({
            role_name: formData.role_name.trim(),
            description: formData.description.trim() || null,
          })
          .eq("id", editingRole.id);

        if (error) throw error;
        toast({ title: "Success", description: "Role updated successfully" });
      } else {
        // Create new role
        const { error } = await supabase
          .from("roles")
          .insert([{
            role_name: formData.role_name.trim(),
            description: formData.description.trim() || null,
          }]);

        if (error) {
          if (error.code === '23505') {
            toast({
              title: "Duplicate Role",
              description: "A role with this name already exists",
              variant: "destructive",
            });
            return;
          }
          throw error;
        }
        toast({ title: "Success", description: "Role created successfully" });
      }

      setDialogOpen(false);
      setFormData({ role_name: "", description: "" });
      loadRoles();
    } catch (error: any) {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to save role", 
        variant: "destructive" 
      });
    }
  };

  const handleDelete = async () => {
    if (!roleToDelete) return;

    try {
      const { error } = await supabase
        .from("roles")
        .delete()
        .eq("id", roleToDelete.id);

      if (error) throw error;

      toast({ title: "Success", description: "Role deleted successfully" });
      setDeleteDialogOpen(false);
      setRoleToDelete(null);
      loadRoles();
    } catch (error: any) {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to delete role", 
        variant: "destructive" 
      });
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Roles ({roles.length})
          </CardTitle>
          <Button onClick={() => handleOpenDialog()}>
            <Plus className="h-4 w-4 mr-2" />
            Add Role
          </Button>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Role Name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Created At</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : roles.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                      No roles found
                    </TableCell>
                  </TableRow>
                ) : (
                  roles.map((role) => (
                    <TableRow key={role.id}>
                      <TableCell className="font-medium">{role.role_name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {role.description || "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(role.created_at), "PP")}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenDialog(role)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setRoleToDelete(role);
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
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingRole ? "Edit Role" : "Add New Role"}</DialogTitle>
            <DialogDescription>
              {editingRole ? "Update role details" : "Create a new role for user assignment"}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="role_name">Role Name *</Label>
              <Input
                id="role_name"
                value={formData.role_name}
                onChange={(e) => setFormData({ ...formData, role_name: e.target.value })}
                placeholder="e.g., admin, production, quality"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Describe the role's responsibilities"
                rows={3}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">
                {editingRole ? "Update" : "Create"} Role
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Role</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the role "{roleToDelete?.role_name}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
