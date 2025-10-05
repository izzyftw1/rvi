import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { NavigationHeader } from "@/components/NavigationHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Wrench, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

interface MaintenanceLog {
  id: string;
  machine_id: string;
  downtime_reason: string;
  start_time: string;
  end_time: string | null;
  logged_by: string | null;
  machines: {
    machine_id: string;
    name: string;
  };
}

interface Machine {
  id: string;
  machine_id: string;
  name: string;
  status: string;
}

export default function Maintenance() {
  const [logs, setLogs] = useState<MaintenanceLog[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    machine_id: "",
    downtime_reason: "",
    start_time: "",
    end_time: "",
  });
  const { toast } = useToast();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Load machines
      const { data: machinesData, error: machinesError } = await supabase
        .from("machines")
        .select("*")
        .order("name");

      if (machinesError) throw machinesError;
      setMachines(machinesData || []);

      // Load maintenance logs
      const { data: logsData, error: logsError } = await supabase
        .from("maintenance_logs")
        .select(`
          *,
          machines (machine_id, name)
        `)
        .order("start_time", { ascending: false });

      if (logsError) throw logsError;
      setLogs(logsData || []);
    } catch (error: any) {
      toast({
        title: "Error loading data",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase
        .from("maintenance_logs")
        .insert({
          machine_id: formData.machine_id,
          downtime_reason: formData.downtime_reason,
          start_time: formData.start_time,
          end_time: formData.end_time || null,
          logged_by: user?.id,
        });

      if (error) throw error;

      // Update machine status to maintenance
      await supabase
        .from("machines")
        .update({ status: "maintenance" })
        .eq("id", formData.machine_id);

      toast({
        title: "Success",
        description: "Maintenance log created successfully",
      });

      setDialogOpen(false);
      setFormData({
        machine_id: "",
        downtime_reason: "",
        start_time: "",
        end_time: "",
      });
      loadData();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleEndMaintenance = async (logId: string, machineId: string) => {
    try {
      const { error } = await supabase
        .from("maintenance_logs")
        .update({ end_time: new Date().toISOString() })
        .eq("id", logId);

      if (error) throw error;

      // Update machine status back to idle
      await supabase
        .from("machines")
        .update({ status: "idle" })
        .eq("id", machineId);

      toast({
        title: "Success",
        description: "Maintenance completed",
      });

      loadData();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const getMachineStatus = (status: string) => {
    const variants: Record<string, "default" | "destructive" | "secondary"> = {
      running: "default",
      maintenance: "destructive",
      idle: "secondary",
    };
    return <Badge variant={variants[status] || "secondary"}>{status.toUpperCase()}</Badge>;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <NavigationHeader />
        <div className="container mx-auto p-6">
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <NavigationHeader />
      <main className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Wrench className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold">Maintenance Management</h1>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                New Maintenance Log
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Maintenance Log</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label>Machine</Label>
                  <Select
                    value={formData.machine_id}
                    onValueChange={(value) => setFormData({ ...formData, machine_id: value })}
                    required
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select machine" />
                    </SelectTrigger>
                    <SelectContent>
                      {machines.map((machine) => (
                        <SelectItem key={machine.id} value={machine.id}>
                          {machine.machine_id} - {machine.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Downtime Reason</Label>
                  <Textarea
                    value={formData.downtime_reason}
                    onChange={(e) => setFormData({ ...formData, downtime_reason: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Label>Start Time</Label>
                  <Input
                    type="datetime-local"
                    value={formData.start_time}
                    onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Label>End Time (Optional)</Label>
                  <Input
                    type="datetime-local"
                    value={formData.end_time}
                    onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                  />
                </div>
                <Button type="submit" className="w-full">Create Log</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Machine Status Overview */}
        <Card>
          <CardHeader>
            <CardTitle>Machine Status Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {machines.map((machine) => (
                <Card key={machine.id}>
                  <CardContent className="pt-6">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="font-semibold">{machine.machine_id}</p>
                        <p className="text-sm text-muted-foreground">{machine.name}</p>
                      </div>
                      {getMachineStatus(machine.status)}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Maintenance Logs */}
        <Card>
          <CardHeader>
            <CardTitle>Maintenance Logs</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Machine</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Start Time</TableHead>
                  <TableHead>End Time</TableHead>
                  <TableHead>Logged By</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell>
                      {log.machines.machine_id} - {log.machines.name}
                    </TableCell>
                    <TableCell>{log.downtime_reason}</TableCell>
                    <TableCell>{format(new Date(log.start_time), "PPp")}</TableCell>
                    <TableCell>
                      {log.end_time ? format(new Date(log.end_time), "PPp") : "-"}
                    </TableCell>
                    <TableCell>-</TableCell>
                    <TableCell>
                      {log.end_time ? (
                        <Badge variant="secondary">Completed</Badge>
                      ) : (
                        <Badge variant="destructive">Ongoing</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {!log.end_time && (
                        <Button
                          size="sm"
                          onClick={() => handleEndMaintenance(log.id, log.machine_id)}
                        >
                          End Maintenance
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
