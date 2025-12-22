import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend
} from "recharts";

interface RejectionDataByDimension {
  byMachine: Array<{ name: string; rejections: number; rate: number }>;
  byOperator: Array<{ name: string; rejections: number; rate: number }>;
  byProgrammer: Array<{ name: string; rejections: number; rate: number }>;
  byWorkOrder: Array<{ name: string; rejections: number; rate: number }>;
}

interface RejectionAnalyticsProps {
  data: RejectionDataByDimension;
}

export function RejectionAnalytics({ data }: RejectionAnalyticsProps) {
  const renderChart = (chartData: Array<{ name: string; rejections: number; rate: number }>, title: string) => {
    if (!chartData || chartData.length === 0) {
      return (
        <div className="h-[280px] flex items-center justify-center text-muted-foreground">
          No data available
        </div>
      );
    }

    return (
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={chartData.slice(0, 10)} layout="vertical">
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis type="number" />
          <YAxis 
            dataKey="name" 
            type="category" 
            width={120} 
            className="text-xs"
            tick={{ fontSize: 11 }}
          />
          <Tooltip 
            formatter={(value: number, name: string) => [
              name === "rate" ? `${value.toFixed(2)}%` : value,
              name === "rate" ? "Rejection Rate" : "Rejections"
            ]}
          />
          <Legend />
          <Bar dataKey="rejections" fill="hsl(var(--destructive))" name="Rejections" radius={[0, 4, 4, 0]} />
          <Bar dataKey="rate" fill="hsl(var(--chart-2))" name="Rate %" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Rejection Rate Analysis</CardTitle>
        <CardDescription>Overall rejection rate breakdown by different dimensions</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="machine" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="machine">By Machine</TabsTrigger>
            <TabsTrigger value="operator">By Operator</TabsTrigger>
            <TabsTrigger value="programmer">By Programmer</TabsTrigger>
            <TabsTrigger value="workorder">By Work Order</TabsTrigger>
          </TabsList>
          <TabsContent value="machine" className="mt-4">
            {renderChart(data.byMachine, "Machine")}
          </TabsContent>
          <TabsContent value="operator" className="mt-4">
            {renderChart(data.byOperator, "Operator")}
          </TabsContent>
          <TabsContent value="programmer" className="mt-4">
            {renderChart(data.byProgrammer, "Programmer")}
          </TabsContent>
          <TabsContent value="workorder" className="mt-4">
            {renderChart(data.byWorkOrder, "Work Order")}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
