import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Factory, 
  Clock, 
  User, 
  Settings, 
  Target, 
  AlertTriangle,
  TrendingUp,
  XCircle
} from "lucide-react";

interface ProductionLog {
  id: string;
  log_date: string;
  plant: string;
  shift: string;
  setup_number: string;
  shift_start_time: string | null;
  shift_end_time: string | null;
  actual_runtime_minutes: number | null;
  actual_quantity: number | null;
  total_rejection_quantity: number | null;
  ok_quantity: number | null;
  efficiency_percentage: number | null;
  target_quantity: number | null;
  total_downtime_minutes: number | null;
  rejection_dent: number | null;
  rejection_scratch: number | null;
  rejection_forging_mark: number | null;
  rejection_lining: number | null;
  rejection_dimension: number | null;
  rejection_tool_mark: number | null;
  rejection_setting: number | null;
  rejection_previous_setup_fault: number | null;
  rejection_face_not_ok: number | null;
  rejection_material_not_ok: number | null;
  machines: { name: string; machine_id: string } | null;
  operator: { full_name: string } | null;
  programmer: { full_name: string } | null;
}

interface ProductionContextDisplayProps {
  workOrderId: string;
  machineId?: string;
  /** Show compact version for inline use */
  compact?: boolean;
  /** Show rejection breakdown details */
  showRejectionDetails?: boolean;
  /** Custom title for the card */
  title?: string;
  /** Optional date filter - defaults to today */
  filterDate?: Date;
}

/**
 * Read-only display of production context data from Daily Production Logs.
 * Used by QC pages to show production data without allowing edits.
 */
