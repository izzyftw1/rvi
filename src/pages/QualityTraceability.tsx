import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import {
  Search,
  FileText,
  Package,
  Factory,
  ClipboardCheck,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Lock,
  Clock,
  User,
  Wrench,
  Beaker,
  Shield,
  Truck,
  Calendar,
  Hash
} from "lucide-react";

interface TraceabilityData {
  workOrder: any;
  materialQC: any[];
  productionLogs: any[];
  ipqcRecords: any[];
  ncrs: any[];
  finalQCResult: any;
  materials: any[];
  isReleased: boolean;
  isFrozen: boolean;
}

export default function QualityTraceability() {
  const { toast } = useToast();
  const [searchType, setSearchType] = useState<string>("work_order");
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [shiftFilter, setShiftFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [traceData, setTraceData] = useState<TraceabilityData | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchTerm.trim()) return;

    setLoading(true);
    setTraceData(null);

    try {
      let workOrderId: string | null = null;
      let workOrder: any = null;

      // First, find the work order based on search type
      switch (searchType) {
        case "work_order":
          const { data: woData } = await supabase
            .from("work_orders")
            .select("*")
            .or(`display_id.ilike.%${searchTerm}%,wo_id.eq.${searchTerm}`)
            .maybeSingle();
          workOrder = woData;
          workOrderId = woData?.id;
          break;

        case "item_code":
          const { data: itemWo } = await supabase
            .from("work_orders")
            .select("*")
            .ilike("item_code", `%${searchTerm}%`)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          workOrder = itemWo;
          workOrderId = itemWo?.id;
          break;

        case "heat_lot":
          // Search material lots first
          const { data: lotData } = await supabase
            .from("material_lots")
            .select("id, lot_id, heat_no")
            .or(`heat_no.ilike.%${searchTerm}%,lot_id.ilike.%${searchTerm}%`)
            .limit(1)
            .maybeSingle();

          if (lotData) {
            // Find work order that used this lot
            const { data: issueData } = await supabase
              .from("wo_material_issues")
              .select("wo_id")
              .eq("lot_id", lotData.id)
              .limit(1)
              .maybeSingle();

            if (issueData) {
              const { data: woFromLot } = await supabase
                .from("work_orders")
                .select("*")
                .eq("id", issueData.wo_id)
                .maybeSingle();
              workOrder = woFromLot;
              workOrderId = woFromLot?.id;
            }
          }
          break;

        case "machine":
          // Search production logs by machine
          const { data: machineData } = await supabase
            .from("machines")
            .select("id, machine_id, name")
            .or(`machine_id.ilike.%${searchTerm}%,name.ilike.%${searchTerm}%`)
            .limit(1)
            .maybeSingle();

          if (machineData) {
            let query = supabase
              .from("daily_production_logs")
              .select("wo_id")
              .eq("machine_id", machineData.id)
              .not("wo_id", "is", null);

            if (dateFilter) {
              query = query.eq("log_date", dateFilter);
            }
            if (shiftFilter) {
              query = query.eq("shift", shiftFilter);
            }

            const { data: logData } = await query.limit(1).maybeSingle();

            if (logData?.wo_id) {
              const { data: woFromMachine } = await supabase
                .from("work_orders")
                .select("*")
                .eq("id", logData.wo_id)
                .maybeSingle();
              workOrder = woFromMachine;
              workOrderId = woFromMachine?.id;
            }
          }
          break;

        case "date_shift":
          // Search by date and optionally shift
          let dateQuery = supabase
            .from("daily_production_logs")
            .select("wo_id")
            .eq("log_date", searchTerm)
            .not("wo_id", "is", null);

          if (shiftFilter) {
            dateQuery = dateQuery.eq("shift", shiftFilter);
          }

          const { data: dateLogData } = await dateQuery.limit(1).maybeSingle();

          if (dateLogData?.wo_id) {
            const { data: woFromDate } = await supabase
              .from("work_orders")
              .select("*")
              .eq("id", dateLogData.wo_id)
              .maybeSingle();
            workOrder = woFromDate;
            workOrderId = woFromDate?.id;
          }
          break;
      }

      if (!workOrderId || !workOrder) {
        toast({
          variant: "destructive",
          title: "Not Found",
          description: "No traceability data found for the given search criteria"
        });
        setLoading(false);
        return;
      }

      // Load full traceability data
      const [
        materialQCRes,
        productionLogsRes,
        ipqcRes,
        ncrsRes,
        materialsRes
      ] = await Promise.all([
        // Material QC (Incoming QC)
        supabase
          .from("qc_records")
          .select("*")
          .eq("qc_type", "incoming")
          .not("lot_id", "is", null),

        // Production Logs
        supabase
          .from("daily_production_logs")
          .select("*")
          .eq("wo_id", workOrderId)
          .order("log_date", { ascending: true }),

        // IPQC Records (Hourly QC)
        supabase
          .from("hourly_qc_checks")
          .select("*")
          .eq("wo_id", workOrderId)
          .order("check_datetime", { ascending: true }),

        // NCRs
        supabase
          .from("ncrs")
          .select("*")
          .eq("work_order_id", workOrderId)
          .order("created_at", { ascending: true }),

        // Material Issues
        supabase
          .from("wo_material_issues")
          .select("*")
          .eq("wo_id", workOrderId)
      ]);

      // Get material lots for context
      const materialLotIds = materialsRes.data?.map(m => m.lot_id).filter(Boolean) || [];
      let materialLotsMap: Record<string, any> = {};
      if (materialLotIds.length > 0) {
        const { data: lots } = await supabase
          .from("material_lots")
          .select("id, lot_id, heat_no, alloy, supplier, qc_status")
          .in("id", materialLotIds);
        (lots || []).forEach(lot => {
          materialLotsMap[lot.id] = lot;
        });
      }

      // Get machines for production logs and IPQC
      const machineIds = [
        ...new Set([
          ...(productionLogsRes.data || []).map(l => l.machine_id),
          ...(ipqcRes.data || []).map(q => q.machine_id)
        ].filter(Boolean))
      ];
      let machinesMap: Record<string, any> = {};
      if (machineIds.length > 0) {
        const { data: machines } = await supabase
          .from("machines")
          .select("id, machine_id, name")
          .in("id", machineIds);
        (machines || []).forEach(m => {
          machinesMap[m.id] = m;
        });
      }

      // Get operators from people table
      const operatorIds = [...new Set((productionLogsRes.data || []).map(l => l.operator_id).filter(Boolean))];
      let operatorsMap: Record<string, any> = {};
      if (operatorIds.length > 0) {
        const { data: operators } = await supabase
          .from("people")
          .select("id, full_name")
          .in("id", operatorIds);
        (operators || []).forEach((o: any) => {
          operatorsMap[o.id] = { id: o.id, name: o.full_name };
        });
      }

      // Get material QC for the lots used in this WO
      let materialQC: any[] = [];
      if (materialLotIds.length > 0) {
        // @ts-ignore - avoiding deep type instantiation
        const { data: qcForLots } = await supabase
          .from("qc_records")
          .select("id, qc_id, qc_type, result, qc_date_time, lot_id, remarks")
          .in("lot_id", materialLotIds);
        materialQC = qcForLots || [];
      }

      // Enrich production logs with machine/operator data
      const enrichedProductionLogs = (productionLogsRes.data || []).map((log: any) => ({
        ...log,
        machines: machinesMap[log.machine_id] || null,
        operators: operatorsMap[log.operator_id] || null
      }));

      // Enrich IPQC with machine data
      const enrichedIPQC = (ipqcRes.data || []).map((qc: any) => ({
        ...qc,
        machines: machinesMap[qc.machine_id] || null
      }));

      // Enrich materials with lot data
      const enrichedMaterials = (materialsRes.data || []).map((m: any) => ({
        ...m,
        material_lots: materialLotsMap[m.lot_id] || null
      }));

      setTraceData({
        workOrder,
        materialQC,
        productionLogs: enrichedProductionLogs,
        ipqcRecords: enrichedIPQC,
        ncrs: (ncrsRes.data || []) as any[],
        finalQCResult: {
          result: workOrder.final_qc_result,
          samplingPlan: workOrder.sampling_plan_reference,
          releasedAt: workOrder.quality_released_at,
          releasedBy: workOrder.quality_released_by
        },
        materials: enrichedMaterials,
        isReleased: workOrder.quality_released === true,
        isFrozen: workOrder.traceability_frozen === true
      });

    } catch (error) {
      console.error("Traceability search error:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load traceability data"
      });
    } finally {
      setLoading(false);
    }
  };

  const formatDateTime = (dateStr: string | null) => {
    if (!dateStr) return "-";
    try {
      return format(new Date(dateStr), "dd MMM yyyy HH:mm");
    } catch {
      return dateStr;
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "-";
    try {
      return format(new Date(dateStr), "dd MMM yyyy");
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Quality Traceability</h1>
            <p className="text-muted-foreground">
              Audit-ready traceability for customer packs and compliance
            </p>
          </div>
          <Shield className="h-10 w-10 text-primary" />
        </div>

        {/* Search Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Traceability Lookup
            </CardTitle>
            <CardDescription>
              Search by Work Order, Item, Material Heat/Lot, Machine, or Date/Shift
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSearch} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Select value={searchType} onValueChange={setSearchType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Search by..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="work_order">Work Order</SelectItem>
                    <SelectItem value="item_code">Item Code</SelectItem>
                    <SelectItem value="heat_lot">Heat No / Lot ID</SelectItem>
                    <SelectItem value="machine">Machine</SelectItem>
                    <SelectItem value="date_shift">Date</SelectItem>
                  </SelectContent>
                </Select>

                {searchType === "date_shift" ? (
                  <Input
                    type="date"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    required
                  />
                ) : (
                  <Input
                    placeholder={
                      searchType === "work_order" ? "Enter WO ID or Display ID" :
                      searchType === "item_code" ? "Enter Item Code" :
                      searchType === "heat_lot" ? "Enter Heat No or Lot ID" :
                      searchType === "machine" ? "Enter Machine ID or Name" :
                      "Enter search term"
                    }
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    required
                  />
                )}

                {(searchType === "machine" || searchType === "date_shift") && (
                  <>
                    {searchType === "machine" && (
                      <Input
                        type="date"
                        value={dateFilter}
                        onChange={(e) => setDateFilter(e.target.value)}
                        placeholder="Optional: Date filter"
                      />
                    )}
                    <Select value={shiftFilter} onValueChange={setShiftFilter}>
                      <SelectTrigger>
                        <SelectValue placeholder="Shift (optional)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Shifts</SelectItem>
                        <SelectItem value="Day">Day</SelectItem>
                        <SelectItem value="Night">Night</SelectItem>
                      </SelectContent>
                    </Select>
                  </>
                )}

                <Button type="submit" disabled={loading} className="md:col-span-1">
                  <Search className="mr-2 h-4 w-4" />
                  {loading ? "Searching..." : "Search"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Traceability Results */}
        {traceData && (
          <div className="space-y-6">
            {/* Status Banner */}
            <Alert className={traceData.isFrozen ? "border-amber-500 bg-amber-500/10" : "border-muted"}>
              {traceData.isFrozen ? (
                <Lock className="h-4 w-4 text-amber-500" />
              ) : (
                <FileText className="h-4 w-4" />
              )}
              <AlertTitle className="flex items-center gap-2">
                {traceData.isFrozen ? "Traceability Frozen" : "Active Traceability Record"}
                {traceData.isReleased && (
                  <Badge variant="default" className="bg-green-600">
                    <CheckCircle2 className="mr-1 h-3 w-3" />
                    Quality Released
                  </Badge>
                )}
              </AlertTitle>
              <AlertDescription>
                {traceData.isFrozen
                  ? "This record is immutable. Data was frozen upon Final QC release."
                  : "This traceability record is still being compiled as production continues."}
              </AlertDescription>
            </Alert>

            {/* Work Order Summary */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Work Order: {traceData.workOrder.display_id || traceData.workOrder.wo_id}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Customer</p>
                    <p className="font-medium">{traceData.workOrder.customer || "-"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Item Code</p>
                    <p className="font-medium">{traceData.workOrder.item_code || "-"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Quantity</p>
                    <p className="font-medium">{traceData.workOrder.quantity?.toLocaleString()} pcs</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Status</p>
                    <Badge variant="outline">{traceData.workOrder.status}</Badge>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Due Date</p>
                    <p className="font-medium">{formatDate(traceData.workOrder.due_date)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Material Size</p>
                    <p className="font-medium">{traceData.workOrder.material_size_mm || "-"} mm</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Revision</p>
                    <p className="font-medium">{traceData.workOrder.revision || "-"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Customer PO</p>
                    <p className="font-medium">{traceData.workOrder.customer_po || "-"}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Tabbed Genealogy */}
            <Tabs defaultValue="materials" className="w-full">
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="materials" className="gap-1">
                  <Package className="h-4 w-4" />
                  Materials ({traceData.materials.length})
                </TabsTrigger>
                <TabsTrigger value="production" className="gap-1">
                  <Factory className="h-4 w-4" />
                  Production ({traceData.productionLogs.length})
                </TabsTrigger>
                <TabsTrigger value="ipqc" className="gap-1">
                  <ClipboardCheck className="h-4 w-4" />
                  IPQC ({traceData.ipqcRecords.length})
                </TabsTrigger>
                <TabsTrigger value="ncr" className="gap-1">
                  <AlertTriangle className="h-4 w-4" />
                  NCRs ({traceData.ncrs.length})
                </TabsTrigger>
                <TabsTrigger value="final" className="gap-1">
                  <CheckCircle2 className="h-4 w-4" />
                  Final QC
                </TabsTrigger>
              </TabsList>

              {/* Materials & IQC Tab */}
              <TabsContent value="materials" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Incoming Materials & QC</CardTitle>
                    <CardDescription>
                      Material lots issued to this work order with incoming QC status
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {traceData.materials.length === 0 ? (
                      <div className="text-center py-6">
                        <Package className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
                        <p className="text-sm font-medium mb-1">No materials issued yet</p>
                        <p className="text-sm text-muted-foreground">
                          <span className="font-medium">How to populate:</span> Issue materials to this work order from the Material Requirements page.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {traceData.materials.map((mat, idx) => {
                          const qcRecord = traceData.materialQC.find(q => q.lot_id === mat.lot_id);
                          return (
                            <div key={idx} className="border rounded-lg p-4 space-y-2">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <Package className="h-4 w-4 text-primary" />
                                  <span className="font-medium">
                                    Lot: {mat.material_lots?.lot_id || mat.lot_id}
                                  </span>
                                </div>
                                <Badge variant={mat.material_lots?.qc_status === "approved" ? "default" : "secondary"}>
                                  {mat.material_lots?.qc_status || "pending"}
                                </Badge>
                              </div>
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                                <div>
                                  <span className="text-muted-foreground">Heat No:</span>{" "}
                                  <span className="font-medium">{mat.material_lots?.heat_no || "-"}</span>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Alloy:</span>{" "}
                                  <span className="font-medium">{mat.material_lots?.alloy || "-"}</span>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Supplier:</span>{" "}
                                  <span className="font-medium">{mat.material_lots?.supplier || "-"}</span>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Qty Issued:</span>{" "}
                                  <span className="font-medium">
                                    {mat.quantity_kg ? `${mat.quantity_kg} kg` : ""}{" "}
                                    {mat.quantity_pcs ? `/ ${mat.quantity_pcs} pcs` : ""}
                                  </span>
                                </div>
                              </div>
                              {qcRecord && (
                                <div className="mt-2 pt-2 border-t">
                                  <p className="text-sm font-medium flex items-center gap-1">
                                    <Beaker className="h-3 w-3" />
                                    IQC Record
                                  </p>
                                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm mt-1">
                                    <div>
                                      <span className="text-muted-foreground">QC ID:</span>{" "}
                                      <span className="font-medium">{qcRecord.qc_id}</span>
                                    </div>
                                    <div>
                                      <span className="text-muted-foreground">Result:</span>{" "}
                                      <Badge variant={qcRecord.result === "pass" ? "default" : "destructive"} className="ml-1">
                                        {qcRecord.result}
                                      </Badge>
                                    </div>
                                    <div>
                                      <span className="text-muted-foreground">Date:</span>{" "}
                                      <span className="font-medium">{formatDateTime(qcRecord.qc_date_time)}</span>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Production Logs Tab */}
              <TabsContent value="production" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Production Logs</CardTitle>
                    <CardDescription>
                      Machine, setup, operator, and shift information for all production entries
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {traceData.productionLogs.length === 0 ? (
                      <p className="text-muted-foreground text-center py-4">No production logs recorded</p>
                    ) : (
                      <div className="space-y-3">
                        {traceData.productionLogs.map((log, idx) => (
                          <div
                            key={idx}
                            className={`border rounded-lg p-4 space-y-2 ${log.locked ? "bg-muted/50" : ""}`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Factory className="h-4 w-4 text-primary" />
                                <span className="font-medium">
                                  {formatDate(log.log_date)} - {log.shift} Shift
                                </span>
                                {log.locked && (
                                  <Badge variant="outline" className="gap-1">
                                    <Lock className="h-3 w-3" />
                                    Locked
                                  </Badge>
                                )}
                              </div>
                              <Badge variant="secondary">{log.setup_number}</Badge>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-sm">
                              <div className="flex items-center gap-1">
                                <Wrench className="h-3 w-3 text-muted-foreground" />
                                <span className="text-muted-foreground">Machine:</span>{" "}
                                <span className="font-medium">{log.machines?.name || log.machines?.machine_id || "-"}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <User className="h-3 w-3 text-muted-foreground" />
                                <span className="text-muted-foreground">Operator:</span>{" "}
                                <span className="font-medium">{log.operators?.name || "-"}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Produced:</span>{" "}
                                <span className="font-medium">{log.actual_quantity?.toLocaleString() || 0}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">OK Qty:</span>{" "}
                                <span className="font-medium text-green-600">{log.ok_quantity?.toLocaleString() || 0}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Rejected:</span>{" "}
                                <span className="font-medium text-destructive">{log.total_rejection_quantity || 0}</span>
                              </div>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm pt-1">
                              <div>
                                <span className="text-muted-foreground">Runtime:</span>{" "}
                                <span className="font-medium">{log.actual_runtime_minutes} min</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Downtime:</span>{" "}
                                <span className="font-medium">{log.total_downtime_minutes} min</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Efficiency:</span>{" "}
                                <span className="font-medium">{log.efficiency_percentage?.toFixed(1) || 0}%</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Rework:</span>{" "}
                                <span className="font-medium">{log.rework_quantity || 0}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* IPQC Tab */}
              <TabsContent value="ipqc" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>In-Process QC Records (Hourly)</CardTitle>
                    <CardDescription>
                      Dimensional checks and in-process quality records
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {traceData.ipqcRecords.length === 0 ? (
                      <p className="text-muted-foreground text-center py-4">No IPQC records</p>
                    ) : (
                      <div className="space-y-3">
                        {traceData.ipqcRecords.map((qc, idx) => (
                          <div key={idx} className="border rounded-lg p-4 space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <ClipboardCheck className="h-4 w-4 text-primary" />
                                <span className="font-medium">
                                  {formatDateTime(qc.check_datetime)}
                                </span>
                              </div>
                              <Badge variant={qc.status === "pass" ? "default" : "destructive"}>
                                {qc.status}
                              </Badge>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                              <div>
                                <span className="text-muted-foreground">Machine:</span>{" "}
                                <span className="font-medium">{qc.machines?.name || qc.machines?.machine_id || "-"}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Operation:</span>{" "}
                                <span className="font-medium">{qc.operation}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Thread:</span>{" "}
                                <span className="font-medium">{qc.thread_applicable ? qc.thread_status || "N/A" : "N/A"}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Visual:</span>{" "}
                                <span className="font-medium">{qc.visual_applicable ? qc.visual_status || "N/A" : "N/A"}</span>
                              </div>
                            </div>
                            {qc.out_of_tolerance_dimensions && qc.out_of_tolerance_dimensions.length > 0 && (
                              <div className="mt-2 p-2 bg-destructive/10 rounded text-sm">
                                <span className="text-destructive font-medium">Out of Tolerance: </span>
                                {qc.out_of_tolerance_dimensions.join(", ")}
                              </div>
                            )}
                            {qc.remarks && (
                              <div className="text-sm text-muted-foreground italic">
                                Remarks: {qc.remarks}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* NCR Tab */}
              <TabsContent value="ncr" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Non-Conformance Reports</CardTitle>
                    <CardDescription>
                      All NCRs linked to this work order
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {traceData.ncrs.length === 0 ? (
                      <div className="text-center py-8">
                        <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-2" />
                        <p className="text-muted-foreground">No NCRs raised for this work order</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {traceData.ncrs.map((ncr, idx) => (
                          <div key={idx} className="border rounded-lg p-4 space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <AlertTriangle className="h-4 w-4 text-amber-500" />
                                <span className="font-medium">{ncr.ncr_number}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge variant={
                                  ncr.status === "CLOSED" ? "default" :
                                  ncr.status === "OPEN" ? "destructive" : "secondary"
                                }>
                                  {ncr.status}
                                </Badge>
                                <Badge variant="outline">{ncr.ncr_type}</Badge>
                              </div>
                            </div>
                            <p className="text-sm">{ncr.issue_description}</p>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                              <div>
                                <span className="text-muted-foreground">Raised From:</span>{" "}
                                <span className="font-medium capitalize">{ncr.raised_from?.replace("_", " ") || "-"}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Disposition:</span>{" "}
                                <span className="font-medium">{ncr.disposition || "-"}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Quantity:</span>{" "}
                                <span className="font-medium">{ncr.quantity_affected}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Raised:</span>{" "}
                                <span className="font-medium">{formatDateTime(ncr.created_at)}</span>
                              </div>
                            </div>
                            {ncr.root_cause && (
                              <div className="mt-2 p-2 bg-muted rounded text-sm">
                                <span className="font-medium">Root Cause: </span>
                                {ncr.root_cause}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Final QC Tab */}
              <TabsContent value="final" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Final QC Decision & Release Status</CardTitle>
                    <CardDescription>
                      Final inspection result and quality release information
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {!traceData.finalQCResult.result ? (
                      <div className="text-center py-8">
                        <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
                        <p className="text-muted-foreground">Final QC not yet completed</p>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        <div className="flex items-center justify-center gap-4 py-4">
                          {traceData.finalQCResult.result === "pass" ? (
                            <CheckCircle2 className="h-16 w-16 text-green-500" />
                          ) : (
                            <XCircle className="h-16 w-16 text-destructive" />
                          )}
                          <div className="text-center">
                            <h3 className="text-2xl font-bold capitalize">
                              {traceData.finalQCResult.result}
                            </h3>
                            <p className="text-muted-foreground">Final Inspection Result</p>
                          </div>
                        </div>

                        <Separator />

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="p-4 border rounded-lg">
                            <p className="text-sm text-muted-foreground mb-1">Sampling Plan</p>
                            <p className="font-medium">{traceData.finalQCResult.samplingPlan || "Not specified"}</p>
                          </div>
                          <div className="p-4 border rounded-lg">
                            <p className="text-sm text-muted-foreground mb-1">Release Status</p>
                            <div className="flex items-center gap-2">
                              {traceData.isReleased ? (
                                <>
                                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                                  <span className="font-medium text-green-600">Quality Released</span>
                                </>
                              ) : (
                                <>
                                  <Clock className="h-5 w-5 text-amber-500" />
                                  <span className="font-medium text-amber-600">Pending Release</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        {traceData.isReleased && (
                          <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
                            <div className="flex items-center gap-2 mb-2">
                              <Shield className="h-5 w-5 text-green-500" />
                              <span className="font-medium text-green-700">Release Information</span>
                            </div>
                            <div className="grid grid-cols-2 gap-4 text-sm">
                              <div>
                                <span className="text-muted-foreground">Released At:</span>{" "}
                                <span className="font-medium">{formatDateTime(traceData.finalQCResult.releasedAt)}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Traceability Status:</span>{" "}
                                <Badge variant="outline" className="gap-1">
                                  <Lock className="h-3 w-3" />
                                  {traceData.isFrozen ? "Frozen" : "Active"}
                                </Badge>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        )}

        {/* Empty State */}
        {!traceData && !loading && (
          <div className="text-center py-16 text-muted-foreground">
            <Shield className="h-16 w-16 mx-auto mb-4 opacity-50" />
            <p className="text-lg">Enter a search term to view traceability data</p>
            <p className="text-sm">
              This page provides audit-ready traceability for customer packs and compliance requirements
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
