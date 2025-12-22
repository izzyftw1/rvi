import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  AreaChart, Area, ComposedChart, Bar
} from "recharts";

interface TrendData {
  date: string;
  passRate?: number;
  rejectionRate?: number;
  fpy?: number;
  ncrCount?: number;
  scrap?: number;
  rework?: number;
}

interface QualityTrendChartsProps {
  dailyTrend: TrendData[];
  weeklyTrend: TrendData[];
  monthlyTrend: TrendData[];
}

export function QualityTrendCharts({ dailyTrend, weeklyTrend, monthlyTrend }: QualityTrendChartsProps) {
  const renderTrendChart = (data: TrendData[], showDetails: boolean = false) => {
    if (!data || data.length === 0) {
      return (
        <div className="h-[300px] flex items-center justify-center text-muted-foreground">
          No trend data available
        </div>
      );
    }

    return (
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={data}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="date" className="text-xs" />
          <YAxis yAxisId="left" domain={[0, 100]} />
          <YAxis yAxisId="right" orientation="right" />
          <Tooltip 
            formatter={(value: number, name: string) => {
              if (name.includes("Rate") || name === "FPY") {
                return [`${value.toFixed(1)}%`, name];
              }
              return [value, name];
            }}
          />
          <Legend />
          <Line 
            yAxisId="left" 
            type="monotone" 
            dataKey="passRate" 
            stroke="#22c55e" 
            strokeWidth={2} 
            name="Pass Rate %" 
            dot={false}
          />
          <Line 
            yAxisId="left" 
            type="monotone" 
            dataKey="fpy" 
            stroke="#3b82f6" 
            strokeWidth={2} 
            name="FPY %" 
            dot={false}
          />
          <Line 
            yAxisId="left" 
            type="monotone" 
            dataKey="rejectionRate" 
            stroke="#ef4444" 
            strokeWidth={2} 
            name="Rejection Rate %" 
            dot={false}
          />
          {showDetails && (
            <>
              <Bar yAxisId="right" dataKey="scrap" fill="hsl(var(--destructive) / 0.5)" name="Scrap" />
              <Bar yAxisId="right" dataKey="rework" fill="hsl(var(--chart-4) / 0.5)" name="Rework" />
            </>
          )}
        </ComposedChart>
      </ResponsiveContainer>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Quality Trends</CardTitle>
        <CardDescription>Track quality metrics over time</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="daily" className="w-full">
          <TabsList>
            <TabsTrigger value="daily">Daily</TabsTrigger>
            <TabsTrigger value="weekly">Weekly</TabsTrigger>
            <TabsTrigger value="monthly">Monthly</TabsTrigger>
          </TabsList>
          <TabsContent value="daily" className="mt-4">
            {renderTrendChart(dailyTrend)}
          </TabsContent>
          <TabsContent value="weekly" className="mt-4">
            {renderTrendChart(weeklyTrend, true)}
          </TabsContent>
          <TabsContent value="monthly" className="mt-4">
            {renderTrendChart(monthlyTrend, true)}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
