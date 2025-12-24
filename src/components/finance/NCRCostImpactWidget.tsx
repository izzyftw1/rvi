import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from "recharts";
import { format, startOfMonth, endOfMonth, parseISO } from "date-fns";
import { AlertTriangle, TrendingDown, ArrowRight, FileWarning } from "lucide-react";
import { Link } from "react-router-dom";

const COLORS = {
  SCRAP: "#ef4444",
  REWORK: "#f59e0b",
  CUSTOMER_REJECTION: "#8b5cf6",
};

interface NCRCostData {
  id: string;
  ncr_number: string;
  financial_impact_type: string | null;
  cost_impact: number;
  quantity_affected: number;
  created_at: string;
  customer: string | null;
  linked_invoice_id: string | null;
}

interface NCRCostImpactWidgetProps {
  dateFrom: string;
  dateTo: string;
  onDrillDown?: (ncrId: string) => void;
}

export function NCRCostImpactWidget({ dateFrom, dateTo, onDrillDown }: NCRCostImpactWidgetProps) {
  const { data: ncrData = [], isLoading } = useQuery({
    queryKey: ["ncr-finance-impact", dateFrom, dateTo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ncrs")
        .select(`
          id,
          ncr_number,
          financial_impact_type,
          cost_impact,
          quantity_affected,
          created_at,
          linked_invoice_id,
          work_orders (customer)
        `)
        .gte("created_at", dateFrom)
        .lte("created_at", dateTo)
        .not("financial_impact_type", "is", null)
        .order("cost_impact", { ascending: false });

      if (error) throw error;

      return (data || []).map((ncr: any) => ({
        id: ncr.id,
        ncr_number: ncr.ncr_number,
        financial_impact_type: ncr.financial_impact_type,
        cost_impact: Number(ncr.cost_impact) || 0,
        quantity_affected: ncr.quantity_affected,
        created_at: ncr.created_at,
        customer: ncr.work_orders?.customer || "Unknown",
        linked_invoice_id: ncr.linked_invoice_id,
      })) as NCRCostData[];
    },
  });

  const metrics = useMemo(() => {
    const scrapCost = ncrData
      .filter(n => n.financial_impact_type === "SCRAP")
      .reduce((sum, n) => sum + n.cost_impact, 0);
    
    const reworkCost = ncrData
      .filter(n => n.financial_impact_type === "REWORK")
      .reduce((sum, n) => sum + n.cost_impact, 0);
    
    const customerRejectionCost = ncrData
      .filter(n => n.financial_impact_type === "CUSTOMER_REJECTION")
      .reduce((sum, n) => sum + n.cost_impact, 0);

    return {
      scrapCost,
      reworkCost,
      customerRejectionCost,
      totalCost: scrapCost + reworkCost + customerRejectionCost,
      ncrCount: ncrData.length,
    };
  }, [ncrData]);

  const chartData = useMemo(() => {
    return [
      { name: "Scrap", value: metrics.scrapCost, fill: COLORS.SCRAP },
      { name: "Rework", value: metrics.reworkCost, fill: COLORS.REWORK },
      { name: "Customer Rej.", value: metrics.customerRejectionCost, fill: COLORS.CUSTOMER_REJECTION },
    ].filter(d => d.value > 0);
  }, [metrics]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileWarning className="h-5 w-5 text-destructive" />
            NCR Cost Impact
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[200px] flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileWarning className="h-5 w-5 text-destructive" />
              NCR Cost Impact
            </CardTitle>
            <CardDescription>Quality losses by category (separate from revenue)</CardDescription>
          </div>
          <Link to="/quality">
            <Button variant="ghost" size="sm">
              View All <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {metrics.ncrCount === 0 ? (
          <div className="h-[200px] flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
              <p>No NCRs with financial impact in this period</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Summary stats */}
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900">
                <p className="text-xs text-muted-foreground">Scrap Loss</p>
                <p className="text-lg font-bold text-red-600">{formatCurrency(metrics.scrapCost)}</p>
              </div>
              <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900">
                <p className="text-xs text-muted-foreground">Rework (WIP)</p>
                <p className="text-lg font-bold text-amber-600">{formatCurrency(metrics.reworkCost)}</p>
              </div>
              <div className="p-3 rounded-lg bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-900">
                <p className="text-xs text-muted-foreground">Customer Adj.</p>
                <p className="text-lg font-bold text-purple-600">{formatCurrency(metrics.customerRejectionCost)}</p>
              </div>
            </div>

            {/* Chart */}
            <ResponsiveContainer width="100%" height={150}>
              <BarChart data={chartData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis type="number" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="name" width={90} />
                <Tooltip formatter={(value: number) => formatCurrency(value)} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>

            {/* Top NCRs list */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Top NCRs by Cost</p>
              {ncrData.slice(0, 3).map((ncr) => (
                <Link
                  key={ncr.id}
                  to={`/ncr/${ncr.id}`}
                  className="flex items-center justify-between p-2 rounded-lg hover:bg-muted transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={
                        ncr.financial_impact_type === "SCRAP"
                          ? "border-red-500 text-red-600"
                          : ncr.financial_impact_type === "REWORK"
                          ? "border-amber-500 text-amber-600"
                          : "border-purple-500 text-purple-600"
                      }
                    >
                      {ncr.financial_impact_type?.replace("_", " ")}
                    </Badge>
                    <span className="text-sm">{ncr.ncr_number}</span>
                    <span className="text-xs text-muted-foreground">{ncr.customer}</span>
                  </div>
                  <span className="text-sm font-medium text-destructive">
                    {formatCurrency(ncr.cost_impact)}
                  </span>
                </Link>
              ))}
            </div>

            {/* Total footer */}
            <div className="pt-3 border-t flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-destructive" />
                <span className="text-sm font-medium">Total NCR Impact</span>
              </div>
              <span className="text-lg font-bold text-destructive">
                {formatCurrency(metrics.totalCost)}
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}