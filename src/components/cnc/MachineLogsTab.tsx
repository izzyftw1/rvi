import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Search, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface MaintenanceLog {
  id: string;
  machine_id: string;
  downtime_reason: string;
  start_time: string;
  end_time: string | null;
  logged_by: string;
  machines: {
    machine_id: string;
    name: string;
  } | null;
}

export const MachineLogsTab = () => {
  const [logs, setLogs] = useState<MaintenanceLog[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<MaintenanceLog[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLogs();

    // Real-time subscription
    const channel = supabase
      .channel('maintenance-logs-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'maintenance_logs' }, () => loadLogs())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    applyFilter();
  }, [logs, searchTerm]);

  const loadLogs = async () => {
    try {
      const { data, error } = await supabase
        .from('maintenance_logs')
        .select(`
          *,
          machines(machine_id, name)
        `)
        .order('start_time', { ascending: false })
        .limit(100);

      if (error) throw error;
      if (data) {
        setLogs(data);
      }
      setLoading(false);
    } catch (error) {
      console.error('Error loading maintenance logs:', error);
      setLoading(false);
    }
  };

  const applyFilter = () => {
    if (!searchTerm) {
      setFilteredLogs(logs);
      return;
    }

    const term = searchTerm.toLowerCase();
    const filtered = logs.filter(log => 
      log.machines?.machine_id?.toLowerCase().includes(term) ||
      log.machines?.name?.toLowerCase().includes(term) ||
      log.downtime_reason?.toLowerCase().includes(term)
    );
    setFilteredLogs(filtered);
  };

  const formatDuration = (start: string, end: string | null) => {
    const startTime = new Date(start).getTime();
    const endTime = end ? new Date(end).getTime() : Date.now();
    const hours = (endTime - startTime) / (1000 * 60 * 60);
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return `${h}h ${m}m`;
  };

  return (
    <div className="space-y-6">
      {/* Search */}
      <Card>
        <CardHeader>
          <CardTitle>Maintenance Logs</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by machine, reason..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Logs Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="h-96 bg-muted animate-pulse" />
          ) : filteredLogs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Clock className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
              <p>No maintenance logs found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Machine</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Start Time</TableHead>
                  <TableHead>End Time</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{log.machines?.name || 'Unknown'}</p>
                        <p className="text-xs text-muted-foreground">{log.machines?.machine_id}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{log.downtime_reason}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {new Date(log.start_time).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-sm">
                      {log.end_time ? new Date(log.end_time).toLocaleString() : '—'}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        <span className="text-sm font-mono">
                          {formatDuration(log.start_time, log.end_time)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge 
                        variant={log.end_time ? "default" : "secondary"}
                        className={cn(
                          log.end_time 
                            ? "bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300"
                            : "bg-orange-50 dark:bg-orange-950/30 text-orange-700 dark:text-orange-300"
                        )}
                      >
                        {log.end_time ? 'Completed' : 'Active'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
