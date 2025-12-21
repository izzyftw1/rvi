import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { FileSpreadsheet, FileText, ClipboardCheck, ChevronDown, ChevronUp, Clock, History } from "lucide-react";
import { toast } from "sonner";
import { QCGateControls } from "./QCGateControls";
import { QCInspectionForm } from "./QCInspectionForm";
import { supabase } from "@/integrations/supabase/client";

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
  workOrder: any;
  onUpdate: () => void;
}

export const QCRecordsTab = ({ records, woId, workOrder, onUpdate }: QCRecordsTabProps) => {
  const [machineFilter, setMachineFilter] = useState<string>("all");
  const [operatorFilter, setOperatorFilter] = useState<string>("all");
  const [operationFilter, setOperationFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [activeQcForm, setActiveQcForm] = useState<string | null>(null);
  const [qcGates, setQcGates] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    loadQCGates();
  }, [woId]);

  const loadQCGates = async () => {
    try {
      const { data, error } = await supabase
        .from('qc_records')
        .select('*')
        .eq('wo_id', woId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setQcGates(data || []);
    } catch (error) {
      console.error('Error loading QC gates:', error);
    }
  };

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

  // Separate pending from completed gates
  const pendingGates = qcGates.filter(g => g.result === 'pending');
  const completedGates = qcGates.filter(g => g.result !== 'pending');

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

  // Calculate summary stats
  const totalChecks = records.length;
  const passedChecks = records.filter(r => r.status === 'pass').length;
  const failedChecks = records.filter(r => r.status === 'fail').length;
  const passRate = totalChecks > 0 ? Math.round((passedChecks / totalChecks) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* SECTION 1: QC Gate Controls - Status & Actions */}
      <QCGateControls 
        woId={workOrder.id}
        materialQC={{
          status: workOrder.qc_material_status || 'pending',
          approvedAt: workOrder.qc_material_approved_at,
          approvedBy: workOrder.qc_material_approved_by,
          remarks: workOrder.qc_material_remarks
        }}
        firstPieceQC={{
          status: workOrder.qc_first_piece_status || 'pending',
          approvedAt: workOrder.qc_first_piece_approved_at,
          approvedBy: workOrder.qc_first_piece_approved_by,
          remarks: workOrder.qc_first_piece_remarks
        }}
        onUpdate={onUpdate}
      />

      {/* SECTION 2: Pending QC Actions (if any) */}
      {pendingGates.length > 0 && (
        <Card className="border-warning/50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="h-4 w-4 text-warning" />
              Pending QC Checks
            </CardTitle>
            <CardDescription>
              These inspections require action
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {pendingGates.map(gate => (
              <div key={gate.id}>
                {activeQcForm === gate.id ? (
                  <QCInspectionForm
                    workOrderId={woId}
                    itemCode={workOrder?.item_code || ''}
                    revision={workOrder?.revision || '0'}
                    qcRecordId={gate.id}
                    qcType={gate.qc_type}
                    onComplete={() => {
                      setActiveQcForm(null);
                      loadQCGates();
                      onUpdate?.();
                    }}
                  />
                ) : (
                  <div className="flex items-center justify-between p-4 border rounded-lg bg-warning/5 border-warning/30">
                    <div className="space-y-1">
                      <div className="font-medium">{gate.qc_id}</div>
                      <div className="text-sm text-muted-foreground">
                        Type: {gate.qc_type?.replace('_', ' ').toUpperCase()}
                      </div>
                    </div>
                    <Button onClick={() => setActiveQcForm(gate.id)}>
                      Start Inspection
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* SECTION 3: Completed QC Evidence */}
      {completedGates.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ClipboardCheck className="h-4 w-4" />
              Completed Inspections
            </CardTitle>
            <CardDescription>
              Historical QC records for this work order
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {completedGates.map(gate => (
              <div 
                key={gate.id} 
                className={`flex items-center justify-between p-3 border rounded-lg ${
                  gate.result === 'pass' ? 'bg-success/5 border-success/20' : 'bg-destructive/5 border-destructive/20'
                }`}
              >
                <div className="space-y-0.5">
                  <div className="font-medium text-sm">{gate.qc_id}</div>
                  <div className="text-xs text-muted-foreground">
                    {gate.qc_type?.replace('_', ' ').toUpperCase()} • {new Date(gate.created_at).toLocaleString()}
                  </div>
                </div>
                <Badge variant={gate.result === 'pass' ? 'default' : 'destructive'}>
                  {gate.result?.toUpperCase()}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* SECTION 4: Hourly QC History (Collapsible) */}
      <Collapsible open={showHistory} onOpenChange={setShowHistory}>
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <History className="h-4 w-4" />
                  Hourly QC Records
                  {totalChecks > 0 && (
                    <Badge variant="secondary" className="ml-2">
                      {totalChecks} checks • {passRate}% pass rate
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription>
                  In-process dimensional QC checks
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                {records.length > 0 && (
                  <Button variant="outline" size="sm" onClick={exportToExcel}>
                    <FileSpreadsheet className="h-4 w-4 mr-2" />
                    Export
                  </Button>
                )}
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm">
                    {showHistory ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </Button>
                </CollapsibleTrigger>
              </div>
            </div>
          </CardHeader>

          <CollapsibleContent>
            <Separator />
            <CardContent className="pt-4">
              {/* Filters */}
              {records.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  <Select value={machineFilter} onValueChange={setMachineFilter}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Machine" />
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
                  <Select value={operatorFilter} onValueChange={setOperatorFilter}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Operator" />
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
                  <Select value={operationFilter} onValueChange={setOperationFilter}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Operation" />
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
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="pass">Pass Only</SelectItem>
                      <SelectItem value="fail">Fail Only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Records */}
              {filteredRecords.length === 0 ? (
                <p className="text-center text-muted-foreground py-8 text-sm">
                  No hourly QC records found
                </p>
              ) : (
                <div className="space-y-3">
                  {filteredRecords.slice(0, 10).map((record) => (
                    <div
                      key={record.id}
                      className={`p-3 border rounded-lg text-sm ${
                        record.status === "pass" 
                          ? "border-success/30 bg-success/5" 
                          : "border-destructive/30 bg-destructive/5"
                      }`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">
                              Op {record.operation} • {new Date(record.check_datetime).toLocaleString()}
                            </span>
                            <Badge 
                              variant={record.status === "pass" ? "default" : "destructive"}
                              className="text-xs"
                            >
                              {record.status.toUpperCase()}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {record.machines?.machine_id} • {record.profiles?.full_name}
                          </p>
                        </div>
                      </div>

                      {/* Compact dimension display */}
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {Object.entries(record.dimensions || {})
                          .sort(([a], [b]) => parseInt(a) - parseInt(b))
                          .slice(0, 8)
                          .map(([dimNum, value]: [string, any]) => {
                            const isOutOfTolerance = record.out_of_tolerance_dimensions?.includes(dimNum);
                            return (
                              <div
                                key={dimNum}
                                className={`px-2 py-1 rounded text-xs ${
                                  isOutOfTolerance
                                    ? "bg-destructive/20 text-destructive-foreground"
                                    : "bg-success/20 text-success-foreground"
                                }`}
                              >
                                <span className="font-medium">{dimNum}:</span> {value ?? "—"}
                              </div>
                            );
                          })}
                        {Object.keys(record.dimensions || {}).length > 8 && (
                          <div className="px-2 py-1 rounded text-xs bg-muted">
                            +{Object.keys(record.dimensions).length - 8} more
                          </div>
                        )}
                      </div>

                      {/* Binary checks - compact */}
                      <div className="flex gap-2 text-xs">
                        {record.thread_status && (
                          <span className={record.thread_status === "OK" ? "text-success" : "text-destructive"}>
                            Thread: {record.thread_status}
                          </span>
                        )}
                        {record.visual_status && (
                          <span className={record.visual_status === "OK" ? "text-success" : "text-destructive"}>
                            Visual: {record.visual_status}
                          </span>
                        )}
                        {record.plating_status && (
                          <span className={record.plating_status === "OK" ? "text-success" : "text-destructive"}>
                            Plating: {record.plating_status}
                          </span>
                        )}
                      </div>

                      {record.out_of_tolerance_dimensions && record.out_of_tolerance_dimensions.length > 0 && (
                        <div className="mt-2 text-xs text-destructive">
                          ⚠ Out of tolerance: {record.out_of_tolerance_dimensions.join(", ")}
                        </div>
                      )}
                    </div>
                  ))}
                  
                  {filteredRecords.length > 10 && (
                    <p className="text-center text-xs text-muted-foreground py-2">
                      Showing 10 of {filteredRecords.length} records
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    </div>
  );
};
