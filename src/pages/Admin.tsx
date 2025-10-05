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
import { Users, Shield, Activity, UserPlus, CheckCircle2, XCircle } from "lucide-react";

export default function Admin() {
  const [users, setUsers] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [permissions, setPermissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
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
      setLoading(false);
      
      const { data: deptData } = await supabase.from("departments").select("*").order("name");
      setDepartments(deptData || []);

      const { data: permData } = await supabase.from("role_permissions").select("*").order("role");
      setPermissions(permData || []);

      const { data: profilesData } = await supabase.from("profiles").select("*, departments(name)");
      setUsers(profilesData || []);

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
                        <TableCell>{user.last_login ? format(new Date(user.last_login), "PPp") : "Never"}</TableCell>
                        <TableCell>
                          {user.is_active ? (
                            <Badge variant="default"><CheckCircle2 className="h-3 w-3 mr-1" />Active</Badge>
                          ) : (
                            <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Inactive</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button size="sm" variant={user.is_active ? "destructive" : "default"} onClick={() => handleToggleUserStatus(user.id, user.is_active)}>
                            {user.is_active ? "Deactivate" : "Activate"}
                          </Button>
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
                    {auditLogs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell>{format(new Date(log.created_at), "PPp")}</TableCell>
                        <TableCell><Badge variant="outline">{log.action_type}</Badge></TableCell>
                        <TableCell>{log.module}</TableCell>
                        <TableCell className="max-w-md truncate">{JSON.stringify(log.action_details)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
