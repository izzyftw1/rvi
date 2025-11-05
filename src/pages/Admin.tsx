import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { NavigationHeader } from "@/components/NavigationHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { UserPlus, Edit, Trash2, Shield, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { useUserRole } from "@/hooks/useUserRole";

interface UserWithRole {
  id: string;
  full_name: string;
  department_id: string | null;
  is_active: boolean;
  last_login: string | null;
  created_at: string;
  departments?: { name: string };
  primaryRole?: string;
}

export default function Admin() {
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [userRoles, setUserRoles] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [creatingUser, setCreatingUser] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<string | null>(null);
  const [newUser, setNewUser] = useState({
    email: "",
    full_name: "",
    password: "",
    department_id: "",
    role: "",
    is_active: true,
  });
  const { toast } = useToast();
  const { isSuperAdmin, hasAnyRole } = useUserRole();

  const roles = [
    { value: "super_admin", label: "Super Admin" },
    { value: "admin", label: "Admin" },
    { value: "finance_admin", label: "Finance Admin" },
    { value: "finance_user", label: "Finance User" },
    { value: "ops_manager", label: "Operations Manager" },
    { value: "production", label: "Production" },
    { value: "quality", label: "Quality (QC)" },
    { value: "stores", label: "Stores" },
    { value: "packing", label: "Packing" },
    { value: "sales", label: "Sales" },
    { value: "purchase", label: "Purchase" },
    { value: "logistics", label: "Logistics" },
    { value: "accounts", label: "Accounts" },
  ];

  useEffect(() => {
    loadData();
    
    // Set up real-time subscriptions
    const profilesChannel = supabase
      .channel('admin-profiles-changes')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'profiles' 
      }, () => {
        loadData();
      })
      .subscribe();

    const rolesChannel = supabase
      .channel('admin-roles-changes')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'user_roles' 
      }, () => {
        loadUserRoles();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(profilesChannel);
      supabase.removeChannel(rolesChannel);
    };
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Load departments
      const { data: deptData } = await supabase
        .from("departments")
        .select("*")
        .order("name");
      setDepartments(deptData || []);

      // Load users with departments
      const { data: profilesData, error: profilesError } = await supabase
        .from("profiles")
        .select("id, full_name, department_id, is_active, last_login, created_at, departments(name)")
        .order("full_name");

      if (profilesError) throw profilesError;
      setUsers((profilesData || []) as UserWithRole[]);

      // Load user roles
      await loadUserRoles();

    } catch (error: any) {
      console.error("Error loading data:", error);
      toast({ 
        title: "Error", 
        description: error.message || "Failed to load data", 
        variant: "destructive" 
      });
    } finally {
      setLoading(false);
    }
  };

  const loadUserRoles = async () => {
    const { data: rolesData } = await supabase
      .from("user_roles")
      .select("user_id, role");
    
    const rolesByUser: Record<string, string> = {};
    rolesData?.forEach((role) => {
      // Store first/primary role for each user
      if (!rolesByUser[role.user_id]) {
        rolesByUser[role.user_id] = role.role;
      }
    });
    setUserRoles(rolesByUser);
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate required fields
    if (!newUser.email || !newUser.full_name || !newUser.role) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields (Name, Email, Role)",
        variant: "destructive",
      });
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newUser.email)) {
      toast({
        title: "Validation Error",
        description: "Please enter a valid email address",
        variant: "destructive",
      });
      return;
    }

    setCreatingUser(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No active session');
      }

      // Call edge function to create user
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/create-user`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            email: newUser.email,
            full_name: newUser.full_name,
            password: newUser.password || undefined,
            role: newUser.role,
            department_id: newUser.department_id && newUser.department_id !== 'none' 
              ? newUser.department_id 
              : null,
            is_active: newUser.is_active,
          }),
        }
      );

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to create user');
      }

      toast({
        title: "Success",
        description: result.temporary_password 
          ? `User created successfully. Temporary password: ${result.temporary_password}` 
          : "User created successfully",
      });

      // Reset form and close dialog
      setNewUser({
        email: "",
        full_name: "",
        password: "",
        department_id: "",
        role: "",
        is_active: true,
      });
      setCreateDialogOpen(false);
      
      // Reload data
      loadData();

    } catch (error: any) {
      console.error('Error creating user:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to create user",
        variant: "destructive",
      });
    } finally {
      setCreatingUser(false);
    }
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    try {
      // Remove all existing roles for user
      const { error: deleteError } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", userId);

      if (deleteError) throw deleteError;
      
      // Add new role
      const { error: insertError } = await supabase
        .from("user_roles")
        .insert([{ user_id: userId, role: newRole as any }]);

      if (insertError) throw insertError;

      toast({ title: "Success", description: "User role updated successfully" });
      loadUserRoles();
    } catch (error: any) {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to update role", 
        variant: "destructive" 
      });
    }
  };

  const handleDepartmentChange = async (userId: string, departmentId: string) => {
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ department_id: departmentId === "none" ? null : departmentId })
        .eq("id", userId);

      if (error) throw error;

      toast({ title: "Success", description: "Department updated successfully" });
    } catch (error: any) {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to update department", 
        variant: "destructive" 
      });
    }
  };

  const handleToggleStatus = async (userId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ is_active: !currentStatus })
        .eq("id", userId);

      if (error) throw error;

      toast({ 
        title: "Success", 
        description: `User ${!currentStatus ? 'activated' : 'deactivated'} successfully` 
      });
      loadData();
    } catch (error: any) {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to update status", 
        variant: "destructive" 
      });
    }
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;

    try {
      // Delete user roles first
      await supabase.from("user_roles").delete().eq("user_id", userToDelete);
      
      // Note: Deleting from auth.users requires Admin API
      toast({
        title: "Info",
        description: "User deletion requires Supabase Admin API. Please contact system administrator.",
      });
      
      setDeleteDialogOpen(false);
      setUserToDelete(null);
    } catch (error: any) {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to delete user", 
        variant: "destructive" 
      });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <NavigationHeader />
        <div className="container mx-auto p-6 flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <NavigationHeader />
      
      <main className="container mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Shield className="h-8 w-8 text-primary" />
              Admin Panel – User Management
            </h1>
            <p className="text-muted-foreground">
              Manage users, roles, and permissions
            </p>
          </div>
          
          <Button onClick={() => setCreateDialogOpen(true)}>
            <UserPlus className="h-4 w-4 mr-2" />
            Create User
          </Button>
        </div>

        {/* Users Table */}
        <Card>
          <CardHeader>
            <CardTitle>Users ({users.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>User ID</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last Active</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        No users found
                      </TableCell>
                    </TableRow>
                  ) : (
                    users.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell className="font-medium">
                          {user.full_name || "—"}
                        </TableCell>
                        
                        <TableCell className="text-sm text-muted-foreground">
                          {user.id?.substring(0, 8) || "—"}...
                        </TableCell>
                        
                        <TableCell>
                          <Select
                            value={userRoles[user.id] || "unassigned"}
                            onValueChange={(value) => handleRoleChange(user.id, value)}
                          >
                            <SelectTrigger className="w-[200px]">
                              <SelectValue placeholder="Select role" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="unassigned">Unassigned</SelectItem>
                              {roles.map((role) => (
                                <SelectItem 
                                  key={role.value} 
                                  value={role.value || 'unassigned'}
                                >
                                  {role.label || 'Unknown'}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        
                        <TableCell>
                          <Select
                            value={user.department_id || "none"}
                            onValueChange={(value) => handleDepartmentChange(user.id, value)}
                          >
                            <SelectTrigger className="w-[180px]">
                              <SelectValue placeholder="Select department" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">No Department</SelectItem>
                              {departments.map((dept) => (
                                <SelectItem 
                                  key={dept.id} 
                                  value={dept.id || 'none'}
                                >
                                  {dept.name || 'Unnamed'}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={user.is_active ?? true}
                              onCheckedChange={() => handleToggleStatus(user.id, user.is_active ?? true)}
                            />
                            {user.is_active ? (
                              <Badge variant="default" className="gap-1">
                                <CheckCircle2 className="h-3 w-3" />
                                Active
                              </Badge>
                            ) : (
                              <Badge variant="destructive" className="gap-1">
                                <XCircle className="h-3 w-3" />
                                Inactive
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        
                        <TableCell className="text-sm text-muted-foreground">
                          {user.last_login 
                            ? format(new Date(user.last_login), "PP") 
                            : "Never"}
                        </TableCell>
                        
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                // Edit functionality would go here
                                toast({ title: "Info", description: "Edit user details feature coming soon" });
                              }}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setUserToDelete(user.id);
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

        {/* Create User Dialog */}
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Create New User</DialogTitle>
              <DialogDescription>
                Add a new user to the system with initial role and department
              </DialogDescription>
            </DialogHeader>
            
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">
                  Full Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="name"
                  value={newUser.full_name}
                  onChange={(e) => setNewUser({ ...newUser, full_name: e.target.value })}
                  placeholder="John Doe"
                  required
                  disabled={creatingUser}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">
                  Email <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  placeholder="john@example.com"
                  required
                  disabled={creatingUser}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">
                  Password (Optional)
                </Label>
                <Input
                  id="password"
                  type="password"
                  value={newUser.password}
                  onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                  placeholder="Leave blank for auto-generated"
                  disabled={creatingUser}
                />
                <p className="text-xs text-muted-foreground">
                  If left blank, a temporary password will be generated
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="role">
                  Role <span className="text-destructive">*</span>
                </Label>
                <Select 
                  value={newUser.role || (roles.length > 0 ? roles[0].value : "unassigned")} 
                  onValueChange={(value) => setNewUser({ ...newUser, role: value })}
                  required
                  disabled={creatingUser}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {roles.map((role) => (
                      <SelectItem 
                        key={role.value} 
                        value={role.value || 'unassigned'}
                      >
                        {role.label || 'Unknown'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="department">Department</Label>
                <Select 
                  value={newUser.department_id || "none"} 
                  onValueChange={(value) => setNewUser({ ...newUser, department_id: value })}
                  disabled={creatingUser}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select department" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Department</SelectItem>
                    {departments.map((dept) => (
                      <SelectItem 
                        key={dept.id} 
                        value={dept.id || 'none'}
                      >
                        {dept.name || 'Unnamed'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="active"
                  checked={newUser.is_active}
                  onCheckedChange={(checked) => setNewUser({ ...newUser, is_active: checked })}
                  disabled={creatingUser}
                />
                <Label htmlFor="active" className="cursor-pointer">
                  Account Active
                </Label>
              </div>

              <DialogFooter>
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setCreateDialogOpen(false)}
                  disabled={creatingUser}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={creatingUser}>
                  {creatingUser ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    'Create User'
                  )}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete User</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete this user? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button 
                variant="outline" 
                onClick={() => {
                  setDeleteDialogOpen(false);
                  setUserToDelete(null);
                }}
              >
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDeleteUser}>
                Delete User
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
