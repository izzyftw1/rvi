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
  item_code: string;
  machine_id: string;
  operator_id: string;
  dimension_a: number | null;
  dimension_b: number | null;
  dimension_c: number | null;
  dimension_d: number | null;
  dimension_e: number | null;
  dimension_f: number | null;
  dimension_g: number | null;
  status: string;
  out_of_tolerance_dimensions: string[] | null;
  remarks: string | null;
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

  const uniqueMachines = Array.from(
    new Set(records.map((r) => r.machines?.machine_id).filter(Boolean))
  );
  const uniqueOperators = Array.from(
    new Set(records.map((r) => r.profiles?.full_name).filter(Boolean))
  );

  const filteredRecords = records.filter((record) => {
    const machineMatch = machineFilter === "all" || record.machines?.machine_id === machineFilter;
    const operatorMatch = operatorFilter === "all" || record.profiles?.full_name === operatorFilter;
    return machineMatch && operatorMatch;
  });

  const exportToExcel = () => {
    const headers = [
      "Timestamp",
      "Item Code",
      "Machine",
      "Operator",
      "Dim A",
      "Dim B",
      "Dim C",
      "Dim D",
      "Dim E",
      "Dim F",
      "Dim G",
      "Status",
      "Out of Tolerance",
      "Remarks",
    ];

    const rows = filteredRecords.map((record) => [
      new Date(record.check_datetime).toLocaleString(),
      record.item_code || "",
      record.machines?.machine_id || "",
      record.profiles?.full_name || "",
      record.dimension_a?.toString() || "",
      record.dimension_b?.toString() || "",
      record.dimension_c?.toString() || "",
      record.dimension_d?.toString() || "",
      record.dimension_e?.toString() || "",
      record.dimension_f?.toString() || "",
      record.dimension_g?.toString() || "",
      record.status || "",
      record.out_of_tolerance_dimensions?.join(", ") || "",
      record.remarks || "",
    ]);

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
        <div className="flex gap-4 mt-4">
          <div className="flex-1">
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
          <div className="flex-1">
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
                      <p className="font-medium">{new Date(record.check_datetime).toLocaleString()}</p>
                      <Badge variant={record.status === "pass" ? "default" : "destructive"}>
                        {record.status.toUpperCase()}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {record.machines?.machine_id} ({record.machines?.name}) • Operator:{" "}
                      {record.profiles?.full_name}
                    </p>
                    <p className="text-xs text-muted-foreground">Item: {record.item_code}</p>
                  </div>
                </div>

                <div className="grid grid-cols-7 gap-2 mb-3">
                {["a", "b", "c", "d", "e", "f", "g"].map((dim) => {
                    const value = record[`dimension_${dim}` as keyof QCRecord] as number | null;
                    const isOutOfTolerance = record.out_of_tolerance_dimensions?.includes(dim.toUpperCase());
                    return (
                      <div
                        key={dim}
                        className={`p-2 rounded text-center ${
                          isOutOfTolerance
                            ? "bg-red-100 border border-red-300"
                            : "bg-green-100 border border-green-300"
                        }`}
                      >
                        <div className="text-xs font-medium">{dim.toUpperCase()}</div>
                        <div className="text-sm font-bold">{value !== null ? value : "—"}</div>
                      </div>
                    );
                  })}
                </div>

                {record.out_of_tolerance_dimensions && record.out_of_tolerance_dimensions.length > 0 && (
                  <div className="mb-2 p-2 bg-red-100 border border-red-200 rounded">
                    <p className="text-xs font-medium text-red-700">
                      Out of Tolerance: {record.out_of_tolerance_dimensions.join(", ")}
                    </p>
                  </div>
                )}

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