export const ProductionContextDisplay = ({
  workOrderId,
  machineId,
  compact = false,
  showRejectionDetails = false,
  title = "Production Context",
  filterDate,
}: ProductionContextDisplayProps) => {
  const [loading, setLoading] = useState(true);
  const [productionLog, setProductionLog] = useState<ProductionLog | null>(null);

  useEffect(() => {
    loadProductionContext();
  }, [workOrderId, machineId, filterDate]);

  const loadProductionContext = async () => {
    try {
      setLoading(true);

      let query = supabase
        .from("daily_production_logs")
        .select(`
          id,
          log_date,
          plant,
          shift,
          setup_number,
          shift_start_time,
          shift_end_time,
          actual_runtime_minutes,
          actual_quantity,
          total_rejection_quantity,
          ok_quantity,
          efficiency_percentage,
          target_quantity,
          total_downtime_minutes,
          rejection_dent,
          rejection_scratch,
          rejection_forging_mark,
          rejection_lining,
          rejection_dimension,
          rejection_tool_mark,
          rejection_setting,
          rejection_previous_setup_fault,
          rejection_face_not_ok,
          rejection_material_not_ok,
          machines:machine_id(name, machine_id),
          operator:operator_id(full_name),
          programmer:programmer_id(full_name)
        `)
        .eq("wo_id", workOrderId)
        .order("log_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1);

      if (machineId) {
        query = query.eq("machine_id", machineId);
      }

      if (filterDate) {
        const dateStr = filterDate.toISOString().split("T")[0];
        query = query.eq("log_date", dateStr);
      }

      const { data, error } = await query;

      if (error) throw error;
      setProductionLog((data?.[0] as unknown as ProductionLog) || null);
    } catch (error) {
      console.error("Error loading production context:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatMinutes = (minutes: number | null) => {
    if (minutes === null) return "-";
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  const getRejectionBreakdown = () => {
    if (!productionLog) return [];
    const reasons = [
      { key: "rejection_dent", label: "Dent", value: productionLog.rejection_dent },
      { key: "rejection_scratch", label: "Scratch", value: productionLog.rejection_scratch },
      { key: "rejection_forging_mark", label: "Forging Mark", value: productionLog.rejection_forging_mark },
      { key: "rejection_lining", label: "Lining", value: productionLog.rejection_lining },
      { key: "rejection_dimension", label: "Dimension", value: productionLog.rejection_dimension },
      { key: "rejection_tool_mark", label: "Tool Mark", value: productionLog.rejection_tool_mark },
      { key: "rejection_setting", label: "Setting", value: productionLog.rejection_setting },
      { key: "rejection_previous_setup_fault", label: "Prev Setup", value: productionLog.rejection_previous_setup_fault },
      { key: "rejection_face_not_ok", label: "Face Not OK", value: productionLog.rejection_face_not_ok },
      { key: "rejection_material_not_ok", label: "Material", value: productionLog.rejection_material_not_ok },
    ];
    return reasons.filter(r => r.value && r.value > 0);
  };

  if (loading) {
    return (
      <Card className="border-muted">
        <CardContent className="pt-4">
          <div className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-4 w-40" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!productionLog) {
    return (
      <Card className="border-muted bg-muted/20">
        <CardContent className="pt-4">
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <AlertTriangle className="h-4 w-4" />
            <span>No production log found for this work order</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Compact version for inline display
  if (compact) {
    return (
      <div className="flex flex-wrap gap-3 text-sm bg-muted/30 rounded-lg px-3 py-2 border">
        <div className="flex items-center gap-1.5">
          <Factory className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="font-medium">{productionLog.machines?.name || "-"}</span>
          <Badge variant="outline" className="text-xs">{productionLog.plant}</Badge>
        </div>
        <Separator orientation="vertical" className="h-4" />
        <div className="flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
          <span>{productionLog.shift} Shift</span>
        </div>
        <Separator orientation="vertical" className="h-4" />
        <div className="flex items-center gap-1.5">
          <Settings className="h-3.5 w-3.5 text-muted-foreground" />
          <span>Setup: {productionLog.setup_number}</span>
        </div>
        <Separator orientation="vertical" className="h-4" />
        <div className="flex items-center gap-1.5">
          <User className="h-3.5 w-3.5 text-muted-foreground" />
          <span>{productionLog.operator?.full_name || "No operator"}</span>
        </div>
        {productionLog.programmer?.full_name && (
          <>
            <Separator orientation="vertical" className="h-4" />
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">Programmer:</span>
              <span>{productionLog.programmer.full_name}</span>
            </div>
          </>
        )}
      </div>
    );
  }

  // Full version with detailed production data
  const rejectionBreakdown = getRejectionBreakdown();

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Factory className="h-4 w-4" />
          {title}
          <Badge variant="secondary" className="text-xs ml-auto">
            Read-Only from Production Log
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Machine & Shift Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Machine</p>
            <p className="font-medium">{productionLog.machines?.name || "-"}</p>
            <p className="text-xs text-muted-foreground">{productionLog.machines?.machine_id}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Plant</p>
            <p className="font-medium">{productionLog.plant}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Shift</p>
            <p className="font-medium">{productionLog.shift}</p>
            <p className="text-xs text-muted-foreground">
              {productionLog.shift_start_time} - {productionLog.shift_end_time}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Setup Number</p>
            <p className="font-medium">{productionLog.setup_number}</p>
          </div>
        </div>

        <Separator />

        {/* Personnel Row */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Operator</p>
              <p className="font-medium">{productionLog.operator?.full_name || "-"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Settings className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">CNC Programmer</p>
              <p className="font-medium">{productionLog.programmer?.full_name || "-"}</p>
            </div>
          </div>
        </div>

        <Separator />

        {/* Runtime & Quantities Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Runtime</p>
              <p className="font-medium">{formatMinutes(productionLog.actual_runtime_minutes)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Production Qty</p>
              <p className="font-medium">{productionLog.actual_quantity ?? "-"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <XCircle className="h-4 w-4 text-destructive" />
            <div>
              <p className="text-xs text-muted-foreground">Rejection Qty</p>
              <p className="font-medium text-destructive">{productionLog.total_rejection_quantity ?? 0}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-emerald-600" />
            <div>
              <p className="text-xs text-muted-foreground">Efficiency</p>
              <p className={`font-medium ${(productionLog.efficiency_percentage || 0) >= 100 ? 'text-emerald-600' : 'text-amber-600'}`}>
                {productionLog.efficiency_percentage?.toFixed(1) ?? "-"}%
              </p>
            </div>
          </div>
        </div>

        {/* Rejection Breakdown */}
        {showRejectionDetails && rejectionBreakdown.length > 0 && (
          <>
            <Separator />
            <div>
              <p className="text-xs text-muted-foreground mb-2">Rejection Breakdown</p>
              <div className="flex flex-wrap gap-2">
                {rejectionBreakdown.map((reason) => (
                  <Badge key={reason.key} variant="outline" className="text-xs text-destructive border-destructive/30">
                    {reason.label}: {reason.value}
                  </Badge>
                ))}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default ProductionContextDisplay;
