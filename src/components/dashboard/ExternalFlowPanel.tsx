import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Sparkles, 
  Wind, 
  Hammer, 
  Flame, 
  Factory,
  AlertTriangle,
  ExternalLink
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ProcessData {
  pcs: number;
  kg: number;
  activeMoves: number;
  overdue: number;
}

interface ExternalFlowPanelProps {
  data: Record<string, ProcessData>;
  onProcessClick: (process: string) => void;
}

const PROCESS_CONFIG = [
  { key: 'job_work', label: 'Job Work', icon: Factory, bgColor: 'bg-blue-500/10', borderColor: 'border-blue-500/30', textColor: 'text-blue-600' },
  { key: 'plating', label: 'Plating', icon: Sparkles, bgColor: 'bg-purple-500/10', borderColor: 'border-purple-500/30', textColor: 'text-purple-600' },
  { key: 'buffing', label: 'Buffing', icon: Wind, bgColor: 'bg-cyan-500/10', borderColor: 'border-cyan-500/30', textColor: 'text-cyan-600' },
  { key: 'blasting', label: 'Blasting', icon: Hammer, bgColor: 'bg-orange-500/10', borderColor: 'border-orange-500/30', textColor: 'text-orange-600' },
  { key: 'forging_ext', label: 'Forging', icon: Flame, bgColor: 'bg-red-500/10', borderColor: 'border-red-500/30', textColor: 'text-red-600' }
];

export const ExternalFlowPanel = ({ data, onProcessClick }: ExternalFlowPanelProps) => {
  const navigate = useNavigate();

  // Calculate totals
  const totalActive = Object.values(data).reduce((sum, p) => sum + (p.activeMoves || 0), 0);
  const totalOverdue = Object.values(data).reduce((sum, p) => sum + (p.overdue || 0), 0);
  const totalPcs = Object.values(data).reduce((sum, p) => sum + (p.pcs || 0), 0);

  return (
    <div className="space-y-4">
      {/* Summary strip */}
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-6 text-sm">
          <span className="text-muted-foreground">
            Active Moves: <span className="font-semibold text-foreground">{totalActive}</span>
          </span>
          <span className="text-muted-foreground">
            Total WIP: <span className="font-semibold text-foreground">{totalPcs.toLocaleString()}</span> pcs
          </span>
          {totalOverdue > 0 && (
            <Badge variant="destructive" className="gap-1">
              <AlertTriangle className="h-3 w-3" />
              {totalOverdue} Overdue
            </Badge>
          )}
        </div>
        <button
          onClick={() => navigate('/partners')}
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
        >
          View All <ExternalLink className="h-3 w-3" />
        </button>
      </div>

      {/* Process cards grid */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {PROCESS_CONFIG.map(({ key, label, icon: Icon, bgColor, borderColor, textColor }) => {
          const processData = data[key] || { pcs: 0, kg: 0, activeMoves: 0, overdue: 0 };
          const hasActivity = processData.activeMoves > 0;
          const hasOverdue = processData.overdue > 0;

          return (
            <Card
              key={key}
              className={cn(
                "cursor-pointer transition-all hover:shadow-lg hover:-translate-y-1 border-2",
                hasActivity ? borderColor : "border-transparent",
                !hasActivity && "opacity-50"
              )}
              onClick={() => onProcessClick(key)}
            >
              <CardContent className={cn("p-4", hasActivity && bgColor)}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Icon className={cn("h-4 w-4", textColor)} />
                    <span className="text-sm font-medium">{label}</span>
                  </div>
                  {hasOverdue && (
                    <Badge variant="destructive" className="h-5 text-[10px] px-1.5">
                      {processData.overdue}
                    </Badge>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 text-center">
                  <div>
                    <div className={cn(
                      "text-xl font-bold",
                      hasActivity ? "text-foreground" : "text-muted-foreground"
                    )}>
                      {processData.activeMoves}
                    </div>
                    <p className="text-[10px] text-muted-foreground">moves</p>
                  </div>
                  <div>
                    <div className={cn(
                      "text-xl font-bold",
                      hasActivity ? "text-foreground" : "text-muted-foreground"
                    )}>
                      {processData.pcs.toLocaleString()}
                    </div>
                    <p className="text-[10px] text-muted-foreground">pcs</p>
                  </div>
                </div>

                {processData.kg > 0 && (
                  <div className="mt-2 pt-2 border-t border-border/50 text-center">
                    <span className="text-xs text-muted-foreground">
                      {processData.kg.toFixed(1)} kg
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};
