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
  log_date: string;
  created_at: string;
  actual_quantity: number;
  total_rejection_quantity: number | null;
  ok_quantity: number | null;
  shift: string;
  machine_id: string;
  operator_id: string | null;
  efficiency_percentage: number | null;
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
      .channel(`production_logs_${woId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "daily_production_logs",
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
        .from("daily_production_logs")
        .select("id, log_date, created_at, actual_quantity, total_rejection_quantity, ok_quantity, shift, machine_id, operator_id, efficiency_percentage")
        .eq("wo_id", woId)
        .order("log_date", { ascending: false });

      if (error) throw error;

      setLogs(logsData || []);

      // Load machine names
      const machineIds = [...new Set(logsData?.map((log) => log.machine_id) || [])];
      if (machineIds.length > 0) {
        const { data: machinesData } = await supabase
          .from("machines")
          .select("id, machine_id, name")
          .in("id", machineIds);

        const machineMap: Record<string, string> = {};
        machinesData?.forEach((machine) => {
          machineMap[machine.id] = `${machine.machine_id} - ${machine.name}`;
        });
        setMachineNames(machineMap);
      }

      // Load operator names from people table
      const operatorIds = logsData
        ?.map((log) => log.operator_id)
        .filter((id): id is string => id !== null) || [];
      
      if (operatorIds.length > 0) {
        const { data: peopleData } = await supabase
          .from("people")
          .select("id, full_name")
          .in("id", operatorIds);

        const operatorMap: Record<string, string> = {};
        peopleData?.forEach((person) => {
          operatorMap[person.id] = person.full_name;
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
              <TableHead>Date</TableHead>
              <TableHead>Machine</TableHead>
              <TableHead>Operator</TableHead>
              <TableHead className="text-right">Actual Qty</TableHead>
              <TableHead className="text-right">Rejections</TableHead>
              <TableHead className="text-right">OK Pcs</TableHead>
              <TableHead className="text-right">Efficiency</TableHead>
              <TableHead>Shift</TableHead>
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
                    {format(new Date(log.log_date), "MMM dd, yyyy")}
                  </TableCell>
                  <TableCell>{machineNames[log.machine_id] || "Unknown"}</TableCell>
                  <TableCell>
                    {log.operator_id ? operatorNames[log.operator_id] || "Unknown" : "-"}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {log.actual_quantity.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    {(log.total_rejection_quantity || 0) > 0 ? (
                      <Badge variant="destructive">
                        {(log.total_rejection_quantity || 0).toLocaleString()}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-semibold text-green-600">
                    {(log.ok_quantity || 0).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    {log.efficiency_percentage !== null ? (
                      <Badge 
                        variant={log.efficiency_percentage >= 100 ? "default" : log.efficiency_percentage >= 80 ? "secondary" : "destructive"}
                      >
                        {log.efficiency_percentage}%
                      </Badge>
                    ) : (
                      "-"
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {log.shift === "day" ? "Day" : "Night"}
                    </Badge>
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