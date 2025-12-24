import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Package, Truck, FileText, ClipboardList, ArrowRight, AlertCircle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface QuantityLayersProps {
  soQty?: number | null;
  packedQty: number;
  dispatchedQty: number;
  invoicedQty?: number | null;
  showSoQty?: boolean;
  showInvoicedQty?: boolean;
  compact?: boolean;
  className?: string;
}

/**
 * Displays quantity layers: SO Qty → Packed → Dispatched → Invoiced
 * Shows differences and variances as read-only, system-derived values
 */
export function QuantityLayersDisplay({
  soQty,
  packedQty,
  dispatchedQty,
  invoicedQty,
  showSoQty = true,
  showInvoicedQty = true,
  compact = false,
  className,
}: QuantityLayersProps) {
  const dispatchVariance = soQty ? dispatchedQty - soQty : null;
  const packedVsDispatched = packedQty - dispatchedQty;
  const invoicedVsDispatched = invoicedQty !== null && invoicedQty !== undefined 
    ? invoicedQty - dispatchedQty 
    : null;

  const getVarianceBadge = (variance: number | null, label: string) => {
    if (variance === null) return null;
    if (variance === 0) {
      return (
        <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Match
        </Badge>
      );
    }
    const isOver = variance > 0;
    return (
      <Badge 
        variant="outline" 
        className={cn(
          "text-xs",
          isOver 
            ? "bg-amber-50 text-amber-700 border-amber-200" 
            : "bg-red-50 text-red-700 border-red-200"
        )}
      >
        <AlertCircle className="h-3 w-3 mr-1" />
        {isOver ? "+" : ""}{variance} {label}
      </Badge>
    );
  };

  if (compact) {
    return (
      <div className={cn("flex items-center gap-2 text-sm", className)}>
        <TooltipProvider>
          {showSoQty && soQty !== null && soQty !== undefined && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex items-center gap-1 text-muted-foreground">
                  <ClipboardList className="h-3 w-3" />
                  {soQty.toLocaleString()}
                </span>
              </TooltipTrigger>
              <TooltipContent>SO Ordered Qty (Reference)</TooltipContent>
            </Tooltip>
          )}
          
          {showSoQty && soQty !== null && <ArrowRight className="h-3 w-3 text-muted-foreground" />}
          
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="flex items-center gap-1">
                <Package className="h-3 w-3 text-blue-500" />
                <span className="font-medium">{packedQty.toLocaleString()}</span>
              </span>
            </TooltipTrigger>
            <TooltipContent>Packed Qty</TooltipContent>
          </Tooltip>
          
          <ArrowRight className="h-3 w-3 text-muted-foreground" />
          
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="flex items-center gap-1">
                <Truck className="h-3 w-3 text-green-500" />
                <span className="font-medium">{dispatchedQty.toLocaleString()}</span>
              </span>
            </TooltipTrigger>
            <TooltipContent>Dispatched Qty (Source of Truth)</TooltipContent>
          </Tooltip>
          
          {showInvoicedQty && invoicedQty !== null && invoicedQty !== undefined && (
            <>
              <ArrowRight className="h-3 w-3 text-muted-foreground" />
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="flex items-center gap-1">
                    <FileText className="h-3 w-3 text-purple-500" />
                    <span className="font-medium">{invoicedQty.toLocaleString()}</span>
                  </span>
                </TooltipTrigger>
                <TooltipContent>Invoiced Qty (= Dispatched)</TooltipContent>
              </Tooltip>
            </>
          )}
        </TooltipProvider>
      </div>
    );
  }

  return (
    <div className={cn("grid grid-cols-2 md:grid-cols-4 gap-4", className)}>
      {/* SO Ordered Qty - Reference Only */}
      {showSoQty && (
        <div className="p-3 rounded-lg border bg-muted/30">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <ClipboardList className="h-4 w-4" />
            <span className="text-xs font-medium uppercase">SO Qty</span>
            <Badge variant="secondary" className="text-xs ml-auto">Reference</Badge>
          </div>
          <p className="text-2xl font-bold">
            {soQty !== null && soQty !== undefined ? soQty.toLocaleString() : "—"}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Contractual quantity</p>
        </div>
      )}

      {/* Packed Qty - Entered by Packing Team */}
      <div className="p-3 rounded-lg border bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
        <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400 mb-1">
          <Package className="h-4 w-4" />
          <span className="text-xs font-medium uppercase">Packed</span>
        </div>
        <p className="text-2xl font-bold text-blue-700 dark:text-blue-400">
          {packedQty.toLocaleString()}
        </p>
        <p className="text-xs text-muted-foreground mt-1">By packing team</p>
        {packedVsDispatched !== 0 && (
          <div className="mt-2">
            {getVarianceBadge(-packedVsDispatched, "vs dispatched")}
          </div>
        )}
      </div>

      {/* Dispatched Qty - Source of Truth */}
      <div className="p-3 rounded-lg border bg-green-50/50 dark:bg-green-950/20 border-green-200 dark:border-green-800">
        <div className="flex items-center gap-2 text-green-700 dark:text-green-400 mb-1">
          <Truck className="h-4 w-4" />
          <span className="text-xs font-medium uppercase">Dispatched</span>
          <Badge className="text-xs ml-auto bg-green-600">Source of Truth</Badge>
        </div>
        <p className="text-2xl font-bold text-green-700 dark:text-green-400">
          {dispatchedQty.toLocaleString()}
        </p>
        <p className="text-xs text-muted-foreground mt-1">Confirmed at dispatch</p>
        {showSoQty && dispatchVariance !== null && dispatchVariance !== 0 && (
          <div className="mt-2">
            {getVarianceBadge(dispatchVariance, "vs SO")}
          </div>
        )}
      </div>

      {/* Invoiced Qty - Auto-derived from Dispatched */}
      {showInvoicedQty && (
        <div className="p-3 rounded-lg border bg-purple-50/50 dark:bg-purple-950/20 border-purple-200 dark:border-purple-800">
          <div className="flex items-center gap-2 text-purple-700 dark:text-purple-400 mb-1">
            <FileText className="h-4 w-4" />
            <span className="text-xs font-medium uppercase">Invoiced</span>
            <Badge variant="outline" className="text-xs ml-auto">Auto</Badge>
          </div>
          <p className="text-2xl font-bold text-purple-700 dark:text-purple-400">
            {invoicedQty !== null && invoicedQty !== undefined ? invoicedQty.toLocaleString() : "—"}
          </p>
          <p className="text-xs text-muted-foreground mt-1">= Dispatched qty</p>
          {invoicedVsDispatched !== null && invoicedVsDispatched !== 0 && (
            <div className="mt-2">
              <Badge variant="destructive" className="text-xs">
                <AlertCircle className="h-3 w-3 mr-1" />
                Mismatch!
              </Badge>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Compact inline display for table cells
 */
export function QuantityLayersInline({
  soQty,
  packedQty,
  dispatchedQty,
  invoicedQty,
}: Omit<QuantityLayersProps, 'compact' | 'className' | 'showSoQty' | 'showInvoicedQty'>) {
  return (
    <QuantityLayersDisplay
      soQty={soQty}
      packedQty={packedQty}
      dispatchedQty={dispatchedQty}
      invoicedQty={invoicedQty}
      compact
      showSoQty={soQty !== null && soQty !== undefined}
      showInvoicedQty={invoicedQty !== null && invoicedQty !== undefined}
    />
  );
}
