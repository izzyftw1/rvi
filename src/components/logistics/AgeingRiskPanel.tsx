import { memo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgeingBucket } from "@/hooks/useLogisticsData";

interface AgeingRiskPanelProps {
  buckets: AgeingBucket[];
  onBucketClick?: (bucket: AgeingBucket) => void;
}

export const AgeingRiskPanel = memo(({ buckets, onBucketClick }: AgeingRiskPanelProps) => {
  const formatCurrency = (value: number) => {
    if (value >= 10000000) return `₹${(value / 10000000).toFixed(1)}Cr`;
    if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
    if (value >= 1000) return `₹${(value / 1000).toFixed(0)}K`;
    return `₹${value.toLocaleString()}`;
  };

  const totalValue = buckets.reduce((sum, b) => sum + b.value, 0);
  const riskValue = buckets.filter(b => b.minDays > 15).reduce((sum, b) => sum + b.value, 0);
  const riskPercentage = totalValue > 0 ? Math.round((riskValue / totalValue) * 100) : 0;

  const getBucketStyle = (bucket: AgeingBucket) => {
    if (bucket.minDays <= 7) return "bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800";
    if (bucket.minDays <= 15) return "bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800";
    if (bucket.minDays <= 30) return "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800";
    return "bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800";
  };

  const getBucketTextColor = (bucket: AgeingBucket) => {
    if (bucket.minDays <= 7) return "text-green-700 dark:text-green-400";
    if (bucket.minDays <= 15) return "text-blue-700 dark:text-blue-400";
    if (bucket.minDays <= 30) return "text-amber-700 dark:text-amber-400";
    return "text-red-700 dark:text-red-400";
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Ageing & Risk Analysis
          </CardTitle>
          {riskPercentage > 0 && (
            <Badge variant="destructive" className="gap-1">
              <TrendingDown className="h-3 w-3" />
              {riskPercentage}% at risk
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {buckets.map((bucket) => (
            <button
              key={bucket.range}
              onClick={() => onBucketClick?.(bucket)}
              className={cn(
                "p-4 rounded-lg border text-left transition-all hover:shadow-sm",
                getBucketStyle(bucket),
                bucket.quantity === 0 && "opacity-50"
              )}
            >
              <p className={cn("text-xs font-medium mb-1", getBucketTextColor(bucket))}>
                {bucket.range}
              </p>
              <p className="text-xl font-bold">{bucket.quantity.toLocaleString()}</p>
              <div className="flex items-center justify-between mt-1">
                <span className="text-xs text-muted-foreground">
                  {bucket.cartonCount} cartons
                </span>
                <span className={cn("text-xs font-medium", getBucketTextColor(bucket))}>
                  {formatCurrency(bucket.value)}
                </span>
              </div>
            </button>
          ))}
        </div>

        {totalValue > 0 && (
          <div className="mt-4 pt-4 border-t flex items-center justify-between text-sm">
            <div>
              <span className="text-muted-foreground">Total Value at Risk (&gt;15d): </span>
              <span className="font-semibold text-red-600 dark:text-red-400">
                {formatCurrency(riskValue)}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Total Inventory Value: </span>
              <span className="font-semibold">{formatCurrency(totalValue)}</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
});

AgeingRiskPanel.displayName = "AgeingRiskPanel";
