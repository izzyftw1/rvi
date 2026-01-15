import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PageContainer, PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { 
  FileText, Search, ClipboardCheck, CheckCircle, Lock, Shield, 
  AlertTriangle, Package, ArrowRight, Clock, Eye
} from "lucide-react";
import { format } from "date-fns";

interface WorkOrderWithQC {
  id: string;
  wo_number: string | null;
  display_id: string | null;
  customer: string | null;
  item_code: string | null;
  quantity: number | null;
  status: string;
  current_stage: string | null;
  qc_check_count: number;
  quality_released: boolean;
  final_qc_result: string | null;
}

const FinalQCList = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [workOrders, setWorkOrders] = useState<WorkOrderWithQC[]>([]);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const { data: woData, error: woError } = await supabase
        .from("work_orders")
        .select(
          "id, wo_number, display_id, customer, item_code, quantity, status, current_stage, quality_released, final_qc_result"
        )
        .in("current_stage", ["production", "qc", "packing", "dispatch"])
        .order("updated_at", { ascending: false })
        .limit(200);

      if (woError) throw woError;

      const woIds = (woData || []).map((wo) => wo.id);

      const { data: qcCounts, error: qcError } = await supabase
        .from("hourly_qc_checks")
        .select("wo_id")
        .in("wo_id", woIds.length > 0 ? woIds : ["00000000-0000-0000-0000-000000000000"]);

      if (qcError) throw qcError;

      const qcCountMap: Record<string, number> = {};
      (qcCounts || []).forEach((qc: any) => {
        qcCountMap[qc.wo_id] = (qcCountMap[qc.wo_id] || 0) + 1;
      });

      const pendingOkQtyMap: Record<string, number> = {};
      const releasedQtyMap: Record<string, number> = {};

      const { data: batchData, error: batchError } = await supabase
        .from("production_batches")
        .select(
          "wo_id, production_complete, produced_qty, qc_rejected_qty, qc_approved_qty, qc_final_status"
        )
        .in("wo_id", woIds.length > 0 ? woIds : ["00000000-0000-0000-0000-000000000000"]);

      if (batchError) throw batchError;

      (batchData || []).forEach((b: any) => {
        const woId = b.wo_id as string | null;
        if (!woId) return;
        if (!b.production_complete) return;

        const produced = b.produced_qty || 0;
        const rejected = b.qc_rejected_qty || 0;
        const okQty = Math.max(0, produced - rejected);
        const status = String(b.qc_final_status || "pending").toLowerCase();

        if (["passed", "waived"].includes(status)) {
          const approved = b.qc_approved_qty ?? okQty;
          releasedQtyMap[woId] = (releasedQtyMap[woId] || 0) + Math.max(0, approved || 0);
        } else {
          pendingOkQtyMap[woId] = (pendingOkQtyMap[woId] || 0) + okQty;
        }
      });

      const result: WorkOrderWithQC[] = (woData || [])
        .map((wo: any) => {
          const pendingQty = pendingOkQtyMap[wo.id] || 0;
          const releasedQty = releasedQtyMap[wo.id] || 0;
          const displayQty = wo.quality_released ? releasedQty : pendingQty;

          return {
            ...wo,
            quantity: displayQty,
            qc_check_count: qcCountMap[wo.id] || 0,
          };
        })
        .filter((wo) => wo.quality_released || (wo.quantity || 0) > 0);

      const stagePriority: Record<string, number> = {
        qc: 1,
        production: 2,
        packing: 3,
        dispatch: 4,
      };

      result.sort((a, b) => {
        const priorityA = stagePriority[a.current_stage || ""] || 99;
        const priorityB = stagePriority[b.current_stage || ""] || 99;
        if (priorityA !== priorityB) return priorityA - priorityB;
        return b.qc_check_count - a.qc_check_count;
      });

      setWorkOrders(result);
    } catch (error: any) {
      console.error("Error loading data:", error);
      toast.error("Failed to load work orders");
    } finally {
      setLoading(false);
    }
  };

  const filteredWorkOrders = workOrders.filter((wo) => {
    const search = searchTerm.toLowerCase();
    return (
      (wo.display_id?.toLowerCase() || "").includes(search) ||
      (wo.wo_number?.toLowerCase() || "").includes(search) ||
      (wo.customer?.toLowerCase() || "").includes(search) ||
      (wo.item_code?.toLowerCase() || "").includes(search)
    );
  });

  // Separate released and pending
  const releasedOrders = filteredWorkOrders.filter(wo => wo.quality_released);
  const pendingOrders = filteredWorkOrders.filter(wo => !wo.quality_released);

  const getStageConfig = (stage: string | null) => {
    switch (stage) {
      case "production": return { color: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20", label: "Production" };
      case "qc": return { color: "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20", label: "QC" };
      case "packing": return { color: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-500/20", label: "Packing" };
      case "dispatch": return { color: "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20", label: "Dispatch" };
      default: return { color: "bg-muted text-muted-foreground", label: stage || "Unknown" };
    }
  };

  const renderWorkOrderCard = (wo: WorkOrderWithQC, isReleased: boolean) => {
    const stageConfig = getStageConfig(wo.current_stage);
    
    return (
      <Card 
        key={wo.id} 
        className={`group hover:shadow-md transition-all cursor-pointer ${
          isReleased 
            ? "bg-green-50/50 dark:bg-green-950/20 border-green-200 dark:border-green-900" 
            : "hover:border-primary/40"
        }`}
        onClick={() => navigate(`/dispatch-qc/${wo.id}`)}
      >
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-4">
            {/* Left: WO Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-semibold text-lg">{wo.display_id || wo.wo_number}</span>
                <Badge className={`${stageConfig.color} border`}>
                  {stageConfig.label}
                </Badge>
              </div>
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{wo.customer || "—"}</span>
                <span className="text-muted-foreground/60">•</span>
                <span>{wo.item_code || "—"}</span>
              </div>
            </div>

            {/* Middle: Stats */}
            <div className="flex items-center gap-6">
              {/* Eligible Qty */}
              <div className="text-center">
                <div className="flex items-center gap-1.5">
                  <Package className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xl font-bold">{wo.quantity?.toLocaleString() || "0"}</span>
                </div>
                <span className="text-xs text-muted-foreground">Eligible</span>
              </div>

              {/* QC Checks */}
              <div className="text-center">
                <div className="flex items-center gap-1.5">
                  <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xl font-bold">{wo.qc_check_count}</span>
                </div>
                <span className="text-xs text-muted-foreground">QC Checks</span>
              </div>

              {/* Status */}
              <div className="w-28">
                {isReleased ? (
                  <Badge className="bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 w-full justify-center py-1.5 gap-1.5">
                    <Lock className="h-3.5 w-3.5" />
                    Released
                  </Badge>
                ) : wo.final_qc_result === 'blocked' ? (
                  <Badge className="bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 w-full justify-center py-1.5 gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Blocked
                  </Badge>
                ) : (
                  <Badge variant="outline" className="w-full justify-center py-1.5 gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    Pending
                  </Badge>
                )}
              </div>
            </div>

            {/* Right: Action */}
            <Button 
              size="sm" 
              variant={isReleased ? "ghost" : "default"}
              className="gap-2"
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/dispatch-qc/${wo.id}`);
              }}
            >
              {isReleased ? (
                <>
                  <Eye className="h-4 w-4" />
                  View
                </>
              ) : (
                <>
                  <Shield className="h-4 w-4" />
                  Inspect
                  <ArrowRight className="h-4 w-4 opacity-50" />
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <PageContainer>
      <PageHeader
        title="Dispatch QC"
        description="Quality release work orders for packing and dispatch"
        icon={<ClipboardCheck className="h-6 w-6" />}
      />

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card className="bg-gradient-to-br from-background to-muted/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Package className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{filteredWorkOrders.length}</p>
                <p className="text-xs text-muted-foreground">Total Work Orders</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-background to-amber-500/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10">
                <Clock className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{pendingOrders.length}</p>
                <p className="text-xs text-muted-foreground">Pending Inspection</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-background to-green-500/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <CheckCircle className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{releasedOrders.length}</p>
                <p className="text-xs text-muted-foreground">Released</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-background to-purple-500/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-500/10">
                <ClipboardCheck className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {filteredWorkOrders.reduce((sum, wo) => sum + wo.qc_check_count, 0)}
                </p>
                <p className="text-xs text-muted-foreground">Total QC Checks</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by WO number, customer, or item code..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Work Orders List */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-16 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredWorkOrders.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <ClipboardCheck className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="font-medium">No work orders ready for Dispatch QC</p>
            <p className="text-sm mt-1">Work orders must have production data before dispatch inspection.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Pending Inspection Section */}
          {pendingOrders.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Shield className="h-5 w-5 text-primary" />
                <h2 className="font-semibold text-lg">Pending Inspection</h2>
                <Badge variant="secondary">{pendingOrders.length}</Badge>
              </div>
              <div className="space-y-3">
                {pendingOrders.map((wo) => renderWorkOrderCard(wo, false))}
              </div>
            </div>
          )}

          {/* Released Section */}
          {releasedOrders.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle className="h-5 w-5 text-green-500" />
                <h2 className="font-semibold text-lg">Released</h2>
                <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                  {releasedOrders.length}
                </Badge>
              </div>
              <div className="space-y-3">
                {releasedOrders.map((wo) => renderWorkOrderCard(wo, true))}
              </div>
            </div>
          )}
        </div>
      )}
    </PageContainer>
  );
};

export default FinalQCList;