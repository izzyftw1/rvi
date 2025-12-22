import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

interface InternalSummaryStripProps {
  ordersInPipeline: number;
  ordersInProduction: number;
  onTimeRate: number;
}

export const InternalSummaryStrip = ({ 
  ordersInPipeline, 
  ordersInProduction, 
  onTimeRate 
}: InternalSummaryStripProps) => {
  const navigate = useNavigate();
  const isGoodRate = onTimeRate >= 90;

  return (
    <div className="grid grid-cols-3 gap-4 pt-4 border-t border-border/50">
      <div 
        className="text-center cursor-pointer hover:opacity-80 transition-opacity"
        onClick={() => navigate('/work-orders?status=pending')}
      >
        <div className="text-3xl font-bold text-foreground">{ordersInPipeline}</div>
        <p className="text-xs text-muted-foreground">Orders in Pipeline</p>
      </div>
      <div 
        className="text-center cursor-pointer hover:opacity-80 transition-opacity"
        onClick={() => navigate('/production-progress')}
      >
        <div className="text-3xl font-bold text-primary">{ordersInProduction}</div>
        <p className="text-xs text-muted-foreground">In Production</p>
      </div>
      <div 
        className="text-center cursor-pointer hover:opacity-80 transition-opacity"
        onClick={() => navigate('/reports')}
      >
        <div className={cn(
          "text-3xl font-bold",
          isGoodRate ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"
        )}>
          {onTimeRate}%
        </div>
        <p className="text-xs text-muted-foreground">On-Time Rate (7d)</p>
      </div>
    </div>
  );
};
