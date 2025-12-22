import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp, BarChart3, Factory, Clock } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { formatCount, formatPercent, isEmpty } from "@/lib/displayUtils";

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
  const [isOpen, setIsOpen] = useState(false);
  const isGoodRate = onTimeRate >= 90;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <button className="w-full flex items-center justify-between py-2 px-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors border border-border/30">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <BarChart3 className="h-3.5 w-3.5" />
            <span className="font-medium">Weekly Summary</span>
          </div>
          <div className="flex items-center gap-3">
            {/* Mini stats preview when collapsed */}
            {!isOpen && (
              <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                <span>{formatCount(ordersInPipeline)} pipeline</span>
                <span className="text-muted-foreground/50">•</span>
                <span>{formatCount(ordersInProduction)} in prod</span>
                <span className="text-muted-foreground/50">•</span>
                <span className={cn(
                  !isEmpty(onTimeRate) && (isGoodRate ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600")
                )}>
                  {formatPercent(onTimeRate)} OT
                </span>
              </div>
            )}
            {isOpen ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </button>
      </CollapsibleTrigger>
      
      <CollapsibleContent>
        <div className="grid grid-cols-3 gap-3 pt-3 pb-1">
          <div 
            className="flex items-center gap-2 p-2 rounded-md bg-muted/20 cursor-pointer hover:bg-muted/40 transition-colors"
            onClick={() => navigate('/work-orders?status=pending')}
          >
            <div className="p-1.5 rounded bg-muted/50">
              <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <div>
              <div className="text-lg font-semibold text-muted-foreground">{formatCount(ordersInPipeline)}</div>
              <p className="text-[10px] text-muted-foreground/70">Orders in Pipeline</p>
            </div>
          </div>
          
          <div 
            className="flex items-center gap-2 p-2 rounded-md bg-muted/20 cursor-pointer hover:bg-muted/40 transition-colors"
            onClick={() => navigate('/production-progress')}
          >
            <div className="p-1.5 rounded bg-muted/50">
              <Factory className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <div>
              <div className="text-lg font-semibold text-muted-foreground">{formatCount(ordersInProduction)}</div>
              <p className="text-[10px] text-muted-foreground/70">In Production</p>
            </div>
          </div>
          
          <div 
            className="flex items-center gap-2 p-2 rounded-md bg-muted/20 cursor-pointer hover:bg-muted/40 transition-colors"
            onClick={() => navigate('/reports')}
          >
            <div className="p-1.5 rounded bg-muted/50">
              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <div>
              <div className={cn(
                "text-lg font-semibold",
                !isEmpty(onTimeRate) && (isGoodRate ? "text-emerald-600/70 dark:text-emerald-400/70" : "text-amber-600/70")
              )}>
                {formatPercent(onTimeRate)}
              </div>
              <p className="text-[10px] text-muted-foreground/70">On-Time Rate (7d)</p>
            </div>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};
