import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, Clock, Package, TrendingUp } from "lucide-react";
import { format, differenceInMinutes } from "date-fns";

interface SummaryPanelProps {
  totalJobsToday: number;
  totalPartsInProgress: number;
  bottleneckMachines: string[];
  nextCompletion: Date | null;
}

export const SummaryPanel = ({
  totalJobsToday,
  totalPartsInProgress,
  bottleneckMachines,
  nextCompletion,
}: SummaryPanelProps) => {
  return (
    <div className="sticky top-0 z-30 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b shadow-sm">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Package className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalJobsToday}</p>
                <p className="text-xs text-muted-foreground">Jobs Today</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-success/10">
                <TrendingUp className="h-5 w-5 text-success" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalPartsInProgress}</p>
                <p className="text-xs text-muted-foreground">Parts in Progress</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-warning/10">
                <AlertTriangle className="h-5 w-5 text-warning" />
              </div>
              <div>
                <p className="text-2xl font-bold">{bottleneckMachines.length}</p>
                <p className="text-xs text-muted-foreground">Bottlenecks</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-accent/10">
                <Clock className="h-5 w-5 text-accent" />
              </div>
              <div>
                <p className="text-sm font-bold">
                  {nextCompletion ? format(nextCompletion, "HH:mm") : "--:--"}
                </p>
                <p className="text-xs text-muted-foreground">Next Completion</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};