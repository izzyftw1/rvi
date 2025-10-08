import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

interface ProductionLog {
  id: string;
  log_timestamp: string;
  quantity_completed: number;
  quantity_scrap: number;
  shift: string | null;
  remarks: string | null;
  machine_id: string;
  operator_id: string | null;
}

interface ProductionLogsTableProps {
  woId: string;
}

export function ProductionLogsTable({ woId }: ProductionLogsTableProps) {
  const [logs, setLogs] = useState<ProductionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [machineNames, setMachineNames] = useState<Record<string, string>>({});
  const [operatorNames, setOperatorNames] = useState<Record<string, string>>({});

  useEffect(() => {
    loadProductionLogs();

    const channel = supabase
      .channel("production_logs_changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "production_logs",
          filter: `wo_id=eq.${woId}`,
        },
        () => {
          loadProductionLogs();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [woId]);

  const loadProductionLogs = async () => {
    try {
      const { data: logsData, error } = await supabase
        .from("production_logs")
        .select("*")
        .eq("wo_id", woId)
        .order("log_timestamp", { ascending: false });

      if (error) throw error;

      setLogs(logsData || []);

      // Load machine names
      const machineIds = [...new Set(logsData?.map((log) => log.machine_id) || [])];
      const { data: machinesData } = await supabase
        .from("machines")
        .select("id, machine_id, name")
        .in("id", machineIds);

      const machineMap: Record<string, string> = {};
      machinesData?.forEach((machine) => {
        machineMap[machine.id] = `${machine.machine_id} - ${machine.name}`;
      });
      setMachineNames(machineMap);

      // Load operator names
      const operatorIds = logsData
        ?.map((log) => log.operator_id)
        .filter((id): id is string => id !== null) || [];
      
      if (operatorIds.length > 0) {
        const { data: profilesData } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", operatorIds);

        const operatorMap: Record<string, string> = {};
        profilesData?.forEach((profile) => {
          operatorMap[profile.id] = profile.full_name;
        });
        setOperatorNames(operatorMap);
      }
    } catch (error) {
      console.error("Error loading production logs:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Production Logs</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Timestamp</TableHead>
              <TableHead>Machine</TableHead>
              <TableHead>Operator</TableHead>
              <TableHead className="text-right">Completed</TableHead>
              <TableHead className="text-right">Scrap</TableHead>
              <TableHead className="text-right">Net</TableHead>
              <TableHead>Shift</TableHead>
              <TableHead>Remarks</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center">
                  Loading logs...
                </TableCell>
              </TableRow>
            ) : logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center">
                  No production logs recorded yet
                </TableCell>
              </TableRow>
            ) : (
              logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell>
                    {format(new Date(log.log_timestamp), "MMM dd, yyyy HH:mm")}
                  </TableCell>
                  <TableCell>{machineNames[log.machine_id] || "Unknown"}</TableCell>
                  <TableCell>
                    {log.operator_id ? operatorNames[log.operator_id] || "Unknown" : "-"}
                  </TableCell>
                  <TableCell className="text-right">
                    {log.quantity_completed.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant="destructive">
                      {log.quantity_scrap.toLocaleString()}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    {(log.quantity_completed - log.quantity_scrap).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    {log.shift && (
                      <Badge variant="outline">
                        {log.shift === "day" ? "Day" : "Night"}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="max-w-xs truncate">
                    {log.remarks || "-"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
