import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from "recharts";
import { Truck, AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface SupplierMetrics {
  totalLots: number;
  passedLots: number;
  failedLots: number;
  defectRate: number;
  bySupplier: Array<{ supplier: string; total: number; passed: number; failed: number; rate: number }>;
}

interface SupplierDefectCardProps {
  data: SupplierMetrics;
}

export function SupplierDefectCard({ data }: SupplierDefectCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Truck className="h-5 w-5 text-blue-500" />
          Supplier Defect Rate (IQC)
        </CardTitle>
        <CardDescription>Incoming material quality by supplier</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary */}
        <div className="grid grid-cols-4 gap-4">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Total Lots</p>
            <p className="text-xl font-bold">{data.totalLots}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3 text-green-500" /> Passed
            </p>
            <p className="text-xl font-bold text-green-600">{data.passedLots}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <AlertTriangle className="h-3 w-3 text-destructive" /> Failed
            </p>
            <p className="text-xl font-bold text-destructive">{data.failedLots}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Defect Rate</p>
            <p className={cn(
              "text-xl font-bold",
              data.defectRate <= 2 ? "text-green-600" : data.defectRate <= 5 ? "text-amber-600" : "text-destructive"
            )}>
              {data.defectRate.toFixed(1)}%
            </p>
          </div>
        </div>

        {/* By Supplier Chart */}
        {data.bySupplier.length > 0 ? (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.bySupplier.slice(0, 8)} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis type="number" />
              <YAxis 
                dataKey="supplier" 
                type="category" 
                width={100} 
                className="text-xs"
                tick={{ fontSize: 10 }}
              />
              <Tooltip 
                formatter={(value: number, name: string) => [
                  name === "rate" ? `${value.toFixed(1)}%` : value,
                  name === "rate" ? "Defect Rate" : name === "passed" ? "Passed" : "Failed"
                ]}
              />
              <Bar dataKey="passed" stackId="a" fill="#22c55e" name="Passed" />
              <Bar dataKey="failed" stackId="a" fill="#ef4444" name="Failed" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[200px] flex items-center justify-center text-muted-foreground">
            No supplier data available
          </div>
        )}

        {/* Worst performers highlight */}
        {data.bySupplier.filter(s => s.rate > 5).length > 0 && (
          <div className="pt-2 border-t">
            <p className="text-xs font-medium text-muted-foreground mb-2">Suppliers Needing Attention (&gt;5% defect rate)</p>
            <div className="flex flex-wrap gap-2">
              {data.bySupplier.filter(s => s.rate > 5).slice(0, 3).map((s, i) => (
                <Badge key={i} variant="outline" className="text-destructive border-destructive/30">
                  {s.supplier}: {s.rate.toFixed(1)}%
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
