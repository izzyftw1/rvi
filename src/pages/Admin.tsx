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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Users, Shield, Activity, UserPlus, CheckCircle2, XCircle, Edit, Trash2 } from "lucide-react";

export default function Admin() {
  const [users, setUsers] = useState<any[]>([]);
  const [userRoles, setUserRoles] = useState<Record<string, any[]>>({});
  const [departments, setDepartments] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [permissions, setPermissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [rolesDialogOpen, setRolesDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [editingUser, setEditingUser] = useState({
    id: "",
    full_name: "",
    department_id: "",
  });
  const [newUser, setNewUser] = useState({
    email: "",
    full_name: "",
    password: "",
    department_id: "",
    role: "",
  });
  const { toast } = useToast();

  const roles = [
    { value: "admin", label: "Admin (Super Admin)" },
    { value: "sales", label: "Sales" },
    { value: "stores", label: "Stores/Goods In" },
    { value: "quality", label: "Quality (QC)" },
    { value: "production", label: "Production" },
    { value: "packing", label: "Packing" },
    { value: "accounts", label: "Finance/Admin" },
    { value: "purchase", label: "Purchase" },
    { value: "cfo", label: "CFO" },
    { value: "director", label: "Director" },
  ];

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      
      const { data: deptData } = await supabase.from("departments").select("*").order("name");
      setDepartments(deptData || []);

      const { data: permData } = await supabase.from("role_permissions").select("*").order("role");
      setPermissions(permData || []);

      const { data: profilesData } = await supabase.from("profiles").select("*, departments(name)");
      setUsers(profilesData || []);

      // Load roles for all users
      const { data: rolesData } = await supabase.from("user_roles").select("*");
      const rolesByUser: Record<string, any[]> = {};
      rolesData?.forEach((role) => {
        if (!rolesByUser[role.user_id]) {
          rolesByUser[role.user_id] = [];
        }
        rolesByUser[role.user_id].push(role);
      });
      setUserRoles(rolesByUser);

      const { data: logsData } = await supabase
        .from("user_audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      setAuditLogs(logsData || []);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    toast({ title: "Success", description: "User creation functionality requires Supabase Admin API" });
    setDialogOpen(false);
  };

  const handleToggleUserStatus = async (userId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ is_active: !currentStatus })
        .eq("id", userId);

      if (error) throw error;
      toast({ title: "Success", description: `User ${!currentStatus ? "activated" : "deactivated"}` });
      loadData();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleEditUser = (user: any) => {
    setEditingUser({
      id: user.id,
      full_name: user.full_name,
      department_id: user.department_id || "",
    });
    setEditDialogOpen(true);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: editingUser.full_name,
          department_id: editingUser.department_id || null,
        })
        .eq("id", editingUser.id);

      if (error) throw error;
      toast({ title: "Success", description: "User updated successfully" });
      setEditDialogOpen(false);
      loadData();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleManageRoles = (user: any) => {
    setSelectedUser(user);
    setRolesDialogOpen(true);
  };

  const handleAddRole = async (role: string) => {
    if (!selectedUser) return;

    try {
      const { error } = await supabase
        .rpc('manage_user_role', {
          _target_user_id: selectedUser.id,
          _role: role as any,
          _action: 'add'
        });

      if (error) throw error;
      toast({ title: "Success", description: `${role} role added` });
      loadData();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleRemoveRole = async (roleId: string, roleValue: string) => {
    if (!selectedUser) return;

    try {
      const { error } = await supabase
        .rpc('manage_user_role', {
          _target_user_id: selectedUser.id,
          _role: roleValue as any,
          _action: 'remove'
        });

      if (error) throw error;
      toast({ title: "Success", description: "Role removed" });
      loadData();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <NavigationHeader />
        <div className="container mx-auto p-6"><p>Loading...</p></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <NavigationHeader />
      <main className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold">Admin Panel</h1>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button><UserPlus className="h-4 w-4 mr-2" />Create User</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create New User</DialogTitle></DialogHeader>
              <form onSubmit={handleCreateUser} className="space-y-4">
                <div><Label>Full Name</Label><Input value={newUser.full_name} onChange={(e) => setNewUser({ ...newUser, full_name: e.target.value })} required /></div>
                <div><Label>Email</Label><Input type="email" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} required /></div>
                <div><Label>Temporary Password</Label><Input type="password" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} required /></div>
                <Button type="submit" className="w-full">Create User</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <Tabs defaultValue="users" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="users"><Users className="h-4 w-4 mr-2" />Users</TabsTrigger>
            <TabsTrigger value="permissions"><Shield className="h-4 w-4 mr-2" />Permissions</TabsTrigger>
            <TabsTrigger value="audit"><Activity className="h-4 w-4 mr-2" />Audit Trail</TabsTrigger>
          </TabsList>

          <TabsContent value="users">
            <Card>
              <CardHeader><CardTitle>User Management</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead>Roles</TableHead>
                      <TableHead>Last Login</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell>{user.full_name}</TableCell>
                        <TableCell>{user.departments?.name || "—"}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {userRoles[user.id]?.map((role) => (
                              <Badge key={role.id} variant="secondary" className="text-xs">
                                {role.role}
                              </Badge>
                            )) || <span className="text-muted-foreground text-sm">No roles</span>}
                          </div>
                        </TableCell>
                        <TableCell>{user.last_login ? format(new Date(user.last_login), "PPp") : "Never"}</TableCell>
                        <TableCell>
                          {user.is_active ? (
                            <Badge variant="default"><CheckCircle2 className="h-3 w-3 mr-1" />Active</Badge>
                          ) : (
                            <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Inactive</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" onClick={() => handleEditUser(user)}>
                              <Edit className="h-3 w-3 mr-1" />Edit
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => handleManageRoles(user)}>
                              <Shield className="h-3 w-3 mr-1" />Roles
                            </Button>
                            <Button size="sm" variant={user.is_active ? "destructive" : "default"} onClick={() => handleToggleUserStatus(user.id, user.is_active)}>
                              {user.is_active ? "Deactivate" : "Activate"}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="permissions">
            <Card>
              <CardHeader><CardTitle>Permissions Matrix</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Role</TableHead>
                      <TableHead>Module</TableHead>
                      <TableHead className="text-center">View</TableHead>
                      <TableHead className="text-center">Create</TableHead>
                      <TableHead className="text-center">Edit</TableHead>
                      <TableHead className="text-center">Approve</TableHead>
                      <TableHead className="text-center">Export</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {permissions.map((perm) => (
                      <TableRow key={perm.id}>
                        <TableCell className="font-medium">{perm.role}</TableCell>
                        <TableCell>{perm.module}</TableCell>
                        <TableCell className="text-center">{perm.can_view && <CheckCircle2 className="h-4 w-4 text-success mx-auto" />}</TableCell>
                        <TableCell className="text-center">{perm.can_create && <CheckCircle2 className="h-4 w-4 text-success mx-auto" />}</TableCell>
                        <TableCell className="text-center">{perm.can_edit && <CheckCircle2 className="h-4 w-4 text-success mx-auto" />}</TableCell>
                        <TableCell className="text-center">{perm.can_approve && <CheckCircle2 className="h-4 w-4 text-success mx-auto" />}</TableCell>
                        <TableCell className="text-center">{perm.can_export && <CheckCircle2 className="h-4 w-4 text-success mx-auto" />}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="audit">
            <Card>
              <CardHeader><CardTitle>User Audit Trail</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Timestamp</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Module</TableHead>
                      <TableHead>Details</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {auditLogs.map((log) => {
                      const sanitizeAuditDetails = (details: any) => {
                        if (!details) return {};
                        const sanitized = { ...details };
                        const sensitiveKeys = ['password', 'token', 'secret', 'api_key'];
                        
                        Object.keys(sanitized).forEach(key => {
                          if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk))) {
                            sanitized[key] = '[REDACTED]';
                          }
                        });
                        
                        return sanitized;
                      };

                      return (
                        <TableRow key={log.id}>
                          <TableCell>{format(new Date(log.created_at), "PPp")}</TableCell>
                          <TableCell><Badge variant="outline">{log.action_type}</Badge></TableCell>
                          <TableCell>{log.module}</TableCell>
                          <TableCell className="max-w-md truncate">{JSON.stringify(sanitizeAuditDetails(log.action_details))}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Edit User Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>Edit User</DialogTitle></DialogHeader>
            <form onSubmit={handleSaveUser} className="space-y-4">
              <div>
                <Label>Full Name</Label>
                <Input value={editingUser.full_name} onChange={(e) => setEditingUser({ ...editingUser, full_name: e.target.value })} required />
              </div>
              <div>
                <Label>Department</Label>
                <Select value={editingUser.department_id} onValueChange={(value) => setEditingUser({ ...editingUser, department_id: value })}>
                  <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                  <SelectContent>
                    {departments.map((dept) => (
                      <SelectItem key={dept.id} value={dept.id}>{dept.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" className="w-full">Save Changes</Button>
            </form>
          </DialogContent>
        </Dialog>

        {/* Manage Roles Dialog */}
        <Dialog open={rolesDialogOpen} onOpenChange={setRolesDialogOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>Manage Roles for {selectedUser?.full_name}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Current Roles</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {userRoles[selectedUser?.id]?.map((role) => (
                    <Badge key={role.id} variant="secondary" className="flex items-center gap-1">
                      {role.role}
                      <button
                        type="button"
                        onClick={() => handleRemoveRole(role.id, role.role)}
                        className="ml-1 hover:text-destructive"
                      >
                        <XCircle className="h-3 w-3" />
                      </button>
                    </Badge>
                  )) || <p className="text-sm text-muted-foreground">No roles assigned</p>}
                </div>
              </div>
              <div>
                <Label>Add Role</Label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {roles.map((role) => {
                    const hasRole = userRoles[selectedUser?.id]?.some((r) => r.role === role.value);
                    return (
                      <Button
                        key={role.value}
                        size="sm"
                        variant={hasRole ? "secondary" : "outline"}
                        disabled={hasRole}
                        onClick={() => handleAddRole(role.value)}
                      >
                        {role.label}
                      </Button>
                    );
                  })}
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
