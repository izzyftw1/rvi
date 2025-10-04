import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { toast } from "sonner";

interface QCRecord {
  id: string;
  check_datetime: string;
  machine_id: string;
  operator_id: string;
  operation: string;
  dimensions: any;
  status: string;
  out_of_tolerance_dimensions: string[] | null;
  remarks: string | null;
  thread_status: string | null;
  visual_status: string | null;
  plating_status: string | null;
  plating_thickness_status: string | null;
  machines?: { machine_id: string; name: string };
  profiles?: { full_name: string };
}

interface QCRecordsTabProps {
  records: QCRecord[];
  woId: string;
}

export const QCRecordsTab = ({ records, woId }: QCRecordsTabProps) => {
  const [machineFilter, setMachineFilter] = useState<string>("all");
  const [operatorFilter, setOperatorFilter] = useState<string>("all");
  const [operationFilter, setOperationFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const uniqueMachines = Array.from(
    new Set(records.map((r) => r.machines?.machine_id).filter(Boolean))
  );
  const uniqueOperators = Array.from(
    new Set(records.map((r) => r.profiles?.full_name).filter(Boolean))
  );
  const uniqueOperations = Array.from(new Set(records.map((r) => r.operation))).sort();

  const filteredRecords = records.filter((record) => {
    const machineMatch = machineFilter === "all" || record.machines?.machine_id === machineFilter;
    const operatorMatch = operatorFilter === "all" || record.profiles?.full_name === operatorFilter;
    const operationMatch = operationFilter === "all" || record.operation === operationFilter;
    const statusMatch = statusFilter === "all" || record.status === statusFilter;
    return machineMatch && operatorMatch && operationMatch && statusMatch;
  });

  const exportToExcel = () => {
    const headers = [
      "Timestamp",
      "Operation",
      "Machine",
      "Operator",
      "Dimensions",
      "Thread",
      "Visual",
      "Plating",
      "Plating Thickness",
      "Status",
      "Out of Tolerance",
      "Remarks",
    ];

    const rows = filteredRecords.map((record) => {
      const dims = record.dimensions || {};
      const dimValues = Object.entries(dims)
        .sort(([a], [b]) => parseInt(a) - parseInt(b))
        .map(([, val]) => val?.toString() || "")
        .join(",");
      
      return [
        new Date(record.check_datetime).toLocaleString(),
        record.operation,
        record.machines?.machine_id || "",
        record.profiles?.full_name || "",
        dimValues,
        record.thread_status || "",
        record.visual_status || "",
        record.plating_status || "",
        record.plating_thickness_status || "",
        record.status || "",
        record.out_of_tolerance_dimensions?.join(", ") || "",
        record.remarks || "",
      ];
    });

    const csvContent = [headers, ...rows].map((row) => row.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `QC_Records_${woId}_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    toast.success("QC records exported to Excel");
  };

  const exportToPDF = () => {
    toast.info("PDF export will be implemented with jsPDF library");
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Hourly Dimensional QC Records</CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={exportToExcel}>
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Export Excel
            </Button>
            <Button variant="outline" size="sm" onClick={exportToPDF}>
              <FileText className="h-4 w-4 mr-2" />
              Export PDF
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4">
          <div>
            <Select value={machineFilter} onValueChange={setMachineFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Filter by Machine" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Machines</SelectItem>
                {uniqueMachines.map((machine) => (
                  <SelectItem key={machine} value={machine!}>
                    {machine}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Select value={operatorFilter} onValueChange={setOperatorFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Filter by Operator" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Operators</SelectItem>
                {uniqueOperators.map((operator) => (
                  <SelectItem key={operator} value={operator!}>
                    {operator}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Select value={operationFilter} onValueChange={setOperationFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Filter by Operation" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Operations</SelectItem>
                {uniqueOperations.map((op) => (
                  <SelectItem key={op} value={op}>
                    Operation {op}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Filter by Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pass">Pass Only</SelectItem>
                <SelectItem value="fail">Fail Only</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {filteredRecords.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">No QC records found</p>
        ) : (
          <div className="space-y-4">
            {filteredRecords.map((record) => (
              <div
                key={record.id}
                className={`p-4 border rounded-lg ${
                  record.status === "pass" ? "border-green-200 bg-green-50/50" : "border-red-200 bg-red-50/50"
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-medium">
                        {new Date(record.check_datetime).toLocaleString()} - Operation {record.operation}
                      </p>
                      <Badge variant={record.status === "pass" ? "default" : "destructive"}>
                        {record.status.toUpperCase()}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {record.machines?.machine_id} ({record.machines?.name}) • Operator:{" "}
                      {record.profiles?.full_name}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2 mb-3">
                  {Object.entries(record.dimensions || {})
                    .sort(([a], [b]) => parseInt(a) - parseInt(b))
                    .map(([dimNum, value]: [string, any]) => {
                      const isOutOfTolerance = record.out_of_tolerance_dimensions?.includes(dimNum);
                      return (
                        <div
                          key={dimNum}
                          className={`p-2 rounded text-center ${
                            isOutOfTolerance
                              ? "bg-red-100 border border-red-300"
                              : "bg-green-100 border border-green-300"
                          }`}
                        >
                          <div className="text-xs font-medium">{dimNum}</div>
                          <div className="text-sm font-bold">{value !== null ? value : "—"}</div>
                        </div>
                      );
                    })}
                </div>

                {record.out_of_tolerance_dimensions && record.out_of_tolerance_dimensions.length > 0 && (
                  <div className="mb-2 p-2 bg-red-100 border border-red-200 rounded">
                    <p className="text-xs font-medium text-red-700">
                      Out of Tolerance: Dimensions {record.out_of_tolerance_dimensions.join(", ")}
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-2">
                  <div className={`p-2 rounded text-center text-xs ${
                    record.thread_status === "OK" ? "bg-green-100 border border-green-300" : "bg-red-100 border border-red-300"
                  }`}>
                    <div className="font-medium">Thread</div>
                    <div className="font-bold">{record.thread_status || "—"}</div>
                  </div>
                  <div className={`p-2 rounded text-center text-xs ${
                    record.visual_status === "OK" ? "bg-green-100 border border-green-300" : "bg-red-100 border border-red-300"
                  }`}>
                    <div className="font-medium">Visual</div>
                    <div className="font-bold">{record.visual_status || "—"}</div>
                  </div>
                  <div className={`p-2 rounded text-center text-xs ${
                    record.plating_status === "OK" ? "bg-green-100 border border-green-300" : "bg-red-100 border border-red-300"
                  }`}>
                    <div className="font-medium">Plating</div>
                    <div className="font-bold">{record.plating_status || "—"}</div>
                  </div>
                  <div className={`p-2 rounded text-center text-xs ${
                    record.plating_thickness_status === "OK" ? "bg-green-100 border border-green-300" : "bg-red-100 border border-red-300"
                  }`}>
                    <div className="font-medium">Plating Thickness</div>
                    <div className="font-bold">{record.plating_thickness_status || "—"}</div>
                  </div>
                </div>

                {record.remarks && (
                  <div className="mt-2 p-2 bg-secondary/50 rounded">
                    <p className="text-xs text-muted-foreground">Remarks:</p>
                    <p className="text-sm">{record.remarks}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};