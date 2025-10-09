import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Package, Factory, ClipboardCheck, Box, Truck, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface KanbanStage {
  stage: string;
  icon: React.ElementType;
  count: number;
  totalPcs: number;
  totalKg: number;
  avgWaitHours: number;
  status: 'good' | 'warning' | 'critical';
  onClick: () => void;
}

interface FloorKanbanProps {
  stages: KanbanStage[];
}

export const FloorKanban = ({ stages }: FloorKanbanProps) => {
  const getStatusColor = (status: string, avgWait: number) => {
    if (avgWait > 48) return 'border-red-500 bg-red-50 dark:bg-red-950';
    if (avgWait > 24) return 'border-orange-500 bg-orange-50 dark:bg-orange-950';
    return 'border-green-500 bg-green-50 dark:bg-green-950';
  };

  const getStatusBadge = (avgWait: number) => {
    if (avgWait > 48) return <Badge variant="destructive" className="text-xs">Bottleneck</Badge>;
    if (avgWait > 24) return <Badge variant="secondary" className="text-xs bg-orange-500 text-white">Slow</Badge>;
    return <Badge variant="secondary" className="text-xs bg-green-500 text-white">Normal</Badge>;
  };

  return (
    <div className="mb-6">
      <h2 className="text-xl font-bold mb-4">Live Floor Status - Kanban View</h2>
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        {stages.map((stage, idx) => {
          const StageIcon = stage.icon;
          return (
            <div key={idx} className="relative">
              <Card 
                className={cn(
                  "cursor-pointer hover:shadow-xl transition-all border-l-4",
                  getStatusColor(stage.status, stage.avgWaitHours)
                )}
                onClick={stage.onClick}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <StageIcon className="h-5 w-5 text-primary" />
                    {getStatusBadge(stage.avgWaitHours)}
                  </div>
                  <CardTitle className="text-sm font-medium text-muted-foreground">{stage.stage}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="text-center">
                    <p className="text-4xl font-bold text-primary">{stage.count}</p>
                    <p className="text-xs text-muted-foreground">Work Orders</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-center pt-2 border-t">
                    <div>
                      <p className="text-lg font-semibold">{stage.totalPcs.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">Pcs</p>
                    </div>
                    <div>
                      <p className="text-lg font-semibold">{stage.totalKg.toFixed(1)}</p>
                      <p className="text-xs text-muted-foreground">Kg</p>
                    </div>
                  </div>
                  <div className="text-center pt-2 border-t">
                    <p className="text-sm font-medium">{stage.avgWaitHours.toFixed(1)}h</p>
                    <p className="text-xs text-muted-foreground">Avg Wait</p>
                  </div>
                </CardContent>
              </Card>
              {idx < stages.length - 1 && (
                <div className="hidden md:flex absolute right-0 top-1/2 transform translate-x-1/2 -translate-y-1/2 z-10">
                  <ArrowRight className="h-6 w-6 text-muted-foreground" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
