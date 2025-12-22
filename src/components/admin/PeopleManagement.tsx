import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Trash2, Search, Users } from "lucide-react";

type PersonRole = "operator" | "programmer" | "qc_inspector";
type EmploymentType = "internal" | "agency";

interface Person {
  id: string;
  full_name: string;
  role: PersonRole;
  employment_type: EmploymentType;
  is_active: boolean;
  created_at: string;
}

const roleLabels: Record<PersonRole, string> = {
  operator: "Operator",
  programmer: "CNC Programmer",
  qc_inspector: "QC Inspector",
};

const employmentLabels: Record<EmploymentType, string> = {
  internal: "Internal",
  agency: "Agency",
};

export function PeopleManagement() {
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<PersonRole | "all">("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPerson, setEditingPerson] = useState<Person | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [personToDelete, setPersonToDelete] = useState<Person | null>(null);
  
  // Form state
  const [formName, setFormName] = useState("");
  const [formRole, setFormRole] = useState<PersonRole>("operator");
  const [formEmployment, setFormEmployment] = useState<EmploymentType>("internal");
  const [formActive, setFormActive] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const { toast } = useToast();

  useEffect(() => {
    loadPeople();
  }, []);

  const loadPeople = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("people")
        .select("*")
        .order("full_name");
      
      if (error) throw error;
      setPeople(data || []);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to load people",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormName("");
    setFormRole("operator");
    setFormEmployment("internal");
    setFormActive(true);
    setEditingPerson(null);
  };

  const openEditDialog = (person: Person) => {
    setEditingPerson(person);
    setFormName(person.full_name);
    setFormRole(person.role);
    setFormEmployment(person.employment_type);
    setFormActive(person.is_active);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formName.trim()) {
      toast({ title: "Error", description: "Name is required", variant: "destructive" });
      return;
    }

    try {
      setSaving(true);
      
      if (editingPerson) {
        const { error } = await supabase
          .from("people")
          .update({
            full_name: formName.trim(),
            role: formRole,
            employment_type: formEmployment,
            is_active: formActive,
          })
          .eq("id", editingPerson.id);
        
        if (error) throw error;
        toast({ title: "Success", description: "Person updated successfully" });
      } else {
        const { error } = await supabase
          .from("people")
          .insert({
            full_name: formName.trim(),
            role: formRole,
            employment_type: formEmployment,
            is_active: formActive,
          });
        
        if (error) throw error;
        toast({ title: "Success", description: "Person added successfully" });
      }
      
      setDialogOpen(false);
      resetForm();
      loadPeople();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save person",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!personToDelete) return;

    try {
      const { error } = await supabase
        .from("people")
        .delete()
        .eq("id", personToDelete.id);
      
      if (error) throw error;
      
      toast({ title: "Success", description: "Person deleted successfully" });
      setDeleteDialogOpen(false);
      setPersonToDelete(null);
      loadPeople();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete person",
        variant: "destructive",
      });
    }
  };

  const handleToggleActive = async (person: Person) => {
    try {
      const { error } = await supabase
        .from("people")
        .update({ is_active: !person.is_active })
        .eq("id", person.id);
      
      if (error) throw error;
      loadPeople();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update status",
        variant: "destructive",
      });
    }
  };

  const filteredPeople = people.filter((person) => {
    const matchesSearch = person.full_name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = roleFilter === "all" || person.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const counts = {
    operator: people.filter(p => p.role === "operator" && p.is_active).length,
    programmer: people.filter(p => p.role === "programmer" && p.is_active).length,
    qc_inspector: people.filter(p => p.role === "qc_inspector" && p.is_active).length,
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              People Master
            </CardTitle>
            <CardDescription>
              Manage operators, CNC programmers, and QC inspectors
            </CardDescription>
          </div>
          <Dialog open={dialogOpen} onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) resetForm();
          }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Person
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingPerson ? "Edit Person" : "Add New Person"}</DialogTitle>
                <DialogDescription>
                  {editingPerson ? "Update person details" : "Add a new operator, programmer, or QC inspector"}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Full Name *</Label>
                  <Input
                    id="name"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="Enter full name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Role *</Label>
                  <Select value={formRole} onValueChange={(v) => setFormRole(v as PersonRole)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="operator">Operator</SelectItem>
                      <SelectItem value="programmer">CNC Programmer</SelectItem>
                      <SelectItem value="qc_inspector">QC Inspector</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Employment Type *</Label>
                  <Select value={formEmployment} onValueChange={(v) => setFormEmployment(v as EmploymentType)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="internal">Internal</SelectItem>
                      <SelectItem value="agency">Agency</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="active">Active Status</Label>
                  <Switch
                    id="active"
                    checked={formActive}
                    onCheckedChange={setFormActive}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? "Saving..." : editingPerson ? "Update" : "Add Person"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary badges */}
        <div className="flex gap-4 flex-wrap">
          <Badge variant="outline" className="text-sm py-1 px-3">
            Operators: {counts.operator}
          </Badge>
          <Badge variant="outline" className="text-sm py-1 px-3">
            Programmers: {counts.programmer}
          </Badge>
          <Badge variant="outline" className="text-sm py-1 px-3">
            QC Inspectors: {counts.qc_inspector}
          </Badge>
        </div>

        {/* Filters */}
        <div className="flex gap-4 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v as PersonRole | "all")}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Roles</SelectItem>
              <SelectItem value="operator">Operators</SelectItem>
              <SelectItem value="programmer">CNC Programmers</SelectItem>
              <SelectItem value="qc_inspector">QC Inspectors</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        {loading ? (
          <div className="text-center py-8 text-muted-foreground">Loading...</div>
        ) : filteredPeople.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            {searchQuery || roleFilter !== "all" ? "No people match your filters" : "No people added yet"}
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Employment</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPeople.map((person) => (
                  <TableRow key={person.id}>
                    <TableCell className="font-medium">{person.full_name}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{roleLabels[person.role]}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={person.employment_type === "internal" ? "default" : "outline"}>
                        {employmentLabels[person.employment_type]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={person.is_active}
                        onCheckedChange={() => handleToggleActive(person)}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditDialog(person)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setPersonToDelete(person);
                            setDeleteDialogOpen(true);
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Delete Confirmation Dialog */}
        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirm Delete</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete "{personToDelete?.full_name}"? This action cannot be undone.
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
      </CardContent>
    </Card>
  );
}
