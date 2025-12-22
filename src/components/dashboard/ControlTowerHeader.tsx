import { Badge } from "@/components/ui/badge";
import { Bell, AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ControlTowerHeaderProps {
  criticalCount: number;
  warningCount: number;
  allClear: boolean;
}

export const ControlTowerHeader = ({ criticalCount, warningCount, allClear }: ControlTowerHeaderProps) => {
  return (
    <div className="flex items-center justify-between pb-4 border-b border-border/50">
      <div className="flex items-center gap-3">
        <div className={cn(
          "h-3 w-3 rounded-full animate-pulse",
          allClear ? "bg-emerald-500" : criticalCount > 0 ? "bg-destructive" : "bg-amber-500"
        )} />
        <h1 className="text-2xl font-bold tracking-tight">Control Tower</h1>
      </div>
      
      <div className="flex items-center gap-4">
        {allClear ? (
          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            All Systems OK
          </Badge>
        ) : (
          <div className="flex items-center gap-2">
            {criticalCount > 0 && (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="h-3 w-3" />
                {criticalCount} Critical
              </Badge>
            )}
            {warningCount > 0 && (
              <Badge className="bg-amber-500 hover:bg-amber-600 gap-1">
                <Bell className="h-3 w-3" />
                {warningCount} Warnings
              </Badge>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
