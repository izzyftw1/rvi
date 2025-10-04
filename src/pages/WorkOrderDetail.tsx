import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/StatusBadge";
import { QCRecordsTab } from "@/components/QCRecordsTab";
import { CheckCircle2, Clock, AlertCircle, FileText } from "lucide-react";

const WorkOrderDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [wo, setWo] = useState<any>(null);
  const [routingSteps, setRoutingSteps] = useState<any[]>([]);
  const [materialIssues, setMaterialIssues] = useState<any[]>([]);
  const [qcRecords, setQcRecords] = useState<any[]>([]);
  const [hourlyQcRecords, setHourlyQcRecords] = useState<any[]>([]);
  const [scanEvents, setScanEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadWorkOrderData();
  }, [id]);

  const loadWorkOrderData = async () => {
    try {
      // Load WO
      const { data: woData } = await supabase
        .from("work_orders")
        .select("*")
        .eq("id", id)
        .single();

      setWo(woData);

      // Load routing steps
      const { data: stepsData } = await supabase
        .from("routing_steps")
        .select("*, departments(name)")
        .eq("wo_id", id)
        .order("step_number");

      setRoutingSteps(stepsData || []);

      // Load material issues
      const { data: issuesData } = await supabase
        .from("wo_material_issues")
        .select("*, material_lots(lot_id, heat_no, alloy)")
        .eq("wo_id", id);

      setMaterialIssues(issuesData || []);

      // Load QC records
      const { data: qcData } = await supabase
        .from("qc_records")
        .select("*")
        .eq("wo_id", id)
        .order("created_at", { ascending: false });

      setQcRecords(qcData || []);

      // Load hourly QC records (fetch base rows first)
      const { data: hourlyChecks, error: hourlyErr } = await supabase
        .from("hourly_qc_checks")
        .select("*")
        .eq("wo_id", id)
        .order("check_datetime", { ascending: false });

      if (hourlyErr || !hourlyChecks) {
        setHourlyQcRecords([]);
      } else {
        // Enrich with machine and operator names without relying on FKs
        const { data: allMachines } = await supabase
          .from("machines")
          .select("id, machine_id, name");
        const machinesMap: Record<string, { machine_id: string; name: string }> = {};
        (allMachines || []).forEach((m: any) => {
          machinesMap[m.id] = { machine_id: m.machine_id, name: m.name };
        });

        const operatorIds = Array.from(
          new Set((hourlyChecks || []).map((c: any) => c.operator_id).filter(Boolean))
        );
        let profilesMap: Record<string, { full_name: string }> = {};
        if (operatorIds.length > 0) {
          const { data: profileRows } = await supabase
            .from("profiles")
            .select("id, full_name")
            .in("id", operatorIds as string[]);
          (profileRows || []).forEach((p: any) => {
            profilesMap[p.id] = { full_name: p.full_name };
          });
        }

        const enriched = (hourlyChecks || []).map((c: any) => ({
          ...c,
          machines: c.machine_id ? machinesMap[c.machine_id] : undefined,
          profiles: c.operator_id ? profilesMap[c.operator_id] : undefined,
        }));

        setHourlyQcRecords(enriched);
      }

      // Load scan events
      const { data: eventsData } = await supabase
        .from("scan_events")
        .select("*, profiles(full_name)")
        .eq("entity_id", woData?.wo_id)
        .order("scan_date_time", { ascending: false });

      setScanEvents(eventsData || []);
    } catch (error) {
      console.error("Error loading WO data:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  if (!wo) {
    return <div className="flex items-center justify-center min-h-screen">Work Order not found</div>;
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={() => navigate("/work-orders")}>
            ← Back
          </Button>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{wo.wo_id}</h1>
              <StatusBadge status={wo.status} />
            </div>
            <p className="text-sm text-muted-foreground">
              {wo.customer} • {wo.item_code}
            </p>
          </div>
          {hourlyQcRecords.length > 0 && (
            <Button onClick={() => navigate(`/dispatch-qc-report/${id}`)}>
              <FileText className="h-4 w-4 mr-2" />
              Final QC Report
            </Button>
          )}
        </div>

        {/* Summary */}
        <Card>
          <CardHeader>
            <CardTitle>Order Details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Quantity</p>
                <p className="text-lg font-bold">{wo.quantity} pcs</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Due Date</p>
                <p className="text-lg font-bold">
                  {new Date(wo.due_date).toLocaleDateString()}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Priority</p>
                <Badge variant={wo.priority <= 2 ? "destructive" : "secondary"} className="text-lg">
                  P{wo.priority}
                </Badge>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Sales Order</p>
                <p className="text-lg font-bold">{wo.sales_order || "—"}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tabs */}
        <Tabs defaultValue="routing" className="w-full">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="routing">Routing</TabsTrigger>
            <TabsTrigger value="materials">Materials</TabsTrigger>
            <TabsTrigger value="qc">QC Records</TabsTrigger>
            <TabsTrigger value="hourly-qc">Hourly QC</TabsTrigger>
            <TabsTrigger value="genealogy">Genealogy</TabsTrigger>
          </TabsList>

          <TabsContent value="routing" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Routing Timeline</CardTitle>
              </CardHeader>
              <CardContent>
                {routingSteps.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    No routing steps defined
                  </p>
                ) : (
                  <div className="space-y-4">
                    {routingSteps.map((step, index) => (
                      <div key={step.id} className="flex items-start gap-4">
                        <div className="flex flex-col items-center">
                          <div
                            className={`w-8 h-8 rounded-full flex items-center justify-center ${
                              step.status === "completed"
                                ? "bg-success text-success-foreground"
                                : step.status === "in_progress"
                                ? "bg-warning text-warning-foreground"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {step.status === "completed" ? (
                              <CheckCircle2 className="h-4 w-4" />
                            ) : step.status === "in_progress" ? (
                              <Clock className="h-4 w-4" />
                            ) : (
                              <span className="text-xs">{index + 1}</span>
                            )}
                          </div>
                          {index < routingSteps.length - 1 && (
                            <div className="w-0.5 h-12 bg-border" />
                          )}
                        </div>
                        <div className="flex-1 pb-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium">{step.name}</p>
                              <p className="text-sm text-muted-foreground">
                                {step.departments?.name || "Unassigned"}
                              </p>
                            </div>
                            <Badge variant="outline">{step.status}</Badge>
                          </div>
                          {step.actual_start && (
                            <p className="text-xs text-muted-foreground mt-2">
                              Started: {new Date(step.actual_start).toLocaleString()}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="materials" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Material Issues</CardTitle>
              </CardHeader>
              <CardContent>
                {materialIssues.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    No materials issued yet
                  </p>
                ) : (
                  <div className="space-y-3">
                    {materialIssues.map((issue: any) => (
                      <div
                        key={issue.id}
                        className="flex items-center justify-between p-3 bg-secondary rounded-lg"
                      >
                        <div>
                          <p className="font-medium">
                            {issue.material_lots?.lot_id || "Unknown Lot"}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Heat: {issue.material_lots?.heat_no} • {issue.material_lots?.alloy}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-medium">
                            {issue.quantity_kg} {issue.uom}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(issue.issued_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="qc" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>QC Records</CardTitle>
              </CardHeader>
              <CardContent>
                {qcRecords.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    No QC records yet
                  </p>
                ) : (
                  <div className="space-y-3">
                    {qcRecords.map((qc) => (
                      <div
                        key={qc.id}
                        className="flex items-start justify-between p-4 border rounded-lg"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{qc.qc_id}</p>
                            <Badge variant="outline">{qc.qc_type.replace("_", " ")}</Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {new Date(qc.qc_date_time).toLocaleString()}
                          </p>
                          {qc.remarks && (
                            <p className="text-sm mt-2">{qc.remarks}</p>
                          )}
                        </div>
                        <Badge
                          variant={
                            qc.result === "pass"
                              ? "default"
                              : qc.result === "fail"
                              ? "destructive"
                              : "secondary"
                          }
                          className={
                            qc.result === "pass"
                              ? "bg-success"
                              : ""
                          }
                        >
                          {qc.result.toUpperCase()}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="hourly-qc" className="space-y-4">
            <QCRecordsTab records={hourlyQcRecords} woId={wo.wo_id} />
          </TabsContent>

          <TabsContent value="genealogy" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Traceability & Genealogy</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* Material Traceability */}
                  <div>
                    <h4 className="font-medium mb-2">Material Trace</h4>
                    {materialIssues.map((issue: any) => (
                      <div key={issue.id} className="ml-4 border-l-2 border-primary pl-4 py-2">
                        <p className="text-sm">
                          <span className="font-medium">Lot:</span> {issue.material_lots?.lot_id}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Heat No: {issue.material_lots?.heat_no}
                        </p>
                      </div>
                    ))}
                  </div>

                  {/* Scan History */}
                  <div>
                    <h4 className="font-medium mb-2">Movement History</h4>
                    <div className="space-y-2">
                      {scanEvents.map((event: any) => (
                        <div
                          key={event.id}
                          className="flex items-center justify-between text-sm p-2 bg-secondary rounded"
                        >
                          <div>
                            <p className="font-medium">→ {event.to_stage}</p>
                            <p className="text-xs text-muted-foreground">
                              {event.profiles?.full_name || "Unknown"}
                            </p>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {new Date(event.scan_date_time).toLocaleString()}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default WorkOrderDetail;
