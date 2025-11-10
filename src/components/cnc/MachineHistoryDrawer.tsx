import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, Package, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";

interface MachineHistoryDrawerProps {
  open: boolean;
  onClose: () => void;
  machineId: string;
  machineName: string;
}

interface MaintenanceLog {
  id: string;
  downtime_reason: string;
  start_time: string;
  end_time: string | null;
  logged_by: string;
}

interface WorkOrder {
  id: string;
  wo_number: string;
  display_id: string;
  item_code: string;
  quantity: number;
  updated_at: string;
}

export const MachineHistoryDrawer = ({ 
  open, 
  onClose, 
  machineId, 
  machineName 
}: MachineHistoryDrawerProps) => {
  const [maintenanceLogs, setMaintenanceLogs] = useState<MaintenanceLog[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [downtimeStats, setDowntimeStats] = useState({ total_hours_7d: 0, total_hours_30d: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (open && machineId) {
      loadHistory();
    }
  }, [open, machineId]);

  const loadHistory = async () => {
    try {
      setLoading(true);

      // Load maintenance logs
      const { data: logs, error: logsError } = await supabase
        .from('maintenance_logs')
        .select('*')
        .eq('machine_id', machineId)
        .order('start_time', { ascending: false })
        .limit(10);

      if (!logsError && logs) {
        setMaintenanceLogs(logs);
      }

      // Load work orders processed
      const { data: orders, error: ordersError } = await supabase
        .from('production_logs')
        .select(`
          work_orders!inner(
            id,
            wo_number,
            display_id,
            item_code,
            quantity,
            updated_at
          )
        `)
        .eq('machine_id', machineId)
        .order('log_timestamp', { ascending: false })
        .limit(10);

      if (!ordersError && orders) {
        const uniqueOrders = Array.from(
          new Map(orders.map((item: any) => [item.work_orders.id, item.work_orders])).values()
        );
        setWorkOrders(uniqueOrders as WorkOrder[]);
      }

      // Calculate downtime stats
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

      const { data: stats7d } = await supabase
        .from('maintenance_logs')
        .select('start_time, end_time')
        .eq('machine_id', machineId)
        .gte('start_time', sevenDaysAgo);

      const { data: stats30d } = await supabase
        .from('maintenance_logs')
        .select('start_time, end_time')
        .eq('machine_id', machineId)
        .gte('start_time', thirtyDaysAgo);

      const calculateTotalHours = (logs: any[]) => {
        return logs?.reduce((total, log) => {
          const start = new Date(log.start_time).getTime();
          const end = log.end_time ? new Date(log.end_time).getTime() : Date.now();
          return total + (end - start) / (1000 * 60 * 60);
        }, 0) || 0;
      };

      setDowntimeStats({
        total_hours_7d: calculateTotalHours(stats7d || []),
        total_hours_30d: calculateTotalHours(stats30d || [])
      });

      setLoading(false);
    } catch (error) {
      console.error('Error loading machine history:', error);
      setLoading(false);
    }
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
    <Drawer open={open} onOpenChange={onClose}>
      <DrawerContent className="h-[85vh]">
        <DrawerHeader className="border-b">
          <DrawerTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5" />
            {machineName} - History
          </DrawerTitle>
        </DrawerHeader>

        <div className="p-6 overflow-auto">
          {/* Downtime Summary Cards */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Downtime (7 days)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{downtimeStats.total_hours_7d.toFixed(1)}h</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Downtime (30 days)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{downtimeStats.total_hours_30d.toFixed(1)}h</div>
              </CardContent>
            </Card>
          </div>

          {/* Tabs for Logs and Work Orders */}
          <Tabs defaultValue="maintenance" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="maintenance">Maintenance Logs</TabsTrigger>
              <TabsTrigger value="workorders">Work Orders</TabsTrigger>
            </TabsList>

            <TabsContent value="maintenance" className="mt-4">
              {loading ? (
                <div className="h-64 bg-muted animate-pulse rounded" />
              ) : maintenanceLogs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Wrench className="h-12 w-12 mx-auto mb-2 text-muted-foreground/50" />
                  <p>No maintenance logs found</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Reason</TableHead>
                      <TableHead>Start Time</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {maintenanceLogs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="font-medium">{log.downtime_reason}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(log.start_time).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {formatDuration(log.start_time, log.end_time)}
                          </Badge>
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
            </TabsContent>

            <TabsContent value="workorders" className="mt-4">
              {loading ? (
                <div className="h-64 bg-muted animate-pulse rounded" />
              ) : workOrders.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Package className="h-12 w-12 mx-auto mb-2 text-muted-foreground/50" />
                  <p>No work orders processed</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>WO Number</TableHead>
                      <TableHead>Item Code</TableHead>
                      <TableHead>Quantity</TableHead>
                      <TableHead>Last Updated</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {workOrders.map((wo) => (
                      <TableRow key={wo.id}>
                        <TableCell className="font-medium">{wo.display_id || wo.wo_number}</TableCell>
                        <TableCell>{wo.item_code}</TableCell>
                        <TableCell>{wo.quantity}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(wo.updated_at).toLocaleDateString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </DrawerContent>
    </Drawer>
  );
};
