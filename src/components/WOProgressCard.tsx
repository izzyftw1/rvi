import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Package, TrendingUp, AlertTriangle } from "lucide-react";

interface WOProgressCardProps {
  targetQuantity: number;
  completedQuantity: number;
  scrapQuantity: number;
  progressPercentage: number;
  remainingQuantity: number;
}

export function WOProgressCard({
  targetQuantity,
  completedQuantity,
  scrapQuantity,
  progressPercentage,
  remainingQuantity,
}: WOProgressCardProps) {
  const netCompleted = completedQuantity - scrapQuantity;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          Production Progress
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Progress</span>
            <span className="font-semibold">{progressPercentage.toFixed(1)}%</span>
          </div>
          <Progress value={progressPercentage} className="h-3" />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Package className="h-4 w-4" />
              Target
            </div>
            <div className="text-2xl font-bold">{targetQuantity.toLocaleString()}</div>
          </div>

          <div className="space-y-1">
            <div className="text-muted-foreground text-sm">Completed</div>
            <div className="text-2xl font-bold text-green-600">
              {completedQuantity.toLocaleString()}
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <AlertTriangle className="h-4 w-4" />
              Scrap
            </div>
            <div className="text-2xl font-bold">
              <Badge variant="destructive">{scrapQuantity.toLocaleString()}</Badge>
            </div>
          </div>

          <div className="space-y-1">
            <div className="text-muted-foreground text-sm">Remaining</div>
            <div className="text-2xl font-bold text-blue-600">
              {remainingQuantity.toLocaleString()}
            </div>
          </div>
        </div>

        <div className="pt-2 border-t">
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Net Completed (after scrap)</span>
            <span className="text-lg font-semibold">{netCompleted.toLocaleString()} pcs</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
