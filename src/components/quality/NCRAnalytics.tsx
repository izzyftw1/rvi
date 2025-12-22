import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, Legend
} from "recharts";
import { AlertTriangle, Clock, RefreshCw, Target } from "lucide-react";
import { cn } from "@/lib/utils";

interface NCRMetrics {
  ncrPer1000Pcs: number;
  ncrPerWO: number;
  repeatNCRRate: number;
  openNCRs: number;
  closedNCRs: number;
  avgAgingDays: number;
  ncrByAge: Array<{ range: string; count: number }>;
  repeatNCRs: Array<{ rootCause: string; count: number }>;
  ncrBySource: Array<{ source: string; count: number }>;
}

const COLORS = ["#22c55e", "#f59e0b", "#ef4444", "#3b82f6", "#8b5cf6"];

interface NCRAnalyticsProps {
  data: NCRMetrics;
}

export function NCRAnalytics({ data }: NCRAnalyticsProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* NCR Rates Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            NCR Rate Metrics
          </CardTitle>
          <CardDescription>NCR frequency and repeat analysis</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">NCRs per 1,000 pcs</p>
              <p className={cn(
                "text-3xl font-bold",
                data.ncrPer1000Pcs <= 1 ? "text-green-600" : data.ncrPer1000Pcs <= 5 ? "text-amber-600" : "text-destructive"
              )}>
                {data.ncrPer1000Pcs.toFixed(2)}
              </p>
            </div>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">NCRs per Work Order</p>
              <p className={cn(
                "text-3xl font-bold",
                data.ncrPerWO <= 0.1 ? "text-green-600" : data.ncrPerWO <= 0.3 ? "text-amber-600" : "text-destructive"
              )}>
                {data.ncrPerWO.toFixed(2)}
              </p>
            </div>
          </div>
          
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground flex items-center gap-1">
                <RefreshCw className="h-4 w-4" /> Repeat NCR Rate
              </span>
              <span className={cn(
                "font-medium",
                data.repeatNCRRate <= 5 ? "text-green-600" : data.repeatNCRRate <= 15 ? "text-amber-600" : "text-destructive"
              )}>
                {data.repeatNCRRate.toFixed(1)}%
              </span>
            </div>
            <Progress 
              value={Math.min(data.repeatNCRRate, 100)} 
              className={cn(
                "h-2",
                data.repeatNCRRate <= 5 ? "[&>div]:bg-green-600" : data.repeatNCRRate <= 15 ? "[&>div]:bg-amber-600" : "[&>div]:bg-destructive"
              )}
            />
            <p className="text-xs text-muted-foreground">
              NCRs with the same root cause recurring within 90 days
            </p>
          </div>

          {data.repeatNCRs.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Top Repeat Root Causes</p>
              <div className="space-y-1">
                {data.repeatNCRs.slice(0, 3).map((item, i) => (
                  <div key={i} className="flex justify-between items-center text-sm">
                    <span className="truncate text-muted-foreground">{item.rootCause || "Unspecified"}</span>
                    <Badge variant="secondary">{item.count}x</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* NCR Aging */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-blue-500" />
            NCR Aging Analysis
          </CardTitle>
          <CardDescription>Open vs Closed and age distribution</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-6">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Open NCRs</p>
              <p className={cn(
                "text-3xl font-bold",
                data.openNCRs === 0 ? "text-green-600" : data.openNCRs <= 5 ? "text-amber-600" : "text-destructive"
              )}>
                {data.openNCRs}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Closed NCRs</p>
              <p className="text-3xl font-bold text-green-600">{data.closedNCRs}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Avg Resolution</p>
              <p className={cn(
                "text-3xl font-bold",
                data.avgAgingDays <= 3 ? "text-green-600" : data.avgAgingDays <= 7 ? "text-amber-600" : "text-destructive"
              )}>
                {data.avgAgingDays.toFixed(1)}d
              </p>
            </div>
          </div>

          {data.ncrByAge.length > 0 && (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={data.ncrByAge}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="range" className="text-xs" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* NCR by Source */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>NCR Distribution by Source</CardTitle>
          <CardDescription>Where NCRs are being raised from</CardDescription>
        </CardHeader>
        <CardContent>
          {data.ncrBySource.length === 0 ? (
            <div className="h-[200px] flex items-center justify-center text-muted-foreground">
              No NCR data available
            </div>
          ) : (
            <div className="flex items-center gap-8">
              <ResponsiveContainer width="40%" height={200}>
                <PieChart>
                  <Pie
                    data={data.ncrBySource}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="count"
                    label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`}
                  >
                    {data.ncrBySource.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-2">
                {data.ncrBySource.map((item, index) => (
                  <div key={item.source} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-3 h-3 rounded-sm" 
                        style={{ backgroundColor: COLORS[index % COLORS.length] }}
                      />
                      <span className="text-sm">{item.source}</span>
                    </div>
                    <Badge variant="outline">{item.count}</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
