import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { AlertTriangle, ShieldAlert, Package } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatCount, formatPercent, isEmpty } from "@/lib/displayUtils";

interface ExternalSummaryStripProps {
  totalActiveMoves: number;
  totalWipPcs: number;
  overdueCount: number;
  overduePcs?: number;
  avgDaysOverdue?: number;
}

export const ExternalSummaryStrip = ({ 
  totalActiveMoves, 
  totalWipPcs, 
  overdueCount,
  overduePcs = 0,
  avgDaysOverdue = 0
}: ExternalSummaryStripProps) => {
  const navigate = useNavigate();
  
  const hasSLABreach = overdueCount > 0;

  return (
    <div className="grid grid-cols-3 gap-4 pt-4 border-t border-border/50">
      <div 
        className="text-center cursor-pointer hover:opacity-80 transition-opacity"
        onClick={() => navigate('/partners')}
      >
        <div className="text-3xl font-bold text-foreground">{formatCount(totalActiveMoves)}</div>
        <p className="text-xs text-muted-foreground">Active Moves</p>
      </div>
      <div 
        className={cn(
          "text-center cursor-pointer transition-all rounded-lg p-2 -m-2",
          hasSLABreach ? "hover:bg-destructive/10" : "hover:opacity-80"
        )}
        onClick={() => navigate('/partners?filter=overdue')}
      >
        <div className="flex items-center justify-center gap-2">
          {hasSLABreach && <ShieldAlert className="h-5 w-5 text-destructive animate-pulse" />}
          <div className={cn(
            "text-3xl font-bold",
            hasSLABreach ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"
          )}>
            {formatCount(overdueCount, true)}
          </div>
        </div>
        <p className={cn(
          "text-xs font-medium",
          hasSLABreach ? "text-destructive" : "text-muted-foreground"
        )}>
          {hasSLABreach ? "SLA Breach" : "On Track"}
        </p>
        {hasSLABreach && avgDaysOverdue > 0 && (
          <Badge variant="outline" className="mt-1 text-[9px] border-destructive/50 text-destructive">
            Avg {Math.round(avgDaysOverdue)}d Overdue
          </Badge>
        )}
      </div>
      <div 
        className={cn(
          "text-center cursor-pointer transition-all rounded-lg p-2 -m-2",
          overduePcs > 0 ? "hover:bg-amber-500/10" : "hover:opacity-80"
        )}
        onClick={() => navigate('/partners?filter=overdue')}
      >
        <div className="flex items-center justify-center gap-2">
          {overduePcs > 0 && <Package className="h-5 w-5 text-amber-600 dark:text-amber-400" />}
          <div className={cn(
            "text-3xl font-bold",
            overduePcs > 0 ? "text-amber-600 dark:text-amber-400" : "text-primary"
          )}>
            {overduePcs > 0 ? formatCount(overduePcs) : formatCount(totalWipPcs)}
          </div>
        </div>
        <p className={cn(
          "text-xs font-medium",
          overduePcs > 0 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"
        )}>
          {overduePcs > 0 ? "pcs at Risk" : "External WIP pcs"}
        </p>
        {overduePcs > 0 && totalWipPcs > 0 && (
          <Badge variant="outline" className="mt-1 text-[9px] border-amber-500/50 text-amber-600">
            {Math.round((overduePcs / totalWipPcs) * 100)}% of WIP
          </Badge>
        )}
      </div>
    </div>
  );
};
