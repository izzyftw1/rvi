import { Badge } from "@/components/ui/badge";
import { 
  Tooltip, 
  TooltipContent, 
  TooltipProvider, 
  TooltipTrigger 
} from "@/components/ui/tooltip";
import { 
  Package, Layers, ClipboardCheck, Truck, Clock, AlertCircle, 
  CheckCircle2, Loader2, RefreshCw 
} from "lucide-react";
import { useWOBatchStatus, getStatusLabel, getStatusColors } from "@/hooks/useWOBatchStatus";
import { cn } from "@/lib/utils";

interface WOBatchStatusBadgeProps {
  woId: string;
  showDetails?: boolean;
  size?: "sm" | "md" | "lg";
}

export function WOBatchStatusBadge({ woId, showDetails = false, size = "md" }: WOBatchStatusBadgeProps) {
  const { batchStatus, loading, error } = useWOBatchStatus(woId);

  if (loading) {
    return (
      <Badge variant="outline" className="gap-1">
        <Loader2 className="h-3 w-3 animate-spin" />
        Loading...
      </Badge>
    );
  }

  if (error || !batchStatus) {
    return (
      <Badge variant="outline" className="gap-1 text-muted-foreground">
        <AlertCircle className="h-3 w-3" />
        Unknown
      </Badge>
    );
  }

  const colors = getStatusColors(batchStatus.status);
  const label = getStatusLabel(batchStatus.status);

  const sizeClasses = {
    sm: "text-xs px-2 py-0.5",
    md: "text-sm px-2.5 py-1",
    lg: "text-base px-3 py-1.5"
  };

  const iconSize = {
    sm: "h-3 w-3",
    md: "h-4 w-4",
    lg: "h-5 w-5"
  };

  const getStatusIcon = () => {
    switch (batchStatus.status) {
      case "pending":
        return <Clock className={iconSize[size]} />;
      case "in_production":
        return <Layers className={iconSize[size]} />;
      case "in_qc":
      case "partially_qc_approved":
        return <ClipboardCheck className={iconSize[size]} />;
      case "ready_to_dispatch":
      case "partially_dispatched":
        return <Truck className={iconSize[size]} />;
      case "awaiting_next_batch":
        return <RefreshCw className={iconSize[size]} />;
      case "fully_dispatched":
      case "closed":
        return <CheckCircle2 className={iconSize[size]} />;
      default:
        return <Package className={iconSize[size]} />;
    }
  };

  const badge = (
    <Badge 
      variant="outline" 
      className={cn(
        "gap-1 font-medium border",
        colors.bg, colors.text, colors.border,
        sizeClasses[size]
      )}
    >
      {getStatusIcon()}
      {label}
    </Badge>
  );

  if (!showDetails) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>{badge}</TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <div className="space-y-2 text-sm">
              <p className="font-medium">{label}</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <span className="text-muted-foreground">Ordered:</span>
                <span>{batchStatus.ordered_qty.toLocaleString()}</span>
                <span className="text-muted-foreground">Produced:</span>
                <span>{batchStatus.produced_qty.toLocaleString()}</span>
                <span className="text-muted-foreground">QC Approved:</span>
                <span className="text-green-600">{batchStatus.qc_approved_qty.toLocaleString()}</span>
                <span className="text-muted-foreground">Dispatched:</span>
                <span className="text-purple-600">{batchStatus.dispatched_qty.toLocaleString()}</span>
                <span className="text-muted-foreground">Remaining:</span>
                <span className="text-orange-600">{batchStatus.remaining_qty.toLocaleString()}</span>
              </div>
              {batchStatus.active_batches > 0 && (
                <p className="text-xs text-muted-foreground">
                  {batchStatus.active_batches} active batch{batchStatus.active_batches > 1 ? "es" : ""}
                </p>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <div className="space-y-2">
      {badge}
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="flex items-center gap-1">
          <Package className="h-4 w-4 text-muted-foreground" />
          <span className="text-muted-foreground">Ordered:</span>
          <span className="font-medium">{batchStatus.ordered_qty.toLocaleString()}</span>
        </div>
        <div className="flex items-center gap-1">
          <Layers className="h-4 w-4 text-blue-500" />
          <span className="text-muted-foreground">Produced:</span>
          <span className="font-medium">{batchStatus.produced_qty.toLocaleString()}</span>
        </div>
        <div className="flex items-center gap-1">
          <ClipboardCheck className="h-4 w-4 text-green-500" />
          <span className="text-muted-foreground">QC OK:</span>
          <span className="font-medium text-green-600">{batchStatus.qc_approved_qty.toLocaleString()}</span>
        </div>
        <div className="flex items-center gap-1">
          <Truck className="h-4 w-4 text-purple-500" />
          <span className="text-muted-foreground">Dispatched:</span>
          <span className="font-medium text-purple-600">{batchStatus.dispatched_qty.toLocaleString()}</span>
        </div>
        {batchStatus.remaining_qty > 0 && (
          <div className="flex items-center gap-1 col-span-2">
            <Clock className="h-4 w-4 text-orange-500" />
            <span className="text-muted-foreground">Remaining:</span>
            <span className="font-medium text-orange-600">{batchStatus.remaining_qty.toLocaleString()}</span>
          </div>
        )}
      </div>
    </div>
  );
}
