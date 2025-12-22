import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend
} from "recharts";
import { Trash2, RotateCcw, AlertCircle, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface QualityLossData {
  totalProduced: number;
  totalScrap: number;
  totalRework: number;
  ncrLinkedScrap: number;
  scrapByReason: Array<{ reason: string; quantity: number }>;
  reworkRatio: number;
  scrapPercentage: number;
  ncrScrapPercentage: number;
}

const COLORS = ["#ef4444", "#f97316", "#f59e0b", "#eab308", "#84cc16", "#22c55e", "#14b8a6"];

interface QualityLossIndicatorsProps {
  data: QualityLossData;
}

export function QualityLossIndicators({ data }: QualityLossIndicatorsProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Scrap Summary */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Trash2 className="h-5 w-5 text-destructive" />
            Scrap Analysis
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total Scrap</span>
              <span className="font-bold text-destructive">{data.totalScrap.toLocaleString()} pcs</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Scrap Rate</span>
              <span className={cn(
                "font-bold",
                data.scrapPercentage <= 2 ? "text-green-600" : data.scrapPercentage <= 5 ? "text-amber-600" : "text-destructive"
              )}>
                {data.scrapPercentage.toFixed(2)}%
              </span>
            </div>
            <Progress 
              value={Math.min(data.scrapPercentage * 10, 100)} 
              className={cn(
                "h-2",
                data.scrapPercentage <= 2 ? "[&>div]:bg-green-600" : data.scrapPercentage <= 5 ? "[&>div]:bg-amber-600" : "[&>div]:bg-destructive"
              )}
            />
          </div>
          
          <div className="pt-2 border-t">
            <div className="flex items-center gap-2 text-sm">
              <AlertCircle className="h-4 w-4 text-amber-500" />
              <span className="text-muted-foreground">NCR-Linked Scrap</span>
            </div>
            <div className="flex justify-between items-center mt-1">
              <span className="text-2xl font-bold">{data.ncrLinkedScrap.toLocaleString()}</span>
              <span className={cn(
                "text-sm font-medium",
                data.ncrScrapPercentage <= 10 ? "text-green-600" : data.ncrScrapPercentage <= 30 ? "text-amber-600" : "text-destructive"
              )}>
                {data.ncrScrapPercentage.toFixed(1)}% of scrap
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Rework Summary */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <RotateCcw className="h-5 w-5 text-amber-500" />
            Rework Analysis
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total Rework</span>
              <span className="font-bold text-amber-600">{data.totalRework.toLocaleString()} pcs</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Rework Ratio</span>
              <span className={cn(
                "font-bold",
                data.reworkRatio <= 3 ? "text-green-600" : data.reworkRatio <= 8 ? "text-amber-600" : "text-destructive"
              )}>
                {data.reworkRatio.toFixed(2)}%
              </span>
            </div>
            <Progress 
              value={Math.min(data.reworkRatio * 5, 100)} 
              className={cn(
                "h-2",
                data.reworkRatio <= 3 ? "[&>div]:bg-green-600" : data.reworkRatio <= 8 ? "[&>div]:bg-amber-600" : "[&>div]:bg-destructive"
              )}
            />
          </div>

          <div className="pt-2 border-t">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
              <TrendingDown className="h-4 w-4" />
              Quality Loss Summary
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="bg-muted/50 rounded p-2 text-center">
                <p className="text-xs text-muted-foreground">Total Produced</p>
                <p className="font-bold">{data.totalProduced.toLocaleString()}</p>
              </div>
              <div className="bg-destructive/10 rounded p-2 text-center">
                <p className="text-xs text-muted-foreground">Total Loss</p>
                <p className="font-bold text-destructive">
                  {(data.totalScrap + data.totalRework).toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Scrap Pareto by Reason */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Scrap by Reason</CardTitle>
          <CardDescription>Top rejection reasons</CardDescription>
        </CardHeader>
        <CardContent>
          {data.scrapByReason.length === 0 ? (
            <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">
              No scrap data
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={data.scrapByReason}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={70}
                  fill="#8884d8"
                  dataKey="quantity"
                  label={({ percent }) => `${(percent * 100).toFixed(0)}%`}
                >
                  {data.scrapByReason.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => [`${value} pcs`, "Quantity"]} />
                <Legend 
                  layout="vertical" 
                  align="right" 
                  verticalAlign="middle"
                  formatter={(value) => <span className="text-xs">{value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
