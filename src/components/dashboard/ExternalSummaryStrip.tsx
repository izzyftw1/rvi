import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

interface ExternalSummaryStripProps {
  totalActiveMoves: number;
  totalWipPcs: number;
  overdueCount: number;
}

export const ExternalSummaryStrip = ({ 
  totalActiveMoves, 
  totalWipPcs, 
  overdueCount 
}: ExternalSummaryStripProps) => {
  const navigate = useNavigate();

  return (
    <div className="grid grid-cols-3 gap-4 pt-4 border-t border-border/50">
      <div 
        className="text-center cursor-pointer hover:opacity-80 transition-opacity"
        onClick={() => navigate('/partners')}
      >
        <div className="text-3xl font-bold text-foreground">{totalActiveMoves}</div>
        <p className="text-xs text-muted-foreground">Active Moves</p>
      </div>
      <div 
        className="text-center cursor-pointer hover:opacity-80 transition-opacity"
        onClick={() => navigate('/partners')}
      >
        <div className="text-3xl font-bold text-primary">{totalWipPcs.toLocaleString()}</div>
        <p className="text-xs text-muted-foreground">External WIP pcs</p>
      </div>
      <div 
        className="text-center cursor-pointer hover:opacity-80 transition-opacity"
        onClick={() => navigate('/partners')}
      >
        <div className={cn(
          "text-3xl font-bold",
          overdueCount > 0 ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"
        )}>
          {overdueCount}
        </div>
        <p className="text-xs text-muted-foreground">Overdue Returns</p>
      </div>
    </div>
  );
};
