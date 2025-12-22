import { Factory, ArrowDownUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export type OperatingMode = "internal" | "external";

interface ModeToggleProps {
  activeMode: OperatingMode;
  onModeChange: (mode: OperatingMode) => void;
  internalJobCount: number;
  externalOverdueCount: number;
  externalActiveCount: number;
}

export const ModeToggle = ({ 
  activeMode, 
  onModeChange, 
  internalJobCount,
  externalOverdueCount,
  externalActiveCount
}: ModeToggleProps) => {
  return (
    <div className="flex items-center justify-center">
      <div className="inline-flex rounded-lg border-2 border-border bg-muted/30 p-1">
        <button
          onClick={() => onModeChange("internal")}
          className={cn(
            "relative flex items-center gap-2 px-6 py-3 rounded-md text-sm font-semibold transition-all",
            activeMode === "internal"
              ? "bg-primary text-primary-foreground shadow-md"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
          )}
        >
          <Factory className="h-5 w-5" />
          <span>Internal Flow</span>
          {internalJobCount > 0 && (
            <Badge 
              variant={activeMode === "internal" ? "secondary" : "outline"}
              className={cn(
                "ml-1 text-xs",
                activeMode === "internal" && "bg-primary-foreground/20 text-primary-foreground"
              )}
            >
              {internalJobCount}
            </Badge>
          )}
        </button>

        <button
          onClick={() => onModeChange("external")}
          className={cn(
            "relative flex items-center gap-2 px-6 py-3 rounded-md text-sm font-semibold transition-all",
            activeMode === "external"
              ? "bg-primary text-primary-foreground shadow-md"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
          )}
        >
          <ArrowDownUp className="h-5 w-5" />
          <span>External Processing</span>
          <div className="flex items-center gap-1 ml-1">
            {externalActiveCount > 0 && (
              <Badge 
                variant={activeMode === "external" ? "secondary" : "outline"}
                className={cn(
                  "text-xs",
                  activeMode === "external" && "bg-primary-foreground/20 text-primary-foreground"
                )}
              >
                {externalActiveCount}
              </Badge>
            )}
            {externalOverdueCount > 0 && (
              <Badge variant="destructive" className="text-xs">
                {externalOverdueCount} overdue
              </Badge>
            )}
          </div>
        </button>
      </div>
    </div>
  );
};
