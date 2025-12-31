import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { UserPlus, Edit, Trash2, CheckCircle2, XCircle, Loader2, Search, Filter, AlertTriangle, X } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorBoundary } from "./ErrorBoundary";
import { UserPermissionOverrides } from "./UserPermissionOverrides";

interface UserWithRole {
  id: string;
  full_name: string;
  department_id: string | null;
  is_active: boolean;
  last_login: string | null;
  created_at: string;
  departments?: { name: string; type?: string };
  primaryRole?: string;
}

interface UsersManagementProps {
  roles: any[];
  departments: any[];
}

// Admin/Finance roles that bypass permission checks
const BYPASS_ROLES = ['admin', 'super_admin', 'finance_admin', 'accounts'];

export function UsersManagement({ roles, departments }: UsersManagementProps) {
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [userRoles, setUserRoles] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [creatingUser, setCreatingUser] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<string | null>(null);
  const [editSheetOpen, setEditSheetOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserWithRole | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [departmentFilter, setDepartmentFilter] = useState<string>("all");
  const [newUser, setNewUser] = useState({
    email: "",
    full_name: "",
    password: "",
    department_id: "",
    role: "",
    is_active: true,
  });
  const { toast } = useToast();

  useEffect(() => {
    loadUsers();
    
    // Set up real-time subscriptions
    const profilesChannel = supabase
      .channel('admin-profiles-changes')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'profiles' 
      }, () => {
        loadUsers();
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

  const loadUsers = async () => {
    try {
      setLoading(true);

      // Load users with departments (including type for permission checks)
      const { data: profilesData, error: profilesError } = await supabase
        .from("profiles")
        .select("id, full_name, department_id, is_active, last_login, created_at, departments(name, type)")
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
      if (!rolesByUser[role.user_id]) {
        rolesByUser[role.user_id] = role.role;
      }
    });
    setUserRoles(rolesByUser);
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newUser.email || !newUser.full_name || !newUser.role) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields (Name, Email, Role)",
        variant: "destructive",
      });
      return;
    }

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

      setNewUser({
        email: "",
        full_name: "",
        password: "",
        department_id: "",
        role: "",
        is_active: true,
      });
      setCreateDialogOpen(false);
      loadUsers();

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
      const { error: deleteError } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", userId);

      if (deleteError) throw deleteError;
      
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
      loadUsers();
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
      await supabase.from("user_roles").delete().eq("user_id", userToDelete);
      
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

  // Filter and search users
  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      // Search filter
      const searchLower = searchQuery.toLowerCase();
      const matchesSearch = 
        !searchQuery ||
        user.full_name?.toLowerCase().includes(searchLower) ||
        user.id?.toLowerCase().includes(searchLower) ||
        userRoles[user.id]?.toLowerCase().includes(searchLower);

      // Status filter
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && user.is_active) ||
        (statusFilter === "inactive" && !user.is_active);

      // Role filter
      const matchesRole =
        roleFilter === "all" ||
        userRoles[user.id] === roleFilter;

      // Department filter
      const matchesDepartment =
        departmentFilter === "all" ||
        user.department_id === departmentFilter;

      return matchesSearch && matchesStatus && matchesRole && matchesDepartment;
    });
  }, [users, userRoles, searchQuery, statusFilter, roleFilter, departmentFilter]);

  const LoadingSkeleton = () => (
    <div className="space-y-3">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-12 w-full" />
        </div>
      ))}
    </div>
  );

  return (
    <ErrorBoundary>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Users ({filteredUsers.length} of {users.length})</CardTitle>
          <Button onClick={() => setCreateDialogOpen(true)}>
            <UserPlus className="h-4 w-4 mr-2" />
            Create User
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search and Filters */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, email, or role..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>

            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                {roles.map((role) => (
                  <SelectItem key={role.id} value={role.role_name}>
                    {role.role_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Department" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Departments</SelectItem>
                {departments.map((dept) => (
                  <SelectItem key={dept.id} value={dept.id}>
                    {dept.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <LoadingSkeleton />
          ) : (
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
                  {filteredUsers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        {searchQuery || statusFilter !== "all" || roleFilter !== "all" || departmentFilter !== "all" 
                          ? "No users match your filters"
                          : "No users found"}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredUsers.map((user) => {
                      const currentRole = userRoles[user.id] || "unassigned";
                      const hasValidRole = currentRole && currentRole !== "unassigned";
                      const hasValidDept = user.department_id && user.department_id !== "none";

                      return (
                        <TableRow key={user.id}>
                          <TableCell className="font-medium">
                            {user.full_name || "—"}
                          </TableCell>
                        
                        <TableCell className="text-sm text-muted-foreground">
                          {user.id?.substring(0, 8) || "—"}...
                        </TableCell>
                        
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {!hasValidRole && (
                              <AlertTriangle className="h-4 w-4 text-amber-500" />
                            )}
                            <Select
                              value={currentRole}
                              onValueChange={(value) => handleRoleChange(user.id, value)}
                            >
                              <SelectTrigger className="w-[200px]">
                                <SelectValue placeholder="Select role" />
                              </SelectTrigger>
                              <SelectContent className="bg-background">
                                <SelectItem value="unassigned">
                                  <span className="flex items-center gap-2">
                                    <AlertTriangle className="h-3 w-3 text-amber-500" />
                                    Unassigned
                                  </span>
                                </SelectItem>
                                {roles.map((role) => (
                                  <SelectItem 
                                    key={role.id} 
                                    value={role.role_name}
                                  >
                                    {role.role_name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </TableCell>
                      
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {!hasValidDept && (
                              <AlertTriangle className="h-4 w-4 text-amber-500" />
                            )}
                            <Select
                              value={user.department_id || "none"}
                              onValueChange={(value) => handleDepartmentChange(user.id, value)}
                            >
                              <SelectTrigger className="w-[180px]">
                                <SelectValue placeholder="Select department" />
                              </SelectTrigger>
                              <SelectContent className="bg-background">
                                <SelectItem value="none">
                                  <span className="flex items-center gap-2">
                                    <AlertTriangle className="h-3 w-3 text-amber-500" />
                                    No Department
                                  </span>
                                </SelectItem>
                                {departments.map((dept) => (
                                  <SelectItem 
                                    key={dept.id} 
                                    value={dept.id}
                                  >
                                    {dept.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
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
                                setEditingUser(user);
                                setEditSheetOpen(true);
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
                    );
                  }))
                  }
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create User Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create New User</DialogTitle>
            <DialogDescription>
              Add a new user to the system with role and department assignment
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateUser} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="full_name">Full Name *</Label>
              <Input
                id="full_name"
                value={newUser.full_name}
                onChange={(e) => setNewUser({ ...newUser, full_name: e.target.value })}
                placeholder="John Doe"
                required
                disabled={creatingUser}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
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
              <Label htmlFor="password">Password (optional)</Label>
              <Input
                id="password"
                type="password"
                value={newUser.password}
                onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                placeholder="Leave blank for auto-generated"
                disabled={creatingUser}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Initial Role *</Label>
              <Select
                value={newUser.role || (roles.length > 0 ? roles[0].role_name : "unassigned")}
                onValueChange={(value) => setNewUser({ ...newUser, role: value })}
                required
                disabled={creatingUser}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent className="bg-background">
                  {roles.map((role) => (
                    <SelectItem 
                      key={role.id} 
                      value={role.role_name}
                    >
                      {role.role_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="department_id">Department</Label>
              <Select
                value={newUser.department_id || "none"}
                onValueChange={(value) => setNewUser({ ...newUser, department_id: value })}
                disabled={creatingUser}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent className="bg-background">
                  <SelectItem value="none">No Department</SelectItem>
                  {departments.map((dept) => (
                    <SelectItem 
                      key={dept.id} 
                      value={dept.id}
                    >
                      {dept.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="is_active">Active Status</Label>
              <Switch
                id="is_active"
                checked={newUser.is_active}
                onCheckedChange={(checked) => setNewUser({ ...newUser, is_active: checked })}
                disabled={creatingUser}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateDialogOpen(false)} disabled={creatingUser}>
                Cancel
              </Button>
              <Button type="submit" disabled={creatingUser}>
                {creatingUser ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Create User"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete User Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Confirm User Deletion
            </DialogTitle>
            <DialogDescription className="space-y-2">
              <p>Are you sure you want to delete this user?</p>
              <p className="text-sm">
                User deletion requires Supabase Admin API access. This will remove the user's role assignments.
              </p>
              <p className="font-medium text-foreground">This action cannot be undone.</p>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteUser}>
              Yes, Delete User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit User Sheet with Permission Overrides */}
      <Sheet open={editSheetOpen} onOpenChange={setEditSheetOpen}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Edit User</SheetTitle>
            <SheetDescription>
              {editingUser?.full_name || 'User'} - Manage role, department, and permission overrides
            </SheetDescription>
          </SheetHeader>
          
          {editingUser && (
            <div className="space-y-6 py-6">
              {/* Basic Info */}
              <div className="space-y-4">
                <div>
                  <Label className="text-muted-foreground">User ID</Label>
                  <p className="text-sm font-mono">{editingUser.id}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Name</Label>
                  <p className="font-medium">{editingUser.full_name || '—'}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Department</Label>
                  <p>{editingUser.departments?.name || 'No department assigned'}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Role</Label>
                  <p>{userRoles[editingUser.id] || 'Unassigned'}</p>
                </div>
              </div>

              <Separator />

              {/* Permission Overrides Section */}
              <UserPermissionOverrides
                userId={editingUser.id}
                userDepartmentType={editingUser.departments?.type || null}
                isAdminOrFinance={BYPASS_ROLES.includes(userRoles[editingUser.id] || '')}
                onSaved={() => {
                  toast({ title: 'Permissions Updated', description: 'User permissions have been updated and will take effect immediately.' });
                }}
              />
            </div>
          )}
        </SheetContent>
      </Sheet>
    </ErrorBoundary>
  );
}
