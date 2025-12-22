import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from "recharts";
import { ClipboardCheck, Clock, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface IPQCMetrics {
  checksCompleted: number;
  checksRequired: number;
  complianceRate: number;
  avgTimeBetweenChecks: number;
  missedChecks: number;
  checksByMachine: Array<{ machine: string; completed: number; required: number; rate: number }>;
}

interface IPQCComplianceCardProps {
  data: IPQCMetrics;
}

export function IPQCComplianceCard({ data }: IPQCComplianceCardProps) {
  const getComplianceColor = (rate: number) => {
    if (rate >= 95) return "text-green-600";
    if (rate >= 80) return "text-amber-600";
    return "text-destructive";
  };

  const getComplianceBg = (rate: number) => {
    if (rate >= 95) return "[&>div]:bg-green-600";
    if (rate >= 80) return "[&>div]:bg-amber-600";
    return "[&>div]:bg-destructive";
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ClipboardCheck className="h-5 w-5 text-primary" />
          IPQC Compliance
        </CardTitle>
        <CardDescription>Hourly QC check completion rate</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Main metrics */}
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Compliance Rate</p>
            <p className={cn("text-3xl font-bold", getComplianceColor(data.complianceRate))}>
              {data.complianceRate.toFixed(1)}%
            </p>
            <Progress 
              value={data.complianceRate} 
              className={cn("h-2", getComplianceBg(data.complianceRate))}
            />
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Checks Completed</p>
            <p className="text-2xl font-bold">{data.checksCompleted}</p>
            <p className="text-xs text-muted-foreground">of {data.checksRequired} required</p>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Missed Checks</p>
            <p className={cn(
              "text-2xl font-bold",
              data.missedChecks === 0 ? "text-green-600" : data.missedChecks <= 5 ? "text-amber-600" : "text-destructive"
            )}>
              {data.missedChecks}
            </p>
            {data.missedChecks > 0 && (
              <Badge variant="outline" className="text-amber-600 border-amber-300">
                <AlertTriangle className="h-3 w-3 mr-1" />
                Needs attention
              </Badge>
            )}
          </div>
        </div>

        {/* Average time between checks */}
        <div className="flex items-center gap-2 text-sm p-3 bg-muted/50 rounded-lg">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <span className="text-muted-foreground">Avg time between checks:</span>
          <span className={cn(
            "font-medium",
            data.avgTimeBetweenChecks <= 60 ? "text-green-600" : data.avgTimeBetweenChecks <= 90 ? "text-amber-600" : "text-destructive"
          )}>
            {data.avgTimeBetweenChecks.toFixed(0)} min
          </span>
          <span className="text-xs text-muted-foreground">(target: 60 min)</span>
        </div>

        {/* Compliance by Machine */}
        {data.checksByMachine.length > 0 && (
          <div>
            <p className="text-sm font-medium mb-2">Compliance by Machine</p>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={data.checksByMachine.slice(0, 8)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis type="number" domain={[0, 100]} />
                <YAxis dataKey="machine" type="category" width={80} className="text-xs" />
                <Tooltip formatter={(value: number) => [`${value.toFixed(1)}%`, "Compliance"]} />
                <Bar dataKey="rate" radius={[0, 4, 4, 0]}>
                  {data.checksByMachine.slice(0, 8).map((entry, index) => (
                    <Bar
                      key={index}
                      dataKey="rate"
                      fill={entry.rate >= 95 ? "#22c55e" : entry.rate >= 80 ? "#f59e0b" : "#ef4444"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
