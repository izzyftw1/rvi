import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Settings, Pause } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProductionCompleteBadgeProps {
  isComplete: boolean;
  completeQty?: number;
  reason?: string | null;
  className?: string;
}

export function ProductionCompleteBadge({ 
  isComplete, 
  completeQty, 
  reason,
  className 
}: ProductionCompleteBadgeProps) {
  if (isComplete) {
    const reasonLabels: Record<string, string> = {
      qty_reached: 'Qty Reached',
      manual: 'Manual',
      qc_gated: 'QC Gated',
    };
    
    return (
      <Badge 
        variant="outline"
        className={cn(
          "bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-400",
          className
        )}
      >
        <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
        Production Complete
        {completeQty ? ` (${completeQty.toLocaleString()} pcs)` : ''}
        {reason && reasonLabels[reason] && (
          <span className="ml-1 text-xs opacity-70">• {reasonLabels[reason]}</span>
        )}
      </Badge>
    );
  }

  return (
    <Badge 
      variant="outline"
      className={cn(
        "bg-blue-500/10 text-blue-700 border-blue-500/30 dark:text-blue-400",
        className
      )}
    >
      <Settings className="h-3.5 w-3.5 mr-1.5 animate-spin-slow" />
      Production In Progress
    </Badge>
  );
}
