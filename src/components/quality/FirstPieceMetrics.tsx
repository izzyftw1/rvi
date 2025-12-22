import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from "recharts";
import { Target, Clock, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface FirstPieceData {
  totalSetups: number;
  firstPieceRight: number;
  fprRate: number;
  avgApprovalTime: number;
  byMachine: Array<{ machine: string; total: number; passed: number; rate: number }>;
  byProgrammer: Array<{ programmer: string; total: number; passed: number; rate: number }>;
}

interface FirstPieceMetricsProps {
  data: FirstPieceData;
}

export function FirstPieceMetrics({ data }: FirstPieceMetricsProps) {
  const getFPRColor = (rate: number) => {
    if (rate >= 90) return "text-green-600";
    if (rate >= 75) return "text-amber-600";
    return "text-destructive";
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="h-5 w-5 text-primary" />
          First Piece Right (FPR) Analysis
        </CardTitle>
        <CardDescription>First piece approval rate and timing</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Main metrics */}
        <div className="grid grid-cols-4 gap-4">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Total Setups</p>
            <p className="text-2xl font-bold">{data.totalSetups}</p>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> FP Right
            </p>
            <p className="text-2xl font-bold text-green-600">{data.firstPieceRight}</p>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">FPR Rate</p>
            <div className="space-y-1">
              <p className={cn("text-2xl font-bold", getFPRColor(data.fprRate))}>
                {data.fprRate.toFixed(1)}%
              </p>
              <Progress 
                value={data.fprRate} 
                className={cn(
                  "h-1.5",
                  data.fprRate >= 90 ? "[&>div]:bg-green-600" : data.fprRate >= 75 ? "[&>div]:bg-amber-600" : "[&>div]:bg-destructive"
                )}
              />
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" /> Avg Approval Time
            </p>
            <p className={cn(
              "text-2xl font-bold",
              data.avgApprovalTime <= 30 ? "text-green-600" : data.avgApprovalTime <= 60 ? "text-amber-600" : "text-destructive"
            )}>
              {data.avgApprovalTime.toFixed(0)}<span className="text-sm font-normal"> min</span>
            </p>
          </div>
        </div>

        {/* By Machine / Programmer */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm font-medium mb-2">FPR by Machine</p>
            {data.byMachine.length > 0 ? (
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={data.byMachine.slice(0, 6)} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" domain={[0, 100]} />
                  <YAxis dataKey="machine" type="category" width={60} className="text-xs" />
                  <Tooltip formatter={(v: number) => [`${v.toFixed(1)}%`, "FPR Rate"]} />
                  <Bar dataKey="rate" radius={[0, 4, 4, 0]}>
                    {data.byMachine.slice(0, 6).map((entry, index) => (
                      <rect
                        key={index}
                        fill={entry.rate >= 90 ? "#22c55e" : entry.rate >= 75 ? "#f59e0b" : "#ef4444"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[160px] flex items-center justify-center text-muted-foreground text-sm">
                No data
              </div>
            )}
          </div>
          <div>
            <p className="text-sm font-medium mb-2">FPR by Programmer</p>
            {data.byProgrammer.length > 0 ? (
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={data.byProgrammer.slice(0, 6)} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" domain={[0, 100]} />
                  <YAxis dataKey="programmer" type="category" width={80} className="text-xs" />
                  <Tooltip formatter={(v: number) => [`${v.toFixed(1)}%`, "FPR Rate"]} />
                  <Bar dataKey="rate" radius={[0, 4, 4, 0]}>
                    {data.byProgrammer.slice(0, 6).map((entry, index) => (
                      <rect
                        key={index}
                        fill={entry.rate >= 90 ? "#22c55e" : entry.rate >= 75 ? "#f59e0b" : "#ef4444"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[160px] flex items-center justify-center text-muted-foreground text-sm">
                No data
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
