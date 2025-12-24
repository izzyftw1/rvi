import { memo } from "react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Factory, Building2, CheckCircle2, Box, Truck, Package } from "lucide-react";
import { cn } from "@/lib/utils";

interface ExternalBreakdown {
  process: string;
  quantity: number;
}

interface WOQuantityBreakdownProps {
  ordered: number;
  inProduction: number;
  atExternal: number;
  externalBreakdown?: ExternalBreakdown[];
  qcApproved: number;
  packed: number;
  dispatched: number;
  variant?: "compact" | "detailed";
  className?: string;
}

/**
 * Displays a visual quantity breakdown for a Work Order
 * Derived live from batch-level data
 */
export const WOQuantityBreakdown = memo(function WOQuantityBreakdown({
  ordered,
  inProduction,
  atExternal,
  externalBreakdown = [],
  qcApproved,
  packed,
  dispatched,
  variant = "compact",
  className,
}: WOQuantityBreakdownProps) {
  
  if (variant === "compact") {
    return (
      <TooltipProvider delayDuration={200}>
        <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
          {/* Total */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" className="text-xs px-1.5 py-0.5 gap-1 font-normal">
                <Package className="h-3 w-3" />
                {ordered.toLocaleString()}
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              <p className="font-medium">Total Ordered: {ordered.toLocaleString()} pcs</p>
            </TooltipContent>
          </Tooltip>

          {/* In Production */}
          {inProduction > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge className="text-xs px-1.5 py-0.5 gap-1 bg-blue-500/10 text-blue-600 border-blue-500/20 hover:bg-blue-500/20">
                  <Factory className="h-3 w-3" />
                  {inProduction.toLocaleString()}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                <p className="font-medium">In Production: {inProduction.toLocaleString()} pcs</p>
              </TooltipContent>
            </Tooltip>
          )}

          {/* At External */}
          {atExternal > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge className="text-xs px-1.5 py-0.5 gap-1 bg-purple-500/10 text-purple-600 border-purple-500/20 hover:bg-purple-500/20">
                  <Building2 className="h-3 w-3" />
                  {atExternal.toLocaleString()}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                <p className="font-medium">At External: {atExternal.toLocaleString()} pcs</p>
                {externalBreakdown.length > 0 && (
                  <div className="mt-1 space-y-0.5">
                    {externalBreakdown.map(e => (
                      <p key={e.process} className="text-xs text-muted-foreground">
                        {e.process}: {e.quantity.toLocaleString()}
                      </p>
                    ))}
                  </div>
                )}
              </TooltipContent>
            </Tooltip>
          )}

          {/* QC Approved */}
          {qcApproved > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge className="text-xs px-1.5 py-0.5 gap-1 bg-green-500/10 text-green-600 border-green-500/20 hover:bg-green-500/20">
                  <CheckCircle2 className="h-3 w-3" />
                  {qcApproved.toLocaleString()}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                <p className="font-medium">QC Approved: {qcApproved.toLocaleString()} pcs</p>
              </TooltipContent>
            </Tooltip>
          )}

          {/* Packed */}
          {packed > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge className="text-xs px-1.5 py-0.5 gap-1 bg-amber-500/10 text-amber-600 border-amber-500/20 hover:bg-amber-500/20">
                  <Box className="h-3 w-3" />
                  {packed.toLocaleString()}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                <p className="font-medium">Packed: {packed.toLocaleString()} pcs</p>
              </TooltipContent>
            </Tooltip>
          )}

          {/* Dispatched */}
          {dispatched > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge className="text-xs px-1.5 py-0.5 gap-1 bg-emerald-500/10 text-emerald-600 border-emerald-500/20 hover:bg-emerald-500/20">
                  <Truck className="h-3 w-3" />
                  {dispatched.toLocaleString()}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                <p className="font-medium">Dispatched: {dispatched.toLocaleString()} pcs</p>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </TooltipProvider>
    );
  }

  // Detailed variant - for detail pages
  return (
    <div className={cn("grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3", className)}>
      <QuantityItem
        icon={Package}
        label="Total"
        value={ordered}
        color="text-foreground"
        bgColor="bg-muted/50"
      />
      <QuantityItem
        icon={Factory}
        label="In Production"
        value={inProduction}
        color="text-blue-600"
        bgColor="bg-blue-500/10"
      />
      <QuantityItem
        icon={Building2}
        label="At External"
        value={atExternal}
        color="text-purple-600"
        bgColor="bg-purple-500/10"
        subtitle={externalBreakdown.length > 0 
          ? externalBreakdown.map(e => `${e.process}: ${e.quantity}`).join(", ")
          : undefined
        }
      />
      <QuantityItem
        icon={CheckCircle2}
        label="QC Approved"
        value={qcApproved}
        color="text-green-600"
        bgColor="bg-green-500/10"
      />
      <QuantityItem
        icon={Box}
        label="Packed"
        value={packed}
        color="text-amber-600"
        bgColor="bg-amber-500/10"
      />
      <QuantityItem
        icon={Truck}
        label="Dispatched"
        value={dispatched}
        color="text-emerald-600"
        bgColor="bg-emerald-500/10"
      />
    </div>
  );
});

interface QuantityItemProps {
  icon: React.ElementType;
  label: string;
  value: number;
  color: string;
  bgColor: string;
  subtitle?: string;
}

const QuantityItem = memo(function QuantityItem({
  icon: Icon,
  label,
  value,
  color,
  bgColor,
  subtitle,
}: QuantityItemProps) {
  return (
    <div className={cn("p-3 rounded-lg", bgColor)}>
      <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
        <Icon className={cn("h-3.5 w-3.5", color)} />
        {label}
      </div>
      <div className={cn("text-xl font-bold", color)}>
        {value.toLocaleString()}
      </div>
      {subtitle && (
        <div className="text-[10px] text-muted-foreground mt-0.5 truncate" title={subtitle}>
          {subtitle}
        </div>
      )}
    </div>
  );
});
