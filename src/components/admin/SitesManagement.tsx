import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Factory, Edit, Trash2, Plus } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const SitesManagement = () => {
  const [sites, setSites] = useState<any[]>([]);
  const [machines, setMachines] = useState<any[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [newSite, setNewSite] = useState({ name: "", code: "" });
  const [editingSite, setEditingSite] = useState<any>(null);
  const { toast } = useToast();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const { data: sitesData } = await supabase
        .from("sites")
        .select("*")
        .order("name");
      setSites(sitesData || []);

      const { data: machinesData } = await supabase
        .from("machines")
        .select("*, sites(name, code)")
        .order("machine_id");
      setMachines(machinesData || []);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleCreateSite = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { error } = await supabase
        .from("sites")
        .insert([newSite]);

      if (error) throw error;
      toast({ title: "Success", description: "Site created successfully" });
      setDialogOpen(false);
      setNewSite({ name: "", code: "" });
      loadData();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleEditSite = (site: any) => {
    setEditingSite(site);
    setEditDialogOpen(true);
  };

  const handleUpdateSite = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { error } = await supabase
        .from("sites")
        .update({ name: editingSite.name, code: editingSite.code })
        .eq("id", editingSite.id);

      if (error) throw error;
      toast({ title: "Success", description: "Site updated successfully" });
      setEditDialogOpen(false);
      loadData();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleDeleteSite = async (siteId: string) => {
    if (!confirm("Are you sure you want to delete this site?")) return;

    try {
      const { error } = await supabase
        .from("sites")
        .delete()
        .eq("id", siteId);

      if (error) throw error;
      toast({ title: "Success", description: "Site deleted successfully" });
      loadData();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleAssignMachine = async (machineId: string, siteId: string) => {
    try {
      const { error } = await supabase
        .from("machines")
        .update({ site_id: siteId })
        .eq("id", machineId);

      if (error) throw error;
      toast({ title: "Success", description: "Machine assigned to site" });
      loadData();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Factory className="h-5 w-5" />
              Sites Management
            </CardTitle>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Site
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create New Site</DialogTitle>
                  <DialogDescription>Add a new manufacturing site</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleCreateSite} className="space-y-4">
                  <div>
                    <Label>Site Name</Label>
                    <Input
                      value={newSite.name}
                      onChange={(e) => setNewSite({ ...newSite, name: e.target.value })}
                      placeholder="e.g., Chennai Plant"
                      required
                    />
                  </div>
                  <div>
                    <Label>Site Code</Label>
                    <Input
                      value={newSite.code}
                      onChange={(e) => setNewSite({ ...newSite, code: e.target.value })}
                      placeholder="e.g., CHN"
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full">Create Site</Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Site Name</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Machines</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sites.map((site) => {
                const siteMachines = machines.filter(m => m.site_id === site.id);
                return (
                  <TableRow key={site.id}>
                    <TableCell className="font-medium">{site.name}</TableCell>
                    <TableCell><Badge variant="outline">{site.code}</Badge></TableCell>
                    <TableCell>{siteMachines.length} machines</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => handleEditSite(site)}>
                          <Edit className="h-3 w-3 mr-1" />
                          Edit
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => handleDeleteSite(site.id)}>
                          <Trash2 className="h-3 w-3 mr-1" />
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Machine-Site Assignments</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Machine ID</TableHead>
                <TableHead>Machine Name</TableHead>
                <TableHead>Current Site</TableHead>
                <TableHead>Assign to Site</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {machines.map((machine) => (
                <TableRow key={machine.id}>
                  <TableCell className="font-medium">{machine.machine_id}</TableCell>
                  <TableCell>{machine.name}</TableCell>
                  <TableCell>
                    {machine.sites ? (
                      <Badge>{machine.sites.name} ({machine.sites.code})</Badge>
                    ) : (
                      <Badge variant="destructive">Unassigned</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Select
                      value={machine.site_id || ""}
                      onValueChange={(value) => handleAssignMachine(machine.id, value)}
                    >
                      <SelectTrigger className="w-[200px]">
                        <SelectValue placeholder="Select site" />
                      </SelectTrigger>
                      <SelectContent>
                        {sites.map((site) => (
                          <SelectItem key={site.id} value={site.id}>
                            {site.name} ({site.code})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Edit Site Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Site</DialogTitle>
            <DialogDescription>Update site information</DialogDescription>
          </DialogHeader>
          {editingSite && (
            <form onSubmit={handleUpdateSite} className="space-y-4">
              <div>
                <Label>Site Name</Label>
                <Input
                  value={editingSite.name}
                  onChange={(e) => setEditingSite({ ...editingSite, name: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label>Site Code</Label>
                <Input
                  value={editingSite.code}
                  onChange={(e) => setEditingSite({ ...editingSite, code: e.target.value })}
                  required
                />
              </div>
              <Button type="submit" className="w-full">Save Changes</Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
